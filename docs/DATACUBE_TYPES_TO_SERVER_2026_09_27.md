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

**T2 as landed (2026-09-27).** The DuckDB dialect reads its own catalog: `SqlDialect.catalogType`
(`DuckDb`: DECIMAL/NUMERIC keep precision; STRUCT/LIST/MAP/UNION become SEMISTRUCTURED via
`to_json`; TIMESTAMPTZ its UTC TIMESTAMP; UBIGINT/HUGEINT DECIMAL(20,0)/(38,0); UTINYINT..UINTEGER
the next signed width; TIME/UUID/INTERVAL/ENUM/BIT/VARINT text; BLOB and anything unknown refused
by column). `CatalogModel` writes the Database, the accessor and the conversions, and refuses two
columns a case apart. An awkward schema/table name is quoted in the accessor
(`#>{db."my s"."my t"}#`, as upstream reads it: it splits on dots and keeps the quotes); only a
`.` or a character the accessor's grammar refuses is refused. That needed a core fix: the model
kept a table's name bare but a schema's quoted, and the accessor compared its parts as written, so
a quoted table never resolved; names are now bare throughout, the accessor's parts read as
relational identifiers. The tab's module exports it (`databaseFromCatalogOrError`,
`WasmPlanner.databaseFromCatalog`); `inferModel` only wraps its Database in a connection and
runtime. An upload applies the conversions at ingest; a warehouse table is read-only, so a column
that needs one is left out and named in the status. Deleted: `sqlTypeOf`, `isNestedType`,
`quoteIdent`, the upload's own `to_json` rewrite. Proof: `CatalogModelTest` compiles every DuckDB
type and reads the compiler's type back; `upload.test` runs the conversions in DuckDB-WASM (a
TIMESTAMPTZ lands in UTC to the microsecond, UBIGINT's maximum exact, UUID and TIME as text);
typed-values refuses a BLOB by name (S3c). S3a was not met at first (a warehouse table's STRUCT
column was left out); it is now: a native STRUCT/LIST/MAP/UNION is a Variant as stored, read by
DuckDB's dialect with no conversion (docs/VARIANT_STORAGE_CENSUS_2026_09_27.md, V1-V3). The HTTP
`schemaExploration` endpoint for server databases stays recorded for T9.

**T3. Exact cells.**
- Each reader decodes by the compiler's type, not the engine's: a date is a calendar date, a
  decimal an exact decimal, an integer exact past 2^53, a timestamp keeps its microseconds, TIME
  and INTERVAL their own values. The server planes parse numbers losslessly.
- Every `typeof`/`instanceof` on a cell becomes a switch on the column's type.
- Proof: design step 2's rows (S2a–S2d) under `TZ=Asia/Tokyo` and `TZ=America/New_York` lanes.

**T3 as landed (2026-09-27).** A cell keeps the database's exact form (`src/values.ts`): a DATE its
calendar text, a TIMESTAMP its stored text to the microsecond (read from Arrow's raw storage, not
`get()`), a DECIMAL its exact text, an integer a bigint past 2^53; JS `Date` left `Scalar`. The
engine page reads JSON with exact numbers (`parseExact`) and timestamps as stored. The formatter
takes the column's compiler type and renders dates in UTC; exports, the tooltip, group keys, spread
sheets, charts, heatmaps and selection stats read by type; selection sums are exact. A filter value
from a cell is spelled by its column's type (the bridge until T4's protocol JSON). S2a-S2c green in
UTC, Tokyo and New York. Left for T4: the filter editor's own date inputs (still JS `Date`, the DST
and local-clock bugs).

**T4. Typed keys and literals through the compiler.**
- Group keys, members and filter values stay typed values end to end; the NULL group is a real
  null. Literals are rendered by the compiler's composer (D2). Saved views store literals the
  compiler wrote and no types.
- Deleted: `groupValue`'s text keys, `keyValue`, `temporalLiteral`, `literal`'s `typeof` dispatch,
  the three date-text copies, `parseValue`'s guessing.
- Proof: a timestamp with microseconds filters, drills and groups to exactly its rows; a saved date
  filter survives reload; a NULL group reopens.

