# A04 — Name resolver (phase D) + element compiler (phase F), read whole 2026-09-28

Reader's report, preserved. Tree `6ab32198d` (the 41 files are byte-identical at 3241a6c05). 41 files, 10,978 lines.
Paths relative to `core/src/main/java/com/legend/`.

## 1. What each phase is
**D** = `compiler/NameResolver` (2,083 lines): parsed tree (`ParsedModel`, `ValueSpecification`) → the same types,
simple names replaced by FQN strings, overload candidates on `AppliedFunction.candidateFqns` as `List<String>`.
Entries `resolve(ParsedModel[,wallSink])` (:158,:168), `resolveAlongside` (:182), `resolveQuery` (:538),
`resolveQueryIn` (:555). Helpers `BareNames` (ENGINE/CORE/FORM tiers), `ResolvedNames` (reads resolver output back),
`SynthFqn` (`$` names). Same package, not D: `KnowledgeLayer` (hierarchy kernel), `ModelBuilder` (per-kind index,
1,293), `SymbolTable`, `TableIndex`, `StoreLookups`, `RelationalKinds`, `DerivedProps`, and two query rewrites
`StatementInline`, `LiteralMapUnroll`.
**F** = `compiler/element`: `PureModelContext.from(NormalizedModel, ModelBuilder, …)` (:141) mutates the shared index
(`index.add` :162), runs `ModelIntegrity.check` (:92), then builds `TypedClass/Enum/Function` lazily into HashMap caches
(:263-273, :350-391). Types in `element/type`: `Type` (sealed, 9 variants), `Multiplicity`, `ExprType`; `PlatformTypes`
(860 lines of FQN constants + predicates). F depends on builtin, platform, compiler.spec (TypeClassifier:47,
Temporal:87), sql (Type:4). compiler ↔ compiler.element import each other (4 files / 8 files).

## 2. Verdict
**No symbols.** Every downstream reference is a String looked up by name. An unresolved bare name is returned
unchanged (NameResolver:745); a qualified name is never checked for existence (:652); failure deferred to F/G with no
position.
Type position (`resolveNameMulti` :646-746): type parameter → anything with `::` passes → reserved primitive names
(:659-665) → all wildcard matches, >1 is an error (:624-628) → own package, a tier below imports (:686-700) → the 32
`CORE_IMPORTS`, FIRST match (:711-736; the code calls it "kind-blind" :707-710).
Call position (`resolveCallCandidates` :362-389): UNION of wildcards, own package and every core hit — own package a
PEER of imports, contradicting :686-691; then `BareNames.catalogTiered` merged only when the resolver "captured"
something (:1748-1777); otherwise the name stays bare and F re-resolves it via BareNames (`FunctionCompiler.functionsAt`
:35-64). Bare calls interpreted in four places: NameResolver, `functionsAt`, `ResolvedNames.referents` (:24-34),
`StatementInline.resolvedDefinition` (:201-239).
`knownFqns` one kind-blind set (element FQNs of every kind, mangled ids, platform class/enum/function FQNs;
:398-408, :350-355). A second universe `PureModelContext.resolutionUniverse` (:293-320): `contains()` checks functions
and extensions but `iterator()/size()` use `elementFqns()` — breaks the Set contract. `ModelContext` default (:54-58) a
third, narrower universe.
**Import scope keyed by element FQN** (`elementImports().get(el.qualifiedName())` :258), filled by
`ElementParser` with `putIfAbsent(el.qualifiedName(), …)` (:325,393,478): overloads of one FQN from different
sections resolve with the FIRST section's imports; an element with no entry falls back to the union of every section's
imports (:262).
String handling: 7 `contains("::")`, 4 `(last)indexOf("::")`, 5 `startsWith(` (PlatformTypes:637, KnowledgeLayer:347,
BareNames:78), 31 literal `.equals`, 19 string case lines (~45 dyna names in RelationalTypeInference:47-128), 214
`"meta::` literal lines (PlatformTypes 173, NameResolver 33).

**IR.** Input switches sealed and exhaustive (`resolveElement` :412-515, `resolveVs` :1672-1846, `resolveRelOp`
:1561-1629). Output IR = input IR; the only tell of resolution is `candidateFqns.isEmpty()` (:1736). 17 `default ->`;
those hiding cases: RelationalTypeInference:165 (drops TargetColumnRef, Lambda, LambdaParam, ArrayLiteral), :128,:154;
KnowledgeLayer:526 (`t.toString()` fallback); ModelBuilder:319,343,388; Type:415; PlatformTypes:383,684;
ClassLayouts:155,247; EqualityKeys:130. `TypedFunction.definition` holds the parsed `model.Function` (:60),
`Property.Stored.defaultValue` a ValueSpecification (:50), contradicting TypedElement:8-11 / TypedFunction:16-19.
Consumers bypass the typed layer for stereotypes (`findClassDefinition`, Temporal:126, ModelContext:66).

