---
name: maestro-verify
description: Use after execution to verify goals are actually achieved with evidence-based structural checks
argument-hint: "[-y|--yes] [-c|--concurrency N] [--continue] \"<phase> [--skip-tests] [--skip-antipattern]\""
allowed-tools: spawn_agents_on_csv, Read, Write, Edit, Bash, Glob, Grep, request_user_input
---

<purpose>
Wave-based 3-layer Goal-Backward verification using `spawn_agents_on_csv`.
Wave 1 (truth + artifact existence) -> Wave 2 (substance + wiring) -> Wave 3 (anti-pattern + Nyquist audit).

**Core principle**: Task completion != Goal achievement. A task marked complete may contain stubs/placeholders. This verifier checks that goals are actually achieved.

## Iron Law

**NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE IN THIS MESSAGE.** Before any success claim: IDENTIFY what command proves it → RUN it fresh → READ full output → VERIFY it confirms the claim → ONLY THEN make the claim.

## Forbidden Wording
BANNED: "Should work now", "Probably passes", "Seems correct", "Looks good", "I'm confident that...", any satisfaction BEFORE running verification. Replace with evidence: `"Tests pass: 42/42 green (exit 0)"`.

## Red Flags — These Thoughts Mean STOP
- "I just wrote this code, it definitely works" / "The changes are too small to break anything"
- "I already verified this earlier" / "The agent said it's done"
All mean: **run verification command NOW, read output, then report**.
</purpose>

<context>
$ARGUMENTS -- phase number and optional flags.

**Flags**:
- `-y, --yes`: Skip all confirmations
- `-c, --concurrency N`: Max concurrent agents per wave (default: 4)
- `--continue`: Resume existing session
- `--skip-tests`: Skip Nyquist test coverage audit in wave 3
- `--skip-antipattern`: Skip anti-pattern scan in wave 3

**Session**: `.workflow/.csv-wave/{YYYYMMDD}-verify-P{N}-{slug}/`
**Output**: tasks.csv, results.csv, discoveries.ndjson, context.md, verification.json, validation.json (if Nyquist ran)
</context>

<csv_schema>

### tasks.csv

```csv
id,title,description,layer,phase_dir,check_type,deps,context_from,wave,status,findings,gaps_found,fix_plan,error
"1","Truth: User can see messages","Verify observable behavior by checking artifacts, API, render logic.","truth","...","observable_behavior","","","1","","","","",""
"2","Artifact Exists: Chat.tsx","Check L1 existence on disk.","artifact","...","exists","","","1","","","","",""
"3","Artifact Substance: Chat.tsx","Check L2: real impl, not stub/placeholder.","artifact","...","substance","2","2","2","","","","",""
"4","Wiring: Chat.tsx -> /api/chat","Check L3: imported and actually used.","wiring","...","import_usage","2","2","2","","","","",""
"5","Anti-Pattern Scan","Scan modified files for TODO/FIXME/placeholder/disabled tests. Categorize Blocker/Warning/Info.","antipattern","...","pattern_scan","1;3;4","1;3;4","3","","","","",""
"6","Nyquist Test Coverage","Map requirements to tests. COVERED/PARTIAL/MISSING. Run coverage if available.","nyquist","...","test_coverage","1;3;4","1;3;4","3","","","","",""
```

**Column semantics**:
- Input: id (unique string), title, description (detailed check instructions), layer (truth/artifact/wiring/antipattern/nyquist), phase_dir (target directory path), check_type (observable_behavior/exists/substance/import_usage/pattern_scan/test_coverage), deps (semicolon-sep IDs), context_from (IDs whose findings needed), wave (1=truth+exist, 2=substance+wiring, 3=antipattern+nyquist)
- Output: status (pending->completed/failed/skipped), findings (verification summary, max 500 chars), gaps_found (JSON array: `[{"id":"GAP-001","type":"missing_feature","severity":"critical","description":"...","fix_direction":"..."}]`), fix_plan (suggested fix actions), error

Wave 1: truth + artifact/exists (parallel). Wave 2: substance + wiring (parallel). Wave 3: antipattern + nyquist (parallel, skip-flaggable).

**Check type -> wave assignment**:
| Layer | Check Types | Wave |
|-------|-------------|------|
| truth | observable_behavior | 1 |
| artifact (exists) | exists | 1 |
| artifact (substance) | substance | 2 |
| wiring | import_usage | 2 |
| antipattern | pattern_scan | 3 (skip if --skip-antipattern) |
| nyquist | test_coverage | 3 (skip if --skip-tests) |
</csv_schema>

