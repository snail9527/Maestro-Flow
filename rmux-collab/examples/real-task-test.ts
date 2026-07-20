import { Rmux } from '@rmux/sdk';
import { Channel } from '../src/channel.js';
import type { ChannelConfig } from '../src/types.js';

const PROJECT_DIR = 'D:\\maestro2\\rmux-collab';

async function main() {
  const sdk = new Rmux();

  const config: ChannelConfig = {
    name: 'review',
    visible: true,
    cwd: PROJECT_DIR,
    layout: 'split',
    agents: [
      { name: 'alice', tool: 'claude', settings: 'D:\\settings.json', completionMarker: /❯\s*$/, cwd: PROJECT_DIR },
      { name: 'bob', tool: 'claude', settings: 'D:\\settings.json', completionMarker: /❯\s*$/, cwd: PROJECT_DIR },
    ],
  };

  console.log('[1] Creating split channel with 2 agents...');
  const channel = await Channel.create(sdk, config);
  console.log('[2] Channel ready. Agents:', [...channel.agents.keys()].join(', '));

  // Phase 1: parallel independent analysis
  console.log('\n[3] Phase 1: parallel code review...');
  const t0 = Date.now();

  const [r1, r2] = await Promise.all([
    channel.get('alice').ask(
      'Read src/session-reader.ts in this project. List the top 3 potential bugs or robustness issues you see. Be concise — one sentence per issue, numbered 1-3.',
      { timeout: 180_000 },
    ),
    channel.get('bob').ask(
      'Read src/agent.ts in this project. List the top 3 potential bugs or robustness issues you see. Be concise — one sentence per issue, numbered 1-3.',
      { timeout: 180_000 },
    ),
  ]);

  const phase1Ms = Date.now() - t0;
  console.log(`  [alice] ${r1.status}/${r1.confidence} ${r1.duration_ms}ms`);
  console.log(`  output: ${r1.output.slice(0, 500)}`);
  console.log(`  [bob]   ${r2.status}/${r2.confidence} ${r2.duration_ms}ms`);
  console.log(`  output: ${r2.output.slice(0, 500)}`);
  console.log(`  Phase 1 wall-clock: ${phase1Ms}ms`);

  // Phase 2: cross-review — each agent sees the other's findings
  console.log('\n[4] Phase 2: cross-review...');
  const t1 = Date.now();

  const oneline = (text: string) => text.replace(/\n+/g, ' ').replace(/\s{2,}/g, ' ').slice(0, 600);

  const [r3, r4] = await Promise.all([
    channel.get('alice').ask(
      `Bob reviewed agent.ts and found: ${oneline(r2.output)} --- For each issue Bob found, reply AGREE or DISAGREE with a one-sentence reason.`,
      { timeout: 180_000 },
    ),
    channel.get('bob').ask(
      `Alice reviewed session-reader.ts and found: ${oneline(r1.output)} --- For each issue Alice found, reply AGREE or DISAGREE with a one-sentence reason.`,
      { timeout: 180_000 },
    ),
  ]);

  const phase2Ms = Date.now() - t1;
  console.log(`  [alice on bob] ${r3.status}/${r3.confidence} ${r3.duration_ms}ms`);
  console.log(`  output: ${r3.output.slice(0, 500)}`);
  console.log(`  [bob on alice] ${r4.status}/${r4.confidence} ${r4.duration_ms}ms`);
  console.log(`  output: ${r4.output.slice(0, 500)}`);
  console.log(`  Phase 2 wall-clock: ${phase2Ms}ms`);

  // Summary
  console.log('\n=== SUMMARY ===');
  console.log(`Phase 1 (parallel review): ${phase1Ms}ms`);
  console.log(`Phase 2 (cross-review):    ${phase2Ms}ms`);
  console.log(`Total wall-clock:          ${Date.now() - t0}ms`);
  console.log(`Confidence: alice=${r1.confidence}/${r3.confidence} bob=${r2.confidence}/${r4.confidence}`);

  console.log('\n[5] Cleanup...');
  await channel.destroy();
  console.log('[done]');
}

main().catch(e => {
  console.error('ERROR:', e.message);
  try {
    const { execSync } = require('node:child_process');
    execSync('rmux kill-session -t review', { encoding: 'utf-8' });
  } catch {}
});
