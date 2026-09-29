# A09 — Lowering (phase I: typed HIR → SQL MIR), read whole 2026-09-28

Reader's report, preserved. Tree `6ab32198d`. 75 files, 23,746 lines. Paths relative to
`core/src/main/java/com/legend/lowering/`. Re-checked by hand: finding 4's code shape (confirmed: `letBindings` is one
flat map, Lowerer.java:194; an expression-position `TypedLet` puts and never pops, :2947-2951; the let-bound case is
matched before the lambda/row path, :2588-2598).

## 1. What it is
Input: resolved typed HIR after G½ and H, plus driver closures (class layouts, class existence, equality keys, instance
ids) and an `ImplementationTable` (Lowerer.java:132-161,243-266). Output: MIR in `com.legend.sql`. Entries
`Lowerer.lower(List<TypedSpec>)`/`lower(TypedSpec)` (:283-363); other public entries make it several subsystems:
VerdictSql, CanonicalRenderSql, Render/WireRender/PctTdsWrap, SqlPostProcessors, SeedableLets, PlatformRegistrations.
Phases: relation lowering (one switch over TypedSpec, fold/isolate decisions from `Fold`, :511-756); scalar lowering
(four chained switches :2429-3203 ending in `Scalars.lower`, a lookup keyed by FunctionId, Scalars.java:2550-2582);
root egress shaping (:300-457); post-passes SubselectPrune fixpoint (:296), ExistsJoinForm, GraphAggDecorrelate.
Imports: sql 665, compiler.spec 385, model 244, compiler.element 232, builtin 90, error 44, platform 22, values 12;
SeedableLets imports ModelContext (:7,38-40).

## 2. Verdict
**Five static mutable maps, not one registry:** `Scalars.RULES` (:58), `FeatureRules.UNDER` (:41, package-visible,
mutable), `Aggregates.REDUCERS` (:18), `Windows.FNS` and `Windows.AGGREGATES` (:26,:38) — RegistryKeys.java:10 says
"four". RULES filled by side effect from 10 files: 124 `put`s in Scalars + 23 in 9 satellites handed the live map via 13
`register(RULES)` calls (e.g. Scalars.java:469,573,608,653,867,1340,1360,1769,1814,2011). **Later writes silently
replace earlier ones, no duplicate detection:** `times` at 294 and again at 311 reading the first back via `RULES.get`;
`startsWith`/`endsWith` 525 overridden at 556; `median` 547 → 1355; `hash` 540 → 2168; 2-arg `dayOfWeekNumber` 565 →
DateShifts.java:255; `in([0..1])` reads the `in([1])` rule lazily (2401-2409), working only because that rule is put at
2410. Six more dispatch channels: `NativeFn.LowererForm` (Lowerer.java:583,1236,2298,2309), `RelationQuantifier`
(RelationPredicates.java:153,229), `NativeFn.Calendar` (CalendarAgg.java:46,110), `COMPARATOR_NATIVES`
(LambdaBinding.java:64), 15 `isFamily(Pure.AT_*)`, the `RelationPredicates.of` if-chain (228-339), callee-name strings.
One id in several maps: `first` in RULES (Scalars.java:1374), REDUCERS (Aggregates.java:48), FNS (Windows.java:60); a
reducer reaching the scalar map is re-routed by throwing `UnfoldableRef` (Scalars.java:2572-2577).
**Implementation table from key sets.** `PlatformRegistrations.assemble` builds it from the four maps' key sets plus
featureOverrides, `NativeFn.families()`, CoreFn forms, walls (PlatformRegistrations.java:54-95), in static initializers
forcing class init of Scalars/Aggregates/Windows/FeatureRules (38,45-47). Natives lowered by name string get no row from
these maps: `toCSV` (Lowerer.java:2999), relation `toString` (3012), relation `at`/`first`/`head` (517-540), relation
`sort`/`removeDuplicates` (ValueCollectionOps.java:34,51).

