import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import ignore, { type Ignore } from 'ignore';

export const MAESTRO_IGNORE_FILE = '.maestroignore';

const DEFAULT_IGNORE_PATTERNS = [
  'node_modules/',
  '.git/',
  'dist/',
  'build/',
  'out/',
  '.next/',
  '.nuxt/',
  '.svelte-kit/',
  '.turbo/',
  '.vite/',
  '__pycache__/',
  '.venv/',
  'venv/',
  '.pytest_cache/',
  '.ruff_cache/',
  'target/',
  '.gradle/',
  'vendor/',
  'coverage/',
  '.cache/',
  '.workflow/',
  '.codegraph/',
];

const DEFAULT_MAESTROIGNORE = `# MaestroGraph code index ignore rules.
# Uses gitignore syntax and is merged after .gitignore.

.workflow/
.codegraph/
node_modules/
dist/
build/
coverage/
.cache/
`;

export interface ScanScopeOptions {
  projectRoot: string;
  srcDir: string;
  excludeDirs?: string[];
  excludeFiles?: string[];
  createMaestroIgnore?: boolean;
}

export interface ScanScope {
  projectRoot: string;
  srcDir: string;
  ignores(absPath: string, isDirectory?: boolean): boolean;
}

function readIgnoreFile(path: string): string {
  if (!existsSync(path)) return '';
  try {
    return readFileSync(path, 'utf-8');
  } catch {
    return '';
  }
}

function ensureMaestroIgnore(projectRoot: string): void {
  const path = join(projectRoot, MAESTRO_IGNORE_FILE);
  if (existsSync(path)) return;
  writeFileSync(path, DEFAULT_MAESTROIGNORE, 'utf-8');
}

function normalizePattern(pattern: string, dirOnly = false): string {
  const trimmed = pattern.trim();
  if (!trimmed) return trimmed;
  const normalized = trimmed.replace(/\\/g, '/');
  if (!dirOnly) return normalized;
  return normalized.endsWith('/') ? normalized : `${normalized}/`;
}

export function buildScanScope(options: ScanScopeOptions): ScanScope {
  const projectRoot = resolve(options.projectRoot);
  const srcDir = resolve(options.srcDir);

  if (options.createMaestroIgnore !== false) {
    ensureMaestroIgnore(projectRoot);
  }

  const matcher: Ignore = ignore()
    .add(DEFAULT_IGNORE_PATTERNS)
    .add(readIgnoreFile(join(projectRoot, '.gitignore')))
    .add(readIgnoreFile(join(projectRoot, MAESTRO_IGNORE_FILE)));

  if (options.excludeDirs) {
    matcher.add(options.excludeDirs.map(pattern => normalizePattern(pattern, true)).filter(Boolean));
  }
  if (options.excludeFiles) {
    matcher.add(options.excludeFiles.map(pattern => normalizePattern(pattern)).filter(Boolean));
  }

  return {
    projectRoot,
    srcDir,
    ignores(absPath: string, isDirectory = false): boolean {
      const rel = relative(projectRoot, absPath).replace(/\\/g, '/');
      if (!rel || rel === '.' || rel === '..' || rel.startsWith('../') || isAbsolute(rel)) return false;
      const candidate = isDirectory && !rel.endsWith('/') ? `${rel}/` : rel;
      return matcher.ignores(candidate);
    },
  };
}