<invariants>
1. **Wave order sacred**: Never execute wave N+1 before wave N completes
2. **CSV is source of truth**: Master tasks.csv holds all state
3. **Context propagation**: prev_context from master CSV, not memory
4. **Discovery board append-only**: Never modify/delete discoveries.ndjson
5. **Skip on failure**: Artifact existence failed -> skip its substance/wiring checks
6. **Respect skip flags**: --skip-tests and --skip-antipattern mark wave 3 tasks as skipped, not removed
7. **Goal-backward**: Verify goals are achieved, not just tasks completed
</invariants>

<state_machine>

<states>
S_PARSE      -- 解析参数、解析 phase 目录                  PERSIST: --
S_MUST_HAVE  -- 建立 must-haves、分解 checks               PERSIST: --
S_CSV_GEN    -- 生成 tasks.csv                              PERSIST: tasks.csv
S_WAVE_1     -- Truth + Artifact Existence (parallel)        PERSIST: findings + tasks.csv
S_WAVE_2     -- Substance + Wiring (parallel)                PERSIST: findings + tasks.csv
S_WAVE_3     -- Anti-Pattern + Nyquist (parallel)            PERSIST: findings + tasks.csv
S_AGGREGATE  -- 生成报告、创建 issues、修复计划             PERSIST: verification.json + validation.json + context.md
</states>

<transitions>

S_PARSE:
  -> S_MUST_HAVE    WHEN: phase resolved    DO: load index.json, plan.json, TASK-*.json, summaries, uat.md, ARCHITECTURE.md; **D-007 milestone reverse lookup** for numeric phase
  -> ERROR          WHEN: phase not found

  **D-007 milestone reverse lookup** (numeric phase arg):
  ```
  resolve_milestone(phase_number):
    for ms in state.json.milestones[]:
      if str(phase_number) in ms.phase_slugs: return ms.id
    return state.json.current_milestone   # fallback
  ```
  Write resolved milestone into `session.milestone` and VRF artifact registration. NEVER read `current_milestone` directly for phase-scoped runs.

S_MUST_HAVE:
  -> S_CSV_GEN      DO: establish must-haves from success_criteria (primary), convergence.criteria (per-task), derived behaviors (fallback). Decompose into truth/artifact/wiring layers.

S_CSV_GEN:
  -> S_WAVE_1       DO: load specs (`maestro spec load --category review`), generate check rows per must-have. Pre-flight: `maestro collab preflight --phase N`

S_WAVE_1:
  -> S_WAVE_2       DO: A_SPAWN_WAVE_1

S_WAVE_2:
  -> S_WAVE_3       DO: A_SPAWN_WAVE_2

S_WAVE_3:
  -> S_AGGREGATE    DO: A_SPAWN_WAVE_3

S_AGGREGATE:
  -> END            DO: A_AGGREGATE_RESULTS

</transitions>

<actions>

### Shared Spawn Contract (W1, W2, W3)

Every `spawn_agents_on_csv` call MUST filter `wave==N AND status=="pending"` from master tasks.csv and use the strict JSON Schema below.

**output_schema**:

```json
{
  "type": "object",
  "properties": {
    "id":            { "type": "string" },
    "result_status": { "type": "string", "enum": ["completed", "failed", "blocked"] },
    "verdict":       { "type": "string", "description": "Per-agent verdict (e.g., VERIFIED/FAILED/UNCERTAIN, SUBSTANTIVE/STUB, WIRED/ORPHANED/NOT_WIRED, COVERED/PARTIAL/MISSING)" },
    "findings":      { "type": "string", "maxLength": 500 },
    "gaps_found":    { "type": "string", "description": "Semicolon-separated gaps with severity + fix direction" },
    "error":         { "type": "string" }
  },
  "required": ["id", "result_status", "findings", "verdict"]
}
```

Merge: `result_status` → master `status`; copy `verdict`, `findings`, `gaps_found`, `error`.

**Shared termination contract** (embed in every instruction):
```
You MUST call report_agent_job_result EXACTLY ONCE before exiting.
- Success → result_status=completed with concrete verdict
- Failure → result_status=failed with error message
- Blocked → upstream missing (W2/W3 cannot proceed) → result_status=blocked
- Timeout → near max_runtime_seconds → result_status=blocked, error="timeout"
- NEVER continue indefinitely. NEVER exit silently. NEVER omit the call.
- Read-only verification. Do NOT modify source files.
Do NOT write to tasks.csv, wave-*.csv, results.csv, verification.json. Do NOT call spawn_agents_on_csv (no recursion).
```

### A_SPAWN_WAVE_1

Filter `wave==1 AND status=="pending"` -> write wave-1.csv -> spawn.

