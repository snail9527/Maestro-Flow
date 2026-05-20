---
name: team-review
description: Team code review -- scan, review, fix pipeline
argument-hint: "[scope] [-y|--yes] [-c|--concurrency N] [--continue] [--mode default|full|fix-only|quick]"
allowed-tools: spawn_agents_on_csv, Read, Write, Edit, Bash, Glob, Grep, request_user_input
---

<purpose>
Wave-based code review pipeline via `spawn_agents_on_csv`. Scanner → Reviewer → Fixer with 4-dimension analysis and user-gated fixes.

```
+-------------------------------------------------------------------+
|                   REVIEW CSV WAVE WORKFLOW                          |
+-------------------------------------------------------------------+
|  Phase 1: Mode Selection + CSV Generation                          |
|     +-- Detect mode (default/full/fix-only/quick)                  |
|     +-- Build tasks.csv from pipeline definition                   |
|                                                                     |
|  Phase 2: Wave Execution Engine                                    |
|     +-- Sequential waves                                           |
|     +-- User checkpoint before FIX wave (skip if -y)               |
|     +-- Fix scope: all / critical+high / skip                      |
|                                                                     |
|  Phase 3: Results Aggregation                                      |
+-------------------------------------------------------------------+
```
</purpose>

<context>
```bash
$team-review "src/auth"
$team-review -y --mode full "src/"
$team-review --mode fix-only "fix-manifest.json"
$team-review --continue "20260518-rv-auth"
```

**Flags**: `-y` (auto), `-c N` (concurrency, default 3), `--continue` (resume), `--mode default|full|fix-only|quick`

### Role Registry (Fixed)

| Role | Path | Prefix |
|------|------|--------|
| scanner | [roles/scanner/role.md](roles/scanner/role.md) | SCAN-* |
| reviewer | [roles/reviewer/role.md](roles/reviewer/role.md) | REV-* |
| fixer | [roles/fixer/role.md](roles/fixer/role.md) | FIX-* |

**Session**: `.workflow/.csv-wave/{YYYYMMDD}-rv-{slug}/`

### Review Dimensions
Security (SEC), Correctness (COR), Performance (PRF), Maintainability (MNT)
</context>

<csv_schema>

### tasks.csv (Input columns)

```csv
id,title,description,role,review_dimension,deps,context_from,wave
```

| Column | Description |
|--------|-------------|
| `id` | Task ID: `{PREFIX}-{NNN}` |
| `title` | Short task title |
| `description` | PURPOSE/TASK/EXPECTED/CONSTRAINTS |
| `role` | Fixed role name |
| `review_dimension` | SEC/COR/PRF/MNT or empty |
| `deps` | Semicolon-separated dependency IDs |
| `context_from` | Context source IDs |
| `wave` | Wave number |

**Output columns** (via `output_schema` only):

| Column | Description |
|--------|-------------|
| `result_status` | completed / failed / blocked |
| `findings` | Key findings (max 500 chars) |
| `files_modified` | Semicolon-separated paths |
| `finding_count` | Number of issues found |
| `verdict` | APPROVE / CONDITIONAL / BLOCK (for REV tasks) |
| `error` | Error message |

**Column separation rule**: Input and Output MUST NOT share names.

### Pipeline Wave Assignments

#### default (2 waves)

| Wave | Task | Role |
|------|------|------|
| 1 | SCAN-001 | scanner |
| 2 | REV-001 | reviewer |

#### full (3 waves + user checkpoint)

| Wave | Task | Role |
|------|------|------|
| 1 | SCAN-001 | scanner |
| 2 | REV-001 | reviewer |
| — | User checkpoint: fix scope selection | — |
| 3 | FIX-001 | fixer |

#### fix-only (1 wave)

| Wave | Task | Role |
|------|------|------|
| 1 | FIX-001 | fixer |

#### quick (1 wave)

| Wave | Task | Role |
|------|------|------|
| 1 | SCAN-001 | scanner (quick=true) |
</csv_schema>

<invariants>
1. **Wave Order Sacred**
2. **CSV Source of Truth**
3. **Column Separation Rule**
4. **User Checkpoint Before Fix**: In full mode, pause after REV for user approval (skip if -y)
5. **0 Findings Shortcut**: If scanner finds 0 issues → skip REV and FIX
6. **Discovery Board Append-Only**
7. **Cleanup Temp Files**
8. **DO NOT STOP**: Continuous between checkpoints
9. **Role Files Authoritative**
</invariants>

<state_machine>

<states>
S_PARSE        — Parse arguments, detect mode
S_CSV_GEN      — Generate tasks.csv
S_WAVE_{N}     — Execute wave N
S_FIX_GATE     — User approval before fix (full mode)
S_AGGREGATE    — Generate report
</states>

<transitions>
S_PARSE → S_CSV_GEN
S_CSV_GEN → S_WAVE_1
S_WAVE_{N} → S_FIX_GATE       WHEN: mode=full, REV wave complete, FIX pending
S_WAVE_{N} → S_WAVE_{N+1}     WHEN: more waves
S_WAVE_{N} → S_AGGREGATE      WHEN: last wave or 0 findings shortcut
S_FIX_GATE → S_WAVE_{N+1}     WHEN: user selects fix scope (all/critical+high)
S_FIX_GATE → S_AGGREGATE      WHEN: user selects skip
</transitions>

<actions>

### Fix Gate Logic

After REV wave in full mode:
1. Read reviewer's `findings` and `verdict`
2. If `finding_count` = 0 or verdict = APPROVE → skip fix, aggregate
3. Display findings summary to user
4. `request_user_input`: Fix all / Fix critical+high only / Skip fixes
5. Update FIX-001 description with approved scope
6. Continue to FIX wave

### Instruction Builder

```
You are a team-review agent.
Role: read 'role' column. Task: read 'description' column.

## Role Definition
Read: {skillRoot}/roles/{role}/role.md

## Context
Session: {sessionFolder}
Discovery board: {sessionFolder}/discoveries.ndjson
Previous context: 'prev_context' column
Dimensions: {skillRoot}/specs/dimensions.md

## Output
result_status, findings, files_modified, finding_count, verdict (REV only), error
```

</actions>
</state_machine>

<error_codes>

| Condition | Recovery |
|-----------|----------|
| Scanner found 0 issues | Skip to aggregate, report clean |
| Reviewer verdict: BLOCK | Pause for user decision |
| Fix introduces regressions | Mark blocked, report regression details |
</error_codes>

<success_criteria>
- [ ] Mode selected and CSV generated
- [ ] Scan → Review → Fix pipeline executed
- [ ] User checkpoint before fixes (unless -y)
- [ ] 0-findings shortcut works
- [ ] Column separation maintained
- [ ] results.csv and context.md generated
</success_criteria>
