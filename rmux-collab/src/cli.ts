#!/usr/bin/env node
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Rmux } from '@rmux/sdk';
import { Channel } from './channel.js';
import { Agent, getDefaultMarker } from './agent.js';
import { AgentRegistry, type RegisteredAgent } from './registry.js';
import type { AgentConfig, ChannelConfig, AgentTool } from './types.js';
import { findSessionByPid, readLastAssistantMessage } from './session-reader.js';
import { rmuxExec as rmuxExecUtil, discoverSessionPath as discoverSessionPathUtil } from './utils/rmux.js';

const REGISTRY_DIR = join(process.cwd(), '.workflow', 'collab');

function getRegistry(): AgentRegistry {
  return new AgentRegistry(REGISTRY_DIR);
}

function rmuxExec(args: string): string {
  return rmuxExecUtil(args);
}

function reconnectAgent(reg: AgentRegistry, name: string): Agent | null {
  const entry = reg.getAgent(name);
  if (!entry) return null;
  if (!reg.isAgentAlive(name)) return null;

  const rmux = new Rmux();
  const session = rmux.session(entry.sessionName);
  const pane = session.pane(0, entry.paneIndex);
  const config: AgentConfig = {
    name: entry.name,
    tool: entry.tool as AgentTool,
    settings: entry.settings,
    model: entry.model,
    cwd: entry.cwd,
  };
  return new Agent(pane, config, entry.target, entry.launchTimestamp);
}

function usage(): never {
  console.log(`
rmux-collab — Multi-agent collaboration via rmux

Commands:
  launch <config>           Launch agents from config file
  send <agent> <message>    Send message (non-blocking)
  poll <agent>              Poll for latest response
  ask <agent> <message>     Send and wait for response (blocking)
  list                      List registered agents
  destroy [agent|--all]     Kill and unregister agents
  status <agent>            Show agent details

Options:
  --timeout <ms>            Timeout for ask command (default: 120000)
  --registry <dir>          Registry directory (default: .workflow/collab)
  --json                    JSON output
`);
  process.exit(0);
}

async function cmdLaunch(args: string[]): Promise<void> {
  const configPath = args[0];
  if (!configPath) {
    console.error('Usage: rmux-collab launch <config.ts|.js>');
    process.exit(1);
  }

  const abs = resolve(configPath);
  const mod = await import(pathToFileURL(abs).href);
  const config: ChannelConfig = mod.default ?? mod;

  const rmux = new Rmux();
  const reg = getRegistry();

  console.log(`Launching channel "${config.name}" with ${config.agents.length} agent(s)...`);
  const channel = await Channel.create(rmux, config);

  reg.registerChannel(config.name, channel.layout, [...channel.getSessionNames()]);

  const sessionNames = channel.getSessionNames();
  let agentIdx = 0;
  for (const [name, agent] of channel.agents) {
    const agentConfig = config.agents.find(a => a.name === name)!;
    const panePid = parseInt(
      rmuxExec(`display -p -t ${agent.target} "#{pane_pid}"`), 10,
    );

    const sessionName = channel.layout === 'separate'
      ? sessionNames[agentIdx] ?? `${config.name}-${name}`
      : sessionNames[0] ?? config.name;

    reg.registerAgent({
      name,
      tool: agentConfig.tool,
      target: agent.target,
      sessionName,
      paneIndex: channel.layout === 'separate' ? 0 : agentIdx,
      cwd: agentConfig.cwd ?? config.cwd ?? process.cwd(),
      settings: agentConfig.settings,
      model: agentConfig.model,
      launchTimestamp: agent.launchTimestamp,
      panePid: isNaN(panePid) ? undefined : panePid,
      layout: channel.layout,
      channelName: config.name,
    });

    agentIdx++;
    const alive = reg.isAgentAlive(name);
    console.log(`  ${name}: ${alive ? 'alive' : 'starting'} @ ${agent.target}`);
  }

  console.log(`\nChannel "${config.name}" launched. Agents registered.`);
}

