# D1: DataCube Direct mode — homework and plan (2026-09-26)

Direct mode (docs/SERVER_PROGRAM_2026_09_26.md §1c, leg D1): **the tab plans, the warehouse runs.**
The planner is the one DataCube already uses (legend-lite's, in WebAssembly); only the engine
changes, from DuckDB in the tab to the warehouse over the HTTP SQL API, as the signed-in user.

This replaces the first version of this document, which was written before the homework and
proposed a Java cell encoder that the facts below make unnecessary. Every fact here was measured
(probes kept out of the repository, in the session's scratch directory).

## Facts

**H1. Versions.** The page's DuckDB-WASM (`@duckdb/duckdb-wasm` 1.33.1-dev57) is DuckDB **v1.5.4**;
the warehouse runs **v1.5.5**. Arrow JS is `apache-arrow` 17.0.0, reached through DuckDB-WASM and
already inside the page's bundle (`demo/bundle.js` carries `RecordBatchReader`); the page does not
yet declare it as its own dependency.

**H2. Values: no converter anywhere.** The same SQL run by DuckDB-WASM and by the warehouse (its
Arrow chunks read by `apache-arrow`'s `tableFromIPC`), both handed to the page's own
`toResultTable` (datacube/src/duckdb.ts): identical Arrow schemas, identical cells, identical Pure
types, for every type probed — BOOLEAN, all integer widths, HUGEINT, UBIGINT, FLOAT, DOUBLE with
NaN and infinities, DECIMAL(9,2)/(18,2)/(38,10), DATE before 1970, TIMESTAMP (µs, ns, s, with time
zone, before 1970), TIME, INTERVAL, UUID, BLOB, VARCHAR, JSON, LIST, STRUCT, MAP, fixed arrays,
and a grouped aggregate. So Direct mode feeds the warehouse's Arrow to the code Local mode already
uses; cells agree by construction.

**H3. Every SQL the cube corpus plans, run by a warehouse READER** (granted only `TRADES`) and by
DuckDB-WASM over the same rows (44 cases, `//datacube:cube_jvm_answers`):

| | cases | what |
|---|---|---|
| identical cells | 36 | |
| same rows, different order | 2 | `children-*`: the outer query has no ORDER BY, so SQL promises none — compare as multisets |
| order-dependent | 2 | `window-row-level-*`: `ROWS` frames ordered by `year` alone; tied years may frame in either order, in either engine. The cube's own answer is order-dependent there. |
| **refused (FORBIDDEN)** | 4 | the pivots: legend-lite emits a **dynamic** `PIVOT` (no value list), which DuckDB expands into more than one statement, so the reader check cannot see one SELECT (W0 found the same) |

Pivots, measured on data with a NULL pivot key:

| SQL | rows | reader may run it |
|---|---|---|
| today's dynamic `PIVOT … ON "year"` | 5 | **no** |
| `SELECT DISTINCT year` (to learn the values) | | yes |
| legend-lite's valued pivot, upstream spelling `pivot(~year, [values], ~agg)`: static `IN` **plus a pre-filter** `WHERE list_contains([values], year)` (legend-engine's semantics) | **3** (groups whose key is NULL are dropped) | yes |
| static `ON "year" IN (every distinct value)`, **no pre-filter** | **5, identical to dynamic** | yes |

Also found: the cube's own `pivotValues` path writes `pivot(~[col], [values], ~[aggs])`, which
matches **no** overload, upstream or in legend-lite (upstream's valued form takes one column and
one aggregate). That path does not compile today.

**H4. The protocol in the module.** The SQL-API binding (`//warehouse:sqlapi`: submit, poll,
fetch, close, login, token, errors) compiled into the planner's module adds **44.5 KB raw, 14.8
KB gzipped** (~1%) to a 4.45 MB (1.56 MB gzipped) module.

**H5. The browser and the warehouse.** The warehouse answers no CORS preflight and sends no
`Access-Control-*` header, so a page on another origin cannot call it. Tokens live 1 hour (the
server's default); there is no refresh.

**H6. Sources.** The catalog call (`GET /sql/v1/catalogs/{c}/objects`, filtered by W2's grants)
returns `{schema, name, kind, columns: [{name, type}]}` with DuckDB's type names, which is what
`inferModel` (infer.ts) already turns into a model for an uploaded file. Nested columns (STRUCT,
LIST, MAP) map to `VARCHAR(4096)` there today; JSON columns as Variant live on
`feature/datacube-variant`, not on main.

**H7. Proof inside Bazel.** DataCube's browser harnesses (`verify-*`) are `js_binary` targets run
by hand, not tests. DuckDB-WASM and the WASM planner already run inside `js_test`s, and the
warehouse is a Bazel-built native binary (`//warehouse:server_native`), so a mode differential can
be an ordinary `js_test` in `bazel test //...` with no JVM in it.

## What was built (2026-09-26): Live and Snap

Direct mode is the cube's **Live/Snap button**, not a separate page (user, 2026-09-26):

| | Live | Snap |
|---|---|---|
| plans | legend-lite in WASM | the same planner |
| runs | **the warehouse**, as the signed-in user | **DuckDB-WASM in the tab** |
| data | current, entitlement-filtered by the server | a frozen copy of every source column of the rows the user may read, under the source's own name, so one model reads both |

- **`datacube/src/warehouse.ts`**: `signIn`, `listObjects`, and `WarehouseEngine`, a `QueryEngine`
  that speaks the HTTP SQL API (submit, poll, fetch each Arrow chunk, close; cancel on abort) and
  returns the local plane's `ResultTable` through `tableFromIPC` and the existing `toResultTable`.
  **TypeScript, hand-rolled** (user decision after weighing it against the Java binding in WASM
  and an OpenAPI spec): its reference is `NativeBinding.java`; both clients are held to the real
  server in the chain. **Trigger to revisit:** the first outside consumer or a third client of the
  API gets an OpenAPI spec; the first non-warehouse backend called from the browser moves client
  logic into the Java bindings in WASM.
- **The controller holds two runners, fixed at construction**: live (the planner + the warehouse)
  and local (the planner + DuckDB-WASM); the active one follows the plane the user clicked. No
  fallback: a live failure is an error, never answered from a snap (snap.ts, rule 2).
- **Snapping from a remote live plane**: rows counted on the warehouse (the 10M ceiling), the
  server's Arrow chunks loaded into DuckDB-WASM unconverted (`insertArrowFromIPCStream`, schema
  included). **A snap copies every source column** (it selected only the columns the view
  referenced, so a fresh cube planned `select(~[])` and was refused, in local mode too). Snapping
  "this view's columns" and a progressive cache are later ideas; the progressive one needs every
  later fetch to see the snap's data (a held read-only warehouse session gives exactly that).
- **The source**: "Or a warehouse" in the Data window: URL, user, password (the DEVELOPMENT
  sign-in; the password is sent once and only the token is kept, in memory), then the tables the
  user may read; `inferModel` (now with an optional schema: `Schema sales ( Table v_orders )`,
  planned as `"sales"."v_orders"`) turns the catalog's columns into the model. Production sign-in
  is single sign-on (OIDC): the warehouse verifies the provider's token; nothing else changes.
- **Arrow JS** is the page's own dependency (`apache-arrow` 17.0.0, the copy DuckDB-WASM already
  brings; the lock file is updated through Bazel's pnpm, `@pnpm`): the bundle grew 7.6 KB
  (unminified), the client plus the part of Arrow's reader DuckDB-WASM did not already use.

**Proof:**
- `//datacube:live_snap_test` (in `//...`): the Bazel-built native warehouse, the trades rows
  loaded by an owner and granted to a reader; every cube case live as the reader, then snapped
  and run locally; ordered cases compared row for row, unordered ones as multisets; the 4 dynamic
  pivots are pinned as the only live refusals (a reader's pivot waits for the static double
  query); plus the catalog-to-model path and an ungranted table refused. Proven red by a planted
  one-row difference in the snap.
- In Chromium, the real page: sign in as a reader, one table offered, opened live (the warehouse,
  ~10 ms), snapped (~2 ms, in the tab), identical cells, the badge and status saying which.

**Next:** the static-pivot double query (with the untangle: a planner form); single sign-on; a
refresh-before-expiry for the token.
