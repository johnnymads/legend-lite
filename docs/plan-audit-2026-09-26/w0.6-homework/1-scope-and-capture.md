# W0.6 homework 1 — let scope (`LowererLetScopeTest`) and match capture (`InlinerMatchCaptureTest`)

Read-only homework, drafted by a subagent at `compiler/rebuild` @ `89dc45871` and persisted verbatim by the parent session
(2026-09-29). Everything was traced in code; no test was run (`//core:core_tests` is one package-wide `junit_test`,
`core/BUILD.bazel:318-333`, with no per-class target). Symptom values come from the pins; "hazard" = mechanism found in
code, not reproduced. Paths under `core/src/main/java/com/legend/` unless stated.

---

## Bug 1 — a query-level let shadows a same-named lambda parameter in the lowerer

### Symptom and the pin
`core/src/test/java/com/legend/lowering/LowererLetScopeTest.java` (`@KnownDefect(owner="W2.5")`):
- `|let x = 10; [1, 2, 3]->map(x | $x + 1);` → `[11,11,11]`, expected `[2,3,4]` (:48).
- `|let x = 10; [1, 2, 3]->filter(x | $x > 1);` → wrong (expected `[2,3]`, :56; by the mechanism below the predicate is
  `10 > 1` for every element, so all three return).
- Controls (no let; `let y = 10`) pass (:46-47).

### Root cause — the chain
1. **The inliner gets it right.** `UserCallInliner.inlineBody` (`UserCallInliner.java:152-181`) β-reduces the query lets
   through `scope`; at query level `literalArms` returns empty (:883), so the map lambda goes to `case TypedLambda l ->
   lambda(l, env)` (:1245) with non-empty env `{x:10}`; `bind` (:1435-1448) does `scope.put(name, new TypedVariable(name,
   info))`, shadowing `x`. The body leaves the inliner as `[1,2,3]->map(x|$x+1)`: unchanged, correct.
2. **The let is re-seeded.** `inlineBody` also records the consumed lets: `queryLets.putAll(scope)` (:179), copied into
   `env.queryLets()` (`StatementExecutor.java:296`, `:2322`). The execute path then lowers
   `SeedableLets.withSeedableLetPrefix(body, env.queryLets(), ctx)` (`StatementExecutor.java:2186-2188`), which prepends
   `TypedLet(x, 10)` because `10` trial-lowers (`SeedableLets.java:34-50`).
