# A05 — Expression compiler (phase G + G½), `compiler/spec/` — read whole 2026-09-28

Reader's report, preserved. Tree `6ab32198d`. 82 files, 21,278 lines. Also opened to check claims:
`platform/CoreFn.java:406`, `compiler/ResolvedNames.java:24-58`, `builtin/DecisionProbe.java:79-89`, protocol.spec
record headers. Re-checked by hand on 2026-09-28: findings 5 and 6 (confirmed), finding 4's `bind` shape (confirmed).

## 1. What it is
Input: untyped `ValueSpecification` + `ModelContext`; calls are `AppliedFunction(function:String, parameters,
candidateFqns, pos, propertyCall, grouped, infix)`. Output: typed HIR `TypedSpec`, each node an `ExprType(Type,
Multiplicity)`. Entries: `SpecCompiler.compile(TypedFunction)` memoized (SpecCompiler.java:83); `typeQueryBody`,
`typeExpression` (:257-324); `UserCallInliner.inlineBody` (G½, UserCallInliner.java:152). Internals: `Typer.synth`,
exhaustive over `ValueSpecification` (Typer.java:142-328); `applyFunction`, ~15 desugars/routes before dispatch
(:460-690); `applyCore`, exhaustive over `CoreFn` → 39 `*Checker` classes (:1310-1456); `applyGeneric`/`checkGeneric`/
`checkWithDeferred` (:1465-2060); `InferenceKernel` (unify, resolve, scoring, LUB). Also in the package: typed-tree
rewriters (UserCallInliner, LiteralUnroll, NormalizeFolds); untyped rewriters (StaticFold, SourceSubst, AlphaRename,
LambdaBodies, CallShapes); ~3,390 lines of test-verdict and executor support (VerdictQueries, ResultEnvelopeSplice,
ExecuteChainAssembly, OrderView, LineageTreeLines, NativeDispatch, SeededStores, CatalogGrids, VerdictRoutes).
Imports: compiler.element 471, protocol.spec 355, builtin 189, model 34, error 27, platform 24, sql 11, values 5.

## 2. Verdict
**Construct dispatch by spelling.** `CoreFn.of(af.function())` is a string→enum map (platform/CoreFn.java:406-425),
run BEFORE overload resolution (Typer.java:561); `ReceiverOwnedFunctions` corrects by type afterwards, recognising
the model function by a first parameter NAMED `"_this"` (ReceiverOwnedFunctions.java:67). 18 `CoreFn.of(`, 26
`TdsLegacy.*.matches`, 19 `ResolvedNames.names/referents`; `referents` returns the spelling whenever it
`contains("::")` (ResolvedNames.java:25).

**Candidate collection** (`Typer.candidatesOf` :2543-2567): union of the node's `candidateFqns`, swallowing a
RuntimeException from a broken candidate (:2553-2561); else `ctx.findFunction(name)`, then `findFunctionById` on a
mangled id (:2516-2525).

**93 `new AppliedFunction(...)` minted during typing** — 63 with a literal name (`"map"`×9, `"isEmpty"`×4,
`"equal"`×4, `"project"`, `"extend"`, `"distinct"`, `"if"`, `"join"`…), the rest `Pure.Lite.TRUST_ONE`×10,
`d.bodyFunctionFqn()`×4, `CoreFn.X.parseName()`×5, `infixRun`×3. None carries `candidateFqns` or `pos`: every one
re-enters by bare-name lookup. **Five checkers throw a resolved FQN away**: `if (af.function().contains("::")) af =
new AppliedFunction("join", af.parameters())` at JoinChecker:52, ProjectChecker:44, ExtendChecker:45, FoldChecker:34,
DistinctChecker:27 (the 2-arg constructor drops candidateFqns, pos, propertyCall, infix). Qualified-property routing
takes the simple name by `lastIndexOf("::")` — 13 copies (e.g. Typer.java:545,605,1531; UserCallInliner.java:511).
`SpecCompiler.checkBody` parses the FQN (`contains("$class$")` :183; `indexOf('$')` :192). `AllVersions` suffix cut
in 5 places (Typer:654-662, 3061-3066; NewChecker:92,149; GraphFetchChecker:156). 136 `"meta::…"` literals (39 in
`.equals`), 46 `property().equals("…")`, 30 `case "…"`, 62 `callee().qualifiedName()` reads (OrderView:27-87,
NumberKinds:42, NormalizeFolds:82-105) — beside 27 `NativeFn.*.of(id)` and 68 `Pure.AT_*` id groups: two schemes.

