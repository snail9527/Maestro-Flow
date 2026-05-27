/**
 * Spec Init
 *
 * Initialize .workflow/specs/ directory with frontmatter-enabled seed documents.
 * Idempotent: creates missing files, and migrates existing files that lack a
 * YAML frontmatter block by prepending the seed's frontmatter (body preserved).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type SpecScope, resolveSpecDir } from './spec-loader.js';
import {
  SPEC_SEED_DOCS,
  formatSeedFrontmatter,
  hasFrontmatter,
  renderSeedContent,
  findSeedByFilename,
  type SpecSeedDoc,
} from './spec-seeds.js';

// ============================================================================
// Types
// ============================================================================

export interface InitResult {
  created: string[];
  migrated: string[];
  skipped: string[];
  directories: string[];
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Initialize the spec system directory structure and seed documents.
 * - Creates the specs directory if missing.
 * - Writes seed files that don't exist.
 * - Migrates existing seed files that lack a YAML frontmatter block by
 *   prepending the canonical frontmatter (body content untouched).
 *
 * @param scope  Target scope: 'project' (default), 'global', 'team', or 'personal'.
 * @param uid    Required when scope is 'personal'.
 */
export function initSpecSystem(projectPath: string, scope: SpecScope = 'project', uid?: string): InitResult {
  const result: InitResult = { created: [], migrated: [], skipped: [], directories: [] };

  const specsDir = resolveSpecDir(projectPath, scope, uid);

  if (!existsSync(specsDir)) {
    mkdirSync(specsDir, { recursive: true });
    result.directories.push(specsDir);
  }

  for (const doc of SPEC_SEED_DOCS) {
    const filePath = join(specsDir, doc.filename);

    if (existsSync(filePath)) {
      if (migrateMissingFrontmatter(filePath, doc)) {
        result.migrated.push(filePath);
      } else {
        result.skipped.push(filePath);
      }
      continue;
    }

    writeFileSync(filePath, renderSeedContent(doc), 'utf-8');
    result.created.push(filePath);
  }

  return result;
}

/**
 * Ensure a single spec file exists in `specsDir` with the correct YAML
 * frontmatter + body for its filename. No-op if the file already exists
 * with a frontmatter block. If it exists without one, prepends frontmatter.
 *
 * Returns true when the file was created or migrated, false when it was
 * already in good shape or the filename has no registered seed.
 */
export function ensureSpecFile(specsDir: string, filename: string): boolean {
  const doc = findSeedByFilename(filename);
  if (!doc) return false;

  if (!existsSync(specsDir)) {
    mkdirSync(specsDir, { recursive: true });
  }

  const filePath = join(specsDir, filename);
  if (!existsSync(filePath)) {
    writeFileSync(filePath, renderSeedContent(doc), 'utf-8');
    return true;
  }

  return migrateMissingFrontmatter(filePath, doc);
}

// ============================================================================
// Internal
// ============================================================================

/**
 * If the file at `filePath` lacks a YAML frontmatter block, prepend the
 * canonical frontmatter for the matching seed doc. Body content is preserved.
 *
 * Returns true when content was rewritten; false when no change was needed.
 */
function migrateMissingFrontmatter(filePath: string, doc: SpecSeedDoc): boolean {
  const raw = readFileSync(filePath, 'utf-8');
  if (hasFrontmatter(raw)) return false;

  const fm = formatSeedFrontmatter(doc.frontmatter);
  // Keep the existing body verbatim, just prepend frontmatter + blank line.
  const merged = `${fm}\n\n${raw.replace(/^\s+/, '')}`;
  writeFileSync(filePath, merged, 'utf-8');
  return true;
}
