# W0.6 homework: the wrong-results defects, root causes and fixes (2026-09-29)

Plan item W0.6 (`docs/EXECUTION_PLAN_2026_09_26.md`, rule 0b.11, D14): every reproduced wrong answer, wrong binding or
security defect is fixed now, in place, with a correct targeted fix. Four read-only homework reports, each persisted
verbatim by the parent session; each gives the root cause at file:line, every other site of the same defect class, the
principled fix, whether it is correct today, the blast radius, and the gate (the pin's assertion plus adversarial cases).

| report | defects | verdict |
|---|---|---|
| `1-scope-and-capture.md` | `LowererLetScopeTest` ×2 (a query `let` shadows a lambda parameter in the lowerer); `InlinerMatchCaptureTest` (a match arm's substitution captured by an inner binder) | both correct to fix today: lets become the outermost link of the lowerer's resolver chain; capture-avoiding substitution (free variables of substituted terms join the capture-risk set) |
| `2-correlation-and-temporal.md` | `NestedExistsCorrelationStampTest` (a rebuild drops `TypedFilter`'s CORRELATION stamp); `NavPrefixCollisionTemporalTest` (temporal maps keyed by spelled prefix miss a minted `alias_2_`); **unpinned, probed wrong rows:** a present-but-out-of-window sub row nulls the whole head match (`TemporalFrame.java:1285-1322`) | all three fixable today for the reproduced paths; the general forms are W4.3 steps 2 and 6 |
| `3-imports-mapping-servicekey.md` | `SectionImportScopeKnownDefectTest` (imports keyed by element FQN; also a cross-file last-wins variant in `Compiler.parseSources`); `SourcelessPureMappingKnownDefectTest` (an NPE on a Pure mapping without `~src`); `ServiceTestProvisionKeyTest` (CSV provisions keyed by `String.hashCode`; also three latent content-hash ids in resolver/plan) | all correct to fix today |
| `4-suspected-sql-wrong-rows.md` | the meta-audit's unreproduced SQL suspects A–I | **REAL:** A null-safe `==` chosen by operand shape (row loss; fix: the engine's multiplicity rule, `pureToSQLQuery.pure:8447-8462`); A2 ModelJoin/XStore conditions forced to plain `=` (predicted; confirm then fix with a provenance flag); H `sum`/`plus` of an empty list gives NULL not 0 (fix: `COALESCE(list_sum(x), 0)` in the two list rules). **Need a ruling:** F `splitPart` (D20), G Float literal magnitude cliff (D21). **Not defects:** B, C (labels only, W5.2), D (nondeterminism = engine; but `ANY_VALUE` missing on H2 → add a spelling or refusal), E (lite = PCT and engine; the interpreter is the outlier), I |

## Push list (rev H3: the homework dry-run against the code by `../tractability-2026-09-29/1-…` and `2-…`)

**Order (D22 and D23, ruled by the user 2026-09-29):** pushes 1 and 2 are done (GATES "Rebuild W0.6 push 1", "push 2"). The
remaining small pushes run next: 3, 7, 8, 11, 13. Then the wrong-rows tool on the stress corpus (plan §4 Phase 1 step 2). Then the
rest: 9 and the four resolver pushes 4, 5, 5b, 10 judged by legend-engine's rows (fix in place or pin for the rebuilt
resolver: decided when the tool has run), 6 and 6b by the reference lane, 12 by its repros. Push 12's repros over a mixed literal list
(`[1, 2.5]`) meet a loud DuckDB failure first (`+(JSON, INTEGER)`, with any binder names); use a `cast(@Number)`
input as `InlinerMatchCaptureTest.loweringSideMatchFoldIsNotCaptured` does, or fix that failure first.

One push per line; each gated by the full chain (plan §0 step 6), each removing its pin(s) and adding its
adversarial cases. "T1"/"T2" cite the dry-run reports; "E" the engineering decisions in `../tractability-2026-09-29/README.md`.

| # | push | report | design (decided) | tests / gate specifics | size |
|---|---|---|---|---|---|
| 1 | capture-avoiding substitution | 1 bug 2; T1 | §"Push 1" below | the table below | 1 |
| 2 | the lowerer's let scope | 1 bug 1; T1 | **E1:** a typed pass before `lower()` α-renames every lambda binder whose name is a seeded let, a plan parameter or an expression-position let (push 1's `FreeVars` and E2's renaming); the flat `letBindings` map then stays sound; the verifier rule "no binder shadows a query-scope name" lands with W1.3. The expression-position `TypedLet` (`Lowerer.java:2947`) is covered by the same pass; `TemporalFrame.normalizeContextDate` (`:2641-2660`) and `SubQueryLift.walk` (`:57-101`) are covered because the renamed tree reaches them | report 1's cases with values (exists `true`, forAll `true`, both folds `6`, sortBy `[1,2,3]`, three levels `[11,21,11,21]`, Pair `[5]`, depth-2 `[111,121,112,122]`), plus a plan-parameter read inside an `extend`/`groupBy` lambda over a single-column base (T1 #1's silent case) | 1 |
| 3 | the `TypedFilter` stamp | 2 §1; T1 | `Substitution.java:2061` → `f.withChildren(...)`; delete the 3-argument constructor; **all 46 sites in 17 files** (T1 lists them): a rebuild uses `f.stamp()` / `rebuilt(...)`, a new filter writes its stamp with a one-line reason; decide `Substitution.java:614, :682, :1127` (constructed EXISTS equality: correlation → CORRELATION) with a probe of their SQL first | report 2 §1's gate | 1 |
| 4 | prefix keys from the materialization map | 2 §2; T2 | report 2 steps 1, 2, 4, 5, 6 with T2's amendments: a prefix is "taken" only if a *different* alias minted it (union arms share `prefixes`, Pipelines.java:713-718); record `prefix → NavSlot` at mint time; step 6 after `materializeRoot`; the loud miss skips stripped aliases; step 5 (sub-hop prefixes from `NavMat.subNavs()`, the maps bundled into one record argument) is in this push | report 2 §2's gate; judge by roster files and `corpus2-{pass,fail}.txt` | 1–2 |
| 5 | the killed head match, nav channel | 2 §3; T2 | pin the repro first; count riders with a local-only stdout probe `NULLTOLERANT_RIDER <nav\|assoc> <chainHead>` inside the loop at `TemporalFrame.java:661` (T2 #2's command and join); generalise `detachSpineJoin` (a join or filter above the sub that reads the sub's columns fails loudly; hoisting-along waits for W4.3 step 6); the caller builds the plain `outerDatedCond` when there are no deferred windows (`:520-522`); delete the duplicated block (bytes change, rows do not) | report 2 §3's gate | 1–2 |
| 5b | the killed head match, association channel | T2 #1; **E3** | write the association variant of the repro (through `AssociationJoins.withOuterDatedWindow`, :530-541); if it fails, extend the hoist to its callers (AssociationJoins:276/411/1084, NavMaterializer:506, StoreResolver:2305/2542; joins built in `foldAssociationJoins` 2040-2049, 2160-2170); delete the `nullTolerant` path once no channel calls it; a shape needing W4.3's join tree is pinned (rule 0b.11) | the association repro; the rider counts per channel in GATES | 1–2 |
| 6 | section imports, as a keying change | 3 §1; T2; **E6** | `ParsedModel` carries sections opened exactly where today's code starts a new scope (an import after elements; a claimed section), so no scoping rule changes; ~24 files across `//core`, `//wasm` (`planner/Wasm.java:349`), `//spec` (MinimalCorpus.java:356-384 and others), `//pct` (ChannelB), `//parser-equivalence` (Sectionize) — T2 #1 lists them; the cross-file variant in `Compiler.parseSources` included; before the switch, list function FQNs with >1 declaration across units whose sections carry different imports | report 3 §1's gate; `//spec:reference_lane` (front-end) | 2 |
| 6b | the `###` import leak | T2 #2; **E6** | probe first: count elements that resolve only through an import inherited from a previous import-free section; then scope imports per `###` section (Pure's rule); each resolution that changes is listed | the probe receipt; moved rows explained; reference lane | 1 |
| 7 | the sourceless mapping | 3 §2; T2 | drop `nn()` at `NameResolver.java:1148` | report 3 §2's gate; reference lane | ≤ 0.5 |
| 8 | value-keyed service-test provisions | 3 §3; T2; **E7** | value records (identical CSV via a `###Data` reference and inline share a runtime, recorded); ordinal runtime names; the three latent content-hash ids pinned `@KnownDefect(owner = "W6.4")` | report 3 §3's gate | ≤ 0.5 |
| 9 | null-safe `==` by multiplicity (A) | 4 A; T2 | the engine's rule as its observable outcome (`pureToSQLQuery.pure:8447-8462`): null-safe iff both lower bounds are 0 or one side is an optional plan parameter; delete the `SqlExpr.Column` tests (`NullSemantics.java:116-123`); the failing test also asserts `IS NOT DISTINCT FROM` in the SQL — if absent, check whether `Substitution` keeps the property's `ExprType` on the replacement (T2 A #1); `isOptional`'s upper-bound-1 test vs the engine's lower-bound-0 rule matched or registered | the repro in `NullSemanticsTest`'s harness; the 24 ladder goldens; PCT lanes read | 1 |
| 10 | the equality-kind node (A2) | 4 A2; T2; **E4** | first the failing fixture (testComplexRelationFunction + a firm with NULL CITY); then two equality kinds as distinct nodes, emitted where the origin is known (store `Join` → SQL `=`; ModelJoin/XStore/user lambda → Pure total equality) through `legacyAssocPredicate`'s callers (MappingNormalizer.java:1028, :1103, XStorePureEnds:235, AssociationSynthesis.java:525), carried through merges (`pkEqualityCond`, temporal windows, the SyntheticHeads merge), consumed by the lowerer; the `verbatim` stamp and the CORRELATION-forces-`=` rule replaced; provenance via `model`/`ctx` (resolver may not depend on normalizer) | the fixture; ladder goldens reviewed; rosters | 2–3 |
| 11 | empty `sum`/`times` (H) | 4 H; T2; **E8** | `COALESCE(list_sum(x), 0)` / `COALESCE(list_product(x), 1)` for numeric returns only (the `plus` rule is also registered for `AT_STRING_PLUS`, Scalars.java:276) | the correlated `#TDS` repro | ≤ 0.5 |
| 12 | the match suspects | T1 "found in passing" | reproduce each first: MatchFold's first-statically-conforming arm (`[1, 2.5]->map(x\|$x->match([i:Integer[1]\|0, n:Number[1]\|1]))` → Pure `[0,1]`); MatchFold never binding `extraParam`; MatchChecker keeping only the last branch's second parameter name (`MatchChecker.java:199-201`) | the three repros | 1 |
| 13 | `ANY_VALUE` on H2 2.1.214 (D) | 4 D; T2; **E5** | `MIN(x)` for comparable scalar types; a `DialectCapability` refusal for JSON/ARRAY carriers; not a wrong result | an H2 test in the H2SplitPartTest pattern | ≤ 0.5 |
| — | F, G | 4 F, G | after D20 / D21; if unruled when 1–13 are done, pinned with owner D20/D21 | | |

**Number:** open wrong-results defects 14 → 0 (the pinned seven, the head match on two channels, A, A2, H, the MatchFold
arm choice and `extraParam`; the MatchChecker name case counted if its repro shows a wrong answer; D is a loud failure,
not counted).

## Facts every fix session needs (found by this homework)

- `//core:core_tests` is one package-wide `junit_test`; `--test_filter` is ignored (`tools/junit/defs.bzl:25-61`). To
  observe one test quickly, drive the jars in `bazel-bin/core/core_tests.runfiles` from jshell (plan §0 step 7 has the
  command), or run the whole target.
- A passing `@KnownDefect` test means the defect is still present (`core/src/test/java/com/legend/testing/KnownDefect.java`);
  the latest junit XML under `bazel-testlogs/core/core_tests/` shows which pins currently hold.
- None of the touched files is pinned by line in the guardrail registers; the method-length ceiling (250,
  `CodeShapeGuardrailTest.java:37`) is the tight constraint in `Lowerer.scalarStructural`, `UserCallInliner.rewriteSwitch`
  and `literalArms`, `TemporalFrame.applyJoinTemporalFilters`, `Substitution.rewrite`; add helpers rather than inline
  blocks. `ArchitectureTest.PROTOCOL_DESUGAR_DEBT` counts protocol constructor calls per class exactly and only shrinks:
  construct protocol nodes through protocol-package helpers.
- A temporary probe that prints to `System.err` turns `ObservabilityGuardrailTest` red (its count is frozen): expected in
  a local-only probe commit, never pushed.

## Push 1: capture-avoiding substitution (fully specified; amended by the dry run T1)

**Scope.** Report 1 bug 2, in all three substitution engines, so that no substitution anywhere can capture. The let scope
is push 2. Decisions (engineering; the principled design per rule 0b.11, "a correct targeted fix"):

1. **Two free-variable functions**, one per tree: `compiler/spec/typed/FreeVars.java` over the typed tree (the name is
   free; `compiler/spec/typed` is inside the `:compiler` target, so no Bazel edge; it imports only typed nodes, as
   `ArchitectureTest.typedHirDoesNotDependOnCheckers` requires) and a walker over the protocol `ValueSpecification` for
   `SourceSubst` (private to `SourceSubst`, or in the protocol package). Typed binders: `TypedLambda` parameters; a
   `TypedLet` binds its name for the later statements of the same body; `TypedMatch.param()` and `extraParam()`; each
   `TypedMatchRuntime` arm's parameter and the node-level `TypedMatchRuntime.extraParam` (binds in every arm body;
   `dynamicArms` and `extra` are under no binder). `FreeVars.of(terms)` unions independent terms; `FreeVars.ofBody(list)`
   treats a statement sequence. Protocol binders: `LambdaFunction` parameters and body `letFunction` statements (via
   `SourceSubst.letName`). `resolver/AssociationJoins.java:2172 collectFreeVars` is not reused (layer); a note there.
2. **`UserCallInliner`**: `underSubst(List<TypedSpec> terms, Supplier<T> k)` pushes `peekOrEmpty ∪ FreeVars.of(terms)` onto
   `captureRisk` and pops in `finally`; applied at the `TypedMatch` arm (:1254/1256, input and extra), `TypedMatchRuntime`
   (:1058/1060, :1076/1078), the literal unrolls (:917, :947, :985-986 with the accumulator term, :1009 — copy the
   non-final `acc` to a local before the lambda), higher-order map (:1324), and around the root rewrite in `inlineBody`
   (:168-183). `bind` (:1435-1446) unchanged; the class javadoc (:48-52) corrected ("renamed when a substituted term
   mentions them").
3. **Renaming without state (E2):** a colliding binder `b` becomes `b_<k>`, the smallest `k` such that the name is not free
   in the env values or the body and is not a binder of the body — no counter, no field, deterministic (binder names reach
   SQL lambda text). Rename only when `b` is free in the value of an env entry the body actually reads free. The same rule
   in `SourceSubst.substitute` (`compiler/spec/SourceSubst.java:185-262`, `public static`, ~20 callers) and in
   `lowering/MatchFold.inlineParam` (:65-74; also stop at a lambda-body let named like the parameter). New protocol nodes
   through protocol-package helpers (`Variable.renamed(String)`, a let-rename helper beside
   `AppliedFunction.withParameters`) so `PROTOCOL_DESUGAR_DEBT`'s `SourceSubst` row (10) does not grow.

**Probe (rule 0b.2), local only, never pushed.** A temporary commit makes each engine print `CAPTURE_RENAME <site>
<binder>` to stderr whenever the new rule renames where the old one would not; run `bazel test //... --nocache_test_results`
plus `bazel test //spec:reference_lane`; collect the lines from every `bazel-testlogs/**/test.log` into the receipt
`rebuild-W0.6-p1-probe-<sha>/`. Expected: hits only from the new tests' queries; every other hit is a latent wrong answer
this push also fixes, listed by test in the GATES entry. `ObservabilityGuardrailTest` goes red in this commit (expected).
Graph-tree arguments keep their source spelling (`UserCallInliner.java:173-178`), which `FreeVars` cannot see: any
`CAPTURE_RENAME` in a graph-fetch test is examined by hand. Then drop the local commit (`git reset --hard HEAD~1` after
checking `HEAD` is that commit).

**Tests** (`core/src/test/java/com/legend/compiler/spec/InlinerMatchCaptureTest.java`, DuckDB only — the capture happens
before SQL; `values(query)` as in the file, plus `values(model, query)` in the `exec/LiteralChannelTest.java:29-57`
pattern). Expected values recomputed by T1; "today" traced:

| case | query | expected | today |
|---|---|---|---|
| the pin | `\|[1,2,3]->map(x \| $x->match([i: Integer[1] \| [10,20]->map(x \| $i + $x)->sum()]));` | `[32, 34, 36]` | `[60, 60, 60]` |
| extra parameter | `\|[1,2,3]->map(x \| $x->match([{i: Integer[1], k: Integer[1] \| [10,20]->map(x \| $i + $x + $k)->sum()}], $x));` | `[34, 38, 42]` | `[90, 90, 90]` |
| three levels | `\|[1,2,3]->map(x \| $x->match([i: Integer[1] \| [10,20]->map(x \| $x->match([j: Integer[1] \| [100]->map(x \| $i + $j + $x)->sum()]))->sum()]));` | `[232, 234, 236]` | wrong |
| unroll under a frame (`:917`) | model `function t::g(xs: Integer[*], ws: Integer[*]): Integer[*] { $xs->map(y \| [$y]->map(e \| $ws->map(y \| $e + $y)->sum())->toOne()) }`, query `\|t::g([1, 2, 3]->filter(z \| $z > 0), [10, 20]->filter(z \| $z > 0))` | `[32, 34, 36]` | `[60, 60, 60]` |
| fold accumulator (`:985`) | model `function t::k(xs: Integer[*], ws: Integer[*]): Integer[*] { $xs->map(a \| [10, 20]->fold({x, acc \| $ws->map(a \| $acc + $a)->sum() + $x}, $a)) }`, query `\|t::k([1, 2, 3]->filter(z \| $z > 0), [0]->filter(z \| $z >= 0))` | `[31, 32, 33]` | `[30, 30, 30]` |
| typer-side let (SourceSubst) | `\|[1,2,3]->map(x \| let c = $x; [10,20]->map(x \| $c + $x)->sum();)` (the trailing `;` is mandatory, `parser/SpecParser.java:1917-1957`) | `[32, 34, 36]` | `[60, 60, 60]` |
| call-argument (regression guard) | model `function t::f(p: Integer[1]): Integer[*] { let z = $p + 1; [1, 2]->map(p \| $z + $p); }`, query `\|[5]->map(p \| t::f($p))` | `[7, 8]` | `[7, 8]` |
| control | the pin with the outer binder spelled `y` | `[32, 34, 36]` | `[32, 34, 36]` |

Plus unit tests of both free-variable functions (each binder kind shadows; a let binds only later statements;
`TypedMatchRuntime.extraParam` binds in every arm). Sites with no end-to-end case (`MatchFold`, `TypedMatchRuntime`
:1058/:1076, higher-order map :1324, groupBy :1009, the `inlineBody` root — a no-op through `Compiler.execute`, since only
plan parameters put free variables into let values) are covered by those unit tests and the probe; the GATES entry says so.
If a spelling is refused by the parser, fix the spelling, never the expectation, and record it.

**Gate.** The pin removed and asserting `[32, 34, 36]`; the table green; the probe receipt saved; `bazel test
//core:guardrails //core:census //parser-equivalence:parser_parity //spec:spec_tests`, then `bazel test //...` and
`bazel test //tools/deps:all`; `bazel test //spec:reference_lane` (front-end) with no bucket moved; rosters LOST 0 and
any GAINED name trimmed with its reason. **Deletes:** nothing yet (W4.2 deletes the duplicate engines). **Number:** open
wrong-results defects 14 → 13.
