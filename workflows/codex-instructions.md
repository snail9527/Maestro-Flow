# Codex Code Guidelines
## Delegate & CLI

- **Delegate Usage**: @~/.maestro/workflows/delegate-usage.md
- **CLI Endpoints Config**: @~/.maestro/cli-tools.json

**Strictly follow the cli-tools.json configuration**

## Core Principles

- Follow project's existing patterns and conventions
- Single responsibility, DRY, YAGNI
- Small testable changes, commit frequently
- Study 3+ similar patterns before implementing
- Boring solutions over clever code

**Git Operations:**
- Only stage/commit files produced by current task
- Use `git add <specific-files>` instead of `git add .`

**Multi-CLI Coexistence (CRITICAL):**
- Conflicts with uncommitted changes → **STOP and report**, never overwrite

## Knowledge System

**ALWAYS search before acting.** Never assume context is pre-loaded.

### Search Commands

- `maestro search "<query>" [--type spec|knowhow|issue] [--category <cat>]`
- `maestro spec load --category <cat>` / `--keyword <kw>`
- `maestro kg search <symbol>` / `maestro kg context <node>`

### Proactive Search — ALWAYS Execute

**L0 — Every task, no exceptions:**
- `maestro search "<feature/module keywords>"`

**L1 — Unfamiliar code:**
- `maestro kg search "<symbol>"`
- `maestro kg context <file-or-symbol>`

**L2 — Architecture / debugging / refactoring / tests:**
- `maestro search --type spec --category arch`
- `maestro kg callers <fn>` / `maestro kg callees <fn>` 
- `maestro search --type spec --category test "<module>"`
- `maestro kg search "<module>" --code`

### Record

- **Spec** → `/spec-add <category> "title" "content" --keywords kw1,kw2 --description "summary"`
- **Knowhow** → persist non-obvious knowledge (deviations, root causes, constraints)

Category routing: decisions→`arch`, patterns→`coding`, pitfalls→`debug`/`learning`, rules→`review`, tests→`test`.
