# DataCube: every type decision in the front end, and the plan to move it server side (2026-09-27)

The user asked (2026-09-27): look at every single place the front end does anything with types, with
no sampling, and plan moving it to the server. This supersedes step 1 of
`DATACUBE_TYPED_VALUES_DESIGN_2026_09_27.md`, whose first attempt kept a client type table and
called it a decision (the user caught it). The evidence is in `datacube-types-census-2026-09-27/`.

## How the census was taken

- **Every file.** All 99 source and demo files of `datacube/src` and `datacube/demo` (38,120 lines)
  were read start to end, in ten groups (`G1`–`G10`; each group's file list is `Gn.files.txt`).
- **A mechanical index held each reader to account.** A broad pattern (type words, Pure and SQL
  type names, `typeof`/`instanceof`, `Date`, `Number(`, `BigInt`, decimals, JSON, casts) matched
  2,385 lines (`index.txt`). Every one is either inside a census row or listed as noise with a
  reason. This was re-checked by script after the readers finished: 2,385 of 2,385 accounted for.
- **Sites the pattern missed** (implicit ones: a comparator assuming numbers, `String(v)` as a
  key, a default chosen by kind) were added by the readers from the full read.
- **Result:** 558 type sites in 81 files, each with its category, what it does, where the type
  fact comes from today, where it belongs, and any bug. Tests (`datacube/test`) were not in scope;
  they follow the code.

## What the front end does with types today

| category | sites | what it is |
|---|---:|---|
| DECIDE | 101 (+~30 mixed) | behaviour chosen by a type: measure or dimension, default aggregate, operators offered, formats offered, colours, chartable |
| DECLARE | 67 | a type stored in client state: host pages' column lists, `ColumnSpec.type`, `DerivedColumn.type`, invented defaults |
| DISPLAY | 61 | a typed value rendered: grid, tooltip, exports, charts, labels |
| HARNESS | 60 (+~50 mixed) | verification scripts constructing or asserting types |
| TRANSPORT | 41 | reading a type from an answer: Arrow schema, plan columns, relation type, execute builder |
| DERIVE | 34 | the client computes a type: type tables, JSON shape inference, Arrow names |
| CONVERT | 34 | a cell converted: Arrow to JS, decimal to float or text, date to local midnight |
| RTCHECK | 20 (+~15 mixed) | `typeof` / `instanceof` on a cell value standing in for the column's type |
| PARSE | 16 | user text or a saved value turned back into a typed value |
| LITERAL | 14 (+~12 mixed) | a value written into Pure: dates, numbers, keys |
| SCHEMA | 13 | the model's DDL written by the client from DuckDB type names |

The same few rules, written many times:

1. **"Numeric means measure" and the default aggregate** — 91 sites. `kindOf` / `isNumericType`
   (`snapshot.ts:108-111, 150-151, 171-208`) is re-applied in `serialize.ts` (850, 1047, 1231),
   `column-editor.ts:894`, `panel-column.ts:260`, seven UI panels (hub `panel-kit.ts:93-107`),
   Ad Hoc (`outline.ts:53-58`), `infer.ts:171` and two demo pages. The copies disagree: the doc
   comment at `snapshot.ts:176-184` says integers default to dimensions, `kindOf` and `docs.ts`
   make them measures, and `boot.ts:565` / `stress.ts:173` count only Integer and Float as numeric.
2. **Type-name tables** — seven of them, with four different answers for an unknown type:
   `pureTypeOfArrow` (`result.ts`, "Unknown"), `sqlTypeOf` (`infer.ts`, VARCHAR(4096)),
   `pureTypeOf` + `lite-facts.ts` ("String"), `pureType` (`relation-type.ts`, throws), `dataTypeOf`
   (`filter-editor.ts:107`), `TEMPORAL` (`serialize.ts:518`), `filterOperatorsFor` (`menu.ts:287`).
   Their vocabularies clash (lite-facts emits `Byte`/`Other`/`Distinct`, which `pureType` refuses;
   `dataTypeOf` names `Timestamp` and `StrictTime`, which nothing produces).
3. **Invented types** — 19 sites: `'Derived'` (`panel-kit.ts:80-81, 103`, `app.ts:762-764`,
   `panel-column.ts:256`), `'String'` for an unknown type (`menu.ts:747`, `app.ts:2376`), `'String'`
   for every dimension column (`treeview.ts:426, 447`), `'Float'` for child aggregates
   (`treeview.ts:281`) and every Ad Hoc measure (`adhoc/query.ts:319`), `'Unknown'`
   (`result.ts:135`, `engine-remote.ts:97`).
4. **Dates and times** — 118 sites. A DATE is decoded to a local-midnight JS `Date`
   (`duckdb.ts:203`); it is rendered in the viewer's zone by Intl (`format.ts:208, 215`) and in UTC by
   `toISOString` (`grid.ts:187`, `export.ts:74`, `export-rich.ts:145`), so a day shifts depending on
   where it is read; years 0–99 become 19xx; microseconds are cut to milliseconds; TIME and
   INTERVAL arrive as bare numbers; a DateTime literal is written from the browser's local clock
   with whole seconds (`serialize.ts:106-114`), so a clicked timestamp filter never matches.
5. **Decimals and big integers** — 89 sites. One DECIMAL or BIGINT column holds numbers for small
   values and strings for large ones (`duckdb.ts` `decimalToScalar`/`toScalar`); every `typeof`
   test downstream (stats, heatmap, charts, exports, suppression) treats the two halves
   differently; `JSON.parse` on the server planes (`pure-v1.ts:124`) rounds them before any typed
   code runs; formats divide in floating point (`format.ts:282-295`); a DECIMAL(18,4) shows 2 places
   because the scale never reaches the client (`relation-type.ts` reads only the type name).
6. **Group keys and members are text** — 75 sites. A typed cell becomes text (`groupValue`,
   `treeview.ts:105-117`, local-time parts, milliseconds dropped), travels as `string[]` paths, and is
   re-typed from the column's declared type (`keyValue`, `serialize.ts:533-549`) to write a filter. The
   NULL-group marker collides with the path separator (`tree.ts:31` vs `serialize.ts:508`).
7. **Literals** — 62 sites. Filter values carry their type only as a JS value; `literal()`
   (`serialize.ts:116-124`) picks the literal form by `typeof`. A saved date filter is written as an
   ISO string and never revived on load (`persist.ts`), so after a reload it compares against a
   String. User input is rewritten through `String(Number(text))` (`filter-editor.ts:1148, 1160,
   1262`), so large integers and long decimals change silently.
8. **JSON / Variant shape** — 39 sites. `json-shape.ts` is a complete client type inferencer (its
   own JSON parser, a regex classifier, a widening lattice, a type table) over up to 1,000 sampled
   cells; `json-fields.ts` and `column-editor.ts` build on it; its UI says "types are a guess".
9. **What operators, aggregates and functions a type accepts** — 24 sites: filter operators
   (`filter-editor.ts:122-182`, `menu.ts:287`), aggregates (`panel-column.ts:90-117`, which also
   claims an aggregate keeps the column's type — wrong for `average`), calculated-column function
   signatures (`calc.ts:82-151`). Each restates the compiler's signature table.
10. **Hand-copied schemas** — the TRADES column types are written by hand in 4 client places and
    the physical schema in 5 more (`boot.ts:316-327`, `engine-cases.mjs:16-25, 208-217`,
    `main-engine.ts:47-56`, ...); `year`/`qty` are already BIGINT in the CTAS copies while the models
    say INTEGER.

## Where each fact belongs

The standing rulings bound the answer: types come from the compiler; legend-lite serves only
legend-engine's `pure/v1` APIs; the tab's planner is the same compiler as WebAssembly. So "server
side" means the compiler, reached through upstream's calls (or the same calls answered in the tab).

| the fact | its owner | reached through |
|---|---|---|
| the type of every column of every query: source, calculated, group stage, pivot leaves, drill, Ad Hoc, snap — with precision, scale, length and nullability | the compiler | `lambdaRelationType` (E5) for a query not being run; the plan's own result type for a query being run (E9 `tdsColumns`, E8 `builder`, the tab's `planOrError`) |
| a type's family (numeric, fractional, temporal, variant, boolean) | the compiler's type lattice | generated from legend-lite at build time, as the planner module is (decision D1) |
| which operators, aggregates and functions accept a type, and what they return | the compiler's native signatures | generated from legend-lite's native registry (decision D4), or asked by compiling |
| a source's model: its Database, column SQL types, and the explicit conversions for types the DDL cannot say | the compiler, from the database's own catalog | upstream `pure/v1/utilities/database/schemaExploration` (legend-engine has it; lite does not yet) for a server database; the same builder in the tab's module, fed the tab database's catalog rows, for an upload |
| a cell's value, exactly | the database | the plan's result, decoded per the compiler's type: calendar dates, exact decimals, big integers, microsecond timestamps; one representation per type on every plane |
| a value written as a Pure literal (filters, keys, members, drill, saved views) | the compiler's grammar composer | typed values in protocol JSON, rendered by `jsonToGrammar` (E4), or queries built as protocol JSON as upstream's DataCube builds them (decision D2) |
| a JSON column's paths and their types | the database, then the compiler | the database's JSON-structure function over the whole column, each extraction typed by `lambdaRelationType` (decision D5) |
| the default kind and aggregate for a type | a product rule, once | one function keyed on the compiler's type family (decision D3 settles which rule) |
| number and date formatting | the client — presentation | one formatter, keyed on the compiler's type and scale, never on `typeof` |

## Bugs the census found

Each is in the census with file and line; the ones marked (checked) were re-read by hand.

- A saved date filter or pinned pivot value comes back as a String after reload (`persist.ts`) (checked).
- A DATE is a local-midnight `Date`: a day shifts east or west of UTC depending on the reader (`duckdb.ts:203`) (checked).
- A DateTime filter from a click uses the browser's zone and drops milliseconds (`serialize.ts:106-114`) (checked).
- DECIMAL and BIGINT columns mix numbers and strings; JSON parsing rounds them on the server planes.
- `'Derived'`, `'String'`, `'Float'`, `'Unknown'` are invented where a type is missing (checked for `'Derived'` and `treeview.ts`).
- The context menu gives a numeric calculated column text operators (`menu.ts:747`), and knows no Timestamp, StrictTime or Variant.
- Pivot result columns show the source measure's type, not the aggregate's (`columns-panel.ts:520`).
- Number formats default from the source column's type: the average of an Integer shows 0 decimals.
- A saved view with an open NULL group does not restore it.
- The pinned relative-date pivot value writes `$x.d == 'today'` (`serialize.ts:816`).
- Unsigned integers are declared VARCHAR, HUGEINT/UBIGINT as BIGINT, TIMESTAMPTZ loses its zone, bare DECIMAL becomes (38,6) (`infer.ts`).
- The snap drops the plan's types and lets the tab database decide the snap table's (`cube.ts:566`).
- `samples.ts:172` corrupts values above 2^53 in its own sample file; `run-stress.mjs:163` throws on an undefined name.

## The plan

Each leg names its proof before its code, turns its rows green, and deletes what it replaces. The
uncommitted step-1 work (typed plans, `relation-type.ts`, step 0) is the start of T1 and is folded
into it, with its three shortcuts removed.

**T1. One type per column, from the compiler, everywhere.**
- Every query stage reads its columns from the compiler: source and calculated (E5), a level,
  pivot, drill, Ad Hoc or snap query from its own plan. The full generic type travels: precision,
  scale, length, nullability.
- Deleted: `pureTypeOfArrow`, `pureTypeOf`, `PURE_KIND_BY_SQL_NAME` and the dead lite-facts tables,
  every invented type (`'Derived'`, `'String'`, `'Float'`, `'Unknown'`), the host pages' hand-written
  column lists, `typedByPlan`'s pass-through for an untyped plan, `#adoptGroupStageTypes`.
- The snapshot stops storing types as truth: they are asked on open and on every change of source
  or calculated columns; a stored type is only the cache that reports a schema change.
- Proof: a check that no client code names a Pure type except the one reader; the typed-values
  suite; every plane reports the same types for the cube corpus.

**T2. The model from the database's catalog.**
- legend-lite serves `pure/v1/utilities/database/schemaExploration`; the tab's module gets the same
  builder over the tab database's catalog rows. The compiler maps database types to relational
  types and writes the explicit conversions (Variant for nested types, UTC for TIMESTAMPTZ, exact
  decimals for HUGEINT/UBIGINT, text for UUID/TIME/INTERVAL, refusal for BLOB).
- Deleted: `sqlTypeOf`, `inferModel`'s DDL, `isNestedType`, the upload's own `to_json` rewrite.
- Proof: design step 3's rows (S3a–S3c); an upload and a warehouse table of the same file get the
  same model.

**T3. Exact cells.**
- Each reader decodes by the compiler's type, not the engine's: a date is a calendar date, a
  decimal an exact decimal, an integer exact past 2^53, a timestamp keeps its microseconds, TIME
  and INTERVAL their own values. The server planes parse numbers losslessly.
- Every `typeof`/`instanceof` on a cell becomes a switch on the column's type.
- Proof: design step 2's rows (S2a–S2d) under `TZ=Asia/Tokyo` and `TZ=America/New_York` lanes.

**T4. Typed keys and literals through the compiler.**
- Group keys, members and filter values stay typed values end to end; the NULL group is a real
  null. Literals are rendered by the compiler's composer (D2). Saved views store literals the
  compiler wrote and no types.
- Deleted: `groupValue`'s text keys, `keyValue`, `temporalLiteral`, `literal`'s `typeof` dispatch,
  the three date-text copies, `parseValue`'s guessing.
- Proof: a timestamp with microseconds filters, drills and groups to exactly its rows; a saved date
  filter survives reload; a NULL group reopens.

**T5. What a type accepts, from the compiler.**
- Filter operators, aggregates and calculated-column functions offered per type come from the
  compiler's signatures (D4); an aggregate's result type from the plan.
- Deleted: the two operator tables, the aggregate table, `calc.ts`'s hand-written signatures.
- Proof: every operator and aggregate offered for every type in the sample compiles; none that
  would compile is missing.

**T6. JSON shape from the database.**
- The paths and types of a JSON column come from the database over the whole column (D5), each
  extraction typed by the compiler.
- Deleted: `json-shape.ts`'s parser, classifier and table.

**T7. One formatter on compiler types.**
- Formats, colours, heatmaps, charts, stats and exports read the column's type and scale; one
  compact-number and one date renderer.
- Stays client: this is presentation of already-typed values.

**T8. Harnesses ask the compiler.**
- The demo and verification scripts read the source's relation type before choosing columns, and
  compare typed values, not rendered text.

**T9. Sources (the user, 2026-09-27), after T8.** Every source is a database or file whose model
comes from its catalog (T2) and whose types come from the compiler (T1):
- files: CSV, Parquet, JSON, and Excel workbooks; pasted clipboard data;
- a REST API at a user-given URL (JSON as Variant or a table, by its shape);
- a remote database's table or query, live or snapped;
- files in object storage (S3, GCS, Azure; Parquet, Iceberg, Delta), credentials held server side;
- legend-engine's own sources: a saved Legend Query, a Pure function or service, a data product;
- another cube's result or saved view (a cube over a cube).
Streaming sources (Kafka, websocket) are recorded for later: they change the refresh model.

**T10. Extract a subset of a Variant column (the user, 2026-09-27), after T6.** A sub-object or an
array becomes a new Variant column, not only a scalar; its type is the compiler's
(`lambdaRelationType` of the extraction), its shape the database's (T6).

Order: T1, then T2 and T3 (independent), then T4, T5, T6, T7, T8, then T9 and T10. Legs B (one state owner) and the
remaining audit legs are unaffected, except that T4's typed keys remove the key text leg B would
otherwise carry.

## Decisions (the user, 2026-09-27: "agree with all")

- **D1 = generate.** Type families are generated at build time by RUNNING legend-lite's type lattice
  (a Java program over `Type.Primitive`, not a regex over its source), shipped with the module like the
  planner itself. legend-lite's lattice first learns the precise primitives it is missing, exactly as
  legend-pure's `precisePrimitives.pure` declares them (Varchar extends String, Numeric extends
  Decimal, Timestamp extends DateTime; the other twelve are already aliased).
