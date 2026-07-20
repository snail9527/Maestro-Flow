import type { Pane } from '@rmux/sdk';
import type { AgentConfig, AgentResult, AgentTool, AskOptions, OutputSegment } from './types.js';
import { findSessionFile, findSessionByPid, scanForSession, getLastMessageUuid, readLastAssistantMessage } from './session-reader.js';
import { rmuxExec, sleep, findChildPids } from './utils/rmux.js';

export function getDefaultMarker(tool: AgentTool): string | RegExp {
  switch (tool) {
    case 'claude':
      return /[❯>]\s*$/;
    case 'codex':
      return /[$>]\s*$/;
    case 'gemini':
      return /[>$]\s*$/;
    case 'opencode':
      return /[>$]\s*$/;
    case 'shell':
      return /[$#>]\s*$/;
  }
}

function resolveExePath(name: string): string {
  if (process.platform !== 'win32') return name;
  const npmDir = process.env.APPDATA
    ? `${process.env.APPDATA}\\npm\\node_modules`
    : '';
  const paths: Record<string, string> = {
    claude: `${npmDir}\\@anthropic-ai\\claude-code\\bin\\claude.exe`,
    codex: `${npmDir}\\@openai\\codex\\bin\\codex.exe`,
  };
  return paths[name] ?? name;
}

export function getLaunchCommand(config: AgentConfig): string {
  switch (config.tool) {
    case 'claude': {
      const exe = config.launchCommand ?? resolveExePath('claude');
      const prefix = process.platform === 'win32' ? `& '${exe}'` : exe;
      const settingsFlag = config.settings ? ` --settings '${config.settings}'` : '';
      return `${prefix} --dangerously-skip-permissions --permission-mode bypassPermissions${settingsFlag}${config.model ? ` --model ${config.model}` : ''}`;
    }
    case 'codex': {
      const exe = config.launchCommand ?? 'codex';
      return `${exe} --dangerously-bypass-approvals-and-sandbox${config.model ? ` --model ${config.model}` : ''}`;
    }
    case 'gemini':
      return 'gemini --skip-trust --approval-mode yolo';
    case 'opencode':
      return 'opencode';
    case 'shell':
      return config.launchCommand ?? (process.platform === 'win32' ? 'cmd.exe' : 'bash');
  }
}

export function isCliAgent(tool: AgentTool): boolean {
  return tool !== 'shell';
}

const SEND_ENTER_DELAY = 300;

function matchesMarker(text: string, marker: string | RegExp): boolean {
  if (typeof marker === 'string') {
    return text.includes(marker);
  }
  return marker.test(text);
}

let sentinelCounter = 0;
function nextSentinel(): string {
  return `__RD${++sentinelCounter}__`;
}

function stripStatusBar(text: string): string {
  return text.split('\n').filter(l => {
    const t = l.trim();
    if (!t) return true;
    if (/Opus|Sonnet|Haiku.*\d+[kKmM]/.test(t)) return false;
    if (/bypass permissions/.test(t)) return false;
    if (/⏵⏵/.test(t)) return false;
    if (/^\d+[kKmM]\s*(tokens|in|out)/.test(t)) return false;
    return true;
  }).join('\n');
}

export class Agent {
  readonly name: string;
  readonly pane: Pane;
  readonly config: AgentConfig;
  readonly target: string;

  private completionMarker: string | RegExp;
  private _alive = true;
  private sessionFilePath: string | null = null;
  private sessionFromPid = false;
  private panePid: number | null = null;
  readonly launchTimestamp: number;

  constructor(pane: Pane, config: AgentConfig, target?: string, launchTimestamp?: number) {
    this.pane = pane;
    this.name = config.name;
    this.config = config;
    this.target = target ?? pane.target;
    this.completionMarker = config.completionMarker ?? getDefaultMarker(config.tool);
    this.launchTimestamp = launchTimestamp ?? Date.now();
  }

  private discoverPanePid(): number | null {
    if (this.panePid) return this.panePid;
    // display-message -p targets the exact pane, unlike list-panes which lists all in the window
    const raw = rmuxExec(`display -p -t ${this.target} "#{pane_pid}"`);
    const pid = parseInt(raw.trim(), 10);
    if (!isNaN(pid) && pid > 0) this.panePid = pid;
    return this.panePid;
  }

  private findChildPids(parentPid: number): number[] {
    return findChildPids(parentPid);
  }

  private discoverSessionFile(): string | null {
    if (this.sessionFilePath && this.sessionFromPid) return this.sessionFilePath;

    // Priority 1: PID chain — pane shell → child processes → session file
    const panePid = this.discoverPanePid();
    if (panePid) {
      const children = this.findChildPids(panePid);
      for (const childPid of children) {
        const path = findSessionByPid(childPid);
        if (path) { this.sessionFilePath = path; this.sessionFromPid = true; return path; }
        for (const grandPid of this.findChildPids(childPid)) {
          const gPath = findSessionByPid(grandPid);
          if (gPath) { this.sessionFilePath = gPath; this.sessionFromPid = true; return gPath; }
        }
      }
    }

    // Priority 2: timestamp + cwd scan — cached after first successful discovery
    if (this.sessionFilePath) return this.sessionFilePath;
    const cwd = this.config.cwd ?? process.env.USERPROFILE ?? process.env.HOME ?? '';
    const fallback = scanForSession(this.launchTimestamp - 5_000, cwd)
      ?? findSessionFile(cwd, this.launchTimestamp - 30_000);
    if (fallback) this.sessionFilePath = fallback;
    return fallback;
  }

  get alive(): boolean { return this._alive; }
  get resolvedSessionFile(): string | null { return this.sessionFilePath; }

  private sendViaBuffer(text: string): void {
    const bufName = `collab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    rmuxExec(`load-buffer -b ${bufName} -`, { input: text });
    rmuxExec(`paste-buffer -p -t ${this.target} -b ${bufName}`);
    rmuxExec(`delete-buffer -b ${bufName}`);
  }

  private sendKeysLiteral(text: string, pasteThreshold?: number): void {
    const threshold = pasteThreshold ?? 1024;
    if (text.length > threshold) {
      this.sendViaBuffer(text);
    } else {
      const escaped = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`').replace(/'/g, "'\\''");
      rmuxExec(`send-keys -t ${this.target} -l "${escaped}"`);
    }
  }

  private sendKeysRaw(key: string): void {
    rmuxExec(`send-keys -t ${this.target} ${key}`);
  }

  private capturePane(scrollback = 200): string {
    return rmuxExec(`capture-pane -p -t ${this.target} -S -${scrollback}`);
  }

  async interrupt(): Promise<void> {
    await this.pane.sendKeys('C-c');
  }

  markDead(): void {
    this._alive = false;
  }

  async kill(): Promise<void> {
    this._alive = false;
    await this.pane.close();
  }

  async ask(prompt: string, opts?: AskOptions): Promise<AgentResult> {
    const timeout = opts?.timeout ?? 120_000;

    if (this.config.tool === 'shell') {
      return this.askShell(prompt, timeout);
    }
    return this.askCli(prompt, timeout, opts?.pasteThreshold);
  }

  private async askShell(prompt: string, timeout: number): Promise<AgentResult> {
    const startTime = Date.now();
    const sentinel = nextSentinel();
    const fullCmd = `${prompt} && echo ${sentinel}`;

    await this.pane.sendText(fullCmd);
    await sleep(SEND_ENTER_DELAY);
    await this.pane.sendKeys('Enter');
    await this.pane.waitForText(sentinel, { timeout });

    const snap = await this.pane.snapshot();
    const lines = snap.lines.filter(l => l.trim());

    const cmdIdx = lines.findLastIndex(l => l.includes(prompt.trim().slice(0, 30)));
    const sentinelIdx = lines.findIndex((l, i) => i > cmdIdx && l.trim() === sentinel);

    let raw: string;
    if (sentinelIdx === -1 || cmdIdx === -1) {
      raw = lines
        .filter(l => !l.includes(sentinel) && !l.includes('__RD'))
        .join('\n');
    } else {
      raw = lines
        .slice(cmdIdx + 1, sentinelIdx)
        .filter(l => !l.includes('__RD'))
        .join('\n');
    }

    return this.buildResult(raw, startTime, 'completed', 'exact');
  }

  private async askCli(prompt: string, timeout: number, pasteThreshold?: number): Promise<AgentResult> {
    const startTime = Date.now();
    const beforeText = this.capturePane();

    // Snapshot the session cursor BEFORE sending (if already discovered)
    const preSessionPath = isCliAgent(this.config.tool) ? this.discoverSessionFile() : null;
    const beforeUuid = preSessionPath ? getLastMessageUuid(preSessionPath) : null;

    // CLI agents use readline — newlines trigger premature submission
    const flatPrompt = prompt.replace(/\n+/g, ' ').replace(/\s{2,}/g, ' ');
    this.sendKeysLiteral(flatPrompt, pasteThreshold);
    await sleep(SEND_ENTER_DELAY);
    this.sendKeysRaw('C-m');

    // Unified polling loop: session file (exact) + TUI capture (observed) — first to succeed wins
    const isClI = isCliAgent(this.config.tool);
    let sessionPath = preSessionPath;
    let cursor = beforeUuid;
    const deadline = startTime + timeout;
    let tuiStableCount = 0;
    let lastTuiSnap = '';
    let sawContentGrowth = false;

    while (Date.now() < deadline) {
      await sleep(1500);

      // --- Session file path: structured data, no TUI noise ---
      if (isClI) {
        if (!sessionPath || !this.sessionFromPid) {
          const discovered = this.discoverSessionFile();
          if (discovered) {
            if (discovered !== sessionPath) {
              cursor = getLastMessageUuid(discovered);
            }
            sessionPath = discovered;
          }
        }
        if (sessionPath) {
          try {
            const response = readLastAssistantMessage(sessionPath, cursor ?? undefined);
            if (response && response.text) {
              const segments: OutputSegment[] = [];
              if (response.toolCalls.length > 0) {
                segments.push({ kind: 'tool_call', content: response.toolCalls.join(', ') });
              }
              segments.push({ kind: 'final', content: response.text });
              return {
                agent: this.name,
                status: 'completed',
                confidence: 'exact',
                output: response.text,
                raw: response.text,
                segments,
                duration_ms: Date.now() - startTime,
              };
            }
          } catch {
            this.sessionFilePath = null;
            sessionPath = null;
          }
        }
      }

      // --- TUI path: pane capture with marker + stability ---
      const current = this.capturePane();
      const lines = current.split('\n').filter(l => l.trim());
      if (lines.length === 0) continue;

      if (current.length > beforeText.length) sawContentGrowth = true;

      const contentLines = lines.filter(l => {
        const t = l.trim();
        return !(/Opus|Sonnet|Haiku.*\d+[kKmM]/.test(t) || /⏵⏵|bypass permissions/.test(t) || /^[─━═]{4,}$/.test(t));
      });
      const lastContentLine = contentLines[contentLines.length - 1]?.trim() ?? '';
      const markerOnLastLine = matchesMarker(lastContentLine, this.completionMarker);

      if (sawContentGrowth && markerOnLastLine) {
        const stable = stripStatusBar(current);
        if (stable === lastTuiSnap) {
          tuiStableCount++;
          if (tuiStableCount >= 2) {
            const raw = this.extractCliResponse(current, beforeText, prompt);
            if (raw.trim().length > 0) {
              return this.buildResult(raw, startTime, 'completed', 'observed');
            }
          }
        } else {
          tuiStableCount = 0;
          lastTuiSnap = stable;
        }
      } else {
        tuiStableCount = 0;
        lastTuiSnap = stripStatusBar(current);
      }
    }

    // Timeout: capture whatever is there and return degraded
    const current = this.capturePane();
    const raw = this.extractCliResponse(current, beforeText, prompt);
    return this.buildResult(raw, startTime, 'degraded', 'degraded');
  }

  private extractCliResponse(current: string, beforeText: string, prompt: string): string {
    const lines = current.split('\n').filter(l => l.trim());
    const beforeLines = beforeText.split('\n').filter(l => l.trim());

    const promptSnippet = prompt.trim().slice(0, 80);
    const echoIdx = lines.findLastIndex(l => l.includes(promptSnippet.slice(0, 50)) || l.includes(promptSnippet));
    const startIdx = echoIdx >= 0 ? echoIdx + 1 : beforeLines.length;

    const resultLines = lines.slice(startIdx).filter(l => {
      const t = l.trim();
      if (!t) return false;
      if (matchesMarker(t, this.completionMarker)) return false;
      if (/^[─━═┄┅┈┉╭╮╰╯│┄┅┈┉─]{4,}$/.test(t)) return false;
      if (/^[│╭╮╰╯]/.test(t)) return false;
      if (t.startsWith('⏵') || t.startsWith('←')) return false;
      if (/^[✻✓◉⏵▶●✢].*(?:for \d+s|Crunched|Worked|Cogitated|Unravelling|Pondering|Infusing|Dilly)/.test(t)) return false;
      if (/^[●✢✻]\s/.test(t)) return false;
      if (/Opus|Sonnet|Haiku.*\d+[kKmM]\s*[|│]/.test(t)) return false;
      if (/[░▒▓█]{3,}/.test(t)) return false;
      if (/bypass permissions on/.test(t)) return false;
      return true;
    });
    return resultLines.join('\n');
  }

  private classifyOutput(raw: string): OutputSegment[] {
    const lines = raw.split('\n');
    const segments: OutputSegment[] = [];
    let currentKind: OutputSegment['kind'] = 'intermediate';
    let currentLines: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      let kind: OutputSegment['kind'] = 'intermediate';

      if (/^[✻◉⏵].*(?:Thinking|Pondering|Reasoning)/i.test(trimmed)) {
        kind = 'thinking';
      } else if (/^[⏵▶].*(?:Tool|Read|Write|Edit|Bash|Grep|Glob)/i.test(trimmed)) {
        kind = 'tool_call';
      } else if (/^[✓].*(?:Tool|Read|Write|completed)/i.test(trimmed)) {
        kind = 'tool_result';
      } else if (trimmed && !matchesMarker(trimmed, this.completionMarker)) {
        const continuationKinds: OutputSegment['kind'][] = ['thinking', 'tool_call', 'tool_result'];
        kind = continuationKinds.includes(currentKind) ? currentKind : 'final';
      }

      if (kind !== currentKind && currentLines.length > 0) {
        segments.push({ kind: currentKind, content: currentLines.join('\n') });
        currentLines = [];
      }
      currentKind = kind;
      if (trimmed) currentLines.push(line);
    }
    if (currentLines.length > 0) {
      segments.push({ kind: currentKind, content: currentLines.join('\n') });
    }
    return segments;
  }

  private buildResult(
    raw: string,
    startTime: number,
    status: AgentResult['status'],
    confidence: AgentResult['confidence'],
  ): AgentResult {
    const segments = this.classifyOutput(raw);
    const finalSegments = segments.filter(s => s.kind === 'final');
    const output = finalSegments.map(s => s.content).join('\n');
    return {
      agent: this.name,
      status,
      confidence,
      output: output || raw,
      raw,
      segments,
      duration_ms: Date.now() - startTime,
    };
  }

  async send(prompt: string): Promise<void> {
    if (isCliAgent(this.config.tool)) {
      const flatPrompt = prompt.replace(/\n+/g, ' ').replace(/\s{2,}/g, ' ');
      this.sendKeysLiteral(flatPrompt);
      await sleep(SEND_ENTER_DELAY);
      this.sendKeysRaw('C-m');
    } else {
      await this.pane.sendText(prompt);
      await sleep(SEND_ENTER_DELAY);
      await this.pane.sendKeys('Enter');
    }
  }

  async isIdle(): Promise<boolean> {
    const text = this.capturePane(10);
    const lines = text.split('\n').filter(l => l.trim());
    return lines.some(l => matchesMarker(l.trim(), this.completionMarker));
  }
}

