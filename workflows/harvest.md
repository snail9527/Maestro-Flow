# Harvest Workflow

Extract knowledge from workflow artifacts and route into wiki / spec / issue stores.

Unlike `retrospective.md` which is phase-scoped and post-execution, harvest operates on **any workflow session artifact** — analysis results, brainstorm outputs, debug sessions, lite-plan/fix results, scratchpad notes, and completed workflow sessions.

---

## Prerequisites

- `.workflow/` initialized (`.workflow/state.json` exists)
- At least one artifact source present (analysis, brainstorm, import, debug, lite-plan, lite-fix, scratchpad, or active session)
- For wiki routing: `maestro wiki` CLI available

---

## Argument Shape

```
/manage-harvest                                      → scan all sources, interactive selection
/manage-harvest <session-id>                         → harvest specific session (ANL-*, WFS-*, etc.)
/manage-harvest <path>                               → harvest from explicit directory or file
/manage-harvest --recent 7                           → harvest from artifacts updated in last 7 days
/manage-harvest --source analysis                    → harvest only from analysis sessions
/manage-harvest <target> --to wiki                   → force all findings to wiki
/manage-harvest <target> --to spec                   → force all findings to spec
/manage-harvest <target> --to issue                  → force all findings to issue
/manage-harvest <target> --to auto                   → auto-classify routing (default)
/manage-harvest <target> --dry-run                   → preview without writing
/manage-harvest --prune                              → classify artifacts, graduate to knowhow, archive from state.json
/manage-harvest --prune --age 14                     → only graduate artifacts older than 14 days
/manage-harvest --prune --dry-run                    → preview prune plan without modifying state.json
```

| Flag | Effect |
|------|--------|
| `--to <target>` | Force routing target: `wiki`, `spec`, `issue`, `auto` (default: auto) |
| `--source <type>` | Filter by source type: `analysis`, `brainstorm`, `import`, `debug`, `lite-plan`, `lite-fix`, `scratchpad`, `session`, `all` |
| `--recent N` | Only scan artifacts updated within last N days (default: 30) |
| `--dry-run` | Preview extracted items without writing to any store |
| `-y` / `--yes` | Skip confirmation prompts, accept all routing |
| `--min-confidence N` | Minimum extraction confidence 0.0-1.0 (default: 0.5) |
| `--prune` | State hygiene mode: classify artifacts, graduate harvested ones to knowhow, archive from state.json, prune accumulated_context. **Note:** `harvest --prune` *promotes* artifacts to knowhow (and trims state.json); this differs from `knowhow.md`'s `prune` operation which *deletes* knowhow entries. The two `--prune` flags share a name but operate on different stores in opposite directions. |
| `--age N` | Graduation age threshold in days (default: 14). Only artifacts older than N days are prune candidates. Used with `--prune` |

---

## Stage 1: parse_input

```
Verify .workflow/ exists (else E001). Parse flags and first non-flag token:
  mode: "scan" (no target) | "session" (ID match) | "path" (explicit path) | "prune" (--prune flag)
  Defaults: target_filter=auto, source_filter=all, recent_days=30,
            dry_run=false, auto_yes=false, min_confidence=0.5, age_threshold=14
Invalid --to → E002. Invalid --source → E003.
If --prune: mode = "prune", jump to Stage 9 (skip Stages 2-8).
```

---

## Stage 2: discover_artifacts

Scan `.workflow/` for harvestable artifacts. Each source type has a known structure:

### Source Registry

| Source Type | Scan Path | Key Files | ID Pattern |
|-------------|-----------|-----------|------------|
| `analysis` | `.workflow/.analysis/ANL-*/` | `conclusions.json`, `*.md` | `ANL-*` |
| `brainstorm` | `.workflow/scratch/*-brainstorm-*/` | `guidance-specification.md`, `*/analysis.md`, `design-research.md` | directory name |
| `lite-plan` | `.workflow/.lite-plan/*/` | `plan.json`, `plan-overview.md` | directory name |
| `lite-fix` | `.workflow/.lite-fix/*/` | `fix-plan.json` | directory name |
| `debug` | `.workflow/.debug/*/` | `debug-log.md`, `hypothesis-*.md` | directory name |
| `scratchpad` | `.workflow/.scratchpad/` | `*.md`, `*.json` | filename |
| `session` | `.workflow/active/WFS-*/` | `workflow-session.json` | `WFS-*` |
| `import` | `.workflow/scratch/*-import-*/` | `context-package.json`, `source.*` | directory name |
| `knowhow` | `.workflow/knowhow/` | `*.md`, `digest-*.md` | filename |

