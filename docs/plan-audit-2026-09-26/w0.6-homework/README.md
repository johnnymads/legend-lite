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

## Order of the fix pushes (one push per group; each gated by the full chain)

1. **Capture-avoiding substitution** (report 1 bug 2), then **the lowerer's let scope** (report 1 bug 1): bug 1's
   name-keyed scope is only sound over a capture-free tree.
2. **The TypedFilter stamp** (report 2 §1): the one-line live fix and the class fix (no 3-argument constructor; rebuilds
   carry the stamp) in one push.
3. **Prefix keys from the materialization map** (report 2 §2, steps 1–4 and 6; step 5's plumbing if it fits the method
   ceiling).
4. **The killed head match** (report 2 §3): first pin the repro as a failing test; count how many corpus rows ride the
   `nullTolerant` fallback (a temporary throw, then the relational corpus lane) and record the count; then generalise
   `detachSpineJoin` and delete the fallback, a remaining unhoistable shape failing loudly.
5. **Section imports** (report 3 §1, including the cross-file variant), then **the sourceless mapping** (report 3 §2),
   then **value-keyed service-test provisions** (report 3 §3; the latent content-hash ids in the same push or pinned).
6. **Report 4:** A (null-safe equality by multiplicity), then A2 (after a failing fixture confirms it), then H (empty-list
   sum), then D's H2 `ANY_VALUE` spelling or refusal; F and G after D20 and D21 are ruled. Each reproduced as a failing
   lite test first (report 4 ran only the emitted SQL, never lite end to end).

## Facts every fix session needs (found by this homework)

- `//core:core_tests` is one package-wide `junit_test`; `--test_filter` is ignored (`tools/junit/defs.bzl:25-66`). To
  observe one test quickly, drive the jars in `bazel-bin/core/core_tests.runfiles` from jshell (JDK 25 at
  `external/rules_java++toolchains+remotejdk25_macos_aarch64`), or run the whole target.
- A passing `@KnownDefect` test means the defect is still present (`core/src/test/java/com/legend/testing/KnownDefect.java`);
  the latest junit XML under `bazel-testlogs/core/core_tests/` shows which pins currently hold.
- None of the touched files is pinned by line in the guardrail registers; the method-length ceiling (250,
  `CodeShapeGuardrailTest.java:37`) is the tight constraint in `Lowerer.scalarStructural`, `UserCallInliner.rewriteSwitch`
  and `literalArms`, `TemporalFrame.applyJoinTemporalFilters`, `Substitution.rewrite`; add helpers rather than inline
  blocks.

## Push 1: capture-avoiding substitution (fully specified, after the cold read of 2026-09-29)

**Scope.** Report 1 bug 2 only, in all three substitution engines, so that no substitution anywhere can capture. The
let-scope fix (bug 1) is push 2. Decisions taken here (engineering choices, not user rulings; each follows rule 0b.8
"the principled design"):

1. **One free-variable function over the typed tree**, new file `compiler/spec/typed/FreeVars.java` (a fact about the typed
   IR, so it lives with it; check first that the name is free). Binders it respects: `TypedLambda` parameters; a
   `TypedLet` binds its name for the later statements of the same body; `TypedMatch.param()` and `extraParam()`;
   each `TypedMatchRuntime` arm's parameter. Do not reuse `resolver/AssociationJoins.java:2172 collectFreeVars`
   (`compiler.spec` may not depend on `resolver`); leave a note there that it can switch to `FreeVars` later.
2. **`UserCallInliner`**: a helper `underSubst(List<TypedSpec> terms, Supplier<T> k)` pushing `peekOrEmpty ∪
   FreeVars.of(terms)` onto `captureRisk` and popping in `finally`; applied at the `TypedMatch` arm (:1250-1259, the input
   and the extra term), `TypedMatchRuntime` (:1058, :1076), the literal unrolls (:917, :947, :985 incl. the accumulator
   term, :1009), higher-order map (:1323), and around the root rewrite in `inlineBody` (:172-180, with the let values).
   `bind` (:1439) unchanged; the class javadoc (:48-52) corrected to say binders are renamed when a substituted term
   mentions them.
3. **`SourceSubst.substitute`** (`compiler/spec/SourceSubst.java:185-203`, over `ValueSpecification`) becomes
   capture-avoiding itself: when a lambda parameter or lambda-local let it would descend under is free in any value of
   the current env, the binder is renamed through a fresh-name supply (the `AlphaRename` `_nr<N>` convention) and its
   body re-substituted. Chosen over "every caller α-renames first" because one rule in one place protects all callers
   (`inlineLets`, `LambdaBodies`, `StatementInline`, `LiteralMapUnroll`, `resolveStructuralArgs`, the checkers).
