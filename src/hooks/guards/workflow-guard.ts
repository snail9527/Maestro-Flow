// ---------------------------------------------------------------------------
// WorkflowGuard — Blocks dangerous operations + Path boundary enforcement
// ---------------------------------------------------------------------------

import { existsSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import type { MaestroPlugin } from '../../types/index.js';
import type { WorkflowHookRegistry } from '../workflow-hooks.js';

const DANGEROUS_PATTERNS: RegExp[] = [
  /\brm\s+-rf\s+[\/~]/,
  /\bgit\s+push\s+--force\b/,
  /\bgit\s+reset\s+--hard\b/,
  /\bgit\s+clean\s+-[a-z]*f/,
  /\bdrop\s+table\b/i,
  /\btruncate\s+table\b/i,
  /\bformat\s+[a-z]:/i,
  /\bchmod\s+777\b/,
];

export interface WorkflowGuardResult {
  blocked: boolean;
  reason?: string;
}

// ---------------------------------------------------------------------------
// PathGuard — Directory-level write boundary enforcement
// ---------------------------------------------------------------------------

export interface PathGuardConfig {
  enabled: boolean;
  mode: 'allow' | 'deny';
  paths: string[];
}

const DEFAULT_PATH_GUARD: PathGuardConfig = { enabled: false, mode: 'allow', paths: [] };

/**
 * Load path guard config from .workflow/config.json → guard section.
 * Returns safe defaults on any failure.
 */
export function loadPathGuardConfig(projectRoot: string): PathGuardConfig {
  try {
    const configPath = join(projectRoot, '.workflow', 'config.json');
    if (!existsSync(configPath)) return DEFAULT_PATH_GUARD;
    const raw = JSON.parse(readFileSync(configPath, 'utf-8'));
    const guard = raw?.guard;
    if (!guard || guard.enabled !== true) return DEFAULT_PATH_GUARD;
    return {
      enabled: true,
      mode: guard.mode === 'deny' ? 'deny' : 'allow',
      paths: Array.isArray(guard.paths)
        ? guard.paths.map((p: string) => String(p).split(sep).join('/'))
        : [],
    };
  } catch {
    return DEFAULT_PATH_GUARD;
  }
}

/**
 * Pure evaluation — checks if a file path is within allowed/denied boundaries.
 * Only applies to Write and Edit tools.
 */
export function evaluatePathGuard(
  toolName: string,
  filePath: string,
  projectRoot: string,
  config: PathGuardConfig,
): WorkflowGuardResult {
  if (!config.enabled) return { blocked: false };
  if (toolName !== 'Write' && toolName !== 'Edit') return { blocked: false };
  if (!filePath || config.paths.length === 0) return { blocked: false };

  const rel = relative(resolve(projectRoot), resolve(projectRoot, filePath))
    .split(sep)
    .join('/');

  // Escapes project root
  if (rel.startsWith('..')) {
    return { blocked: true, reason: `[PathGuard] Blocked: path "${rel}" escapes project root` };
  }

  if (config.mode === 'allow') {
    const allowed = config.paths.some((p) => rel.startsWith(p) || rel === p.replace(/\/$/, ''));
    if (!allowed) {
      return { blocked: true, reason: `[PathGuard] Blocked: "${rel}" is outside allowed paths [${config.paths.join(', ')}]` };
    }
  } else {
    const denied = config.paths.some((p) => rel.startsWith(p) || rel === p.replace(/\/$/, ''));
    if (denied) {
      return { blocked: true, reason: `[PathGuard] Blocked: "${rel}" is in denied paths [${config.paths.join(', ')}]` };
    }
  }

  return { blocked: false };
}

/**
 * Pure evaluation function — portable, no I/O dependencies.
 * @param toolName  The tool or command name (e.g. "Bash", "Write")
 * @param input     The command string or tool input to check
 * @param allowlist Tool names that bypass the check
 */
export function evaluateWorkflowGuard(
  toolName: string,
  input: string,
  allowlist: string[] = [],
): WorkflowGuardResult {
  if (allowlist.includes(toolName)) return { blocked: false };
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(input)) {
      return {
        blocked: true,
        reason: `[WorkflowGuard] Blocked: dangerous operation detected in "${toolName}" matching ${pattern}`,
      };
    }
  }
  return { blocked: false };
}

/** In-process plugin for coordinator graph-walker */
export class WorkflowGuard implements MaestroPlugin {
  readonly name = 'workflowGuard';
  private readonly allowlist: string[];

  constructor(allowlist?: string[]) {
    this.allowlist = allowlist ?? [];
  }

  apply(registry: WorkflowHookRegistry): void {
    registry.beforeCommand.tap(this.name, (ctx) => {
      const result = evaluateWorkflowGuard(ctx.cmd, ctx.prompt, this.allowlist);
      return result.blocked ? result.reason : undefined;
    });
  }
}
