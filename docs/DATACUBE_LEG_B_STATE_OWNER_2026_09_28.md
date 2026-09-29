# DataCube Leg B — one state owner (theme T5, audit leg 10) — groundwork, 2026-09-28

The production audit's theme T5 (`DATACUBE_PRODUCTION_AUDIT_2026_09_26.md`): "cube state has many
owners and no single commit or rollback". Its root cause: *no single immutable state is replaced
atomically on success and restored whole on refusal; each component holds its own snapshot captured
when it was built.* Leg 10's target: apply succeeds or rolls back as a whole; machine re-runs are not
undo steps; latest wins across undo, refresh, drill and sign-in; every listener removed on dispose;
editors apply against live state. This document is the groundwork: every entry re-checked against
the code as it is today, where the state lives, the design, and the slices.

## 1. Where the cube's state lives today (read in code)

| holder | what it holds | written by |
|---|---|---|
| `CubeApp` (`src/app.ts`) | `#snapshot`, `#config`, `#view`, `#treeRows`, `#formats`, `#selection` | 15 `this.#snapshot =` and 10 `this.#config =` sites; `#onView` copies the controller's view back |
| `CubeController` (`src/cube.ts`) | `#snapshot`, `#tree`, `#view`, `#lastState`, `#history` (past/future) | `update`, `toggle`, `setTree`, `adoptTree`, `#applyHistory` → `#install`; `#remember` records BEFORE the query runs |
| `PivotPanel` ×2 (`src/ui/pivot-panel.ts`) | `#state` {rows, columns} | its own drags (and builds the next change from it); `setColumns` from the app |
| Properties editor (`src/ui/editor.ts`) | `#draft`, `#opened` | opened from the app's state; Apply records `#opened = #draft` after an await |
| Filters window, Sorts / Dimensions tabs | copies captured when built | their own controls |
| Ad Hoc (`src/adhoc/session.ts`, `mode.ts`) | `#grid`, `#past`, `#future`, `#last` | its steps; built from the app's (optimistic) snapshot on entry |
| the host page (`demo/boot.ts`) | `current` (file, handle, saved-cube id, baseline) | open, save; no ordering guard between opens |

A change today: the app sets its own `#snapshot`/`#config`, repaints zones and panels, then calls
`controller.update`, which records history and installs the snapshot BEFORE the query; a refusal
restores only the app's `#snapshot` (sometimes the config), nothing else.

## 2. The audit entries, re-checked today

Status: **open** (the cited mechanism is unchanged), **overtaken** (the code it describes is gone),
**partial**.

