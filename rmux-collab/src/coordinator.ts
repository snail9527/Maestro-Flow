import { Rmux } from '@rmux/sdk';
import type {
  CoordinatorConfig,
  ChannelConfig,
  AgentResult,
  PipelineStage,
  DialogueConfig,
  DialogueMessage,
  AskOptions,
} from './types.js';
import { Channel } from './channel.js';
import { Agent } from './agent.js';
import { Logger } from './utils/logger.js';
import { AgentMonitor } from './monitor.js';
import type { MonitorHandler } from './monitor.js';
import { withRetry } from './middleware/retry.js';
import { pipeline as runPipeline, type PipelineOptions } from './patterns/pipeline.js';
import { dialogue as runDialogue } from './patterns/dialogue.js';

export class Coordinator {
  private rmux: Rmux;
  private channels: Map<string, Channel> = new Map();
  private monitor?: AgentMonitor;
  readonly logger: Logger = new Logger();

  private constructor(rmux: Rmux) {
    this.rmux = rmux;
  }

  static async create(config?: CoordinatorConfig): Promise<Coordinator> {
    const rmux = new Rmux();
    const coord = new Coordinator(rmux);

    if (config?.logFile) {
      coord.logger.setFilePath(config.logFile);
    }

    if (config?.monitor) {
      coord.monitor = new AgentMonitor(rmux);
    }

    if (config?.channels) {
      for (const chConfig of config.channels) {
        await coord.addChannel(chConfig);
      }
    }

    return coord;
  }

  async addChannel(config: ChannelConfig): Promise<Channel> {
    const channel = await Channel.create(this.rmux, config);
    this.channels.set(config.name, channel);

    if (this.monitor) {
      for (const [name, agent] of channel.agents) {
        const paneId = await agent.pane.id();
        this.monitor.registerAgent(name, paneId, {});
      }
    }

    return channel;
  }

  channel(name: string): Channel {
    const ch = this.channels.get(name);
    if (!ch) {
      throw new Error(`Channel "${name}" not found`);
    }
    return ch;
  }

  get channelNames(): string[] {
    return [...this.channels.keys()];
  }

  hasChannel(name: string): boolean {
    return this.channels.has(name);
  }

  async ask(
    channelName: string,
    agentName: string,
    prompt: string,
    opts?: AskOptions,
  ): Promise<AgentResult> {
    this.logger.record({ channel: channelName, agent: agentName, direction: 'send', content: prompt });
    const start = Date.now();

    const doAsk = () => this.channel(channelName).get(agentName).ask(prompt, opts);

    const result = opts?.retry
      ? await withRetry(doAsk, opts.retry)
      : await doAsk();

    this.logger.record({
      channel: channelName, agent: agentName, direction: 'receive',
      content: result.output, duration_ms: Date.now() - start,
      status: result.status, confidence: result.confidence,
    });
    return result;
  }

  async broadcast(
    channelName: string,
    prompt: string,
    opts?: AskOptions,
  ): Promise<AgentResult[]> {
    return this.channel(channelName).broadcast(prompt, opts);
  }

  async pipeline(
    stages: PipelineStage[],
    initialPrompt: string,
    opts?: PipelineOptions,
  ): Promise<string> {
    const pipelineOpts: PipelineOptions = {
      ...opts,
      onStageComplete: (stage, agentName, result) => {
        this.logger.record({
          channel: '_pipeline', agent: agentName, direction: 'receive',
          content: result.output, duration_ms: result.duration_ms,
          status: result.status, confidence: result.confidence,
        });
        opts?.onStageComplete?.(stage, agentName, result);
      },
    };
    this.logger.record({
      channel: '_pipeline', agent: stages[0]?.agent.name ?? 'unknown',
      direction: 'send', content: initialPrompt,
    });
    return runPipeline(stages, initialPrompt, pipelineOpts);
  }

  async dialogue(
    config: DialogueConfig,
    opts?: AskOptions,
  ): Promise<DialogueMessage[]> {
    this.logger.record({
      channel: '_dialogue', agent: config.agents.map(a => a.name).join(','),
      direction: 'send', content: config.topic,
    });
    const messages = await runDialogue(config, opts);
    for (const msg of messages) {
      this.logger.record({
        channel: '_dialogue', agent: msg.from, direction: 'receive',
        content: msg.content,
      });
    }
    return messages;
  }

  async onAgentEvent(agentName: string, handler: MonitorHandler): Promise<void> {
    if (!this.monitor) return;

    const agent = this.findAgent(agentName);
    if (agent) {
      const paneId = await agent.pane.id();
      this.monitor.registerAgent(agentName, paneId, handler);
    }
  }

  async startMonitor(): Promise<void> {
    if (this.monitor) {
      await this.monitor.start();
    }
  }

  private findAgent(name: string): Agent | undefined {
    for (const channel of this.channels.values()) {
      const agent = channel.agents.get(name);
      if (agent) return agent;
    }
    return undefined;
  }

  async destroy(): Promise<void> {
    this.monitor?.stop();
    for (const channel of this.channels.values()) {
      await channel.destroy();
    }
    this.channels.clear();
  }

  async shutdown(): Promise<void> {
    return this.destroy();
  }
}
