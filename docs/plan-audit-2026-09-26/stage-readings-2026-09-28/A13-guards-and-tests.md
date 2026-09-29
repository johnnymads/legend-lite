# A13 — The test and guard architecture, read whole 2026-09-28

Reader's report, preserved. Tree `6ab32198d`. Read whole: all 40 top-level files in `core/src/test/java/com/legend/`
(T), `T/architecture` (3), `spec/src/test/java/com/legend/{rcorpus (7), generators (19), claims (3)}` (S),
`core/BUILD.bazel`, `spec/BUILD.bazel`, `.bazelrc`, `tools/junit/defs.bzl`, `tools/reference/RefResolutions.java`,
`join.py`. Lane times from Bazel logs of 2026-09-27 (in-chain, 3–7× solo). M = `core/src/main/java/com/legend`.
Re-checked by hand: findings 2 and 3 (confirmed) and the engine-scan-order property (confirmed).

Test layout (T, files/lines): root 40/9,528; architecture 3/504; builtin 3/1,948; cache 4/326; compiler 10/3,362;
compiler/element 2/408; compiler/element/type 2/212; compiler/spec 16/4,577; exec 20/2,934; ide 2/769;
**integration 70/51,434**; ladder 1/287; lexer 2/385; lineage 1/104; lowering 20/3,247; model 2/119; normalizer 11/6,913;
parser 11/7,455; platform 4/336; protocol 4/253; protocol/spec 3/618; resolver 35/6,883; server 8/2,199; sql 5/1,390;
sql/dialect 4/960; test 1/76; testdatagen 1/59; testing 4/192; values 1/30. Totals 290 files, 107,508 lines, against
216,814 lines of main code.

## 1. What it is
(a) Source checks, ~25 classes tagged guardrail/census: `//core:guardrails` 81 tests 90 s; `//core:census` 13 tests
25 s. Only `ArchitectureTest` (37 tests) reads bytecode (ArchUnit). ~23 are regexes over `.java` text, each re-walking
the tree with its own comment stripper and comparing counts to constants (a ceiling or an exact map). Behaviour checks:
PlannerRunsOnJavaBaseTest, NoEagerUserClassLoadsTest, ConstantPlanParityTest, NativeRegistryGovernanceTest.
(b) Spec conformance in `//spec:spec_tests` (26 tests, 90 s): generators read the pinned trees and write committed files
(Pure.java signatures, prelude.pure, DynaFn.java, NameResolver.CORE_IMPORTS, engine-handlers.tsv, native-claims.tsv) by
regex-splicing blocks inside hand-written Java; checked twice (write_source_files diff tests AND duplicate JUnit parity
tests); census tests pin shrink-only counts (CatalogUpstreamDiffTest, SpecBodyCensusTest, ImplementationTableTest).
(c) The oracle `MinimalCorpusTest`: ONE JUnit test running 2,613 legend-engine core_relational tests through the product's
PureTestRunner, twice per backend (host judge, database judge): DuckDB 339 s, H2 337 s; pins committed rosters of names.
Behaviour tests: 4,152 in `//core:core_tests` (214 s); integration 48% of test code.

