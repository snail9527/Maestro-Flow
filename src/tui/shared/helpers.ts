// ---------------------------------------------------------------------------
// TUI Shared Helpers — utility functions used across all modules
// ---------------------------------------------------------------------------

import { SP } from './tokens.js';

/**
 * Pad a string to a fixed visual width. Truncates if too long.
 * Uses the standard label width by default.
 */
export function pad(s: string, width: number = SP.labelWidth): string {
  if (s.length >= width) return s.slice(0, width);
  return s + ' '.repeat(width - s.length);
}

/**
 * Truncate a string with ellipsis if it exceeds maxLen.
 */
export function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 1) + '\u2026';
}

/**
 * Parse number key input (1-9) and return 0-based index.
 * Returns null if input is not a valid number key for the given item count.
 */
export function parseNumberKey(input: string, itemCount: number): number | null {
  const num = parseInt(input, 10);
  if (!isNaN(num) && num >= 1 && num <= Math.min(itemCount, 9)) return num - 1;
  return null;
}

/**
 * Wrap cursor movement with circular navigation.
 * delta: +1 for down, -1 for up
 */
export function wrapCursor(current: number, delta: number, length: number): number {
  if (length <= 0) return 0;
  return ((current + delta) % length + length) % length;
}

/**
 * Format file size in human-readable form.
 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  return `${(bytes / 1024).toFixed(1)}KB`;
}
