# Tractability review 1 — W0.6 pushes 1–3, dry run against the code (2026-09-29)

Read-only review at `compiler/rebuild` @ `34c49baad`, drafted by a subagent and persisted verbatim in substance by the
parent session. Nothing built or run; every "today" value is traced from the code. Paths under
`core/src/main/java/com/legend/` unless stated.

**Numbering.** The README's push-order list groups "capture, then let scope" as item 1 and the stamp as item 2; its "Push 1"
section says "the let-scope fix (bug 1) is push 2". This report follows the Push 1 section: push 1 capture, push 2 let
scope, push 3 the TypedFilter stamp. **Amendment:** renumber the README list (1 capture, 2 let scope, 3 stamp, 4 prefixes, …).

## Push 1 — capture-avoiding substitution

**VERDICT: needs amendments.** The inliner part works as written; the SourceSubst part rests on three wrong assumptions
(that it can use `FreeVars`, that a fresh-name supply is reachable, that it adds no protocol constructions); two of the eight
tests do not exercise their sites.

**What fits (verified).** The name `FreeVars` is free (`git ls-files`; only `resolver/AssociationJoins.java:2172
collectFreeVars` is similar). No new Bazel edge: `compiler/spec/typed` is not its own target (`:compiler` globs
`compiler/**` minus `element/type`, `core/BUILD.bazel:93-95`); `lowering` already depends on `compiler`, so `MatchFold` may call
`FreeVars`. ArchUnit `typedHirDoesNotDependOnCheckers` (`ArchitectureTest.java:242-248`) forbids `compiler.spec.typed` →
`compiler.spec`: `FreeVars` imports only typed nodes. The IR has what the design needs: `TypedMatch` has `param()`,
`extraParam()`, `extra()`, `children()` = `[input, extra?, body]` (`TypedMatch.java:22-50`); `TypedMatchRuntime.Arm(typeFqn,
param, body)` (`:32`); `TypedLambda.body()` is a `List<TypedSpec>` that can hold `TypedLet`s. Every UserCallInliner line ref
is exact (`:917`, `:947`, `:985-986`, `:1009`, `:1058/1060`, `:1076/1078`, `:1254/1256`, `:1324`, `inlineBody :155-181`, `bind
:1435-1446`, javadoc `:48-52`); `captureRisk` is pushed only at `:370`, `:842` (each popped in `finally`); the union rule is
right (the `inlineCall`/`reduceEval` pushes *replace* the risk set, sound because callee bodies are closed and the eval
lambda was already rewritten under the outer env); tracing the pin with the fix: inner `x` → `_i0`, `$i` → outer `x`,
`[32,34,36]`. Method ceilings fine (`rewriteSwitch` 1128-1359, 232 lines; `literalArms` 866-1093, 228; the wraps add ~8);
at `:985`/`:1009` the loop variable `acc` is not effectively final — the `Supplier` needs a local copy (`TypedSpec a0 =
acc;`). Where `TypedLet` appears: a parameterized lambda's `[let*, final]` body is folded by `SourceSubst.inlineLets` at typing
(`compiler/spec/Overloads.java:903-913`), so `TypedLet`s survive only in zero-parameter lambdas, query/function bodies and the
`multiStatement` fallback; the lowerer drops non-final lambda statements (`lowering/LambdaBinding.java:346`, `last()`).
`FreeVars` should still model lets; MatchFold's "stop at a body let" matters only for zero-parameter lambdas.

**Issues → amendments.**
1. **SourceSubst cannot use `FreeVars`:** `SourceSubst.substitute` works on protocol `ValueSpecification`
   (`compiler/spec/SourceSubst.java:185-262`), so a second free-variable function over `ValueSpecification` is needed (easy:
   `ValueSpecification.children()` exists, `protocol/spec/ValueSpecification.java:86`; binders = `LambdaFunction` parameters
   and body `letFunction` statements via `SourceSubst.letName`). Pick its home (the protocol package or a private walker in
   `SourceSubst`).
