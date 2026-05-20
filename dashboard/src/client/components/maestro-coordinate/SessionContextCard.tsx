import type { SessionDetail } from '@/client/store/maestro-coordinate-store.js';
import type { RalphStatusJson, CoordinateWalkerState } from '@/shared/maestro-session-types.js';
import { MetaField } from './SessionDetailPanel.js';

// ---------------------------------------------------------------------------
// SessionContextCard — context info for ralph and coordinate sessions
// ---------------------------------------------------------------------------

export function SessionContextCard({ detail }: { detail: SessionDetail }) {
  if (detail.source === 'ralph') {
    return <RalphContextCard data={detail.data} />;
  }
  if (detail.source === 'coordinate' && detail.data.context) {
    return <CoordContextCard data={detail.data} />;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Ralph Context
// ---------------------------------------------------------------------------

function RalphContextCard({ data }: { data: RalphStatusJson }) {
  const ralph = data;

  return (
    <div>
      {/* Passed Gates */}
      {ralph.passed_gates.length > 0 && (
        <div className="mb-3">
          <div className="text-[9px] font-semibold uppercase tracking-widest text-text-placeholder mb-1.5">
            Passed Gates
          </div>
          <div className="flex flex-wrap gap-1">
            {ralph.passed_gates.map((gate, idx) => (
              <span
                key={idx}
                className="text-[9px] font-semibold px-2 py-0.5 rounded-full"
                style={{ background: 'var(--color-status-bg-completed)', color: 'var(--color-status-completed)' }}
              >
                {gate}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Quality + auto mode */}
      <div className="flex gap-4 mb-3 flex-wrap">
        <MetaField label="Quality Mode" value={ralph.quality_mode || '--'} />
        <MetaField label="Auto Mode" value={ralph.auto_mode ? 'Yes' : 'No'} />
        <MetaField label="CLI Tool" value={ralph.cli_tool || '--'} />
        <MetaField label="Task Type" value={ralph.task_type || '--'} />
      </div>

      {ralph.target && <MetaField label="Target" value={ralph.target} />}
      {ralph.context.issue_id && (
        <div className="mt-2">
          <MetaField label="Issue" value={ralph.context.issue_id} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Coordinate Context
// ---------------------------------------------------------------------------

function CoordContextCard({ data }: { data: CoordinateWalkerState }) {
  const ctx = data.context;

  return (
    <div className="flex flex-wrap gap-4">
      <MetaField label="Graph ID" value={data.graph_id} />
      <MetaField label="Current Node" value={data.current_node} />
      {data.tool && <MetaField label="Tool" value={data.tool} />}
      {data.auto_mode != null && (
        <MetaField label="Auto Mode" value={data.auto_mode ? 'Yes' : 'No'} />
      )}
      {ctx?.project?.current_phase != null && (
        <MetaField label="Phase" value={String(ctx.project.current_phase)} />
      )}
      {ctx?.inputs && Object.keys(ctx.inputs).length > 0 && (
        <div className="w-full">
          <div className="text-[9px] font-semibold uppercase tracking-widest text-text-placeholder mb-1">
            Inputs
          </div>
          <pre className="m-0 px-3 py-2 text-[10px] leading-relaxed bg-bg-secondary rounded-[var(--radius-md)] text-text-secondary overflow-auto max-h-[120px]">
            {JSON.stringify(ctx.inputs, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
