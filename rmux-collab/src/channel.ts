import { Rmux, PaneSet } from '@rmux/sdk';
import type { AgentResult, AskOptions, ChannelConfig, ChannelLayout } from './types.js';
import { Agent, getLaunchCommand, getDefaultMarker, isCliAgent } from './agent.js';
import { broadcastCollect } from './patterns/broadcast-collect.js';
import { openTerminalWindow } from './utils/terminal.js';
import { rmuxExec, cleanEnv, sleep, validateSessionName } from './utils/rmux.js';

function rmuxCmd(args: string): string {
  return rmuxExec(args, { env: cleanEnv() });
}

export class Channel {
  readonly name: string;
  readonly layout: ChannelLayout;
  readonly agents: Map<string, Agent> = new Map();

  private sessionNames: string[] = [];

  private constructor(name: string, layout: ChannelLayout) {
    this.name = name;
    this.layout = layout;
  }

  static async create(rmux: Rmux, config: ChannelConfig): Promise<Channel> {
    const layout = config.layout ?? 'separate';
    const channel = new Channel(config.name, layout);
    const visible = config.visible ?? true;

    if (layout === 'split') {
      await channel.createSplit(rmux, config, visible);
    } else {
      await channel.createSeparate(rmux, config, visible);
    }

    return channel;
  }

  private async createSplit(rmux: Rmux, config: ChannelConfig, visible: boolean): Promise<void> {
    const sessionName = validateSessionName(config.name);
    this.sessionNames.push(sessionName);

    rmuxCmd(`kill-session -t ${sessionName}`);
    const shell = process.platform === 'win32' ? 'pwsh' : '';
    rmuxCmd(`new-session -d -s ${sessionName} -n agents ${shell}`);

    if (visible) {
      openTerminalWindow(sessionName, `[${config.name}]`);
    }

    for (let i = 0; i < config.agents.length; i++) {
      const agentConfig = config.agents[i];
      const launchTimestamp = Date.now();

      let target: string;
      if (i === 0) {
        target = `${sessionName}:0.0`;
      } else {
        const splitDir = i % 2 === 1 ? '-h' : '-v';
        rmuxCmd(`split-window ${splitDir} -t ${sessionName}:0 ${shell}`);
        target = `${sessionName}:0.${i}`;
      }

      await this.launchAgent(rmux, agentConfig, config, target, sessionName, i, launchTimestamp);
    }

    if (config.agents.length > 1) {
      rmuxCmd(`select-layout -t ${sessionName}:0 tiled`);
    }
  }

  private async createSeparate(rmux: Rmux, config: ChannelConfig, visible: boolean): Promise<void> {
    for (const agentConfig of config.agents) {
      const launchTimestamp = Date.now();
      const sessionName = validateSessionName(`${config.name}-${agentConfig.name}`);
      this.sessionNames.push(sessionName);

      rmuxCmd(`kill-session -t ${sessionName}`);
      const shell = process.platform === 'win32' ? 'pwsh' : '';
      rmuxCmd(`new-session -d -s ${sessionName} -n ${agentConfig.name} ${shell}`);

      const target = `${sessionName}:0.0`;

      if (visible) {
        openTerminalWindow(sessionName, `[${config.name}] ${agentConfig.name}`);
      }

      await this.launchAgent(rmux, agentConfig, config, target, sessionName, 0, launchTimestamp);
    }
  }

  private async launchAgent(
    rmux: Rmux,
    agentConfig: ChannelConfig['agents'][0],
    config: ChannelConfig,
    target: string,
    sessionName: string,
    paneIndex: number,
    launchTimestamp: number,
  ): Promise<void> {
    const command = getLaunchCommand(agentConfig);
    const cwd = agentConfig.cwd ?? config.cwd;

    if (isCliAgent(agentConfig.tool)) {
      await sleep(4000);
    } else {
      await sleep(1000);
    }

    const escaped = command.replace(/"/g, '\\"');
    const home = process.env.USERPROFILE ?? process.env.HOME ?? '.';
    const targetDir = cwd ?? (isCliAgent(agentConfig.tool) ? home : undefined);

    if (process.platform === 'win32') {
      if (targetDir) {
        rmuxCmd(`send-keys -t ${target} -l "Set-Location '${targetDir}'; ${escaped}"`);
      } else {
        rmuxCmd(`send-keys -t ${target} -l "${escaped}"`);
      }
    } else {
      const prefix = targetDir ? `cd '${targetDir}' && ` : '';
      rmuxCmd(`send-keys -t ${target} -l "${prefix}${escaped}"`);
    }
    await sleep(200);
    rmuxCmd(`send-keys -t ${target} C-m`);

    const session = rmux.session(sessionName);
    const pane = session.pane(0, paneIndex);
    const agent = new Agent(pane, agentConfig, target, launchTimestamp);
    this.agents.set(agentConfig.name, agent);

    const marker = agentConfig.completionMarker ?? getDefaultMarker(agentConfig.tool);
    const waitTimeout = isCliAgent(agentConfig.tool) ? 60_000 : 10_000;

    try {
      const deadline = Date.now() + waitTimeout;
      while (Date.now() < deadline) {
        await sleep(1000);
        const cap = rmuxCmd(`capture-pane -p -t ${target}`);
        const tail = cap.split('\n').slice(-8).join('\n');

        if (/Enter to confirm|Do you trust/.test(tail)) {
          const tailLines = tail.split('\n').filter(l => l.trim());
          const lastTail = tailLines[tailLines.length - 1]?.trim() ?? '';
          if (/^(\(base\)\s*)?PS\s/.test(lastTail)) continue;
          for (let j = 0; j < 3; j++) {
            rmuxCmd(`send-keys -t ${target} Up`);
            await sleep(150);
          }
          await sleep(300);
          rmuxCmd(`send-keys -t ${target} Enter`);
          await sleep(5000);
          continue;
        }

        const lines = tail.split('\n');
        const matched = typeof marker === 'string'
          ? tail.includes(marker)
          : lines.some(line => marker.test(line.trim()));
        if (matched) break;
      }
    } catch (err) {
      console.error(`[rmux-collab] Agent "${agentConfig.name}" startup wait failed:`, err instanceof Error ? err.message : err);
    }
  }

  getSessionNames(): readonly string[] {
    return this.sessionNames;
  }

  get(name: string): Agent {
    const agent = this.agents.get(name);
    if (!agent) {
      throw new Error(`Agent "${name}" not found in channel "${this.name}"`);
    }
    return agent;
  }

  paneSet(): PaneSet {
    const panes = [...this.agents.values()].map(a => a.pane);
    return new PaneSet(panes);
  }

  async broadcast(prompt: string, opts?: AskOptions): Promise<AgentResult[]> {
    return broadcastCollect([...this.agents.values()], prompt, opts);
  }

  async destroy(): Promise<void> {
    for (const agent of this.agents.values()) {
      agent.markDead();
    }
    for (const name of this.sessionNames) {
      rmuxCmd(`kill-session -t ${name}`);
    }
    this.sessionNames = [];
    this.agents.clear();
  }
}