**IR.** `synth` and `applyCore` exhaustive (good). 56 `default ->`, 5 `case null, default`; structural catch-alls
`UserCallInliner.rewriteSwitch:1357`, `LiteralUnroll.fold:360`, StaticFold ×10; `OrderView.of` (:103-214) an unswitched
instanceof chain returning DEFINED for unknown nodes. Raw `ValueSpecification` inside typed HIR
(GenerateTestDataChecker:50,82,103 → `TypedTestDataGen(args)`; CsvCensusChecker:65 stores a raw LambdaFunction). SQL
text in HIR: CatalogGrids.java:84-138 builds `SELECT … FROM information_schema…` into `TypedRawSqlRelation`
(Typer.java:1573-1581). The typer imports sql (`RawSql` Typer:1570-1571; `Json` TdsChecker:273, VerdictQueries:606,610;
`OutputCol` VerdictQueries:1099,1121; `SqlQuery` ResultEnvelopeSplice:70).

**Types.** Type variables keyed by NAME: `Bindings` is `Map<String,Type>`/`Map<String,Multiplicity>` (Bindings.java:54-55),
no fresh meta-variables; `SignatureApart` patches collisions with `'` suffixes (:76-89). Unknown column type
`TypeVar("?")` recognised by name (InferenceKernel.java:547-552), shadow multiplicity keyed `"?"+K` (:503-505). Two
unrelated "rigid"s (`Bindings.rigid` :29 contravariance; `kernel.rigidFrames` :858-873 enclosing type params). Kernel
javadoc "stateless" (:21-25) but mutable `resolving` (:852) and `rigidFrames` (:858); `UserCallInliner.instantiate`
builds a second kernel with no frames (:458). `TypeAnnotations.namedType` falls back through string prefixes
(:158-169). `TdsChecker.annotatedType` maps `"Number"` to Float (:170-172).

**Overload resolution: two algorithms, neither the reference's.** Eager (`resolveOverload` :1078-1215): arity filter;
single candidate skips scoring (:1094); additive score per parameter (type 2/1/0 ×20; multiplicity 10/9/8/6/4/2;
:1248-1263); max wins; ties through five ad-hoc breakers — same shape → first wins silently (:1133-1139), native beats
module (:1146), `mostSpecific` (:1155), Nil-bottom narrowing (:1171-1189), linearization rank (:1196) — then
"ambiguous". `scoreNonLambda` (:1226-1245) duplicates `score`. Deferred (`checkWithDeferred` :1895-1944): prefilter by
syntactic shape (`DeferredArgs.shapesMatch`) and lambda arity; rank by present args only, ties by DECLARATION INDEX
(:2167-2169); try in order and accept the FIRST that types — no re-rank; only the first failure reported (:1943). A tie
the eager path calls ambiguous is resolved silently by source order.

**Diagnostics.** 231 `new TypeInferenceException(String)`, 20 ISE, 27 NotImplemented; none with SourceInfo
(`TypeInferenceException.java:9-15` has no position constructor). Context by concatenation (SpecCompiler:107,
InferenceKernel:1280,1298, UserCallInliner:381); "positions stopgap… the deferred big lift" (SpecCompiler.java:98-100).

