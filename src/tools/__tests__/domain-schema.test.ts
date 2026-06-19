import { describe, it, expect } from 'vitest';
import { validateGlossary, validateRelationships } from '../domain-schema.js';

describe('validateGlossary', () => {
  const validTerm = {
    id: 'tenant',
    canonical: 'Tenant',
    aliases: ['租户'],
    definition: 'Multi-tenant isolation unit',
    relationships: [],
    keywords: [],
    source: { kind: 'manual', registered_at: '2026-06-15T00:00:00Z' },
  };

  it('accepts valid glossary with no errors', () => {
    const data = { $schema: 'domain/1.0', terms: [validTerm] };
    expect(validateGlossary(data)).toEqual([]);
  });

  it('rejects non-object input', () => {
    expect(validateGlossary(null)).toHaveLength(1);
    expect(validateGlossary('string')).toHaveLength(1);
  });

  it('rejects missing terms array', () => {
    expect(validateGlossary({ $schema: 'domain/1.0' })).toHaveLength(1);
  });

  it('accepts empty terms array', () => {
    expect(validateGlossary({ terms: [] })).toEqual([]);
  });

  it('rejects non-kebab-case id', () => {
    const data = { terms: [{ ...validTerm, id: 'MyTenant' }] };
    const errors = validateGlossary(data);
    expect(errors.some(e => e.path.includes('.id') && e.message.includes('kebab'))).toBe(true);
  });

  it('rejects duplicate ids', () => {
    const data = { terms: [validTerm, { ...validTerm }] };
    const errors = validateGlossary(data);
    expect(errors.some(e => e.message.includes('duplicate'))).toBe(true);
  });

  it('rejects empty canonical', () => {
    const data = { terms: [{ ...validTerm, canonical: '' }] };
    const errors = validateGlossary(data);
    expect(errors.some(e => e.path.includes('.canonical'))).toBe(true);
  });

  it('rejects missing definition', () => {
    const data = { terms: [{ ...validTerm, definition: '' }] };
    const errors = validateGlossary(data);
    expect(errors.some(e => e.path.includes('.definition'))).toBe(true);
  });

  it('rejects definition exceeding 200 chars', () => {
    const data = { terms: [{ ...validTerm, definition: 'x'.repeat(201) }] };
    const errors = validateGlossary(data);
    expect(errors.some(e => e.message.includes('200'))).toBe(true);
  });

  it('allows dangling relationship references (warnings not errors)', () => {
    const data = { terms: [{ ...validTerm, relationships: ['nonexistent'] }] };
    const errors = validateGlossary(data);
    expect(errors).toEqual([]);
  });

  it('accepts valid relationship references', () => {
    const workspace = { ...validTerm, id: 'workspace', canonical: 'Workspace' };
    const tenant = { ...validTerm, relationships: ['workspace'] };
    const data = { terms: [tenant, workspace] };
    expect(validateGlossary(data)).toEqual([]);
  });

  it('validates tier field when present', () => {
    const data = { terms: [{ ...validTerm, tier: 'invalid' }] };
    const errors = validateGlossary(data);
    expect(errors.some(e => e.path.includes('.tier'))).toBe(true);
  });

  it('accepts valid tier values', () => {
    for (const tier of ['core', 'extended', 'peripheral']) {
      const data = { terms: [{ ...validTerm, tier }] };
      expect(validateGlossary(data)).toEqual([]);
    }
  });

  it('validates status field when present', () => {
    const data = { terms: [{ ...validTerm, status: 'removed' }] };
    const errors = validateGlossary(data);
    expect(errors.some(e => e.path.includes('.status'))).toBe(true);
  });
});

describe('validateRelationships', () => {
  it('returns no warnings for acyclic graph', () => {
    const terms = [
      { id: 'a', relationships: ['b'] },
      { id: 'b', relationships: ['c'] },
      { id: 'c', relationships: [] },
    ];
    expect(validateRelationships(terms)).toEqual([]);
  });

  it('detects bidirectional references (A↔B) as cycles', () => {
    const terms = [
      { id: 'a', relationships: ['b'] },
      { id: 'b', relationships: ['a'] },
    ];
    const warnings = validateRelationships(terms);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.every(w => w.kind === 'cycle')).toBe(true);
  });

  it('detects self-referencing relationships', () => {
    const terms = [
      { id: 'a', relationships: ['a'] },
    ];
    const warnings = validateRelationships(terms);
    expect(warnings.length).toBe(1);
    expect(warnings[0].message).toContain('self-referencing');
  });

  it('detects cycles at depth 3+ (A→B→C→A)', () => {
    const terms = [
      { id: 'a', relationships: ['b'] },
      { id: 'b', relationships: ['c'] },
      { id: 'c', relationships: ['a'] },
    ];
    const warnings = validateRelationships(terms);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.some(w => w.kind === 'cycle')).toBe(true);
  });

  it('handles terms with no relationships', () => {
    const terms = [
      { id: 'a' },
      { id: 'b' },
    ];
    expect(validateRelationships(terms)).toEqual([]);
  });
});
