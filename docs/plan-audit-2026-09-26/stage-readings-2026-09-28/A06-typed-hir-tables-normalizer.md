# A06 — Typed HIR, platform tables, normalizer (phase E) — read whole 2026-09-28

Reader's report, preserved. Tree `6ab32198d`. 127 files (typed/ 91, platform/ 7, normalizer/ 29). Also read to trace
edges: `compiler/spec/CallNodes.java`, `compiler/element/type/ExprType.java`, `lowering/PlatformRegistrations.java`,
part of `PureModelContext.java`. Paths relative to `core/src/main/java/com/legend/`.

## 1. What it is
**Typed HIR.** Sealed `TypedSpec` (TypedSpec.java:17-76) permits 61 variants plus sub-root `TypedRelationOp` (16 more,
TypedRelationOp.java:15-31): 77 records. Every node `info(): ExprType` (non-null Type and Multiplicity,
ExprType.java:12-16); positional spine `children()/withChildren()/withInfo()` (TypedSpec.java:88-109). Also: `Calls`,
`Lets`, `VarUse`, `Literals`, `StoreElementIdentity`, `ExecutionContext` with its 1,048-line reader `ContextReading`;
components `TypedAggCol`, `TypedFuncCol`, `TypedGraphTree`, `WindowFrame`, `FoldStrategy`. Depends outward on
compiler.element, protocol.spec (37), builtin, platform, model, error, values and sql (TypedFrameRef.java:7).
**Platform tables.** `DeclarationTable` FunctionId → declaration. `ImplementationTable.build` → one
`Implementation` per id: `Form | Intrinsic | Body | Unimplemented | Refused` (Implementation.java:17-62). `Registrations`
assembled in lowering (lowering/PlatformRegistrations.java:54-95) from its rule maps, `CoreFn.ownedFqns`,
`WalledBodies.reasons()`, `Subsumed`, families; injected into F (Compiler.java:239); `CallNodes.mint` reads it to
choose `TypedNativeCall` vs `TypedUserCall` (CallNodes.java:46-50).
**Normalizer.** `ModelNormalizer.normalize(ParsedModel, ModelBuilder, wallSink) → NormalizedModel` (:110-140): E.5 lift
views (LiftedViews); E.1 desugar mappings (MappingNormalizer: MappingPrePass, per-set synthesis Relational/Pure/
Union/Inheritance/RelationFunction, association synthesis, XStore/ModelJoin); E.2–E.4 lift derived properties,
constraints, service queries; E.6 re-runs `NameResolver.resolveQueryIn` over every synthesized body (:142-187). Input
parser records; output UNTYPED protocol `ValueSpecification` bodies in synthesized `FunctionDefinition`s plus
`MappingDefinition` bindings and ledger facts. Imports ModelBuilder (22), NameResolver, KnowledgeLayer, DerivedProps,
SynthFqn, RelationalKinds, element.ViewSignatures: E calls into D and F.