**Callee name dispatch:** 30 decision sites in 17 files, 32 `"meta::…"` literals in 14 (Lowerer.java:482-483,517-532,
1197,3000,3013; InstanceEquality.java:59-93 a switch on the FQN; ConstBounds.java:29,46-52; Comparators.java:108;
Dedup.java:29; Fold.java:839; CollectionLanes.java:266; MatchFold.java:47-59; Render.java:123-128; CastPolicy.java:270,302;
StoreLane.java:40; RowGetters.java:24; Aggregates.java:147; Scalars.java:953,3100,3439). `RelationPredicates.java:155`
`qualifiedName().endsWith("::exists")` right after consulting the RelationQuantifier enum that contains EXISTS.
String arms duplicating id arms (Lowerer.java:531 vs 645-647; ValueCollectionOps.java:34/51 vs 73/78). `"unionAlias"`
frame tags ×9 (Lowerer.java:811,1966,1971,2004,2011,2016; Fold.java:1389; SubselectPrune.java:370); `lastIndexOf("::")`
×4; navigate prefix spelled twice (Lowerer.java:1930-1936, 3489).

**Invariant 2 broken (types inferred in the lowerer):** compatibility checks (CastPolicy.java:208-252;
InstanceEquality.staticallyDisjoint 245-269; MixedEncoding.kindMismatch 415-421; Scalars.isClassish 3316); subtype
conformance by FQN string (MatchFold.java:46-61); a kind lattice (Numerics.compareKind 129-149); instanceOf folding
(Scalars.java:2521-2545); precision from `date()` arity (3431-3464); lambda parameter types from the SQL type of the
nearest preceding array argument, not the HIR FunctionType (LambdaBinding.java:292-343); 40 `instanceof TypedC*`
literal-kind dispatches (e.g. Lowerer.java:1204-1217, 2528-2534); 19 model-layout lookups (e.g. :2467,2661,3383;
LayoutTypes.java:70,89).

**Invariant 3a broken (SQL named in lowering):** 13 DuckDB interval-function names as StringLit (DateShifts.java:63-75
`"to_years"`…; CalendarAgg.java:202; Scalars.java:724,3047), rendered bare by AnsiSqlRenderer.java:772-775 and mapped back
by EngineStyleH2.java:1685-1691; date-part strings in 10 EXTRACT/DATE_TRUNC/DATE_DIFF calls (Scalars.java:565,1170-1213,
2956-2966); 12 compares against DuckDB `json_type`/`typeof` names (CanonicalRenderSql.java:934-997; LiteralSpelling.java:232;
Fold.java:1300; CollectionLanes.java:354,372); regexp `"g"` option (Scalars.java:1715; JsonLane.java:41; AsorReaders.java:47);
a table name by concatenation (CalendarAgg.java:71); DuckDB binder workarounds (ListEncodings.java:275-303, 85-86/240-241
list_zip fields `"1"`/`"2"`; LiteralSpelling.java:647-686). "DuckDB" mentioned 91 times, "H2" 47.

