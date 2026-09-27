# DataCube typed values: every type from the compiler (leg C, 2026-09-27)

Leg C of the fix order in `DATACUBE_PRODUCTION_AUDIT_2026_09_26.md` (theme T3, about 45 entries).
It builds on leg A (`DATACUBE_CUBE_PLAN_DESIGN_2026_09_27.md`).

The user's decisions (2026-09-27):
1. **What a DateTime means on screen.** A DateTime is what Pure says it is: a relational
   TIMESTAMP read as UTC. It is shown as stored and written back exactly, at full precision. A
   per-cube display time zone is a later presentation setting.
2. **Types the relational DDL cannot say** are converted explicitly, in the database, at the
   source. Nested types (STRUCT, LIST, MAP, UNION) become Variant (`to_json`). Nothing is
   silently narrowed.
3. **Option B.** The cube's column types come from the compiler when a source opens. The
   snapshot keeps them as a cache and re-asks whenever the source could have changed. A saved
   view whose types no longer match is a schema change, shown to the user.

## Facts (measured before design)

**Today a type comes from three places, none of them the compiler:**
1. **Source columns:** from the host page, or from `inferModel`'s JavaScript mapping of DuckDB
   type names (a copy of the compiler's own table).
2. **Cells:** from whichever engine answered. There are three decoders: Arrow for the tab and the
   warehouse, JSON for the engine page.
3. **Calculated columns:** learned from a result (`#learnCalcTypes`, then a re-run), the
   pattern the user's "types come from the compiler" ruling bans.

**legend-lite's compiler already has every query's typed result.** `QueryPlan.rootType` sits
beside the SQL of every plan: columns, Pure type, multiplicity, and a decimal's precision and
scale. `Compiler.compileQuery(model, query)` types a query without a runtime. Nothing hands this
to DataCube.

**legend-engine 4.145.0 `pure/v1/compilation/lambdaRelationType`**, asked on
`127.0.0.1:6300`, answers `{_type: relationType, columns: [{name, genericType: {rawType:
{fullPath}, typeVariableValues}, multiplicity}]}`, with PRECISE primitives:

| column or expression | legend-engine | legend-lite's compiler |
|---|---|---|
| VARCHAR(32) | `meta::pure::precisePrimitives::Varchar` [32] | String |
| INTEGER / BIGINT | `precisePrimitives::Int` / `BigInt` | Integer |
| DOUBLE | `precisePrimitives::Double` | Float |
| DECIMAL(10,2) | `precisePrimitives::Numeric` [10, 2] | Decimal(10,2) |
| DATE | `StrictDate` | StrictDate |
| TIMESTAMP | `precisePrimitives::Timestamp` | DateTime |
| BIT | `precisePrimitives::TinyInt` | Boolean |
| SEMISTRUCTURED | `meta::pure::metamodel::variant::Variant` | Variant |
| `sum` of an Int | `Integer` [1] | Integer |
| `average` | `Float` [1] | Float |
| `sum` of a Numeric | `Number` [1] | Decimal |
| a pivot cell `sum(if(...))` | `Float` [1] | Float |

**The two vocabularies differ, and the clients must read both.** Lite has no precise
primitives, and it disagrees with the engine on BIT and on `sum` of a decimal. Making lite's
typer report the engine's precise types is compiler work, which belongs to the untangle. It is
recorded for them, not done here. DataCube reads both vocabularies into one set of cell kinds,
so the same client code runs against both.

**lite's server has no `pure/v1` endpoints.** `lambdaRelationType` takes the lambda as engine
protocol JSON, which needs the protocol-JSON reader (`ENGINE_API_CONTRACT.md` P1) first. That is
its own item, not this leg. The legend-lite server page plans through lite's own `/engine/plan`,
so that answer carries the columns.

## The design

### Step 1: typed plans; the cube's columns from the compiler

**Revised by the user's ruling of 2026-09-27: upstream's APIs only.** No endpoint of ours
carries the types. `UPSTREAM_ENDPOINTS_DESIGN_2026_09_27.md` comes first: legend-lite serves
E1, E5, E8 and E9 exactly, and `/engine/plan` and `/engine/execute` are deleted. Then:

| plane | the columns come from |
|---|---|
| tab (DuckDB-WASM, the warehouse Live and Snap) | the browser planner's answer, in upstream's `RelationType` shape (one renderer with E5) |
| legend-lite server page and legend-engine page | upstream E9 `generatePlan`'s `tdsColumns` for a planned query; E5 `lambdaRelationType` for a source |

**One reader of type names,** `cellType(name)`, maps both vocabularies to a cell kind:

| cell kind | type names |
|---|---|
| string | String, Varchar, Char |
| integer | Integer, Int, BigInt, SmallInt, TinyInt |
| float | Float, Double, Real |
| decimal (with its scale) | Decimal(p,s), Numeric(p,s) |
| number | Number (exactness not promised) |
| boolean | Boolean |
| date | StrictDate |
| datetime | DateTime, Timestamp |
| variant | Variant |

An unknown name is an error, never a guess.

**The cube's source columns come from the compiler (option B).** Opening a source asks for the
relation type of the source expression, calculated columns included. The snapshot's
`columns[].type` is that answer. `inferModel` writes model text only; its type table is deleted.
A saved view is revalidated when it opens.

**Calculated columns are typed before they run:** the level query's relation type names them.
`#learnCalcTypes` and its re-run are deleted, and the column editor can check a declared value
type (a census row waiting on this).

**A result column's `type` is the plan's, never the engine's.**

### Step 2: one typed cell and one literal writer

Each engine's reader decodes into the one representation for the column's cell kind:

| kind | cell value | notes |
|---|---|---|
| date | `CalendarDate {year, month, day}` | never an instant; no time zone anywhere |
| datetime | `DateTimeValue` (UTC epoch microseconds as a bigint, and the digits of precision) | Arrow's own `get()` rounds to milliseconds, so the raw int64 is read at its unit; shown as stored (UTC) |
| decimal | `DecimalValue {unscaled: bigint, scale}` | exact; sums exact |
| integer | a JavaScript number when safe, a bigint beyond 2^53 | exact |
| float, boolean, string, variant | as today | variant stays its JSON text |

These all read the typed cell:
- the formatter;
- the exports (CSV, clipboard, HTML, SpreadsheetML, PDF, e-mail);
- selection stats and charts;
- tree and pivot keys (their group-key text becomes a typed key);
- filters and drill;
- saved views (a filter's date value is saved as its ISO calendar day or its exact timestamp).

**One writer** turns a typed value into a Pure literal (`%2024-01-02`,
`%2024-01-02T03:04:05.123456`, a decimal's exact digits). The tree, the pivot, drill-through, the
filter editor and the context menu all use it.

### Step 3: explicit conversions at the source

`inferModel` turns each database column the relational DDL cannot type into an explicit
conversion:

| database type | becomes |
|---|---|
| STRUCT / LIST / MAP / UNION | Variant (`to_json`) |
| TIMESTAMPTZ | the UTC TIMESTAMP |
| UBIGINT | DECIMAL(20,0) |
| HUGEINT | DECIMAL(38,0) |
| UUID, TIME, INTERVAL | canonical text |
| BLOB, or any type it does not know | refused, naming the column |

A bare DECIMAL takes DuckDB's real precision, not a guessed `DECIMAL(38,6)`.

Where the conversion lives for a warehouse table (a reader cannot create views) is decided by
step 3's homework:
- a Database `View` in the inferred model;
- or an owner-published view on the warehouse.

### Step 1 as landed (2026-09-27)

- **Every plan is typed.** `Planner.plan` returns `{sql, columns}`: the WASM module's `planOrError`
  answers the SQL with `UpstreamRelationType` (the renderer the `pure/v1` answers use), and
  `UpstreamPlanner` reads generatePlan's own `tdsColumns`. `PlanThenRun` stamps each result
  column's type from the plan and refuses a column the plan does not type. The engine page reads
  E8's builder. `pureType` in `src/relation-type.ts` is the one reader of both vocabularies; an
  unknown name is an error. `pureTypeName` (which read `Numeric` as `Float`) is deleted; the Arrow
  reader types only raw, unplanned SQL (an upload's DESCRIBE, a snap's copy).
- **Step 0 of every refresh** (`plan.ts`, `typeColumns`): one compile-only `relationType` of
  `source->extend(calculated columns)` types the source and the row-stage calculated columns
  before any level query; planners cache it by grammar. A declared type the compiler no longer
  gives is reported as a schema change. `#learnCalcTypes` and its re-run are deleted;
  group-stage calculated columns take their level query's plan types.
- **`inferModel`'s type table stays, by decision.** It is GENERATED from legend-lite's own
  relational kinds (`src/generated/lite-facts.ts`), not a second opinion, and step 0 re-asks the
  compiler on every open and refresh, reporting any drift. Deleting it would move an async compile
  into the host pages' open paths for no change in any answer.
- Proof: S1a and S1b green (`typed_values_test`); S1c by `type_columns_test`; the WASM
  differential now compares the typed plans (SQL and columns) against the JVM.

## The proof, named before the code

**Step 1:**
- **S1a:** a calculated column's type is known before its first query. A grouped cube with a
  new numeric calculated column sends ONE level query, not two. Red today: the learned-type
  re-run.
- **S1b:** every cube case's result columns are typed by the plan. The tab and the legend-lite
  server page report the same types, and the engine page reports equal kinds (the vocabulary
  table above).
- **S1c:** opening an uploaded or warehouse table asks the compiler for its columns. A saved
  view whose column changed type opens with a schema-change message, not stale types.

**Step 2,** a lane that runs every DataCube test with `TZ=Asia/Tokyo` and another with
`TZ=America/New_York`, plus:
- **S2a:** a DATE shows and exports as its own day east and west of UTC (P2-50). A date filter
  survives Save and Load (P2-51).
- **S2b:** a TIMESTAMP with microseconds filters, drills and groups to exactly its rows
  (P2-53).
- **S2c:** a DECIMAL(38,2) beyond 2^53 sums, charts and exports exactly (P2-59, P2-60).
- **S2d:** the same cells on the tab, the warehouse and the engine page.

**Step 3:**
- **S3a:** an upload and a warehouse table with a STRUCT column navigate as Variant on both.
- **S3b:** UBIGINT, HUGEINT, UUID and TIME columns are exact or text as declared, never
  truncated.
- **S3c:** a BLOB column is refused by name.

## Recorded, not in this leg

- **lite's typer reporting the engine's precise primitives,** and the BIT and `sum`-of-decimal
  divergences: the untangle's compiler area. The client reads both vocabularies meanwhile.
- **lite serving `pure/v1/compilation/lambdaRelationType`:** needs the protocol-JSON reader (P1).
