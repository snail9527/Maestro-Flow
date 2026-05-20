# Maestro Delegate Execution Protocol (Codex)

`maestro delegate` is a long-running shell command (30s–5min+). All Codex agents MUST follow this polling protocol when executing delegate calls.

## Execution Steps

### Step 1: Start Delegate

```
exec_command({
  cmd: `maestro delegate "<PROMPT>" [options]`,
  yield_time_ms: 30000,
  max_output_tokens: 6000
})
```

- `yield_time_ms: 30000` — wait up to 30s for initial output
- If the command completes within yield time → result is final, proceed to Step 3

### Step 2: Poll Loop (if session_id returned)

If `exec_command` returns `{ session_id: N, ... }` (command still running), enter poll loop:

```
poll_interval = 15000   // start at 15s

LOOP:
  result = write_stdin({
    session_id: <session_id>,
    chars: "",
    yield_time_ms: poll_interval,
    max_output_tokens: 6000
  })

  IF result indicates command completed → BREAK, proceed to Step 3
  IF result indicates command still running:
    poll_interval = min(poll_interval * 2, 60000)   // backoff: 15s → 30s → 60s cap
    GOTO LOOP
```

### Step 3: Parse Result

Extract the delegate output (assistant response) from the final result. Parse according to the caller's expected format (JSON, structured text, etc.).

## Invariants

| Rule | Description |
|------|-------------|
| **NEVER skip polling** | Delegate output is required for workflow continuation. If session_id is returned, you MUST poll until completion. |
| **NEVER abandon session** | Do not move to next workflow step while delegate is still running. |
| **NEVER fire-and-forget** | Every delegate call must be awaited and its result consumed. |
| **Increasing backoff** | Poll intervals: 15s → 30s → 60s (capped). Prevents unnecessary load. |
| **Error still completes** | If output contains error/failed, still finish reading the full output before handling the error. |
| **Timeout escalation** | If polling exceeds 5 minutes total, report as blocker but do NOT abandon — continue polling. |

## Quick Reference

```
// Compact pattern for inline use:
//
// 1. exec_command({ cmd: `maestro delegate "..."`, yield_time_ms: 30000 })
// 2. If session_id → poll write_stdin({ session_id, chars: "", yield_time_ms: 15000→60000 })
// 3. Parse result after completion
// ⚠️ MUST poll until completion — NEVER skip
```
