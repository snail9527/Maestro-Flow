import { Rmux } from '@rmux/sdk';
import { Channel } from '../src/channel.js';
import type { ChannelConfig } from '../src/types.js';
import { execSync } from 'node:child_process';

const PROJECT_DIR = 'D:\\maestro2\\rmux-collab';

async function main() {
  const sdk = new Rmux();

  const config: ChannelConfig = {
    name: 'diag',
    visible: true,
    cwd: PROJECT_DIR,
    agents: [
      { name: 'claude', tool: 'claude', settings: 'D:\\settings.json', completionMarker: /❯\s*$/, cwd: PROJECT_DIR },
    ],
  };

  console.log('[1] Creating channel + launching Claude...');
  console.log('    CWD:', PROJECT_DIR);
  const channel = await Channel.create(sdk, config);
  const agent = channel.get('claude');
  console.log('[2] Agent ready. target:', agent.target);

  // Verify Claude is at prompt (not trust dialog)
  const snap = execSync(`rmux capture-pane -p -t ${agent.target}`, { encoding: 'utf-8' }).trim();
  const tailLines = snap.split('\n').slice(-5).map(l => l.trim()).filter(Boolean);
  console.log('[2.5] Pane tail:', tailLines.join(' | '));

  // Test 1: Simple ask
  console.log('\n[3] ask("respond with just pong")...');
  const r1 = await agent.ask('respond with just the word pong', { timeout: 120_000 });
  console.log('  Status:', r1.status, '| Confidence:', r1.confidence);
  console.log('  Duration:', r1.duration_ms, 'ms');
  console.log('  Output:', JSON.stringify(r1.output.slice(0, 300)));

  // Test 2: Multi-turn
  console.log('\n[4] ask("what word did you just say?")...');
  const r2 = await agent.ask('what word did you just say? reply with just that word', { timeout: 120_000 });
  console.log('  Status:', r2.status, '| Confidence:', r2.confidence);
  console.log('  Duration:', r2.duration_ms, 'ms');
  console.log('  Output:', JSON.stringify(r2.output.slice(0, 300)));

  console.log('\n[5] Cleanup...');
  await channel.destroy();
  console.log('[done]');
}

main().catch(e => {
  console.error('ERROR:', e.message);
  try { execSync('rmux kill-session -t diag-claude', { encoding: 'utf-8' }); } catch {}
});
