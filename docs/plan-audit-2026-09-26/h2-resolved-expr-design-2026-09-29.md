# H2 — the resolved tree: what holds it, what it is, who builds it, how it lands (W2.0), 2026-09-29

Design note for plan item W2.0, drafted read-only at `compiler/rebuild` @ `23b21e6ad` (persisted by the parent session;
the drafting agent could not write files). Paths are relative to `core/src/main/java/com/legend/` unless they start with
`core/` or `docs/`. Every count comes from a grep named beside it. The pinned reference trees were not re-verified and no
bazel was run. It answers `h1-plan-audit-2026-09-29/W2-resolved-tree.md` findings #1, #2, #3, #4, #9, #11, #14, #15, #20,
#21 (index in §8). **Status: RULED 2026-09-29 (the user, D12), with the revision below, which supersedes §1, the `Legacy` field in §2 and §7's rulings 1, 3 and 6.**

## Revision, ruled 2026-09-29: a resolved declaration family, not a side table

The first draft of this note recommended a side table (`ResolvedBodies`) beside unchanged parse records, citing rustc. That
was a cost-driven choice and the citation did not hold: rustc LOWERS its syntax tree into a new tree (HIR) and stores each
resolved name inside the HIR node; its bodies live in a map owned by the new tree, not beside the syntax. Roslyn binds
bodies into bound trees and declarations into symbols. Side tables are for facts computed later (rustc's per-expression
types), not for resolution. A side table would leave syntax records holding stale, unresolved bodies with only a bytecode
rule to stop a reader using them: the run-time boundary D1 rejected. The user ruled the proper design:

1. **The resolver lowers the parsed model into a resolved model** (`ResolvedModel`, target `//core:compiler_resolved`).
   Every element whose parse record holds an expression gets a resolved twin carrying `ResolvedExpr`: resolved functions
   and services, classes (property defaults, derived properties, constraints), measures, associations, and mappings (class
   mappings, filters, property bindings, aggregate views, model joins, cross-store properties); §1's list of the 19 body
   slots is the exact inventory. Elements that hold no expression (enumerations, profiles, stores, connections, runtimes)
   ride through as today's records until W2.6 turns their references into ids. Parse records stay syntax; nothing after
   the resolver reads them (a bytecode rule pins it, and javac proves it for every body-holding kind).
2. **Downstream reads only the resolved model.** The normalizer (E) takes resolved mapping records and builds
   `ResolvedExpr` through the one builder (§3); the element compiler (F) builds `TypedFunction` and friends from resolved
   declarations; the typer's inputs are `ResolvedExpr` only. The resolved mapping records are what W4.1a later elaborates
   into the typed mapping IR, so none of this is throwaway.