3. **The lowerer's flat map is read before the lambda scope.** `Lowerer.lower(List)` does `letBindings.put(let.name(),
   scalar(...))` (`Lowerer.java:289`) into `private final Map<String, SqlExpr> letBindings = new HashMap<>()` (:194).
   Inside the map lambda, `$x` hits:
   ```java
   case TypedVariable v -> {                       // Lowerer.java:2790
       SqlExpr bound = letBindings.get(v.name());
       yield bound != null ? bound : Objects.requireNonNull(columns.resolve(v.name(), null), ...);
   ```
   The lambda's own scope, `LambdaBinding.lambdaResolver` (`LambdaBinding.java:69-78`, "ALL its parameters shadow"), is
   `columns` here and is consulted only on a miss, so `$x` → `IntLit 10`. The same order holds for property reads:
   `case TypedPropertyAccess p when p.source() instanceof TypedVariable v && letBindings.containsKey(v.name())`
   (`Lowerer.java:2588-2597`) returns `StructGet(bound, prop)` / a dotted `PlanParam` before the column arm at :2599.

**Mechanism in one line:** the let map is a side table consulted *ahead of* the resolver chain rather than the
*outermost link* of it, so every lambda binder loses to any let, plan parameter or expression-position let of the same
spelling.

### Every other site of this defect class (name-keyed lookups that ignore lambda binders)
| site | what | status |
|---|---|---|
| `Lowerer.java:269`, `:274` `bindPlanParam` → `letBindings` | a plan parameter spelled like a lambda param resolves to `${name}`; called from `StatementExecutor.java:579` (plan-text path) | hazard |
| `Lowerer.java:2947-2951` `case TypedLet l` (expression position) | writes the global map, never removes: leaks to later siblings and out of its lambda, and shadows later binders | hazard; reachability unknown |
| `resolver/SubQueryLift.java:74-83` | under a lambda, `$v.prop` with `letBindings.containsKey(v)` is read as the let's getAll chain; `uncorrelated(chain, letBindings.keySet())` (:80, :90) treats a *shadowed* name as a let, so a correlated read of a lambda param can lift as uncorrelated | hazard |
| `resolver/TemporalFrame.java:2647-2660` `normalizeContextDate` | resolves `$d` / `$d->toOne()` through `letEnv` (shared with `StoreResolver.letBindings`, `StoreResolver.java:91`, `:196`, `:2773`); a milestoning date that is a lambda parameter spelled like a let takes the let's date | hazard |
| `plan/RelationalMapperRenames.java:97` `queryLets.get(var.name())` | same flat lookup; sees only postprocessor-config args (top level), so a lambda binder can hardly reach it | low |
| `StoreResolver.java:96-100` `letBound` | same shape, **no callers** (dead) | dead |
| `resolver/JsonSourceFrame.java:64` | `${name}` string placeholders; not lexically scoped by lambdas | not this class |

Correct already, which is why only some paths fail: the typer's `Env.with` drops a let alias when a binder shadows it
(`compiler/spec/Env.java:44-54`); the inliner's `bind`; `StatementExecutor.spliceHook` guards with the inliner's `bound`
set (`UserCallInliner.java:83-88`, `:1117`); `SourceSubst.substitute` stops at shadowing lambda params and lambda-local lets
(`SourceSubst.java:185-203`). Only the lowerer's and the store resolver's let environments ignore binders.

### Principled fix — the lets become the outermost link of the resolver chain
Keep one ordered map (plan params first, then query lets in order) but consult it only when every inner scope misses:
1. A final `ColumnResolver queryScope()` in `Lowerer`: `var == null` → `null`; unbound → `null`; `prop == null` → the
   bound expr; else the dotted `PlanParam` / `StructGet` (the body of arm `:2588-2597`, moved). Keep the field `final`
   (no CodeShape mutable-field register row needed).
2. Delete arm `:2588-2597`; reduce `:2790-2795` to `columns.resolve(v.name(), null)`.
3. Every **root** resolver delegates its miss to `queryScope()` before its loud throw: `Lowerer.java:289` (the let value's
   resolver; lets may read earlier lets), `:377`, `:488` (scalar query roots), `noScope()` `:3206-3212`, the join
   condition `:2142`, `scopedResolver` `:1690-1709` (after `outers`, before `UnfoldableRef`), and the roots in
   `JsonEmission`, `InstanceProjection`, `CollectionRelations`, `RowGetters` (not inspected). `lambdaResolver` /
   `foldResolver` already check their own params first and go outward, so shadowing becomes structural.
4. The `:2947` expression-position `TypedLet` must not write the outermost scope: first count its hits in the chain
   (probe before switch); if none, make it a loud error; otherwise the containing statement sequence threads a layered
   resolver.
5. SubQueryLift: replace `boolean underLambda` in `walk` (:57-101) with the set of binders in scope (`nowUnder` → `bound ∪
   l.parameters()`); a let counts only if not in that set; the same for the `uncorrelated(...)` seed set.
6. TemporalFrame: the frame does not see enclosing binders at the date position; whether they can be threaded there is
   not verified — if not, this one waits for W2.5.

Safe because a root missed fails loudly ("unresolvable variable" / `UnfoldableRef`), never silently wrong (AGENTS.md
invariant 4); invariant 2 is untouched (scope plumbing, not typing).

**Correct today or only after W2.5?** Today. Name-keyed lexical scope with innermost-first lookup is exactly Pure's
scoping. Two caveats: (a) it is only as sound as the tree it reads — once an upstream pass captures a name (bug 2), a
correct-by-name lookup yields the wrong meaning, so **bug 1's fix lands after, or with, bug 2's**; (b) after W2.5,
`VarId` makes even the flat map correct (a let and a lambda param get distinct ids); the chain structure stays, only the
key changes. Variables are binders, not declarations, so this is not "string identity for declarations" in the D14 sense;
D2 schedules their ids for W2.5 — the reviewer's reading, for the owner to rule.

### Blast radius
- Tests: a perl scan of every test file for a let name reused as a lambda param within 8 lines found only the two pins
  and `SourceSubstTest.java:87` (source-level, unaffected). External PCT/engine corpora not scanned.
- SQL goldens: change only where the bug fired (a let read lowers to the same `SqlExpr` through the new path).
- Guardrails: `CodeShapeGuardrailTest` — `scalarStructural` spans `Lowerer.java:2652-2896` (244 lines vs the 250 limit
  at :37); the fix removes lines. Any new *non-final* field would need registering. `ErrorShapeGuardrailTest:116` pins
  `SeedableLets.java` at 1 broad catch (unchanged unless that file changes). `IdentityGuardrailTest` counts
  function-name compares only (:54-86). `JavaEvalLedgerTest` doesn't list these files. No guardrail pins line numbers of
  the touched files.

### The gate
- Both pins flip: remove `@KnownDefect`, assert `[2,3,4]` / `[2,3]`; keep the controls.
- Add (expected values; "(new)" = predicted wrong today from the code, not run): exists `|let x=10;
  [1,2,3]->exists(x|$x==2)` → `true`; forAll `|let x=10; [1,2,3]->forAll(x|$x<5)` → `true`; fold element named like
  the let `|let x=10; [1,2,3]->fold({x,a|$x+$a},0)` → `6`; fold accumulator named like the let `|let a=100;
  [1,2,3]->fold({x,a|$x+$a},0)` → `6`; sortBy `|let x=10; [3,1,2]->sortBy(x|$x)` → `[1,2,3]`; three levels `|let x=100;
  [1,2]->map(x|[10,20]->map(x|$x+1))` → `[11,21,11,21]`; a let read through a lambda still resolves `|let y=10;
  [1,2,3]->map(x|$x+$y)` → `[11,12,13]`; a let read at depth 2 `|let y=100; [1,2]->map(x|[10,20]->map(z|$x+$z+$y))`; a
  property read on a shadowed struct let (arm `:2588`) `|let p=^Pair<Integer,Integer>(first=0,second=0);
  [^Pair<Integer,Integer>(first=5,second=6)]->map(p|$p.first)` → `[5]`; a relation lambda named like a let
  (`#TDS#->filter(r|$r.col>1)` after `let r = …`); multi-statement programs (`env.queryLets` accumulates across
  statements, `StatementExecutor.java:296`); a plan-text case (a query parameter `x` plus `map(x|…)`, `:579`).