| entry | what | status today |
|---|---|---|
| P2-99 | the automatic pivot-cast re-run records an undo step | **closed B1b**: machine re-runs (`open`, refresh after a snap, reload) record nothing; group-stage types come back IN the run's view (`withGroupStageTypes`), no second write. `test/cube-transactions.test.ts` "opening again … records nothing" (red before) |
| P2-100 | a refusal rolls back only the app's snapshot; the controller keeps the refused one | **closed B1b**: one owner; a refusal repaints from `committed` and records no step. "leaves no undo step…" (red before) |
| P2-101 | a failed expand/collapse leaves the tree flipped | **closed B1b**: the tree is part of the transaction. "a refused expand leaves the group closed" (red before) |
| P2-102 | after a refused zone change the zones keep the refused layout | **closed B1b**: `#onState` repaints the zones from the state on every event. "a refused zone change puts the zones back" (red before) |
| P2-103 | a chip move is two changes; a refused move drops the grouping | **closed B1c**: the panel reports one `ZoneLayout` per gesture. `test/cube-transactions.test.ts` "a chip dragged … is ONE change" (red before: "2 changes were undone") |
| P2-104 | a superseded refresh turns the busy signal off while the newer one runs | **closed B1b**: busy is `owner.busy`. "a superseded run ending does not turn busy off…" (red before) |
| P2-105 | `dispose()` stops nothing: late queries, listeners, callbacks outlive the cube | **closed B3**: `dispose` unsubscribes from the owner, cancels the change in flight (its query stopped), silences the host, removes the shortcuts, closes the windows. `test/cube-transactions.test.ts` "a disposed cube stops" (red before: a late answer reached the host) |
| P2-106 | an action during an in-flight Undo mixes states and loses the redo | **fixed by B1b** (the owner lands the undo AND the change; undo returns to where the change was made); pinned in B2 by `test/cube-transactions.test.ts` "a change made while an Undo runs" — passed on first run |
| P2-107 | overlapping Undos roll back to a state never rendered | **fixed by B1b** (two presses are two steps over the stack); pinned in B2 by "two quick Ctrl-Z …" — passed on first run |
| P2-108 | Undo restores the configuration but not appearance, zones or title bar | **closed B1b**: one paint from the state (`#paintState`). "the zones and the title bar come back with the state" (red before) |
| P2-109 | the history key ignores groups collapsed from an expand level | **fixed by B1a/B1b** (`TreeState.key` sees closed groups and the expand level); pinned in B2 by "collapsing a group opened by the expand level is a step" — passed on first run |
| P2-110 | during a refresh the context menu pairs the old rows with the new snapshot | **closed B1c, COMPLETED in the cleanup**: B1c moved the menu's column resolution to the state on screen (`#shown`) but left its column facts, kinds and the formats' kinds on the pending state -- the claim overstated it (found by the leg's self-audit). Now everything the menu reads off the rows reads `#shown`. `test/cube-transactions.test.ts` (red before: `desk = 'EMEA'` on a region row); the kind-change case is a pin (it passed before too) |
| P2-114 | fire-and-forget calls: unhandled rejections; failed presentation changes keep the new config | **closed B1b**: presentation runs no query; `change` never throws (it returns an outcome). "a presentation change runs no query…" (red before) |
| P2-127 | the host TOGGLES instead of applying the requested expand state | **closed B1b**: `tree.setOpen(path, expanded)`. "two quick clicks … leave it open" (red with the toggle put back) |
| P2-131 | drill-through has no stale-result guard | **closed B3**: drills are latest-wins. "two drill-throughs: the LATER one is shown" (red before: the earlier answer, arriving last, took the window) |
| P2-144 | the Filters window keeps an old copy and its Apply overwrites newer changes | **closed B4**: the Filters window follows the filter the cube HAS (`FilterEditor.rebase` on every state event): unedited it shows it; with edits kept, the next OK says the cube's filter changed, the one after replaces it knowingly. `test/cube-transactions.test.ts` both orders (red before: OK dropped the condition added elsewhere) |
| P2-150 | reopening Filters rewrites '' / numeric-looking / quoted values | **closed B4, reworked in the cleanup (USER 2026-09-28: stored values)**: B4 made the display text round-trip (quoting `''` and quoted text); now a condition read from the cube keeps its STORED value and publishes it exactly while untouched -- only an edited condition's text is read. `test/filter-editor.test.ts` (both the round trip and the edited/moved cases) |
| P2-152 | a serializer refusal throws from compile: the column editor hangs, Apply silently does nothing | **closed B4**: a refusal while BUILDING the queries is returned (`{refusal}`, no query to show); other failures stay failures and are reported (column editor, Properties Apply). `test/cube-transactions.test.ts` + `test/column-editor.test.ts` "a compile that FAILS" (red before: a rejected promise; "Compiling…" forever) |
| P2-169 | an Apply that also changes root aggregation / expand level loses its row, pivot and sort edits | **fixed by B1b** (86bc9f06e: the Apply is one transaction, tree included); pinned in B1c by "a Properties Apply is ONE transaction" (lands and refuses whole) — passes on B1b's code, not re-run against the code before it |
| P2-170 | edits made while an Apply runs are recorded as applied | **closed B4**: the editor records what it SENT, and ignores Apply while one runs. `test/editors-live.test.ts` (red before: a second Apply ran; the edit made meanwhile never reached the cube) |
| P2-171 | the Sorts tab's direction dropdown reads a stale map | **closed B4**: the Sorts dropdown reads the draft on every render. `test/editors-live.test.ts` (red before: showed Descending for a sort the draft held ascending) |
| P2-187 | the Dimensions editor loses hierarchy edits on rename/Add | **closed B4**: every Dimensions handler reads the draft live; the count badge follows the hierarchy. `test/editors-live.test.ts` (red before) |
| P2-210 | a result arriving mid column-resize leaves the drag stuck | **closed B3**: `setColumns` ends a drag in progress, keeping the width dragged so far. `test/grid-resize.test.ts` (red before: the drag never ended and the width stuck) |
| P2-220 | every toolbar rebuild adds a document keydown listener | **closed B1b** (pulled forward: B1b repaints the title bar on every event): `#listenForKeys`, once. "one Ctrl-Z is ONE undo step" (red with the per-rebuild listener put back) |
| P2-221 | Escape in a text field closes the whole window and drops its draft | **closed B3**: Escape in a text field stays in the field. "Escape in a text field stays in the field" (red before) |
| P2-259 | a failed Ad Hoc step is still committed | **closed B5a**: the session runs on the SAME owner as the cube (`StateOwner` + Ad Hoc's rules): a step commits only when its answers land. `test/adhoc-transactions.test.ts` (red before: the POV moved though the query failed) |
| P2-260 | an Ad Hoc option change re-places old answers on a changed grid | **closed B5a**: an option re-places the answers ON SCREEN (`represent` of the rendered grid); turning Navigate Without Data off queries a grid that waited. `test/adhoc-transactions.test.ts` (red before: 75/35/40 under an EMEA POV) |
| P2-261 | an Ad Hoc option changed while a query runs is lost | **closed B5a**: a presentation change made while a step runs lands on the view too (`represent` at landing). `test/adhoc-transactions.test.ts` (red before: the landed view dropped 2022) |
| P2-268 | Navigate Without Data status inverted | **closed B5a**: "(not refreshed)" and the warning say what is TRUE (`session.stale`: the view does not answer the grid). `test/adhoc-transactions.test.ts` (red with the old status logic put back) |
| P2-269 | old view's headers laid out with the new grid's depth | **no longer reproduces** (re-tested: with the old depth put back the headers still read right -- the column model no longer depends on it); the mode lays out with the grid the view answers (`shownGrid`) anyway; pinned by `test/adhoc-transactions.test.ts`, not claimed |
| P2-270 | exiting Ad Hoc does not cancel an in-flight step | **closed B5a**: `destroy` cancels the step in flight (`session.dispose`) and the mode says nothing after. `test/adhoc-transactions.test.ts` (red before: an error window for a mode that was gone) |
| P2-280 | Member Selection re-raised in its old place after the dimension moves | **closed B5c**: a Member Selection window open for the dimension in another place is closed, not raised; an OK after the dimension moved says so. `test/adhoc-transactions.test.ts` (red with the old raise put back) |
| P2-282 | Ad Hoc Undo/Redo always query | **closed B5a**: with Navigate Without Data on, undo and redo commit without a query (`StateRules.defer`). `test/adhoc-transactions.test.ts` (red before: 3 queries) |
| P2-283 | Settings do not reach Ad Hoc | **closed B5b**: Settings reach Ad Hoc -- the history limit (its session), the row buffer (its grid), Debug Mode (its queries logged). `test/cube-transactions.test.ts` (red before: 12 undo steps kept under a limit of 10) |
| P2-284 | the menu's Undo/Redo state reflects the hidden cube in Ad Hoc | **closed B5b**: the menu's Undo/Redo read the Ad Hoc session while it is on. `test/cube-transactions.test.ts` (red before) |
| P2-287 | the cube's Filter button stays under the Ad Hoc grid | **closed B5b**: the status bar is Ad Hoc's while it is on: no cube Filter/Properties links. `test/cube-transactions.test.ts` (red before) |
| P2-288 | Save View in Ad Hoc saved the hidden cube | **closed B5b** (successor: the Cubes window): `app.saveRefusal()` -- in Ad Hoc a save says it keeps the cube, not the layout on screen, and the host's Save refuses with that message. `test/cube-transactions.test.ts` (red before: no refusal) |
| P2-289 | cube-only entries offered in Ad Hoc re-query the hidden cube | **closed B5b**: the cube's own entries (Properties, drag zones, dimensions, Ctrl-E, Filters, column editor) are disabled or refused in Ad Hoc (`#cubeOnly`); Settings > Reload reloads Ad Hoc. `test/cube-transactions.test.ts` (red before) |
| P2-290 | the status bar shows the hidden cube's counts under Ad Hoc | **closed B5b**: the status bar shows Ad Hoc's own counts (`#renderAdHocStatus`, fed by the mode's `onView`). `test/cube-transactions.test.ts` (red before) |
| P2-291 | entering Ad Hoc during a pending filter carries a filter later refused | **closed B5c**: Ad Hoc is built from the cube ON SCREEN (`owner.committed`), never a change in flight. `test/cube-transactions.test.ts` (red before: EMEA pinned from an unaccepted filter) |
| P2-297 | re-sign-in never reaches the open cube (old token) | **closed B6**: `WarehouseEngine.renew` takes a fresh token for the same user (anyone else refused, said); the host renews the open cube's engine on Connect. `test/warehouse-session.test.ts` (red before: no way to renew; the engine kept its first token). The host wiring has no warehouse in the harness: reviewed, not driven |
| P2-299 | the shared model parse is tied to the first query's signal | **overtaken**: the engine client sends the model per request (E8); nothing shared is parsed |
| P2-330 | concurrent file opens have no ordering guard | **did not reproduce** (a large file then a small one: DuckDB serialises the two reads, so the first picked finishes first); the latest-wins guard is added anyway -- nothing else guarantees the order -- and pinned by `demo/verify-cubes.mjs` "the LAST file picked wins"; not claimed |
| P2-334 | a failed warehouse re-sign-in keeps the previous user's tables | **closed B6**: `connect` signs in and lists as ONE step; the host clears the previous listing first and takes nothing until both succeed. `test/warehouse-session.test.ts` (red before: no one-step sign-in). Host wiring reviewed, not driven (no warehouse in the harness) |
| P2-337 | choosing a plane navigates away, losing work | **closed B6**: leaving the page OR switching plane asks whenever the tab holds work (an opened file, a warehouse session, unsaved changes), and a plane switch carries the query string. `demo/verify-cubes.mjs` "choosing another plane with a file open asks first" (red before: it navigated away) |

Saved views (T5's P2-70–79) are closed by their replacement: the saved cube (789227f08) saves and
opens the whole cube, versioned, as a replacement not a merge.

## 3. The design (revised after the plan's own audit, 2026-09-28)

**One owner, `CubeStateOwner` (`src/cube-state.ts`)**, holding one immutable
`CubeState {snapshot, configuration, tree}` in three places:

- `committed` — the last state the user's actions produced and the engine ACCEPTED, as the engine
  returned it (the query's step 0 adds the compiler's types, so the view's snapshot is what is
  committed, never the one that was sent: history and "changed since saved" then compare like with like);
- `rendered` — the state of the view on screen (differs from `committed` only while a query runs);
- `pending` — the transaction in flight, if any.

Everything reads from the owner: presentation (zones, panels, title bar, formats, appearance) paints
`current = pending ?? committed`; anything derived from the rows on screen (context menu, drill, value
filters) reads `rendered` with its view (P2-110). Nothing else holds a copy.

**Two kinds of change, decided by the query itself, not by a list of settings.** A change NEEDS a
query exactly when the query it produces differs: the snapshot folded with the configuration
(`applyToSnapshot`) or the open rows differ from the committed ones. So:

- a **presentation change** (colours, fonts, widths, formats, labels, pins, hidden columns, heatmaps,
  titles) commits at once, runs no query and cannot be refused;
- a **query change** (grouping, pivot, measures, filter, calculated columns, kinds, aggregates, limits,
  sorts, totals, expand level, open rows) is a transaction.

(Today almost every configuration change re-runs the query, which is how a failed width or colour change
could keep the new configuration, P2-114.)

**A query change is one transaction:** `owner.apply(change, {record, label})` computes the next state
from `current`, paints it as pending, runs it through the controller, and then:

- **success** → `committed = rendered = the state the engine returned`; one history entry if `record`
  (a user's action; machine follow-ups use `record: false`); one `changed` event;
- **refusal** → `pending` dropped, everything repaints from `committed` (zones, panels, configuration,
  appearance, tree), the error said where the user reads it (P2-100–103, P2-108, P2-114, P2-169);
- **superseded** by a newer transaction → dropped quietly (latest wins); "busy" is the owner's
  "a transaction is in flight" (P2-104).

Two rules for overlapping work:

- **A change built on a pending one, then refused, reverts both**, and says so ("2 changes were
  undone: …"). The later change was made on top of the earlier; replaying the earlier alone would
  apply a state the user never saw. Honest and simple beats clever.
- **Undo while the user's change is in flight cancels THAT change** — the one thing they just did —
  and nothing more (the screen stays on `committed`, the query is stopped). Refined 2026-09-28 while
  building the owner: "cancel and also step back" would undo two things for one press.
- **Undo while an undo is in flight goes one step further**: two presses are two steps, each to a
  state that was on the stack (P2-107); redo while an undo is in flight cancels the undo.
- **A change made on an undo in flight lands as the undo AND the change**, one step each: undo then
  returns to the state the change was made on, and the redo branch goes as after any new change
  (P2-106). Refused, it reverts both and names both ("undo", "pivot").
- **A presentation change while a query runs lands with it** (laid on the pending state too); while
  an undo runs it rides the undo, kept on both sides, not a step of its own (the stacks are the
  move's until it lands).
- **A change that changes nothing is nothing**: no query, no step, no event.

A chip move is ONE transaction (P2-103); a Properties Apply is ONE transaction, tree settings
included (P2-169); expanding a row SETS it open (or closed) — never a toggle (P2-101, P2-127).

**The controller becomes stateless**: it runs a given state with the epoch guard and returns a view
or a refusal; no snapshot, no tree, no history.

**Undo/redo are transactions too**, on the owner's history of committed user states, keyed by the
WHOLE state, tree included (P2-106, P2-107, P2-109).

**Editors read live state**: an open editor's draft is rebased on the owner's `changed` event
(Filters, Sorts, Dimensions: P2-144, P2-171, P2-187); an Apply sends the draft captured at the click
and ignores re-entry while pending (P2-170); a compile refusal is a returned value, never a throw
(P2-152).

**Lifecycle**: `dispose()` aborts the guard, sets a disposed flag every callback checks, and removes
every listener; document listeners are registered once (P2-105, P2-220); drill has its own
latest-wins sequence (P2-131); the grid ends a resize drag on any re-render (P2-210); Escape in a
text field stays in the field (P2-221).

**Ad Hoc is a mode of the same shape**: its session commits on success (P2-259–261, P2-282), is built
from `rendered` not the pending state (P2-291), is torn down with a disposed flag (P2-270), and while
it is on the shell routes Undo/Redo, the status bar, Settings and Save to it — or disables the
cube-only entries (P2-283, P2-284, P2-287–290).

**The host page** gets an open sequence (P2-330), re-sign-in that reaches the open cube and clears the
previous user's tables (P2-297, P2-334), and the leave guard for any user work (P2-337).

**The owner's `changed` event** replaces the per-view "changed since saved" check (48f7df1e1).

**Not absorbed here:** the snap/live source rewrite inside the query state is audit leg 11 (T6). The
owner must not block it: the source a state reads from stays the controller's business, kept out of
`CubeState`'s comparison, until leg 11 makes it first-class.

## 4. The slices

Each slice is small enough to prove and push on its own. For EVERY slice:

1. **Red first, per entry.** Each audit entry the slice claims gets a reproduction test that FAILS
   before the change. A reproduction that already passes means the entry is already fixed: the test is
   kept and the entry recorded "fixed earlier", never claimed.
2. **The table in §2 is updated** with the slice's commit and each entry's test.
3. **No old test is loosened to pass.** A red old test is explained first (the standing rule); any
   changed old test is justified in the commit message.
4. **The proofs run**: the DataCube tests, `typed_values` (three time zones), `verify_features`,
   `verify_cubes`, `verify_smoke`, then the full chain; one push; CI watched.

The slices:

(Refined 2026-09-28, before any code: B1a–B1d as first written moved the app onto the owner in four
half-steps, each leaving two owners alive. Instead the owner is built and PROVEN ALONE first, then the
app switches in one step.)

- **B1a — the owner, built and proven alone.** `src/cube-state.ts`: `CubeStateOwner`, `UndoStack`,
  `queryKey`/`stateKey`, events; every rule above proven by `test/cube-state.test.ts` against a query
  side whose answers the test hands out by hand (each overlap is one exact ordering, not a race).
  `TreeState` gains `key` (open AND closed groups AND the expand level: P2-109) and `setOpen` (set,
  never toggle; asking for what is changes nothing: P2-127). Nothing in the app changes.
- **B1b — the switch.** The app runs on the owner: every write of the cube's state goes through
  `owner.change` (today's 25 sites in `app.ts` and the controller's `update`/`toggle`/`setTree`/
  `adoptTree`); the app's `#snapshot`/`#config` fields and the controller's snapshot, tree, view and
  history fields are DELETED; the controller becomes `run(state) → view | refusal`; presentation
  paints `current`, anything off the rows reads `rendered`; "changed since saved" listens to the
  owner; a guardrail test holds that nothing outside `cube-state.ts` assigns cube state (app AND
  controller). Closes, each with a red-first test through the app: P2-99 (no machine undo steps),
  P2-100, 101, 102, 104, 108, 114.
B1b LANDED (§2's rows): also `test/state-guardrail.test.ts` (no field or assignment of cube state
in the app or the controller; proven red by planting one); `src/history.ts` and its two tests
deleted, every rule they pinned ported to `test/cube-state.test.ts`; hosts get `onChange` (a
presentation change runs no query) and the `tree` option. What a person sees differently:
presentation changes (pin, width, colour, folding the zones or title bar) run no query and are undo
steps; a refused change made on a pending one says "N changes were undone".

- **B1c — whole gestures as one transaction.** A chip move, a Properties Apply (tree settings
  included), expand/collapse as a set. The context menu, drill and value filters read `rendered`.
  Closes P2-103, 110, 127, 169.
B1c LANDED: P2-103, P2-110 closed; P2-169 pinned (§2). The Sorts/Properties/Filters editors' own
drafts are B4.

- **B2 — history.** Undo/redo through the owner in the app (the rules are B1a's), Settings > Max
  History Stack Size, the menu's enabled states. P2-106, 107, 109 each red-first through the app.
B2 LANDED as tests only: P2-106, 107, 109 were already fixed by the owner (each test passed on its
first run, so recorded, not claimed); also pinned: Settings > Max History Stack Size takes effect at
once, and the menu offers Redo only when there is one.

- **B3 — lifecycle and supersession.** Dispose, listeners, drill sequence, resize drag, Escape.
  P2-105, 131, 210, 220, 221.
B3 LANDED: P2-105, 131, 210, 221 closed (P2-220 went with B1b).

- **B4 — editors on live state.** Filters, Sorts, Dimensions, Apply re-entry, compile refusals.
  P2-144, 150 (after its re-test), 152, 170, 171, 187.
B4 LANDED: P2-144, 150, 152, 170, 171, 187 closed.

- **B5 — Ad Hoc under the same rules**, and the shell's routing while it is on. P2-259–261, 268–270,
  280, 282–284, 287–291 (and the Cubes window in Ad Hoc, P2-288's successor).
B5a LANDED: the owner generalised (`StateOwner<S, V>` over `StateRules`: fold, queryKey, stateKey,
land, represent, defer; `CubeStateOwner` is it with `CUBE_RULES`), deferral and re-placing proven in
`test/cube-state.test.ts`; `AdHocSession` runs on it. P2-259, 260, 261, 268, 270, 282 closed; P2-269
no longer reproduces (pinned). Moving a dimension between rows and columns now runs no query: the
same questions, the answers placed again.

B5b + B5c LANDED: P2-283, 284, 287, 288, 289, 290, 280, 291 closed. Leg B's Ad Hoc slice done.

- **B6 — the host page.** Open sequence, re-sign-in, the leave guard for any work. P2-297, 330, 334, 337.

B6 LANDED: P2-297, 334, 337 closed; P2-330 did not reproduce (guard added, pinned).

Leg B is done when every row of §2 has a test and a commit, the guardrail holds for the app AND the
controller, and B5 and B6 have landed — not before.

## 5. What this plan can get wrong (its own audit)

- The §2 statuses are from READING the code ("the cited mechanism is unchanged"), not reproductions.
  The red-first rule is what corrects them: some "open" rows may already be fixed another way, and the
  two "overtaken" rows are claims until their tests pin them.
- B1b touches the most code for the least visible change; it is where a half-migration would hide.
  The guardrail (no state assigned outside the owner) is what stops "a cache for convenience" from
  becoming a second owner again.
- The transaction rules change what the user sees on a refusal (both changes undone, said so): a
  product behaviour, recorded here, not an accident of the refactor.

## 6. After the leg: its own audit, and the cleanup (2026-09-28)

The leg's self-audit (asked by the user: hacks, shortcuts, smells, duplication, left-behind code)
found, and this cleanup fixed:

- **P2-110 was half fixed** (see §2): the menu's facts and kinds and the formats' kinds read the
  pending state. Fixed; the row corrected.
- **The title bar was rebuilt on every state event** (a query starting included): now only when
  what it shows changes (its title, its folds). Test, red with the old rebuild put back.
- **P2-150 was a text-encoding patch**: replaced by stored values (user's call).
- **P2-144 keeps "OK twice"** (user's call: fine for now).
- **Organisation**: the generic owner is `src/state-owner.ts` (with the one `DEFAULT_HISTORY_LIMIT`,
  also Settings' default and Ad Hoc's), the cube's rules stay in `src/cube-state.ts`; one test
  `Gate` (`test/gate.ts`) under the app fixture's engine and Ad Hoc's source; the app-level tests
  split by concern over one fixture (`test/cube-fixture.ts`: transactions, lifecycle, editors,
  Ad Hoc shell); the Ad Hoc status bar shares the cube's builder.
- **An overtaken file open leaves nothing**: `forgetUpload` drops its table and file bytes (unless
  a newer open or the cube on screen reads that name).
- **Host rules out of the demo page**: `src/host.ts` (`TabWork`, `mayLeave`, `Latest`), tested; the
  page uses them.

Still true, recorded: the Properties editor merges at Apply rather than following live changes
while open; column editors re-check on every landed view; query keys are JSON of the state
(re-planning Ad Hoc's queries) -- unmeasured; the guardrail is a text scan of the app and the
controller; the page's warehouse wiring is reviewed, not driven (no warehouse in the harness);
`tools/ci-watch.sh` reads the GitHub API anonymously and reports "done" when rate-limited
(not this leg's file: reported, not changed).

The cleanup's proofs: one run of `verify_features` came back 164/170 with its failure messages
lost (the wrapper filtered them -- now kept whole); three full reruns with no change were
170/170. Recorded as an UNEXPLAINED intermittent failure, not reproduced -- not as fixed. The
suspect to check first if it returns: the title bar no longer rebuilt per event, so a menu that
used to close under a running query now stays open.
