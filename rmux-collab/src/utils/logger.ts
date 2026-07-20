import { appendFileSync } from 'node:fs';
import type { InteractionLog } from '../types.js';

const DEFAULT_MAX_ENTRIES = 10_000;

export class Logger {
  private logs: InteractionLog[] = [];
  private filePath?: string;
  private maxEntries: number;

  constructor(opts?: { filePath?: string; maxEntries?: number }) {
    this.filePath = opts?.filePath;
    this.maxEntries = opts?.maxEntries ?? DEFAULT_MAX_ENTRIES;
  }

  record(entry: Omit<InteractionLog, 'timestamp'>): void {
    const full = { ...entry, timestamp: Date.now() };
    this.logs.push(full);
    if (this.logs.length > this.maxEntries) {
      this.logs = this.logs.slice(-Math.floor(this.maxEntries * 0.8));
    }
    if (this.filePath) {
      appendFileSync(this.filePath, JSON.stringify(full) + '\n');
    }
  }

  setFilePath(path: string): void {
    this.filePath = path;
  }

  getAll(): readonly InteractionLog[] {
    return this.logs;
  }

  clear(): void {
    this.logs = [];
  }
}
