/**
 * Spec Bridge (Session Dedup) — comprehensive tests
 *
 * Covers: readSpecBridge, markInjected, isKeywordInjected, isEntryInjected, filterUnjected
 * Guide coverage: Session Dedup — bridge file tracks injected keywords/entries per session
 */

import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  readSpecBridge,
  markInjected,
  isKeywordInjected,
  isEntryInjected,
  filterUnjected,
} from '../spec-bridge.js';
import { SPEC_KW_BRIDGE_PREFIX } from '../constants.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SESSION_BASE = `test-bridge-${Date.now()}`;
let sessionCounter = 0;

function newSessionId(): string {
  return `${SESSION_BASE}-${sessionCounter++}`;
}

function bridgePath(sessionId: string): string {
  return join(tmpdir(), `${SPEC_KW_BRIDGE_PREFIX}${sessionId}.json`);
}

function cleanupSession(sessionId: string): void {
  const path = bridgePath(sessionId);
  if (existsSync(path)) rmSync(path);
}

// ---------------------------------------------------------------------------
// readSpecBridge
// ---------------------------------------------------------------------------

describe('readSpecBridge', () => {
  it('returns null when no bridge file exists', () => {
    const result = readSpecBridge(newSessionId());
    expect(result).toBeNull();
  });

  it('returns bridge data after markInjected writes it', () => {
    const sid = newSessionId();
    try {
      markInjected(sid, ['auth'], ['file1:1']);
      const bridge = readSpecBridge(sid);
      expect(bridge).not.toBeNull();
      expect(bridge!.session_id).toBe(sid);
      expect(bridge!.injected_keywords).toContain('auth');
      expect(bridge!.injected_entries).toContain('file1:1');
    } finally {
      cleanupSession(sid);
    }
  });
});

// ---------------------------------------------------------------------------
// markInjected
// ---------------------------------------------------------------------------

describe('markInjected', () => {
  it('creates bridge file with keywords and entries', () => {
    const sid = newSessionId();
    try {
      markInjected(sid, ['auth', 'token'], ['coding:5', 'coding:10']);

      const bridge = readSpecBridge(sid);
      expect(bridge).not.toBeNull();
      expect(bridge!.injected_keywords).toEqual(expect.arrayContaining(['auth', 'token']));
      expect(bridge!.injected_entries).toEqual(expect.arrayContaining(['coding:5', 'coding:10']));
      expect(bridge!.updated_at).toBeGreaterThan(0);
    } finally {
      cleanupSession(sid);
    }
  });

  it('merges with existing bridge data (additive)', () => {
    const sid = newSessionId();
    try {
      markInjected(sid, ['auth'], ['coding:5']);
      markInjected(sid, ['cache'], ['learnings:3']);

      const bridge = readSpecBridge(sid);
      expect(bridge!.injected_keywords).toEqual(expect.arrayContaining(['auth', 'cache']));
      expect(bridge!.injected_entries).toEqual(expect.arrayContaining(['coding:5', 'learnings:3']));
    } finally {
      cleanupSession(sid);
    }
  });

  it('does not duplicate keywords on repeated injection', () => {
    const sid = newSessionId();
    try {
      markInjected(sid, ['auth', 'token'], ['coding:5']);
      markInjected(sid, ['auth', 'security'], ['coding:5', 'coding:10']);

      const bridge = readSpecBridge(sid);
      const kwCount = bridge!.injected_keywords.filter(k => k === 'auth').length;
      expect(kwCount).toBe(1); // deduplicated
      const entryCount = bridge!.injected_entries.filter(e => e === 'coding:5').length;
      expect(entryCount).toBe(1); // deduplicated
    } finally {
      cleanupSession(sid);
    }
  });

  it('lowercases keywords before storing', () => {
    const sid = newSessionId();
    try {
      markInjected(sid, ['Auth', 'TOKEN'], ['coding:5']);

      const bridge = readSpecBridge(sid);
      expect(bridge!.injected_keywords).toContain('auth');
      expect(bridge!.injected_keywords).toContain('token');
      expect(bridge!.injected_keywords).not.toContain('Auth');
      expect(bridge!.injected_keywords).not.toContain('TOKEN');
    } finally {
      cleanupSession(sid);
    }
  });
});

// ---------------------------------------------------------------------------
// isKeywordInjected
// ---------------------------------------------------------------------------

describe('isKeywordInjected', () => {
  it('returns false when no bridge exists', () => {
    expect(isKeywordInjected(newSessionId(), 'auth')).toBe(false);
  });

  it('returns true for injected keyword', () => {
    const sid = newSessionId();
    try {
      markInjected(sid, ['auth'], []);
      expect(isKeywordInjected(sid, 'auth')).toBe(true);
    } finally {
      cleanupSession(sid);
    }
  });

  it('returns false for non-injected keyword', () => {
    const sid = newSessionId();
    try {
      markInjected(sid, ['auth'], []);
      expect(isKeywordInjected(sid, 'cache')).toBe(false);
    } finally {
      cleanupSession(sid);
    }
  });
});

// ---------------------------------------------------------------------------
// isEntryInjected
// ---------------------------------------------------------------------------

describe('isEntryInjected', () => {
  it('returns false when no bridge exists', () => {
    expect(isEntryInjected(newSessionId(), 'coding:5')).toBe(false);
  });

  it('returns true for injected entry', () => {
    const sid = newSessionId();
    try {
      markInjected(sid, [], ['coding:5']);
      expect(isEntryInjected(sid, 'coding:5')).toBe(true);
    } finally {
      cleanupSession(sid);
    }
  });

  it('returns false for non-injected entry', () => {
    const sid = newSessionId();
    try {
      markInjected(sid, [], ['coding:5']);
      expect(isEntryInjected(sid, 'coding:10')).toBe(false);
    } finally {
      cleanupSession(sid);
    }
  });
});

// ---------------------------------------------------------------------------
// filterUnjected
// ---------------------------------------------------------------------------

describe('filterUnjected', () => {
  it('returns all entries when no bridge exists', () => {
    const entries = [
      { id: 'a:1', title: 'A' },
      { id: 'b:2', title: 'B' },
    ];
    const result = filterUnjected(newSessionId(), entries);
    expect(result.length).toBe(2);
  });

  it('filters out already-injected entries', () => {
    const sid = newSessionId();
    try {
      markInjected(sid, [], ['a:1', 'b:2']);

      const entries = [
        { id: 'a:1', title: 'A' },
        { id: 'b:2', title: 'B' },
        { id: 'c:3', title: 'C' },
      ];
      const result = filterUnjected(sid, entries);
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('c:3');
    } finally {
      cleanupSession(sid);
    }
  });

  it('returns empty when all entries already injected', () => {
    const sid = newSessionId();
    try {
      markInjected(sid, [], ['x:1', 'y:2']);

      const entries = [
        { id: 'x:1', title: 'X' },
        { id: 'y:2', title: 'Y' },
      ];
      const result = filterUnjected(sid, entries);
      expect(result.length).toBe(0);
    } finally {
      cleanupSession(sid);
    }
  });
});
