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
