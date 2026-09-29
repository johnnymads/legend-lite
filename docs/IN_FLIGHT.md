# In flight

**Start at `docs/EXECUTION_PLAN_2026_09_26.md` §0.** It holds the current item ("Now"), the session checklist, the
decisions and the order. This file only says who is working and what rules apply between sessions; it carries no status
of its own (plan rule 0b.16).

- **One session owns the whole repository** (since 2026-09-29; the user stopped every other session). The two-session
  handshake that lived here is retired; its text is in git history at `caf0cf71f`.
- **The compiler rebuild lands on `main`** slice by slice (D18): each slice is gated by `bazel test //...` and `bazel test
  //tools/deps:all` on the exact tree, then pushed with `git push origin HEAD:compiler/rebuild HEAD:main`.
- **Paused while the rebuild runs:** `docs/SERVER_PROGRAM_2026_09_26.md` (its legs are SV0–SV3, not the rebuild's W0–W7),
  the DataCube feature programs (`docs/DATACUBE_*`), NLQ (the untracked `nlq/` directory is not ours; leave it).

## Rules between sessions

1. Never force-push; never bare `git stash` (the stash stack is shared by every worktree).
2. Before pushing, `git fetch origin`; `main` must fast-forward.
3. The gate chain is `bazel test //...` then `bazel test //tools/deps:all`; `//parser-equivalence:diagnostics` runs only on
   its triggers (a pin bump, a parser/lexer/protocol change, a corpus manifest change).
4. A timing is a lane run alone with `--nocache_test_results`, load under 3 at the start, nothing else building.
5. If a second line of work starts again, this file becomes the handshake again: each side's owned area, cross-area edits
   announced one line each before they land, and dated status lines.