**T4 as planned (2026-09-27, D2 affirmed after a second look).** Keeping Pure text would keep a
TypeScript copy of the lexer's literal, escape and identifier rules -- already drifted once (a Decimal
value spelled `12.30`, a Float literal to the lexer). Query builders across a language boundary build
the tree and let the language print it (Spark Connect, Substrait, Ibis, jOOQ). Three steps:
T4a the composer and the JSON entries; T4b a reusable TypeScript protocol library (Relation API only;
the user: old TDS is accepted and printed for compatibility, never built) and DataCube built on it;
T4c typed keys, members, filter values and saved views. The text entries stay beside the JSON ones
(the user: upstream accepts grammar, other callers may send it).

**T4a as landed (2026-09-27).** `PureComposer` prints protocol JSON as upstream's
`jsonToGrammar/lambda` does (its composer ported rule for rule, STANDARD and PRETTY), after
`ProtocolUpgrade` brings older shapes current as upstream's protocol converters do. Proof:
`parser-equivalence` ComposerParityTest composes every lambda of every oracle-accepted corpus
source (28,183) and of upstream's lambda round-trip tests (313) with both printers: 56,990 of
56,990 prints byte-identical, 0 refused (upstream's own printer throws on 2). Served as E4
(`lambda`, `lambda/batch`; `text/plain`, `renderStyle` PRETTY by default); request bodies parse to
depth 1024. The tab's module gains the four JSON twins; the WASM differential proves, for every cube
shape, that planning its JSON gives the same SQL and types as planning its text and that the print
parses back to the same JSON in both styles.

**T4b step 2 design: DataCube on protocol JSON (2026-09-27, before any edit).** The user's rule:
everything inside the product is protocol; Pure text exists only where a PERSON reads or writes
it, and the compiler owns both edges (E1/`lambdaJsonOrError` parses what a person types, once, on
OK; E4/`composeLambdaOrError` prints for a person to read). Every place text lives today, and what
it becomes:

| where | today | becomes |
|---|---|---|
| `CubeSnapshot.source` | `{expression: '#>{db.T}#'}` text | `{query: ValueSpecification}`: built by `accessor(...)` for a catalog/upload source, parsed once for a hand-written one |
| a calculated column (`derived`, `groupDerived`) | `expression` text spliced into `extend(~[n: x|<text>])` | `lambda: Lambda`, parsed once when the editor's OK is pressed; the editor shows the compiler's print when reopened |
| `serialize.ts`, `drill.ts`, `plan.ts`, `cube.ts`, `adhoc/*`, `treeview.ts` | Pure text glued together; `literal`/`temporalLiteral`/`escapePure`/`ident` | the same functions building `Lambda`s with `pure-protocol` (Relation API); the four text helpers deleted |
| `json-shape.ts` Variant paths | `->get('k')` text | `fn('get', ...)` nodes (T6 then moves the shape to the database) |
| the column editor's template | `~[name: x|` text | nothing: the editor edits the expression alone and the column's name is a field |
| `Planner` (`WasmPlanner`, `UpstreamPlanner`) | `plan(text)`; the server plane runs E1 then E9 | `plan(lambda)`: `planJsonOrError` in the tab, E9/E5/E8 with the JSON on a server (no E1 for the cube's own queries) |
| the SQL panel's "Generated Pure" | the built text | the compiler's print (`compose`) |
| saved views (`persist.ts`) | `JSON.stringify` of the snapshot, text inside | `pure-protocol`'s exact `toJson`/`readLambda` (an exact decimal cannot go through `JSON.stringify`); a view saved before this carries text: on load its source and calculated columns are parsed once (the compiler), and it is saved back in the new form |

Order, each its own green chain and commit: (a) the snapshot's source and calculated columns
become protocol, parsed at the edges; (b) the query builders build `Lambda`s side by side with the
text ones, and a test asserts, for every cube case the suites run, that lite's parse of the old
text equals the new JSON byte for byte; (c) the planners take JSON, the SQL panel prints; (d) the
text builders and the four text helpers are deleted, the side-by-side test with them. Proof after
(d): the WASM differential, pivot rows, typed values (three zones), the app and Ad Hoc suites, same
SQL and rows; a guardrail that no `src/` file builds Pure text (no `'->'`/`'~['`/`'#>{'` string
building) and none calls a TDS function.

**T4b as landed so far (2026-09-27).** Step 1 (2d41013f1): `pure-protocol/` (the reusable library)
and `datacube/src/query.ts` build every cube query as a tree, proven byte-equal to lite's parse of the
old text over the corpus cases, 376 filters, every window, aggregate and drill (a filter precedence bug
found on the way, 0980fb401). Step 2 (cb192b6c9): planners, runners and the remote executor take the
tree (`plan`/`relationType`/`execute` of a `Lambda`, plus `parse` and `print(style)`); the tab keeps
`planText` beside it. Text remains only in the snapshot (the source, a calculated column), parsed once
per text by the compiler. The column editor's caret now comes from the draft's own parse refusal: a
type refusal names no position in either form (checked in the module). Alerts print PRETTY (upstream's
debug info); the demo panel STANDARD.

**T4b step 3 as landed (2026-09-27): the snapshot holds protocol, and the text builders are gone.**
Checked against upstream first: its snapshot holds a calculated column as protocol
(`DataCubeSnapshot.ts`: `mapFn: PlainObject<V1_Lambda>`) and its editor edits the whole lambda
(`x|...`), printed on open and parsed on OK. So:
- `SourceRef.query` is a `ValueSpecification` (a catalog's comes from the tab's module as the
  compiler's own parse of its accessor; the demo's are `accessor(...)`); a calculated column holds
  its `lambda`. Nothing in the product parses per refresh any more.
- `serialize.ts`'s and `drill.ts`'s text builders are deleted; the query-building rules they also
  held are folded into `src/query.ts` (the one module that turns a snapshot into queries); drill.ts,
  left with no product caller, is deleted; `test/query-twins.test.ts` goes with the text it compared.
- The column editor edits the whole lambda as upstream's does; the compiler parses it (its parse
  refusal carries the caret), and prints a column back when it reopens. The JSON-field picker builds
  trees (`fn('get', ...)`), so no TypeScript spells a literal there.
- A snap needs a named target (`SnapTarget`: a table the model declares, and its relation); the
  generated SQL-identifier "source" no compiler could read is gone.
- Saved views: the MINIMUM (the user) -- format 2 written and read exactly by the protocol library;
  a view saved before is refused with a message, not migrated. Upstream's specification is #21.
- The WASM differential's cases are trees, and the JVM answers are planned from their JSON
  (`JvmMain ... json`).
- Tests that pinned query text pin the COMPILER's print of the tree (lite's printer, STANDARD):
  `|t->...` for a query, `name:x|` in a column spec, `unbounded()->rows(0)`, `!=` for `not(==)`.
