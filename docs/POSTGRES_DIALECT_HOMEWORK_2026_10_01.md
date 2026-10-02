# Postgres dialect homework (2026-10-01)

Homework for **W5.5 "The Postgres lane"** (`EXECUTION_PLAN_2026_09_26.md`), which is on the cut list
"until a user needs it". **A user needs it now**: DataCube over a self-hosted Postgres. This doc does
not repeat `POSTGRES_BACKEND.md` (2026-08-06, probed against PG 18.4 — still the reference for the
capability map, the `ARRAY` trap, the timezone pin and `normalize`). It answers what that study did
not:

1. How planned SQL reaches Postgres in the product (measured — §Q1).
2. Whether `AnsiSqlRenderer` should be refactored first, given it is the DuckDB dialect in all but
   name (§Q2).
3. Which of the study's defects are still live, re-measured (§Q3).
4. Every touchpoint and guard file, and the order of work (§Q4–§Q6).

Open decisions for the user are collected in §Q7.

---

## Q1. How does a planned query reach Postgres?

**Decided:** browser plans (wasm) → warehouse server → Postgres, with DuckDB's `postgres`
extension as the driver. No Postgres extension, no new server. Rejected along the way: an Arrow
Flight SQL extension forked to HTTP, `omni_httpd` (both run inside Postgres: a crash restarts the
cluster, loading needs a restart, no TLS, unmaintained), raw libpq in the warehouse (rewrites the
DuckDB-shaped Arrow/JSON encoders), and the legend-lite server's JDBC path (the goal is server-free
DataCube).

**The probe:** branch `spike/pg-passthrough`. `Database.lockDown` runs
`WAREHOUSE_SPIKE_PRELOCK_SQL` (`LOAD postgres; ATTACH '…' AS pg (TYPE postgres, READ_ONLY)`) before
`enable_external_access = false`. A query is `SELECT * FROM postgres_query('pg', '<planner SQL>')`.
Postgres 17 (docker), a 100,001-row × 13-column table. Apple M4, warehouse JVM and
`//warehouse:server_native`, DuckDB 1.5.5 with `postgres_scanner` beside the binary.

