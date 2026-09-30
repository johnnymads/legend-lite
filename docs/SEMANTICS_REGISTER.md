# The semantics register: every deliberate difference from legend-pure and legend-engine

Created 2026-09-29 by plan rev H2 (rule 0b.13, `docs/EXECUTION_PLAN_2026_09_26.md`). Lite matches legend-pure's
observable outcomes (accept/reject and error class, the chosen declaration where it changes lowering or result type, the
result type and multiplicity) and legend-engine's rows. Where it deliberately does not, or where it matches the outcome
with a different representation, the difference is a row here. A difference that is not a row is a defect.

Rules for this file: one row per difference; each row names the evidence (file:line in lite and in the pinned trees
`$(bazel info output_base)/external/+http_archive+legend_{pure,engine}_src`), who decided it and when, and the owner item
if it is expected to change. The reference lane (`spec/src/test/resources/reference-lane/reasons.tsv`, from W1.1b), the
engine-input lane (W1.13) and the dialect divergence register (W5.0) will cite rows by id. A row is removed only when the difference is.

## Kinds

- **outcome**: lite's observable result differs on purpose.
- **representation**: the outcome is the same; lite's IR or text differs (the lanes normalise it).
- **scope**: lite does not offer the feature; the request fails with a clear error.
- **pending**: suspected; being reproduced or ruled; not yet a decision.

## Rows