- Chain green; per-test timings read.

---

## Bug 2 — a statically dispatched match arm substitutes its input under a capturing binder

### Symptom and the pin
`core/src/test/java/com/legend/compiler/spec/InlinerMatchCaptureTest.java` (`@KnownDefect(owner="W4.2")`):
`|[1,2,3]->map(x | $x->match([i: Integer[1] | [10,20]->map(x | $i + $x)->sum()]));` → `[60,60,60]`, expected
`[32,34,36]`; control with the outer binder spelled `y` → `[32,34,36]` (:39-44).

### Root cause — the chain
1. The outer `map(x|…)` lambda runs with an empty env → `lambda()`'s no-bind branch (`UserCallInliner.java:1372-1385`).
2. `case TypedMatch m` (:1250-1259) builds `inner = env + {i ↦ $x}`:
   ```java
   Map<String, TypedSpec> inner = new LinkedHashMap<>(env);
   inner.put(m.param(), input);                 // :1254   i -> $x (the OUTER x)
   yield rewrite(m.body(), inner);              // no captureRisk pushed
   ```
3. The inner `map(x|…)` → `lambda(l, inner)` → `bind("x", …)`:
   ```java
   if (captureRisk.isEmpty() || !captureRisk.peek().contains(name)) {   // :1439
       scope.put(name, new TypedVariable(name, info)); return name; }   // keeps "x"
   ```
   `captureRisk` is pushed only by `inlineCall` (:370) and `reduceEval` (:842); outside a call frame it is empty, so the
   binder keeps `x`.
4. `$i` → `TypedVariable("x")` (:1166-1175), now under the inner binder `x`: body `[10,20]->map(x|$x+$x)->sum()` = 60.

**Mechanism in one line:** the inliner's capture check is a per-call-frame approximation (the names in the frame's
arguments); every other β-site extends the substitution env without adding the substituted term's names to the risk
set, so `bind` never renames. (The class javadoc, :48-52, says binders are renamed "unconditionally"; `bind` renames only
on risk.)

### Every other site of this defect class (substitution under binders with no capture set)
In `UserCallInliner` (env extended, nothing pushed): `TypedMatchRuntime` literal arm and single-live-arm
`:1058-1060`, `:1076-1078`; literal-list unrolls (in frames only) map `:917`, filter `:947`, fold `:985-986` (the
accumulator term too), groupBy key `:1009`; higher-order map β-reduction on a fresh env `:1323-1324`; the query-level let
scope `:174` (a let value whose free variable is a plan/query parameter `p` substituted under a `map(p|…)`).
Elsewhere:
- `lowering/MatchFold.java:66-74` `inlineParam` — shadow-aware but not capture-avoiding, and does not stop at a
  lambda-body let named like the param. β-reduction inside the lowerer.
- Source level, `SourceSubst.substitute` (`SourceSubst.java:185-203`) stops at shadowing binders but never checks the
  env values' free vars against binders, so every caller that doesn't α-rename first is exposed:
  `SourceSubst.inlineLets` (:43-55; used by the typer on every multi-statement lambda, `LambdaBodies.java:48`, plus
  `EvalChecker:114`, `MayExecuteChecker:33`, `Overloads:909`) — e.g. `x | let c = $x; [10,20]->map(x|$c+$x)`;
  `LambdaBodies.java:59`; `StatementInline.java:106-121` (renames lets, not callee lambda binders);
  `LiteralMapUnroll.java:73-86` (element vars into lambda bodies); `resolveStructuralArgs` (:65-95);
  `GraphFetchChecker:101`, `GenerateTestDataChecker:70`, `ValidateDesugar:197` (not inspected).
