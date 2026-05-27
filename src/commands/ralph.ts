// ---------------------------------------------------------------------------
// `maestro ralph` — Ralph step loader & status.json driver.
//
// Subcommands:
//   skills     List effective commands + skills (global + project, project wins)
//   check      Run health check against current ralph status.json
//   session    Show current ralph session summary
//   next       Load next pending step + required_reading, write status.json
//   complete   Mark current step done / concerns / retry / blocked
//   retry      Sugar for `complete <idx> --status NEEDS_RETRY`
//
// Data contract: drives `.workflow/.maestro/ralph-*/status.json`.
// NOT to be confused with `maestro coordinate` (graph chain walker).
// ---------------------------------------------------------------------------

import type { Command } from 'commander';

// Lazy module loader — keeps cold start cheap and isolates ralph-only deps.
async function loadSkillsCmd() {
  return (await import('../ralph/cmd-skills.js')).runSkills;
}
async function loadCheckCmd() {
  return (await import('../ralph/cmd-check.js')).runCheck;
}
async function loadSessionCmd() {
  return (await import('../ralph/cmd-session.js')).runSession;
}
async function loadNextCmd() {
  return (await import('../ralph/cmd-next.js')).runNext;
}
async function loadCompleteCmd() {
  return (await import('../ralph/cmd-complete.js')).runComplete;
}

const VALID_STATUSES = ['DONE', 'DONE_WITH_CONCERNS', 'NEEDS_RETRY', 'BLOCKED'] as const;
export type RalphCompletionStatus = typeof VALID_STATUSES[number];

export function registerRalphCommand(program: Command): void {
  const ralph = program
    .command('ralph')
    .description('Ralph step loader & status.json driver (separate from coordinate)');

  // ── skills ──────────────────────────────────────────────────────────────
  ralph
    .command('skills')
    .description('List effective commands + skills (project overrides global)')
    .option('--json', 'Machine-readable output (single JSON line per entry)')
    .option('--quiet', 'Suppress decorative output (for ralph build consumption)')
    .option('--platform <platform>', 'Filter by platform: claude (.claude/) or codex (.codex/)')
    .action(async (opts: { json?: boolean; quiet?: boolean; platform?: string }) => {
      const run = await loadSkillsCmd();
      const platform = opts.platform as ('claude' | 'codex' | undefined);
      const code = await run({ json: !!opts.json, quiet: !!opts.quiet, platform });
      process.exit(code);
    });

  // ── check ───────────────────────────────────────────────────────────────
  ralph
    .command('check')
    .description('Health-check the current ralph status.json')
    .option('--session <id>', 'Session id (default: latest running ralph-*)')
    .option('--json', 'Output findings as JSON')
    .action(async (opts: { session?: string; json?: boolean }) => {
      const run = await loadCheckCmd();
      const code = await run({ sessionId: opts.session, json: !!opts.json });
      process.exit(code);
    });

  // ── session ─────────────────────────────────────────────────────────────
  ralph
    .command('session')
    .description('Show current ralph session summary')
    .option('--session <id>', 'Session id (default: latest running ralph-*)')
    .action(async (opts: { session?: string }) => {
      const run = await loadSessionCmd();
      const code = await run({ sessionId: opts.session });
      process.exit(code);
    });

  // ── next ────────────────────────────────────────────────────────────────
  ralph
    .command('next')
    .description('Load next pending step + required_reading, write status.json, print prompt')
    .option('--session <id>', 'Session id (default: latest running ralph-*)')
    .action(async (opts: { session?: string }) => {
      const run = await loadNextCmd();
      const code = await run({ sessionId: opts.session });
      process.exit(code);
    });

  // ── complete ────────────────────────────────────────────────────────────
  ralph
    .command('complete <index>')
    .description('Mark step at <index> complete with a STATUS verdict')
    .requiredOption('--status <status>', `One of: ${VALID_STATUSES.join('|')}`)
    .option('--evidence <path>', 'Artifact path / output excerpt (repeatable)', collect, [] as string[])
    .option('--concerns <text>', 'Concerns text (with DONE_WITH_CONCERNS)')
    .option('--reason <text>', 'Reason (with BLOCKED)')
    .option('--session <id>', 'Session id (default: latest running ralph-*)')
    .action(async (indexArg: string, opts: {
      status: string;
      evidence: string[];
      concerns?: string;
      reason?: string;
      session?: string;
    }) => {
      const status = opts.status.toUpperCase() as RalphCompletionStatus;
      if (!(VALID_STATUSES as readonly string[]).includes(status)) {
        console.error(`[ralph complete] --status must be one of: ${VALID_STATUSES.join(', ')} (got "${opts.status}")`);
        process.exit(2);
      }
      const index = Number.parseInt(indexArg, 10);
      if (!Number.isFinite(index) || index < 0) {
        console.error(`[ralph complete] <index> must be a non-negative integer (got "${indexArg}")`);
        process.exit(2);
      }
      const run = await loadCompleteCmd();
      const code = await run({
        sessionId: opts.session,
        index,
        status,
        evidence: opts.evidence,
        concerns: opts.concerns,
        reason: opts.reason,
      });
      process.exit(code);
    });

  // ── retry ───────────────────────────────────────────────────────────────
  ralph
    .command('retry <index>')
    .description('Sugar: mark step at <index> as NEEDS_RETRY')
    .option('--session <id>', 'Session id (default: latest running ralph-*)')
    .action(async (indexArg: string, opts: { session?: string }) => {
      const index = Number.parseInt(indexArg, 10);
      if (!Number.isFinite(index) || index < 0) {
        console.error(`[ralph retry] <index> must be a non-negative integer (got "${indexArg}")`);
        process.exit(2);
      }
      const run = await loadCompleteCmd();
      const code = await run({
        sessionId: opts.session,
        index,
        status: 'NEEDS_RETRY',
        evidence: [],
      });
      process.exit(code);
    });
}

function collect(value: string, prior: string[]): string[] {
  return prior.concat(value);
}
