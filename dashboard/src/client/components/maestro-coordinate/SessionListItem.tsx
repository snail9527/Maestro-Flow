import type { MaestroSessionListItem } from '@/shared/maestro-session-types.js';
import { SOURCE_COLORS, SESSION_STATUS_COLORS, formatRelativeTime } from './constants.js';

// ---------------------------------------------------------------------------
// SessionListItem — one row in the left panel list
// ---------------------------------------------------------------------------

export function SessionListItem({
  session,
  isSelected,
  onClick,
}: {
  session: MaestroSessionListItem;
  isSelected: boolean;
  onClick: (dirName: string) => void;
}) {
  const sourceColor = SOURCE_COLORS[session.source] ?? '#A09D97';
  const statusColor = SESSION_STATUS_COLORS[session.status] ?? '#A09D97';

  return (
    <button
      type="button"
      onClick={() => onClick(session.dirName)}
      className={[
        'flex items-start gap-2.5 w-full px-[14px] py-[10px] text-left',
        'transition-colors duration-[var(--duration-fast)] ease-[var(--ease-notion)]',
        'border-b border-border-divider',
        isSelected
          ? 'bg-bg-active'
          : 'hover:bg-bg-hover',
      ].join(' ')}
      style={isSelected ? { borderLeft: `2px solid ${sourceColor}` } : undefined}
    >
      {/* Source dot */}
      <div
        className="w-[6px] h-[6px] rounded-full shrink-0 mt-[6px]"
        style={{ background: sourceColor }}
      />

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Intent */}
        <div className="text-[length:var(--font-size-sm)] font-medium text-text-primary truncate">
          {session.intent || session.dirName}
        </div>

        {/* Status pill + progress */}
        <div className="flex items-center gap-2 mt-1">
          <span
            className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
            style={{ background: `${statusColor}18`, color: statusColor }}
          >
            {session.status}
          </span>
          <span className="text-[10px] text-text-tertiary font-mono">
            {session.currentStep}/{session.totalSteps}
          </span>
        </div>

        {/* Timestamp */}
        <div className="text-[10px] text-text-tertiary mt-0.5">
          {formatRelativeTime(session.updatedAt)}
        </div>
      </div>
    </button>
  );
}
