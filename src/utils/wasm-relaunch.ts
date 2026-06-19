import { WASM_RUNTIME_FLAGS } from '../graph/kg/extraction/code/wasm-runtime-flags.js';

const KG_WASM_COMMANDS = new Set(['index', 'sync', 'sync-all', 'rebuild']);

export function shouldApplyWasmFlags(argv: readonly string[]): boolean {
  const kgIndex = argv.indexOf('kg');
  if (kgIndex < 0) return false;
  const subcommand = argv.slice(kgIndex + 1).find(arg => !arg.startsWith('-'));
  if (!subcommand || !KG_WASM_COMMANDS.has(subcommand)) return false;
  if (subcommand === 'sync' || subcommand === 'sync-all') {
    const sourceIndex = argv.indexOf('--source');
    const sourceValue = sourceIndex >= 0 ? argv[sourceIndex + 1] : undefined;
    const sourceEquals = argv.find(arg => arg.startsWith('--source='));
    const sources = sourceValue ?? sourceEquals?.slice('--source='.length);
    return !sources || sources.split(',').map(s => s.trim()).includes('codegraph');
  }
  return true;
}

export function processHasWasmRuntimeFlags(execArgv: readonly string[] = process.execArgv): boolean {
  return WASM_RUNTIME_FLAGS.every(flag => execArgv.includes(flag));
}

export function buildRelaunchArgv(
  scriptPath: string,
  scriptArgs: readonly string[],
  execArgv: readonly string[] = process.execArgv,
): string[] {
  const preserved = execArgv.filter(arg => !WASM_RUNTIME_FLAGS.includes(arg));
  return [...WASM_RUNTIME_FLAGS, ...preserved, scriptPath, ...scriptArgs];
}

export function isNodeVersionWasmSensitive(nodeVersion: string = process.versions.node): boolean {
  return Number.parseInt(nodeVersion.split('.')[0] ?? '0', 10) >= 25;
}
