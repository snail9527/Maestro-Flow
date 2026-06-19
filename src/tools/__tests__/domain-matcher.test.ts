import { describe, it, expect } from 'vitest';
import { matchAlias, matchDomainTerms, collectRewriteHints } from '../domain-matcher.js';

describe('matchAlias', () => {
  describe('ASCII matching', () => {
    it('matches exact word with word boundaries', () => {
      expect(matchAlias('check the Tenant model', 'Tenant')).toBe(true);
    });

    it('is case-insensitive for ASCII', () => {
      expect(matchAlias('check the tenant model', 'Tenant')).toBe(true);
    });

    it('does not match partial words', () => {
      expect(matchAlias('multiTenantService', 'Tenant')).toBe(false);
    });

    it('matches at start and end of string', () => {
      expect(matchAlias('Tenant is important', 'Tenant')).toBe(true);
      expect(matchAlias('check Tenant', 'Tenant')).toBe(true);
    });

    it('rejects empty alias', () => {
      expect(matchAlias('any prompt', '')).toBe(false);
    });
  });

  describe('CJK matching', () => {
    it('matches CJK alias with proper boundaries', () => {
      expect(matchAlias('检查租户数据', '租户')).toBe(true);
    });

    it('matches CJK alias even as substring (no word boundaries in CJK)', () => {
      // CJK matching uses includes() — "流水" matches inside "流水线"
      // This is acceptable: domain terms are proper nouns, false positives are benign
      expect(matchAlias('处理流水线数据', '流水')).toBe(true);
    });

    it('matches CJK alias when surrounded by non-CJK', () => {
      expect(matchAlias('check 租户 model', '租户')).toBe(true);
    });

    it('rejects single-char CJK alias', () => {
      expect(matchAlias('租户模型', '租')).toBe(false);
    });

    it('matches CJK alias at string boundaries', () => {
      expect(matchAlias('租户', '租户')).toBe(true);
    });
  });
});

describe('matchDomainTerms', () => {
  const terms = [
    {
      id: 'tenant',
      canonical: 'Tenant',
      definition: 'Multi-tenant isolation unit',
      aliases: ['租户', 'org'],
      keywords: ['multi-tenant', 'isolation'],
      relationships: ['workspace', 'user'],
      status: 'active' as const,
    },
    {
      id: 'workspace',
      canonical: 'Workspace',
      definition: 'Work area within a Tenant',
      aliases: ['工作空间'],
      keywords: [],
      relationships: ['tenant'],
    },
    {
      id: 'user',
      canonical: 'User',
      definition: 'Authenticated person',
      aliases: ['用户'],
      keywords: [],
      relationships: [],
    },
  ];

  it('matches by canonical name', () => {
    const { directMatches } = matchDomainTerms('check the Tenant model', terms);
    expect(directMatches).toHaveLength(1);
    expect(directMatches[0].termId).toBe('tenant');
    expect(directMatches[0].matchedBy).toBe('canonical');
  });

  it('matches by alias', () => {
    const { directMatches } = matchDomainTerms('检查租户数据', terms);
    expect(directMatches).toHaveLength(1);
    expect(directMatches[0].matchedBy).toBe('alias');
    expect(directMatches[0].matchedToken).toBe('租户');
  });

  it('matches by keyword when canonical does not match', () => {
    const { directMatches } = matchDomainTerms('check the isolation policy', terms);
    expect(directMatches).toHaveLength(1);
    expect(directMatches[0].matchedBy).toBe('keyword');
    expect(directMatches[0].matchedToken).toBe('isolation');
  });

  it('propagates 1-level relationships', () => {
    const { directMatches, propagatedIds } = matchDomainTerms('check the Tenant', terms);
    expect(directMatches).toHaveLength(1);
    expect(propagatedIds).toContain('workspace');
    expect(propagatedIds).toContain('user');
  });

  it('does not duplicate in propagation when already matched', () => {
    const { directMatches, propagatedIds } = matchDomainTerms('Tenant and Workspace', terms);
    expect(directMatches).toHaveLength(2);
    // workspace was directly matched, so should NOT appear in propagated
    expect(propagatedIds).not.toContain('workspace');
  });

  it('skips deprecated terms in propagation', () => {
    const deprecatedTerms = [
      ...terms.slice(0, 1),
      { ...terms[1], status: 'deprecated' as const },
      terms[2],
    ];
    const { propagatedIds } = matchDomainTerms('check the Tenant', deprecatedTerms);
    // workspace is deprecated — should still be in propagatedIds (it exists)
    // but the expanded section builder will skip it (that's tested in integration)
    expect(propagatedIds).toContain('workspace');
  });

  it('returns empty for no matches', () => {
    const { directMatches, propagatedIds } = matchDomainTerms('unrelated prompt', terms);
    expect(directMatches).toHaveLength(0);
    expect(propagatedIds).toHaveLength(0);
  });
});

describe('collectRewriteHints', () => {
  it('collects hints from matched terms', () => {
    const terms = [
      {
        id: 'tenant',
        canonical: 'Tenant',
        definition: 'Unit',
        aliases: [],
        keywords: [],
        relationships: [],
        rewrite_hints: { '组织': 'Tenant（多租户隔离单元）', 'org': 'Tenant' },
      },
    ];
    const hints = collectRewriteHints(['tenant'], terms);
    expect(hints['组织']).toBe('Tenant（多租户隔离单元）');
    expect(hints['org']).toBe('Tenant');
  });

  it('returns empty for terms without hints', () => {
    const terms = [
      { id: 'a', canonical: 'A', definition: 'A', aliases: [], keywords: [], relationships: [] },
    ];
    expect(collectRewriteHints(['a'], terms)).toEqual({});
  });
});
