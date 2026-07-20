import { Rmux } from '@rmux/sdk';
import { Channel } from '../src/channel.js';
import type { ChannelConfig } from '../src/types.js';

async function main() {
  const rmux = new Rmux();

  const config: ChannelConfig = {
    name: 'collab',
    visible: true,
    agents: [
      { name: 'claude', tool: 'claude', settings: 'D:\\settings.json', completionMarker: /❯\s*$/ },
    ],
  };

  console.log('Creating visible Claude agent...');
  const channel = await Channel.create(rmux, config);
  console.log('Agent ready! Asking...');

  const result = await channel.get('claude').ask('respond with just "hello world"', { timeout: 120_000 });
  console.log('Status:', result.status);
  console.log('Confidence:', result.confidence);
  console.log('Duration:', result.duration_ms, 'ms');
  console.log('Segments:', result.segments.length, result.segments.map(s => `[${s.kind}:${s.content.length}ch]`).join(' '));
  console.log('Output:', JSON.stringify(result.output.slice(0, 300)));
  console.log('Raw (FULL):', JSON.stringify(result.raw));
  console.log('Raw length:', result.raw.length);
  // Also show direct capture for comparison
  const sdk = new Rmux();
  const directCap = await sdk.capturePane({ target: `collab-claude:0.0` });
  console.log('Direct capture (last 500):', JSON.stringify(directCap.slice(-500)));

  console.log('\nClaude window is visible in your terminal.');
  console.log('Cleanup in 15s...');
  await new Promise(r => setTimeout(r, 15_000));
  await channel.destroy();
  console.log('Done ✓');
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
