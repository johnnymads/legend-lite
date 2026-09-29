# A07 + A08 — Store resolver (phase H), both halves, read whole 2026-09-28

Two readers' reports, preserved and merged. Tree `6ab32198d`. `resolver/` = 57 files, 35,925 lines: A07 read the
first 29 alphabetically (15,771 lines), A08 the other 28 (20,154). Paths relative to
`core/src/main/java/com/legend/resolver/` unless stated.

## 1. What it is
Input: `List<TypedSpec>` after G½, plus `ModelContext`, `SpecCompiler`, optional driver runtime, explicit mapping,
chain mappings (StoreResolver.java:154-224). Output: the same sealed type; each class query (getAll → filter/limit/
sortBy… → project/groupBy/serialize) replaced by a relation pipeline of TypedJoin, TypedFilter, TypedProject,
TypedGroupBy, TypedDistinct, TypedConcatenate, TypedSerializeGraph.
Mechanism: `ClassSources.get` (ClassSources.java:193-250) finds the class binding (`findBinding` :1382), compiles the
binding's synthesized realizing function through `SpecCompiler` (:723), splits the body at its `map(row|^C(...))`
terminal into a `ClassSource` (ClassSource.java:38-50: relation pipeline, rowVar, `bindings: Map<String,TypedSpec>`).
Then: scan every user lambda for property paths (demand; filter vs projection position); materialize demanded
`TypedJoinSlot`/`TypedNavigate` steps as prefixed LEFT TypedJoins, strip the rest (Pipelines.java:456-512, 604-846);
append association joins, EXISTS material and grouped aggregate subselects (AssociationJoins, DottedExists,
ChainedExists, CorrelatedSubselects); β-substitute each `$p.a.b` into the binding expression over a fresh row var
(Substitution.java); stamp milestoning windows (TemporalFrame). Also in the package: M2M composition
(`ClassSources.composeModelToModel` :907), JSON sources as VALUES (JsonSourceFrame), metamodel-as-rows
(ElementReferences, ConstructedInstances, FunctionBodyRows), aggregation-aware routing and if/match→union rewrites
(ChainNormalizer, ChainDispatch), `genericType()` reflection and `zip` pairing (CorrelatedSubselects.java:601-747),
graph fetch (GraphEmission), two execution-option appends called from StatementExecutor (DriverPkAppend,
ImportDataFlowAppend).
Per statement: `runtimeIfsAsUnions` → ChainNormalizer → `SubQueryLift.lift` → `resolveNode` dispatching on
`Space` OBJECT/ANCHORED/INERT (StoreResolver.java:361). Inside `resolveObject` (:2888-3134): collectOpChain → DateSplit
→ demand scan → collectChainSpecs → registerNavigations → materializeRoot → registerExistsSubs →
registerAssociationJoins → subtype subs → aggregate materials and join-key widening → dottedExists →
foldAssociationJoins → outer-nav date filters → substitution fold → terminal. After: ObjectReferenceDecode →
onFormPass → StoreEscapees (:190-223).
Dependencies: compiler.element, compiler.spec (incl. UserCallInliner), typed, model, builtin, error, values; back-edges
into later phases: `lowering.AsorRef` (Substitution.java:2, ObjectReferenceDecode.java:4, GraphEmission.java:5),
`lowering.Aggregates` (CorrelatedSubselects.java:1861,1867; GraphEmission.java:2152), `sql.Json` (Substitution.java:1725),
`sql.SqlSelect.SYNTH_MAP_COL` (ScalarValueReads.java:41), `plan` (ConstructedInstances.java:109,121,145;
ElementReferences.java:284).