## 2. Verdict
**Bytecode rules are real** — reflection ban (ArchitectureTest:737), JDBC funnel to chartered packages (:611), typed-HIR
construction confined (:1150), protocol-node construction pinned exactly (:1241), RawSql constructor quarantined (:714).
Most layering rules now duplicated by core/BUILD.bazel targets.
**Proven blind spot:** `sqlLayerIsFullyStandalone` (:279) asserts sql depends only on itself, yet
`M/sql/dialect/EngineStyleH2.java:262` reads `PlatformTypes.TDS_NULL_CELL`, a javac-inlined `static final String`, and
`core/BUILD.bazel:85` grants `sql_dialect` the `:compiler_element_type` dependency. Green while false.
**Regex guards count spellings**; their comments record escapes (IdentityGuardrailTest.java:79-83 "BLIND SPOTS closed by
the 2026-09-25 audit"; :97-99 a method-reference escaped; HarnessDisciplineTest.java:209-215 "the first spelling …
missed `ap.remove(hit)`"; ArchitectureTest.java:463-468 pattern-matching `case` invisible).
**"No static mutable state, NO allowlist" leaks in production:** `CodeShapeGuardrailTest.noStaticMutableState` (:631) is
line-based and needs `;` on the declaration line; `M/exec/CanonicalDivergence.java:558-559` declares `public static
volatile Supplier<String> CONTEXT_SOURCE` across two lines; the corpus harness writes it (S/rcorpus/MinimalCorpus.java:552).
`ArchitectureTest.staticCollectionStateIsImmutableOrRegistered` registers 42 mutable static collections (:919-1035) and
skips any class that throws on load (:1044-1046).

**Load-bearing:** the bytecode rules; PlannerRunsOnJavaBaseTest (runs the planner under `--limit-modules java.base`);
NoEagerUserClassLoadsTest; ConstantPlanParityTest; generator parity; CatalogUpstreamDiffTest (DIVERGENT == 0);
SpecBodyCensusTest; the corpus roster.
**Ceremony:** JavaEvalLedgerTest — 1,154 of 1,427 lines comments, pins exact comment-stripped line counts of 15 product
files (StatementExecutor must be exactly 2,392, :668); JdbcSurfaceCensusTest.TEST_REGISTER (:162) — 162 test files must be
registered before opening JDBC, while production JDBC is already funnelled by bytecode; DanglingStateGuardTest (:198) —
a guard over other guards' comments; funnel file registers (JavaEvalLedgerTest.java:1327); ParkedWorkLedgerTest PARK-4
(:73) whitespace-exact multi-line regex; DynaFnRegistryTest (:120) hand set equals a regex scan of one file; the claims
`also` column (S/claims/ClaimsGenerator.java:138) writes grep evidence into a committed file; ShadowWalkerCensusTest 15
rows pinned at 0 for methods that no longer exist.

**Pins are not a substitute for types.** Ceilings bank headroom against the repo's own doctrine "headroom is not a pin"
(JavaEvalLedgerTest.java:1384; DynaFnRegistryTest.java:115): string dispatch pinned 87 vs 6 measured
(ObservabilityGuardrailTest.java:76); `endsWith("::")` 18 vs 7 (ErrorShapeGuardrailTest.java:176); `equals("meta::")` 60 vs
49 (PlatformNamesGuardrailTest.java:76). Scope floors loose: GuardCoverage floor 498 vs 727 main files (~31% could vanish);
SkipCensusTest floor 270 (:190) met by core's own 290 test files; missing sibling roots silently skipped (SkipCensusTest:180;
LegacyReachbackCensusTest:117; JdbcSurfaceCensusTest:538) — the rot VerdictChannelRegisterTest.java:60-63 records burning
the project once. The judgment-only vocabulary ban (JavaEvalLedgerTest.java:1278) covers AssertVerdicts, SqlTextVerdicts,
AssertErrorNative but not HostJudge (1,152) and DatabaseJudge (749), split out 2026-09-21. 349 `N -> M` pin moves counted
(e.g. CarrierPurityRatchetTest ArrayLit 34→36→37→38→34→35→36→38→39→40→42→39→41→42→40; BARE_NAME_ARMS 116→145
PlatformNamesGuardrailTest.java:188; AssertVerdicts evict-size 221→2,599 before the file was split; corpus DIFFERENTIAL
floor "may only grow" cut 1,543→1,020 DuckDB, 1,387→953 H2 by redefining what counts, MinimalCorpusTest.java:629-637).
The largest pin drop came from a TYPE change (CATALOG_LOOKUP_BY_NAME 170→10 by FunctionId-keyed tables,
IdentityGuardrailTest.java:146). Nothing counts `default ->`: 513 in main, 31 in sql/dialect, despite invariant 3.

**The corpus oracle.** Roster = committed sorted list of test FQNs per lane (fail 107 DuckDB / 361 H2; skipped 14/14;
accepted 20/15; plus order and engine-order registers). Judge: HostJudge compares database-fetched values in Java;
DatabaseJudge computes one verdict row in SQL; JudgeLedger joins them per assert. Referee (ReplayOracle) replays the
engine's golden SQL on an H2 mirror ("DIFFERENTIAL"). Wall = loud named refusal. "LOST 0 / GAINED 0" proves only that
the set of failing NAMES equals the roster (MinimalCorpusTest.java:919-999). Not: that a rostered test fails for the same
reason ("messages are printed, never compared" :41-42; a harness crash becomes an ordinary FAIL :216-220); that a pass
checked values (only 1,020 of ~2,472 DuckDB passes are referee-differential, floors :637,:665); that order was checked
(921 unordered-chain multiset compares; the PRODUCT assertEquals accepts a reversed golden for an unsorted read,
T/AssertVerdictSpliceTest.java:174-190); that product SQL was tested (the lane sets `legend.exec.engineScanOrder=true`
(:139), read by `M/sql/dialect/DuckDb.java:218` via Boolean.getBoolean, installing a test-only SQL pass; 993 tests had
statements rewritten by it); that the H2 lane is independent (its referee runs on the same session; the code says it "is
not an independent oracle", :174-178). The judge is product code (AssertVerdicts, HostJudge, DatabaseJudge,
SqlTextVerdicts: 5,305 lines); expected values are independent literals, the comparator and its leniencies (2-ULP,
TDSNull, micro-floor, fan-out collapse) are ours. `StressServiceSuitesTest.java:143-154` still pins a pass COUNT
(MIN_PASS 4,700), the practice the corpus header rejects (:35-38).