Scan each source type (filtered by `--source`). For each matching directory/file within `--recent` window, extract: `source_type`, `id`, `path`, `title` (from JSON or H1), `updated_at`, `summary`, `file_count`.

### Display candidates

```
=== HARVESTABLE ARTIFACTS ===

  #  Source       ID                    Title                    Updated       Files
  ─  ──────────  ────────────────────  ─────────────────────── ────────────  ─────
  1  analysis    ANL-auth-20260410     Auth vulnerability scan  2026-04-10      4
  2  brainstorm  brainstorm-cache      Cache strategy options   2026-04-08      3
  3  lite-fix    rate-limit-20260405   Rate limiter edge case   2026-04-05      2
  4  debug       debug-memory-leak     Memory leak in worker    2026-04-03      5

  Found: 4 artifacts (filtered by: last 30 days)
```

### Selection logic

| Mode | Action |
|------|--------|
| `scan`, 0 candidates | Print "No harvestable artifacts found", exit 0 |
| `scan`, ≥1 candidates | AskUserQuestion: select one, multiple (comma-separated), or "all" |
| `session` | Find matching session ID in candidates; error E004 if not found |
| `path` | Validate path exists; auto-detect source type from structure |

---

## Stage 3: load_and_extract (per selected artifact)

For each selected artifact, load all files and extract knowledge fragments.

### 3a. Load artifact content

Read all relevant files in the artifact directory. Build a content bundle:

```
bundle = {
  source_type: "analysis" | "brainstorm" | ...,
  id: session_id,
  path: artifact_directory,
  files: [{ name, content, type: "json"|"md" }],
  metadata: extracted from key files (conclusions.json, plan.json, etc.)
}
```

### 3b. Extract knowledge fragments

Parse content to identify discrete knowledge items. Each source type has specific extraction patterns:

**Analysis (`conclusions.json` + markdown):**
- `findings[]` → each finding is a fragment
- `recommendations[]` → each recommendation is a fragment
- `risks[]` → each risk is a fragment
- Markdown sections with `## ` headings → section-level fragments

**Brainstorm (`guidance-specification.md` + `{role}/analysis.md` + `design-research.md`):**
- guidance §4-§N Role Decisions tables → each row is a decision fragment
- guidance §10 Feature Decomposition rows → each feature is a fragment
- guidance §12 Cross-Role Resolutions table → each resolution is a decision fragment
- `{role}/analysis.md` §2 Decision Digest tables → decision / interface / position fragments by role
- `{role}/analysis.md` §3 Cross-Cutting Foundations subsections → architectural / data-model / pitfall fragments by role
- `{role}/analysis.md` §4 File Index → navigate to sub-files:
  - `{role}/analysis-F-{id}-{slug}.md` → per-feature decision fragments (one file = one fragment)
  - `{role}/findings-{slug}.md` → finding / discovery fragments
- `{role}/analysis.md` §5 Outstanding TODOs → task fragments
- `design-research.md` "Extractable Patterns" sections → pattern reference fragments

**Lite-plan (`plan.json`):**
- `tasks[]` → each with rationale → decision fragments
- `dependencies[]` → architectural constraint fragments
- `risks[]` → risk fragments

**Lite-fix (`fix-plan.json`):**
- `root_cause` → bug fragment
- `fix_strategy` → pattern fragment
- `verification` → test/validation fragment

**Import (`context-package.json` + `source.*`):**
- `requirements[]` → each requirement is a feature fragment
- `constraints[]` → each constraint is a decision fragment
- `non_goals[]` → each non-goal is a scope fragment
- `insights[]` → each insight is a knowledge fragment
- `domain.terminology[]` → each term is a terminology fragment
- `open_questions[]` → each question is a task/investigation fragment

**Debug (`debug-log.md`, `hypothesis-*.md`):**
- Final diagnosis → bug fragment
- Verified hypothesis → pattern/knowhow fragment
- Rejected hypotheses with reasoning → knowhow fragment

**Scratchpad (*.md):**
- Markdown sections → generic fragments
- Code blocks with explanations → pattern fragments

**Session (`workflow-session.json`):**
- `completed_tasks[].summary` → pattern/decision fragments
- `key_decisions[]` → decision fragments
- `deferred_items[]` → issue fragments

