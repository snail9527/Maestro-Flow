import type { ChannelConfig } from '../src/types.js';

const config: { channels: ChannelConfig[] } = {
  channels: [
    {
      name: 'dev',
      agents: [
        { name: 'planner', tool: 'claude', model: 'claude-sonnet-4-6' },
        { name: 'coder', tool: 'codex' },
        { name: 'reviewer', tool: 'claude', model: 'claude-sonnet-4-6' },
      ],
    },
    {
      name: 'ops',
      agents: [
        { name: 'runner', tool: 'shell', launchCommand: 'cmd.exe' },
      ],
    },
  ],
};

export default config;
