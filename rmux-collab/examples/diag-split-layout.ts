import { Rmux } from '@rmux/sdk';
import { Channel } from '../src/channel.js';
import type { ChannelConfig } from '../src/types.js';
import { execSync } from 'node:child_process';

const PROJECT_DIR = 'D:\\maestro2\\rmux-collab';

async function main() {
  const sdk = new Rmux();

  const config: ChannelConfig = {
    name: 'team',
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
  console.log('[2] Channel ready. Layout:', channel.layout);
  console.log('    Agents:', [...channel.agents.keys()].join(', '));

  // Verify panes exist
  const panes = execSync('rmux list-panes -t team:0', { encoding: 'utf-8' }).trim();
  console.log('[2.5] Panes:\n', panes);

  // Test: ask both agents
  console.log('\n[3] ask alice("say hello alice")...');
  const r1 = await channel.get('alice').ask('respond with just: hello from alice', { timeout: 120_000 });
  console.log('  alice:', r1.status, r1.confidence, r1.duration_ms + 'ms', JSON.stringify(r1.output.slice(0, 200)));

  console.log('\n[4] ask bob("say hello bob")...');
  const r2 = await channel.get('bob').ask('respond with just: hello from bob', { timeout: 120_000 });
  console.log('  bob:', r2.status, r2.confidence, r2.duration_ms + 'ms', JSON.stringify(r2.output.slice(0, 200)));

  // Test: broadcast
  console.log('\n[5] broadcast("what is your name?")...');
  const results = await channel.broadcast('what is your name? reply in one word', { timeout: 120_000 });
  for (const r of results) {
    console.log(`  ${r.agent}: ${r.status} ${r.confidence} ${r.duration_ms}ms ${JSON.stringify(r.output.slice(0, 200))}`);
  }

  console.log('\n[6] Cleanup...');
  await channel.destroy();
  console.log('[done]');
}

main().catch(e => {
  console.error('ERROR:', e.message);
  try { execSync('rmux kill-session -t team', { encoding: 'utf-8' }); } catch {}
});