**Truth check agent**: Identify supporting artifacts, check existence + substance + wiring indicators. verdict: VERIFIED / FAILED / UNCERTAIN. Report gaps with severity + fix direction.
**Artifact existence agent**: Check file on disk. Missing = gap (severity=critical). Exists = note size + structure for wave 2.

### A_SPAWN_WAVE_2

Filter `wave==2 AND status=="pending"`, skip if existence failed for that artifact. Build prev_context from wave 1 -> spawn.

**Substance agent**: <10 lines real logic or placeholder markers = STUB. Otherwise SUBSTANTIVE.
**Wiring agent**: Grep for import + actual usage beyond imports. verdict: WIRED / ORPHANED / NOT_WIRED.

### A_SPAWN_WAVE_3

Filter `wave==3 AND status=="pending"`. Mark skipped per --skip-antipattern / --skip-tests. Build prev_context from waves 1+2 -> spawn.

**Anti-pattern agent**: Extract modified files from summaries. Scan for TODO/FIXME/XXX/HACK, placeholder, empty returns, disabled tests. Categorize: Blocker / Warning / Info.
**Nyquist agent**: Detect test framework, map requirements to test files, classify COVERED / PARTIAL / MISSING. Run coverage if available.

### A_AGGREGATE_RESULTS

1. Export results.csv
2. Aggregate must_haves: truths[], artifacts[], key_links[] with status + evidence
3. Collect all gaps from gaps_found + UAT gaps
4. Generate fix plans: cluster related gaps -> plan per cluster -> order by dependency
5. Build verification.json: `{ phase, status: passed|gaps_found|human_needed, must_haves, gaps, antipatterns, fix_plans, coverage_score }`
6. Build validation.json (if Nyquist ran): `{ coverage, requirement_coverage[], gaps[] }`
7. Generate context.md: summary, truths, artifact checks table, key links, gaps, anti-patterns, fix plans, Nyquist coverage
8. Overall status: all pass + no blockers = passed; any fail/missing/blocker = gaps_found; automated pass but human items remain = human_needed
9. Auto-create issues from gaps + blocker anti-patterns
10. Archive previous verification/validation to .history/, copy outputs to phase dir
11. Update phase index.json with verification status
12. Post-verify knowledge inquiry: anti-pattern blockers -> quality spec; constraint violations -> arch spec; recurring test gaps -> test spec
13. Next-step routing: all passed -> quality-review; critical gaps -> quality-debug; minor gaps -> plan --gaps; low coverage -> quality-auto-test; human needed -> quality-test

</actions>

</state_machine>

<discovery_board>

**Standard types** (shared across waves):
| Type | Dedup Key | Data |
|------|-----------|------|
| code_pattern | data.name | {name, file, description} |
| integration_point | data.file | {file, description, exports[]} |
| convention | singleton | {naming, imports, formatting} |
| blocker | data.issue | {issue, severity, impact} |

**Domain types**:
| Type | Dedup Key | Data |
|------|-----------|------|
| verification_gap | data.gap_id | {gap_id, layer, severity, description} |
| stub_detected | data.file | {file, line, marker, content} |
| broken_wiring | data.from+data.to | {from, to, expected, actual} |
| antipattern | data.location | {location, pattern, severity} |
| test_gap | data.requirement | {requirement, status, suggested_test} |

Protocol: read before analysis, append-only, dedup by type+key.
</discovery_board>

<error_codes>
| Condition | Recovery |
|-----------|----------|
| Phase directory not found | Resolve via state.json; abort if not found |
| No execution results found | Abort: "Run execute first" |
| No success_criteria in index.json | Derive must-haves from phase goal (fallback) |
| Substance check on missing artifact | Auto-skip (dep failed) |
| Test framework not detected | Skip coverage calculation, warn |
| Continue mode: no session found | List available sessions |
</error_codes>

<success_criteria>
- [ ] Must-haves established from convergence.criteria + success_criteria + derived behaviors
- [ ] All 3 waves executed (with skip flags respected)
- [ ] verification.json + context.md produced
- [ ] validation.json produced (if Nyquist ran)
- [ ] Fix plans generated for gap clusters
- [ ] Issues auto-created for gaps + blocker anti-patterns
- [ ] Post-verify knowledge inquiry triggered when applicable
- [ ] Phase index.json updated with verification status
- [ ] VRF artifact registered in state.json (numeric scope: milestone resolved via D-007 `phase_slugs` reverse lookup, NOT direct `current_milestone` read)
- [ ] Gap-fix closure loop documented: gaps → plan --gaps → execute → verify (re-run)
- [ ] Next step routed (quality-review if passed, plan --gaps if gaps, quality-auto-test if low coverage)
- [ ] discoveries.ndjson append-only throughout
</success_criteria>
</output>
