# Variant over native nested storage: census (2026-09-27)

The user asked (2026-09-27): "for struct, can we read struct as variant?" and "do full census on the
variant before we change anything". Nothing has changed yet; this is the census and the proposed
change.

## The question

A DuckDB table can hold nested data two ways: as JSON (`JSON`, text underneath) or natively
(`STRUCT(...)`, `T[]`, `MAP(K, V)`, `UNION(...)`). legend-lite's Pure type for both is `Variant`.
Today (T2, 5f63ee0d4) a native column is only usable after conversion: an upload is rewritten with
`to_json` at ingest; a read-only warehouse table leaves the column out. Could a native column be
declared `SEMISTRUCTURED` and read as it is?

Upstream's contract, for reference: legend-engine's DuckDB extension stores `SEMISTRUCTURED` and
`JSON` columns as DuckDB `JSON` (`core_relational_duckdb/relational/typeConversion.pure:78-79`) and
navigates with `json_extract` (`duckdbExtension.pure:363`). Native nested storage is outside it; any
support here is lite reading a store upstream would not create, never a different answer for a store
upstream would.

## Pure Variant is DuckDB JSON, not DuckDB VARIANT (added after the user asked)

lite, like upstream, writes Pure's `Variant` / a `SEMISTRUCTURED` column as DuckDB `JSON`: a cast to
Variant is `CAST(... AS JSON)`, `toVariant` is `to_json(...)`, the catalog reads DuckDB `JSON` as
`SEMISTRUCTURED`. DuckDB also has its own young `VARIANT` type, missed by the first pass of this
census. Probed 2026-09-27:

| | DuckDB 1.4.4 (CLI, the JVM driver's line) | DuckDB-WASM (engine 1.5.4, the tab) |
|---|---|---|
| `x::VARIANT` in a query | works | works |
| a table column of type VARIANT | **refused**: "A table cannot be created from a VARIANT column yet" | works |
| `x -> 'k'` (the JSON arrow lite emits) | fails: reads DuckDB's text form as JSON | fails the same way |
| `variant_extract(x, 'k')` | works | works |
| `to_json(x)` | wrong: DuckDB's text form as a JSON string, `"{'sku': ABC}"` | the same |
| `x[1]` on a list | 1-based (10 of [10,20,30]) | the same |

So targeting DuckDB VARIANT would need a different navigation vocabulary (`variant_extract`), has no
working conversion to JSON text yet, and the two DuckDB builds we run disagree on whether it can be
stored. It is recorded, not proposed; revisit when both builds store it and `to_json` reads it.

## How the census was taken

1. **Every Variant operation lite emits**, from the Pure surface down. The registered Variant natives
   (`builtin/Pure.java`): `get(Variant, String)`, `get(Variant, Integer)`, `to<T>`, `toMany<T>`,
   `toVariant`, `fromJson`, relation `flatten`. Their lowering (`lowering/*.java`, every use of
   `SqlFn.VARIANT_GET`, `VARIANT_ELEMENTS`, `TO_VARIANT`, `JSON_TYPE`, `JSON_ARRAY_LENGTH`,
   `JSON_PRETTY`, `JSON_MERGE_PATCH`), and their DuckDB rendering (`DuckDb.variantGet`,
   `variantElements`, `variantAwareCast`, `variantConstruct`; `Spellings` rows for the `json_*`
   functions; `CastPolicy` for `to`/`toMany`).
2. **Two kinds of Variant value, separated.** Most of those sites build JSON themselves (canonical
   rendering, mixed collections, verdicts, `json_object`/`to_json` construction): their input is
   always JSON, so storage cannot matter. The census traces what a value read from a STORED column
   can reach.
3. **Every such SQL form run against every storage**: JSON, STRUCT, LIST, MAP, LIST of STRUCT, in
   DuckDB 1.4.4 (CLI) and the tab's DuckDB-WASM (engine v1.5.4, `@duckdb/duckdb-wasm`
   1.33.1-dev57). The two agree on every row.
4. **Every result reader**: the server's result JSON (`WireRender`, the database's `json_object`),
   the tab's Arrow reader (`datacube/src/duckdb.ts`), the warehouse's Arrow chunks, and DataCube's
   Variant features (`json-shape.ts`, `serialize.ts`, the filter editor, `style.ts`).

## What agrees (no change needed)

