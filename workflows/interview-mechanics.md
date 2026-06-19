# Interview Interaction Mechanics

- **One decision per turn** via AskUserQuestion, 2-4 options, first marked `(Recommended)`. User can redirect via `Other`.
- **Search-first**: resolve via state.json → session artifacts → `maestro spec/wiki` → Glob/Grep/Read → Agent(Explore) / delegate. Never ask what code can answer.
- **Writeback**: each decision **immediately written to disk** before the next question. No batching.
- **Skip**: auto mode (`-y`), resume (`-c`), or unambiguous input → skip entire interview.
- **Decision table**: `| # | Decision | Choice | Source (user / code / default) |`
