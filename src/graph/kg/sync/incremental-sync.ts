// src/graph/kg/sync/incremental-sync.ts — 增量同步
// 参考: plan-maestrograph.md D2.4 同步优先级调度 + D1.4 FileLock

import { existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import type { MaestroGraph } from '../engine.js';
import type { SyncResult, SourceType } from '../db/types.js';

// ---------------------------------------------------------------------------
// FileLock — D1.4: SQLite 跨进程写锁保护
// ---------------------------------------------------------------------------

export class FileLock {
  private lockPath: string;

  constructor(lockPath: string) {
    this.lockPath = lockPath;
  }

  async withLock<T>(fn: () => Promise<T>): Promise<T> {
    // 简化版: 使用文件锁标记
    // 生产环境应使用 proper file-lock (如 proper-lockfile)
    const lockId = `${process.pid}-${Date.now()}`;

    // 写锁文件
    const { writeFileSync, unlinkSync } = await import('node:fs');
    try {
      writeFileSync(this.lockPath, lockId, { flag: 'wx' }); // 排他创建
    } catch {
      // 锁已存在, 等待并重试
      await new Promise(resolve => setTimeout(resolve, 100));
      try {
        writeFileSync(this.lockPath, lockId, { flag: 'wx' });
      } catch {
        throw new Error('Could not acquire lock: ' + this.lockPath);
      }
    }

    try {
      return await fn();
    } finally {
      try { unlinkSync(this.lockPath); } catch { /* ignore */ }
    }
  }
}

// ---------------------------------------------------------------------------
// 增量同步 — D2.4: 知识源高优先级, 代码源异步
// ---------------------------------------------------------------------------

export interface IncrementalSyncOptions {
  /** 全量重建 */
  full?: boolean;
  /** 只同步指定源 */
  sources?: SourceType[];
  /** 变更文件列表 (增量模式) */
  changedFiles?: string[];
}

/**
 * 增量同步入口 — 协调知识源和代码源的同步
 *
 * D2.4: 知识源 (domain/spec/knowhow) 高优先级同步, 代码源异步后台
 */
export async function runIncrementalSync(
  mg: MaestroGraph,
  projectPath: string,
  options?: IncrementalSyncOptions,
): Promise<SyncResult[]> {
  const { syncKnowledgeGraph } = await import('../extraction/orchestrator.js');
  return syncKnowledgeGraph(projectPath, {
    full: options?.full,
    sources: options?.sources,
  });
}

// ---------------------------------------------------------------------------
// File hash diff — 检测文件变更
// ---------------------------------------------------------------------------

export function computeFileHash(filePath: string): string {
  try {
    const content = readFileSync(filePath);
    return createHash('sha256').update(content).digest('hex').substring(0, 16);
  } catch {
    return '';
  }
}

export function hasFileChanged(filePath: string, storedHash: string): boolean {
  const currentHash = computeFileHash(filePath);
  return currentHash !== storedHash;
}