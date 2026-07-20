import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { rmuxExec } from './utils/rmux.js';

export interface RegisteredAgent {
  name: string;
  tool: string;
  target: string;
  sessionName: string;
  paneIndex: number;
  cwd: string;
  settings?: string;
  model?: string;
  launchTimestamp: number;
  panePid?: number;
  sessionFilePath?: string;
  layout: 'split' | 'separate';
  channelName: string;
}

export interface RegistryData {
  version: 1;
  channels: Record<string, {
    layout: 'split' | 'separate';
    sessionNames: string[];
    agents: string[];
  }>;
  agents: Record<string, RegisteredAgent>;
  updatedAt: string;
}

const DEFAULT_REGISTRY: RegistryData = {
  version: 1,
  channels: {},
  agents: {},
  updatedAt: new Date().toISOString(),
};

export class AgentRegistry {
  private data: RegistryData;
  private filePath: string;

  constructor(registryDir: string) {
    mkdirSync(registryDir, { recursive: true });
    this.filePath = join(registryDir, 'agents.json');
    this.data = this.load();
  }

  private load(): RegistryData {
    if (!existsSync(this.filePath)) return { ...DEFAULT_REGISTRY };
    try {
      return JSON.parse(readFileSync(this.filePath, 'utf-8'));
    } catch {
      return { ...DEFAULT_REGISTRY };
    }
  }

  private save(): void {
    this.data.updatedAt = new Date().toISOString();
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
  }

  registerChannel(name: string, layout: 'split' | 'separate', sessionNames: string[]): void {
    this.data.channels[name] = { layout, sessionNames, agents: [] };
    this.save();
  }

  registerAgent(agent: RegisteredAgent): void {
    this.data.agents[agent.name] = agent;
    const ch = this.data.channels[agent.channelName];
    if (ch && !ch.agents.includes(agent.name)) {
      ch.agents.push(agent.name);
    }
    this.save();
  }

  updateAgent(name: string, updates: Partial<RegisteredAgent>): void {
    const agent = this.data.agents[name];
    if (!agent) return;
    Object.assign(agent, updates);
    this.save();
  }

  getAgent(name: string): RegisteredAgent | null {
    return this.data.agents[name] ?? null;
  }

  getAllAgents(): RegisteredAgent[] {
    return Object.values(this.data.agents);
  }

  getChannel(name: string): RegistryData['channels'][string] | null {
    return this.data.channels[name] ?? null;
  }

  removeAgent(name: string): void {
    const agent = this.data.agents[name];
    if (!agent) return;
    const ch = this.data.channels[agent.channelName];
    if (ch) {
      ch.agents = ch.agents.filter(a => a !== name);
      if (ch.agents.length === 0) {
        delete this.data.channels[agent.channelName];
      }
    }
    delete this.data.agents[name];
    this.save();
  }

  removeChannel(channelName: string): void {
    const ch = this.data.channels[channelName];
    if (!ch) return;
    for (const agentName of ch.agents) {
      delete this.data.agents[agentName];
    }
    delete this.data.channels[channelName];
    this.save();
  }

  clear(): void {
    this.data = { ...DEFAULT_REGISTRY };
    this.save();
  }

  isAgentAlive(name: string): boolean {
    const agent = this.data.agents[name];
    if (!agent) return false;
    const raw = rmuxExec(`display -p -t ${agent.target} "#{pane_pid}"`, { timeout: 5000 });
    const pid = parseInt(raw, 10);
    return !isNaN(pid) && pid > 0;
  }
}
