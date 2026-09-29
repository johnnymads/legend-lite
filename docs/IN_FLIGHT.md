# In flight: who is changing what

**Since 2026-09-29 one session owns the whole repository** (the user stopped every other session). There is no second
line of work to coordinate with, so the two-session handshake that lived here is retired; its full text and status lines
are in git history at `caf0cf71f`.

## What is in flight

- **The compiler rebuild**, on branch `compiler/rebuild` (draft PR against `main`), executing
  `docs/EXECUTION_PLAN_2026_09_26.md` wave by wave. Every slice on the branch is gated green by `bazel test //...` and
  `bazel test //tools/deps:all` before it is pushed; `main` fast-forwards at wave boundaries and stays the last known-good
  product.
- **State 2026-09-29:** all homework done (H1-H6). W0 done except W0.4 (waits on D6). W1.6 done. Next: W1.1, the
  reference lane. Seven decisions are open in the plan's §2 (D6-D12).
- The other account's Bazel server, datacube server and legend-engine server have stopped; timings are possible again
  (plan rule 0.7).

## Rules that remain

1. Never force-push; never bare `git stash`.
2. Before pushing, fetch and rebase on the branch's upstream.
3. The gate chain is `bazel test //...` then `bazel test //tools/deps:all`; `//parser-equivalence:diagnostics` runs only on
   its triggers (a pin bump, a parser/lexer/protocol change, a corpus manifest change).
4. A timing is a lane run alone with `--nocache_test_results`, load under 3 at the start, nothing else building.
5. If a second line of work starts again, this file becomes the handshake again: each side's owned area, cross-area edits
   announced one line each before they land, and dated status lines.
