# H1 audit — W4 (W4.1–W4.4), the middle (2026-09-29)

Reader's report, preserved as returned. Tree `compiler/rebuild`. Read: the plan, the review, A05, A06, A07-A08,
UPSTREAM_BOUNDARY_PROGRAM §3 D7, TENET_CHARTER, WORLD_MAP, the old step 7 (git `601995bc2`). Whole: ModelNormalizer,
ClassSource, resolver/package-info. By structure plus key bodies: MappingNormalizer (1–475 + method map), ClassSources
(1–1000), StoreResolver (1–400, resolveObject 2877–3140, collectOpChain 2565–2805), UserCallInliner (36–560), StaticFold,
SourceSubst's callers, Typer 1585–1800, StatementExecutor 280–520 and 2480–2560, Substitution and TemporalFrame
(structure), Pipelines 1690–1741, RoutingContext 60–90, the census and corpus loaders. Paths relative to
`core/src/main/java/com/legend/`.

## Short answers
**W4.3 pass by pass, and in what order?** Yes, but not the plan's order and not with the physical IR early. Two things
tie the passes: demand results keyed by node identity (`Registries.aggReads`/`inQueryReads` are `Map<TypedSpec,…>`,
Substitution.java:95-96, StoreResolver.java:2059; CorrelatedSubselects.java:2345-2354: any rewrite between scan and
substitution "dangles the keys silently"), and interleaved phases (temporal specs collected before demand and feeding it,
StoreResolver.java:2944-2958, InnerDemand.java:169-178; temporal stamping after the join fold, :3043-3045). Order that lets
each slice land alone: (0) gate first — H deterministic (NavReducer.java:63,75 name variables from identityHashCode;
whether that reaches SQL not verified) and a corpus-wide per-test product-SQL snapshot (needs W0.4); (1) desugar pre-pass
(ChainNormalizer; runtimeIfsAsUnions; collectOpChain's first/at/sort/distinct/toOne rewrites StoreResolver.java:2657-2697;
SubQueryLift); (2) a structural NavPath key replacing dotted chain keys, `#fN/#dN` heads (75 `realHead(` calls) and the
identity-keyed maps — a pure type change, SQL byte-identical; (3) route (dispatch, AggregationAwareRouting.chooseSet, set
choice StoreResolver.java:2787-2795) as an annotation on TypedGetAll; (4) temporal spec collection, then one demand trie
keeping first-read order (InnerDemand.java:180-194), the ≥8 walkers switched one per probe; (5) temporal attribution as
NavPath → TemporalContext; (6) explicit join tree + strategy table, emitting today's TypedJoin/EXISTS/subselect shapes
(26 `new TypedJoin(` in 7 files); (7) read lowering (Substitution a lookup through the join tree; ColumnRef; a naming
pass; an adapter printing back to today's TypedSpec); (8) graph fetch in two halves (tree-to-demand before (4); envelope
emission after (6)); (9) relocations (F13). Between steps old and new coexist as typed HIR plus side products keyed by
NavPath values, never node identity.

**A separate physical IR incrementally?** Not as written — a big bang in two places: its consumers (H's output read by
the lowerer — 49 lowering files import compiler.spec.typed — and by the executor: CrossStoreGuard.check
StatementExecutor.java:356; LiteralFold.fold, lowerAndPrepare, enforceToOneReader :2530-2560; §5 puts W5 after W4.3) and
its scalar leaves (mapping bindings and user lambdas are arbitrary TypedSpec; a javac-proved distinct type means
duplicating 77 records or a phase type parameter on every record and reader). Feasible version: a distinct sealed
relational skeleton (scans, join tree, filter placements) with TypedSpec scalar leaves extended by ColumnRef, introduced
LAST in W4.3 behind a print-back adapter that W5 deletes; "no store-only node in a leaf" stays a W1.3 verifier check;
rule 0.10 amended for H.