**The reference differential** (OurResolutionsTest + tools/reference/RefResolutions.java + join.py) compares only which
declaration each call binds to — no types, multiplicities, SQL or rows; jar 4.138.5 vs pin 4.145.0 (skew absorbed into
DRIFT/SOURCE_DRIFT); OurResolutionsTest drops whole source files until the model builds, up to 4,000 rounds (:66-89) —
survivorship bias; opt-in (:50), output unpinned, join in Python outside Bazel. The "2 tests aborted" in spec_tests are
this probe and ManifestWorldCensusTest, both skipped, so the census pins (≤32 load walls, ≤1,447 failing bodies,
:346-349) are never enforced. An oracle no gate consults.

**Lanes.** ~1,290 s in-chain total. No `shard_count` anywhere; the corpus a single JUnit test. Every lane `data =
glob(["src/**"])` (core/BUILD.bazel:266) — any main edit reruns every guard. `core_next` recompiles all of core to feed
the claims generator (:445). PreludeGeneratorTest.preludeIsCurrent and NativeSignatureGeneratorTest.signatureTextIsCurrent
duplicate the write_source_files diff tests. Per-test ceiling 60 s (MinimalCorpusTest.java:53) vs slowest ~1.5 s.

**Pyramid.** Zero property/fuzz tests (`Random` only in Sha256Test and PureLspServerTest); 5 files assert exact SQL vs 258
`sql.contains(...)`; 237 `getMessage().contains`; 53 `assertThrows(Exception.class, …)`; 7 files build typed HIR
directly vs 89 end-to-end through Compiler.execute/QueryService.

**Docs contradict code.** AGENTS.md:296 says NoEagerTypeReferencesTest and NoEagerUserClassLoadsTest "died"; both exist in
T/architecture and run. AGENTS.md:318 "ArchitectureTest is 23 dependency-direction rules and nothing else": it has 37
tests incl. runtime reflection over static fields and bytecode counts. CompilerFacadeTest.java:71 and
PipelineStageFailureTest.java:70 say a unique bare name resolves; AuditRound3Test.java:106 says the global scan that did
that was deleted; no test pins either.

## 3. Clean-sheet
1. Types first: sealed IR roots, exhaustive switch without default, identities on nodes, finer Bazel targets (incl.
   splitting the 208-class compiler quartet); then delete the regex guards they subsume.
2. A phase verifier (LLVM `-verify` / GHC Core Lint) after every pass in tests: every node typed; no store-only node after
   H; no SQL-bearing string in MIR; no host evaluation as an effect property of typed calls, not line counts.
3. Pass-level golden tests (rustc UI / FileCheck style): Pure in; typed HIR, resolved HIR, MIR and per-dialect SQL dumps
   out; auto-bless via update_generated; replaces the 258 `.contains`.
4. The reference as a gated oracle: the pinned shaded jar over the corpus world comparing resolution, inferred type and
   multiplicity per call site, and plan result rows; disagreement set pinned with reasons.
5. Metamorphic testing and fuzzing: a grammar-based generator of well-typed queries over random schemas; oracles no-crash,
   DuckDB agrees with H2, SQLancer TLP/NoREC, protocol print→parse round-trip.
6. The corpus as dynamic tests (@TestFactory), sharded and cached per test; rosters pin (name, failure class); a
   product-SQL-only lane; order semantics explicit.
7. Diagnostics with codes (phase, kind, span); tests assert codes.
8. Keep: bytecode rules with no type/Bazel equivalent (reflection, JDBC funnel, HIR minting), PlannerRunsOnJavaBase,
   generator parity, the spec-body census, JudgeLedger's per-assert join, corpus discovery.
Delete: JavaEvalLedger EVICT_SIZE; the JDBC TEST_REGISTER; DanglingState rule 2; funnel file registers; ParkedWork
anchors; ShadowWalker zero rows; claims `also` column; duplicate in-JUnit parity tests.

## 4. Top findings
1. STRUCTURAL: guards count spellings and move by policy.
2. DEFECT: a live violation escapes the "NO allowlist" static-state guard (confirmed).
3. DEFECT: "SQL layer stands alone" rules green while false (ArchitectureTest:140,:279; confirmed).
4. STRUCTURAL: the corpus oracle proves less than "LOST 0" suggests.
5. STRUCTURAL: the reference differential is never a gate.
6. DEFECT: ceilings bank headroom; floors loose; missing roots skipped.
7. DEFECT: the judgment-only vocabulary ban lost its scope (HostJudge, DatabaseJudge omitted).
8. SMELL: ceremony turns ordinary edits into pin edits.
9. STRUCTURAL: no pass-level test tier.
10. SMELL: lanes monolithic and rerun everything.

Corpus counts (DuckDB / H2): discovered 2,613/2,613; fail roster 107/361; accepted 20/15; skipped 14/14; pass host/db
2,472/2,474 and 2,223/2,232; DIFFERENTIAL floor 1,020/953; unordered register 921/877; engine-order register 993/—.
Main-code: `default -> null` 66 (59 at the 2026-08-18 audit); `System.getenv` 34.