**IR.** Good exhaustive switches: CollectionLanes.valueLane (106-218), Windows.windowize (116-196),
SubselectPrune.collectExpr (175-286), CalendarAgg.caseValue (117-219). Still 57 `default ->` in 23 files plus 4
`case null, default`; the scalar dispatch is one logical switch split in four for size, each ending `default ->
nextGroup` (Lowerer.java:2645,2890,2952,3200), arm order carrying semantics (the code's own note 2649-2651). Later
passes pattern-match freshly built MIR to recover meaning (MixedEncoding.unwrapVariant 541-556; Comparators.select
36-65; Scalars.aggStrip 3369; CanonicalRenderSql.unwrapTdsCanon matching aliases `"cells"`/`"side"` 584-594; VerdictSql
descent loop written twice 206-216, 231-240). Types: enum values dispatched as strings (Scalars.java:669-677,1784-1811,
2173-2178; RegexpRules.java:38-45; DateShifts.java:27-38); `"TDSNull"` sentinel compared as data (Scalars.java:2077).

**Diagnostics.** 105 ISE, 44 NotImplemented, 4 ModelException, none with the HIR SourceInfo (6 `.pos()` uses, only on
SQL ERROR raises).

**Fallbacks.** Lowerer.java:1458-1463 `.orElse(STRING)` ×2; :3027 instance-equality null → generic rule; LayoutTypes.java:57-58
layout cycle → JSON, :85-90 layoutless class → JSON; PureSql.java:93 Decimal → (38,18), :141 Nil → VARCHAR;
DecimalKindRules.java:83-86 toDecimal (38,18) contradicting its javadoc; Scalars.java:1844-1855 abstract type → runtime
TYPEOF; :2269-2276 column parseDecimal hard-wired Decimal(5,2); :2744-2748 catch ISE → null; :2760-2763 scale 18 for
exponent literals; :1182 `default -> YEAR`; Fold.java:56 planKindOf → OTHER; :1072-1081 pivot "model-channel fallback"
then untyped column; :722 orElseGet(derived); PctTdsWrap.java:109-114 and Render.java:461-469 → probe's JDBC type;
JsonEmission.java:123-137 missing column → `""` type names; InstanceEquality.java:199-203 unbounded → many;
SubselectPrune.java:68-77 fixpoint capped at 16 rounds, returns silently; VerdictSql.java:951 "unknown shape keeps the
leniency"; SeedableLets.java:42-50 catches RuntimeException around trial lowering; AsorRef.java:82-84,115-119 parse
failures → null.

**Layering/state.** Resolver imports `lowering.Aggregates`/`AsorRef`; exec/TdsCompare imports CanonicalRenderSql.
Env vars `LEGEND_LITE_CARRY_TRACE` (Lowerer.java:1955), `LEGEND_LITE_DUMP_SQL` (CanonicalRenderSql.java:337),
`LL_STAMP_COUNT` (StampCensus.java:43); 3 `System.err`; a public static ThreadLocal (StampCensus.java:48). Lowerer 11
mutable fields (106,123,186,201-207,224,233,243,252) and 4 mutable collections (114,181,194,1589); `with*` methods
mutate and return `this`. LayoutTypes mutable cycle-guard set (:38).

**Duplication/dead.** "outputs → typed columns by name else throw" 5× (Render.java:94-109,163-179,395-411,815-831;
WireRender.java:41-55); `cat` 3× (Scalars.java:2826; Render.java:995; CalendarAgg.java:260); `"__|__"` hard-coded
(Render.java:877) beside PIVOT_SEPARATOR (Pivots.java:52); union-read check twice (Lowerer.java:810-813; Fold.java:1388-1391);
`wrapWithCanon` 4 overloads (CanonicalRenderSql.java:69-129). Dead: `windowOnly(... FunctionId.ofAll())` registers nothing
(Windows.java:65-66); `WINDOW_CLASS` never read (77-78); `isRelationIdentity` an alias (RelationPredicates.java:42-44);
RelationPredicates.java:331-337 shadowed by 297-322. 57 orphaned javadocs; two docs with no member (Lowerer.java:3214-3219;
Scalars.java:3467-3475).

**Size.** Lowerer 3,499, Scalars 3,476 (guard 3,500). Scalars' `static{}` initializer 2,407 lines (81-2487), invisible
to METHOD_LIMIT because the guard's regex needs `name(` (CodeShapeGuardrailTest.java:195-203). `relation()` (511-756),
`scalarStructural` (2652-2892), `scalarValueTailArms` (2958-3203) each just under 250. 25 files self-described as size
splits. ~5,100 lines not lowering: VerdictSql 1,674, CanonicalRenderSql 1,004, Render 1,002, SubselectPrune 510,
SqlPostProcessors 302, PctTdsWrap 213, StampCensus 203, AsorRef 121, WireRender 70. Comments 26% of lines.

**Lambdas.** Value-lane lambda → `SqlExpr.Lambda(params, body)` (Lowerer.java:2798; LambdaBinding.java:314); body through
chained `ColumnResolver` closures; parameter SQL types from lowered arguments, not the HIR (LambdaBinding.java:305,334-343).
Row lambdas bind parameters to resolvers over a select (Lowerer.java:1684-1709, 2139-2171). Binding driven by exceptions:
`UnfoldableRef` (Resolvers.java:60-69) caught to isolate and retry (Lowerer.java:1396-1407,1723-1736). Comparator lambdas
matched structurally after lowering (Comparators.java:36-65); needles substituted by name (Scalars.java:3112-3144).

## 3. Clean-sheet and delta
G resolves every native call to a sealed `NativeOp` (per overload group, with position and typed lambda signatures);
one immutable `LoweringTable: FunctionId → Implementation`, built once, failing on duplicates — it IS the
ImplementationTable. Explicit `Env` with let and lambda scopes keyed by binder id; aliases from a `NameSupply`; settings
in an immutable options record. Passes: HIR → logical relational algebra (Scan, Filter, Project, Aggregate, Window, Join,
Sort, Slice, SetOp, Unnest); scalar HIR → typed MIR with lambda types from the HIR; SELECT-block formation using today's
Fold predicates; named MIR optimizations (prune, decorrelate, exists-as-join); per-dialect legalization owning the DuckDB
list-lambda workarounds and spelling MIR enums (IntervalUnit, DatePart, JsonKind). Verdict/canon/render/post-processing
to their own packages. One positioned `LowerException`.
Reuse: Fold clause-order predicates (Fold.java:265-461), WhereMerge, CollectionLanes.valueLane, CalendarAgg,
Windows.windowize (keeping `conform`), NullSemantics, CheckedEnvelope, DateFormats, LiteralSpelling,
ExistsJoinForm/GraphAggDecorrelate/SubselectPrune (as MIR passes).

## 4. Top findings
1. STRUCTURAL: dispatch split across five mutable maps and six channels; later writes silently win; the table inferred from key sets.
2. STRUCTURAL/DEFECT: invariant 3a broken (DuckDB names, date parts, json_type names, regexp flags, a table name).
3. STRUCTURAL: invariant 2 broken (compatibility checks, subtyping by FQN, instanceOf folding, precision from arity, lambda types from SQL).
4. DEFECT (probable): let scoping — flat `letBindings`, never popped for expression-position lets, consulted before lambda parameters; a lambda parameter named like a let binds to the let. Whether the inliner α-renames to prevent it: not verified.
5. DEFECT: cast provenance lost — `Windows.windowize` (Windows.java:125-127) and `SqlPostProcessors.expr` (281-283) rebuild `Cast` with the 2-arg constructor, resetting `conform` (sql/SqlExpr.java:1120-1122); `Scalars.substituteRef` preserves it (3119-3121). Conform casts (e.g. Lowerer.java:862-864) stop being elided on the engine-text channel after these rewrites.
6. STRUCTURAL: callee-name string dispatch remains (30 sites).
7. STRUCTURAL: the package is several subsystems with back-edges (~5,100 lines of verdict/canon/render/wire/optimization).
8. SMELL: size limits gamed (3,499/3,500; a 2,407-line initializer the guard can't see; four chained switches; 25 size-split files).
9. SMELL: control flow through exceptions and silent fallbacks (`UnfoldableRef`; throw-routing; catch ISE → null); the sealed `Resolution` type exists (Resolvers.java:37-52) and should be used everywhere.
10. SMELL: global and process state (env reads, stderr, static ThreadLocal, mutable Lowerer, class-init-order coupling).

Counts: 147 RULES puts; family() bulk registrations Scalars 12 / Aggregates 26 / Windows 11; 10 other map puts;
`isFamily` 15; `callee().id()` 15; `UnfoldableRef` 10 throws / 7 catches; 14 external files import lowering (4 resolver, 1 exec).
