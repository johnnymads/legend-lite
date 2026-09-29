# Meta-audit lens 1 — a compiler engineer's view of the plan (compiler/rebuild at ee7617ec8, 2026-09-29)

Read-only review, persisted by the parent session. Paths relative to `core/src/main/java/com/legend/` unless they start
with `docs/` or `tools/`; anything not opened by the reviewer says "not verified".

## Verdict

The plan diagnoses the code correctly and its verification culture is better than most production rewrites: the
reference differential from the pinned jars, probe before switch, one variable at a time, the product-SQL snapshot, stage
targets enforced by Bazel/javac. The front end is textbook and sound: a distinct resolved tree with candidate
declaration-id sets, `Member(name)` resolved in the typer, `VarId` for binders, collect-all diagnostics with poison nodes
and speculative scopes.

Against rustc, Roslyn, Scala 3, GHC and Calcite it has three structural weaknesses:
1. **The typed HIR is the wrong shape to build the middle on.** 77 kinds mix surface forms with query operators. The
   plan's fix (W3.6 + D11) splits kinds further and adds a relational skeleton only after store resolution. The expert
   shape: a small uniform typed core that matches the reference call for call, then an explicit "algebraize" step into a
   relational/scalar IR before store resolution.
2. **The typed tree records no instantiation**, so G½ is quietly a second typer: it re-unifies, swallows errors and
   re-runs overload dispatch.
3. **D10 promises demand-driven = compile-all without the machinery that makes that true by construction**: a memoized
   query layer with a model-level lifetime and stable node ids.

Verification holes: the DuckDB=H2 fuzzer is blind to shared bugs; nothing tests which programs must be rejected; the
verifier has no re-type-check; oracles within reach (`tools/engine-runner`) are unused. The 96–151-session serial
migration is tractable only if W4.3 gets an explicit stop/go and an early spike.

## Findings, most important first

