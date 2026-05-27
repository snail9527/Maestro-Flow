
## Sub-Agent Registration (Antigravity)

Before any `invoke_subagent` call below, register each sub-agent type once per session by reading the system_prompt from `<agy-agents-dir>/<name>.md` and passing it to `define_subagent`. The `<agy-agents-dir>` is:
- global install: `~/.gemini/antigravity-cli/agents/`
- workspace install: `<project>/.agents/agents/`

- `define_subagent(name="team-worker", description="<from agents/team-worker.md frontmatter>", system_prompt=<contents of agents/team-worker.md body>, enable_write_tools=true, enable_mcp_tools=true, enable_subagent_tools=false)`

**ConversationId tracking**: `invoke_subagent` returns a ConversationId per spawned instance. Subsequent `send_message(Recipient=<ConversationId>, Message=...)` calls require that ConversationId — never use the role name as the recipient.

---
# Command: converge

Phase 4 execution guide. Run after `aco.py converged` returns `true`.

## Workflow

### Step 1: Call aco.py report

```
Bash: python <skill_root>/scripts/aco.py --session <session> report
```

Parse stdout JSON. Expected:
```json
{
  "status": "ok",
  "best": { ant_id, iteration, path, score, candidate_solution, evidence, ... },
  "top_k": [<top 5 trails>],
  "convergence_curve": [{iteration, entropy, tau_max, tau_mean}, ...],
  "final_pheromone_stats": {...},
  "iterations_completed": <int>
}
```

Save full report to `<session>/artifacts/swarm-report.json` (raw data for analyst).

### Step 2: Spawn analyst worker

```
invoke_subagent([{ TypeName: "team-worker", Role: "analyst", Prompt: "<Prompt>", Workspace: "inherit" }])
```

STOP. Resume on analyst callback.

### Step 3: On analyst callback

Verify `<session>/artifacts/best-solution.md` exists.

If missing -> ask_question (skip synthesis / retry analyst).

### Step 4: Build completion summary

```
[coordinator] ============================================
[coordinator] SWARM CONVERGED
[coordinator]
[coordinator] Iterations: <iterations_completed> / <max_iterations>
[coordinator] Trigger: <triggered_by[0]>
[coordinator] Total ants spawned: <iterations * n_ants>
[coordinator]
[coordinator] Best Solution:
[coordinator]   ant_id: <best.ant_id>
[coordinator]   iteration: <best.iteration>
[coordinator]   path: <best.path joined with " -> ">
[coordinator]   verified_score: <best.score>
[coordinator]   summary: <best.candidate_solution.summary>
[coordinator]
[coordinator] Convergence curve (entropy):
[coordinator]   iter 1: <e1>  iter 2: <e2>  iter 3: <e3>  ...
[coordinator]
[coordinator] Deliverables:
[coordinator]   - artifacts/best-solution.md (analyst synthesis)
[coordinator]   - artifacts/swarm-report.json (raw data)
[coordinator]   - best.json (canonical best)
[coordinator]   - trails/*.jsonl (full exploration log)
[coordinator]
[coordinator] Session: <session_path>
[coordinator] ============================================
```

### Step 5: Update session state

```
session.status = "completed"
session.converged_at = <iso8601>
session.convergence_reason = <triggered_by>
```

Log state_update:
```
team_msg.log({
  type: "state_update",
  summary: "Swarm pipeline complete: <iterations_completed> iters, best=<score>",
  data: { ... }
})
```

### Step 6: Completion action (interactive)

```
ask_question({
  questions: [{
    question: "Swarm pipeline complete. What would you like to do?",
    header: "Completion",
    multiSelect: false,
    options: [
      { label: "Archive & Clean (Recommended)", description: "Archive session, delete team" },
      { label: "Keep Active", description: "Preserve for follow-up iteration" },
      { label: "Export Best Solution", description: "Copy best-solution.md to target path" },
      { label: "Run Another Round", description: "Reset convergence, run K more iterations from current pheromone" }
    ]
  }]
})
```

### Action Handlers

| Choice | Steps |
|--------|-------|
| Archive & Clean | session.status = "completed"; TeamDelete; output final summary |
| Keep Active | session.status = "paused"; output resume instructions |
| Export Best Solution | ask_question(target path); copy best-solution.md + best.json; then Archive & Clean |
| Run Another Round | ask_question(additional K); reset convergence counters; re-enter Phase 3 iterate.md |

## Failure Cases

| Failure | Action |
|---------|--------|
| `aco.py report` fails | Read best.json directly + manual top-K from trails/ |
| Analyst worker crashes | Generate minimal best-solution.md from best.json template |
| best.json missing | Pipeline ran but no successful ant - report failure, keep session for inspection |
| Run Another Round chosen but max_iterations already at limit | ask_question to raise the cap before continuing |
