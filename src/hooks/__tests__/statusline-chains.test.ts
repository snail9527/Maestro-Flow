/**
 * Tests for line-2 chain rendering: simplification, 48h expiry, cap=3.
 *
 * Spins up a temp workspace with .workflow/state.json fixtures and invokes
 * formatStatusline to verify rendered output.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { formatStatusline } from '../statusline.js';

const ANSI = /\x1b\[[0-9;]*m/g;
function plain(s: string): string { return s.replace(ANSI, ''); }

let workspace: string;

function setup(stateJson: object): void {
  workspace = mkdtempSync(join(tmpdir(), 'statusline-chain-test-'));
  mkdirSync(join(workspace, '.workflow'), { recursive: true });
  writeFileSync(join(workspace, '.workflow', 'state.json'), JSON.stringify(stateJson));
}

function teardown(): void {
  try { rmSync(workspace, { recursive: true, force: true }); } catch { /* ignore */ }
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

describe('statusline chain rendering', () => {
  beforeEach(() => { workspace = ''; });
  afterEach(teardown);

  it('renders completed chain as compact "slug ✓"', () => {
    setup({
      version: '2.0',
      current_milestone: 'MVP',
      milestones: [{ id: 'MVP', name: 'MVP', phases: [1] }],
      artifacts: [
        { id: 'ANL-1', type: 'analyze', milestone: 'MVP', phase: 1, status: 'completed', completed_at: isoDaysAgo(0.5) },
        { id: 'PLN-1', type: 'plan',    milestone: 'MVP', phase: 1, status: 'completed', depends_on: 'ANL-1', completed_at: isoDaysAgo(0.5) },
        { id: 'EXC-1', type: 'execute', milestone: 'MVP', phase: 1, status: 'completed', depends_on: 'PLN-1', completed_at: isoDaysAgo(0.5) },
      ],
    });
    const out = plain(formatStatusline({ workspace: { current_dir: workspace } }));
    // No A→P→E noise
    assert.ok(!out.includes('A→P→E'), `should not contain A→P→E: ${out}`);
    assert.ok(!out.includes('A→'), `should not contain old type abbrev arrows: ${out}`);
    // Should contain compact form
    assert.match(out, /\bMVP\b/);
    assert.match(out, /✓/);
  });

  it('renders in-progress chain with current step name + progress', () => {
    setup({
      version: '2.0',
      current_milestone: 'MVP',
      milestones: [{ id: 'MVP', name: 'MVP', phases: [1] }],
      artifacts: [
        { id: 'ANL-1', type: 'analyze', milestone: 'MVP', phase: 1, status: 'completed', completed_at: isoDaysAgo(0) },
        { id: 'PLN-1', type: 'plan',    milestone: 'MVP', phase: 1, status: 'completed', depends_on: 'ANL-1', completed_at: isoDaysAgo(0) },
        { id: 'EXC-1', type: 'execute', milestone: 'MVP', phase: 1, status: 'in_progress', depends_on: 'PLN-1' },
      ],
    });
    const out = plain(formatStatusline({ workspace: { current_dir: workspace } }));
    assert.match(out, /execute/, `should show current step name: ${out}`);
    assert.match(out, /\(2\/3\)/, `should show progress (2/3): ${out}`);
  });

  it('hides completed chains older than 48h', () => {
    setup({
      version: '2.0',
      current_milestone: 'MVP',
      milestones: [{ id: 'MVP', name: 'MVP', phases: [1] }],
      artifacts: [
        { id: 'OLD-1', type: 'analyze', milestone: 'MVP', phase: 1, status: 'completed', path: 'phases/01-old-feature', completed_at: isoDaysAgo(5) },
      ],
    });
    const out = plain(formatStatusline({ workspace: { current_dir: workspace } }));
    assert.ok(!out.includes('old-feature'), `should hide stale chain: ${out}`);
    // Should still show milestone header
    assert.match(out, /MVP/);
  });

  it('keeps in-progress chain even if dated >48h ago', () => {
    setup({
      version: '2.0',
      current_milestone: 'MVP',
      milestones: [{ id: 'MVP', name: 'MVP', phases: [1] }],
      artifacts: [
        { id: 'STALE-IP', type: 'execute', milestone: 'MVP', phase: 1, status: 'in_progress', path: 'phases/01-stuck-feature' },
      ],
    });
    const out = plain(formatStatusline({ workspace: { current_dir: workspace } }));
    assert.match(out, /stuck-feature/, `in-progress chain must always show: ${out}`);
  });

  it('caps visible chains at 3 with +N overflow', () => {
    const artifacts = [];
    for (let i = 0; i < 5; i++) {
      artifacts.push({
        id: `A-${i}`, type: 'analyze', milestone: 'MVP', phase: 1, status: 'completed',
        path: `phases/0${i + 1}-feature-${i}`,
        completed_at: isoDaysAgo(i * 0.1),  // all within 48h
      });
    }
    setup({
      version: '2.0',
      current_milestone: 'MVP',
      milestones: [{ id: 'MVP', name: 'MVP', phases: [1] }],
      artifacts,
    });
    const out = plain(formatStatusline({ workspace: { current_dir: workspace } }));
    assert.match(out, /\+2/, `should show +2 overflow indicator: ${out}`);
  });

  it('handles v1.0 schema with phases as object array (no [object Object])', () => {
    setup({
      version: '1.0',
      current_milestone: 'v0.3',
      milestones: [{
        id: 'v0.3',
        name: 'v0.3',
        phases: [
          { id: 1, slug: 'core', status: 'in-progress' },
          { id: 2, slug: 'hardening', status: 'pending' },
        ],
      }],
      artifacts: [],
    });
    const out = plain(formatStatusline({ workspace: { current_dir: workspace } }));
    assert.ok(!out.includes('[object Object]'), `must not leak [object Object]: ${out}`);
    assert.match(out, /P1\b/, `should show numeric phase id P1: ${out}`);
    assert.match(out, /v0\.3/);
  });

  it('v1.0 inline phase.status correctly counts completed', () => {
    setup({
      version: '1.0',
      current_milestone: 'v0.2',
      milestones: [{
        id: 'v0.2', name: 'v0.2',
        phases: [
          { id: 1, status: 'completed' },
          { id: 2, status: 'completed' },
          { id: 3, status: 'in-progress' },
          { id: 4, status: 'pending' },
        ],
      }],
      artifacts: [],
    });
    const out = plain(formatStatusline({ workspace: { current_dir: workspace } }));
    assert.match(out, /2\/4/, `should show 2/4 completed: ${out}`);
    assert.match(out, /P3\b/, `current phase = P3 (in-progress): ${out}`);
  });
});
