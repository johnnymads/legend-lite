# A10 — SQL MIR + dialect renderers (phase J), read whole 2026-09-28

Reader's report, preserved. Tree `6ab32198d`. 54 files, 14,109 lines. Paths relative to `core/src/main/java/com/legend/`.
Re-checked by hand: finding 6 (confirmed: `sql/dialect/H2.java:719` emits `legend_h2_extension_split_part(...)`, defined
only at `spec/src/test/java/com/legend/harness/H2ExtensionFunctions.java:100`; also EngineStyleH2.java:1704,1899).

## 1. What it is
Input: `sql.SqlQuery` MIR — `SqlQuery` 3 variants (SqlSelect, SqlUnion, SqlWith); `SqlSource` 10 (Pivot, SourceUrl,
Table, Cte, VarSetPlaceholder, Dual, Subselect, Values, RawSql, Join); `SqlExpr` 41 incl. `SqlAgg.Reducer`; `SqlFn` 174;
`SqlAgg.Fn` 40 (4 markers); `SqlType`, `TypeFact`; side IRs `SqlDdl`, `SqlDml`. Output: SQL String. `SqlDialect` three
`render` overloads (SqlDialect.java:14,73,77) plus 8 non-render members (sessionSetup, normalize, needsStaticPivot,
rawH2IsNative, script, scriptAbort, failingStatement, catalogType). A render: `AnsiSqlRenderer.render` (:82-90) runs the
dialect's `passes()` (MIR→MIR SqlRewriters: CarrierStrategies then legalisations), then a recursive StringBuilder walk.
Typing is NOT in the renderer: it happens inside the MIR constructors via `SqlTyping` (1,648 lines). Classes:
AnsiSqlRenderer → DuckDb; → H2 → H2Modern; → EngineStyleH2 → EngineStyleDB2 → EngineStyleComposite; SQLite is a raw
`AnsiSqlRenderer(Lexicon.SQLITE, TypeNames.ANSI, Spellings.DUCKDB)` built at Compiler.java:855. The package imports only
itself, base.Nullable and the JDK — except `compiler.element.type.PlatformTypes.TDS_NULL_CELL` (dialect/EngineStyleH2.java:262).

## 2. Verdict
**Names.** Column references `(table alias String, name String)`. `SourceSpelling` rebuilds each reference's origin at
render time from an alias→outputs map (dialect/SourceSpelling.java:37-68) "rather than hunt every construction site"
(:26-27): a repair pass for lowering stamps. Lambda parameters bare strings substituted by name with three shadowing
rules (`SqlExpr.Lambda.rebindParam` stops at shadowing :1084-1093; `FoldToListReduce.unwrapElemRefs` stops :88-96;
`CarrierStrategies.substParam` no stop :1455-1473). Fixed synthesized binders `"x"` (AnsiSqlRenderer:437; DuckDb:582),
`"_i"` (DuckDb:401, putting the user expression inside `_i ->`), `"e"`,`"i"`,`"d"` (CheckedDefectsToLists:39,55,63) —
never fresh. Frame roles as sentinels (`"unionAlias"` ×3 EngineStyleH2:749,956,991; `EXISTS_KEYS_FRAME` SqlSource:108;
`SYNTH_MAP_COL` SqlSelect:115 prefix-matched EngineStyleH2:1088). 36 interval/part/unit string compares; 8
`(SqlExpr.StringLit)` hard casts that throw CCE on a different shape.