## 2. Verdict
**Names.** HIR callee a resolved `TypedFunction` with `id()` (TypedNativeCall.java:27; `Calls.calleeIdOf`
Calls.java:27-33) — correct. Undercut in the same package: `Calls.calleeOf` returns the FQN, billed "THE ONE CALLEE-NAME
HELPER" (Calls.java:9-24); `TypedNativeCall.function()` returns `qualifiedName()` though documented "simple name"
(:52-55); 21 FQN-string dispatches in the package (Literals.java:51,55,83; TypedFold.java:59
`"meta::pure::functions::collection::concatenate"`; ContextReading.java:235 `"meta::relational::postProcessor::postprocess"`,
:324 `endsWith("::toOneMany")`, `MAPPER_PP_FQN` :150-155). Repo-wide `callee().qualifiedName()` 342 vs `callee().id()` 126.
Every other identity a string: TypedPropertyAccess.property (:17), TypedGetAll.classFqn (:25), TypedNewInstance.classFqn
with `Map<String,…>` properties (:14), TypedEnumValue.enumFqn (:16), TypedPackageableRef.fullPath (:12),
TypedTableReference.store/table (:26), TypedMatchRuntime.Arm.typeFqn (:32). Variables bare names (TypedVariable.java:8);
`VarUse` stops at re-binding lambdas (VarUse.java:22) while `Lets.byName` ignores nesting (Lets.java:68-76).
Normalizer: 53 bare-name `new AppliedFunction("<name>",…)` (e.g. `"map"` MappingNormalizer.java:818,1197,1638;
`"filter"` :1151,2255; `"tableReference"` :1686; `"equal"/"or"/"if"` :2453-2466; 20+ in RelOpTranslator.java:251-590),
~50 `Pure.Lite.*` shims. Private resolvers: `AssociationSynthesis.resolveAssociation` (`contains("::")`, wildcards,
"same-package fallback", :371-390); `StoreSubstitutionRewrite.includeFqn` (:328-341), `qualifyStoreRefs` (:358-400),
`storeFqn` ending `.orElse(path)` (:343-346); `MappingClosures.walkEnums` package-relative (:366-372);
`relationFunctionPipeline` findFunction else findFunctionById (MappingNormalizer.java:910-915). Raw association lookups
bypass `resolveAssociation` (MappingClosures.java:418-419; AssociationSynthesis.java:81; ModelJoinNesting.java:78).
11 `equalsIgnoreCase` (ViewRelation.java:332-352; Pipeline.java:116); 13 name tests (DeclaredCoercions.java:86-91;
MappingNormalizer.java:1207,2768).
Platform: DeclarationTable keyed by FunctionId but also by FQN (:36,76); forms and refusals registered BY FQN
covering every overload (ImplementationTable.java:116-157; CoreFn.java:231-389); `CoreFn.of` still resolves bare parse
names first (`BY_NAME`, :183-198,406-417) though its javadoc says the FQN map replaces them (:207-213), 21 call sites;
`WalledBodies` a hand list of 26 FQN strings incl. mangled `$prop$` names and a test function (:49-98), read both
through the table and directly from SpecCompiler.java:89 — two channels.

**IR.** Sealed; records with List.copyOf except `TypedSerializeGraph.checkedConstraints` (:136-142). Equality: TypedNativeCall
excludes pos (:40-50), TypedUserCall does not (:21-45). NOT phase-indexed: TypedJoinSlot "never reaches the lowerer"
(:17-18), TypedNewInstanceCast (:15), TypedCsvCensus/TypedTestDataGen "never reaches lowering" (:19,:17), TypedDeactivate
(:17-19), TypedSerializeGraph "Phase H output" (:9). Resolver provenance stamped on G nodes: TypedFilter.Stamp (:18-29),
extentBoundary (TypedExtendWindow.java:21-34), wireForm (TypedProject.java:21-26). Foreign payloads: TypedFrameRef holds a
MIR `SqlQuery` (:28); TypedCsvCensus/TypedTestDataGen hold untyped protocol trees (:22-25,:19-22); ExecutionContext.Reader
walks raw protocol bodies (:252). 27 boolean mode/provenance flags. Nodes that stand for several overloads, disambiguated
in lowering "by the source's type" (TypedFilter.java:8-13; TypedMap.java:9-11; TypedLimit.java:8-10); a collection sort
`TypedSortBy` inside TypedRelationOp (:19). Traversal position-coded, fails with ClassCastException (TypedSpec.java:90-99;
TypedNavigate.java:117-135). `default ->` 11 typed/, 21 normalizer/, 0 platform/; RelOpTranslator.translate split so
the first switch defaults into the second (:391,605).

**Types.** HIR types are values. Normalizer types are strings, decided before types exist: DeclaredCoercions primitive
detection by spelling (:55-57,74-93), cast/parse on kind strings (:162-224); buildNewInstanceToOne `PRIMITIVE_TYPE_NAMES`
plus a `"meta::pure::metamodel::type::"` prefix (MappingNormalizer.java:2740-2770); booleanizeCaseLiterals `'true'`/`'false'`
→ booleans (:2799-2827); pureTypeFor maps SQL type names (RelOpTranslator.java:172-199); multiplicity forced by
TRUST_ONE wraps (RelOpTranslator.java:139-141,566-568; ViewRelation.java:285-290); ordering comparisons routed to
Any-typed Lite shims so the checker won't reject them (RelOpTranslator.java:684-698). LiftedViews computes a typed
RelationType through F, spells it back to a TypeExpression, leaves F/G to re-read it (:98-141).

