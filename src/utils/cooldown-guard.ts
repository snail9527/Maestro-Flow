// src/utils/cooldown-guard.ts — Cross-process cooldown via tmpdir bridge files
//
// Shared abstraction for time-based throttling across subprocess invocations.
// Each guard writes a JSON bridge file in tmpdir; subsequent calls within the
// cooldown window are skipped.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

interface BridgeData {
  last_trigger: number;
  session_id?: string;
  extra?: Record<string, unknown>;
}

export interface CooldownGuardOptions {
  prefix: string;
  cooldownMs: number;
}

export class CooldownGuard {
  private readonly prefix: string;
  private readonly cooldownMs: number;

  constructor(opts: CooldownGuardOptions) {
    this.prefix = opts.prefix;
    this.cooldownMs = opts.cooldownMs;
  }

  shouldRun(sessionId: string): boolean {
    const bridge = this.read(sessionId);
    if (!bridge) return true;
    return (Date.now() - bridge.last_trigger) >= this.cooldownMs;
  }

  markDone(sessionId: string, extra?: Record<string, unknown>): void {
    const data: BridgeData = {
      last_trigger: Date.now(),
      session_id: sessionId,
      extra,
    };
    try {
      writeFileSync(this.path(sessionId), JSON.stringify(data), 'utf-8');
    } catch {
      // Best-effort
    }
  }

  timeSinceLastMs(sessionId: string): number | null {
    const bridge = this.read(sessionId);
    if (!bridge) return null;
    return Date.now() - bridge.last_trigger;
  }

  private read(sessionId: string): BridgeData | null {
    const p = this.path(sessionId);
    if (!existsSync(p)) return null;
    try {
      return JSON.parse(readFileSync(p, 'utf-8')) as BridgeData;
    } catch {
      return null;
    }
  }

  private path(sessionId: string): string {
    return join(tmpdir(), `${this.prefix}${sessionId}.json`);
  }
}

// Pre-configured guards for common use cases
export const kgSyncGuard = new CooldownGuard({ prefix: 'maestro-kg-sync-', cooldownMs: 30_000 });
export const kgInitGuard = new CooldownGuard({ prefix: 'maestro-kg-init-', cooldownMs: 300_000 });
