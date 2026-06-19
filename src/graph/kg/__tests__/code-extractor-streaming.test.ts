import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { extractCode, forEachCodeExtractionResult } from '../extraction/code/code-extractor.js';
import type { ExtractionResult } from '../db/types.js';

describe('MaestroGraph code extractor streaming', () => {
  it('emits each extraction result without breaking extractCode compatibility', async () => {
    const root = mkdtempSync(join(tmpdir(), 'maestro-code-stream-'));
    try {
      const srcDir = join(root, 'src');
      mkdirSync(srcDir, { recursive: true });
      writeFileSync(join(root, '.maestroignore'), '');
      writeFileSync(join(srcDir, 'app.yml'), 'service:\n  name: demo\n');

      const streamed: ExtractionResult[] = [];
      const stats = await forEachCodeExtractionResult({
        projectRoot: root,
        srcDir,
        createMaestroIgnore: false,
      }, (result) => {
        streamed.push(result);
      });

      expect(streamed).toHaveLength(1);
      expect(stats.filesScanned).toBe(1);
      expect(stats.filesExtracted).toBe(1);
      expect(stats.nodesCreated).toBe(1);
      expect(stats.edgesCreated).toBe(0);
      expect(streamed[0].fileRecord.nodeCount).toBe(1);

      const collected = await extractCode({
        projectRoot: root,
        srcDir,
        createMaestroIgnore: false,
      });

      expect(collected.results).toHaveLength(1);
      expect(collected.stats.nodesCreated).toBe(stats.nodesCreated);
      expect(collected.results[0].nodes[0].kind).toBe('file');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
