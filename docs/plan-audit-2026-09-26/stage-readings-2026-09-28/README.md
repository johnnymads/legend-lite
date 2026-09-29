# Stage readings, 2026-09-28: every stage of core read whole, plus the guards and the plan

These are the evidence behind `../architecture-review-2026-09-28.md` (the synthesis) and `docs/EXECUTION_PLAN_2026_09_26.md`
(the living plan: what to do, in what order, and the decisions owed). Each file is one reader's report, preserved as returned, with a header saying what
was re-checked by hand afterwards. Tree: `6ab32198d` (origin/main on 2026-09-28; `core/` unchanged since `d484e1f78`
except the upstream-API server work, which touched `server/` only).

**Method.** Fourteen independent readers, one area each, told to read every file in their list whole (no sampling) and
to report with file:line evidence, severity and measured counts, judged against how production compilers (javac,
Roslyn, rustc, GHC, Kotlin, TypeScript, Swift; Calcite, DuckDB, Catalyst) build that stage. All fourteen reported "NOT
READ: none". The session then re-checked the lead claims against the code and the pinned trees; one claim was refuted
(A01 #1, the arithmetic precedence: legend-pure has the same rule).

| file | area | files / lines read |
|---|---|---|
| `A01-lexer-parser.md` | lexer, `parser/*` (A–C) | 26 / 17,046 |
| `A02-sections-protocol.md` | `parser/section`, `protocol`, `protocol/spec` | 76 / 26,266 |
| `A03-model-catalog.md` | `model`, `builtin` (Pure.java, NativeFn, Prelude, SystemMetamodel), `values`, `error`, `spi` | 85 / 14,832 |
| `A04-resolver-elements.md` | `compiler/*` (NameResolver, BareNames…), `compiler/element`, `compiler/element/type` (D, F) | 41 / 10,978 |
| `A05-typer-kernel.md` | `compiler/spec` (G, G½) | 82 / 21,278 |
| `A06-typed-hir-tables-normalizer.md` | `compiler/spec/typed`, `platform`, `normalizer` (E) | 127 / 18,361 |
| `A07-A08-store-resolver.md` | `resolver` (H), both halves | 57 / 35,925 |
| `A09-lowering.md` | `lowering` (I) | 75 / 23,746 |
| `A10-sql-mir-dialects.md` | `sql`, `sql/dialect` (J) | 54 / 14,109 |
| `A11-driver-executor-plan.md` | root package (`Compiler`, `StatementExecutor`…), `exec`, `plan` (K) | 71 / 23,525 |
| `A12-periphery.md` | `lineage`, `validation`, `server`, `ide`, `cache`, `test`, `testdatagen`, `probe` | 33 / 10,692 |
| `A13-guards-and-tests.md` | guard tests, `architecture/`, the corpus harness, generators, claims, BUILD files | ~75 files |
| `A14-plan-vs-practice.md` | every plan document | — |

**Earlier research this builds on** (same directory, read these for the reference compiler): `reference-matching.md`
(how legend-pure binds and chooses overloads, with the "Corrections from the second reading"), `kernel-reading-2026-09-26.md`
(the twelve reference methods as line-cited pseudo-code and 35 implementer traps), `engine-resolution.md`,
`homework-2026-09-26.md`, `step3-homework-audit-2026-09-26.md`, `step3-design-2026-09-26.md`, `program-audit-2026-09-27.md`.
The probe counts taken before step 3 are in `docs/GATES.md` ("step 3, the probe push", 2026-09-27); raw receipts on the
desk under `~/legend/platform-architecture/receipts/plan-audit-2026-09-26/step3/probes-pre-3a/`.
