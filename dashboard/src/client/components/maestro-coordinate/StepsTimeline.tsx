import type { SessionDetail } from '@/client/store/maestro-coordinate-store.js';
import type { RalphStep, MaestroStep, CoordHistoryEntry } from '@/shared/maestro-session-types.js';
import { STEP_DOT_COLORS, STEP_BG_COLORS, formatDuration, PULSE_CSS } from './constants.js';

// ---------------------------------------------------------------------------
// StepsTimeline — dispatches to the correct timeline by source type
// ---------------------------------------------------------------------------

export function StepsTimeline({ detail }: { detail: SessionDetail }) {
  if (detail.source === 'ralph') {
    return <RalphStepsTimeline steps={detail.data.steps} />;
  }
  if (detail.source === 'maestro') {
    return <MaestroStepsTimeline steps={detail.data.steps} />;
  }
  // coordinate
  return <CoordHistoryTimeline history={detail.data.history} />;
}

// ---------------------------------------------------------------------------
// Timeline row structure (shared)
// ---------------------------------------------------------------------------

function TimelineRow({
  isLast,
  dotColor,
  dotBg,
  isRunning,
  children,
}: {
  isLast: boolean;
  dotColor: string;
  dotBg: string;
  isRunning?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3 py-2 relative">
      {/* Connecting line */}
      {!isLast && (
        <div
          className="absolute left-[11px] top-[30px] bottom-[-8px] w-px"
          style={{ background: dotColor, opacity: 0.3 }}
        />
      )}
      {/* Dot */}
      <div
        className="w-[22px] h-[22px] rounded-full flex items-center justify-center shrink-0 border-2 border-bg-primary"
        style={{ background: dotBg }}
      >
        <div
          className="w-2 h-2 rounded-full"
          style={{
            background: dotColor,
            animation: isRunning ? 'mcPulse 2s infinite' : undefined,
          }}
        />
      </div>
      {/* Content */}
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ralph Steps Timeline
// ---------------------------------------------------------------------------

function RalphStepsTimeline({ steps }: { steps: RalphStep[] }) {
  if (steps.length === 0) {
    return <div className="text-[11px] text-text-tertiary text-center py-6">No steps recorded</div>;
  }

  return (
    <div>
      {steps.map((step, idx) => {
        const status = step.status ?? 'pending';
        const dotColor = STEP_DOT_COLORS[status] ?? '#A09D97';
        const dotBg = STEP_BG_COLORS[status] ?? 'transparent';

        return (
          <TimelineRow
            key={step.index}
            isLast={idx === steps.length - 1}
            dotColor={dotColor}
            dotBg={dotBg}
            isRunning={status === 'in_progress' || status === 'running'}
          >
            <div className="flex items-center gap-1.5">
              <span className="text-[length:var(--font-size-sm)] font-semibold text-text-primary">
                {step.skill}
              </span>
              <InlineStatusPill status={status} />
            </div>
            {step.args && (
              <div className="text-[10px] text-text-tertiary mt-0.5 truncate">
                {step.args}
              </div>
            )}
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[9px] font-mono text-text-tertiary">
                {step.type}
              </span>
              {(step.started_at || step.completed_at) && (
                <span className="text-[9px] font-mono text-text-tertiary">
                  {formatDuration(step.started_at, step.completed_at)}
                </span>
              )}
              {step.retried && (
                <span className="text-[9px] text-accent-orange">retried</span>
              )}
            </div>
            {step.error && (
              <div className="text-[10px] text-accent-red mt-1 leading-snug">
                {step.error}
              </div>
            )}
          </TimelineRow>
        );
      })}
      <style>{PULSE_CSS}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Maestro Steps Timeline
// ---------------------------------------------------------------------------

function MaestroStepsTimeline({ steps }: { steps: MaestroStep[] }) {
  if (steps.length === 0) {
    return <div className="text-[11px] text-text-tertiary text-center py-6">No steps recorded</div>;
  }

  return (
    <div>
      {steps.map((step, idx) => {
        const status = step.status ?? 'pending';
        const dotColor = STEP_DOT_COLORS[status] ?? '#A09D97';
        const dotBg = STEP_BG_COLORS[status] ?? 'transparent';

        return (
          <TimelineRow
            key={step.index}
            isLast={idx === steps.length - 1}
            dotColor={dotColor}
            dotBg={dotBg}
            isRunning={status === 'in_progress' || status === 'running'}
          >
            <div className="flex items-center gap-1.5">
              <span className="text-[length:var(--font-size-sm)] font-semibold text-text-primary">
                {step.skill}
              </span>
              <InlineStatusPill status={status} />
            </div>
            {step.args && (
              <div className="text-[10px] text-text-tertiary mt-0.5 truncate">
                {step.args}
              </div>
            )}
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[9px] font-mono text-text-tertiary">
                {step.type}
              </span>
              {(step.started_at || step.completed_at) && (
                <span className="text-[9px] font-mono text-text-tertiary">
                  {formatDuration(step.started_at, step.completed_at)}
                </span>
              )}
            </div>
            {step.error && (
              <div className="text-[10px] text-accent-red mt-1 leading-snug">
                {step.error}
              </div>
            )}
          </TimelineRow>
        );
      })}
      <style>{PULSE_CSS}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Coordinate History Timeline
// ---------------------------------------------------------------------------

function CoordHistoryTimeline({ history }: { history: CoordHistoryEntry[] }) {
  if (history.length === 0) {
    return <div className="text-[11px] text-text-tertiary text-center py-6">No history entries</div>;
  }

  return (
    <div>
      {history.map((entry, idx) => {
        const dotColor =
          entry.outcome === 'success'
            ? '#5A9E78'
            : entry.outcome === 'failed'
              ? '#C46555'
              : '#4A90D9';

        return (
          <TimelineRow
            key={`${entry.node_id}-${idx}`}
            isLast={idx === history.length - 1}
            dotColor={dotColor}
            dotBg="transparent"
            isRunning={!entry.outcome && !entry.exited_at}
          >
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[length:var(--font-size-sm)] font-semibold text-text-primary">
                {entry.node_id}
              </span>
              <span className="text-[9px] text-text-tertiary">
                {entry.node_type}
              </span>
              {entry.outcome && (
                <InlineStatusPill
                  status={entry.outcome === 'success' ? 'completed' : entry.outcome}
                />
              )}
              {entry.quality_score != null && (
                <QualityBadge score={entry.quality_score} />
              )}
            </div>
            {entry.summary && (
              <div className="text-[10px] text-text-secondary mt-1 leading-relaxed">
                {entry.summary}
              </div>
            )}
            {entry.entered_at && (
              <div className="mt-1">
                <span className="text-[9px] font-mono text-text-tertiary">
                  {formatDuration(entry.entered_at, entry.exited_at)}
                </span>
              </div>
            )}
          </TimelineRow>
        );
      })}
      <style>{PULSE_CSS}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline helpers
// ---------------------------------------------------------------------------

function InlineStatusPill({ status }: { status: string }) {
  const STATUS_COLORS: Record<string, string> = {
    completed: '#5A9E78',
    running: '#4A90D9',
    in_progress: '#4A90D9',
    pending: '#A09D97',
    failed: '#C46555',
    success: '#5A9E78',
    approved: '#5A9E78',
  };
  const color = STATUS_COLORS[status] ?? '#A09D97';

  return (
    <span
      className="text-[9px] font-semibold px-1.5 py-[1px] rounded-full"
      style={{ background: `${color}18`, color }}
    >
      {status}
    </span>
  );
}

function QualityBadge({ score }: { score: number }) {
  const color =
    score >= 0.7 ? '#5A9E78' : score >= 0.4 ? '#D4832E' : '#C46555';

  return (
    <span
      className="text-[9px] font-semibold px-1.5 py-[1px] rounded-full"
      style={{ background: `${color}18`, color }}
    >
      {score.toFixed(2)}
    </span>
  );
}