**Fallbacks.** Typer: broken import candidates swallowed (:2553-2566); mangled id whose base exists typed as opaque
`Function<Any>` (:2680-2692); non-bounded element multiplicity counts as `[1]` (:2757-2767); omitted multiplicity
argument → `[*]` (:3230-3233); late-bound relation mints a trusted column of any name (:3257-3259); copy vs construct by
`className().isEmpty()` (:1364-1366). Kernel: `compatibleRebind` treats Any as an escape hatch (:1949-1953); mismatched
value kinds widen to Any (:640-643); LUB of unrelated classes Any (:1672); **`unifyGeneric` falls back to
`.orElse(ag0)` and unifies the subclass's arguments POSITIONALLY (:84-101), against the comment above it** (confirmed);
unsupplied type params → Any/`[*]` (:1802-1803); resolve failures swallowed (:1809-1812); relation sources skip the
multiplicity check, variants the upper bound (:818-825). TdsErasure.java:34-38: the first relation argument's schema
replaces every TDS position. ConcatenateChecker: arity mismatch accepted, result stamped with the left schema
(:98-116), renamed right side stamped with the left's type (:113-114). EvalChecker:83-101,193-215 retries with looser
multiplicities. CallShapes:74-80 reads a TypeInferenceException as "not an auto-map". StaticFold:392 catches every
RuntimeException. UserCallInliner: NotImplemented → call left standing (:420-427); unify errors swallowed (:464-475);
all match arms kept when none live (:603,625,652). TdsChecker:259 all-empty column → String. NewChecker: `^List()`
element type → Any (:246-249); unknown supers skipped (:104-106,213-215). GenerateTestDataChecker:37-102 never
validates three natives against their signatures.

**Layering.** `System.getenv` (InferenceKernel:1291; Typer:1772,3278), `System.getProperty` (SpecCompiler:102),
`System.err` at those sites and SpecCompiler:104-105; 15 DecisionProbe calls. Mutable per-instance stacks in Typer,
kernel, TypeAnnotations, StaticFold — single-threaded by design; memo is an IdentityHashMap (SpecCompiler:48).
~3,390 lines of verdict/executor code in the type checker's package (e.g. `VerdictQueries.parseRendered` :946-1089
parses CSV and `#TDS` golden text).

**Duplication.** Three β-substitution engines (SourceSubst untyped; UserCallInliner typed `_i<N>`;
StaticFold.inlineUserCall); two α-renamers (AlphaRename `_nr<N>`; UserCallInliner.bind); three constant folders
(StaticFold — a Java interpreter over the untyped tree; LiteralUnroll; NormalizeFolds); three quote-strippers
(Typer:692,2896; InferenceKernel:541); `[0..1]`→TRUST_ONE wrap written four times (Typer:553,639,1543,3052); TDSNull
test twice (Typer:222-223,585-586; TdsNullForms:24-28).

**Dead.** `Expected.Check` never constructed in product (only SpecCompilerTest); `UserCallInliner.HAND_OFF_ON=false`
(:81) makes `spelledProgramOr` (:228-246) unreachable; `Typer.genericRawIs(Type, ClassDefinition)` (:2117) unused;
Frames unused imports (:11-12), dead comment after return (:76-82); orphan javadocs (Typer:334-338,1221-1224,2385-2386,
2774-2791,3175-3189,3360-3368; TypeAnnotations:63-83; CatalogGrids:211-214).

**Size.** Typer 3,499 (guard 3,500; DeferredArgs.java:21-22 records it was split for the guard). Longest methods:
StaticFold.evalCall 265 (451-716); LiteralUnroll.nativeFold 245; Typer.applyFunction 231; UserCallInliner.rewriteSwitch
231; UserCallInliner.literalArms 227; InferenceKernel.unify 222; Typer.accessProperty 222; ResultEnvelopeSplice.rewrite 214.

