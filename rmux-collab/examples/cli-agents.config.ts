import type { ChannelConfig } from '../src/types.js';

const PROJECT_DIR = 'D:\\maestro2\\rmux-collab';

const config: ChannelConfig = {
  name: 'lab',
  visible: true,
  cwd: PROJECT_DIR,
  layout: 'split',
  agents: [
    { name: 'alice', tool: 'claude', settings: 'D:\\settings.json', completionMarker: /❯\s*$/, cwd: PROJECT_DIR },
    { name: 'bob', tool: 'claude', settings: 'D:\\settings.json', completionMarker: /❯\s*$/, cwd: PROJECT_DIR },
  ],
};

export default config;