**Learning Insights (`specs/learnings.md`):**
- Each `<spec-entry>` → learning fragment (check if already routed to wiki/spec/issue)

Each fragment gets:
```
fragment = {
  id: "HRV-{8 hex}" from hash(source_id + content_hash),
  source_type: ...,
  source_id: ...,
  title: extracted or inferred,
  content: raw text,
  tags: extracted from context,
  category: "finding" | "decision" | "pattern" | "bug" | "risk" | "task" | "knowhow" | "recommendation",
  confidence: 0.0-1.0 (based on specificity and actionability)
}
```

Filter by `--min-confidence`.

**Context Package shortcut**: If any artifact has a `context-package.json` (check `state.json.artifacts[].context_package`), harvest can use it as a pre-extracted summary — skip detailed file parsing and directly convert context-package fields to fragments. The per-item `ref` field provides traceability to original sources.

---

## Stage 4: classify_routing

For each fragment, determine the best routing target (unless `--to` forces a specific target).

### Classification Rules

| Category | Default Target | Rationale |
|----------|---------------|-----------|
| `finding` | wiki (note) | Observations go to knowledge graph |
| `decision` | wiki (spec) or spec (decision) | Architectural decisions → spec ADR or wiki spec entry |
| `pattern` | spec (pattern) | Reusable code patterns → coding conventions |
| `bug` | issue or spec (bug) | Active bugs → issue; fixed bugs → spec learnings |
| `risk` | issue | Unmitigated risks → trackable issues |
| `task` | issue | Unfinished work → trackable issues |
| `knowhow` | wiki (knowhow) | Generalizable insights → wiki knowledge |
| `recommendation` | wiki (note) or issue | Actionable recommendations → issue; informational → wiki |

### Override with `--to`

`--to wiki|spec|issue` forces all fragments to that target. `--to auto` (default) uses classification rules above.

### Build routing plan

Group fragments into three buckets: `wiki` (fragment, wiki_type, slug, title, tags, body), `spec` (fragment, spec_type, content), `issue` (fragment, title, severity, description).

---

## Stage 5: preview_and_confirm

Display the routing plan:

```
=== HARVEST PLAN ===
Source: ANL-auth-20260410 (analysis)
Fragments extracted: 8 (filtered from 12 by confidence ≥ 0.5)

  → Wiki (3 entries):
    [note]   "SQL injection vector in user input"     tags: security, sql
    [knowhow] "Parameterized queries prevent injection" tags: security, pattern
    [spec]   "Auth token rotation policy"              tags: auth, security

  → Spec (2 entries):
    [pattern] "Always use parameterized queries for user input"
    [decision] "JWT refresh tokens over session cookies"

  → Issue (3 entries):
    [high]   "Unvalidated redirect in OAuth callback"
    [medium] "Missing rate limit on token refresh endpoint"
    [low]    "Inconsistent error messages leak internal state"

  Total: 3 wiki + 2 spec + 3 issue = 8 routed items
```

`--dry-run` → display and exit. Otherwise (unless `-y`), AskUserQuestion: "yes" (apply), "edit" (per-item accept/reject), "skip" (abort).

---

## Stage 6: route_outputs

Execute the routing plan. Each target uses existing infrastructure:

### 6a. Wiki routing

Create via `maestro wiki create --type <wiki_type> --slug harvest-<source_type>-<short_id> --title --tags --body`. Types: note/knowhow/spec. Fallback on failure: write `.workflow/harvest/wiki-pending-{id}.md` with frontmatter.

### 6b. Spec routing

Route via `Skill({ skill: "spec-add", args: "<spec_type> <content>" })`. Category mapping: pattern→pattern, decision→decision, bug→bug, knowhow→rule.

### 6c. Issue routing

For each issue item, append to `.workflow/issues/issues.jsonl` using the canonical schema from `workflows/issue.md`:

```json
{
  "id": "ISS-{YYYYMMDD}-{NNN}",
  "title": "<title>",
  "description": "<description>",
  "severity": "<high|medium|low>",
  "status": "open",
  "source": "harvest",
  "source_ref": "<source_id>",
  "tags": [],
  "created_at": "<ISO timestamp>",
  "issue_history": [{ "action": "created", "timestamp": "<ISO>", "by": "harvest", "detail": "Extracted from <source_type> <source_id>" }]
}
```

### 6d. Track harvest provenance

For each routed item, record in `.workflow/harvest/harvest-log.jsonl`:

```json
{
  "fragment_id": "HRV-...",
  "source_type": "analysis",
  "source_id": "ANL-auth-20260410",
  "routed_to": "wiki|spec|issue",
  "target_id": "note-harvest-analysis-abc123|ISS-20260413-001|...",
  "timestamp": "<ISO>",
  "title": "<title>",
  "confidence": 0.85
}
```

This log prevents duplicate harvesting in future runs.

---

## Stage 7: dedup_check

Before writing any item in Stage 6, check for duplicates across `harvest-log.jsonl` (by fragment_id), wiki (by title search), `issues.jsonl` (by title/description), and `specs/learnings.md` (by content). Duplicates are skipped with `[SKIP-DUP]` marker and logged to harvest report.

---

## Stage 8: report

Write `.workflow/harvest/harvest-report-{date}.md`:

```markdown
# Harvest Report — {date}

## Source
- Type: {source_type}
- ID: {source_id}
- Path: {path}

## Extraction Summary
- Fragments found: {total}
- Filtered by confidence: {filtered_count}
- Duplicates skipped: {dup_count}

## Routing Results

### Wiki ({N} entries)
| # | Type | Slug | Title | Status |
|---|------|------|-------|--------|
| 1 | note | harvest-analysis-abc | SQL injection vector | CREATED |
| 2 | knowhow | harvest-analysis-def | Parameterized queries | CREATED |

### Spec ({N} entries)
| # | Type | Content (truncated) | Status |
|---|------|---------------------|--------|
| 1 | pattern | Always use parameterized queries... | ADDED |

### Issue ({N} entries)
| # | Severity | Title | ID | Status |
|---|----------|-------|-----|--------|
| 1 | high | Unvalidated redirect in OAuth... | ISS-20260413-001 | CREATED |

## Skipped
| Fragment | Reason |
|----------|--------|
| HRV-abc123 | Duplicate: existing wiki entry note-sql-injection |
```

Display summary:

```
=== HARVEST COMPLETE ===
Source: ANL-auth-20260410 (analysis)

  Wiki:  3 created, 0 skipped
  Spec:  2 added, 0 skipped
  Issue: 3 created, 1 skipped (dup)

  Report: .workflow/harvest/harvest-report-2026-04-13.md
  Log:    .workflow/harvest/harvest-log.jsonl

Next:
  → Review wiki entries: maestro wiki list --type note
  → Triage issues: Skill({ skill: "manage-issue", args: "list --source harvest" })
  → Connect wiki graph: Skill({ skill: "wiki-connect", args: "--fix" })
  → View specs: Skill({ skill: "spec-load", args: "--role implement" })
```

---

## Stage 9: state_hygiene (--prune)

When `--prune` flag is present, skip Stages 2-8 and run state.json hygiene instead. Manages three concerns: **artifact graduation** (harvested → archived via knowhow), **accumulated_context pruning** (remove resolved/stale entries), and **integrity validation**.

### 9a. Load state

```
Read .workflow/state.json → { artifacts[], accumulated_context{}, current_milestone, milestones[] }
Read .workflow/harvest/harvest-log.jsonl → build harvested_map: { [source_id]: { fragment_count, routed_count, last_harvested } }
Defaults: age_threshold = --age value (default 14 days), dry_run = --dry-run flag
```

### 9b. Classify artifacts

For each artifact in `artifacts[]`, assign a classification:

| Classification | Criteria | Action |
|---|---|---|
| `active` | milestone == current_milestone OR age < age_threshold OR referenced by active plan (type=plan, status=completed, linked execute not completed) | **Keep** in artifacts[] |
| `graduated` | harvested == true AND not active | **Graduate** → knowhow → archive |
| `stale` | harvested == false AND not active AND age > age_threshold | **Suggest** harvest first |
| `protected` | type ∈ {plan, execute} AND linked downstream artifact is active | **Keep** regardless of age |

Age = days since `completed_at` (or `created_at` if never completed).

"Referenced by active plan": artifact X is protected if any plan artifact has `depends_on == X.id` or any execute artifact in same phase is active.

### 9c. Classify accumulated_context

Scan `accumulated_context` sub-arrays:

| Field | Prune Criteria | Keep Criteria |
|---|---|---|
| `key_decisions[]` | Entry exists verbatim in `specs/architecture-constraints.md` (deduplicated to spec) | Not yet in specs |
| `deferred[]` | status ∈ {"resolved", "cancelled", "superseded"} | status ∈ {"open", "deferred"} |
| `blockers[]` | status == "resolved" | status ∈ {"open", "investigating"} |