## 2. Verdict
**Identity spelled in strings, everywhere.**
- Callees: 169 `callee().qualifiedName()` reads (A07 97 incl. 28 direct `.equals`; A08 72), 161 `"meta::…"` literals
  (TemporalFrame alone 46, building comparison calls by FQN: TemporalFrame.java:835-880, 1143-1159, 1271-1284,
  1535-1581, 1963-1982), 57 `isToOneCall`, against 53 `callee().id()` and ~32 `Pure.AT_*` checks; both schemes in one
  method (ChainNormalizer.java:55 vs :64; InnerDemand.java:61 vs :383; Substitution.java:969-976 vs 944).
- Overloads re-picked by name and arity: 37 `findFunction(` (A08's 11: SyntheticHeads.java:177,580,1711;
  TemporalFrame.java:856,1294,1313,1512,2801,2822; StoreResolver.java:1268 `findFirst`; StackBuilder.java:1387, which
  also builds its own second `Callees` :102) although a `Callees` exists (StoreResolver.java:84); inconsistent
  (TemporalFrame.java:2799-2831 filters by arity and type, StoreResolver.java:1268 takes the first).
- Join/path identity: synthetic heads are property names with `#fN/#dN/#cN/#pN/#uN` suffixes parsed back by
  `JoinIdentity.of` (SyntheticHeads.java:68-122), `realHead()` stripping them 50 times; chain keys dotted strings (30
  `String.join(".",…)`, 14 `lastIndexOf('.')`/`split("\\.")`, `indexOf('.')` CorrelatedSubselects.java:102,143,175);
  deferred windows keyed `chain + "#" + strat` with `String[]` values read back by `Boolean.parseBoolean`
  (TemporalFrame.java:469-472, 584); registry keys `subType$`, `pk$_` (Substitution.java:63,1813); the `"#p"` occurrence
  copy (NavMaterializer.java:1130; Substitution.java:1275); column prefixes `emb__`, `__s_`, `__route` (StackBuilder.java:441,
  757,1188,1217); `stc_<Fqn>___prop` subtype columns parsed by indexOf (CorrelatedSubselects.java:1979-1983); union split
  keys `k_0..k_n` found by probing names (:806-837,759; FlattenOps.java:484-493); `u_frame_ord__` (JsonSourceFrame.java:42);
  `constraint$`/`constraintMsg$` (GraphEmission.java:597,601); `$prop$` substring test (GraphEmission.java:2469); the
  variable-name provenance marker `ms_row` (TemporalFrame.java:54, consumed Pipelines.java:525).
- Join identity as column-name prefix with collision probing (AssociationJoins.java:592-646; CorrelatedSubselects.java:258,340;
  ChainedExists.java:147-157).
- Variables matched by name; capture avoided by collecting every name and bumping fresh names
  (AssociationJoins.java:1548-1564,2197-2223; CorrelatedSubselects.java:273-283,356-363,1726-1734,1239-1275;
  Substitution.java:2645-2648 `_n`; SyntheticHeads.java:499-501 `"\u0000canon"` binder). Fixed binder names unguarded:
  `"s","t"` (AssociationJoins.java:2118,2134), `"_idk"` (ChainNormalizer.java:175), `"p_ws"/"c_ws"/"u_ws"/"__route0_0"`
  (ClassSources.java:1036-1053), `"v_gt"` (GenericTypeReflection.java:78), `"_zp"` (CorrelatedSubselects.java:678).
  Variable names from `System.identityHashCode` (NavReducer.java:63,75): differ run to run.

**IR.** No IR of its own: logical and physical HIR are one type, store-only nodes policed at run time
(StoreEscapees.java:17-69). 50 `default ->`; some named walls (StoreResolver.java:619; Substitution.java:2102;
Pipelines.java:1265), others silent pass-through "best-effort by design" (SyntheticHeads.java:901,1859;
PkInference.java:105; StackBuilder.java:1888; Pipelines.java:349). `ClassSource` a 12-field record with 6 telescoping
constructors and sentinels (`UNION_SET_ID="union"`, setId `"json"` JsonSourceFrame.java:227, `""` = no prefix).
`Object[]` ×7 (CorrelatedSubselects.zipSide :657-747); `boolean[]` out-params ×8. `NavPlan` a record of 11 parallel
string-keyed maps (StoreResolver.java:1512-1521).