- **D2 = protocol JSON.** The cube's queries are built as lambda protocol JSON, as upstream's DataCube
  builds them; a literal is a typed node whose value text is the database's own rendering. Pure text
  is for display, rendered by the compiler.
- **D3 = every numeric column is a measure** (upstream's rule), unless the host or user declares a
  kind; one function keyed on the compiler's type family.
- **D4 = generate** the accepts-and-returns facts for operators, aggregates and functions from
  legend-lite's native registry; the compiler still refuses anything wrong.
- **D5 = the database.** A JSON column's shape comes from the database over the whole column, through
  a legend-lite native rendered per dialect (announced to the untangle first); each extraction typed
  by the compiler.

## The decisions as they were put

- **D1. Type families.** Generate the family table from legend-lite's type lattice at build time (the
  compiler's fact, shipped with the module), or ask the compiler at run time. Recommended: generate.
- **D2. Literals.** Keep writing Pure text and have the compiler render each typed value (lite serves
  E4 `jsonToGrammar`), or build the cube's queries as protocol JSON as upstream's DataCube does, with
  E1 no longer needed. Recommended: protocol JSON (upstream parity; the literal is never text in the
  client).
- **D3. The default kind rule.** Every numeric column a measure (upstream's DataCube, and `kindOf`
  today), or only fractional ones (the documented intent, `infer.ts`). The code disagrees with itself
  now; one must win.
- **D4. Operators and aggregates.** Generate the signature facts from lite's native registry, or offer
  everything and let the compiler refuse. Recommended: generate.
- **D5. JSON shape.** Ask the database's JSON-structure function through the compiler (a raw-SQL or
  metadata call), or keep a client sampler as presentation-only hints. Recommended: the database.
</content>
</invoke>