- Guardrail (`test/guardrails.test.ts`): no string in `src/` holds Pure syntax outside the
  editor's typing help and one refusal (pinned), and no `fn(...)` calls a TDS function.

T4b is complete with this. **Next: T4c** (typed keys, members and filter values; a literal's type
from the column's compiler type; the NULL group a real null; exact filter inputs).

**T4c as landed (2026-09-27): keys and values typed end to end.**
- A group key (`GroupKey`, src/tree.ts) is the cell's EXACT text or a real `null`; a path's key is
  its JSON. The `NULL_GROUP` text sentinel and `keyValue` are deleted; a null key is `isEmpty`.
  Ad Hoc members are paths of the same keys (their header segments and indexes are JSON).
- A literal's type is ALWAYS the column's compiler type (its plain primitive from the generated
  facts, `lit.of`): the `TEMPORAL_TEXT`/`EXACT_NUMBER` regexes, the `.`-means-float rule and the
  typeof dispatch are deleted; a value whose column the compiler has not typed is REFUSED. Text
  operators (contains, the case-insensitive ones) take text operands by their nature.
- `FilterValue` has no JavaScript `Date`: a date is its day and time as text, validated from the
  person's input; a number typed as plain digits stays those exact digits. `parseValue`'s guessing
  is deleted (`parseTyped` by the column's type); `localDateText`/`dateNode` are gone.
- Found by typing, fixed: an Ad Hoc POV filter's column was dropped from its query's typed
  columns (a guessed literal hid it).
- Saved views are format 3 (the path keys changed); older are refused, as the user ruled for 2.
- ONE QUERY, ONE BYTE STRING (the user, 2026-09-28). The round trip -- the tree DataCube builds,
  printed by the compiler, parsed back -- is byte-identical JSON. What that took, measured first:
  - the printer keeps a decimal's digits (`10.10D`). Upstream's printer drops them, and not by
    design: its reader (`CDecimal.CDecimalDeserializer`) reads the value through a Jackson tree node,
    where a JSON fraction is a double -- so `10.10` is `10.1` and `12345678901234567.89` is
    `12345678901234568`, on EXECUTE and generatePlan too (matters once DataCube talks to a real
    legend-engine). Cost: 2 of 56,990 parity prints, one lambda whose own upstream test expects
    `new BigDecimal("10.10")`; named in ComposerParityTest (EXACT_DECIMAL).
  - lite's JSON library writes a number back as the token it read (it re-spelled `1e5` as `1E+5`);
    measured with the full chain first -- every corpus and PCT gate passed.
  - pure-protocol writes numbers as the wire does (spelling.ts): a Float as JDK `Double.toString`, a
    Decimal as `BigDecimal.toString`. Not Pure's grammar: the reference writer's number layout. 0 of
    21,845 doubles differ from lite's JVM (JDK 25); all 1,012 fuzzed decimals match.
  - the tab's build (TeaVM) spells 30 of those doubles differently (17-digit ties, subnormals) and
    reads/writes 2 one ulp off. Accepted by the user as a 17th-digit divergence; pinned exactly in
    the twins test, so a new one fails.
- Guardrail: no null-key sentinel and no Date on the query path.

- The compiler judges a date (the user, 2026-09-28, option b): pure-protocol carries a date, a
  timestamp and a time of day AS GIVEN (its calendar and clock checks are gone; a number is still
  checked, since it must be a JSON number); the filter editor keeps the text as typed; Apply/OK
  compiles the candidate cube first, as the Properties editor does, and a refusal applies nothing,
  in the compiler's words ("Invalid month: 13", "invalid hour: 25" -- probed: lite's reader refuses
  every malformed value, and normalizes a picker's `2024-01-02T03:04`).

T4 is complete with this. **Next: T5** (what a type accepts, from the compiler: generated
operator, aggregate and function signatures, D4).

**T5. What a type accepts, from the compiler.**
- Filter operators, aggregates and calculated-column functions offered per type come from the
  compiler's signatures (D4); an aggregate's result type from the plan.
- Deleted: the two operator tables, the aggregate table, `calc.ts`'s hand-written signatures.
- Proof: every operator and aggregate offered for every type in the sample compiles; none that
  would compile is missing.

**T5 design (the user, 2026-09-28: "lets do it").** Facts from the compiler, product rules without
type names, parity with upstream checked:
- GENERATED by running lite at build time (`datacube/tools/offer-facts/generate.ts`, the tab's own
  WASM compiler, diff-tested like `lite-facts.ts`): a model with one column of each plain primitive
  (each column's compiler type checked, never assumed); then, for each primitive, the EXACT queries
  DataCube sends (src/query.ts) -- each aggregate as a level's measure, each filter operator as a
  condition -- compiled, recording what compiles and the aggregate's result type; and each curated
  calculated-column function applied to each primitive, recording its accepted first argument and
  return type (the signature text the editor shows).
- RULES in TypeScript, naming no type: offer an aggregate that compiles for the column and returns the
  column's own family (upstream's "an aggregate keeps the column's type": count on numbers, not text;
  joinStrings on text; min/max on dates); offer an operator that compiles for the column's type.
  Deleted: the operator COMPATIBLE table, `aggregatesFor`'s family table, calc.ts's hand signatures.
- A calculated column is typed by the compiler before it is offered anything (step 0), so one that
  turns values into text (`x|$x.qty->toString()`) is a String and offers joinStrings (the user's
  example, pinned by a test).
- PARITY: a test lists, per type, where our offers differ from upstream DataCube's
  (`isCompatibleWithColumn` per operation), each difference named for a person to review.
- Families, never exact names: an aggregate is offered when its result is in the column's FAMILY
  (the compiler's lattice), so the rule holds when lite reports precise types (below): upstream's
  `sum` over a `BigInt` column returns `Integer`.

**T5 state (2026-09-28): COMPLETE.** Half 1 (aggregates, calculated-column functions) 05aef9bde; half 2
(filter operators) with two lite fixes.
- Generator: `datacube/tools/offer-facts/emit.ts` (DataCube's own queries, by `query.ts`, over a probe
  column of every type -- stored: VARCHAR, INTEGER, BIGINT, DOUBLE, DECIMAL(20,4), BIT, DATE, TIMESTAMP,
  SEMISTRUCTURED; calculated: Number, Date, StrictTime, and text made by `toString`) and
  `OfferFacts.java` (compiles them with legend-lite on the JVM -- the WASM module's same source -- and
  fails if a probe is not the type it was built as, or if two probes of one type get different
  answers). Output `src/generated/offer-facts.ts`, diff-tested. Rules in `src/offers.ts`, naming no type.
- Aggregates: offered when the compiler accepts the level query and the result stays in the column's
  family. min/max compile on EVERY type on both compilers (Pure's `collection::min<X>`), and stay
  offered (the user: don't lose them; JSON orders by its text in the database).
- Operators: offered when the condition compiles. That is the whole answer because the query names
  the function the operator means where Pure's name is ambiguous: the text "contains" is
  `meta::pure::functions::string::contains` -- the one operator function whose name Pure also
  declares for collections (`contains(Any[*], Any[1])` takes a number, as membership). Every other
  operator's short name resolves to its one function or is refused (measured). The full name shows
  only in the error dialogs that print the whole query; the user, 2026-09-28: long names there are
  fine. (Rejected on the way: a table of meant functions compensating for lite's wrong resolution --
  "why hack more stuff instead of fixing properly" -- and short names plus a build-time check of the
  resolved function, extra code only to shorten error text.)
- Two lite defects fixed at the source (the user: "make both yourself"): legend-engine's
  `string::contains(String[0..1], String[1])` registered through the membership table (lite had the
  startsWith/endsWith forms, and its lowering inlined this one's body under the COLLECTION callee); and
  the collection `contains` over a to-one value (`$x.qty->contains(1)`) boxes it, where it wrote
  `list_contains(t0.qty, 1)`, which DuckDB refuses.
- Nothing lost (the user: "do the right thing for users and don't lose functionality"): a test copies
  the offers before T5 and asserts each is still made; the one exception, `<`/`>` on a time of day,
  never compiled (Pure declares no order on StrictTime, upstream or lite). Gained, by the compiler's
  answer: ordering on text and booleans, membership/equality/presence on booleans and times, equality
  and membership on JSON, min/max on booleans and JSON.
- The user's requirement: a calculated column `$x.qty->toOne()->toString()` offers joinStrings (pinned
  through the real compiler); `$x.qty->toString()` on a table column is refused -- `toString(Any[1])`
  takes one value -- as upstream refuses it.
- Calculated-column functions: the build compiles every example (a failing one fails the build) and the
  editor shows the compiler's declarations, every overload.
- Time of day has no ordering in Pure, looked for properly (2026-09-28): StrictTime appears in 9
  upstream .pure files (its declaration, literal, representation, protocol, DuckDB/Snowflake type
  conversion) and no function takes it; none of the engine's 838 handler ids names it. Left (the user).

**Exact-API gap: precise column types (recorded 2026-09-28, the user: "sure").** Upstream types a
relation accessor's columns as legend-pure's precise primitives (RelationalCompilerExtension
`convertTypes`: VARCHAR(n) → `Varchar(n)`, DECIMAL(p,s) → `Numeric(p,s)`, INTEGER → `Int`, BIGINT →
`BigInt`, DOUBLE → `Double`, TIMESTAMP → `Timestamp`, BIT → `TinyInt`); each is a subtype of its plain
parent, kept by a column reference, select, filter, sort and group keys, and lost by any function whose
signature returns a plain type. lite keeps DECIMAL(p,s) inside the graph (`Type.PrecisionDecimal`,
StoreCompiler) but aliases the rest to plain primitives (`Type.Primitive.BY_FQN`) and answers plain
names on the wire, and types BIT as `Boolean` where upstream says `TinyInt` (the one divergence in
what a column IS, not only its name). Who reads them, measured: NOT DataCube -- upstream's collapses
every precise name to a plain family in six files and never reads a width (its DuckDB cache carries
"TODO: we need precision and scale"), ours likewise; not our snapshots (`CREATE TABLE ... AS SELECT`
keeps DuckDB's own types); not the warehouse (DuckDB's metadata). They matter to (1) byte-identical
`lambdaRelationType` / execute result types and error messages, and (2) SQL that creates a table from
a Pure type (upstream `pureTypeToDataType`: temp tables, relation write). A core compiler leg,
corpus/PCT measured first; due when either (1) is pinned byte-for-byte or relation write is built.

**T6. JSON shape: the sampler, made robust (REVISED 2026-09-28, the user).** D5 (the database's
JSON-structure function over the whole column) was measured and set aside: upstream Pure has no
function that reports a column's structure (a document's KEYS it can list, `to(@Map<String,
Variant>)->keys()`, a correction recorded below), so a lite-only native would break the field browser on the legend-engine plane
("same client code on both"), and DuckDB's `json_group_structure` loses what users have (dates,
presence, common values). The browser only SUGGESTS which `to(@T)` to write; the compiler types
every column it makes. So the sampler stays client side, and becomes robust:
- two modes: a SAMPLE (the first rows, labelled "1,000 of N rows sampled", N from a count query)
  and READ EVERY ROW -- one ordinary query streamed chunk by chunk (`QueryEngine.stream`, new:
  DuckDB-WASM's Arrow batches, the warehouse's Arrow chunks; the legend-engine plane hands its whole
  result over as one chunk), each chunk observed and let go: one scan, every row exactly once,
  flat memory, Cancel. Every plane.
- rejected on the way: grouping the column by document and paging the groups (real documents
  rarely repeat, and each page re-ran the whole grouping and sort); copying into DuckDB first (the
  same bytes, plus storage -- a snapped cube's full read scans the copy anyway).
- proven through the real app (`test/json-read`): 2,500 documents, a field only the last has; the
  sample misses it, reading every row finds it, in more than one chunk.
- the future home, if wanted server side: a Variant keys/structure function proposed to upstream
  Pure, then implemented by lite; never a lite-only native or endpoint.

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
- a WEB PAGE at a user-given URL whose embedded table becomes the source (the user, 2026-09-28; as
  Excel/Power BI "Get Data from Web" and pandas `read_html`): fetched SERVER side (a tab cannot read
  another site's page), its `<table>`s listed for the user to pick one, then ingested like an
  upload -- DuckDB reads it, the compiler declares and types it. A table a page builds with script
  needs a headless browser: a second tier. Refresh re-fetches; a snap freezes it;
- a remote database's table or query, live or snapped;
- files in object storage (S3, GCS, Azure; Parquet, Iceberg, Delta), credentials held server side;
- legend-engine's own sources: a saved Legend Query, a Pure function or service, a data product;
- another cube's result or saved view (a cube over a cube).
Streaming sources (Kafka, websocket) are recorded for later: they change the refresh model.

**T10. Extract a subset of a Variant column (the user, 2026-09-27) -- DONE 2026-09-28.** A
sub-object, an array, or an array's first element becomes a JSON column of its own, typed Variant by
the compiler, and is read and extracted from again like any JSON column. Proven through the real app
(`test/json-read`): customer -> its tier; items -> their count; items' first element -> its sku.
Added: "first element, as JSON" for an array of objects.

**Explode (the user, 2026-09-28: "all cities explode ... all tuples of city+kind").** A calculated
column marked `unnest` is each row once per element of the collection its expression yields:
`lateral(x|<collection>->flatten(~name))`, upstream Pure's own unnest (`lateral` and `flatten` are
upstream functions; lite lowers them to `CROSS JOIN LATERAL (... UNNEST ...)`). The element is a JSON
column of its own, extracted from again, so an address's kind and city sit side by side; the Columns
panel hides the id to leave just (kind, city), and grouping by both gives each pair once. The field
browser offers "one row per element (explode)" on every array, and the column editor a checkbox,
row stage only, warning that a row's own figures then count once per element. Proven through the
real app (`test/json-read`) against DuckDB's own UNNEST. pure-protocol gained `Relation.lateral` and
`flatten`, twinned byte for byte with lite's parse. Also measured on the way: upstream Pure CAN list a
document's keys (`to(@Map<String, Variant>)->keys()`), which an earlier T6 note denied; a database
key census is possible, and kept for later -- the streamed full read already gives every field.

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