**What W4.1 must produce for H.** Per (MappingId, SetId), what ClassSource carries today: typed pipeline with nav steps
(TypedNavigate/TypedJoinSlot with routes, conditions, form); row variable; binding table keyed by a sealed BindingKey, not
PropertyId (F4); rowType, PKs, declared keys, property pins, aggregation-aware facts, operation and union member set ids;
association predicates (compiled today at AssociationJoins.java:1223,1360,1854); a poison per set/class. NOT the
query-time parts: `jsonSources` (execution context), `scope` (constructed instances), `upstreamMapping`/`contextKey`
(runtime M2M dispatch), `castGate`, `composedPrefix`, `deferredWalls` (ClassSource.java:38-50; ClassSources.java:63-72,
219-252, 902-1000) stay in H's route pass. First slice must produce today's shape exactly (today: ClassSources.java:723
`specs.compile` of the synthesized function, split at the `map` terminal 723-757); changing the shape (join edges as data)
lands together with W4.3's join planning.

**W4.2 before W4.3?** Yes, with three unstated conditions: W2.5's VarId with a fresh-VarId supply H can call (127 of 138
TypedVariable constructions are in resolver/); W3.1/W3.4/W3.6 first (`inlineNormalized`, `rawSchemaErasedExpansion` exist
because NormalizeRequired and TDS-erased bodies cannot type alone, Typer.java:1602-1612,1675-1705,1750-1795); the
resolver's private inliners listed as consumers to switch, one slice each (GraphEmission inlineDerivedCalls/inlineThis/
substVars — substVars `default -> n` :3318 skips map/project/sort subtrees and drops the filter stamp :3298;
AssociationJoins.inlineDerivedCondCalls :1350; Substitution.inlineParam :2691; Pipelines.substituteParam :1711, which builds
a UserCallInliner). Substitution's property→binding rewrite is read lowering (W4.3), not W4.2.

**W4.4:** conflicts with the others (F9).

**Size (judgment):** W4.1 7–10 (11,237 normalizer lines; ~10 set kinds each change typed output; the D-side reference work
F5 first); W4.2 3–5 after preconditions; W4.3 18–30 (35,925 lines, 57 files, nine concerns of which the plan names five,
≥8 demand walkers, TemporalFrame 2,832 lines with milestoning ×5, Substitution 3,479, GraphEmission 3,334; every slice
pays two corpus lanes plus stress); W4.4 4–6 for non-M2M walls, M2M open-ended. W4 ≈ 32–51 sessions vs the plan's 10–15;
program total ≈ 65–100.

**Can the gates catch a wrong store resolution?** Mostly not. The reference lane cannot see H (legend-pure does no store
resolution). Rosters pin names; a pass with different SQL is invisible; ~921 passes are multiset compares; a LEFT-vs-INNER
or temporal-window error changes no rows when the fixture has no orphans or one version. The verifier checks shapes. The
golden dumps have no post-H dump and no mapping-heavy set, and "names minted last" changes every alias, turning the golden
gate into bless-everything unless names are canonicalized or reproduced. Only a corpus-wide per-test SQL snapshot,
byte-identical for refactor slices, has real power.

## Findings
- **F1 BLOCKER** — "into a distinct physical IR" conflicts with "W5 after W4.3": lowerer and executor read H's output as
  TypedSpec (StatementExecutor.java:352-360,2518-2560; 49 lowering files); string contracts H→I: `TypedFilter.stamp`
  (Lowerer.java:1502,1531), `"unionAlias"` (Lowerer.java:811,1971; SubselectPrune.java:370), `PK_ORDER_PREFIX`
  (Lowerer.java:969-982). Change: physical skeleton last in W4.3 behind a print-back adapter reproducing names and stamps;
  W5.0 moves the lowerer onto it; rule 0.10 amended for H's scalar leaves.
- **F2 WRONG** — "demand → temporal attribution" false: temporal specs feed demand; stamping follows the join fold; graph
  fetch is two halves (tree to demand :2914-2920,2931-2943; emission :3094-3099). Change: temporal specs → demand →
  attribution → join planning (stamping in emission); graph fetch as two passes.
