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

**2026-10-01, announced before landing (rule 5): a cross-area edit in `core/`** (the user: "announce it and do
it"). So a file opened in DataCube's tab has its model written WITHOUT the WebAssembly module, on any planner (legend-engine
included), and the writer cannot drift from the compiler's:
- STRUCTURED, no type string parsed (the user: "do the homework first of how to do this CORRECTLY in structured form"):
  `DuckDb.CATALOG_COLUMNS_SQL` reads a table's columns from `duckdb_columns()` joined on the type id to
  `duckdb_types()` -- each column's canonical type, and a DECIMAL's precision and scale as numbers. `catalogType` is
  data over that (`CATALOG_TYPES`, `CATALOG_ALIASES` for JSON, `CATALOG_REFUSED` with reasons); the regexes are gone.
  `CatalogModel.Column` CHANGED: `(name, dataType, logicalType, precision, scale)`. `CatalogModelTest` reads real
  DuckDB tables, and a completeness test fails on a canonical type with no decision.
- Callers moved with it: `wasm/.../Wasm.java` `databaseFromCatalogOrError` takes the structured column; the warehouse's
  `/sql/v1/catalogs/{c}/objects` adds `logicalType`, `precision`, `scale` to each column (`type` kept).
- `datacube/tools/catalogfacts/` generates `datacube/src/generated/catalog-facts.ts` (the tables and the catalog
  question) and `datacube/test/generated/catalog-corpus.ts` (what `CatalogModel.database` answers for real DuckDB
  tables); `datacube/src/catalog-model.ts` is DataCube's writer, tested against the corpus case for case.
  `WasmPlanner.databaseFromCatalog` is kept (its input is now the structured column); DataCube no longer calls it.