- Safe: `StaticFold.java:253` and `Overloads.java:339/433` α-rename first through `AlphaRename`.
- Minor hygiene gap: `reserveFreshNames` (:185-205) reserves `_iN` against the query body only; a callee binder literally
  named `_iN` that keeps its source name could collide with a minted one (not verified).

SQL-level consequence: the lowerer emits DuckDB lambdas with the Pure param names (`SqlExpr.Lambda(l.parameters(), …)`,
`Lowerer.java:2798-2799`; `Column.derived(null, var)`, `LambdaBinding.java:76`), so a capture that survives to lowering
is also a capture in the SQL text. The fix must happen at substitution time.

### Principled fix — capture-avoiding substitution (Barendregt)
Invariant: a binder `b` is renamed fresh whenever `b` is a free variable of a term substituted in the enclosing env.
1. A helper `underSubst(List<TypedSpec> terms, Supplier<T> k)`: pushes `peekOrEmpty ∪ freeNames(terms)` onto
   `captureRisk`, runs `k`, pops in `finally`. It must be a **union**: inside a frame, the frame's arg substitutions are
   still in `inner`.
2. Use it at `:1254` (match `input` and `extra`), `:1058`/`:1076`, `:917`, `:947`, `:985`, `:1009`, `:1323`, and around
   the root rewrite in `inlineBody` (:172-180, with the let values).
3. `freeNames` = the shadow-aware free-variable set, not `namesIn` (:1450-1465, which also counts binders), so renaming
   stays limited to real hazards (the plan surface prints binder names, :1427-1434).
4. `bind` unchanged. With the pin's query, the inner `x` → `_i0`, `$i` → outer `x` → 32/34/36.
5. `MatchFold.inlineParam`: route query-level static `TypedMatchRuntime` through the inliner's hygienic arm, or rename
   its inner binders on collision (a lowering-side fresh-name source is not verified to exist).
6. `SourceSubst`: give `substitute` the same check, renaming colliding lambda/let binders through a supplied fresh-name
   source (as `AlphaRename`'s `_nr` counter), or have `inlineLets`, `StatementInline`, `LiteralMapUnroll` α-rename their
   bodies first as `StaticFold` does.

**Correct today or only after W4.2?** Today. The renaming machinery exists (`bind` with fresh `_iN`, reserved at
:185-205); only the risk set is incomplete, and using the free variables of the env range is the textbook-complete
condition. W4.2 consolidates the eight inliner sites, `MatchFold` and the `SourceSubst` family into one engine; W2.5's
`VarId` makes capture impossible by construction. Neither is required for correctness.

### Blast radius
- Goldens: no test file or golden contains `_i[0-9]` or `_nr[0-9]` (grep over `core/src/test` and repo
  `*.sql|json|txt|tsv`); renames appear only where capture happened. The corpus plan-text lanes (engine-expected text)
  could differ if a real query hits a capture (not verified; the chain shows it).
- CodeShape method limit (250): `rewriteSwitch` spans `:1128-1359` (232 lines), `literalArms` `:866-1093` (228); an
  inline try/finally at eight sites would break the limit — use the helper.
- No line-number registers mention `UserCallInliner.java`; the mutable-field register rows `UserCallInliner.fresh` and
  `.configMode` are unchanged.

### The gate
- The pin flips to `[32,34,36]`.
- Add: the same with an `extra` match param; match inside a user function (frame + union), e.g. `f(xs:Integer[*]) {
  $xs->map(x|$x->match([i:Integer[1]|[10,20]->map(x|$i+$x)->sum()])) }`, `f([1,2,3])` → `[32,34,36]`; literal unroll in
  a frame `$xs->map(y|[$y]->map(e|[10,20]->map(y|$e+$y)->sum()))` → `[32,34,36]`; the fold-unroll analogue with a named
  accumulator; a query let over a parameter `{p:Integer[1]| let z=$p+1; [1,2]->map(p|$z+$p)}`; the typer-side let
  capture `|[1,2,3]->map(x|let c=$x; [10,20]->map(x|$c+$x)->sum())` → `[32,34,36]`; a three-level `x|…x|…x|` chain; a
  no-rename control (a non-colliding query's plan text byte-identical).
- Chain green; per-test timings read.

**Ordering:** land bug 2 first, or in the same push; bug 1's name-keyed scope is only sound over a capture-free tree.
