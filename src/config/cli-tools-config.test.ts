import { describe, it, expect } from 'vitest';
import { selectTool, resolveProxyEnv } from './cli-tools-config.js';
import type { CliToolsConfig, ToolEntry } from './cli-tools-config.js';

function makeEntry(overrides: Partial<ToolEntry> = {}): ToolEntry {
  return {
    enabled: true,
    primaryModel: 'test-model',
    tags: [],
    type: 'builtin',
    ...overrides,
  };
}

function makeConfig(tools: Record<string, ToolEntry> = {}): CliToolsConfig {
  return { version: '1.0.0', tools };
}

describe('selectTool', () => {
  it('selects by exact name when enabled', () => {
    const config = makeConfig({
      gemini: makeEntry(),
      qwen: makeEntry(),
    });
    const result = selectTool('gemini', config);
    expect(result).toBeDefined();
    expect(result!.name).toBe('gemini');
  });

  it('returns undefined when named tool is disabled', () => {
    const config = makeConfig({
      gemini: makeEntry({ enabled: false }),
    });
    expect(selectTool('gemini', config)).toBeUndefined();
  });

  it('falls back to first enabled tool when name is undefined', () => {
    const config = makeConfig({
      disabled: makeEntry({ enabled: false }),
      fallback: makeEntry({ enabled: true }),
    });
    const result = selectTool(undefined, config);
    expect(result).toBeDefined();
    expect(result!.name).toBe('fallback');
  });

  it('returns undefined when no tools are enabled', () => {
    const config = makeConfig({
      a: makeEntry({ enabled: false }),
      b: makeEntry({ enabled: false }),
    });
    expect(selectTool(undefined, config)).toBeUndefined();
  });

  it('returns undefined for empty tools config', () => {
    expect(selectTool(undefined, makeConfig())).toBeUndefined();
  });

  it('falls back when named tool does not exist', () => {
    const config = makeConfig({
      existing: makeEntry(),
    });
    const result = selectTool('missing', config);
    expect(result).toBeDefined();
    expect(result!.name).toBe('existing');
  });
});

describe('resolveProxyEnv', () => {
  it('returns empty when proxy is not configured', () => {
    const config = makeConfig({ codex: makeEntry() });
    expect(resolveProxyEnv(config, 'codex')).toEqual({});
  });

  it('returns empty when proxy.enabled is false', () => {
    const config: CliToolsConfig = {
      ...makeConfig({ codex: makeEntry() }),
      proxy: { enabled: false, httpProxy: 'http://127.0.0.1:7890' },
    };
    expect(resolveProxyEnv(config, 'codex')).toEqual({});
  });

  it('injects HTTP_PROXY and HTTPS_PROXY when enabled', () => {
    const config: CliToolsConfig = {
      ...makeConfig({ codex: makeEntry() }),
      proxy: { enabled: true, httpProxy: 'http://127.0.0.1:7890' },
    };
    const env = resolveProxyEnv(config, 'codex');
    expect(env.HTTP_PROXY).toBe('http://127.0.0.1:7890');
    expect(env.http_proxy).toBe('http://127.0.0.1:7890');
    expect(env.HTTPS_PROXY).toBe('http://127.0.0.1:7890');
    expect(env.https_proxy).toBe('http://127.0.0.1:7890');
  });

  it('uses separate httpsProxy when provided', () => {
    const config: CliToolsConfig = {
      ...makeConfig({ codex: makeEntry() }),
      proxy: {
        enabled: true,
        httpProxy: 'http://127.0.0.1:7890',
        httpsProxy: 'http://127.0.0.1:7891',
      },
    };
    const env = resolveProxyEnv(config, 'codex');
    expect(env.HTTP_PROXY).toBe('http://127.0.0.1:7890');
    expect(env.HTTPS_PROXY).toBe('http://127.0.0.1:7891');
  });

  it('includes noProxy when configured', () => {
    const config: CliToolsConfig = {
      ...makeConfig({ codex: makeEntry() }),
      proxy: {
        enabled: true,
        httpProxy: 'http://127.0.0.1:7890',
        noProxy: '127.0.0.1,localhost,.internal',
      },
    };
    const env = resolveProxyEnv(config, 'codex');
    expect(env.NO_PROXY).toBe('127.0.0.1,localhost,.internal');
    expect(env.no_proxy).toBe('127.0.0.1,localhost,.internal');
  });

  it('skips proxy for tool with proxy: false', () => {
    const config: CliToolsConfig = {
      ...makeConfig({ codex: makeEntry({ proxy: false }) }),
      proxy: { enabled: true, httpProxy: 'http://127.0.0.1:7890' },
    };
    expect(resolveProxyEnv(config, 'codex')).toEqual({});
  });

  it('applies proxy for tool with proxy: true', () => {
    const config: CliToolsConfig = {
      ...makeConfig({ codex: makeEntry({ proxy: true }) }),
      proxy: { enabled: true, httpProxy: 'http://127.0.0.1:7890' },
    };
    const env = resolveProxyEnv(config, 'codex');
    expect(env.HTTP_PROXY).toBe('http://127.0.0.1:7890');
  });

  it('applies proxy for tool without proxy field (default inherit)', () => {
    const config: CliToolsConfig = {
      ...makeConfig({ codex: makeEntry() }),
      proxy: { enabled: true, httpProxy: 'http://127.0.0.1:7890' },
    };
    const env = resolveProxyEnv(config, 'codex');
    expect(env.HTTP_PROXY).toBe('http://127.0.0.1:7890');
  });

  it('returns empty for unknown tool name with proxy enabled', () => {
    const config: CliToolsConfig = {
      ...makeConfig({}),
      proxy: { enabled: true, httpProxy: 'http://127.0.0.1:7890' },
    };
    const env = resolveProxyEnv(config, 'unknown');
    expect(env.HTTP_PROXY).toBe('http://127.0.0.1:7890');
  });
});