**2026-10-01, announced before landing (rule 5): a cross-area edit in `core/`** (the user: "i think we should fix calc
column"). legend-engine refused 13 DataCube features that legend-lite passes; one cause is legend-lite's own leniency:
- `core/.../compiler/spec/Typer.java` `collection`: a literal of more than one value requires each element to be exactly
  `[1]`, as legend-engine (`ValueSpecificationBuilder.visit(Collection)`) and legend-pure (`InstanceValueValidator`) do.
  `$x.notional * 1.1` over a nullable column is then refused, as on engine (write `->toOne()`). This reverts the
  2026-09-11 loosening (`MULTIPLICITY_AUDIT_2026_08_20.md` §4a), whose premise "real pure accepts it" legend-pure's
  source contradicts; `MultiplicityStrictnessTest` flips back to expecting the refusal.
- NOT changed in `core/` (the user: engine's gaps are compensated in DataCube and recorded, not "fixed" in legend-lite):
  `over(String[*], SortInfo[*], Frame[0..1])` (in engine's over.pure, never registered by its Handlers.java) and BIT
  typed Boolean (engine's RelationalCompilerExtension says TinyInt; legend-pure says Boolean). Both get register rows.

**2026-10-01, announced before landing (rule 5): a cross-area edit in `core/`** (the user: "do them"). A column DuckDB's
catalog says is NOT NULL is declared `NOT NULL` in the written Database, so legend-lite and legend-engine type it `[1]`
and `$x.n * 1.1` compiles over it without `->toOne()`:
- `DuckDb.CATALOG_COLUMNS_SQL` reads `duckdb_columns().is_nullable`; `CatalogModel.Column` gains `notNull`; a line is
  `name TYPE NOT NULL` for such a column. Callers move with it: `Wasm.databaseFromCatalogOrError`, the warehouse's
  catalog listing (adds `notNull`), DataCube's generated writer and corpus.

## A fourth line, 2026-09-30: the Query app (the user's ask; design `docs/QUERY_APP_DESIGN_2026_09_30.md`)

In the worktree `legend-lite-query`, branch `query/app`. **Owns:** `query/` (new). **Touches, one line each:**
- `core/src/main/java/com/legend/server/PureV1Api.java` + `LegendHttpServer.java` routes (+ `PureV1ApiTest`):
  the upstream `pure/v1` endpoints the Query app needs and lite lacks, each in legend-engine's shape, measured
  against 4.145.0 -- `execute` with `parameterValues`, `compilation/compile`, `compilation/lambdaReturnType`,
  graphFetch results, the query store. Each routes to existing lite functions; no new compiler logic.
- `core/src/main/java/com/legend/Compiler.java`: `executeWire(model, ValueSpecification, ...)` gains the graph-fetch
  branch its text twin already has (one `if`, no compiler logic) -- `execute` answers graphFetch as the engine does.
- `core/src/main/java/com/legend/server/SavedQueries.java` (new): the engine's query store, in a directory the
  server is started with (`--query-store DIR`).
- NOT on this line (2026-09-30, the user's call): `analytics/mapping/modelCoverage` and `analytics/dataSpace/render`
  are engine ANALYSES lite does not have -- new platform features, proposed for core (design doc §1, G6/G9), not
  added here. The Query app shows every property and lists a mapping's classes as the mapping declares them.
- Graph-fetch trees: ONE representation (2026-09-30, crosses parser/protocol/compiler -- announced here).
  `GraphFetchLiteral` is the tree only (class, property nodes, root subtype entries); the column-list desugaring
  it carried is gone. The parser reads a tree with its grammar only (the `IslandScan` character scanner's graph
  half is deleted; the tree re-lexes its slice at its real line/column for wire spans). `ProtocolReader` gains
  `rootGraphFetchTree` (the two print-and-parse workarounds in PureV1Api and Wasm are gone). `NameResolver` keeps
  the tree (class names resolve in place; call arguments are its children). `GraphFetchChecker`, `IsDistinctChecker`
  and lineage `ScanRelations` walk the tree; everything after the checker (`TypedGraphTree`) is unchanged.
  Graph-position argument spellings live only in `ProtocolEmitter.gftParam` and `ProtocolReader.graphArg`.
  Evidence: `//spec:corpus_duckdb` + `:corpus_h2` per-test pass/fail lists and judge ledgers identical to the
  pre-change baseline (trace ids masked); `//parser-equivalence:diagnostics`, `//core:core_tests` (4295),
  `//core:guardrails` (no pin raised), `//query:verify` green. Fixes W1.2's `graphFetchKeepsSubTypeTrees` known
  defect. Unchanged gaps, noted: a tree typed on its own still refuses (the engine's type is
  `RootGraphFetchTree<T>`); lineage does not trace inside subtype views; `prop()` vs `prop` is not on the wire.
- `wasm/src/main/java/planner/Wasm.java`: `modelJsonOrError` (E2's twin, byte-identical to the server's).
- `datacube/BUILD.bazel`: ONE line, `visibility = ["//query:__pkg__"]` on `:src` (2026-09-30), so the Query app runs
  its planned SQL on DataCube's engines (`engine.ts`, `duckdb.ts`, `warehouse.ts`). No other DataCube change.
- `MODULE.bazel`: a second `npm_translate_lock` (`npm_query`, `//query:pnpm-lock.yaml`), so `datacube/`'s lock
  is not touched.

Nothing in `datacube/`, the compiler packages, `warehouse/`.

**Found for the compiler's owners (not fixed on this line):** (1) `Compiler.resultType` on a lambda WITH parameters
types the lambda itself (`LambdaFunction<{Integer[1] -> Relation<...>}>`), so `lambdaRelationType`/`lambdaReturnType`
answer a function type where legend-engine 4.145.0 types the result with the parameters in scope
(`SpecCompiler.typeQueryBody` handles only zero-parameter lambdas). (2) A derived property `{$this.quantity *
$this.price}: Float[1]` (Integer * Float) compiles in lite; legend-engine refuses it ("'Number' is not a subtype of
'Float'").

## Rules between sessions

1. Never force-push; never bare `git stash` (the stash stack is shared by every worktree).
2. Before pushing, `git fetch origin`; `main` must fast-forward.
3. The gate chain is `bazel test //...` then `bazel test //tools/deps:all`; `//parser-equivalence:diagnostics` runs only on
   its triggers (a pin bump, a parser/lexer/protocol change, a corpus manifest change).
4. A timing is a lane run alone with `--nocache_test_results`, load under 3 at the start, nothing else building.
5. If a second line of work starts again, this file becomes the handshake again: each side's owned area, cross-area edits
   announced one line each before they land, and dated status lines.