**Diagnostics.** Normalizer: 76 ModelException, 50 NotImplemented, 13 ISE, 0 `SourceInfo`; tolerant builds keep the
first line (MappingNormalizer.java:202,218); synthesized bodies carry no spans — a type error in a desugared mapping
surfaces in G far from its mapping line.

**Fallbacks.** `MissProbe.miss()` is `orElse(null)` renamed (MissProbe.java:45-47; 21 uses + 11 `knownMiss`);
m2mPropertyValue returns the raw expression on three misses (MappingNormalizer.java:1205,1211,1213); inferMainTableQuiet
swallows ModelException (:1441-1448), mainTableOrNull takes root set's table else first (:2317-2333);
`findFilter(...).ifPresent` (:1720); `resolveAssociation(...).orElse(am.associationName())` (:431,440); GroupBySynthesis
withholds PMs silently (:157-159,175-184); first PM wins (AssociationSynthesis.java:446-453); endAnchor falls back to the
class rule (:748-754); memberFunction `closure().get(0)` (UnionSynthesis.java:70,119); unregistered dyna names pass as
Pure calls (RelOpTranslator.java:709-711); `nullTolerant` `default -> false` (JoinChainEmission.java:1042);
plainClassViewCond catches ModelException (:875-879); MappingValidation skips unknown class (:77-78); MappingFacts omits
unresolved unions (:46-54); invented H2-lenient `first()` aggregate (ViewRelation.java:208-223); service query return
`Any[*]` (ModelNormalizer.java:402-403); 8 unresolved includes skipped via ifPresent (MappingClosures.java:153,168,236,
254,314,326,393,409); conjuncts ordered by `toString()` (MappingNormalizer.java:736). ContextReading: `"H2"` default
(:803,845), quoteIdentifiers false (:896), unknown options `continue` (:365-367), non-Relational context false
(:424-427), depth caps 3 (:549,705). Platform: `rowOf` answers the kind default for undeclared ids
(ImplementationTable.java:208-218); `build` never fails (dangling/conflicts returned as lists, :188); duplicates
reported not refused (DeclarationTable.java:59-61).

**Layering.** Frontend output shape depends on the backend: CallNodes mints a native node exactly when the
lowering-assembled table says `runsByRule`. E calls D and F. MappingClosures memoizes mutable HashMaps on
`model.knowledge().derived` (:52-61). ContextReading — a runtime-value interpreter over typed and raw trees — lives in
the HIR package.

**Duplication/dead.** ContextReading typed/raw twins (collectChain/collectChainRaw :487/523; collectJson/Raw :575/603;
collectSetups/Raw :644/690; connectionName/rawConnectionName :810/838); group-key naming twice (GroupBySynthesis.java:42-49,
139-144); six include-closure walkers with different precedence (MappingClosures.java:41-45). Dead: collectColumnsOfTable/
collectTargetColumns (MappingNormalizer.java:1239-1294); UnionSynthesis MEMBER_WITNESS, FILTER_FORM, Thread, ScanSource
(:704-756); empty banners and orphan javadocs; DeclaredCoercions links a non-existent RequiredNullableCensus (:28);
unused `ledger` params (:100,134); redundant double check (AssociationSynthesis.java:655-672).

**Size.** MappingNormalizer 2,833 (normalizeMapping :257-456; synthTableBackedParts :1650-1839); JoinChainEmission.emitJoinChain
:267-456; AssociationSynthesis.injectMultiHopAssociationPMs :52-219; RelOpTranslator translate+translateTail :216-608;
ContextReading 1,048; TypedSerializeGraph 17 components, 9 constructors.

