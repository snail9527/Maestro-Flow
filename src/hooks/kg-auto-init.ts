/**
 * KG Auto-Init Hook — UserPromptSubmit / SessionStart
 *
 * Checks if KG database exists; if not, initializes + runs first sync.
 * Uses kgInitGuard for 5-minute cooldown to avoid repeated init attempts.
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { kgInitGuard } from '../utils/cooldown-guard.js';

export interface KgAutoInitResult {
  initialized: boolean;
  reason?: string;
  durationMs?: number;
}

export async function evaluateKgAutoInit(
  projectPath: string,
  sessionId: string,
): Promise<KgAutoInitResult> {
  try {
    if (!existsSync(resolve(projectPath, '.workflow'))) {
      return { initialized: false, reason: 'no-workflow-dir' };
    }

    const { MaestroGraph } = await import('../graph/kg/engine.js');

    if (MaestroGraph.isInitialized(projectPath)) {
      return { initialized: false, reason: 'already-initialized' };
    }

    if (!kgInitGuard.shouldRun(sessionId)) {
      return { initialized: false, reason: 'cooldown' };
    }

    const start = Date.now();
    const mg = await MaestroGraph.init(projectPath);
    try {
      await mg.sync();
    } finally {
      mg.close();
    }
    kgInitGuard.markDone(sessionId);
    return { initialized: true, durationMs: Date.now() - start };
  } catch {
    kgInitGuard.markDone(sessionId);
    return { initialized: false, reason: 'init-error' };
  }
}