| id | kind | legend-pure / legend-engine | lite | why, decided by | evidence | owner |
|---|---|---|---|---|---|---|
| S1 | outcome | the engine rejects the whole model if any function body fails to compile | a user query that touches only valid code runs; compile-all mode fails the build on any error | D10, the user, 2026-09-29 (`docs/TENETS.md`: eager Knowledge, demand-driven Work) | engine `FunctionCompilerExtension.java:124-143` | W2.2b |
| S2 | representation (SQL text) | the engine pre-evaluates constant expressions in data positions before SQL (`'a'+'b'` reaches SQL as `'ab'`) | the database computes every value; only D8's schema positions fold at compile time | D8, the user, 2026-09-29; TENET_CHARTER C6.2a | engine `router_routing.pure:203-241`, `preeval.pure:53-104` | W4.2 |
| S3 | outcome (engine input) | engine input picks among handlers by first passing dispatch in registration order | lite picks by legend-pure's rule over the engine's namespace (32 imports, handler names) | D13, delegated by the user, 2026-09-29 | engine `Handlers.java` (e.g. `between` only for Date/Number/String, :2847-2849) | W1.13 lists every disagreement as a sub-row |
| S4 | representation (SQL text) | engine SQL text formatting (`"root"`, `<table>_<n>` aliases, lowercase keywords) | `EngineStyleH2/DB2/Composite` print it from lite's SQL tree; byte differences where the tree differs are sub-rows | D16, the user, 2026-09-29 | `sql/dialect/EngineStyleH2.java:18-27` | W5.6 |
| S5 | representation | a dot access on a non-`[1]` receiver becomes `map($src, v_automap \| $v_automap.p)` in the typed tree | `Member(PropertyId)` with the lifted multiplicity; same result type and multiplicity | rule 0b.13 (plan rev H2) | pure `FunctionExpressionProcessor.java:306, :325, :359`, `:1108-1174` | W2.4; lane normalises |
| S6 | representation | enum value access becomes `extractEnumValue(<enum>, 'NAME')` (the value identified by a string) | `Ref<EnumValue>` | rule 0b.13 and the no-string-identity ruling | pure FEP:298-302, :1096-1106 | W2.4, W2.6 |
| S7 | outcome (determinism) | overload ties inside the lenient order break by set/hash iteration order | a deterministic tie rule of lite's own (declaration order) | D15, the user, 2026-09-29 | `docs/plan-audit-2026-09-26/reference-matching.md` corrections 5, :61, :73, :243 | W3.3 |
| S8 | outcome (pending a probe) | `TypeInferenceContext` merge mode drops a concrete binding over a non-concrete one, which its own source calls a bug; bindings left over from earlier candidates | not copied unless a probe shows an observable class on the corpus | D15 | pure `TypeInferenceContext.java:465-482` | W3.3 |
| S9 | outcome (arithmetic) | Pure Float | computed as DECIMAL in SQL for engine parity | NUMERIC_CHARTER Rule 1 | `docs/NUMERIC_CHARTER_2026_09_17.md` | W5.2 reviews |
| S10 | scope | parsed twins of `meta::pure::functions::*` | the platform's own natives, signatures verified against the pinned sources; parsed twins suppressed | AGENTS.md reference-checkout tenet | `compiler/element/FunctionCompiler.java:79-115` (`isPlatformOwnedFunction`, `SUPPRESSED_ONCE`); `spec/…/rcorpus/LibraryPlatformNamespaceGuardTest.java` | — |
| S11 | scope | mapping testSuites and service tests run by the engine's Testable framework | deleted; Studio's "run tests" against lite fails | 2026-08 (engine module deletion) | `docs/DEFERRED_TEST_EXECUTION.md` | scope at C3 |
| S12 | scope | cross-store queries | walled with a clear error | a standing product decision predating the rebuild; confirmed in plan rev H2 (2026-09-29) | `CrossStoreGuard.java` | — |
| S13 | pending | external formats (binding, schema sets) | not verified; treat as out of scope until ruled | to be ruled at C3 | — | ruled at C3 |
| S14 | outcome (test harness) | engine tests rely on H2 insertion order | the scan-order ORDER BY lives only in the harness, for tests whose rows depend on scan order | D6, the user, 2026-09-29 | `sql/ScanOrder.java`; `lowering/CanonicalRenderSql.java:436` | W0.4 |
| S15 | outcome (test judge) | the engine compares exact decimals | the host judge compares Floats within 2 ULP | D7 keeps both judges (the user, 2026-09-29) | `exec/Equality.java:71-83`; OPEN_REGISTER V8/X6 | W6.3 (the judge SPI) |
| S16 | outcome (spec conflict) | PCT `testExtendFilterOutNull` and every relational engine adapter: a filter before a window is applied before it; the Pure interpreter disagrees and is excluded in its PCT manifest | lite follows PCT and the engine (`lowering/Fold.java:265-295`); excluded from TLP/NoREC | found by W0.6 homework report 4 E (2026-09-29); lite follows PCT and the engine per rule 0b.13 | `core_functions_relation/relation/tests/composition.pure:1115-1155`; `pct-manifests/core-interpreted/RelationFunctions_manifest.json:9-10` | — |
| S17 | pending | Pure `splitPart`: doc says literal separator, interpreter a character set; engine-H2 character set, engine-DuckDB whole string | DuckDB whole string with collapse, H2 character set | D20 (open) | `sql/dialect/DuckDb.java:576-587`, `H2.java:719-735`; report 4 F | W0.6 |
| S18 | outcome (nondeterminism) | `first()` in a group and unordered `joinStrings` are unordered in the engine too | `ANY_VALUE` (skips empties, the Pure-faithful choice) and unordered `STRING_AGG`; tests judge by set-of-valid-answers | ruling of 2026-09-20; report 4 D | `lowering/Aggregates.java:43-48`, `Lowerer.java:1323-1332` | W0.4 classifies |
| S19 | outcome (engine parity) | Pure `average([])` fails; the engine's correlated reducer subquery returns NULL | NULL, as the engine | rule 0b.13 (engine rows); found by report 4 H (2026-09-29) | `lowering/RelationPredicates.java:264-295` | — |
| S20 | pending | Float literal kind by magnitude (DuckDB DOUBLE outside 1e-6..1e15) | see D21 | D21 (open) | `sql/dialect/AnsiSqlRenderer.java:1370-1378`; report 4 G | W0.6 |
| S21 | outcome (model build) | a Pure class mapping with no `~src` compiles (engine `ClassMappingFirstPassBuilder` keeps `srcClass` null; M3 `srcClass: Type[0..1]`); a query through it fails at execution | the model build refuses it: NORMALIZE "declares no ~src, so it has no source extent to map from" (`MappingNormalizer.synthM2M`); the resolver no longer NPEs on it (W0.6 push 7) | found 2026-09-30 by W0.6 push 7; not yet ruled: keep (fail early, D10's eager Knowledge) or match the engine | `normalizer/MappingNormalizer.java` ("declares no ~src"); engine `ClassMappingFirstPassBuilder.java:108,116`; `SourcelessPureMappingTest` | W4.1a |
