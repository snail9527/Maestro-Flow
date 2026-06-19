# Maestro

- **Coding Philosophy**: @~/.maestro/workflows/coding-philosophy.md

## Delegate & CLI

- **Delegate Usage**: @~/.maestro/workflows/delegate-usage.md
- **CLI Endpoints Config**: @~/.maestro/cli-tools.json

**Strictly follow the cli-tools.json configuration**

## Knowledge System

**ALWAYS search before acting.** Never assume context is pre-loaded.

### Search Commands

| Layer | Command | Purpose |
|-------|---------|---------|
| **1. Unified** | `maestro search "<query>" [--type spec\|knowhow\|issue] [--category <cat>]` | All knowledge types |
| **2. Domain rules** | `maestro spec load --category <cat> [--keyword <kw>]` | Load rules before coding |
| **3. Code structure** | `maestro kg search <symbol>` / `maestro kg context <node>` | Dependencies, call chains |


### Proactive Search — ALWAYS Execute

**L0 — Every task, no exceptions:**
- `maestro search "<feature/module keywords>"`

**L1 — Unfamiliar code:**
- `maestro kg search "<symbol>"`
- `maestro kg context <file-or-symbol>`

**L2 — Architecture / debugging / refactoring / tests:**
- `maestro search --type spec --category arch`
- `maestro kg callers <fn>` / `maestro kg callees <fn>` (注意: `--json` 返回 `{node, callers/callees: [...]}` 对象，非数组)
- `maestro search --type spec --category test "<module>"`
- `maestro kg search "<module>" --code`

### Record

- **Spec** → `/spec-add <category> "title" "content" --keywords kw1,kw2 --description "summary"`
- **Knowhow** → `/manage-knowhow-capture` (use `--spec-category <cat>` to bridge into agent injection)

Category routing: decisions→`arch`, patterns→`coding`, pitfalls→`debug`/`learning`, rules→`review`, tests→`test`.