**Re-typing (AGENTS.md forbids "re-running type checks" here).** 188 hand `new ExprType(`, 71 `new TypedLambda(`,
28 `new TypedNativeCall(` in A07's half alone, nothing re-checks them. Multiplicity overrides: ScalarValueReads.java:45-61;
SubQueryLift.java:309-311; forced `[1]` at StackBuilder.java:1876,1899,1936 and Pipelines.java:1544 where the stack
uses `[*]` (StackBuilder.java:415-418); ChainDispatch.java:296 ZERO_MANY; CorrelatedSubselects.java:731 ZERO_ONE.
Explicit re-typing "RETYPED by the node's KIND" (StackBuilder.java:132-171). `.orElse` fallback on a property lookup
(StoreResolver.java:765-771). RawGridSchema replaces late-bound schemas with database metadata (:158-161) and rewrites
reads by spelling `"columnNames"`/`"values"` (:125-126,175,186) though its doc says "never user-spelling recognition"
(:36-37). Calls into the typer: `specs.typeExpression` (AggregationAwareRouting.java:118,123,126), `specs.compile`
(ClassSources.java:723; AssociationJoins.java:1223,1360,1854), `compileSynthFn` ×8. Re-runs G½: `new UserCallInliner`
(RoutingContext.java:74; Pipelines.java:1711). Builds fresh StoreResolvers recursively (SubQueryLift.java:220,257,301;
ClassSources.java:885).

**Diagnostics.** ~113 NotImplemented, ~46 ISE, ~39 MappingResolutionException (A08 half) plus A07's; all concatenated;
none positioned. Message text depends on an env var (StoreResolver.java:621); `Anchors.debugSuffix` reads
`LL_TMP_DEBUG` (Anchors.java:404-406).

**Fallbacks.** Documented engine-parity tolerances: unsupported milestoning left unfiltered (TemporalFrame.java:1386-1391,
1400,1412,1901-1911); bitemporal with one date fills BUSINESS (TemporalContext.java:62-63); pin miss → class root
(StackBuilder.java:1379-1385); temporal class without milestone columns reads `[]` (Substitution.java:2420-2429). Guesses:
column-name probing over `x_`/`x_nav_` with equalsIgnoreCase (TemporalFrame.java:503-512,646-653,711-718,896-903);
`getOrDefault(slot, slot+"_")` (:2224); alias as chain-key fallback (:1681-1682); `.orElse(true)` treating an unknown
property as to-many (StoreResolver.java:1081; TemporalFrame.java:1480); positional date lists "as the fallback"
(Substitution.java:1579-1584,2559-2561,2757-2760); missing PK column silently skipped (RelationalRootForm.java:82-84);
ViewFrames null and first relational binding regardless of set id (:30-67); missing mapping skipped
(ObjectReferenceDecode.java:142-145). Swallowed exceptions: ClassSources.java:796-802; GraphEmission.java:1466,1599,1744,
2337; ElementReferences.java:134-138,157-160; CorrelatedSubselects.java:2231-2235,2277-2281; AssociationJoins.java:722-726;
InnerDemand.java:621-630. First binding taken as PK (CastReRoot.java:70-73; ElementReferences.java:93-96;
ForeignKeyIdentity.java:44-47; ChainNormalizer.java:166). FK keys when no PK (CorrelatedSubselects.java:247-250,324-325);
count-column guess (:1097-1100); forward property → property1 (AssociationJoins.java:1177); `rowOr` (:2225);
definingMapping → queried mapping (GraphEmission.java:3202); demangle-by-string (GenericTypeReflection.java:100-103);
`strArg(…, "@type")` (GraphEmission.java:3131); URL template verbatim when the let isn't literal (JsonSourceFrame.java:47-50);
unmapped optional property → null (GraphEmission.java:320-337); rowVar default `"row"` (DriverPkAppend.java:100;
ImportDataFlowAppend.java:100); depth cap returns unchanged (GraphEmission.java:1580) vs throws (AssociationJoins.java:1351);
unknown include skipped (ClassSources.java:498-500,525-527; AssociationJoins.java:661-664) vs throws
(ClassSources.java:1257-1260,1442-1444); `LiteralFolds.literalEquals` with SQL numeric semantics `1 == 1.0` true (:80-86;
Pure's `equal` not verified). No-op branches relying on a later wall (NavExistsMaterial.java:92-99; StoreResolver.java:2217-2227,
1693-1699; NavMaterializer.java:247-255,815-833,851-868; SubQueryLift.java:100-101).

