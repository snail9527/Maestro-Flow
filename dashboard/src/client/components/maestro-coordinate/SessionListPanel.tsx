import type { MaestroSessionListItem } from '@/shared/maestro-session-types.js';
import { SessionListItem } from './SessionListItem.js';

// ---------------------------------------------------------------------------
// SessionListPanel — left sidebar with session list
// ---------------------------------------------------------------------------

export function SessionListPanel({
  sessions,
  selectedDir,
  onSelect,
}: {
  sessions: MaestroSessionListItem[];
  selectedDir: string | null;
  onSelect: (dirName: string) => void;
}) {
  return (
    <aside className="w-[272px] shrink-0 flex flex-col border-r border-border bg-bg-secondary">
      {/* Header */}
      <div className="flex items-center justify-between px-[14px] py-[10px] border-b border-border-divider">
        <span className="text-[9px] font-semibold uppercase tracking-widest text-text-placeholder">
          Sessions
        </span>
        <span className="bg-bg-hover px-1.5 rounded-full text-[9px] text-text-tertiary font-mono">
          {sessions.length}
        </span>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {sessions.length === 0 && (
          <div className="px-[14px] py-6 text-center">
            <div className="text-[length:var(--font-size-sm)] font-semibold text-text-secondary mb-1">
              No sessions
            </div>
            <div className="text-[10px] text-text-tertiary leading-relaxed">
              Run a maestro command to create sessions
            </div>
          </div>
        )}
        {sessions.map((session) => (
          <SessionListItem
            key={session.dirName}
            session={session}
            isSelected={session.dirName === selectedDir}
            onClick={onSelect}
          />
        ))}
      </div>
    </aside>
  );
}
