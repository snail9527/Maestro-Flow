import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  name?: string;
  input?: unknown;
  content?: string;
}

export interface SessionMessage {
  type: 'user' | 'assistant';
  message: { role: string; content: ContentBlock[] };
  uuid: string;
  timestamp: string;
  sessionId: string;
}

export interface SessionResponse {
  text: string;
  toolCalls: string[];
  timestamp: string;
  uuid: string;
}

const CLAUDE_DIR = join(process.env.USERPROFILE ?? process.env.HOME ?? '', '.claude');

function dirHash(dir: string): string {
  return dir.replace(/[:\\\/]/g, '-').replace(/^-/, '');
}

export function findSessionFile(projectDir: string, afterTimestamp?: number): string | null {
  const projectsDir = join(CLAUDE_DIR, 'projects', dirHash(projectDir));
  if (!existsSync(projectsDir)) return null;

  const files = readdirSync(projectsDir)
    .filter(f => f.endsWith('.jsonl'))
    .map(f => ({ name: f, path: join(projectsDir, f), mtime: statSync(join(projectsDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  if (afterTimestamp) {
    const recent = files.find(f => f.mtime >= afterTimestamp);
    return recent?.path ?? null;
  }

  return files[0]?.path ?? null;
}

export function findSessionByPid(pid: number): string | null {
  const sessionsDir = join(CLAUDE_DIR, 'sessions');
  if (!existsSync(sessionsDir)) return null;

  const sessionFile = join(sessionsDir, `${pid}.json`);
  if (!existsSync(sessionFile)) return null;

  try {
    const data = JSON.parse(readFileSync(sessionFile, 'utf-8'));
    const { sessionId, cwd } = data;
    if (!sessionId || !cwd) return null;

    const projectsDir = join(CLAUDE_DIR, 'projects', dirHash(cwd));
    const jsonlPath = join(projectsDir, `${sessionId}.jsonl`);
    return existsSync(jsonlPath) ? jsonlPath : null;
  } catch {
    return null;
  }
}

export function scanForSession(afterTimestamp: number, cwd?: string): string | null {
  const sessionsDir = join(CLAUDE_DIR, 'sessions');
  if (!existsSync(sessionsDir)) return null;

  const candidates = readdirSync(sessionsDir)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try {
        const data = JSON.parse(readFileSync(join(sessionsDir, f), 'utf-8'));
        return { pid: data.pid, sessionId: data.sessionId, cwd: data.cwd, startedAt: data.startedAt };
      } catch { return null; }
    })
    .filter((d): d is { pid: number; sessionId: string; cwd: string; startedAt: number } =>
      d !== null && d.sessionId && d.cwd && d.startedAt >= afterTimestamp)
    .sort((a, b) => b.startedAt - a.startedAt);

  const match = cwd
    ? candidates.find(c => c.cwd.toLowerCase() === cwd.toLowerCase()) ?? candidates[0]
    : candidates[0];
  if (!match) return null;

  const jsonlPath = join(CLAUDE_DIR, 'projects', dirHash(match.cwd), `${match.sessionId}.jsonl`);
  return existsSync(jsonlPath) ? jsonlPath : null;
}

export function readLastAssistantMessage(sessionPath: string, afterUuid?: string): SessionResponse | null {
  if (!existsSync(sessionPath)) return null;

  const content = readFileSync(sessionPath, 'utf-8');
  const lines = content.trim().split('\n').filter(Boolean);

  if (!afterUuid) {
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const msg: SessionMessage = JSON.parse(lines[i]);
        if (msg.type === 'assistant') return extractResponse(msg);
      } catch { continue; }
    }
    return null;
  }

  let foundAfter = false;
  let lastAssistant: SessionMessage | null = null;

  for (const line of lines) {
    try {
      const msg: SessionMessage = JSON.parse(line);
      if (!foundAfter) {
        if (msg.uuid === afterUuid) foundAfter = true;
        continue;
      }
      if (msg.type === 'assistant') {
        lastAssistant = msg;
      }
    } catch { continue; }
  }

  if (!lastAssistant) return null;
  return extractResponse(lastAssistant);
}

function extractResponse(msg: SessionMessage): SessionResponse {
  const blocks = Array.isArray(msg.message.content) ? msg.message.content : [];
  const textParts: string[] = [];
  const toolCalls: string[] = [];

  for (const block of blocks) {
    if (block.type === 'text' && block.text) {
      textParts.push(block.text);
    } else if (block.type === 'tool_use' && block.name) {
      toolCalls.push(block.name);
    }
  }

  return {
    text: textParts.join('\n'),
    toolCalls,
    timestamp: msg.timestamp,
    uuid: msg.uuid,
  };
}

export function getLastMessageUuid(sessionPath: string): string | null {
  if (!existsSync(sessionPath)) return null;

  const content = readFileSync(sessionPath, 'utf-8');
  const lines = content.trim().split('\n').filter(Boolean);

  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const msg = JSON.parse(lines[i]);
      if (msg.uuid) return msg.uuid;
    } catch { continue; }
  }
  return null;
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

export async function waitForAssistantResponse(
  sessionPath: string,
  afterUuid: string | null,
  timeout: number,
): Promise<SessionResponse | null> {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const response = readLastAssistantMessage(sessionPath, afterUuid ?? undefined);
    if (response) return response;
    await sleep(1000);
  }

  return null;
}