## 3. Clean-sheet and delta
Names resolved once in D (`AppliedFunction` carries `List<FunctionId>`; special forms are catalog declarations, a
FormId on the FunctionId). A separate desugar pass before typing (legacy TDS, colspec normalization, group-lambda aggs,
`toMultiplicity`, `renameColumns`, `olapGroupBy`…) that mints resolved ids and positions, once. One bidirectional typer
(`check(e,τ)`/`infer(e)`) with real check mode. Unification over fresh meta-variables (union-find with levels),
removing SignatureApart. One overload algorithm: resolver's candidates → per candidate speculatively check every
argument incl. lambdas against its instantiated signature → keep successes → unique most-specific by pairwise
applicability or "ambiguous" listing them (for this project: the reference's FEP loop exactly). Qualified properties at
member lookup, receiver first. TDS erasure as a lattice fact plus declared schema-flow on TDS-returning natives.
Diagnostics as records collected in a bag. No β-reduction during typing (all inlining in G½ over typed HIR, one hygienic
engine). Verdict/envelope/catalog-SQL code out to executor and verdict packages.
Reuse: Type/Multiplicity; checkers that are "checkGeneric then emit" (Filter, Map, Select, Slicing, Write, Aggregate,
Rename, Distinct, Over, Cast, GetAll); TypedSpec construction; LiteralUnroll's compare-never-compute folds;
SignatureApart helpers. Restructure: applyFunction's pre-dispatch chain → desugar pass; two overload algorithms → one;
Bindings → meta-variables; six qualified-property routes (qp-var :538, qp-arity :596, milestoned :649, derivedShadow
:1511, zero-arg :3012, AllVersions :3060, plus ReceiverOwnedFunctions and UserCallInliner.redispatch :492) → member
lookup; Expected made real or deleted. Delete: StaticFold (computes sums/concats/sorts — against compare-never-compute);
source-level β-expansion during typing (`inlineNormalized`, `rawSchemaErasedExpansion` Typer:1675-1794) and
AlphaRename; the 5 FQN→bare re-mints. Move CatalogGrids behind the dialect; verdict/envelope/order classes out.

## 4. Top findings
1. STRUCTURAL: typing rewrites the untyped tree and re-enters by bare name (93 mints; 25 receiver pre-synth sites re-synthesise subtrees, e.g. Typer.java:351,368,389,488 then 2823,2841). Change: pre-typing desugar pass minting resolved nodes; ArchUnit ban on `new AppliedFunction(String,…)` in compiler/spec.
2. STRUCTURAL: two overload algorithms that disagree.
3. STRUCTURAL: construct dispatch by spelling before types; `$x.join(y)` vs `f().join(y)` route differently.
4. DEFECT: capture outside call frames — `UserCallInliner.bind` renames only when `captureRisk.peek()` contains the name (:1435-1446); `TypedMatch` arm substitution (:1250-1258), higher-order map β-reduction (:1318-1326), literal map/filter/fold/match unrolls (:916-918,946-948,984-987,1057-1062) push no capture set. Example: `$x->match([p:P[1]|$l->map(x|$p.a+$x.a)])` substitutes `p:=$x` under binder `x`. Class javadoc (:50-53) claims unconditional renaming.
5. DEFECT: `unifyGeneric` positional fallback (InferenceKernel.java:84-101). CONFIRMED.
6. DEFECT: `StaticFold` folds `[a,b]->toOne()` to `[a,b]` (StaticFold.java:692-694); the interpreter swallows every RuntimeException during speculative typing (:382-396). CONFIRMED.
7. DEFECT: AST rebuilds lose information — AlphaRename.java:45-49 and StaticFold.java:119-125 rebuild ColSpec with the 5-arg constructor (drops qualified, pos, colType, colTypeMult, stereotypes, tagged values — the loss SourceSubst.java:216-228 documents fixing); 2-arg AppliedProperty rebuilds drop pos (SourceSubst:191, StaticFold:110, AlphaRename:41).
8. STRUCTURAL: no source positions in diagnostics; retry loop keeps only the first failure.
9. SMELL: TDS erasure spread over ≥6 sites (InferenceKernel:174-176,214-216,1362-1364,1384-1386; TypeAnnotations:152-163; CastChecker:33-39) plus `Typer.isSchemaErased:1632-1648` comparing bare `"ColumnSpecification"`/`"AggregateValue"`; `TdsErasure.refineResult:34-38` applied to every call output (InferenceKernel:1048-1051).
10. SMELL: dead or misleading contracts; mixed responsibilities.

Counts: Typer 3,499 / InferenceKernel 2,049 / UserCallInliner 1,538 / VerdictQueries 1,256; 39 checkers 6,083 lines;
untyped rewriters 1,495; G½+folds 2,339; verdict/executor support 3,390. Minted during typing: AppliedFunction 93,
AppliedProperty 31, LambdaFunction 37, ColSpec 29, PureCollection 30, synthetic Variable 28, `.withParameters(` 36.
`synth(` sites 131 (64 in Typer); `findFunction(` 50 (7 literal); `functionCandidates(` 15. Catches 28 (16 swallow,
retry or fall back).