**IR.** Sealed records (SqlSource, SqlAgg, SqlType, TypeFact, DateFmt by implicit nested permits). No `toSql()`, but
invariant 3a broken in substance: `SqlSource.Join.Kind.sql = "LEFT OUTER JOIN"` (SqlSource.java:161-177) rendered verbatim
(AnsiSqlRenderer:316; EngineStyleH2:1022); ADD_INTERVAL/TIME_BUCKET arg 0 a StringLit holding a DuckDB function name
(`to_years`) rendered bare (AnsiSqlRenderer:774-786) and decoded back by string switch (H2:373-388; EngineStyleH2:1602-1616;
DB2:209-217); `Frame.Bound.IntervalPreceding(long, String unit)` rendered bare (SqlExpr:1042-1046; AnsiSqlRenderer:979-982);
`PlanParam.enumMapFn` spliced into freemarker (SqlExpr:549-551; EngineStyleH2:624); `SqlDdl.ColumnType.Sized/Scaled(String
kind)` (SqlDdl:33-37; DdlSpelling:41-42); aggregates and windows spelled by Java enum name (`r.fn() + "("`
AnsiSqlRenderer:949-950,996; `.name().toLowerCase()` DuckDb:243); `SqlAgg.Fn.marker()` (SqlAgg:32) unused by renderers so
a leaked WAVG renders `WAVG(`. Not phase-indexed: lowerer-internal markers (WAVG, HASH_LIST…), plan-text-only nodes
(PlanParam, TempTableInSplice, VarSetPlaceholder, DeferredTdsString, Group, SortKey.outputName, Cast.conform), label-only
casts (TEMPORAL_TEXT/DECIMAL_TEXT "never renders", AnsiSqlRenderer:924-927) walled one by one at render time. Shallow
immutability: ~29 List components uncopied (SqlSelect.projections/groupBy/orderBy, Call.args, Case.whens,
ArrayLit.elements, SqlUnion.branches, Reducer.args, SqlSource lists) while each node's TypeFact is computed once from
them; `SqlRewriter.mapList` puts mutable ArrayLists into nodes (:339-352). 50 `default ->` in scope incl. render paths:
AnsiSqlRenderer.call :824 (the whole SqlFn fall-through, backed only by a test), DuckDb.listCall :403, bitOp :436,
H2.bound :356, EngineStyleH2.source :1029, EngineStyleH2.planSource :536 (silent `{}`), EngineStyleH2.firstInnerTable :579
(`case null, default -> "subselect"`), CarrierStrategies.litText :459 (`v.toString()` as a column name), SqlFn.producesList
:119. `AnsiSqlRenderer.call` dispatches in two steps: a Spellings lookup (:649-652) before the switch, so a data row
silently shadows a coded arm (H2Modern.java:59-63 documents one such trap).

**Types.** `SqlType` structural and `TypeFact` sealed (good). The typing RULES are DuckDB 1.5.0 behaviour — 67 "probed"
receipts in SqlTyping (e.g. SUM int → HUGEINT :1234-1243) living in the dialect-free package, so H2 is forced to match
(`H2AvgDelivers`; TypeNames.H2 HUGEINT → NUMERIC(38)). Typing partial by design: 85 `UNKNOWN`, `default -> UNKNOWN`
(:538,:1275). Compact constructors overwrite the caller's `type` argument (e.g. SqlExpr:272-274). `SqlSelect`'s
constructor re-labels outputs to the computed wire type (SqlSelect:37-53; SqlTyping.reconcileSlot :148-163): a dialect
pass that rewrites a projection changes the query's output type for that dialect only.

**Diagnostics.** No positions; walls are `DialectCapability` (37 throws, a subclass of ISE) plus 42 other throws, all
concatenated. H2 recovers "which statement failed" by parsing `"SQL statement: "` from driver text (H2.java:49-61).

**Fallbacks.** `Column.of(table,outs,name)` untyped Column when absent (SqlExpr:379-384); SourceSpelling keeps its stamp
on a miss (:59-68); `EngineStyleH2.timestampLit` swallows DateTimeException and spells unshifted (:801-804);
firstInnerTable "subselect" (:579); planSource `default {}` (:536); litText `toString()` (:459); DuckDb.call renders
LENGTH over any non-StringLit as `CAST … AS VARCHAR` (:183-187) — shape dispatch; H2.call coerces `'yes'`/`'n'`/`'1'` to
booleans (:248-264) — typing in the renderer; H2.variantAwareCast falls back to `booleanShaped` (:666-691); `Json`
parses leniently (t/f/n advance unchecked :65-67; `:`/`}` skipped unchecked :84,:92; implicit-comma mode :113-115).

**Layering.** System property read in product code: `Boolean.getBoolean("legend.exec.engineScanOrder")` (DuckDb.java:218)
— set by the corpus lane (spec/.../MinimalCorpusTest.java:139), installing a test-only SQL pass inside the PRODUCT
dialect (confirmed by hand). Static mutable counter `StableScanOrder.FIRINGS` (:30-35) read by exec/Census.java:92.
Stateful renderers: `AnsiSqlRenderer.inlineMode` (:1165), 6 per-render fields in EngineStyleH2 (:349-352,547,552,1036-1039);
public `renderedAlias` works only on the instance that rendered (:809-814). Exec concerns in `sql..`:
`RawSqlBoundary.Recorder` execution ledger (:50-90); `Json` (the platform JSON reader); `RawSql.isSingleQuery` (used by
Typer); `SqlDialect.normalize/script/scriptAbort/failingStatement`; `CatalogModel` emits Pure `###Relational` grammar text
from sql/dialect (:48-92).

