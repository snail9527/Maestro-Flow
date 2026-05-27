// ---------------------------------------------------------------------------
// Status checker — validates ralph status.json for structural + reference
// consistency. Two severity levels:
//   E (error)   — refuses to proceed; ralph next/complete will bail
//   W (warning) — surfaced to user but non-blocking
//
// Returns a flat finding list; callers format/report. No fs writes.
// ---------------------------------------------------------------------------

import { existsSync } from 'node:fs';
import type { CheckFinding, RalphSession } from './status-schema.js';
import { normalizeStoredPath, parseSkillManifest } from './skill-resolver.js';

const REQUIRED_SESSION_FIELDS = ['session_id', 'status', 'steps'] as const;
const REQUIRED_STEP_FIELDS = ['index', 'stage', 'status'] as const;

export function checkStatus(session: RalphSession): CheckFinding[] {
  const findings: CheckFinding[] = [];

  // 1. Schema completeness — session-level
  for (const f of REQUIRED_SESSION_FIELDS) {
    if (!(f in session)) {
      findings.push({ level: 'E', code: 'E010', message: `session is missing required field: ${f}` });
    }
  }
  if (!Array.isArray(session.steps)) {
    findings.push({ level: 'E', code: 'E010', message: 'session.steps is not an array' });
    return findings; // can't continue
  }

  // 2. Schema completeness — step-level + index continuity
  for (let i = 0; i < session.steps.length; i++) {
    const step = session.steps[i];
    for (const f of REQUIRED_STEP_FIELDS) {
      if (!(f in step)) {
        findings.push({ level: 'E', code: 'E010', message: `step is missing required field: ${f}`, step_index: i });
      }
    }
    if (step.index !== i) {
      findings.push({ level: 'E', code: 'E010', message: `step.index ${step.index} != position ${i}`, step_index: i });
    }
  }

  // 3. active_step_index consistency
  const idx = session.active_step_index;
  if (idx !== null && idx !== undefined) {
    if (idx < 0 || idx >= session.steps.length) {
      findings.push({ level: 'E', code: 'E008', message: `active_step_index ${idx} out of range` });
    } else {
      const step = session.steps[idx];
      if (step.status === 'completed') {
        findings.push({
          level: 'W', code: 'W005',
          message: `active_step_index points to a completed step; next will auto-clear`,
          step_index: idx,
        });
      } else if (step.status !== 'running' && step.status !== 'pending') {
        findings.push({
          level: 'E', code: 'E008',
          message: `active_step_index step.status is "${step.status}"; expected running|pending`,
          step_index: idx,
        });
      }
    }
  }

  // 4. Completion contract — completed steps must be confirmed
  for (const step of session.steps) {
    if (step.status === 'completed' && !step.completion_confirmed) {
      findings.push({
        level: 'W', code: 'W006',
        message: `step.status=completed but completion_confirmed=false`,
        step_index: step.index,
      });
    }
  }

  // 5/6/7. Per-step command_path + required_reading + skill name
  for (const step of session.steps) {
    if (step.decision) continue;            // decision nodes skip
    if (step.status === 'skipped') continue; // skipped steps don't need command
    if (!step.command_path) {
      findings.push({
        level: 'E', code: 'E006',
        message: `execution step has no command_path (skill="${step.skill}")`,
        step_index: step.index,
      });
      continue;
    }
    const resolvedPath = normalizeStoredPath(step.command_path);
    if (!existsSync(resolvedPath)) {
      findings.push({
        level: 'E', code: 'E006',
        message: `command_path missing on disk: ${step.command_path}`,
        step_index: step.index,
      });
      continue;
    }
    try {
      const m = parseSkillManifest(resolvedPath);
      if (m.missingRequired.length > 0) {
        for (const p of m.missingRequired) {
          findings.push({
            level: 'E', code: 'E007',
            message: `required_reading missing: ${p}`,
            step_index: step.index,
          });
        }
      }
      const fmName = (m.frontmatter.name ?? '').toString();
      if (step.skill && fmName && fmName !== step.skill) {
        findings.push({
          level: 'W', code: 'W007',
          message: `step.skill "${step.skill}" != frontmatter.name "${fmName}"`,
          step_index: step.index,
        });
      }
    } catch (err) {
      findings.push({
        level: 'E', code: 'E010',
        message: `failed to parse command_path manifest: ${err instanceof Error ? err.message : String(err)}`,
        step_index: step.index,
      });
    }
  }

  // 8. Chain terminus
  const last = session.steps[session.steps.length - 1];
  if (last && !last.decision && last.skill && last.skill !== 'maestro-milestone-complete') {
    findings.push({
      level: 'W', code: 'W008',
      message: `chain does not terminate with milestone-complete (last skill: ${last.skill})`,
      step_index: last.index,
    });
  }

  return findings;
}

export function summarize(findings: CheckFinding[]): { errors: number; warnings: number } {
  return {
    errors: findings.filter(f => f.level === 'E').length,
    warnings: findings.filter(f => f.level === 'W').length,
  };
}
