// ---------------------------------------------------------------------------
// Maestro Coordinate — shared constants and helpers
// ---------------------------------------------------------------------------

/** Source type → dot/badge color (matches accent palette) */
export const SOURCE_COLORS: Record<string, string> = {
  ralph: '#8B6BBF',     // accent-purple
  maestro: '#4A90D9',   // accent-blue
  coordinate: '#3D9B6F', // accent-green
};

/** Session status → pill color */
export const SESSION_STATUS_COLORS: Record<string, string> = {
  running: '#4A90D9',
  in_progress: '#4A90D9',
  completed: '#5A9E78',
  failed: '#C46555',
  pending: '#A09D97',
  idle: '#A09D97',
  verifying: '#D4832E',
  paused: '#A09D97',
};

/** Step status → timeline dot color */
export const STEP_DOT_COLORS: Record<string, string> = {
  completed: '#5A9E78',
  running: '#4A90D9',
  in_progress: '#4A90D9',
  pending: '#A09D97',
  failed: '#C46555',
  skipped: '#D1CEC8',
};

/** Step status → dot background tint */
export const STEP_BG_COLORS: Record<string, string> = {
  completed: 'rgba(90,158,120,0.12)',
  running: 'rgba(74,144,217,0.12)',
  in_progress: 'rgba(74,144,217,0.12)',
  pending: 'transparent',
  failed: 'rgba(196,101,85,0.12)',
  skipped: 'transparent',
};

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

export function formatRelativeTime(dateStr: string): string {
  try {
    const diff = Date.now() - new Date(dateStr).getTime();
    const secs = Math.floor(diff / 1000);
    if (secs < 60) return `${secs}s ago`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  } catch {
    return '';
  }
}

export function formatTimestamp(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleString();
  } catch {
    return dateStr;
  }
}

export function formatDuration(startedAt?: string, completedAt?: string): string {
  if (!startedAt) return '';
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const secs = Math.floor((end - start) / 1000);
  if (secs < 0) return '';
  const mins = Math.floor(secs / 60);
  if (mins > 0) return `${mins}m ${secs % 60}s`;
  return `${secs}s`;
}

// ---------------------------------------------------------------------------
// Pulse animation CSS (scoped keyframe)
// ---------------------------------------------------------------------------

export const PULSE_CSS = `@keyframes mcPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}`;