## 3. Clean-sheet and delta
HIR: sealed IR per phase (`Typed` G, `Resolved` H, `Physical` input to I); phase-only nodes in their phase; handles
(`Var(BinderId)`, `Prop(ClassId,PropertyId)`, `ClassId`, `EnumId`, `StoreRef(DbId,TableId)`); callee `FunctionId` plus
optional closed intrinsic tag, no FQN accessor; overloads given a domain (`CollectionFilter`/`RelationFilter`);
resolver provenance in H nodes or side tables; generated visitor. ExecutionContext as a constant fold over typed inlined
HIR only. Platform: one declarative registration per FunctionId (forms, walls, intrinsics, subsumed); build fails on
dangling/conflicts; one wall channel; native vs user by declaration kind at typing, rule-or-body at inlining/lowering;
`CoreFn.of` over bare names gone. Normalizer: resolve all mapping references in D (associations, stores, includes, enum
mappings, set ids); elaborate mappings AFTER F into a typed mapping IR (per set a typed relation expression plus typed
property bindings, built with FunctionIds, ExprTypes, SourceInfo); type-check embedded user fragments with the real
checker; structured identity records instead of mangled names.
Reuse: TypedSpec records and spine, ExprType, FoldStrategy, WindowFrame, Implementation kinds, DeclarationTable,
StoreSubstitutionRewrite's exhaustive walk, MappingPrePass/Validation sequencing, ResolvedMapping. Delete: dead code,
MissProbe, duplicate name resolvers, the direct WalledBodies channel, CoreFn.BY_NAME, TypedSerializeGraph compatibility
constructors.

## 4. Top findings
1. STRUCTURAL: the normalizer emits untyped text-shaped Pure before types exist, re-runs D, relies on G, 0 positions.
2. STRUCTURAL: the normalizer types on strings (DeclaredCoercions.java:52-226; MappingNormalizer.java:2740-2827; RelOpTranslator.java:139,172-199,684-698).
3. STRUCTURAL: ≥5 private name resolvers in E; a simple-name association header resolves in synthesis but throws ISE in pair collection (inferred, not executed).
4. STRUCTURAL: HIR not phase-indexed; foreign payloads.
5. STRUCTURAL: string identities inside a typed IR.
6. STRUCTURAL: implementation table couples typing to lowering; forms/walls by FQN; build never fails; two wall channels; bare `CoreFn.of` parallel to Form rows.
7. DEFECT (probable): `pmThroughFrame` `default -> pm` leaves EnumeratedExpression, OtherwiseEmbedded sub-PMs and JoinTerminalColumn un-rewritten through a view frame (ViewRelation.java:420-454), though `frameRewrite` "must" cover every operation (:318-321). Not execution-verified.
8. DEFECT (latent): TypedUserCall equality includes pos; name-keyed substitution ignores shadowing (XStorePureEnds.java:297-299; RelationReads.java:183-190); `nullTolerant` default null-rejecting; `Set<String[]>` identity equality (ModelJoinNesting.java:56); mutable list leak (TypedSerializeGraph :136-142).
9. SMELL: fallback density.
10. SMELL: mangled-name cross-phase contracts (`"k<i>__col"` GroupBySynthesis.java:48,143; `"__pk_<table>"` UnionSynthesis.java:768,1020; `"nl__p__inb__j"` :878; `col+"_"+ord` :970; `"_nav"` JoinChainEmission.java:632; PK_ORDER_PREFIX TypedSerializeGraph.java:114; `"\u0000"` composite keys and set-id parsing on `'_'` AssociationSynthesis.java:145,294-297,766-775).

Counts: CoreFn 66 forms, 74 bare parse names, 90 owned FQNs, 21 `CoreFn.of(` sites; WalledBodies 26; normalizer imports
from compiler.* 22 ModelBuilder + NameResolver ×2, KnowledgeLayer ×2, ViewSignatures, DerivedProps, SynthFqn ×7,
element types ×10; `"meta::…"` literals typed/ 5, normalizer/ 10, platform/ 105.