- **F3 GAP** — identity first, no item provides it: demand keyed by identity; PropertyId, NavId, JoinNodeId do not exist;
  `model/SetId.java` is a string helper; `TypedPropertyAccess.property` a String (:17), 516 `.property()` reads, 312 in
  resolver; W2.6 covers expression pointers only. Change: W2.x "PropertyId on member access" and W4.3.2 "NavPath value
  key" before any pass is extracted.
- **F4 GAP** — "PropertyId-keyed bindings" cannot hold mapping-local `+prop` keys (ClassSources.java:771,977), subtype
  pseudo-columns `stc_<Fqn>___prop` (:811-870), PK pseudo-bindings (`pseudoBindings` :777). Change: sealed BindingKey
  (Property | Local | SubtypeColumn | PrimaryKey).
- **F5 GAP** — W4.1 deletes the normalizer's private resolvers (AssociationSynthesis.resolveAssociation :332,371-390;
  StoreSubstitutionRewrite.includeFqn, qualifyStoreRefs :328,358; MappingClosures' walkers) with nothing to replace them;
  mapping-DSL references are in no W2 item. Change: a W2 item "mapping references resolved in D".
- **F6 RISK (decision)** — eager elaboration with the real typer is Work at model build (AGENTS invariant 6, TENETS) and
  under rule 0.9 turns today's per-set/class/association poisoning (MappingNormalizer.java:345,372,419) into build failures.
  Change: on demand per (MappingId, SetId), memoized per World, failure poisons the set; rule whether an ill-typed mapping
  no query reads fails the build.
- **F7 BLOCKER (decision owed)** — "within the charter ruling": no such ruling. C6.2 and WORLD_MAP §4 classify string `+`
  as COMPUTED; StaticFold computes column names by concatenation (StaticFold.java:30-50); LiteralUnrollLedgerTest pins
  compare-only; StaticFold is not in JavaEvalLedgerTest; old step 7's "a literal that becomes an IDENTIFIER" is an
  amendment. Change: add D6 (the shape evaluator's scope, with identifier positions), rule before W4.2.
- **F8 GAP/ORDER** — W4.2 names four engines; ≥10 substitution/inlining sites: SourceSubst (16 caller files; many use only
  helpers to move), UserCallInliner, StaticFold.inlineUserCall (:225), AlphaRename, StatementInline (untyped, before typing
  Compiler.java:883, picks callee by arity StatementInline.java:56,198, renames `_s<N>_`), LiteralMapUnroll, the resolver's
  private inliners, the normalizer's name-keyed substitution (RelationReads.java:181). §5 gives W4.2 no dependencies; it
  needs W2.5, W3.1/3.4/3.6, D6. No gate (the old step 7's "fold results identical per test" and eleven-rewriter census were
  dropped). W2.5 would switch engines W4.2 deletes. Change: W2.5 keys only engines W4.2 keeps.
- **F9 BLOCKER** — W4.4 not executable: (a) conflicts with WORLD_MAP rule 8 (engine file admitted only if every function
  passes the deletion test as a program; `MinimalCorpus.ENGINE_IMPLEMENTATION_FILES` :115-127, `refusePlatformNamespace`
  :783), the open 2b question, the closure containing legend-pure `platform` and engine `core` `meta::pure::functions`
  bodies over the catalog and prelude; W2.1's duplicate refusal makes the duplicate count a precondition (census only
  reports it, ManifestWorldCensusTest.java:163-181; count not verified); (b) its walls (D7 classes 5, 6: ~14 + 5 files) are
  M2M features in the normalizer and resolver — thrown away if built before W4.1/W4.3; after, W4.4 is last; (c) needs W1.2
  (collect-and-poison replaces the 28-round retry); (d) gate and homework dropped (old step 9: census pins, boot-time
  growth, chain budget). Change: W4.4a (non-M2M walls + rulings on 2b and rule 8) right after W3; W4.1/W4.3 with that world
  fixed; W4.4b the M2M features on the new IR; rule whether roadmap test files may be excluded by a named pinned register.
