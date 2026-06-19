// src/graph/kg/sync/index.ts — 同步层导出

export { FileLock, runIncrementalSync, computeFileHash, hasFileChanged } from './incremental-sync.js';
export type { IncrementalSyncOptions } from './incremental-sync.js';

export { isWSL2, isOnDrvFs, decideWatchStrategy, areGitHooksInstalled, GIT_HOOK_SCRIPT } from './watch-policy.js';
export type { WatchStrategy } from './watch-policy.js';