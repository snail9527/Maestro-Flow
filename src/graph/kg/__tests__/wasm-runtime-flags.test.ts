import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { buildRelaunchArgv, shouldApplyWasmFlags, processHasWasmRuntimeFlags, isNodeVersionWasmSensitive } from '../../../utils/wasm-relaunch.js';
import { WASM_RUNTIME_FLAGS } from '../extraction/code/wasm-runtime-flags.js';

describe('MaestroGraph WASM runtime flags', () => {
  it('uses --liftoff-only for tree-sitter WASM stability', () => {
    expect(WASM_RUNTIME_FLAGS).toEqual(['--liftoff-only']);
  });

  it('uses a Node-accepted flag', () => {
    const result = spawnSync(process.execPath, [...WASM_RUNTIME_FLAGS, '-e', 'process.exit(0)'], { encoding: 'utf-8' });
    expect(result.status, result.stderr).toBe(0);
  });

  it('detects kg indexing commands', () => {
    expect(shouldApplyWasmFlags(['kg', 'index'])).toBe(true);
    expect(shouldApplyWasmFlags(['kg', 'sync', '--source', 'codegraph'])).toBe(true);
    expect(shouldApplyWasmFlags(['kg', 'sync', '--source=domain,spec'])).toBe(false);
    expect(shouldApplyWasmFlags(['kg', 'search', 'Foo'])).toBe(false);
  });

  it('builds relaunch argv with wasm flags first', () => {
    expect(buildRelaunchArgv('/x/maestro.js', ['kg', 'index'], ['--enable-source-maps'])).toEqual([
      '--liftoff-only',
      '--enable-source-maps',
      '/x/maestro.js',
      'kg',
      'index',
    ]);
  });

  it('checks existing execArgv', () => {
    expect(processHasWasmRuntimeFlags(['--liftoff-only'])).toBe(true);
    expect(processHasWasmRuntimeFlags(['--no-wasm-tier-up'])).toBe(false);
  });

  it('flags Node 25 as WASM-sensitive', () => {
    expect(isNodeVersionWasmSensitive('25.9.0')).toBe(true);
    expect(isNodeVersionWasmSensitive('22.18.0')).toBe(false);
  });
});