**Layering and state.** StoreResolver mutable fields (87-123) saved/restored by hand (1492-1497, 2877-2885, 3339-3380);
SyntheticHeads 14 mutable registries "append-only across nested resolutions"; TemporalFrame documented immutable after
`withSpecs` (43-46) yet mutates 4 fields (301-314, 2558, 2794); setter-injected cycles (StoreResolver.java:133,146,151;
AssociationJoins.setNavMaterializer :691 plus lazy UnionHeads :683-689; CorrelatedSubselects.setOwnStepSplicer :1301;
ClassSources.setJsonSources/setConstructedRows :74,102; ConstructedInstances.setHandleRegistrar — the resolver calls the
executor during resolution, :134-153); `JsonSourceFrame.fromContext` mutates `sources` as a side effect (:250-253);
identity-keyed memos (Anchors.java:66,132); 7 env reads, 8 `System.err` (StoreResolver.java:621; Substitution.java:1433-1440;
TemporalFrame.java:719,904,1331-1351; NavMaterializer.java:1056-1090); hand-assembled JSON without escaping
(ObjectReferenceDecode.java:111-122). CorrelatedSubselects' own note: no identity-changing rewrite may run between the
aggregate scan and substitution or keys dangle silently (:2345-2354).

**Duplication.** toOne/first unwrapping ≥7 variants with different call sets (CastNav.unwrapToOne :79; GraphEmission.unwrapToOneFirst
:2702; AssociationJoins.unwrapOnes :1395; ChainNormalizer.unwrapSinglePick :204; three inline copies in InnerDemand
:381-388,546-553,576-583 despite "one recognizer… must not drift"; 9 inline loops in GraphEmission; 18
`"…collection::first"` literals). `boolean::and/or/equal/not` looked up ad hoc (AssociationJoins.java:517,1628,2096;
ChainDispatch.java:302; ChainNormalizer.java:195; GraphEmission.java:1799). Association orientation twice
(predicateMaterial AssociationJoins.java:1199-1276 throws; scanCondTargetReads :1843-1903 returns null). Mapping-context
key built 7× (GraphEmission.java:1118,1246,1284,1458,1767,2380,2956). Milestoning block→(from,thru,inclusive) 5×
(TemporalFrame.java:453-465,1095-1113,1197-1215,1383-1410,1899-1920); window-pair emission 5× (866-880,1142-1159,
1271-1284,1566-1582,1969-1982); `nullTolerant` block duplicated verbatim (1285-1303, 1304-1322) so `OR isEmpty(from)`
applies twice; embedded-constructor drill loop 5× (Substitution.java:1363-1382,1394-1414,3415-3441; StoreResolver.java:1624-1643;
NavMaterializer.java:1169-1198); composed-row condition re-pointing twice (StoreResolver.java:1045-1059, 2428-2451).
≥8 path-demand walkers with slightly different rules (FlattenOps.consumedPaths; InnerDemand memberScan/
collectEmptinessChainPaths/collectParamPathHeads/existsKindScan/collectChains/collect; CorrelatedSubselects.aggScan;
DateSplit.collectDatedNodes). Private β-inliners (AssociationJoins.inlineDerivedCondCalls; GraphEmission.inlineDerivedCalls/
inlineThis/substVars). Dead: empty `if (!local.isEmpty()) {}` (CorrelatedSubselects.java:2376); `getForNav` ignores
`head` (ClassSources.java:90-95); unused `optional` (:266); `setHint = null` (GraphEmission.java:1136); `existsKindScan`
"measurement only" still called; ≥14 orphaned javadocs.