**Duplication/dead.** Four independent exhaustive walkers (SqlExpr.children/withChildren :38-223; SqlRewriter.rewriteExpr
:134-312; UnqualifyPivotArgs.unqualify :33-106; FoldToListReduce.unwrapElemRefs :59-139) whose descent rules disagree;
EngineStyleH2.render re-implements the pass loop (:354-357); H2.dateUnit vs EngineStyleH2.dbUnitOf admitted duplicates
(H2.java:369-372); `Lexicon.SQLITE` doc "only lexical" while it renders DuckDB SQL; DdlSpelling javadoc cites non-existent
`SqlDialect#ddlType/ddlIdentifier` (:11); `rawH2IsNative` javadoc sits on `needsStaticPivot` (SqlDialect:32-45).

**Size.** EngineStyleH2 1,902; SqlTyping 1,648; CarrierStrategies 1,474; AnsiSqlRenderer 1,380; SqlExpr 1,144. Methods
~200-250: AnsiSqlRenderer.call (609-827), EngineStyleH2.expr (1131-1378), CarrierStrategies.expr (655-901), .fuse
(909-1138), SqlTyping.callKind (346-540). 258 `instanceof SqlExpr/SqlAgg` in render classes.

## 3. Clean-sheet and delta
Semantic MIR (deeply immutable; collection ops as semantic nodes — Distinct, Sort, Filter, Reduce, Explode, Contains,
DateDiff(unit) — not DuckDB list-lambda idioms; units/parts/join kinds typed enums with no spelling; frame roles an enum).
Typing a separate pass keyed by per-dialect `TargetTypeRules`, or semantic types from HIR with a root conform cast.
Per-dialect legalisation pipeline with declared pre/post-conditions ("no Qualify", "no Membership", "no FoldCall") and a
verifier before emission; a fresh-name supply. A dumb exhaustive printer (one switch per sealed root, no default;
spellings from total EnumMaps checked at construction); one `Identifier` value (name + delimited) and one escaper per
dialect. The engine-golden text channel a separate printer over its own plan representation, not a subclass
pattern-matching lowered MIR back into engine idioms.
Reuse: SqlSelect/SqlSource/SqlQuery shapes; SqlRewriter's identity-preserving framework; Lexicon/TypeNames/Spellings as
data; DateFmt; TypeFact; the probed DuckDB/H2 spelling knowledge. Restructure: a real ANSI core + DuckDb layer;
per-dialect SqlTyping; CarrierStrategies' semantics upstream; EngineStyleH2 decoupled; traversals consolidated.
Delete/move: SourceSpelling (fix stamps in lowering); StableScanOrder + its counter + the system property (to the test
harness); RawSqlBoundary regexes and Recorder (to exec); Json, RawSql, CatalogModel (out of `sql..`); `Join.Kind.sql`; all
`default ->` render arms; the SQLite claim.

## 4. Top findings
1. STRUCTURAL: the "ANSI" base and the MIR type system are DuckDB (Spellings.java:14-16 admits it). DuckDB-only arms in
   the base: `list(… ORDER BY)` :496; `EXCLUDE` :541; `rowid` :546; json_object/json_group_array/to_json(list()) :572-600;
   `AS DOUBLE` :699 (TypeNames.ANSI says DOUBLE PRECISION); `MAP {}` :730; `xor` :731; `to_base64`/BLOB :742; `uuid()` :746;
   `d + to_years(n)` :774-776; `time_bucket` :780; `epoch_ms` :787; `//` integer division :788 (a line comment on H2, per
   H2.java:193-196); `decode(from_base64)` :791; strftime `%` codes :1105-1130; plus 77 DuckDB Spellings rows and DuckDB 1.5.0
   typing. Consequence: the SQLite route emits DuckDB SQL; the base's carrier caps are `Caps.H2` (:101-102); H2 overrides
   >20 arms and inserts casts to mimic DuckDB types.
2. STRUCTURAL: the MIR carries SQL operations as strings (invariant 3a).
3. STRUCTURAL: renderers reverse-engineer lowering idioms (CarrierStrategies ~20 "witnessed" shape rules: explode :467-624,
   fuse :909-1138, listGetRule :1159-1246, membershipRule :1357-1452, `TYPEOF(x)='DATE'` → length test :795-808, citing
   ListEncodings.orderedDedup :565, Fold.jsonDateWrap :791, rowMajorCellList :975; EngineStyleH2 engineDateDiff un-lowers
   epoch arithmetic to datediff :1483-1569, joinStringsFlat :176-251, literal-reduction folds :30-117, COALESCE-IN unwrap
   :1284-1307, STRPOS>0 → `LIKE '%lit%'` with `%`/`_` unescaped :1736-1745).
