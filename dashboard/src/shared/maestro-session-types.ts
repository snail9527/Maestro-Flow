// ---------------------------------------------------------------------------
// Maestro session types — parsed from .workflow/.maestro/*/status.json
// and walker-state.json for the Maestro Coordinate dashboard page
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Session source discriminator
// ---------------------------------------------------------------------------

export type MaestroSessionSource = 'ralph' | 'maestro' | 'coordinate';

// ---------------------------------------------------------------------------
// Ralph step (from ralph-*/status.json)
// ---------------------------------------------------------------------------

export interface RalphStep {
  index: number;
  type: 'internal' | 'external' | 'decision';
  skill: string;
  args: string;
  status?: string;
  started_at?: string;
  completed_at?: string;
  error?: string;
  retried?: boolean;
}

// ---------------------------------------------------------------------------
// Maestro step (from maestro-*/status.json)
// ---------------------------------------------------------------------------

export interface MaestroStep {
  index: number;
  type: 'skill' | 'cli' | 'decision';
  skill: string;
  args: string;
  status?: string;
  started_at?: string;
  completed_at?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Coordinate history entry (from coord-*/walker-state.json)
// ---------------------------------------------------------------------------

export interface CoordHistoryEntry {
  node_id: string;
  node_type: string;
  outcome?: string;
  summary?: string;
  entered_at?: string;
  exited_at?: string;
  exec_id?: string;
  quality_score?: number;
}

// ---------------------------------------------------------------------------
// Ralph status.json — full shape (adaptive lifecycle)
// ---------------------------------------------------------------------------

export interface RalphStatusJson {
  session_id: string;
  source: 'ralph';
  created_at: string;
  updated_at: string;
  intent: string;
  status: string;
  chain_name: string;
  task_type: string;
  lifecycle_position: string;
  target: string;
  phase: number | null;
  milestone: string;
  auto_mode: boolean;
  cli_tool: string;
  quality_mode: string;
  passed_gates: string[];
  context: {
    issue_id: string | null;
    milestone_num: number | null;
    spec_session_id: string | null;
    scratch_dir: string | null;
    plan_dir: string | null;
    analysis_dir: string | null;
    brainstorm_dir: string | null;
  };
  steps: RalphStep[];
  waves: unknown[];
  current_step: number;
}

// ---------------------------------------------------------------------------
// Maestro status.json — full shape (static chain)
// ---------------------------------------------------------------------------

export interface MaestroStatusJson {
  session_id: string;
  source: 'maestro';
  created_at: string;
  updated_at: string;
  intent: string;
  status: string;
  chain_name: string;
  task_type: string;
  phase: number | null;
  milestone?: string;
  auto_mode: boolean;
  steps: MaestroStep[];
  current_step: number;
}

// ---------------------------------------------------------------------------
// Coordinate walker-state.json — full shape (graph walker)
// ---------------------------------------------------------------------------

export interface CoordinateWalkerState {
  session_id: string;
  graph_id: string;
  current_node: string;
  status: string;
  intent: string;
  auto_mode?: boolean;
  tool?: string;
  context?: {
    project?: { current_phase: number };
    inputs?: Record<string, string>;
  };
  history: CoordHistoryEntry[];
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Normalized session list item (for the session list view)
// ---------------------------------------------------------------------------

export interface MaestroSessionListItem {
  dirName: string;
  source: MaestroSessionSource;
  sessionId: string;
  intent: string;
  status: string;
  chainName: string | null;
  /** Ralph-only: current lifecycle position (e.g., "plan", "verify") */
  lifecyclePosition?: string;
  phase: number | null;
  milestone?: string;
  currentStep: number;
  totalSteps: number;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// WS push payload (file watcher → WS broadcast)
// ---------------------------------------------------------------------------

export interface MaestroSessionUpdatedPayload {
  session: MaestroSessionListItem;
}