**Size.** GraphEmission 3,335; Substitution 3,479; CorrelatedSubselects 2,860; AssociationJoins 2,231; ClassSources 1,567.
A08's half: 549 methods, 28 ≥100 lines, 13 ≥200 (rewriteCallArms 303; StackBuilder.liftOf 257; registerNavigations 249;
resolveObject 247; Pipelines.walk 240; registerAssociationJoins 230; collectOpChain 225; stackOf 224; anchoredNode 222;
stampWithBlock 218; rewriteMultiHop 216; rewrite 212; navTargetMaterialized 208 with 10 params and 4 overloads).
A07's: associationJoin ~242; buildGraphNode0 ~241; ClassSources.build ~233; aggScan ~231; DottedExists.register ~167;
explodedTwoHop ~157.

**Nine concerns in one package:** semantic desugaring; mapping dispatch/routing; M2M composition; demand analysis;
join planning; decorrelation; metamodel-as-rows; graph-fetch serialization (constraints, type keys, ASOR protocol);
execution options.

## 2b. Defects
- **Prefix contract broken by its own consumers (A08, latent, not probed).** `Pipelines.slotPrefix` mints `alias_2_` on
  collision; its doc says readers take the prefix from the materialization's map, never from the alias
  (Pipelines.java:575-592). `materializeRoot` keys `navPrefixToClass`/`midPrefixToChain` by `alias+"_"`
  (StoreResolver.java:1889-1890,1907,1919); TemporalFrame recovers the alias by stripping `_` (1675-1676,2224,2485);
  StoreResolver.java:1191 likewise. On a collision `applyJoinTemporalFilters` misses `navClass` (TemporalFrame.java:1634-1635)
  and stamps a class-governed target as a physical slot with the ROOT context (1747-1752): wrong temporal governance.
- **Hand rebuilds drop fields (A08).** `TypedFilter.stamp` dropped at 12 sites (NavMaterializer.java:773; Pipelines.java:709,
  1235,1544; StackBuilder.java:1875,1898; StoreResolver.java:684; SyntheticHeads.java:785,1703,1809; Substitution.java:2061,3035),
  preserved at 5. Likely live: Substitution.java:2057-2062 re-passes CORRELATION-stamped EXISTS relations built at
  2815-2819 and 3264-3266 (via 3335-3337) with stamp NONE; Lowerer.java:1502 keys `verbatimEquality` on that stamp.
  6-arg TypedNavigate rebuilds drop `routes`, `pairedPredicate`, `frameName` (Pipelines.java:98-100; NavMaterializer.java:753-762).
  SyntheticHeads drops `TypedFuncCol.documentation` (745-747,1806) and `TypedSortBy.keyAlias` (654-656), which
  RelationalRootForm.java:122-123 consumes.
- **Non-exhaustive rewriters skip subtrees (A07).** `GraphEmission.substVars` `default -> n` (:3318) never enters
  TypedMap/TypedProject/TypedSortBy, so a derived-body parameter used under a map stays unsubstituted; `rewriteNavReads`
  (:738-744) and `AssociationJoins.nestedCondRead` (:2063-2071) descend only into TypedNativeCall.
- **Content identity from `toString().hashCode()` (A07).** ConstructedInstances.java:90; FunctionBodyRows.java:35-37: a
  collision (with equal lengths) merges two trees' inline rows under one scope id, `seen` suppressing the second.
  ClassSources' memo key ignores `jsonSources`, a documented collision (:65-72).