### 1. The relational IR starts in the wrong place; D11 asks too narrow a question
- Claim: G's output is surface- and form-shaped; the plan makes it bigger (W3.6: each ambiguous kind becomes two) and adds
  the relational IR only at H's exit (W4.3 step 7, D11). Calcite and GHC make the typer's output uniform and build the
  relational algebra in a separate conversion (`SqlToRelConverter` → RelNode/RexNode; GHC's ~10-constructor Core).
- Evidence: `compiler/spec/typed/TypedSpec.java:17-79` (61 records + `TypedRelationOp`'s 16 = 77 kinds; 22 ambiguous;
  ~38 lowering sites choose by run-time type, `Lowerer.java:320`). Checkers type generically then build a form node
  (`FilterChecker.java:17-20`: `t.checkGeneric(af, env)` then `new TypedFilter(...)`). The form is chosen by spelling
  before overload resolution (`Typer.java:459-469`, `CoreFn.of(af.function())`). The reference lane's ABSENT (68,232) ≈
  AGREE (72,081); GATES says forms are most of ABSENT (`docs/GATES.md:5700-5714`).
- Why: every middle pass handles 77 kinds (the 513 `default ->` arms); the reference lane can see forms only with special
  ids; D11 asks "what type are the leaves at H's exit" when the question is "where does the relational algebra begin".
  Mappings are views; store resolution is view expansion plus navigation-to-joins, both algebra-to-algebra rewrites.
- Change: re-scope D11 to "where the relational IR begins". G emits a uniform typed core (`Call(FunctionId,
  instantiation, args)`, `Member→PropertyId`, `Lambda`, `Let`, `Var`, `Lit`, the few true special forms). A separately
  gated "algebraize" pass (between G½ and H) recognises forms by `FunctionId` (the Form row) and builds Rel/Rex over
  class-level scans; H becomes Rel(class) → Rel(tables) rewrites. This absorbs W3.6's split and W4.3 step 7. Land it as
  the plan lands its adapter, with Rex leaves = `TypedSpec` at first, but at G½'s exit. Payoffs: the reference lane
  joins every call without form ids; the lowerer's ~38 run-time checks disappear by construction.

### 2. Typed calls carry no instantiation, so G½ is a hidden second typer
- `TypedNativeCall`/`TypedUserCall` hold `(callee, args, info, pos)`, no type or multiplicity arguments
  (`typed/TypedNativeCall.java:27`, `TypedUserCall.java:21`); W1.1 puts them in a side table "not new fields". To inline a
  generic body G½ re-unifies the callee signature and swallows `TypeInferenceException` (`compiler/spec/UserCallInliner
  .java:453-479`), re-runs overload dispatch after instantiation (`redispatch`, `:485-522`), and re-stamps types by hand
  (`resolveStamps`, `:529-540`).
- Why: overload resolution and inference outside the typer, with fallbacks (AGENTS.md invariant 4); W4.2's "one hygienic
  substitution engine" would silently drop these semantics. rustc records `node_args` and substitutes; re-selection happens
  only through a specified query (`Instance::resolve`); Scala 3's inliner substitutes with a `TreeTypeMap`, never
  re-unifies.
- Change: record the instantiation for every typed call (a field, or a typeck-results table keyed by node id, finding 3);
  W1.1's side table becomes that permanent table. Redispatch becomes a named typing rule, a `specialize(FunctionId,
  typeArgs)` query, registered as a semantics decision (finding 7). W4.2 gate: G½ contains no `unify` and no candidate
  selection.

### 3. No node-identity scheme, only `VarId`
- Evidence: 36 `IdentityHashMap`s in resolver/lowering/compiler use node identity as occurrence identity (e.g.
  `resolver/StoreResolver.java:2058`); the reference lane joins by source position, which synthesised nodes lack (EXTRA
  15,825); spans were dropped from model records because record `equals` is structural (`model/FromProtocol.java:24-27`);
  H2's `ResolvedExpr` puts `span` in every record component (H2 §2), so equality now includes position.
- Change: in W2.3a, D allocates an `ExprId(body, local)` for every resolved node and the typer preserves or derives ids
  (rustc's `HirId(owner, local_id)`). Spans, typeck results and instantiations become tables keyed by `ExprId`, or spans
  are explicitly excluded from `equals`; decide in writing. W4.3 step 2's `NavPath` keys on ids.

### 4. D10 needs a query layer, and its failure unit contradicts itself
- "Demand-driven is an optimisation only … checked by running the corpus both ways" is a test, not a construction.
  Roslyn: `Compilation.GetDiagnostics()` binds every method with the same lazy binder the `SemanticModel` uses; rustc:
  memoized queries.
- Today: the typed-body memo lives on each `SpecCompiler` (`compiler/spec/SpecCompiler.java:48`), created per entry
  call (8 sites in `Compiler.java`, 1 in `StatementExecutor.java`); `Compiler.execute` recompiles the model from text per
  call (`Compiler.java:941-946`) and the server calls it per request (`server/QueryService.java:66`); `PureModelContext`
  caches are plain `HashMap`s (`:50-54`), fine only because the server is single-threaded (`LegendHttpServer.java:314`).
  "Memoized per model" needs a model-lifetime cache, which rule 0.8 forbids unless ruled.
- Inconsistency: D10 makes unknown elements eager on every path, so a typo'd class reference inside one body fails every
  query, while an ill-typed body elsewhere does not (A14: 407 of 410 failures are body-level).
- Change: a query-layer item before W2.3a push 2: named, pure, memoized queries (`parse(unit)`, `declIndex`,
  `resolveBody(id)`, `typeBody(id)`, `specialize(id, args)`, `elaborate(mapping, set)`) keyed within a model snapshot,
  each result carrying its diagnostics; compile-all = demand every body, equal by construction (keep the both-ways corpus
  run as a check). Split Knowledge errors: declaration-header references eager; references inside bodies reported in
  compile-all but poisoning only their body on user paths. Rule on rule 0.8 vs model memoization. Require deterministic
  iteration and a thread-safety contract before the server goes multi-threaded.

### 5. Two reference semantics, one oracle
- Engine input (PMCD/JSON, datacube, `/api/pure/v1/execution/execute`) resolves through legend-engine's `Handlers`: first
  passing dispatch wins, no tie error (`docs/plan-audit-2026-09-26/engine-resolution.md:36-52`). W2.3b keeps the Handlers
  namespace for engine input, but W3.3 deletes both overload algorithms for one FEP loop: engine input becomes FEP over the
  Handlers namespace, a hybrid that models neither compiler. The reference lane covers only Pure source.
- Change: a decision D13 (which selection rule engine input gets; if FEP, a registered divergence) and an engine-input
  differential lane via `tools/engine-runner` (not verified at CI scale).

### 6. Verification: complete in outline, weak in power, partly misordered
- (a) No re-type-check: W1.3 checks scoping, ids, post-conditions; Core Lint and Scala 3's `-Ycheck` re-type-check the IR
  after every pass; H hand-builds 188 `ExprType`s and 71 `TypedLambda`s nothing re-checks (A07-A08 §2). Change: a local
  type-consistency lint with a shrink-only violation set.
- (b) Hook points miss most execution: W1.3 hooks `Compiler.java:591-614, 1173-1194`, but `StatementExecutor` runs its own
  G½/H/I (UserCallInliner at `:292, 399, 454, 560, 1158, 1169, 1473, 2318`; StoreResolver `:510`; lower `:582, 2187`).
  Change: fold W1.3 + W1.5 into a small pass manager (one pipeline object running verifier, dump and timing between
  passes); W6.2 deletes the executor's copies.
- (c) The fuzzer oracle is common-mode: DuckDB=H2 shares lowering and MIR. Change: metamorphic oracles (TLP/NoREC:
  `filter(p) ⊎ filter(!p) ⊎ filter(isEmpty(p)) = all`) and an execution differential against legend-engine via
  `tools/engine-runner` on H2.
- (d) Nothing tests rejection. Change: pin "we typed, reference failed" as a bucket; import legend-pure's compile-failure
  tests as a negative corpus asserting error codes.
- (e) Golden dumps are output-only; the test pyramid is inverted (51,434 end-to-end test lines). Change: a parseable
  textual form for the typed core and the MIR (LLVM/MLIR FileCheck style tests).
- (f) A cheap soundness monitor: in every corpus run, the result's shape (columns, cardinality) matches the typer's
  `ExprType`/multiplicity.
- (g) No front-end fuzzing: extend W3.2b's matcher property test to whole expressions compiled by both legend-pure and
  lite, comparing pick, types, accept/reject.
- Order: pass manager + verifier + dumps → snapshot (W1.7) → rejection bucket → fuzzers (front-end before W3.3;
  metamorphic/engine before W4.3).

### 7. Copy the reference's semantics, not its nondeterminism
- Copy decisions exactly (picked declaration, types and multiplicities, rejection). Copy mechanism only where the
  observable decision is defined by it (lenient-order loop, `&&` short-circuit error surfacing, TIC's drop-not-merge,
  `reference-matching.md:236-247`); porting `TypeInferenceContext` (W3.3) is justified only on that ground; say so.
- Do not copy nondeterminism: ties inside the lenient order are broken by set/hash iteration order
  (`reference-matching.md:61, 73, 243`); copying it breaks W1.7's byte identity. Do not copy message text.
- Change: a deterministic tie rule of lite's own (e.g. declaration order) plus a "reference-nondeterministic" class in
  `reasons.tsv`; reference-mechanism code in one module behind an interface; a **lite semantics register**: one page of
  every deliberate divergence (D8, D10's lenient model, TDS carriers, G½'s redispatch, engine-parser precedence,
  platform-owned suppression).

### 8. Too many representations of the declarations; the H2 revision contradicts itself
- Syntax flows through Protocol `P*` records (267 in `protocol/Protocol.java`), then `model` records (converted inside the
  parser: `parser/ElementParser.java` and 6 section grammars use `FromProtocol`), and after D12 a resolved twin family.
  W1.9 moves FromProtocol to its own stage; W2.3a adds another conversion: three pre-typed representations. rustc lowers
  the AST straight to HIR. Change: design W1.9 and D12 together: D lowers Protocol syntax directly into resolved
  declarations; the unresolved `model` records retire for body-holding kinds.
- The H2 revision contradicts its sections: revision item 3 abolishes `Legacy` (H2:29-31), yet §2's type (`:157-159`),
  §3's rewrite (`:235`), §4 (`:247`) and push 4 (`:300`) still use it. Switching the 134 name readers (18 `CoreFn.of` +
  31 `ResolvedNames` + 85 `.function()`) to ids inside W2.3a means dispatching on a candidate set that can span packages:
  W3.6's form-row work, changing the rule while the tree changes (rule 0.5). `Call` keeps `String spelled`. Change: either
  keep `Legacy` under a shrink-only guard for W2.3a, or move the form-row lookup into W2.3a and re-size; fence `spelled` to
  diagnostics and printers; fix the H2 text.

### 9. Migration: tractable to W3, likely to stall in W4.3
- W2.3a push 2 carries the typer's input type, 301 mints, 5 rewriters, the readers-to-ids switch and a gate set of
  CANDIDATES + PICK + rosters + snapshot + goldens + the manual 8 GB lane in one push. W3.3 reproduces the FEP loop with
  21 catch sites. W4.3 is worst: 18–30 sessions extracting passes in place from a 35,925-line pass threading mutable
  state, holding SQL byte-identical; step 7's print-back adapter is a big bang in disguise. W4's estimate grew 10–15 →
  32–51 in one audit.
- Change: a W4 spike during W3 (one simple relational class mapping end to end through the target IR; re-size W4 from
  it); a stop/go after W4.3 step 5 (continue extracting, or build a new H by branch-by-abstraction behind a per-query
  router, judged by snapshot plus result equality); a "minimum expert core" milestone; the reference lane nightly on CI.

### 10. Missing items an expert would expect
- A semantic-model API for the IDE: the LSP only parses (`server/PureLspServer.java:147`) and guesses positions from
  message text (`:180-215`); declarations lose spans (`FromProtocol.java:24-27`). D12's resolved declarations must carry
  spans; W2/W3 define the query surface (go-to-definition from `Ref<Kind>`/`FunctionId`, hover from `ExprId`→type,
  completion from the World index).
- Performance budgets per stage (compile latency per query, model-build time at mapping scale, memory of the resolved
  family; W3.3's lambda-per-candidate typing multiplies the hottest stage's cost).
- Incremental compilation: defer, but design the query layer with it in mind.
- A stable IR printer and parser (none exist in `typed/`).

### 11. Cut, re-order, re-scope
- Cut to a second program: W5.5, W5.4, W6.4, W4.4b, W1.9's cache proof (product work, not compiler rebuild).
- Re-scope D11 (where the relational IR begins), W3.6 (uniform calls; algebraize recognises forms), W4.2 (substitute
  with recorded instantiations; redispatch a typer query).
- Re-order: pass manager and lint before any W2 code; query layer and node ids before W2.3a push 2; front-end
  differential fuzzing before W3.3; the W4 spike during W3; D13 before W3.3.

## Assumptions in the plan that are unverified
- Typing a body is independent of the order bodies are demanded (E-lifted functions with inferred return types; poison
  in overload sets, `FunctionCompiler.java:132-156`).
- The reference's picks are deterministic enough to pin (its ties break by hash order).
- SQL byte identity can hold through W4.3 steps 6–7.
- The four-push converter seam carries 169 files and the readers-to-ids switch in 9–13 sessions.
- Reference-lane type rows can be joined by position when synthesised nodes have none.
- One overload algorithm (FEP) is acceptable for engine input.
- The D11 census (leaf kinds at H's exit) is enough to choose the relational IR.
- G½ is "substitution only" (the code re-unifies and re-dispatches).
- "Memoized per model" lands without a ruling on rule 0.8.
- One owner can run the full gate set on every push for ~150 sessions without the process eating the budget.

## What an expert would say
You have built the part most rewrites get wrong: a real oracle pinned to the release, with coverage pins, and the
discipline to change one thing at a time. The front-end plan is how rustc and Roslyn are built, and copying the
reference's decisions is right for a product judged by a differential. The middle is the problem: you are preserving a
typed tree that is really three IRs in one (surface syntax, query algebra, physical plan). The fix is not more kinds and a
skeleton bolted on after the god pass; it is a small typed core that records instantiations and node ids, an explicit
algebraize step into Rel/Rex before store resolution, and store resolution as rewrites over that algebra. Wrap it in a
memoized query layer so demand-driven and compile-all are the same computation, and run a pass manager whose lint
re-type-checks every pass. Test with oracles that don't share your bugs: legend-engine execution, metamorphic relations,
rejection differentials. Spike W4 now: that is where the program either succeeds or quietly turns into maintaining two
store resolvers.
