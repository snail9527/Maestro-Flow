import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  initDomain,
  addTerm,
  readGlossary,
  readGlossaryCached,
  updateTerm,
  removeTerm,
  deprecateTerm,
  loadGlossary,
  validateGlossaryFile,
  type DomainTerm,
} from '../domain-loader.js';

let workflowRoot: string;

function makeTerm(overrides: Partial<DomainTerm> = {}): DomainTerm {
  return {
    id: 'test-term',
    canonical: 'TestTerm',
    aliases: ['test'],
    definition: 'A test domain term',
    relationships: [],
    keywords: ['testing'],
    tier: 'core',
    status: 'active',
    source: { kind: 'manual', registered_at: '2026-06-15T00:00:00Z' },
    ...overrides,
  };
}

beforeEach(() => {
  workflowRoot = mkdtempSync(join(tmpdir(), 'maestro-domain-test-'));
});

afterEach(() => {
  if (workflowRoot && existsSync(workflowRoot)) {
    rmSync(workflowRoot, { recursive: true, force: true });
  }
});

describe('initDomain', () => {
  it('creates glossary.json and concepts/ directory', () => {
    const path = initDomain(workflowRoot);
    expect(existsSync(path)).toBe(true);
    expect(existsSync(join(workflowRoot, 'domain', 'concepts'))).toBe(true);
    const glossary = JSON.parse(readFileSync(path, 'utf-8'));
    expect(glossary.$schema).toBe('domain/1.0');
    expect(glossary.terms).toEqual([]);
  });

  it('sets project name when provided', () => {
    const path = initDomain(workflowRoot, 'my-project');
    const glossary = JSON.parse(readFileSync(path, 'utf-8'));
    expect(glossary.project).toBe('my-project');
  });

  it('does not overwrite existing glossary', () => {
    initDomain(workflowRoot);
    addTerm(workflowRoot, makeTerm());
    initDomain(workflowRoot);
    const glossary = readGlossary(workflowRoot);
    expect(glossary.terms).toHaveLength(1);
  });
});

describe('addTerm', () => {
  it('adds a term to glossary', () => {
    initDomain(workflowRoot);
    addTerm(workflowRoot, makeTerm());
    const glossary = readGlossary(workflowRoot);
    expect(glossary.terms).toHaveLength(1);
    expect(glossary.terms[0].id).toBe('test-term');
  });

  it('throws on duplicate id', () => {
    initDomain(workflowRoot);
    addTerm(workflowRoot, makeTerm());
    expect(() => addTerm(workflowRoot, makeTerm())).toThrow('already exists');
  });

  it('creates backup on write', () => {
    initDomain(workflowRoot);
    addTerm(workflowRoot, makeTerm());
    // Second write triggers backup of the first version
    addTerm(workflowRoot, makeTerm({ id: 'second-term', canonical: 'Second' }));
    const backupDir = join(workflowRoot, 'domain', '.backups');
    expect(existsSync(backupDir)).toBe(true);
    const glossary = readGlossary(workflowRoot);
    expect(glossary.terms).toHaveLength(2);
  });
});

describe('readGlossary', () => {
  it('returns empty glossary when file does not exist', () => {
    const glossary = readGlossary(workflowRoot);
    expect(glossary.terms).toEqual([]);
  });

  it('reads and validates glossary', () => {
    initDomain(workflowRoot);
    addTerm(workflowRoot, makeTerm());
    const glossary = readGlossary(workflowRoot);
    expect(glossary.terms[0].canonical).toBe('TestTerm');
  });
});

describe('readGlossaryCached', () => {
  it('returns cached data on second read (same mtime)', () => {
    initDomain(workflowRoot);
    addTerm(workflowRoot, makeTerm());
    const first = readGlossaryCached(workflowRoot);
    const second = readGlossaryCached(workflowRoot);
    expect(first).toBe(second); // Same reference (cached)
  });
});