| Check | JVM | native |
|---|---|---|
| extension loads from beside the binary (no download) | ✅ | ✅ |
| full table, Arrow | ✅ | ✅ 0.15 s server-side, 0.46 s end to end |
| full table, JSON | — | ✅ 3.5 s (the JSON encoder, not Postgres) |
| Arrow types (pyarrow) | ✅ | ✅ `int64 int32 decimal128(18,6) bool date32 timestamp[us] timestamp[us,UTC] double list<string> string` |
| JSON values | — | ✅ BIGINT and DECIMAL as strings (no 2^53 loss), ISO dates, `tstz` in UTC with `Z` |
| order of the inner `ORDER BY` kept | ✅ | ✅ |
| Postgres error text reaches the client | ✅ | ✅ (`SQL_BIND`, Postgres' message and caret intact) |
| lockdown holds: `ATTACH` after start refused | — | ✅ |
| cancel reaches Postgres | — | ❌ statement marked cancelled; Postgres runs to completion |
| `statement_timeout` in the DSN cancels in Postgres | ✅ (CLI) | — |
| reader without a grant | — | refused: `no SELECT granted on table function main.main.postgres_query` |

**What DuckDB actually sends** (Postgres `log_statement=all`):

```
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY
COPY (SELECT "c1", "c2" FROM (<planner SQL>) AS __unnamed_subquery ) TO STDOUT (FORMAT "binary")
COMMIT
```

Only the columns the outer query uses travel. Postgres does all the work; DuckDB only decodes rows.

### What this imposes on the Postgres dialect

| Constraint | Why | Dialect rule |
|---|---|---|
| one SELECT, no trailing `;` | it is spliced into `COPY (SELECT … FROM (<sql>) …)` | `render(SqlQuery)` only; scripts, DDL and DML never on the product path |
| output column names unique | the wrapper selects columns by name | already true of planner output; assert it |
| unconstrained `numeric` arrives as **DOUBLE** | `sum(numeric)` measured: `DOUBLE`; with `::numeric(38,6)`: `DECIMAL(38,6)` | cast decimal aggregates to the declared `Decimal(p,s)` |
| `json`/`jsonb` arrive as `VARCHAR` | measured, both `postgres_query` and attached tables | fine: DataCube decides by the Pure type (`app.ts:1810`, `isVariant`); no Arrow tag needed |
| session settings cannot run as statements | the planner has no connection | `TimeZone=UTC` etc. go in the ATTACH DSN (`options=-c TimeZone=UTC`); `sessionSetup()` is the JVM lane only |
| no second round trip | the browser planner has no connection | `DynamicPivot` (keys discovered by a first query) is refused with `DialectCapability` on the product path |

The JVM execute path (pgjdbc, used by the PCT and corpus lanes) and the product path run **the same
dialect output**. Only `normalize` differs: pgjdbc objects on the JVM, DuckDB-decoded values on the
product path.

---

## Q2. Is `AnsiSqlRenderer` the DuckDB dialect, and should it be refactored first?

**Measured (an arm-by-arm audit of `AnsiSqlRenderer.java`):** the query skeleton is portable;
the DuckDB-specific parts sit in a few switches and the default spelling table.

| Class | Arms | Code lines | Examples |
|---|---|---|---|
| **A** portable as-is | ~60 | ~650 | SELECT/WITH/UNION, joins incl. `LATERAL`, windows, CASE, literals, DDL/DML, `sortKey` (always spells `NULLS FIRST/LAST`) |
| **D** DuckDB syntax or semantics in the base | ~30 | ~200 | `//` (`:788`), `CAST(.. AS DOUBLE)` in DIVIDE (`:699`), bare `ROUND` for ROUND_HALF_UP (`:711`), `INTERVAL 3 DAYS` frames (`:970-984`), `EXCLUDE`, `rowid`, `list(..)`, strftime codes (`:1105`), `json_object`/`json_group_array`, `epoch_ms`, `uuid()`, `MAP {}`, `error()`, reducer names MEDIAN/QUANTILE_*/ARG_* |
| **P** data rows | 77 spellings + types + lexicon | — | `Spellings.DUCKDB` is the **default** table: ~47 rows are valid Postgres names, ~30 are DuckDB-only (`date_diff`, `strftime`, `string_split`, `regexp_full_match`, `len`, `epoch`, …) |
| **T** walls (`DialectCapability`) | ~25 | ~120 | QUALIFY, PIVOT, ASOF, lists, structs, lambdas, folds, variant |

**Who inherits the D arms today:** `H2` (overrides most of them, `H2.java:191-678`), SQLite
(the bare base with `Spellings.DUCKDB`, `Compiler.java:866-871`), the `EngineStyle*` chain (falls
through to `super.call`, `EngineStyleH2.java:1797`, `EngineStyleDB2.java:250`), and
`CarrierDifferentialTest`, which uses the base as its "portable" reference. The base also carries H2
defaults: `passes()` uses `CarrierStrategies.Caps.H2` (`:101`), and `ddlType` uses
`DdlSpelling.h2Type` (`:1306`).

**The plan already names this refactor:** W5.4, "`Spellings.ANSI`, DuckDB as a layer", ordered
before W5.5.

### Answer: Postgres first, as a sibling; then the split, with Postgres as its evidence

1. **`Postgres extends AnsiSqlRenderer`**, the way `H2` does. Add `Lexicon.POSTGRES`,
   `TypeNames.POSTGRES` and `Spellings.POSTGRES` (seeded from DUCKDB's 47 portable rows, never
   inheriting the 30 DuckDB-only ones), and override the ~30 D arms. **No base change, so no
   golden or byte risk** for DuckDB, H2, SQLite or `EngineStyle*`.
2. **Then W5.4, scoped by evidence.** Every arm that DuckDB keeps and Postgres overrides is a D arm
   by measurement, not by reading. Move those bodies into `DuckDb`, leaving named protected hooks
   in the base. Gate: DuckDB, SQLite and EngineStyle output byte-identical (snapshot), and the
   carrier differential re-pointed at a real portable reference.

**Why not split first.** With one consumer, every A/D call is a guess. Three inheritors (SQLite,
EngineStyle goldens, the differential) would move under it. And the payoff — a clean base — buys
Postgres nothing it cannot get by overriding. `DuckDb` is `final`, so "Postgres extends a
DuckDB-ish base" is not an option either.

**Fix in the base now (defects whatever happens):**
- DIVIDE's hardcoded `DOUBLE` should go through `castTypeName(DOUBLE)`.
- `CarrierStrategies.Caps`: only `nativeLists` is read (`CarrierStrategies.java:83, 232, 656`).
  Postgres needs `nativeLists=false` (the JSON carrier, `POSTGRES_BACKEND.md §5`) **without** H2's
  FULL OUTER emulation, so the caps must split.

---

## Q3. Semantics, re-measured — and which defects are still live

**The probe:** `experiments/postgres-dialect/semantics_probe.sh` runs 60 expressions through DuckDB
1.5.5 and Postgres 17. The full output is in `runs/pgspike/semantics.txt` (not committed).

Where the engines differ (all agree with the 2026-08-06 study, except where marked):

| Probe | DuckDB | Postgres | Dialect consequence |
|---|---|---|---|
| `7/2` | 3.5 | 3 | DIVIDE casts both operands (already); INT_DIVIDE `//` is a syntax error → `div(a,b)` |
| `1/0` | `inf` | ERROR | Pure's divide-by-zero contract decides which engine is wrong; adjudicate by a PCT test before choosing a spelling |
| `round(2.5::double)` | 3 | **2** (half-even) | ROUND_HALF_UP → `round(CAST(x AS numeric)[, n])` |
| `'a_c' like 'a\_c'` | false | **true** | Postgres' default escape is `\`; render an explicit `ESCAPE` everywhere |
| `'abc' ~ 'b'` | false (full match) | **true** (partial) | REGEXP_FULL_MATCH → anchored `~ ('^(?:' \|\| p \|\| ')$')`; MATCHES → `~` |
| `ORDER BY x DESC` NULLs | last | **first** | moot: `sortKey` always spells it (`AnsiSqlRenderer.java:271`) — *new: not a defect* |
| unquoted `"X"` read as `x` | works | ERROR | Postgres folds to lowercase: **quote every identifier** |
| `avg(int)` | double 1.5 | numeric 1.5000… | cast to the delivered type |
| `date_trunc('month', date)` | timestamp | **timestamptz** | cast back to the declared type |
| `QUALIFY`, `GROUP BY ALL`, `EXCLUDE`, `[..]`, `{..}`, `//`, `list_transform` | ok | syntax errors | `QualifyToSubselect` (its first production user); expand the column list; `ARRAY[..]`; JSON carrier |
| `strftime` / `to_char` | only strftime | only to_char | `formatText` per dialect |

**Side finding (DuckDB, not Postgres):** DuckDB 1.5.5 warns *"Deprecated lambda arrow (->) …
transition to the new lambda syntax, i.e., `lambda x: …`, before DuckDB's next release"*.
`DuckDb.java:370` emits `x -> body`, and the warehouse already runs 1.5.5. Track this separately.

**Still live in the code today** (from the study's §10 sequence):

| Study item | Status |
|---|---|
| ROUND_HALF_UP as bare `ROUND` | live (`AnsiSqlRenderer.java:711`) |
| `MATCHES → regexp_matches` (deletes rows on Postgres) | live in `Spellings.DUCKDB:102`. Correct on DuckDB; a trap only if Postgres inherits the row, so `Spellings.POSTGRES` must not |
| `[..]` array literal | live (`DuckDb.java:516`); the base already spells `ARRAY[..]` |
| interval frame plurals | live (`AnsiSqlRenderer.java:977-983`); H2 overrides; Postgres needs `INTERVAL '1' DAY` |
| `Compiler.dialectOf` | live: a plan-only Postgres runtime throws `NotImplemented` (`Compiler.java:848-855`); a Postgres JDBC session silently gets DuckDB SQL (`:756-806`) |
| TZ pin, `normalize` families | not started |

---

## Q4. Every touchpoint (the H2 precedent, mapped)

| Area | File | Postgres change |
|---|---|---|
| dialect | `sql/dialect/Postgres.java` (new) | extends `AnsiSqlRenderer`; java.base only (`PlannerRunsOnJavaBaseTest`, TeaVM) |
| data rows | `Lexicon`, `TypeNames`, `Spellings` | `POSTGRES` rows |
| carrier caps | `CarrierStrategies.Caps` | split the caps (§Q2) |
| selection, plan-only | `Compiler.dialectOf(ctx, rt)` `:848-855` | `case Postgres -> new Postgres()` — **this is the browser's path** |
| selection, JDBC | `Compiler.dialectOf(ctx, rt, conn)` `:756-806` | `"PostgreSQL"` product arm |
| session | `SqlDialect.sessionSetup` | `TimeZone=UTC` (JVM lane); mirror it in the warehouse DSN |
| scripts | `script` / `scriptAbort` / `failingStatement` | DuckDB's BEGIN/COMMIT form (Postgres DDL is transactional) |
| pivot | `needsStaticPivot()` | true; refused on the product path (§Q1) |
| values | `normalize` | `java.sql.Date`, `PGobject`, `timestamptz`, `SUM(BIGINT)→BigDecimal` (study §8) on plain Java objects: the dialect may not name driver types (`ArchitectureTest` F1.3) |
| wire types | `Executor.pureOfSqlType` `:1044-1080`; `SqlTypeCensus` | learn `int4 int8 float8 text bool numeric jsonb timestamptz` |
| catalog | `SqlDialect.catalogType` | optional; needed for a DataCube source picker (`information_schema`/`pg_catalog`) |
| metadata grids | `compiler/spec/CatalogGrids.java:186-197` | uppercase type-name CASEs give every Postgres column `DATA_TYPE` 1111. Move into the dialect, or leave as a wall |
| system DB | `exec/SystemDatabase.java:110-116` | keep the wall: metamodel queries are not on the product path |
| connection | `server/ConnectionResolver.java:216-225` | exists; UsernamePassword auth throws (`:233`) |
| deps | `MODULE.bazel` | pgjdbc into `@maven_core` (`CoreClosureTest`); zonky in a new pool `@maven_pg` (`PoolsAreDisjointTest`) |
| warehouse | `Database.lockDown`, `Authorizer`, `Catalogs` | `--postgres NAME=DSN` replaces the spike env var; a grant story for `postgres_query`; `statement_timeout` from `timeoutMs`; the extension shipped beside the binary |

**Guard files that move** (each with a dated justification, per AGENTS.md):

| Guard | Change |
|---|---|
| `ArchitectureTest.javaSqlIsFunnelledToTheCharteredSeam` `:611`, `theInterpreterPerformsNoJdbc` `:647` | add `org.postgresql..` (a tightening) |
| `JavaEvalLedgerTest` `:89` | `PctExecuteNative` pinned at 109 lines; a Postgres arm bumps it |
| `JavaEvalLedgerTest` `EXEC_CLASSES` `:992` | any new `exec/` file needs a row |
| `DialectBoundaryTest` `:52-58` | widen the regex to `Postgres` (optional, recommended) |
| `RawSqlLedgerTest` | only if an `h2ToPostgres` raw-SQL adapter is added (corpus lane). **Never reuse `DuckDb`'s `RawSqlAdapt`** |
| `PctCensusGate` | Postgres metadata names push the zero-pinned counters up: teach `normalizeMeta`, or split the ceilings per lane |
| `PlannerRunsOnJavaBaseTest` | add a Postgres-runtime plan |
| `//wasm:differential_test` | add a Postgres runtime to the corpus model so JVM and wasm Postgres SQL are compared |

---

## Q5. The test lane

- **Embedded, not Docker.** Use zonky `embedded-postgres` 2.2.2 plus the binaries (darwin-arm64v8,
  linux-amd64, windows-amd64), pinned by sha. The study measured ~7 s boot with no Docker.
  Testcontainers would need a Docker socket in the sandbox, and the hosted macOS and Windows runners
  have none.
- **Sandbox notes (not yet verified):**
  - `java.io.tmpdir` = `TEST_TMPDIR`.
  - `unix_socket_directories=''`: macOS caps socket paths at ~104 bytes.
  - Loopback TCP works in the default sandbox. Use `no-sandbox` only if shared memory or fork is
    refused.
- **First lane:** `//pct:pct_postgres` runs the Relation suite only, as H2 started. It needs:
  - `env LEGENDLITE_PCT_BACKEND=postgres`;
  - a `postgres` arm in `PctExecuteNative` with a JVM-wide server holder;
  - `Test_LegendLite_Postgres_RelationFunctions_PCT` with a dated `expectedFailures` roster;
  - `TZ=UTC` on the JVM (study §6);
  - a row in `gates-run.yml`.
- **Then the DataCube surface:** the wasm differential with a Postgres runtime, plus the queries
  DataCube actually emits (group/filter/sort/window/static pivot/date buckets) run through the
  warehouse passthrough against embedded Postgres, rows compared with DuckDB.
- **Corpus lane** (`corpus_postgres`): later. The corpus seeds raw H2 text, and translating it needs
  a new ledgered seam.

---

## Q6. Order of work

| Leg | Content | Gate | Size |
|---|---|---|---|
| **P0** | Warehouse: `--postgres NAME=DSN` (attach before lockdown); `statement_timeout` from `timeoutMs`; a `postgres_query` grant decision; ship `postgres_scanner` beside the binary | a warehouse test against embedded Postgres: Arrow and JSON rows, error, timeout | 1–2 |
| **P1** | `Postgres` dialect skeleton: rows, both `dialectOf` arms, always-quoted identifiers, ROUND via numeric, `div`, explicit `ESCAPE`, anchored `~`, singular interval frames, `QualifyToSubselect`, `ARRAY[..]`, `formatText`→`to_char`, walls for every T arm | `PlannerRunsOnJavaBaseTest` + `//wasm:planner` build; Postgres plan snapshots | 2–3 |
| **P2** | `pct_postgres` (Relation) + zonky pool + census decision + first dated fail roster | the roster as a gate | 1–2 |
| **P3** | DataCube surface: the queries DataCube emits, rows equal to DuckDB through the passthrough; decimal aggregate casts | that suite green | 1–2 |
| **P4** | Collections and variant over the JSON carrier (`jsonb`), per study §5 | PCT roster shrinks | 2–4 |
| **P5** | W5.4 scoped by P1–P4's evidence: D arms into `DuckDb`, hooks in the base | DuckDB, SQLite and EngineStyle output byte-identical | 1–2 |
| **P6** | `corpus_postgres` | its registers seeded | 2–3 (cut candidate) |

P0 and P1 are independent and can run in parallel. P3 is the first point at which DataCube on
Postgres is real.

---

## Q7. Decisions (ruled by the user, 2026-10-01)

1. **W5.5 leaves the cut list.** P0–P3 run now, ahead of W5.2. They render today's MIR.
2. **Postgres 16 is the floor:** the version that has everything needed. It adds `ANY_VALUE` and the
   standard `JSON_ARRAY`/`JSON_OBJECT`/`JSON_ARRAYAGG`. Nothing needed is 17+ only (`JSON_TABLE`
   is not needed). The test lane runs **on 16**, so a newer feature fails there.
3. **Collection carrier: `jsonb`.** No native arrays as a carrier.
4. **Base split (P5) after Postgres.**
5. **One warehouse binary serves both.** Each catalog is DuckDB (`--catalog`) or Postgres
   (`--postgres NAME=DSN`). One process with both, or separate processes with one each: a
   deployment choice, not a code fork. On a Postgres catalog the server wraps the client's SQL in
   `postgres_query`. DuckDB's `Authorizer` cannot parse Postgres SQL, so a catalog-level grant
   replaces it, and the DSN's Postgres role is the data boundary.

### The jsonb carrier covers DuckDB's list family — measured (Postgres 17)

Every lambda form becomes a correlated subquery over `jsonb_array_elements(xs) WITH ORDINALITY
t(e, o)`; elements are cast to their Pure type (`e::numeric`, `e #>> '{}'`), and results are
rebuilt with `to_jsonb` and `jsonb_agg(… ORDER BY o)`.

| DuckDB | Postgres over jsonb | measured |
|---|---|---|
| `list_transform` | `(SELECT coalesce(jsonb_agg(to_jsonb(f(e)) ORDER BY o), '[]') FROM jsonb_array_elements(xs) WITH ORDINALITY t(e,o))` | `[3,1,2]` → `[4,2,3]`; `[]` → `[]` |
| `list_filter` | same with `WHERE p(e)` | ✅ |
| exists / forAll | `EXISTS (… WHERE p)` / `NOT EXISTS (… WHERE NOT p)` | ✅, empty lists included |
| `list_reduce` / fold | correlated `WITH RECURSIVE f(i, acc)` stepping `xs->>i` | order-sensitive `acc*10+x` over `[3,1,2]` = 312 ✅ |
| sort, reverse | `ORDER BY e`, `ORDER BY o DESC` | ✅ |
| distinct (first occurrence) | `GROUP BY e ORDER BY min(o)` | `[3,1,3,2,1]` → `[3,1,2]` ✅ |
| slice / at / size | `WHERE o BETWEEN a AND b`, `xs->i`, `jsonb_array_length` | ✅ |
| concat / contains / zip | `\|\|`, `@>`, join on `o` | ✅ |
| nested `List<List<T>>` | elements are jsonb arrays themselves | sizes `[[1,2],[3]]` → `[2,1]` ✅ (native arrays fail here) |

The cost is SQL volume, not capability: one correlated subquery per list operation. One semantic
point to adjudicate in P4: on a NULL list, these forms return `[]`.

---

## Status (2026-10-02): P0 and P1 landed on `feature/postgres` (uncommitted)

**P0, warehouse.**
- One binary now serves both kinds of catalog: `--catalog` for DuckDB and `--postgres NAME=DSN`
  (repeatable) for Postgres, plus `--duckdb-extensions DIR`. In a native image the extension
  defaults to the directory beside the binary.
- A reader needs `GRANT USAGE ON CATALOG c TO r`; the Authorizer is bypassed for Postgres SQL.
- Statements are tagged `/* wh:<uuid> */`. A cancel or timeout runs `pg_cancel_backend` from a
  second connection, matching with `strpos` and limited to the catalog's role.
- `describeOnly` prepares the query without running it.
- Live, on the JVM and native builds against PG 17:
  - the `pg_sleep(20)` backend is gone 0.5 s after a cancel;
  - a 1,500 ms timeout returns `TIMEOUT` at 1.53 s;
  - 100,001 rows come back as Arrow in 0.22–0.24 s;
  - DuckDB prepares the `COPY` as one statement, so SQL cannot break out of it.
- Open:
  - the DSN role must be SELECT-only (it is the boundary);
  - a tag beyond `track_activity_query_size` cannot be found, so keep `statement_timeout` in the DSN;
  - Postgres errors surface as `SQL_BIND`;
  - startup fails while Postgres is down;
  - no `/objects` for Postgres catalogs;
  - nothing yet ships the extension beside the binary.

**P1, dialect.**
- `Postgres.java` (734 lines), with every `SqlFn` and `SqlAgg.Fn` decided and no `default ->`.
  It adds `POSTGRES` rows to `Lexicon`, `TypeNames` and `Spellings` (41 shared names, no
  `regexp_matches`).
- Both `dialectOf` paths have a Postgres arm.
- Native renderings include:
  - quoted identifiers;
  - QUALIFY as a subselect;
  - `div`;
  - ROUND_HALF_UP over `numeric`;
  - anchored `~` for REGEXP_FULL_MATCH;
  - `to_char`;
  - a boundary-count `date_diff`;
  - `date_bin`;
  - `percentile_*` and `mode() WITHIN GROUP`;
  - the `json_build_*` family;
  - `error()` without a UDF: a sentinel-wrapped cast to TIMESTAMPTZ, which is STABLE and so never
    folded at plan time.
- Walled: every list, map, struct, lambda and variant form (P4), plus `rowid`, `EXCLUDE`, dynamic
  pivot, MOD on doubles, `ARG_MAX`/`ARG_MIN`, `hashCode`, scaled half-even round, `%g`, and NUL in
  strings.
- Live: 26 of 28 query shapes return the same rows as DuckDB through `postgres_query`. The two
  misses are `mode()` tie-breaks and `stddev_samp` at about 1e-13 relative.

**Base changes.** Both are byte-identical for DuckDB, H2 and SQLite by construction.
- `CarrierStrategies.Caps` gains `nativeFullOuter`.
- `QualifyToSubselect` gains a `byOutputs` form; the no-argument form is unchanged.

**Found on the way: SQLite's QUALIFY is wrong today.** The old `QualifyToSubselect` form puts the
window call into the outer `WHERE` and applies `ORDER BY`/`LIMIT` before the filter. SQLite (the
bare base) uses that form in production. Move SQLite to the `byOutputs` form, as a separate fix.

**Verified on the combined branch:**
- passing: `//core:core_tests`, `//core:guardrails`, `//core:census`, `//warehouse:tests`,
  `//wasm:differential_test`;
- builds: `//wasm:planner` (TeaVM) and `//warehouse:server_native`.

## DataCube on Postgres, end to end (2026-10-02)

**Setup.** The headless DataCube page (`runs/pg/demo.mjs`, Playwright) talks to the native warehouse
(`--postgres shop=…`), which talks to Postgres 17 with a `shop` database: `sales.customers`,
`sales.products`, `sales.orders` (250,000 rows) and the view `sales.order_facts`, read through a
SELECT-only role.

**Results.**
- Sign-in lists the four objects.
- Opening `sales.order_facts` loads 250,000 × 12 in 311 ms, sending
  `SELECT "t0"."order_id" AS "order_id", … FROM "sales"."order_facts" AS "t0"`.
- Grouping by `country` takes 576 ms. The totals equal `psql`'s
  (BR 40,879,225.37; CA 39,300,140.58).
- A reader is refused before `GRANT USAGE ON CATALOG shop TO bob`, then lists and queries.

**Fixes the run forced:**
- **The warehouse lists a Postgres catalog's objects.** It reads DuckDB's catalog over the attach,
  keeps DuckDB's type names, and leaves out `pg_catalog`/`information_schema`. A reader needs USAGE.
- **DataCube sees every catalog.**
  - The client lists every catalog and its objects; each object carries `catalog` and `engine`.
  - `inferModel` writes `type: Postgres` for a Postgres catalog.
  - `WarehouseEngine` runs on the object's catalog.
  - The picker names the catalog when there is more than one.
  - No Snap for a Postgres source: its plan is Postgres SQL.
- **`max(boolean)` does not exist in Postgres.** DataCube's "the group's one value"
  (`uniqueValueOnly`) emits `MAX(b)` on every boolean column. Postgres now renders `bool_or` and
  `bool_and`.

**Open (found, not fixed).** A `timestamptz` column is left out of the model. DuckDB's catalog
mapping declares it TIMESTAMP only with a UTC conversion, and a read-only table cannot apply one.
This is the usual Postgres timestamp type, so it is the next gap to close.