- **Andcallee/existsCallee take `get(0)` without an arity filter** (GraphEmission.java:1799-1815).

## 3. Clean-sheet and delta
Mapping compiled ONCE per mapping in E/F: `SetPlan{SetId, scan algebra, bindings PropertyId→Expr(Row), edges
PropertyId→NavEdge(targetSetId, cond)}`; operation unions (StackBuilder), views (ViewFrames), PKs (PkInference) there.
Query side: G emits binders with unique identities and property reads with PropertyId. Passes: (a) desugar in G½/
normalizer (if/match→union, last→first, cast canonicalization, identity equality, zip); (b) route (mapping dispatch and
set choice incl. aggregation-aware, once; annotate `SetRef`); (c) one demand analysis (path trie by PropertyId, context
lattice value/filter/emptiness/aggregate/graph); (d) join planning (explicit join tree: JoinNode id, kind, placement
flat/EXISTS/grouped/parent-copy); temporal attribution as an immutable NavId→TemporalContext map; the strategy table
(NavId→LEFT|INNER|SEMI|GROUPED_AGG|SCALAR_SUB, today prose in package-info.java:45-60) as data; (e) read lowering through
the join tree to `ColumnRef(JoinNodeId,column)` into a separate sealed physical IR, names minted last (SlotOrder a naming
pass); (f) graph-fetch planning its own pass; (g) execution options as driver post-passes. Substitution as symbol
lookup — about a tenth of today's 3,479 lines. A post-H checker verifies every minted node.
Reuse: TemporalContext, the Space idea, PkInference, SlotOrder, ScalarValueReads, NavReducer.subquery, the StackBuilder
union algebra (relocated), the ClassSource pipeline+binding model (with symbol keys), ForeignKeyIdentity.sourceKeyColumn,
JsonSourceFrame.objectTexts, ConstructedInstances.convert, Anchors' space classification, AggregationAwareRouting's
algorithm (structural path keys, not `"Property->…"` strings :212-249), the engine-parity receipts in comments.
Delete: FQN callee recognition and the findFunction re-picks; env tracing; the duplicated milestoning code; private
inliners; unwrap variants; string chain/prefix encodings; swallowing catches; setter wiring. Move out: RawGridSchema
(executor boundary), RelationalRootForm (plan/golden layer), DriverPkAppend/ImportDataFlowAppend (execution options),
ChainNormalizer/ChainDispatch (desugaring), zipPairMap and GenericTypeReflection (library semantics). StoreEscapees
unnecessary once physical IR is a distinct type.

## 4. Top findings (merged)
1. STRUCTURAL: every physical identity is a string convention (heads, chain keys, prefixes, column patterns, `$prop$`).
2. DEFECT (latent): the prefix contract is broken by its own consumers — wrong temporal governance on alias collision.
3. DEFECT: hand rebuilds drop record fields (TypedFilter.stamp ×12; TypedNavigate; TypedFuncCol; TypedSortBy).
4. STRUCTURAL: a god pass with threaded mutable state and setter-closed object graphs.
5. STRUCTURAL: size (13 methods ≥200 lines in one half; 4 god classes).
6. SMELL/STRUCTURAL: two callee-recognition schemes; 37 findFunction re-picks.
7. DEFECT/SMELL: the resolver re-types, mints ~188 unchecked types, invokes the typer, re-runs G½.
8. SMELL: copy-paste duplication (milestoning ×5, window pairs ×5, nullTolerant twice, drill loop ×5, unwraps ≥7).
9. SMELL: nondeterminism (identityHashCode names) and environment-dependent behaviour.
10. STRUCTURAL: the phase boundary is blurred (logical = physical type; H imports lowering, sql, plan; calls the executor).
Also: DEFECT non-exhaustive rewriters (GraphEmission.substVars); DEFECT content identity from `toString().hashCode()`.