**Types.** `Type` sealed and `Multiplicity` a proper Bounded/Var algebra (Multiplicity:83-142) — good. Class references
have two spellings (`ClassType(fqn)` / `GenericType(rawFqn,…)`); raw head re-derived in Type.classFqn (:409-417),
EqualityKeys.fqnOf (:49-57), ClassLayouts (:185,191), PlatformTypes.handleRowClass (:380-384). Generic heads never
validated (TypeClassifier checks NameRef :104-106, not Generic :108-127). Type variables are bare names
(`TypeVar("?")` :102). Category predicates are hand FQN sets (`RELATION_CARRIERS` PlatformTypes:186,
`FUNCTION_CARRIERS`, `VALUE_CARRIER_FQNS` :841, `isPlatformOwnedFunction` :690-726). Execution concerns in the type
model: pivot naming and the late-bound `*` wildcard (Type:479-566), `kindOfSqlType` importing `sql.SqlType` (:679-711).

**Diagnostics.** No D or F error carries a position. `ModelException(Phase,msg[,fqn])` 28 sites;
`ResolutionException(String)` 1 (:625); tolerant mode keeps `getMessage().split("\n")[0]` (NameResolver:277,
KnowledgeLayer:452, ModelIntegrity:96); 13 ISE and 11 IAE carry no phase (e.g. KnowledgeLayer:240, ClassLayouts:224).

**Fallbacks.** NameResolver :745 pass-through, :652 unchecked qualified, :664 bare primitive without prelude, :262
union scope, :272-279 element that failed resolution kept, :1462 executable skipped by `indexOf('(')`. ModelBuilder
:493 retry under `"meta::pure::metamodel::type::"+base`, :486 16-hop cap then empty, :534 zero-root mapping accepted,
:787 association-end lookup last-wins (while `findAssociationOf` throws on the same ambiguity :764-777), :746/:808
only NameRef supers. FunctionCompiler :139-158 swallows any RuntimeException and drops the broken overload (a call
can silently re-dispatch); :78-86, :114-120 suppress user definitions. ModelIntegrity :285,:288 unknown/malformed
superclass heads skipped, :325 foreign db refs skipped. ClassCompiler:90-92 any level other than "Warn" → ERROR.
ViewSignatures :102 unresolved view column → `Any[0..1]`, :137,:141 → Any. RelationalTypeInference:264 failed `[db]` →
enclosing db. RelationalOpRows :230,:298 `orElse(scopeDb)`, :339 "default" schema. ClassLayouts :147 malformed args →
empty layout, :200 unknown supers skipped. EqualityKeys:151 unknown super contributes nothing. MilestoningStrategy:34
unknown stereotype → null. PlatformTypes :441-444 `isProfile` suffix-matches (bare `PCT` counts as the PCT profile;
its own header calls suffix matching a bug class), :581-614 predicates accept bare spellings. `Multiplicity.ofArgument:241`
unparseable → Var. ModelContext: 26 defaults return empty/null/false, including `findDatabase`/`findTableDefinition`
silently overriding abstract `StoreLookups` methods (:298-310).

**Layering/state.** type→sql (Type:4); F→G (TypeClassifier:47 imports InferenceKernel; Temporal:86-109 imports
compiler.spec.typed); D→G (LiteralMapUnroll:5, StatementInline:8); compiler↔element cycle; PlatformTypes' header says
no builtin dependency (:9-13) but imports NativeFn, Pure, platform.Feature (:108,118,376,555,703-747). F hosts other
phases' policy: wire layout with `__id`/`__type`/`__canon` (ClassLayouts:31-46), runtime equality (EqualityKeys),
metamodel-store row format — 21 positional `List<String>` columns (RelationalOpRows:36-129), a scan over typed query
nodes (`Temporal.anyTemporalGetAll`). `FunctionCompiler.SUPPRESSED_ONCE` process-global static (:125); `System.err`
(:83,:116); 13 DecisionProbe hot-path sites. Thread-safety claims contradict the code: ModelBuilder "safe to share
across threads" (:56-57) with unsynchronized lazy HashMaps (:126,630,636); `KnowledgeLayer.derived` HashMap written
during reads (:56); PureModelContext "not thread-safe" (:35) mixing ConcurrentHashMap (:86,184) with plain caches
shared by overlays (:542-545).

