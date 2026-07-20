import { Rmux } from '@rmux/sdk';
import { Channel } from '../src/channel.js';
import { execSync } from 'node:child_process';
import type { ChannelConfig } from '../src/types.js';

function rmux(args: string): string {
  try { return execSync(`rmux ${args}`, { encoding: 'utf-8', timeout: 10_000 }).trim(); }
  catch (e: any) { return e.stdout?.trim() ?? ''; }
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function main() {
  const sdk = new Rmux();

  const config: ChannelConfig = {
    name: 'collab',
    visible: true,
    agents: [
      { name: 'claude', tool: 'claude', settings: 'D:\\settings.json', completionMarker: /❯\s*$/ },
    ],
  };

  console.log('[1] Creating channel + launching Claude...');
  const channel = await Channel.create(sdk, config);
  console.log('[2] Agent ready.');

  const target = 'collab-claude:0.0';

  // Capture BEFORE
  const before = rmux(`capture-pane -p -t ${target}`);
  console.log('[3] Before (last 3 lines):', before.split('\n').filter(l => l.trim()).slice(-3).map(l => JSON.stringify(l)));

  // Send prompt manually (same as askCli does)
  console.log('[4] Sending prompt...');
  rmux(`send-keys -t ${target} -l "respond with just pong"`);
  await sleep(300);
  rmux(`send-keys -t ${target} C-m`);

  // Wait and check every 2s
  for (let i = 1; i <= 30; i++) {
    await sleep(2000);
    const cap = rmux(`capture-pane -p -t ${target}`);
    const lines = cap.split('\n').filter(l => l.trim());
    const hasNewContent = cap.length > before.length + 20;
    const hasPrompt = cap.includes('pong');
    const hasMarker = lines.some(l => /❯/.test(l));
    console.log(`[poll ${i * 2}s] len=${cap.length} new=${hasNewContent} prompt=${hasPrompt} marker=${hasMarker} last=${JSON.stringify(lines.slice(-1)[0] ?? '')}`);

    if (hasNewContent && hasPrompt && i > 2) {
      console.log('[5] Response detected! Last 5 lines:');
      lines.slice(-5).forEach(l => console.log('  ', JSON.stringify(l)));
      break;
    }
  }

  // Use ask() API
  console.log('\n[6] Now testing ask() API...');
  const result = await channel.get('claude').ask('respond with the word ping', { timeout: 120_000 });
  console.log('[7] Status:', result.status, '| Confidence:', result.confidence, '| Duration:', result.duration_ms);
  console.log('[7] Output:', JSON.stringify(result.output.slice(0, 200)));
  console.log('[7] Segments:', result.segments.map(s => `[${s.kind}:${s.content.slice(0, 50)}]`));

  console.log('\n[8] Cleanup...');
  await channel.destroy();
  console.log('[done]');
}

main().catch(e => { console.error('ERROR:', e.message); rmux('kill-session -t collab-claude'); });