4. DEFECT: identifier escaping inconsistent and injectable on execution paths — H2.execPart quotes without doubling an
   embedded `"` (H2.java:159-163); AnsiSqlRenderer.ddlIdentifier (:1312) and DuckDb.ddlIdentifier (:235) same;
   ddlQualified (:1298-1301) and Create/DropSchema (:1260-1262) splice unquoted; CTE names raw (:120,:291); DdlSpelling
   strips quote chars (:77,:86); `ident` (:1333-1339) and H2.aliasIdent (:108-111) treat any `"…"` as delimited; ~17 more
   raw concatenations in EngineStyleH2; `toLowerCase()` without Locale (:1325). Only `delimited` (:1196-1199), ident's
   fallback and CatalogModel.sqlIdent (:117-119) escape correctly.
5. DEFECT: `default ->` in render methods (invariant 3); two-step Spellings-before-switch dispatch.
6. DEFECT: the H2 EXECUTION dialect emits a UDF only the test harness defines (confirmed; contradicts H2.java:23-24 and
   Spellings.java:31-33); `splitPart` fails on a production H2 connection. SPLIT_PART is spelled natively elsewhere
   (H2.java:307-322).
7. DEFECT: traversals diverge and binders capture — UnqualifyPivotArgs returns ReduceCollection, Membership, CheckedOne,
   CompactList unvisited (:38-39,86-89); FoldToListReduce drops `Cast.conform` (:73-74), skips Membership/ReduceCollection;
   SqlRewriter rebuilds a Lambda without its type (:294 vs SqlExpr:197); fixed aliases `qualify_src`, `_full`, `_fullu`,
   `_asof`, `_cells`, `dedup_src`, `__rid` minted by passes while SourceSpelling assumes aliases unique (:28-30).
8. STRUCTURAL: render-time passes and edits that belong elsewhere — SourceSpelling repairs stamps and re-types Columns (:65);
   StableScanOrder (test-lane feature in product); RawSqlAdapt/RawSqlBoundary regex rewrites not literal-aware (:93-266);
   `EngineStyleH2.windowCall` string-replaces "ORDER BY "/"PARTITION BY " in RENDERED SQL (:1467-1472) — corrupts literals,
   banned by SqlRewriter's own doc (:14-16) and AnsiSqlRenderer:1146-1151; H2 boolean-text coercion; checked narrowing
   built inside render methods (AnsiSqlRenderer:372-441).
9. STRUCTURAL: typing inside MIR constructors differs from what is emitted — DATE_TRUNC's fact always TIMESTAMP
   (SqlTyping:422-429) while the base emits `CAST(... AS DATE)` for month/year/week/quarter (AnsiSqlRenderer:759-765);
   LIST_PRODUCT literal fold leads with `FloatLit(1.0)` "to pin DOUBLE" (CarrierStrategies:869-873) but FloatLit is typed and
   rendered DECIMAL (SqlExpr:471-476; AnsiSqlRenderer:478) while listProductType says DOUBLE (:903-913).
10. SMELL + an enforcement gap: EngineStyleH2:262 reads a javac-inlined `static final String` from compiler.element.type,
    so ArchitectureTest's "sql depends only on itself" (ArchitectureTest.java:280-289) cannot see the edge (confirmed);
    `RawSql.splitStatements` ignores comments and quoted identifiers (:22-46); H2Modern `TRIM(BOTH '"')` JSON unquoting does
    not unescape (:111-112); `DuckDb.sourceUrl` turns a `file:` URL from query text into `read_json_objects` over the local
    filesystem (:329-341; remote reachability not verified); literals always inlined (quotes doubled, NUL handled — sound for
    DuckDB and H2).

Counts: 15 SqlRewriter subclasses (3 anonymous); passes per dialect DuckDb 7 (+1 behind the property), H2 4,
EngineStyleH2 2, SQLite/Ansi 1-2; 37 DialectCapability walls, 42 other throws; 77 DuckDB Spellings rows (H2 overrides 3);
25 lines of raw `'"'+name` quoting (6 on execution/DDL paths); 7 mutable renderer instance fields. AGENTS.md 3a drift:
SqlQuery 3 variants (doc 2), SqlSource 10 (doc 8), SqlExpr 41 (doc 32); Cast carries a SqlType, not a Pure type name.
