import { Rmux } from '@rmux/sdk';
import { Channel } from '../src/channel.js';
import type { ChannelConfig } from '../src/types.js';

async function main() {
  const rmux = new Rmux();

  const config: ChannelConfig = {
    name: 'broadcast-test',
    agents: [
      { name: 'worker-1', tool: 'shell', completionMarker: '>' },
      { name: 'worker-2', tool: 'shell', completionMarker: '>' },
    ],
  };

  console.log('[broadcast] Creating channel with 2 agents...');
  const channel = await Channel.create(rmux, config);
  console.log('[broadcast] Channel ready, agents:', [...channel.agents.keys()]);

  console.log('[broadcast] Broadcasting "echo TASK_DONE"...');
  const results = await channel.broadcast('echo TASK_DONE', { timeout: 15_000 });

  for (const r of results) {
    console.log(`[broadcast] ${r.agent}: output="${r.output}" (${r.duration_ms}ms)${r.error ? ' ERROR: ' + r.error : ''}`);
  }

  console.log('[broadcast] Testing pipeline (worker-1 → worker-2)...');
  const { pipeline } = await import('../src/patterns/pipeline.js');
  const pipeResult = await pipeline(
    [
      { agent: channel.get('worker-1') },
      { agent: channel.get('worker-2'), transform: (prev) => `echo received: ${prev.trim()}` },
    ],
    'echo STEP1_OUTPUT',
    { timeout: 15_000 },
  );
  console.log('[broadcast] Pipeline result:', JSON.stringify(pipeResult));

  await channel.destroy();
  console.log('[broadcast] Done! ✓');
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
