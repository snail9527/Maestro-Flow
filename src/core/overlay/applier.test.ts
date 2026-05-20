import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
  readdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';

// `paths.home` is frozen at module import time from MAESTRO_HOME env.
// Mock it so each test gets a fresh temp-based home directory.
// Also mock manifest.js because tag-injector.ts (imported transitively via
// applier → tag-injector → manifest) evaluates paths.home eagerly at
// module scope — the manifest mock prevents that eager evaluation.
let mockHome: string;
vi.mock('../../config/paths.js', () => ({
  paths: {
    get home() { return mockHome; },
  },
}));
vi.mock('../manifest.js', () => ({
  addFile: () => {},
  addDir: () => {},
}));

import {
  applyOverlays,
  exportOverlayFile,
  importOverlayFile,
  removeOverlayFromTargets,
} from './applier.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_CMD = [
  '---',
  'name: test-cmd',
  '---',
  '<purpose>',
  'base purpose',
  '</purpose>',
  '',
  '<execution>',
  'base execution step',
  '</execution>',
  '',
].join('\n');

const OVERLAY_JSON = {
  name: 'cli-verify',
  description: 'Run CLI verify after execute',
  targets: ['test-cmd'],
  priority: 50,
  enabled: true,
  patches: [
    {
      section: 'execution',
      mode: 'append',
      content: 'INJECTED: run ccw cli --mode analysis',
    },
  ],
};