async function cmdSend(args: string[]): Promise<void> {
  const [name, ...msgParts] = args;
  const message = msgParts.join(' ');
  if (!name || !message) {
    console.error('Usage: rmux-collab send <agent> <message>');
    process.exit(1);
  }

  const reg = getRegistry();
  const agent = reconnectAgent(reg, name);
  if (!agent) {
    console.error(`Agent "${name}" not found or not alive. Run 'rmux-collab list' to check.`);
    process.exit(1);
  }

  await agent.send(message);
  console.log(`Sent to ${name}.`);
}

async function cmdPoll(args: string[], jsonOutput: boolean): Promise<void> {
  const name = args[0];
  if (!name) {
    console.error('Usage: rmux-collab poll <agent>');
    process.exit(1);
  }

  const reg = getRegistry();
  const entry = reg.getAgent(name);
  if (!entry) {
    console.error(`Agent "${name}" not registered.`);
    process.exit(1);
  }

  // Try session file first
  let response: { text: string; timestamp: string } | null = null;

  if (entry.sessionFilePath) {
    const msg = readLastAssistantMessage(entry.sessionFilePath);
    if (msg?.text) response = { text: msg.text, timestamp: msg.timestamp };
  }

  if (!response && entry.panePid) {
    const sessionPath = discoverSessionPath(entry.panePid);
    if (sessionPath) {
      reg.updateAgent(name, { sessionFilePath: sessionPath });
      const msg = readLastAssistantMessage(sessionPath);
      if (msg?.text) response = { text: msg.text, timestamp: msg.timestamp };
    }
  }

  if (!response) {
    // Fallback: capture pane
    const raw = rmuxExec(`capture-pane -p -t ${entry.target} -S -50`);
    const lines = raw.split('\n').filter(l => l.trim());
    if (lines.length > 0) {
      response = { text: lines.slice(-10).join('\n'), timestamp: new Date().toISOString() };
    }
  }

  if (jsonOutput) {
    console.log(JSON.stringify({ agent: name, response }, null, 2));
  } else if (response) {
    console.log(response.text);
  } else {
    console.log(`No response available from ${name}.`);
  }
}

async function cmdAsk(args: string[], timeout: number, jsonOutput: boolean): Promise<void> {
  const [name, ...msgParts] = args;
  const message = msgParts.join(' ');
  if (!name || !message) {
    console.error('Usage: rmux-collab ask <agent> <message>');
    process.exit(1);
  }

  const reg = getRegistry();
  const agent = reconnectAgent(reg, name);
  if (!agent) {
    console.error(`Agent "${name}" not found or not alive.`);
    process.exit(1);
  }

  const result = await agent.ask(message, { timeout });

  // Update session file path in registry if discovered
  if (agent.resolvedSessionFile) {
    reg.updateAgent(name, { sessionFilePath: agent.resolvedSessionFile });
  }

  if (jsonOutput) {
    console.log(JSON.stringify({
      agent: name,
      status: result.status,
      confidence: result.confidence,
      duration_ms: result.duration_ms,
      output: result.output,
    }, null, 2));
  } else {
    console.log(result.output);
  }
}

async function cmdList(jsonOutput: boolean): Promise<void> {
  const reg = getRegistry();
  const agents = reg.getAllAgents();

  if (agents.length === 0) {
    if (jsonOutput) {
      console.log(JSON.stringify({ agents: [] }));
    } else {
      console.log('No registered agents.');
    }
    return;
  }

  const rows = agents.map(a => ({
    name: a.name,
    tool: a.tool,
    channel: a.channelName,
    layout: a.layout,
    target: a.target,
    alive: reg.isAgentAlive(a.name),
    cwd: a.cwd,
  }));

  if (jsonOutput) {
    console.log(JSON.stringify({ agents: rows }, null, 2));
  } else {
    for (const r of rows) {
      const status = r.alive ? '\x1b[32malive\x1b[0m' : '\x1b[31mdead\x1b[0m';
      console.log(`  ${r.name} [${r.tool}] ${status}  ${r.target}  (${r.channel}/${r.layout})`);
    }
  }
}

