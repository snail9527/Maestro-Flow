// ---------------------------------------------------------------------------
// DecisionLogPlugin — Persists decision node outcomes to NDJSON log
// ---------------------------------------------------------------------------

import type { MaestroPlugin } from '../../types/index.js';
import type { WorkflowHookRegistry } from '../workflow-hooks.js';
import { appendLine } from '../../utils/jsonl-log.js';

export interface DecisionEntry {
  id: string;
  timestamp: string;
  source: string;
  node_id: string;
  type: string;
  verdict: string;
  resolved_value: unknown;
  summary: string;
}

let seq = 0;

export class DecisionLogPlugin implements MaestroPlugin {
  readonly name = 'decisionLog';

  constructor(private readonly logPath: string) {}

  apply(registry: WorkflowHookRegistry): void {
    registry.onDecision.tap(this.name, (ctx) => {
      const entry: DecisionEntry = {
        id: `DEC-${Date.now()}-${++seq}`,
        timestamp: new Date().toISOString(),
        source: 'coordinate',
        node_id: ctx.nodeId,
        type: 'routing',
        verdict: ctx.target,
        resolved_value: ctx.resolvedValue,
        summary: typeof ctx.resolvedValue === 'string' ? ctx.resolvedValue : '',
      };
      appendLine(this.logPath, entry);
    });
  }
}