### 9d. Preview

```
=== STATE HYGIENE PLAN ===

  Artifacts (23 total):
    active:     8   (keep)
    graduated:  11  (→ knowhow → archive)
    stale:      3   (suggest harvest first)
    protected:  1   (keep)

  Accumulated Context:
    key_decisions:  12 total → 4 prunable (already in specs)
    deferred:        5 total → 2 prunable (resolved)
    blockers:        3 total → 1 prunable (resolved)

  Stale artifacts (not yet harvested):
    ANL-003  analysis  2026-03-15  "Security audit P2"
    BRN-002  brainstorm 2026-03-10  "Cache strategy"
    WFS-005  session   2026-03-08  "Feature toggle impl"
    → Run: /manage-harvest ANL-003 BRN-002 WFS-005  (harvest before graduating)

  Estimated state.json reduction: 23 → 9 artifacts, 20 → 13 context entries
```

`--dry-run` → display and exit. Otherwise (unless `-y`), AskUserQuestion:
- "Proceed" — apply all
- "Graduate only" — archive graduated artifacts, skip accumulated_context prune
- "Harvest stale first" — run harvest on stale artifacts, then re-classify
- "Abort"

### 9e. Graduate to knowhow

For each `graduated` artifact:

1. **Build compact summary** from harvest-log entries:
   - Fragment count, routing breakdown (N wiki, N spec, N issue)
   - Top 3 fragment titles as representative items
   - Original path for disk reference

2. **Create knowhow entry**:
   ```bash
   maestro wiki create --type knowhow \
     --slug "graduated-{type}-{short_id}" \
     --title "Graduated: {type} {id}" \
     --tags "graduated,{type},{milestone}" \
     --body "{compact_summary}"
   ```

3. **Archive in state.json**: Move from `artifacts[]` to `artifact_archive[]`:
   ```json
   {
     "id": "ANL-001",
     "type": "analyze",
     "milestone": "M1",
     "path": "scratch/20260315-analyze-P2-security",
     "graduated_at": "ISO-8601",
     "knowhow_ref": "graduated-analyze-ANL-001",
     "summary": "Security audit P2 — 8 fragments → 3 wiki, 2 spec, 3 issue"
   }
   ```

4. **Files on disk**: NOT deleted. The `.workflow/{path}/` directory remains for reference. Only the state.json entry moves.

### 9f. Prune accumulated_context

For each prunable entry identified in 9c:
- `key_decisions[]`: remove entry, log `[PRUNE] key_decision: "{text}" (deduplicated to spec)`
- `deferred[]`: remove entry, log `[PRUNE] deferred: "{title}" (status: {status})`
- `blockers[]`: remove entry, log `[PRUNE] blocker: "{title}" (resolved)`

### 9g. Apply

1. **Backup**: Copy `state.json` → `state.json.backup-prune-{timestamp}`
2. **Write**: Updated state.json with:
   - `artifacts[]` = active + protected entries only
   - `artifact_archive[]` = existing archive + newly graduated
   - `accumulated_context` = pruned version
   - `last_pruned`: ISO-8601 timestamp
3. **Validate**: Re-read and confirm artifact count matches expected

### 9h. Report

Append prune results to harvest report:

```
=== PRUNE COMPLETE ===

  Graduated:  11 artifacts → knowhow
  Archived:   11 entries moved to artifact_archive[]
  Pruned:     4 key_decisions + 2 deferred + 1 blocker = 7 context entries

  State reduction: 23 → 9 artifacts, 20 → 13 context entries
  Backup: .workflow/state.json.backup-prune-20260521T143022

  Stale (not harvested, action needed):
    → /manage-harvest ANL-003 BRN-002 WFS-005

  Next:
    → Review graduated knowhow: maestro wiki list --type knowhow --tags graduated
    → Re-run prune after harvesting stale: /manage-harvest --prune
```

### Safety invariants

1. **Never prune current milestone artifacts** — active classification takes precedence
2. **Never delete files on disk** — only state.json entries move; files remain for reference/audit
3. **Backup before write** — always create `state.json.backup-prune-{timestamp}`
4. **Stale before graduate** — stale artifacts are flagged, not silently archived (knowledge would be lost)
5. **Spec dedup is conservative** — key_decision pruned only if verbatim match found in specs
6. **Idempotent** — re-running `--prune` with no changes produces empty plan
