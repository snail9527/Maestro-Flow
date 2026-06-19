import { describe, expect, it } from 'vitest';
import { mkdtempSync, existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildScanScope } from '../extraction/code/scan-scope.js';

describe('MaestroGraph scan scope', () => {
  it('merges .gitignore and .maestroignore rules', () => {
    const root = mkdtempSync(join(tmpdir(), 'maestro-scope-'));
    try {
      mkdirSync(join(root, 'src'), { recursive: true });
      writeFileSync(join(root, '.gitignore'), 'ignored-by-git/\n');
      writeFileSync(join(root, '.maestroignore'), 'ignored-by-maestro/\n*.gen.ts\n');

      const scope = buildScanScope({ projectRoot: root, srcDir: join(root, 'src'), createMaestroIgnore: false });

      expect(scope.ignores(join(root, 'ignored-by-git'), true)).toBe(true);
      expect(scope.ignores(join(root, 'ignored-by-maestro'), true)).toBe(true);
      expect(scope.ignores(join(root, 'src', 'model.gen.ts'))).toBe(true);
      expect(scope.ignores(join(root, 'src', 'model.ts'))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('creates .maestroignore when missing', () => {
    const root = mkdtempSync(join(tmpdir(), 'maestro-scope-'));
    try {
      buildScanScope({ projectRoot: root, srcDir: root });
      expect(existsSync(join(root, '.maestroignore'))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