3. **No callee strings on the node** (supersedes the `Legacy` field): a `Call` carries its `Candidates`; every reader that
   dispatches on a name today gets it from the declaration id (`FunctionId`'s FQN), so the 134 name-dispatching readers
   switch to ids in W2.3a rather than keeping strings for a wave.
4. **Identity keys (ruling 6) are moot**: bodies live in their resolved declarations.
5. Rulings 2, 4 and 5 stand: candidate sets are fixed at resolution if push 1's probe counts 0 boot-body divergences; W2.3a
   does not wait for D10 (an `Error` node replays today's failure; D10's two modes land after); StaticFold and AlphaRename
   are ported.

**Size:** W2.3a grows from 6–8 sessions to about 9–13: the resolved element family, and the 169 main files (1,958
references, `grep -rlw` over the 13 body-holding type names) that read resolved bodies, switch in it. The push sequence of
§6 keeps its shape: push 1 adds the family and a converter used by nobody, push 2 moves the typer, push 3 the normalizer,
push 4 makes the resolver emit the resolved model and deletes the converter; every push keeps CANDIDATES identical by
(site, candidate set) and the reference lane unchanged.

## 0. The decisions on one screen

| | Decision (recommended) | Main evidence |
|---|---|---|
| A | **SUPERSEDED by the ruled revision above: a resolved declaration family.** First draft: a side table, `ResolvedBodies`, carried beside each layer of the World. Parse records untouched. Function bodies keyed by `FunctionId`; every other body slot keyed by the identity of its parse root. `ResolvedExpr` in a new target `//core:compiler_resolved` (deps base, error, values, protocol, model). `FunctionId` stays in `model`. | §1 |
| B | 19 variants, mirroring `ValueSpecification` where the typer needs it, plus `Member`, `New`, `Copy`, `Error`. `Call` carries `Candidates`, `infix`, `propertyForm`. (The first draft's `Legacy` callee strings are superseded: readers derive names from ids.) | §2 |
| C | One builder, `compiler/Resolve`: NameResolver's call arm and the typer's bare-name path in one method with four scopes reproducing today's four rules. E and G mint through it. E.6 deleted in push 3. | §3 |
| D | `TypedSpec` construction unchanged. Entry points, `TypedFunction.body`, `Env` aliases, 4 raw-payload HIR fields and all five untyped rewriters ported to `ResolvedExpr` **in one push**. No back-converter. | §4 |
| E | `VarId(int body, int local)`, rustc `HirId` style. D allocates ids for explicit and implicit binders; the minting side keeps a counter per body. Names stay as display fields. | §5 |
| F | Four pushes; a converter from D's output is the seam: shadow, then the typer's entries, then E, then deleted when D emits the resolved model. **9–13 sessions** with the ruled revision (first draft: 6–8). | §6 |
| G | Six rulings: RULED 2026-09-29 with the revision above. | §7 |

## 1. (A) What holds a resolved body

**The body slots today.** Nineteen record fields hold a `ValueSpecification`; D rewrites all of them; E and later read them.
- `protocol` (`core/BUILD.bazel:45`): `ConstraintDefinition.message` (`protocol/ConstraintDefinition.java:20`);
  `Realization.Ref.source`, `Realization.Inline.body` (`protocol/Realization.java:32,53`);
  `DerivedPropertyDefinition.expression` (`:50`); `TypeExpression.Generic.typeVariableValues` (`protocol/TypeExpression.java:101`).
- `model` (`BUILD.bazel:46`): `FunctionDefinition.body` (`:72`); `ServiceDefinition.functionBody` (`:63`);
  `ClassDefinition.PropertyDefinition.defaultValue` (`:113`); `MeasureDefinition.Unit.body` (`:35`);
  `ClassMapping.AggregateView.groupByFunctions` (`:199`); `AggregateValue.mapFn`, `aggregateFn` (`:209-210`);
  `Pure.filter` (`:321`), `Pure.PropertyBinding.expression` (`:366`); `RelationFunction.inlineSource` (`:459`),
  `RelationFunction.Col.expr` (`:487`); `AssociationMapping.XStoreProperty.expression` (`:90`), `ModelJoin.lambda` (`:101`);
  `MappingDefinition.AggregateViewFacts.groupByFunctions` (`:305`).

**Almost everything the typer types is a function body.** E lifts derived properties, constraints, services, mapping
transforms and views into `FunctionDefinition`s (`normalizer/ModelNormalizer.java:124-137`; `TypedFunction.java:16-19`, "the
single body substrate"). F copies `fd.body()` into `TypedFunction.body` (`compiler/element/FunctionCompiler.java:172-173`).
Typer entry points: `SpecCompiler.compile(TypedFunction)`, `compileReachable`, `viewRelation`
(`compiler/spec/SpecCompiler.java:83,126,66`); `typeExpression`, `typeQueryBody` (`:257,266,282`), called only from
`Compiler`, `StatementExecutor`, `resolver/AggregationAwareRouting.java:123,126`. Non-function slots read after E:
`defaultValue` at F (`compiler/element/ClassCompiler.java:60`, then `NewChecker.java:218-220`); the aggregate-view functions
at H (`AggregationAwareRouting.java:117-126`); lineage and test-runner reads.

**Options.**
1. *`ResolvedExpr` in `protocol`, `FunctionId` moved there* (`step3-design-2026-09-26.md` §1). One field cannot hold both
   types unless generic or a sum type; a sum type is the run-time slot D1 rejected. It puts resolver output into the wire
   package ("our types, their bytes", `protocol/Protocol.java:6-9`) and costs the move (37 + 12 sites plus 488 generated in
   `Pure.java`). **Reject.**
2. *Element records generic over the expression type* (GHC's Trees That Grow). The parameter spreads through
   `PackageableElement` (sealed, 20+ permits, `model/PackageableElement.java:26`), `ParsedModel`, `NormalizedModel` and the
   parser: `grep -rlw` for the 13 affected type names gives **169 main files, 1,958 references**. **Reject for W2.3a**; the
   side table leaves it open.
3. *A parallel family of resolved element records*: ~11 records and their sealed parents duplicated; the mapping records are
   thrown away by W4.1a. **Reject.**
4. *A side table keyed by body owner* (**recommended**): rustc's arrangement (items carry a `BodyId`; bodies live in a
   separate map) and Roslyn's semantic model (a syntax node bound to a bound node). Parse records stay syntax; D writes
   `ResolvedBodies`; every reader of a resolved body asks the table.

```java
public final class ResolvedBodies {                       // immutable; one per World layer
    Optional<List<ResolvedExpr>> function(FunctionId id);  // user, prelude, system and E-lifted bodies
    ResolvedExpr slot(ValueSpecification parseRoot);       // any other slot, keyed by the parse node's IDENTITY
    ResolvedBodies over(ResolvedBodies lower);             // boot + graph + E's extension; a duplicate key is refused
    int bodyOrdinal(Object key);                           // W2.5: VarId's body part (§5)
}
```

**Why `FunctionId` for function bodies:** the per-overload identity `TypedFunction.id` already carries
(`TypedFunction.java:60-72`); E's lifted bodies have no parse root; W2.1 refuses model↔model duplicate ids first.
**Why identity for other slots:** owner-relative paths are not unique (duplicate property mappings,
`MappingNormalizer.java:774-778`; sets without ids; bindings inherited through `extends`, which must keep the parent's section
scope — an identity key gets this free). Step 3 v1's identity table was rejected because ~180 rewrite sites rebuilt parse
subtrees after resolution; under D1 nothing rewrites a parse tree after D (all rewriting is on `ResolvedExpr`), the table is
consulted only at a slot's root, and the one post-D rebuilder of slot records is D itself (`NameResolver.java:1147,1156`),
which stops in push 4. `KnowledgeLayer.adopt` appends definitions by identity (`ModelNormalizer.java:114-120`). A miss is an
INTERNAL diagnostic, never a fallback.

**Where it is carried:** `Compiler.Layer` (`Compiler.java:244`) and `Compiler.Boot` (`:275`; the boot table cached per process
with the boot model, `:260-306`, safe because trees hold only FQN strings and `FunctionId`s, #15); `PureModelContext.from(…)`
(`PureModelContext.java:140-167`); `NameResolver.resolve` (`:158`) returns `Resolution(ParsedModel model, ResolvedBodies bodies)`.

**Fields that change** (target `compiler` or the driver; parse records unchanged in W2.3a): `TypedFunction.body`
→ `Optional<List<ResolvedExpr>>` (`TypedFunction.java:58`); `Property.Stored.defaultValue` (`Property.java:48-50`);
`TypedTestDataGen.params` (`typed/TypedTestDataGen.java:20`); `TypedCsvCensus.query` (`typed/TypedCsvCensus.java:23`);
`ExecutionContext` `fnBody` (`typed/ExecutionContext.java:252,265`); `Env.exprAliases` (`Env.java:21`); the `SpecCompiler`
entry parameters; in push 4 `Compiler.resolveQuery`'s return type (`Compiler.java:869`) and `StatementExecutor`'s
`protocolBody` (`:116`); deleted in push 4: `AppliedFunction.candidateFqns` (`protocol/spec/AppliedFunction.java:67`).

**Bazel, no cycles:** `java_library(name = "compiler_resolved", srcs = glob(["…/compiler/resolved/*.java"]), deps = ["//base",
":error", ":values", ":protocol", ":model"])`, excluded from `compiler`'s glob (precedent `compiler_element_type`,
`BUILD.bazel:74-81,94`), added to compiler, normalizer, lineage, validation, resolver, testdatagen, driver, test. Its deps sit
below compiler; `Error` needs H4's `error.Code`, and `error` is below `protocol`.

**What javac proves:** the typer's inputs are `ResolvedExpr` (entry points, `TypedFunction.body`, `defaultValue`). Not the
absence of back doors: the typer can still reach parse fields through `findClassDefinition`/`findFunctionDefinitions`
(`PureModelContext.java:277,643`, 4 uses in `compiler/spec`), and other post-D readers could still read record body fields.
Two ArchUnit rules close both (§6).

## 2. (B) The `ResolvedExpr` family

| `ValueSpecification` | `ResolvedExpr` | Note |
|---|---|---|
| `AppliedFunction` | `Call` / `Member` / `New` / `Copy` / `Error` | `propertyCall` → `Member`, except the parser's `.all(nonLiteral)` property form (`SpecParser.java:1281-1290`) → `Call(propertyForm = true)` (#20). `new(ptr, NewInstance)` → `New`; empty `className` → `Copy` (the typer's test, `Typer.java:1358-1364`); other `new` shapes stay `Call`. `grouped` dropped (only the wire emitter reads it, `ProtocolEmitter.java:2690`). |
| `AppliedProperty` | `Member(parens = false)` | |
| `Variable` / lambda parameters | `Var` / `Binder` | name only in W2.3a; `VarId` in W2.5 |
| `LambdaFunction`, `PureCollection` | `Lambda`, `Collection` | |
| 9 literal records | `Lit.*` (9) | keeps `CDecimal.written` (read at `Typer.java:191`); drops `CString.multiLine` |
| `PackageableElementPtr`, `EnumValue` | `ElementRef`, `EnumRef` | FQN strings until W2.6 (#14) |
| `NewInstance`, `NewInstanceCast` | inside `New`; `MappingCast` | |
| `ColSpec`, `ColSpecArray`, `TypeAnnotation` (4) | mirrored; `TypeArg.*` (4) | |
| `PathLiteral` | `Path` | checkers read `alias` |
| `QuotedTreeCall`, `QuotedGrammarCall` | `QuotedTree`, `QuotedGrammar` | D leaves `q.tree()` unresolved (`NameResolver.java:1690-1695`); the converter maps it with the Mint scope (today's rule) |
| `TdsLiteral`, `GraphFetchLiteral` | — | D dissolves both (`NameResolver.java:1686-1689`) |
| `SqlIsland`, `GqlIsland`, `CByteArray` | `Island`, `Lit.Bytes` | the typer refuses them as today (`Typer.java:145-172`) |

```java
package com.legend.compiler.resolved;
public sealed interface ResolvedExpr permits Call, Member, Var, Lambda, Collection, New, Copy, MappingCast,
        ElementRef, EnumRef, Lit, ColSpec, ColSpecArray, TypeArg, Path, QuotedTree, QuotedGrammar, Island, Error {
    @Nullable SourceInfo span();          // H4's Span once W1.2 aliases SourceInfo
    record Candidates(List<FunctionId> ids) { /* List.copyOf; never null */ }
    /** W2.3a ONLY: today's post-D callee text for the readers still dispatching on it
     *  (CoreFn.of x18, ResolvedNames x31, .function() x85 in compiler/spec). Deleted by W2.3b / W3.6. */
    record Legacy(String function, List<String> candidateFqns) {}
    record Call(String spelled, Candidates candidates, List<ResolvedExpr> args, boolean infix,
                boolean propertyForm, Legacy legacy, @Nullable SourceInfo span) implements ResolvedExpr {
        public Call { if (candidates.ids().isEmpty())
                          throw new IllegalArgumentException("compiler bug: zero candidates is Error, not Call"); }
        public Call withArgs(List<ResolvedExpr> a) { /* copies EVERY field — AppliedFunction.withParameters' rule */ }
    }
    record Member(ResolvedExpr receiver, String name, List<ResolvedExpr> args, boolean parens,
                  Candidates asFunction /* W2.3a: today's call reading of a dot-call; may be EMPTY; W2.4 drops it */,
                  Legacy legacy, @Nullable SourceInfo span) implements ResolvedExpr {}
    record Var(String name, @Nullable SourceInfo span) implements ResolvedExpr {}               // + VarId (W2.5)
    record Binder(String name, @Nullable TypeExpression type, @Nullable Multiplicity mult, @Nullable SourceInfo span) {}
    record Lambda(List<Binder> params, List<ResolvedExpr> body, @Nullable SourceInfo span) implements ResolvedExpr {}
    record Key(String name, ResolvedExpr value, boolean add, boolean local) {}
    record New(String classFqn, List<TypeExpression> typeArgs, List<String> multArgs, List<Key> keys, @Nullable SourceInfo span) implements ResolvedExpr {}
    record Copy(ResolvedExpr source, List<Key> keys, @Nullable SourceInfo span) implements ResolvedExpr {}
    record MappingCast(String classFqn, List<TypeExpression> typeArgs, ResolvedExpr src, @Nullable String targetSetId, @Nullable SourceInfo span) implements ResolvedExpr {}
    /** Poison: a call D could not bind. W2.3a's typer arm replays today's zero-candidate path on these fields
     *  (same exception, same order); W3 gives it the error type. */
    record Error(com.legend.error.Code code, String spelled, List<ResolvedExpr> args, Legacy legacy, @Nullable SourceInfo span) implements ResolvedExpr {}
    // ElementRef, EnumRef, Lit.*, ColSpec, ColSpecArray, TypeArg.*, Path, QuotedTree, QuotedGrammar, Island: field-for-field mirrors
}
```

**Flags (#21):** `infix` on `Call` (read at `Typer.java:1825,1931`); "propertyCall" becomes `instanceof Member` or
`Call.propertyForm` (`CallShapes.java:63`, probes at `Typer.java:557,642,1546`).
**Spans:** every node carries one; in W2.3a a node with no position today gets `null`. Provenance spans for synthesized nodes
(H4 §2) are a later push, because the reference lane joins calls by position.
**`Member` is in the first tree (#4):** `asFunction` holds the candidates the typer reads today for a dot-call
(`CallShapes.autoMapReceiver`, `CallShapes.java:62-73`; the qp-arity route `Typer.java:593-596`). The 106 dot-spelled names
with no candidate are `Member`s with an empty `asFunction`, never poisoned. W2.4 replaces this with lookup by receiver type.

## 3. (C) The one builder

**Location and inputs:** `compiler/Resolve.java` (target `compiler`: it needs `ModelBuilder`, `BareNames`, `NameResolver.Scope`,
`builtin.EngineHandlers`, `Pure`, `CoreFn`). It reads W2.1's index through `DeclIndex { List<FunctionId> declaredAt(String fqn);
boolean isFunctionId(String s); boolean known(String fqn); }`; `declaredAt` returns natives plus model functions **without the
gates**. Three layers (#9): **boot** (built once per process, cached with `Boot`, `Compiler.java:260-306`); **graph** (built before
D; today `knownFqns` is rebuilt on every `resolve`, `NameResolver.java:398-408`); **extension** (E's lifted signatures, which today
join only at the E→F gate, `PureModelContext.java:154-167`).

**The rule is today's, extracted.** `Resolve.call(spelling, args, scope, span)` runs NameResolver's call arm (`:1733-1777`)
including the `BareNames.catalogTiered` merge; the result becomes `Legacy`. `Candidates` follows from `Legacy` exactly as the typer
expands it today: non-empty `candidateFqns` → union of `declaredAt` over them (`Typer.java:2549-2566`); else an FQN →
`declaredAt(function)`; else a signature id → that id (`:2516-2525`); else the BareNames ENGINE/CORE/FORM tiers
(`FunctionCompiler.java:35-64`, `BareNames.java:48-78`). Admission (platform-owned gate, PCT gate, dropping broken overloads)
stays in F; the typer maps ids to `TypedFunction`s through W2.1's `functionById` with today's all-broken rule
(`Typer.java:2553-2566`) until W2.8. `Candidates` is empty only when no declaration exists — exactly today's "unknown function".

| Scope | Used by | Rule |
|---|---|---|
| **Section** | user text | `NameResolver.java:258-263`: the element's section imports, `ownPackage`, type parameters, prelude |
| **Synthesized(owner)** | E | E.6's rule: `preludeOf(elementImports[owner] or none, universe)`, **no own-package tier** (`ModelNormalizer.java:168-174`, `NameResolver.java:2065-2066`) |
| **Query** | queries | `preludeOf(imports, universe)` (`:555-567`) |
| **Mint** | G | the typer's re-entry by spelling: `Legacy(spelling, [])`, `Candidates` by the expansion above |

**How E.6 goes.** E.6 exists because E mints by spelling and re-resolves afterwards, relying on the IDEMPOTENT branch
(`NameResolver.java:1734-1737`). In push 3 E mints through the Synthesized scope, takes user subtrees from
`ResolvedBodies.slot(...)` (via the converter until push 4), and `resolveSynthesized` with its universe build
(`ModelNormalizer.java:142-187`) is deleted. Hazard: E's mints call lifted functions that may not exist yet
(`UnionSynthesis.java:151`, `new AppliedFunction(memberFunction(md, m), List.of())`), so E becomes **declare-then-define**: pass 1
registers every lifted signature in the extension layer; pass 2 builds bodies.

Rewrite 1, `normalizer/MappingNormalizer.java:1149-1153` (push 3):
```java
// today
ValueSpecification source = new AppliedFunction("getAll", List.of(new PackageableElementPtr(srcFqn)));
if (pcm.filter() != null) source = new AppliedFunction("filter", List.of(source,
        new LambdaFunction(List.of(new Variable("src")), List.of(pcm.filter()))));
// push 3 — b = resolve.synthesized(md.qualifiedName()): E.6's scope, so CANDIDATES are unchanged
ResolvedExpr source = b.call("getAll", List.of(b.element(srcFqn)), null);
if (pcm.filter() != null) source = b.call("filter", List.of(source,
        b.lambda(List.of(b.binder("src")), List.of(bodies.slot(pcm.filter())))), null);   // D resolved it in its own scope
```

Rewrite 2, `compiler/spec/CallShapes.java:83-89` (push 2):
```java
// today: a bare "map" re-enters synth by name; `inner` copies candidateFqns/pos/infix by hand
String e = "_am_" + call.legacy().function().replace("::", "_");   // display name; VarId in W2.5
List<ResolvedExpr> rest = new ArrayList<>(call.args());
rest.set(0, new ResolvedExpr.Var(e, null));
ResolvedExpr inner = call.withArgs(rest).asNonDot();                   // propertyForm off, everything else copied
return t.synth(t.mint().call("map", List.of(call.args().get(0),
        new ResolvedExpr.Lambda(List.of(Binder.untyped(e)), List.of(inner), null)), null), env);
```

## 4. (D) How the typer consumes it

`TypedSpec` construction does not change; `ResolvedExpr` is input only. `synth(ResolvedExpr, Env)` keeps its exhaustive switch
(`Typer.java:142-328`). The call path takes a `Call` or a `Member(parens)` through a small shared `Applied` view (`function()`
from `Legacy`, `args()`, `candidates()`, `propertyCall()`). `Error` replays today's zero-candidate path. `Env`'s untyped aliases
(`Env.java:21,63-134`) become `Map<String, ResolvedExpr>`, keyed by name until W2.5.

**The untyped rewriters are ported in push 2, not sequenced later.** SourceSubst (262 lines), AlphaRename (56), StaticFold
(845), LambdaBodies (145), CallShapes (184) rewrite the typer's own input and re-enter `synth` (e.g. `Typer.java:724,1702,1797`).
Keeping them on `ValueSpecification` needs a back-converter inside the typer — the spelled round-trip D1 exists to kill. The port is
mechanical. StaticFold and AlphaRename (~900 lines) are later deleted by W4.2. SourceSubst is also used by D½ and the executor
(StatementInline, LiteralMapUnroll, ValidateDesugar, PlanAllocations, TestDataGenerationNatives), so its parse copy survives until
push 4 (a bounded 262-line duplicate).

**The ArchUnit rules.** `PROTOCOL_DESUGAR_DEBT` (`core/src/test/java/com/legend/ArchitectureTest.java:1210-1259`) already allows
only parser and normalizer to construct protocol nodes and pins debt rows: **23 `compiler.spec` classes, 306 constructor calls**
(of 34 classes, 387 calls). Text grep agrees: 301 `new <spec node>(` sites in 22 files, plus 62 rebuilds (`withParameters` 36,
`withChildren` 13, `mapChildren` 10, `infixRun` 3), which bytecode attributes to `protocol.spec` and the rule cannot see. Push 2
drives the 23 rows to 0 and adds a **dependency** rule: `com.legend.compiler.spec..` must not depend on
`com.legend.protocol.spec..` — violated today by **61 files** (`grep -l 'protocol\.spec'`: 57 in `compiler/spec`, 4 in
`compiler/spec/typed`), with one pinned exception (`TypeAnnotations` reads `TypeExpression.Generic.typeVariableValues`,
`TypeExpression.java:101`, owned by W2.6).

## 5. (E) VarId and binder scope (W2.5 preview)

`VarId(int body, int local)`. `body` = `ResolvedBodies.bodyOrdinal` in registration order (boot first, graph offset by the boot
count: deterministic, boot-cached bodies valid across graphs). `local` = index within the body; function parameter *i* is
`local = i`, so **`ParameterDefinition` need not change** (withdrawing the audit's suggestion; it is a model record shared with
the parser).

Implicit binders D allocates (`Scope` has no variable environment, `NameResolver.java:2042-2047`; lambda parameters only
type-resolved, `:1855-1877`): `this` for constraint and derived-property bodies (parameter 0 of the function E lifts,
`ModelNormalizer.java:310-312,330-332`, so E reuses it by construction); service-lambda parameters (become function parameters in
order, `:381-392`); `$src` in M2M filters and bindings (`MappingNormalizer.java:1152`; `ClassMapping.java:501-508`); the parser's
`_path` and `_gf<n>` (`SpecParser.java:2797,2858,3419`); let binders (today a `CString` recognised by spelling,
`Typer.java:268-285`; W2.5 gives `let` a binder).

Fresh supply: a counter per body on the minting side — E's builder for a lifted body; the typer for the body it types (e.g. the
`_am_` binder); ValidateDesugar's `this` (`validation/ValidateDesugar.java:347-369`); StatementInline's `_s<N>_`
(`compiler/StatementInline.java:184`). G½ freshens ids on every copy into the caller's body (#13).

Names stay as display fields in W2.3a: every substitution engine keys on names (`Env.java:20-21,109-134`, SourceSubst,
AlphaRename, StatementInline, `UserCallInliner.java:1167`, `RelationReads.java:183-190`, `XStorePureEnds.java:285-300`, H and I);
rule 0.5 (the key changes in its own push); diagnostics and the differential print names.

## 6. (F) The push sequence for W2.3a

Prerequisites: W1.2 (the sink), W1.6 (the typer split; makes push 2 tractable), W1.1, W2.1 (with `functionById`), W2.2. The
**site key** for CANDIDATES rows is (body key, span, source spelling) for parsed calls; mints (no span) compare as a multiset of
(body key, simple spelling, id set). Today's probe keys by spelling (`Typer.java:2534-2539`, `DecisionProbe.java:118`), which
changes for the 962 single-match rewrites.

| Push | Content | Gate | Sessions |
|---|---|---|---|
| **1. Types, builder, converter, shadow** | `compiler_resolved`; `Resolve`; `FromParse` (D's output with `candidateFqns` → `ResolvedExpr`); no reader uses them. Under `LL_SHADOW` the probe records: (a) converter ids vs `candidatesOf` ids per site; (b) builder(Synthesized) vs E.6 per E-mint; (c) boot-body calls whose set against the boot index differs from the set at typing time (#10); (d) `Error`-shaped (zero-candidate, non-dot) calls that type today; (e) `ResolvedNames.referents` vs FQNs(`Candidates`). | Chain green; no behaviour change; receipt with (a)=(b)=0. (c), (d), (e) feed G2, G4 and W2.3b. | 1 |
| **2. The typer reads `ResolvedExpr`** | Converter at the typer's entries (`FunctionCompiler.compile` body, `ClassCompiler` `defaultValue`, callers of `typeExpression`/`typeQueryBody`: `Compiler`, `StatementExecutor`, `AggregationAwareRouting`); the §1 fields; `Env`; the 5 rewriters; G's 301 mints and 62 rebuilds through the Mint builder; the 4 HIR payloads plus testdatagen and lineage readers. | CANDIDATES by (site, set) identical to push 1; PICK identical; rosters by name and class; product-SQL snapshot byte-identical; goldens unchanged; reference lane not grown; `compiler.spec` debt rows 0; dependency rule green with its one exception. | 2–3 |
| **3. E builds `ResolvedExpr`; E.6 deleted** | E's 294 mints in 12 files (MappingNormalizer 88, RelOpTranslator 59, JoinChainEmission 44, ViewRelation 38, …) plus 7 `withParameters`, 9 `mapChildren`, 5 `infixRun` through the Synthesized builder; declare-then-define; `ResolvedBodies` with the extension layer (lifted bodies by `FunctionId`, read by F first); user subtrees via the converter. | As push 2, plus mapping-heavy goldens; `normalizer` leaves the rule's allowed constructors; a quiet corpus timing (E.6's universe build was once 13–15% of the lane, `ModelNormalizer.java:151-156`). | 2 |
| **4. D emits `ResolvedExpr`; converter deleted** | NameResolver's body walk (`resolveVs` `:1672-1846`) writes `ResolvedBodies` (boot table cached with `Boot`) and stops rebuilding body fields (removes the `:1147-1156` rebuild path); the D½ chain ported (StatementInline, ValidateDesugar, LiteralMapUnroll; `Compiler.java:869-889`) and `PlanAllocations:370-470`; `ResolvedNames` reads `Legacy`; `candidateFqns`, the IDEMPOTENT branch, `FromParse` and the parse SourceSubst deleted; zero declarations produce `RESOLVE_NO_FUNCTION` in the sink plus an `Error` node; a new ArchUnit rule: the 19 body accessors are called only from parser, protocol, model, NameResolver and the emitters. | CANDIDATES identical; rosters identical (`Error` replays today's failure); the new diagnostic count reported against the UNKNOWN-FN baseline (21 names, 410 census failures) — D10's number; NameResolver debt row 0. | 1.5–2 |

**W2.3a totals 6–8 sessions.** D10's switch (failing on undemanded poison) is its own push after W2.3a (G4).

## 7. (G) Rulings (ruled 2026-09-29: 1, 3 and 6 as revised above; 2, 4, 5 as written)

1. **A side table rather than generic records.** Recommended: the side table (§1). Cost: javac no longer finds stale reads of the
   parse body fields; push 4's accessor rule does. Generic records give javac that proof at 169 files now.
2. **Candidate sets frozen at resolution (#10).** If push 1's count (c) is 0, freeze. Otherwise those rows are graph overloads at
   FQNs a boot body calls; the reference (which compiles the platform first) would not see them either. Either (i) take the
   reference's semantics in push 4 with those rows explained, or (ii) keep typing-time expansion for boot-body calls until W2.3b.
3. **`Legacy` strings on `Call` and `Member` during W2.3a** (18 `CoreFn.of`, 31 `ResolvedNames`, 85 `.function()` reads in
   `compiler/spec`). Unifying the four bare-name rules is a semantic change (count (e)), so it belongs to W2.3b. This bends "no
   string identity" for one wave, under a shrink-only guard.
4. **Decouple D10 from W2.3a.** With `Error` replaying today's failure lazily, W2.3a needs no D10 ruling; D10 becomes a separate
   flip whose size push 4 measures.
5. **Port StaticFold and AlphaRename (~900 lines W4.2 deletes) rather than bridge them.** Recommended: port.
6. **Identity keys for non-function slots.** The alternative, structural keys, fails uniqueness on mapping bindings (§1).

## 8. Audit findings answered
#1 → §1. #2 → §3 (E.6 deleted in push 3; declare-then-define). #3 → §4 and push 2. #4 → §2 (`Member.asFunction`). #9 → §3 (three
layers). #11 → §5. #14 → `ElementRef`/`EnumRef`, `Binder.type`, `TypeArg.Named`, `New.classFqn`, `MappingCast.classFqn` are the
W2.6 sites; kinds: Class, Enum (+ value, re-checked by D), function-by-id and unit (`NameResolver.java:1711-1727`), Package,
Profile, Store/Mapping/Runtime, the multiplicity constants. #15 → trees hold only FQN strings and `FunctionId`; `VarId` is
body-scoped; the boot table is shared across graphs. #20 → `New`/`Copy`/`MappingCast`; the `.all` form stays a `Call`. #21 → §2
flags.