| # | form (as lite renders it) | JSON | STRUCT / LIST / MAP |
|---|---|---|---|
| 1 | `get(key)`: `(x -> 'sku')` | `"ABC"` | `"ABC"` (all three) |
| 3 | `(x -> 1)` | 20 | 20 |
| 4-6 | `to<T>` after `get`: `CAST((x ->> 'k') AS T)` (Integer, String, StrictDate, Decimal exact, HUGEINT exact) | value | same value |
| 7-8 | `toMany` / `flatten`: `CAST(x AS JSON[])`, of a nested get too | elements | same elements |
| 9 | `to_json(x)` | JSON | the same JSON |
| 10-12 | `json_type`, `json_array_length`, `json_pretty` | | same |
| 14 | `to(@String)` of a whole value: `(x ->> '$')` | JSON text | same JSON text |
| 15 | chained `((x -> 1) ->> 'sku')` | `Y` | `Y` |
| 17 | `json_merge_patch(x, ...)` | | same |
| 21-22 | a key holding null; a missing key | | same (arrow non-null JSON `null`, text NULL; missing NULL) |
| wire | the server's result JSON (`json_object('v', x)`) | `{"v":{...}}` | byte-identical |

Every navigation step (`->`, `->>`, `CAST AS JSON[]`, the `json_*` functions) casts a native value to
JSON implicitly, so from the first step on the value IS JSON. What a STRUCT's values become as JSON is
exactly what today's ingest conversion writes (both are `to_json`): a TIMESTAMP
`"2024-01-02 03:04:05.123456"`, a TIMESTAMPTZ `"...+00"`, a DECIMAL `12.30`, a HUGEINT/UBIGINT the
exact integer, a UUID/TIME/INTERVAL/ENUM text, a BLOB its text, a MAP with integer keys text keys,
a UNION `{"member": value}`.

## What differs (the whole census)

| | where | JSON storage | native storage | who emits it today |
|---|---|---|---|---|
| **D1** | `get(Integer)` renders a SUBSCRIPT, `(x)[1]` (`DuckDb.variantGet`) | 0-based: `[1]` is 20, `[-1]` 30, `[5]` NULL | a LIST subscript is 1-based: `[1]` is **10**, `[0]` NULL -- a silently wrong element | only a user's `get(Integer)` on a Variant (`Lowerer` `AT_VARIANT_NAVIGATION_GET`) |
| **D2** | a whole column value leaving the query | Arrow `Utf8`: JSON text | Arrow `Struct`/`List`/`Map`: the tab's reader falls to its legibility fallback (`duckdb.ts:96`, `JSON.stringify` of Arrow's row object), which is lossy (a DATE inside becomes a day number, a DECIMAL a buffer) | any query projecting a Variant column; the server's wire is unaffected (row "wire") |
| **D3** | a whole column value compared, grouped, sorted or made distinct | by TEXT: `{"a":1}` and `{"a": 1}` are two groups | by VALUE: one group | GROUP BY / `==` / sort on a Variant column (DataCube can group by one) |
| **D4** | `CAST(x AS VARCHAR)` of a whole value | JSON text | DuckDB's own syntax: `{'sku': ABC}`, `{sku=ABC}` | **no emitter found**: `to(@String)` and `toString` route through `(x ->> '$')` (`CastPolicy`, `PureSql.elementText`) |
| **D5** | the column's own type | `JSON` | `STRUCT(...)` etc. | only visible through D2-D4 |

`to_json` of an already-JSON value is NOT the identity: it re-serializes compactly
(`{"a": 1,  "b" : [1, 2]}` -> `{"a":1,"b":[1,2]}`). Both storages keep SQL NULL as NULL under it.

DataCube reads every Variant cell as JSON TEXT (`json-shape.ts` parses it, `serialize.ts` builds
`get`/`to` navigation over it, the filter editor and `style.ts` show it), so D2 is the one that would
break DataCube; D1 is the one that would give a wrong answer anywhere.

## The proposed change

**V1. An integer key renders with the arrow: `(x -> 1)`, never `(x)[1]`.** One line in
`DuckDb.variantGet`. For JSON storage, the value is identical (row 3 against row 2 at 0, -1 and out of
range, CLI and WASM); for a native LIST it is the correct element instead of the one before it. This
is a latent silent wrong answer today for anyone who declares a native LIST column as
`SEMISTRUCTURED` by hand, so it stands on its own. Cost: SQL text pinned with the subscript changes.

