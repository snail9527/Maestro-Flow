# Workflow: Issue Analysis

> **DEPRECATED**: Superseded by `issue-gaps-analyze.md` which adds batch support and context.md output.
> Use `maestro-analyze --gaps [ISS-ID]` instead.

This workflow's executable steps have been removed to prevent divergent implementations.

## Migration

| Old usage | New usage |
|-----------|-----------|
| `manage-issue-analyze ISS-ID` | `/maestro-analyze --gaps ISS-ID` |
| `manage-issue-analyze` (batch) | `/maestro-analyze --gaps` |
| `manage-issue-plan ISS-ID` (follow-up) | `/maestro-plan --gaps ISS-ID` |

## See Also

- `issue-gaps-analyze.md` — current implementation (single + batch, classification, parallel exploration, context.md)
- `issue-gaps-analyze.codex.md` — codex variant using `spawn_agents_on_csv` waves
- `issue-execute.md` — downstream execution after planning

## Notes

- Issue records analyzed by the new pipeline still write to `.workflow/issues/issues.jsonl` with `analysis` field (root_cause, impact, related_files, confidence, suggested_approach, analyzed_at, analyzed_by).
- Status is unchanged by analysis (non-destructive enrichment).