**Duplication/dead.** 15 hand superclass walks (KnowledgeLayer 6, ModelBuilder.findAssociationOf, ModelIntegrity.walkSupers,
PureModelContext `reach`/`findProperty`, ModelContext `isSubtype`/`isDeclaredSubtype`, Temporal, ClassLayouts,
EqualityKeys); 4 subtype relations (KnowledgeLayer:116, ModelContext:367,:375, PureModelContext:199); 4 superclass
head extractors; opposite native/user precedence for classes (native first, KnowledgeLayer:82-85) and enums (user
first, TypeClassifier:81-84); 4 table-spelling rules (TableIndex:40-72, RelationalOpRows.splitTable:324-339,
ModelBuilder view index :443-455, KnowledgeLayer.canonicalTable); `substitute` ×2 (ClassLayouts:242, EqualityKeys:124);
`realizedFqn` ×2 (ClassCompiler:109, ModelIntegrity:217). Dead: `NameResolver.resolve(ParsedModel,Set)` and
`(…,Set,Map)`, 3-arg `ModelIntegrity.check` (:38), `DerivedProps.splitPropFqn`, `TypedConstraint.of`,
`ModelBuilder.symbols()`; test-only `SymbolTable.nameOf/allFqns`, `BareNames.fqns`; unused `imports` param of
`StatementInline.rewrite`; `PlatformTypes.ZIP`/`COLLECTION_ZIP` same value; `DURATION` unreferenced; ~11 orphan javadocs.

**Defects.** (5) NPE and missed rebuilds in NameResolver: a `ClassMapping.Pure` without `~src` has a null source class
(model allows it, model/ClassMapping.java:302-305); :1148 `nn(sourceClass)` throws whenever the class name, filter or
bindings change; runtime `connectionIds` resolved only when another runtime field changed (:1392-1396); a relational
`Lambda` always reallocated (:1571). (6) ModelIntegrity never classifies superclasses (`checkClass` :113-150;
`walkSupers` skips unknown heads :288): a class extending an unknown name or an enum passes, failing later with a
phase-less ISE (KnowledgeLayer:240); association ends accept enum/primitive targets (:74-77). (7) generic substitution
loses information: `substitute` (ClassLayouts:242-248, EqualityKeys:124-132) drops `multArguments`, ignores
function/relation types, and passes the SUBCLASS's type-argument map when walking supers (ClassLayouts:199-200,
EqualityKeys:180-181), ignoring `TypedClass.superTypes` (ClassCompiler:42-47).

## 3. Clean-sheet and delta
D produces symbols: per-namespace declaration tables (types, function overload sets, profiles, stores/mappings) with a
stable `DeclId` and kind; scope chain attached per declaration by span (section wildcards → own package → core group);
lookup by kind; every reference `Ref<Kind>(DeclId)` or a positioned diagnostic; tree walker generated from
`mapChildren`. F a query-based element compiler keyed by `DeclId` (memoized `signatureOf/supertypesOf/membersOf` with
cycle detection); one ancestor iterator; integrity over every reference incl. supers; one class-type form
`ClassType(DeclId,args,multArgs)`; type variables with binder identity; one substitution utility via `superTypes`;
platform ownership an attribute of the native id, conflicts a warning diagnostic; well-known types as DeclIds at boot;
categories from the subtype relation.
Keep: Multiplicity; sealed Type; Typed* shapes (minus `definition`/`defaultValue`); ModelBuilder per-kind index and
include-closure lookups; SynthFqn; ModelIntegrity checks (extended); TableIndex as the single spelling rule.
Move out of F: ClassLayouts, EqualityKeys, RelationalOpRows, Temporal.anyTemporalGetAll, SQL/pivot helpers in Type.
Move out of D: StatementInline, LiteralMapUnroll. Delete: SUPPRESSED_ONCE and stderr, isProfile suffix match,
bare-spelling predicates, duplicate walks/relations, dead APIs.

## 4. Top findings
1. STRUCTURAL: resolution yields strings; unresolved names pass silently.
2. STRUCTURAL: the name universe kind-blind and inconsistent (three universes).
3. DEFECT: import scope keyed by element FQN, first-wins.
4. DEFECT: type and call positions tier differently (own package lower tier vs peer; core first-match vs all-hits).
5. DEFECT: NPE and missed rebuilds in NameResolver (:1148, :1392-1396, :1571).
6. DEFECT: eager integrity skips superclasses.
7. DEFECT: generic substitution loses information.
8. STRUCTURAL: `functionsAt` gates (platform-owned by FQN, PCT stereotype with suffix-matched profile, stderr + static set, swallowed broken overloads).
9. STRUCTURAL: layering (type→sql, F→G, D→G, compiler↔element, F hosting wire/equality/row policy).
10. SMELL: duplicated hierarchy logic, PlatformTypes god class, false concurrency claims.

Counts: NameResolver 109 static methods, 56 `resolveName(` sites; ModelContext ~51 methods (26 defaults);
PureModelContext 51 @Override; ModelBuilder 52 public methods; PlatformTypes 166 constants (9 unreferenced outside the
file); 308 inline fully-qualified `java.util.X` names; `.orElse(` 23 / `return null` 48 / `catch (` 7.