async function cmdDestroy(args: string[]): Promise<void> {
  const reg = getRegistry();

  if (args.includes('--all')) {
    const agents = reg.getAllAgents();
    const channels = new Set(agents.map(a => a.channelName));
    for (const ch of channels) {
      const chData = reg.getChannel(ch);
      if (chData) {
        for (const sn of chData.sessionNames) {
          rmuxExec(`kill-session -t ${sn}`);
        }
      }
      reg.removeChannel(ch);
    }
    console.log(`Destroyed ${agents.length} agent(s).`);
    return;
  }

  const name = args[0];
  if (!name) {
    console.error('Usage: rmux-collab destroy <agent|--all>');
    process.exit(1);
  }

  const entry = reg.getAgent(name);
  if (!entry) {
    console.error(`Agent "${name}" not registered.`);
    process.exit(1);
  }

  if (entry.layout === 'separate') {
    rmuxExec(`kill-session -t ${entry.sessionName}`);
  } else {
    // Split mode: kill pane, not entire session
    rmuxExec(`kill-pane -t ${entry.target}`);
  }
  reg.removeAgent(name);
  console.log(`Destroyed agent "${name}".`);
}

async function cmdStatus(args: string[], jsonOutput: boolean): Promise<void> {
  const name = args[0];
  if (!name) {
    console.error('Usage: rmux-collab status <agent>');
    process.exit(1);
  }

  const reg = getRegistry();
  const entry = reg.getAgent(name);
  if (!entry) {
    console.error(`Agent "${name}" not registered.`);
    process.exit(1);
  }

  const alive = reg.isAgentAlive(name);
  const idle = alive ? checkIdle(entry) : false;

  const info = {
    ...entry,
    alive,
    idle,
  };

  if (jsonOutput) {
    console.log(JSON.stringify(info, null, 2));
  } else {
    console.log(`Agent: ${entry.name}`);
    console.log(`  Tool:    ${entry.tool}`);
    console.log(`  Target:  ${entry.target}`);
    console.log(`  Channel: ${entry.channelName} (${entry.layout})`);
    console.log(`  CWD:     ${entry.cwd}`);
    console.log(`  Status:  ${alive ? 'alive' : 'dead'}${idle ? ' (idle)' : ''}`);
    console.log(`  PID:     ${entry.panePid ?? 'unknown'}`);
    console.log(`  Session: ${entry.sessionFilePath ?? 'not discovered'}`);
  }
}

function checkIdle(entry: RegisteredAgent): boolean {
  try {
    const raw = rmuxExec(`capture-pane -p -t ${entry.target}`);
    const lines = raw.split('\n').filter(l => l.trim()).slice(-5);
    const marker = getDefaultMarker(entry.tool as AgentTool);
    if (typeof marker === 'string') {
      return lines.some(l => l.includes(marker));
    }
    return lines.some(l => marker.test(l.trim()));
  } catch {
    return false;
  }
}

function discoverSessionPath(panePid: number): string | null {
  return discoverSessionPathUtil(panePid, findSessionByPid);
}

// --- Parse args and dispatch ---

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') usage();

  const cmd = argv[0];
  const jsonOutput = argv.includes('--json');
  const timeoutIdx = argv.indexOf('--timeout');
  const timeout = timeoutIdx >= 0 ? parseInt(argv[timeoutIdx + 1], 10) : 120_000;

  const flagsWithValues = new Set(['--timeout', '--registry']);
  const cleanArgs: string[] = [];
  const rest = argv.slice(1);
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--json') continue;
    if (flagsWithValues.has(rest[i])) { i++; continue; }
    if (rest[i].startsWith('--')) continue;
    cleanArgs.push(rest[i]);
  }

  switch (cmd) {
    case 'launch':  await cmdLaunch(cleanArgs); break;
    case 'send':    await cmdSend(cleanArgs); break;
    case 'poll':    await cmdPoll(cleanArgs, jsonOutput); break;
    case 'ask':     await cmdAsk(cleanArgs, timeout, jsonOutput); break;
    case 'list':    await cmdList(jsonOutput); break;
    case 'destroy': await cmdDestroy(cleanArgs.length ? cleanArgs : argv.slice(1)); break;
    case 'status':  await cmdStatus(cleanArgs, jsonOutput); break;
    default:
      console.error(`Unknown command: ${cmd}`);
      usage();
  }
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