2. **No fresh-name supply is reachable:** `substitute` is `public static`, stateless, ~20 call sites across `compiler`,
   `compiler/spec`, `validation`; the `_nr<N>` counter belongs to an `AlphaRename` instance per `Overloads`
   (`Overloads.java:438`). A static counter is out (static mutable state banned outright, `CodeShapeGuardrailTest`, "NO
   allowlist"; W0.7's target; it would make binder names — which reach SQL lambda text — depend on test order); a blind `_nr`
   counter could collide with one `AlphaRename` used. **Amend:** deterministic avoidance — rename binder `b` to `b_<k>` (or
   `_ns<k>`) with the smallest `k` not in FV(env values) ∪ FV(body) ∪ the body's binder names: no state, no field, no
   register row; rename only when `b` is free in the value of an env entry the body actually reads free (keeps plan-text
   churn to real hazards). Same avoidance for MatchFold's `_m<N>` (MatchFold is all-static, no fields).
3. **`PROTOCOL_DESUGAR_DEBT` would go red:** `ArchitectureTest.java:1210-1290` counts protocol constructor calls per class
   exactly; SourceSubst's row is `10` and rows only shrink; a renamed lambda parameter needs a new `new Variable(...)`, a
   renamed let a new `new CString(...)` (≥ +2). **Amend:** protocol-package helpers (`Variable.renamed(String)`, a
   let-rename helper beside `AppliedFunction.withParameters`); classes in the protocol package are exempt (`:1270-1273`).
   Growing the row would need a user ruling.
4. **`FreeVars`' binder set incomplete:** `TypedMatchRuntime.extraParam` is node-level (`TypedMatchRuntime.java:26-29`) and binds
   in every arm body; `dynamicArms` and `extra` are *not* under a binder. `FreeVars.of(terms)` must union independent terms
   (not a statement sequence); give a separate `ofBody(List)` for sequences.
5. **Two test cases do not reach their sites and are predicted to pass today** (both expected values are arithmetically
   right): "literal unroll under a frame" — `t::g([1,2,3])` passes a spelled list, every level unrolls to literals
   (`literalArms :901-927`), the inner `y` binder is eliminated, not kept, so nothing is captured; "fold accumulator" — at query
   level literal arms are off (`:883`, `stack.isEmpty() && !verdictSource`), `:985` is never reached, and the lowerer's
   `foldResolver` already shadows `a` (whether `->toOne()` over a list_transform lowers is not verified). **Amend:** a frame
   capture needs the outer binder to *survive* (a non-spelled source). For `:917` (traced, not run): model `function
   t::g(xs: Integer[*], ws: Integer[*]): Integer[*] { $xs->map(y | [$y]->map(e | $ws->map(y | $e + $y)->sum())->toOne()) }`,
   query `|t::g([1, 2, 3]->filter(z | $z > 0), [10, 20]->filter(z | $z > 0))` → expected `[32,34,36]`, today `[60,60,60]`. For
   `:985`: `function t::k(xs: Integer[*], ws: Integer[*]): Integer[*] { $xs->map(a | [10, 20]->fold({x, acc |
   $ws->map(a | $acc + $a)->sum() + $x}, $a)) }` with `ws = [0]->filter(z|$z >= 0)`, `xs = [1,2,3]->filter(z|$z > 0)` →
   expected `[31,32,33]`, today `[30,30,30]` (traced, not run).
6. **Sites with no test:** `MatchFold`, `TypedMatchRuntime :1058/:1076`, higher-order map `:1324`, groupBy `:1009`, the
   `inlineBody` root (through `Compiler.execute` the root `underSubst` is effectively a no-op: query lets are already
   substituted; only plan parameters, `StatementExecutor.java:579`, put free variables into let values). **Amend:** add cases,
   or state in the GATES entry that these sites are covered only by the `FreeVars` unit tests plus the probe.
7. **Probe scope too narrow:** omits `//pct:pct_channel_b` (in the chain), `//spec:spec_tests`, `//spec:reference_lane`
   (SourceSubst is front-end; renames show there first). **Amend:** `bazel test //... --nocache_test_results` plus
   `//spec:reference_lane`, then grep all `test.log`. The temporary `System.err` lines turn `ObservabilityGuardrailTest` red
   (its `System.err.println` count is frozen, `:103`): expected in the probe commit, not a finding.
8. **Hazard (not verified):** graph-tree args keep their *source spelling* (the `queryLets` comment,
   `UserCallInliner.java:173-178`), and `FreeVars` cannot see string-spelled references; more renames mean more chances a
   spelled `$x` goes stale. The probe's `CAPTURE_RENAME` lines are the check.

**The Push 1 table re-checked.** All eight parse under lite's rules; an unbraced single-parameter body that starts with `let`
in a bounded context commits to multi-statement and every later statement *requires* its `;`
(`parser/SpecParser.java:1917-1957`; same shape in `pct/src/main/resources/core_legend_lite_pct/pct_adapter.pure:63`), so the
typer-side case's trailing `;` is mandatory. Precedents: extra-parameter match with an extra argument
(`integration/TypeInferenceIntegrationTest.java:368`); `{x, a | …}` fold lambdas (`PipelineStageFailureTest.java:167`); model
functions via `Compiler.execute(model, query, conn)` (`exec/LiteralChannelTest.java:29-57`).

| case | expected, recomputed | predicted today, traced |
|---|---|---|
| pin | `[32,34,36]` ✓ | `[60,60,60]` ✓ |
| extra param | `[34,38,42]` ✓ (k = x) | `[90,90,90]` ✓ |
| three levels | `[232,234,236]` ✓ (x=1: 111+121) | wrong ✓ (inner match input `$_i0` joins the risk set) |
| fold accumulator | `[32,34,36]` ✓ | **passes today** (query level; `:985` unreached) |
| unroll under a frame | `[32,34,36]` ✓ | **passes today** (binders eliminated) |
| typer-side let | `[32,34,36]` ✓ | `[60,60,60]` ✓ (via `Overloads.typeLambda` → `inlineLets`) |
| call-argument | `[7,8]` ✓ (z=6) | `[7,8]` (frame risk `{p}` + unroll removes the binder); `map` with a `[*]` body flattening not verified |
| control | `[32,34,36]` ✓ | ✓ |

## Push 2 — the lowerer's let scope as the outermost resolver link

**VERDICT: needs amendments; in practice blocked on one design decision before coding.** Report 1's list of roots misses
the largest class of root resolvers; implemented as written it can produce silent wrong answers.

1. **Sixteen root resolvers ignore the variable name**, `(v, name) -> resolveOrThrow(base, name)`: `lowering/Lowerer.java`
   `:795`, `:802`, `:833`, `:988`, `:1053`, `:1182`, `:1218`, `:1245`, `:1246`, `:1290`, `:1295`, `:1453`, `:1637`
   (`tryWindowPredicate`), `:2389`; `lowering/Sorts.java:113`, `:122` — relation-op lambdas (groupBy keys and aggregates, JSON
   leaves, window, sort). Today sound only because the `letBindings` arms (`:2588-2597`, `:2790-2795`) run *first*. Once
   deleted, a let or plan-parameter read inside them reaches `resolveOrThrow(base, null|prop)` (`:1663-1677`): with a
   single-column base a bare `$p` becomes *that column* (silent wrong answer); `$p.first` resolves a same-named column;
   otherwise `UnfoldableRef` → the isolate path → a loud failure (corpus LOST). Plan parameters (`bindPlanParam`,
   `StatementExecutor.java:579`) are the live population. Several sites receive only a body, never the lambda
   (`aggSelectorBody` near `:1182-1295`, CalendarAgg at `:795`), so parameter-awareness means threading parameters through.
   **Amend — choose before coding:** (a) a `rowResolver(base, params, outer)` helper replacing all 16 sites (own parameter
   against the base, any other variable outward to `queryScope()`); or (b) the Barendregt convention at the lowering
   boundary: one typed pass before `lower()` α-renames every lambda binder whose name is a seeded let, a plan parameter or an
   expression-position let, reusing push 1's `FreeVars` and renaming; the flat map then becomes sound with no resolver
   changes; plan text changes only for queries that were wrong before. (b) is far smaller; (a) is the structure report 1
   describes; the owner should rule.
2. **Classification of the other roots** (by grep; RowGetters and JsonEmission not read in full): throw roots that should
   delegate to `queryScope()`: `Lowerer.java:289`, `:377`, `:488`; `noScope()` `:3206-3212` (also used by
   `CollectionRelations.java:120,230`); `Pivots.java:82`; `InstanceProjection.java:101`. Parameter-aware roots needing a
   `queryScope()` fallback before they return null/throw: `:590` (`leftCols` → null → `requireNonNull` NPE message), `:1622`,
   `:2142`, `scopedResolver :1684-1709`, the enclosing pushes at `:594` and `:3138`, `CollectionRelations.java:52`. Nested
   resolvers, already correct: `LambdaBinding.lambdaResolver :69`, `foldResolver :90`, `mapElemResolver :270`, `stamped :310`.
   `JsonEmission` passes the caller's `columns` through (not a root).
3. **Two forks to decide up front:** the `:2947` expression-position `TypedLet` (loud error or a layered resolver, per a probe
   count); `TemporalFrame.normalizeContextDate` (now `:2641-2660`, moved from `:2647`; report 1 says "if it cannot be threaded,
   it waits for W2.5"). Record the default for each so a session does not stop midway. `SubQueryLift` step 5 lives in
   `resolver` (`walk :57-101`, `underLambda :58/67/86/99`).
4. **Test gaps:** the depth-2 let read `|let y=100; [1,2]->map(x|[10,20]->map(z|$x+$z+$y))` needs its expected value:
   `[111,121,112,122]`; the relation-lambda case (`#TDS#…` after `let r = …`) has none (a relation-valued let is probably not
   seedable, `SeedableLets.java:34-50`, so it may not fail today; not verified); the plan-text case names no harness. The
   other expected values are right (exists `true`, forAll `true`, both folds `6`, sortBy `[1,2,3]`, three levels
   `[11,21,11,21]`, the Pair case `[5]`, today `[0]`). **Add** a plan-parameter read inside an `extend`/`groupBy` lambda over a
   single-column base (the silent case in item 1).
5. **Ordering is correct:** after push 1, bug 1's literal let values have no free variables, so the inliner still keeps `x` and
   the push-2 tests still fail first.

## Push 3 — the TypedFilter stamp

**VERDICT: implementable, with one amendment on scope.** Verified: `Substitution.java:2057-2062` → `f.withChildren(List.of(
rewrite(f.source()), rewriteLambdaBodyOnly(f.predicate())))` (`withChildren` casts to `TypedLambda`, which
`rewriteLambdaBodyOnly` returns; the stamp is kept, `TypedFilter.java:41-47`); the CORRELATION stamp set at `:3264-3266`; the
lowerer's consumers `Lowerer.java:1502`, `:1531`; no record deconstruction pattern `TypedFilter(...)` exists, so deleting the
constructor breaks only `new` sites; method length at `:2061` unchanged. **Scope is larger than report 2's table: 46 calls to
the 3-argument constructor in 17 files**, none in tests or other modules — `:compiler` (2): `FilterChecker.java:19` (the user
path), `ResultEnvelopeSplice.java:417`; `:resolver` (44), about 25 classified by report 2; unlisted: `ChainDispatch.java:112`,
`:219`, `:296`; `ClassSources.java:967`; `CorrelatedSubselects.java:2174`, `:2200`, `:2265`; `ElementReferences.java:119`;
`GraphEmission.java:1559`, `:1684`, `:2426`, `:2617`; `Pipelines.java:709`; `StoreResolver.java:1294`, `:3256`;
`Substitution.java:614`, `:682`, `:1127`, `:2815` (outer), `:3308`; `SyntheticHeads.java:186`. **Amend:** one rule for all
46 — a site rebuilding an existing filter `f` uses `f.stamp()` or a `rebuilt(...)` factory; a new filter writes its stamp
explicitly with a one-line reason. **Needs a decision (not verified):** `Substitution.java:614`, `:682`, `:1127` build EXISTS
subqueries whose predicate is a constructed equality (`tPred`/`qPred`) stamped NONE, so they lower null-safe — check whether
that equality is correlation or user semantics; `:3308` (`cfCorr`) is a user chain predicate (NONE correct).

## Found in passing (outside pushes 1–3; not run; suspects for the W0.6 list)

- **MatchFold may pick the wrong arm:** `MatchFold.fold` chooses the first *statically* conforming arm and skips arms that are
  strict subtypes (`lowering/MatchFold.java:36-40`, `staticConforms :48-63`). Example: `[1, 2.5]->map(x|$x->match([i:Integer[1]|0,
  n:Number[1]|1]))` becomes a runtime match (`MatchChecker.java:158-170`), is not unrolled at query level, and reaches
  `Lowerer.java:3197` with the Number arm for every element → `[1,1]`; Pure gives `[0,1]`.
- **MatchFold never binds `extraParam`**, so an extra-parameter read falls through to the row resolvers.
- **MatchChecker keeps only the last branch's second parameter name** (`MatchChecker.java:199-201`); arms spelling it
  differently leave earlier arms reading an unbound name.