- **F10 GAP** — no gate can catch a wrong store resolution. Change: W4.0 or W1.5: H deterministic; per-test per-dialect
  product-SQL snapshot through an injected observer (not the `LL_TMP_SQL` stderr print, StatementExecutor.java:2550); a
  post-H dump over a named mapping-heavy set; aliases canonicalized; refactor slices byte-identical; W0.3's resolver
  defects fixed before the baseline.
- **F11 RISK** — H calls the typer (ClassSources.java:186,723; AggregationAwareRouting.java:118-126;
  AssociationJoins.java:1223,1360,1854), G½ (Pipelines.java:1711; RoutingContext.java:74), the executor (handle registrar,
  StatementExecutor.java:508-517), new resolvers recursively (SubQueryLift.java:220,257,301; ClassSources.java:885); five
  driver sites (Compiler.java:601,1182; StatementExecutor.java:352,1450,1503; BodyCompiler.java:235). Change: name these
  edges as W4.3 items or accept until W6.2 and say so.
- **F12 GAP** — W2 spends work on code W4 deletes (normalizer's 34 `new Variable(` and 53 bare mints; resolver's 127
  TypedVariable mints). Change: at those boundaries W2 gives a VarId supply and derived ids; W4 switches the interiors.
- **F13 GAP** — W4.3's pass list covers five of nine concerns; missing: the desugar pass (ChainNormalizer 231, ChainDispatch
  315), metamodel-as-rows (ElementReferences, ConstructedInstances, FunctionBodyRows), JSON source frames, M2M composition
  (`composeModelToModel` ClassSources.java:907), execution-option appends (DriverPkAppend, ImportDataFlowAppend), the
  relocations (RawGridSchema, RelationalRootForm, zipPairMap, GenericTypeReflection), the 37 `findFunction` re-picks and 169
  `callee().qualifiedName()` reads. Change: each with an owner.
- **F14 GAP** — "the strategy table as data" presumes a table that does not exist (package-info.java:45-60 lists four rules;
  the code also decides by flatten re-rooting, grouped-aggregate subselects, dotted and chained EXISTS, on-form hoisting
  StoreResolver.java:232-248, routed unions). Change: inventory the decisions before (6).
- **F15 NIT** — "one pass": it is one pass plus a pre- and post-pass per statement (StoreResolver.java:190-223) and
  recursive nested resolvers.
- **F16 GAP** — W4.1/W4.3 have no gate of substance. Change: W4.1's gate a shadow probe comparing, for every (mapping, set)
  the corpus and stress lanes touch, the new elaboration's ClassSource with the old compile-and-split one up to variable
  renaming; zero differences or pinned with a reason.

## Ordering errors
W4.2 needs W2.5, W3.1/3.4/3.6, D6 (§5 lists none). W4.3's first slices (desugar, identity, route) do not need W4.1; its
join-edge slice must land with W4.1's join-edge change: interleave W4.1a → W4.3.0–3 → W4.1b with W4.3.6. W4.4 cannot follow
only W2–W3 while its walls need W4.1/W4.3 features. W0.4 before any SQL-snapshot baseline.

## Not verified
identityHashCode names reaching SQL; duplicate declarations under W2.1; whether the -pure jars ship `.pure` resources
(answered since: yes, H3); pass counts by strength beyond 1,020 / 921.

## Verdict
Re-plan before executing. W4.1/W4.2 well aimed but underspecified (mapping references in D, BindingKey, static vs
query-time split, on-demand typing, shadow-probe gate; D6 ruled; depends on W2.5, W3.4/3.6). W4.3 describes where the
resolver should end up, not how to get there; plannable with a deterministic SQL-snapshot gate, a NavPath key first, the
corrected order, the physical IR last behind an adapter (rule 0.10 amended), owners for the missing concerns, 18–30
sessions. W4.4 conflicts with WORLD_MAP rule 8 and the open 2b question; split into W4.4a early and W4.4b last after
rulings on 2b, rule 8 and a named exclusion register.