const CLAUDE_MD_OVERLAY_JSON = {
  name: 'custom-rules',
  description: 'Inject custom rules into CLAUDE.md',
  targets: ['_claude-md'],
  priority: 50,
  enabled: true,
  patches: [
    {
      section: 'my-rules',
      mode: 'replace',
      content: '## Custom Rules\n\nAlways use TypeScript strict mode.',
    },
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupScope(
  tmp: string,
  cmdFiles: Record<string, string>,
): { targetBase: string; overlayDir: string } {
  const targetBase = join(tmp, 'target');
  const commandsDir = join(targetBase, '.claude', 'commands');
  mkdirSync(commandsDir, { recursive: true });
  for (const [name, body] of Object.entries(cmdFiles)) {
    writeFileSync(join(commandsDir, `${name}.md`), body, 'utf-8');
  }
  const overlayDir = join(tmp, 'overlays');
  mkdirSync(overlayDir, { recursive: true });
  return { targetBase, overlayDir };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('applier', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'overlay-applier-'));
    mockHome = join(tmp, 'maestro-home');
    mkdirSync(mockHome, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  describe('applyOverlays', () => {
    it('applies overlay, injects markers, writes manifest', () => {
      const { targetBase, overlayDir } = setupScope(tmp, { 'test-cmd': BASE_CMD });
      writeFileSync(
        join(overlayDir, 'cli-verify.json'),
        JSON.stringify(OVERLAY_JSON),
        'utf-8',
      );

      const report = applyOverlays({
        targetBase,
        scope: 'global',
        overlayDir,
        logger: () => {},
      });

      expect(report.overlaysLoaded).toBe(1);
      expect(report.overlaysApplied).toBe(1);
      expect(report.filesChanged).toBe(1);

      const text = readFileSync(
        join(targetBase, '.claude', 'commands', 'test-cmd.md'),
        'utf-8',
      );
      expect(text).toContain('<!-- maestro-overlay:cli-verify#0');
      expect(text).toContain('INJECTED: run ccw cli');
      expect(text).toContain('base execution step'); // original preserved
    });

    it('second apply is byte-identical (idempotent)', () => {
      const { targetBase, overlayDir } = setupScope(tmp, { 'test-cmd': BASE_CMD });
      writeFileSync(
        join(overlayDir, 'cli-verify.json'),
        JSON.stringify(OVERLAY_JSON),
        'utf-8',
      );
      const logger = () => {};
      applyOverlays({ targetBase, scope: 'global', overlayDir, logger });
      const after1 = readFileSync(
        join(targetBase, '.claude', 'commands', 'test-cmd.md'),
        'utf-8',
      );
      applyOverlays({ targetBase, scope: 'global', overlayDir, logger });
      const after2 = readFileSync(
        join(targetBase, '.claude', 'commands', 'test-cmd.md'),
        'utf-8',
      );
      expect(after2).toBe(after1);
    });

    it('skips missing targets with reason', () => {
      const { targetBase, overlayDir } = setupScope(tmp, {});
      writeFileSync(
        join(overlayDir, 'cli-verify.json'),
        JSON.stringify(OVERLAY_JSON),
        'utf-8',
      );
      const report = applyOverlays({
        targetBase,
        scope: 'global',
        overlayDir,
        logger: () => {},
      });
      expect(report.filesChanged).toBe(0);
      expect(report.skipped).toHaveLength(1);
      expect(report.skipped[0].reason).toBe('missing');
    });

    it('skips .md.disabled targets', () => {
      const { targetBase, overlayDir } = setupScope(tmp, {});
      const cmdsDir = join(targetBase, '.claude', 'commands');
      writeFileSync(join(cmdsDir, 'test-cmd.md.disabled'), BASE_CMD, 'utf-8');
      writeFileSync(
        join(overlayDir, 'cli-verify.json'),
        JSON.stringify(OVERLAY_JSON),
        'utf-8',
      );
      const report = applyOverlays({
        targetBase,
        scope: 'global',
        overlayDir,
        logger: () => {},
      });
      expect(report.skipped[0].reason).toBe('disabled');
    });

    it('disabled overlay is not applied', () => {
      const { targetBase, overlayDir } = setupScope(tmp, { 'test-cmd': BASE_CMD });
      writeFileSync(
        join(overlayDir, 'cli-verify.json'),
        JSON.stringify({ ...OVERLAY_JSON, enabled: false }),
        'utf-8',
      );
      const report = applyOverlays({
        targetBase,
        scope: 'global',
        overlayDir,
        logger: () => {},
      });
      expect(report.overlaysApplied).toBe(0);
      const text = readFileSync(
        join(targetBase, '.claude', 'commands', 'test-cmd.md'),
        'utf-8',
      );
      expect(text).not.toContain('maestro-overlay');
    });
  });

  describe('applyOverlays (_claude-md target)', () => {
    it('injects overlay content into CLAUDE.md via tag-injector markers', () => {
      const targetBase = join(tmp, 'target');
      const overlayDir = join(tmp, 'overlays');
      mkdirSync(overlayDir, { recursive: true });
      // No need to create CLAUDE.md — applier should create it
      writeFileSync(
        join(overlayDir, 'custom-rules.json'),
        JSON.stringify(CLAUDE_MD_OVERLAY_JSON),
        'utf-8',
      );

      const report = applyOverlays({
        targetBase,
        scope: 'global',
        overlayDir,
        logger: () => {},
      });

      expect(report.overlaysApplied).toBe(1);
      expect(report.filesChanged).toBe(1);

      const claudeMdPath = join(targetBase, '.claude', 'CLAUDE.md');
      expect(existsSync(claudeMdPath)).toBe(true);
      const text = readFileSync(claudeMdPath, 'utf-8');
      expect(text).toContain('<!-- maestro:start section="overlay:custom-rules" -->');
      expect(text).toContain('Always use TypeScript strict mode.');
      expect(text).toContain('<!-- maestro:end section="overlay:custom-rules" -->');
    });

    it('re-apply produces byte-identical CLAUDE.md (idempotent)', () => {
      const targetBase = join(tmp, 'target');
      const overlayDir = join(tmp, 'overlays');
      mkdirSync(overlayDir, { recursive: true });
      writeFileSync(
        join(overlayDir, 'custom-rules.json'),
        JSON.stringify(CLAUDE_MD_OVERLAY_JSON),
        'utf-8',
      );
      const logger = () => {};
      applyOverlays({ targetBase, scope: 'global', overlayDir, logger });
      const after1 = readFileSync(join(targetBase, '.claude', 'CLAUDE.md'), 'utf-8');
      applyOverlays({ targetBase, scope: 'global', overlayDir, logger });
      const after2 = readFileSync(join(targetBase, '.claude', 'CLAUDE.md'), 'utf-8');
      expect(after2).toBe(after1);
    });

    it('records CLAUDE.md target in manifest', () => {
      const targetBase = join(tmp, 'target');
      const overlayDir = join(tmp, 'overlays');
      mkdirSync(overlayDir, { recursive: true });
      writeFileSync(
        join(overlayDir, 'custom-rules.json'),
        JSON.stringify(CLAUDE_MD_OVERLAY_JSON),
        'utf-8',
      );
      const report = applyOverlays({
        targetBase,
        scope: 'global',
        overlayDir,
        logger: () => {},
      });

      const entry = report.manifest.appliedOverlays.find(
        (o) => o.overlayName === 'custom-rules',
      );
      expect(entry).toBeDefined();
      expect(entry!.targets).toHaveLength(1);
      expect(entry!.targets[0].commandName).toBe('_claude-md');
      expect(entry!.targets[0].commandPath).toContain('CLAUDE.md');
      expect(entry!.targets[0].sectionsPatched).toEqual(['overlay:custom-rules']);
    });

    it('does not affect existing command-file overlay behavior', () => {
      const { targetBase, overlayDir } = setupScope(tmp, { 'test-cmd': BASE_CMD });
      // Both a regular overlay and a _claude-md overlay in the same dir
      writeFileSync(
        join(overlayDir, 'cli-verify.json'),
        JSON.stringify(OVERLAY_JSON),
        'utf-8',
      );
      writeFileSync(
        join(overlayDir, 'custom-rules.json'),
        JSON.stringify(CLAUDE_MD_OVERLAY_JSON),
        'utf-8',
      );

      const report = applyOverlays({
        targetBase,
        scope: 'global',
        overlayDir,
        logger: () => {},
      });

      expect(report.overlaysApplied).toBe(2);

      // Command file overlay works normally
      const cmdText = readFileSync(
        join(targetBase, '.claude', 'commands', 'test-cmd.md'),
        'utf-8',
      );
      expect(cmdText).toContain('<!-- maestro-overlay:cli-verify#0');
      expect(cmdText).toContain('INJECTED: run ccw cli');

      // CLAUDE.md overlay uses tag-injector markers
      const claudeText = readFileSync(
        join(targetBase, '.claude', 'CLAUDE.md'),
        'utf-8',
      );
      expect(claudeText).toContain('<!-- maestro:start section="overlay:custom-rules" -->');
      expect(claudeText).toContain('Always use TypeScript strict mode.');
    });

    it('appends to existing CLAUDE.md content', () => {
      const targetBase = join(tmp, 'target');
      const claudeDir = join(targetBase, '.claude');
      mkdirSync(claudeDir, { recursive: true });
      writeFileSync(join(claudeDir, 'CLAUDE.md'), '# Existing Content\n\nSome rules.\n', 'utf-8');

      const overlayDir = join(tmp, 'overlays');
      mkdirSync(overlayDir, { recursive: true });
      writeFileSync(
        join(overlayDir, 'custom-rules.json'),
        JSON.stringify(CLAUDE_MD_OVERLAY_JSON),
        'utf-8',
      );

      applyOverlays({
        targetBase,
        scope: 'global',
        overlayDir,
        logger: () => {},
      });

      const text = readFileSync(join(claudeDir, 'CLAUDE.md'), 'utf-8');
      expect(text).toContain('# Existing Content');
      expect(text).toContain('Some rules.');
      expect(text).toContain('<!-- maestro:start section="overlay:custom-rules" -->');
    });
  });

  describe('removeOverlayFromTargets', () => {
    it('strips markers and updates manifest', () => {
      const { targetBase, overlayDir } = setupScope(tmp, { 'test-cmd': BASE_CMD });
      writeFileSync(
        join(overlayDir, 'cli-verify.json'),
        JSON.stringify(OVERLAY_JSON),
        'utf-8',
      );
      applyOverlays({ targetBase, scope: 'global', overlayDir, logger: () => {} });

      const result = removeOverlayFromTargets('cli-verify', 'global', targetBase);
      expect(result.filesChanged).toBe(1);

      const text = readFileSync(
        join(targetBase, '.claude', 'commands', 'test-cmd.md'),
        'utf-8',
      );
      expect(text).not.toContain('maestro-overlay');
      expect(text).not.toContain('INJECTED');
      expect(text).toContain('base execution step');
    });

    it('removes _claude-md overlay section from CLAUDE.md', () => {
      const targetBase = join(tmp, 'target');
      const overlayDir = join(tmp, 'overlays');
      mkdirSync(overlayDir, { recursive: true });
      writeFileSync(
        join(overlayDir, 'custom-rules.json'),
        JSON.stringify(CLAUDE_MD_OVERLAY_JSON),
        'utf-8',
      );
      applyOverlays({ targetBase, scope: 'global', overlayDir, logger: () => {} });

      const claudeMdPath = join(targetBase, '.claude', 'CLAUDE.md');
      expect(readFileSync(claudeMdPath, 'utf-8')).toContain('overlay:custom-rules');

      const result = removeOverlayFromTargets('custom-rules', 'global', targetBase);
      expect(result.filesChanged).toBe(1);

      const text = readFileSync(claudeMdPath, 'utf-8');
      expect(text).not.toContain('overlay:custom-rules');
      expect(text).not.toContain('Always use TypeScript strict mode.');
    });

    it('removing one overlay does not affect other CLAUDE.md sections', () => {
      const targetBase = join(tmp, 'target');
      const claudeDir = join(targetBase, '.claude');
      mkdirSync(claudeDir, { recursive: true });
      // Pre-populate with core section
      writeFileSync(
        join(claudeDir, 'CLAUDE.md'),
        '<!-- maestro:start section="core" -->\n# Core Instructions\n<!-- maestro:end section="core" -->\n',
        'utf-8',
      );

      const overlayDir = join(tmp, 'overlays');
      mkdirSync(overlayDir, { recursive: true });
      // Two _claude-md overlays
      writeFileSync(
        join(overlayDir, 'custom-rules.json'),
        JSON.stringify(CLAUDE_MD_OVERLAY_JSON),
        'utf-8',
      );
      writeFileSync(
        join(overlayDir, 'other-rules.json'),
        JSON.stringify({
          name: 'other-rules',
          description: 'Other overlay',
          targets: ['_claude-md'],
          priority: 10,
          enabled: true,
          patches: [{ section: 'other', mode: 'replace', content: 'Other content here.' }],
        }),
        'utf-8',
      );
      applyOverlays({ targetBase, scope: 'global', overlayDir, logger: () => {} });

      // Remove only custom-rules
      removeOverlayFromTargets('custom-rules', 'global', targetBase);

      const text = readFileSync(join(claudeDir, 'CLAUDE.md'), 'utf-8');
      // custom-rules section gone
      expect(text).not.toContain('overlay:custom-rules');
      expect(text).not.toContain('Always use TypeScript strict mode.');
      // core and other-rules sections preserved
      expect(text).toContain('<!-- maestro:start section="core" -->');
      expect(text).toContain('# Core Instructions');
      expect(text).toContain('<!-- maestro:start section="overlay:other-rules" -->');
      expect(text).toContain('Other content here.');
    });
  });

  describe('priority sorting', () => {
    it('high-priority overlay section appears before low-priority in CLAUDE.md', () => {
      const targetBase = join(tmp, 'target');
      const overlayDir = join(tmp, 'overlays');
      mkdirSync(overlayDir, { recursive: true });

      writeFileSync(
        join(overlayDir, 'low-prio.json'),
        JSON.stringify({
          name: 'low-prio',
          description: 'Low priority overlay',
          targets: ['_claude-md'],
          priority: 10,
          enabled: true,
          patches: [{ section: 'low', mode: 'replace', content: 'LOW_PRIORITY_CONTENT' }],
        }),
        'utf-8',
      );
      writeFileSync(
        join(overlayDir, 'high-prio.json'),
        JSON.stringify({
          name: 'high-prio',
          description: 'High priority overlay',
          targets: ['_claude-md'],
          priority: 100,
          enabled: true,
          patches: [{ section: 'high', mode: 'replace', content: 'HIGH_PRIORITY_CONTENT' }],
        }),
        'utf-8',
      );

      applyOverlays({ targetBase, scope: 'global', overlayDir, logger: () => {} });

      const text = readFileSync(join(targetBase, '.claude', 'CLAUDE.md'), 'utf-8');
      const highIdx = text.indexOf('HIGH_PRIORITY_CONTENT');
      const lowIdx = text.indexOf('LOW_PRIORITY_CONTENT');
      expect(highIdx).toBeGreaterThan(-1);
      expect(lowIdx).toBeGreaterThan(-1);
      expect(highIdx).toBeLessThan(lowIdx);
    });

    it('overlays without priority default to 0 and appear after prioritized ones', () => {
      const targetBase = join(tmp, 'target');
      const overlayDir = join(tmp, 'overlays');
      mkdirSync(overlayDir, { recursive: true });

      writeFileSync(
        join(overlayDir, 'no-prio.json'),
        JSON.stringify({
          name: 'no-prio',
          description: 'No priority field',
          targets: ['_claude-md'],
          enabled: true,
          patches: [{ section: 'default', mode: 'replace', content: 'NO_PRIORITY_CONTENT' }],
        }),
        'utf-8',
      );
      writeFileSync(
        join(overlayDir, 'has-prio.json'),
        JSON.stringify({
          name: 'has-prio',
          description: 'Has priority',
          targets: ['_claude-md'],
          priority: 50,
          enabled: true,
          patches: [{ section: 'prio', mode: 'replace', content: 'HAS_PRIORITY_CONTENT' }],
        }),
        'utf-8',
      );

      applyOverlays({ targetBase, scope: 'global', overlayDir, logger: () => {} });

      const text = readFileSync(join(targetBase, '.claude', 'CLAUDE.md'), 'utf-8');
      const prioIdx = text.indexOf('HAS_PRIORITY_CONTENT');
      const noPrioIdx = text.indexOf('NO_PRIORITY_CONTENT');
      expect(prioIdx).toBeGreaterThan(-1);
      expect(noPrioIdx).toBeGreaterThan(-1);
      expect(prioIdx).toBeLessThan(noPrioIdx);
    });
  });

  // -------------------------------------------------------------------------
  // Export / Import
  // -------------------------------------------------------------------------

  describe('exportOverlayFile', () => {
    it('exports to an explicit file path', () => {
      const overlayDir = join(tmp, 'overlays');
      mkdirSync(overlayDir, { recursive: true });
      const src = join(overlayDir, 'cli-verify.json');
      writeFileSync(src, JSON.stringify(OVERLAY_JSON), 'utf-8');

      const out = join(tmp, 'exports', 'my-overlay.json');
      const result = exportOverlayFile(overlayDir, 'cli-verify', out);

      expect(result.dest).toBe(out);
      expect(result.overlayName).toBe('cli-verify');
      expect(existsSync(out)).toBe(true);

      const roundTrip = JSON.parse(readFileSync(out, 'utf-8'));
      expect(roundTrip.name).toBe('cli-verify');
      expect(roundTrip.patches[0].content).toBe(OVERLAY_JSON.patches[0].content);
    });

    it('exports to a directory — uses <name>.json', () => {
      const overlayDir = join(tmp, 'overlays');
      mkdirSync(overlayDir, { recursive: true });
      writeFileSync(
        join(overlayDir, 'disk-name.json'),
        JSON.stringify(OVERLAY_JSON),
        'utf-8',
      );

      const exportDir = join(tmp, 'exports');
      mkdirSync(exportDir, { recursive: true });
      const result = exportOverlayFile(overlayDir, 'cli-verify', exportDir);

      // The overlay's declared name (not the source filename) drives output
      expect(result.dest).toBe(join(exportDir, 'cli-verify.json'));
      expect(existsSync(result.dest)).toBe(true);
    });

    it('throws when the overlay name is not found', () => {
      const overlayDir = join(tmp, 'overlays');
      mkdirSync(overlayDir, { recursive: true });
      expect(() =>
        exportOverlayFile(overlayDir, 'ghost', join(tmp, 'out.json')),
      ).toThrow(/not found/i);
    });

    it('skips underscore-prefixed files during lookup', () => {
      const overlayDir = join(tmp, 'overlays');
      mkdirSync(overlayDir, { recursive: true });
      // _shipped file has the target name but must be invisible to export
      writeFileSync(
        join(overlayDir, '_shipped.json'),
        JSON.stringify(OVERLAY_JSON),
        'utf-8',
      );
      expect(() =>
        exportOverlayFile(overlayDir, 'cli-verify', join(tmp, 'out.json')),
      ).toThrow(/not found/i);
    });
  });

  describe('importOverlayFile', () => {
    it('validates and copies into overlayDir using the declared name', () => {
      const overlayDir = join(tmp, 'overlays');
      const src = join(tmp, 'inbox', 'arbitrary-filename.json');
      mkdirSync(join(tmp, 'inbox'), { recursive: true });
      writeFileSync(src, JSON.stringify(OVERLAY_JSON), 'utf-8');

      const result = importOverlayFile(src, overlayDir);
      // Destination uses the overlay's declared name, not the source filename
      expect(result.dest).toBe(join(overlayDir, 'cli-verify.json'));
      expect(result.overlayName).toBe('cli-verify');
      expect(result.overwritten).toBe(false);
      expect(existsSync(result.dest)).toBe(true);
    });

    it('rejects an invalid overlay file without copying', () => {
      const overlayDir = join(tmp, 'overlays');
      const src = join(tmp, 'inbox.json');
      writeFileSync(src, JSON.stringify({ name: 'x' }), 'utf-8'); // missing fields

      expect(() => importOverlayFile(src, overlayDir)).toThrow();
      // Nothing written to overlayDir
      const contents = existsSync(overlayDir) ? readdirSync(overlayDir) : [];
      expect(contents.filter((f) => f.endsWith('.json'))).toHaveLength(0);
    });

    it('sets overwritten=true when replacing an existing overlay', () => {
      const overlayDir = join(tmp, 'overlays');
      mkdirSync(overlayDir, { recursive: true });
      // Pre-seed with a different version
      writeFileSync(
        join(overlayDir, 'cli-verify.json'),
        JSON.stringify({
          ...OVERLAY_JSON,
          patches: [{ section: 'execution', mode: 'append', content: 'OLD' }],
        }),
        'utf-8',
      );
      const src = join(tmp, 'new.json');
      writeFileSync(src, JSON.stringify(OVERLAY_JSON), 'utf-8');

      const result = importOverlayFile(src, overlayDir);
      expect(result.overwritten).toBe(true);
      const body = JSON.parse(readFileSync(result.dest, 'utf-8'));
      expect(body.patches[0].content).toBe(OVERLAY_JSON.patches[0].content);
    });

    it('throws on missing source file', () => {
      expect(() =>
        importOverlayFile(join(tmp, 'nope.json'), join(tmp, 'overlays')),
      ).toThrow(/not found/i);
    });
  });

  describe('export → import round-trip', () => {
    it('apply → export → remove → import → apply yields same markers', () => {
      const { targetBase, overlayDir } = setupScope(tmp, { 'test-cmd': BASE_CMD });
      writeFileSync(
        join(overlayDir, 'cli-verify.json'),
        JSON.stringify(OVERLAY_JSON),
        'utf-8',
      );
      const logger = () => {};

      // 1. Apply
      applyOverlays({ targetBase, scope: 'global', overlayDir, logger });
      const firstText = readFileSync(
        join(targetBase, '.claude', 'commands', 'test-cmd.md'),
        'utf-8',
      );
      expect(firstText).toContain('<!-- maestro-overlay:cli-verify#0');

      // 2. Export
      const exportPath = join(tmp, 'bundle.json');
      exportOverlayFile(overlayDir, 'cli-verify', exportPath);

      // 3. Remove: strip markers + delete source file
      removeOverlayFromTargets('cli-verify', 'global', targetBase);
      rmSync(join(overlayDir, 'cli-verify.json'));
      const strippedText = readFileSync(
        join(targetBase, '.claude', 'commands', 'test-cmd.md'),
        'utf-8',
      );
      expect(strippedText).not.toContain('maestro-overlay');

      // 4. Import the bundle back
      const importResult = importOverlayFile(exportPath, overlayDir);
      expect(importResult.overlayName).toBe('cli-verify');

      // 5. Re-apply → text should match the first applied state
      applyOverlays({ targetBase, scope: 'global', overlayDir, logger });
      const secondText = readFileSync(
        join(targetBase, '.claude', 'commands', 'test-cmd.md'),
        'utf-8',
      );
      expect(secondText).toBe(firstText);
    });
  });
});
