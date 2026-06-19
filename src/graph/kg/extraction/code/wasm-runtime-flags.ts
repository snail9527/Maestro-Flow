// V8 WASM runtime flags for tree-sitter stability.
//
// Node 22+ can crash in V8's optimizing WASM compiler while compiling
// tree-sitter grammars. These flags must be present at process startup;
// runtime mutation and NODE_OPTIONS are too late or rejected by Node.

export const WASM_RUNTIME_FLAGS: readonly string[] = ['--liftoff-only'];

export function processHasWasmRuntimeFlags(execArgv: readonly string[] = process.execArgv): boolean {
  return WASM_RUNTIME_FLAGS.every(flag => execArgv.includes(flag));
}

export function getWasmRuntimeHint(): string {
  return `node ${WASM_RUNTIME_FLAGS.join(' ')} bin/maestro.js kg index`;
}
