import { execSync } from 'node:child_process';

const SAFE_NAME = /^[a-zA-Z0-9_][a-zA-Z0-9_.:-]*$/;

export function validateTarget(target: string): string {
  if (!SAFE_NAME.test(target)) {
    throw new Error(`Invalid rmux target: ${target}`);
  }
  return target;
}

export function validateSessionName(name: string): string {
  if (!SAFE_NAME.test(name)) {
    throw new Error(`Invalid session name: ${name}`);
  }
  return name;
}

export interface RmuxExecOptions {
  input?: string;
  timeout?: number;
  throwOnError?: boolean;
  env?: Record<string, string>;
}

export function rmuxExec(args: string, opts?: RmuxExecOptions): string {
  try {
    return execSync(`rmux ${args}`, {
      encoding: 'utf-8',
      timeout: opts?.timeout ?? 10_000,
      input: opts?.input,
      env: opts?.env,
    }).trim();
  } catch (e: any) {
    if (opts?.throwOnError) throw e;
    return e.stdout?.trim() ?? '';
  }
}

export function cleanEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined) continue;
    if (k === 'NODE_PATH' || k === 'NODE_OPTIONS') continue;
    env[k] = v;
  }
  return env;
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function findChildPids(parentPid: number): number[] {
  if (process.platform !== 'win32') return [];
  try {
    const raw = execSync(
      `wmic process where "ParentProcessId=${String(Math.floor(parentPid))}" get ProcessId /value`,
      { encoding: 'utf-8', timeout: 5000 },
    ).trim();
    return raw.split('\n')
      .map(line => parseInt(line.replace(/\D/g, ''), 10))
      .filter(pid => !isNaN(pid) && pid > 0);
  } catch {
    return [];
  }
}

export function discoverSessionPath(
  panePid: number,
  findSessionByPid: (pid: number) => string | null,
): string | null {
  const children = findChildPids(panePid);
  for (const childPid of children) {
    const path = findSessionByPid(childPid);
    if (path) return path;
    for (const grandPid of findChildPids(childPid)) {
      const gPath = findSessionByPid(grandPid);
      if (gPath) return gPath;
    }
  }
  return null;
}