4. **`lowering/MatchFold.inlineParam`** (:65-74): the same check with `FreeVars`; a colliding inner lambda binder is renamed
   `_m<N>` (a per-fold counter; the name reaches SQL only as a lambda parameter, so any fresh spelling is correct), and it
   stops at a lambda-body let named like the parameter. W4.2 deletes this β-site when G½ is one engine.

**Probe (rule 0b.2), local only, never pushed.** A temporary commit makes each of the three engines print one stderr line
`CAPTURE_RENAME <site> <binder>` whenever the new rule renames where the old one would not; run `bazel test
//core:core_tests //spec:corpus_duckdb //spec:corpus_h2 //pct:pct_duckdb //pct:pct_h2 --nocache_test_results`; collect
the lines from `bazel-testlogs/**/test.log` into the receipt `rebuild-W0.6-p1-probe/`. Expected: hits only from the new
tests' queries; every other hit is a latent wrong answer the push also fixes, listed by test name in the GATES entry.
Then drop the temporary commit (`git reset --hard HEAD~1` on the local-only commit, after checking it is that commit).

**Tests** (all in `core/src/test/java/com/legend/compiler/spec/InlinerMatchCaptureTest.java`, DuckDB only: the capture
happens before SQL, so one dialect proves it; `values(query)` as in the file, and a `values(model, query)` overload for
the model case). Expected values computed by hand:

| case | query | expected | today (predicted) |
|---|---|---|---|
| the pin | `\|[1,2,3]->map(x \| $x->match([i: Integer[1] \| [10,20]->map(x \| $i + $x)->sum()]));` | `[32, 34, 36]` | `[60, 60, 60]` |
| extra parameter | `\|[1,2,3]->map(x \| $x->match([{i: Integer[1], k: Integer[1] \| [10,20]->map(x \| $i + $x + $k)->sum()}], $x));` | `[34, 38, 42]` | `[90, 90, 90]` |
| three levels | `\|[1,2,3]->map(x \| $x->match([i: Integer[1] \| [10,20]->map(x \| $x->match([j: Integer[1] \| [100]->map(x \| $i + $j + $x)->sum()]))->sum()]));` | `[232, 234, 236]` | wrong |
| fold accumulator | `\|[1,2,3]->map(a \| [$a]->map(e \| [10,20]->fold({x, a \| $a + $x + $e}, 0))->toOne());` | `[32, 34, 36]` | wrong |
| literal unroll under a frame | model `function t::g(xs: Integer[*]): Integer[*] { $xs->map(y \| [$y]->map(e \| [10,20]->map(y \| $e + $y)->sum())->toOne()) }`, query `\|t::g([1,2,3])` | `[32, 34, 36]` | wrong |
| typer-side let capture (SourceSubst) | `\|[1,2,3]->map(x \| let c = $x; [10,20]->map(x \| $c + $x)->sum();)` | `[32, 34, 36]` | wrong |
| call-argument capture (may already pass: the frame check covers call args) | model `function t::f(p: Integer[1]): Integer[*] { let z = $p + 1; [1, 2]->map(p \| $z + $p); }`, query `\|[5]->map(p \| t::f($p))` | `[7, 8]` | `[7, 8]` or `[3, 5]` |
| control (no capture possible) | the pin with the outer binder spelled `y` | `[32, 34, 36]` | `[32, 34, 36]` |

Plus unit tests of `FreeVars` itself (each binder kind shadows; a let binds only later statements). If a query's surface
syntax is refused by the parser, fix the test's spelling (e.g. a statement-terminating `;`), never the expectation, and
record the corrected spelling.

**Gate.** The pin removed and asserting `[32, 34, 36]`; the table green; the probe receipt saved; `bazel test
//core:guardrails //core:census //parser-equivalence:parser_parity //spec:spec_tests`, then `bazel test //...` and
`bazel test //tools/deps:all`; `bazel test //spec:reference_lane` (G½ is front-end, §0 step 6) with no bucket moved;
rosters LOST 0 and any GAINED name trimmed with its reason. **Deletes:** nothing yet (W4.2 deletes the duplicate engines).
**Number:** open wrong-results defects 12 → 11 (the pinned seven, the head-kill, A, A2, H, D; F and G wait on rulings).
