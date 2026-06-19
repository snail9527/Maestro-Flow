---
name: maestro-update
description: Detect version, preview changes, apply workflow upgrades
argument-hint: "[--dry-run] [--force] [--setup-only]"
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, request_user_input
---
<purpose>
Version router — detect current version, run schema migration to latest, then follow the version-specific smart upgrade workflow.

Migration scripts live in two layers:
- **Schema** (`src/migrations/`): code-level state.json transforms, auto-chained by registry
- **Workflow** (`~/.maestro/workflows/updates/`): version-specific upgrade guides with environment setup

Schema migrations handle the mechanical version bump. Workflow docs handle the smart part — what the user needs to know, configure, or verify for that version. The router runs schema first, then loads the matching workflow doc.
</purpose>

<required_reading>
@~/.maestro/workflows/updates/README.md
</required_reading>

<context>
$ARGUMENTS — optional flags.

**Flags:**
- `--dry-run` -- Preview migration plan without executing
- `--force` -- Skip confirmation prompts
- `--setup-only` -- Skip schema migration, run only the setup for current version

**Version source:** `.workflow/state.json` → `version` field
</context>

<execution>

### Step 1: Detect Version

```
1. Read .workflow/state.json → extract version (default "1.0" if missing)
2. Display current version
```

IF `--setup-only`:
  → Load `~/.maestro/workflows/updates/update-v{version}-setup.md`
  → IF exists: follow completely, then EXIT
  → IF not exists: display "No setup script for v{version}" → EXIT

### Step 2: Check for Updates

```
1. Run: npx tsx src/migrations/run.ts "$(pwd)" --dry-run --json
2. IF up-to-date → offer setup if available → EXIT
3. Display target version
```

IF `--dry-run` → EXIT.

### Step 3: Execute

```
1. Confirm (unless --force)
2. Backup state.json
3. Run schema migration (auto-chains all intermediate steps)
4. Load update-v{target}-setup.md → follow completely
```

### Step 4: Summary

Display version change, backup path, next steps.

</execution>

<success_criteria>
- [ ] Version detected, schema migration run, setup doc followed
- [ ] --setup-only, --dry-run, --force flags handled
</success_criteria>