**V2. A whole Variant column value is read as JSON where it is used whole.** Where a stored Variant
column reference reaches the outermost select list, a grouping/ordering/distinct key, or a comparison,
the DuckDB dialect renders it `to_json(col)`. Navigation is untouched (it already casts). That removes
D2 and D3 for native storage and makes both storages group and compare by the same JSON text. For JSON
storage the only change is compact whitespace in those positions (to_json re-serializes), which also
merges the formatting-variant groups D3 shows today.

**V3. The catalog declares native nested columns as Variant with no conversion.** `DuckDb.catalogType`:
STRUCT/LIST/MAP/UNION -> `SEMISTRUCTURED`, conversion none. A warehouse table's nested columns appear
(S3a met); an upload stops rewriting its nested columns (its TIMESTAMPTZ/UBIGINT/HUGEINT conversions
stay).

**Measure before landing:** V1+V2 applied, the chain run once, and every changed SQL pin and every
changed row listed by test before a line is committed (the corpus lanes judge rows; lite's own SQL
tests pin text). If any row other than JSON whitespace changes, stop and report.

### Measured (2026-09-27): V1+V2 applied, the whole chain run once, then reverted

- **Rows:** no row changed in any lane that re-ran on the change -- `//pct:pct_duckdb`, `pct_h2`,
  `pct_channel_b`, `//spec:corpus_duckdb`, `corpus_h2`, `spec_tests`, `//core:stress_suites`,
  `census`, `guardrails`, `//wasm:differential_test`, every DataCube test (typed-values in UTC,
  Tokyo and New York, live-snap, upload, pivot rows): 106 of 107 targets green. (Their data is JSON:
  this shows the change is harmless for JSON storage; native storage is proved by the matrices.)
- **`//core:core_tests`: 3 failures, all SQL text:**
  - `LowerRelationTest.variantGetChain` and `GetCheckerTest.testIndexSqlGen` pin V1's old subscript
    text (`-> 0` now, `[0]` pinned); they fail at that text assertion.
  - `LowerRelationTest.variantToManyMapFold` shows a census miss: V2 wrapped a column inside a typed
    cast, `CAST(to_json(t0.NUMS) AS BIGINT[])`. A `to`/`toMany` cast of a whole value is a navigation
    form too (it works on a native LIST directly: `CAST([1,2] AS BIGINT[])`), so V2 leaves casts alone.
- The applied change is kept out of the tree (the job's scratch patch); nothing landed.

### Rejected alternatives

- **Read every Variant column through `to_json` at the scan.** One rule, no storage fact -- but every
  DuckDB Variant query gains `to_json` under its navigation too (`to_json(t0.items) -> 'sku'`), every
  JSON value is re-parsed per row, and the lean-SQL ruling asks for no more SQL than correctness
  needs. V2 converts only where a whole value is used.
- **A Database View per table, written by the catalog builder, converting the nested columns.**
  Upstream grammar and zero footprint on existing SQL, but: the view needs a name other than the
  table's; lite does not support the `toJson`/`parseJson` DynaFunctions it would use (`DynaFn`
  `Resolution.UNSUPPORTED`), and upstream's `toVariant` turns a SQL NULL into JSON `null`
  (`ifnull(to_json(x), 'null'::json)`), changing an empty cell; and the SQL is
  `cast((json(x)::STRING) as JSON)` where `to_json(x)` suffices.
- **Convert in the cube's source expression** (`->extend(~items2: x|$x.items->toVariant())->...`):
  the same `toVariant` NULL change, and the column's multiplicity becomes `[1]` in the compiler's type.
- **Convert in the tab's Arrow reader** (D2 only): a second JSON serializer in TypeScript that must
  agree with DuckDB's `to_json` on every nested type -- the kind of copy T1-T3 deleted.

## Receipts

The matrices ran from the job's scratch directory (not the repo): `matrix.sql` (rows 1-17),
`matrix2.sql` (rows 18-27), `wasm-matrix.cjs` (the WASM rows), each against a table holding one value
per storage. The emitter census is the `grep` of `SqlFn.VARIANT_GET` / `VARIANT_ELEMENTS` /
`TO_VARIANT` / `JSON_*` over `core/src/main/java/com/legend/lowering` and the Variant signatures in
`builtin/Pure.java`.
