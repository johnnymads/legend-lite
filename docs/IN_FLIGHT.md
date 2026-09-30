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

## A second line, 2026-09-29: DataCube against the warehouse (the user's ask, rule 5)

In the worktree `legend-lite-dcsnap`, branch `datacube-live-snap`. **Owns:** `datacube/`. **Touches `warehouse/`** (one
line each, announced here before landing):
- `server/Identity.java`, `server/WarehouseServer.java`: `POST /sql/v1/token/refresh` (a valid token for a fresh one,
  never past the sign-in's session limit, 12h default); tokens carry their sign-in time (`principal|expiry|signedInAt`);
  `--token-key-file` (a key kept across restarts), `--token-minutes`, `--session-hours`; `Config.sessionLimit`.
- `server/Statements.java` (+ `Identity.hasUser`): a GRANT must name an object (or schema) that exists and a
  grantee (or role member) who is a user or role; REVOKE stays open. Test:
  `WarehouseEntitlementsTest.aGrantNamesSomethingThatIsThereForSomeoneWhoIs`.
- `sqlapi/SqlApiBinding.java`, `sqlapi/NativeBinding.java`: `refresh(token)`. Tests: `IdentityTest` (new),
  `WarehouseServerTest.aValidTokenRefreshesAndTheFreshOneWorks`.

**Touches CI** (`.github/workflows/gates-run.yml`, `gate.yml`): a `browser` lane, Linux only --
`//datacube:live_snap_test` and the `browser-ci` harnesses; the other lanes unchanged. `docs/GATES.md`: its row.

Nothing in `core/`, `spec/`, `tools/`. Runs a warehouse (`:9090`) and the DataCube site (`:8000`), idle: stop them before
a timing (rule 4).

## A third line, 2026-09-30: DataCube track A and the BI plan (the user's ask, rule 5)

`docs/BI_AND_ETL_PLAN_2026_09_29.md`; the user: "start track A now, and go in the suggested order for everything that does
not need any server side work". **Owns:** `datacube/` (and its CI lane). No edit in `core/`, `spec/`, `tools/` or
`warehouse/`; the plan's server-side items (F1 write, F2's resolver, F4, F5, unpivot) wait for the rebuild's say (§8).

## Rules between sessions

1. Never force-push; never bare `git stash` (the stash stack is shared by every worktree).
2. Before pushing, `git fetch origin`; `main` must fast-forward.
3. The gate chain is `bazel test //...` then `bazel test //tools/deps:all`; `//parser-equivalence:diagnostics` runs only on
   its triggers (a pin bump, a parser/lexer/protocol change, a corpus manifest change).
4. A timing is a lane run alone with `--nocache_test_results`, load under 3 at the start, nothing else building.
5. If a second line of work starts again, this file becomes the handshake again: each side's owned area, cross-area edits
   announced one line each before they land, and dated status lines.