describe('updateTerm', () => {
  it('updates term fields', () => {
    initDomain(workflowRoot);
    addTerm(workflowRoot, makeTerm());
    updateTerm(workflowRoot, 'test-term', { definition: 'Updated definition' });
    const glossary = readGlossary(workflowRoot);
    expect(glossary.terms[0].definition).toBe('Updated definition');
  });

  it('throws when term not found', () => {
    initDomain(workflowRoot);
    expect(() => updateTerm(workflowRoot, 'nonexistent', {})).toThrow('not found');
  });
});

describe('removeTerm', () => {
  it('removes term from glossary', () => {
    initDomain(workflowRoot);
    addTerm(workflowRoot, makeTerm());
    removeTerm(workflowRoot, 'test-term');
    const glossary = readGlossary(workflowRoot);
    expect(glossary.terms).toHaveLength(0);
  });

  it('throws when term not found', () => {
    initDomain(workflowRoot);
    expect(() => removeTerm(workflowRoot, 'nonexistent')).toThrow('not found');
  });

  it('warns about relationship references', () => {
    initDomain(workflowRoot);
    addTerm(workflowRoot, makeTerm({ id: 'parent', canonical: 'Parent' }));
    addTerm(workflowRoot, makeTerm({ id: 'child', canonical: 'Child', relationships: ['parent'] }));
    const { warnings } = removeTerm(workflowRoot, 'parent');
    expect(warnings.some(w => w.includes('child'))).toBe(true);
  });
});

describe('deprecateTerm', () => {
  it('sets status to deprecated with info', () => {
    initDomain(workflowRoot);
    addTerm(workflowRoot, makeTerm());
    deprecateTerm(workflowRoot, 'test-term', 'Replaced by new-term', 'new-term');
    const glossary = readGlossary(workflowRoot);
    expect(glossary.terms[0].status).toBe('deprecated');
    expect(glossary.terms[0].deprecated_info?.reason).toBe('Replaced by new-term');
    expect(glossary.terms[0].deprecated_info?.successor_id).toBe('new-term');
  });
});

describe('loadGlossary', () => {
  it('returns exists=false when domain dir does not exist', () => {
    const tmpProject = mkdtempSync(join(tmpdir(), 'maestro-load-test-'));
    mkdirSync(join(tmpProject, '.workflow'), { recursive: true });
    const result = loadGlossary(tmpProject);
    expect(result.exists).toBe(false);
    expect(result.activeTerms).toEqual([]);
    rmSync(tmpProject, { recursive: true, force: true });
  });

  it('returns isEmpty=true for empty glossary', () => {
    const tmpProject = mkdtempSync(join(tmpdir(), 'maestro-load-test-'));
    const wRoot = join(tmpProject, '.workflow');
    initDomain(wRoot);
    const result = loadGlossary(tmpProject);
    expect(result.exists).toBe(true);
    expect(result.isEmpty).toBe(true);
    expect(result.activeTerms).toEqual([]);
    rmSync(tmpProject, { recursive: true, force: true });
  });

  it('filters active terms only', () => {
    const tmpProject = mkdtempSync(join(tmpdir(), 'maestro-load-test-'));
    const wRoot = join(tmpProject, '.workflow');
    initDomain(wRoot);
    addTerm(wRoot, makeTerm({ id: 'active-one', canonical: 'Active' }));
    addTerm(wRoot, makeTerm({ id: 'deprecated-one', canonical: 'Deprecated', status: 'deprecated',
      deprecated_info: { reason: 'old', deprecated_at: '2026-01-01T00:00:00Z' } }));
    const result = loadGlossary(tmpProject);
    expect(result.activeTerms).toHaveLength(1);
    expect(result.activeTerms[0].id).toBe('active-one');
    rmSync(tmpProject, { recursive: true, force: true });
  });
});

describe('validateGlossaryFile', () => {
  it('returns no errors for valid glossary', () => {
    initDomain(workflowRoot);
    addTerm(workflowRoot, makeTerm());
    const { errors, warnings } = validateGlossaryFile(workflowRoot);
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });
});
