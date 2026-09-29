# Meta-audit lens 5 — evidence audit and fresh-session test of EXECUTION_PLAN_2026_09_26.md (rev H1, at ee7617ec8)

Read-only review, persisted by the parent session. Paths under `core/src/main/java/com/legend/` unless stated.

## Verdict

The code facts are well backed: of 50 claims checked at HEAD, 31 are exactly right, and most of the rest drift by a line
or were counted with a loose pattern. The weaknesses are elsewhere:
- **The text drifts from its own evidence within hours**: 12 GB vs 8 GB; 108 vs 169 files; 6–8 vs 9–13 sessions; W6's
  size; IN_FLIGHT; three different programme totals.
- **Sizes have no unit and no calibration**; they are judgement.
- **The next items fail the plan's own rule 0.3**: W0.4 has no gate and no counting method; W2.0b has no decision rule
  for the numbers it collects.
- **Four load-bearing scope claims are wrong or incomplete**: W1.3 hooks "two sequences" but a third runs in the
  executor; W0.4/D6 misses a second, always-on scan-order pass in product code; W1.1's side-table rationale ignores that
  calls already carry their type; D10's work belongs to no item.

A fresh session could start W1.1b from the documents; W0.4 and W2.0b only after rediscovering files, seams and layering
limits the documents do not name.

## 1. Claim ledger (reviewer's own spot checks)

Classes: VERIFIED (reproduced) · STALE (true once, moved) · SAMPLED (partial count or pattern-dependent) · ASSUMED (no
evidence) · WRONG.

| # | claim (plan line) | class | evidence |
|---|---|---|---|
| 1 | Typer 3,499 → 1,748 (§3:133) | VERIFIED | Typer 1,748; TdsDesugars 807; Overloads 1,209 |
| 2 | W1.6 seams `Typer:700-1310`, `:1465-2090`, `accessProperty :2951-3192` (:194-195) | STALE | code now in TdsDesugars/Overloads; `accessProperty` did NOT move (Typer.java:1200); the plan still says it moves |
| 3 | 39 checkers already separate files | VERIFIED | `compiler/spec/*Checker.java` = 39 |
| 4 | the pass changes 993 tests (D6, W0.4 :174) | SAMPLED | duckdb-engine-order-register.txt = 993 (host mode); database mode 936 lines, unmentioned; both H2 registers 0 lines, so "four registers" = two live, two empty |
| 5 | 921 unordered-chain tests | VERIFIED | duckdb-unordered-register.txt 921 (H2 877) |
| 6 | W0.4 seam replaces `Compiler.dialectOf`'s static choice | SAMPLED | pass installed at sql/dialect/DuckDb.java:218 via `Boolean.getBoolean("legend.exec.engineScanOrder")`, set unconditionally at MinimalCorpusTest.java:139; neither named |
| 7 | (not in plan) a second scan-order application | — | lowering/CanonicalRenderSql.java:436 calls `ScanOrder.stabilize(plan)`, always on, product code, assert/verdict path; not covered by D6 |
| 8 | D6: today's pass is broader than intended | VERIFIED | sql/ScanOrder.java doc: every join tree rooted at a bare scan |
| 9 | exec/Census.java:92 | VERIFIED | reads `StableScanOrder.firings()` |
| 10 | W1.1 `resources:memory:12288`, "Not in CI (12 GB)" (:197, :208) | STALE | spec/BUILD.bazel:153,159 `-Xmx8g`, `resources:memory:8192`; §7 says 8 GB |
| 11 | W1.1: typer side table for (ExprType, bindings), "not new fields on 100 constructor sites" | WRONG in part | TypedNativeCall/TypedUserCall already carry `ExprType info` + `pos`; only bindings are missing; `new Typed*(` is 394 in compiler/spec, 1,176 in main; no source for 100 |
| 12 | D3: 35 s at 5.3 GB | VERIFIED (weak) | H3: 34.6/35.4 s, 5.3 GB, at load 7 ("not a timing") |
| 13 | the reference lane is deterministic | SAMPLED | n = 2 runs |
| 14 | W1.3 verifier at Compiler's two sequences (:217) | refs VERIFIED; claim WRONG | Compiler.java:592-614, :1173-1194 right; StatementExecutor.java:510 builds a third StoreResolver; `new UserCallInliner` 9× in StatementExecutor; 2 more Lowerers |
| 15 | NavReducer.java:63,75 identityHashCode | VERIFIED | both lines |
| 16 | W1.9: FromProtocol used 25 times in parser/ | VERIFIED | 25 non-import lines |
| 17 | W1.9: `pe_tests_lib` on //core; `_INPUTS` every tree | VERIFIED | parser-equivalence/BUILD.bazel:24, :83-90 |
| 18 | W1.9: parser_parity ~85 s | STALE/unsourced | only GATES.md:3307 (2026-09-15, Maven-era, in-chain); not in H5 |
| 19 | W1.9: syntax depends only on base, json, errors; the fix is the model edge | SAMPLED | parser also has `spi` and `values` edges, unaddressed |
| 20 | §1b violations (resolver→lowering/plan; builtin→parser) | VERIFIED | core-layers.txt |
| 21 | W2.1: Pure.java:616 mangle has no collision guard | VERIFIED | `FN_BY_ID.put(SignatureMangle.mangle(nfd), nfd)` |
| 22 | W2.2: NameResolver.java:258; ElementParser.java:326,391 | VERIFIED | `putIfAbsent` at :325, :393 |
| 23 | W2.3a ~595 untyped constructions | SAMPLED | 294 + 301 per W2 report; reviewer's grep over 13 node types: 247 + 250 = 497 |
| 24 | W2.3a: 108 reader files (:263) | STALE | H2 revision says 169 files / 1,958 references; a `protocol.spec.` grep gives 98 |
| 25 | W2.0 "sizes W2.3a at 6–8" (:242) | STALE | the same page says 9–13 (:265) |
| 26 | W2.6 ~155 pointer/enum sites, ~56 `resolveName` | SAMPLED | "site" undefined (`new PackageableElementPtr/EnumValue(` = 33) |
| 27 | W2.8 FunctionCompiler.java:139-158, SUPPRESSED_ONCE, isPlatformOwnedFunction | VERIFIED | present |
| 28 | W3.1 ~95 relation readers; 557 `new ExprType(`; TypeAnnotations:152-163; CastChecker:33-39 | VERIFIED | 100 incl. declarations; 557 exact; refineResult InferenceKernel:1050 |
| 29 | W3.2a our linearization is BFS | VERIFIED | KnowledgeLayer.java:139; InferenceKernel.java:1836 |
| 30 | 21 speculative catch sites | SAMPLED | 30 `catch (` in compiler/spec; the 21 never listed |
| 31 | W3.3 11 direct `resolveOverload` sites | VERIFIED (≈) | 15 occurrences in 10 files incl. declarations |
| 32 | W3.6 typer's 16 `CoreFn.of`, 5 others | VERIFIED | 18 in compiler/spec (SourceSubst 2) + lineage 2 + normalizer 1 = 21 |
| 33 | D11: 77 kinds, 22 ambiguous; TypedRelationOp one reader | VERIFIED | "~38 lowering sites" SAMPLED (hand-classified) |
| 34 | W0.2(c) InferenceKernel.java:88-90 | VERIFIED | `.orElse(ag0)` |
| 35 | H: 35,925 lines, "one pass" | lines VERIFIED; "one pass" WRONG | `resolve` runs SubQueryLift → resolveNode → ObjectReferenceDecode → onFormPass |
| 36 | W4.3: 37 `findFunction` re-picks; normalizer 11,237; TemporalFrame 2,832; Substitution 3,479; GraphEmission 3,334 | VERIFIED | exact |
| 37 | W4.2/D8: 55 NormalizeRequiredFunction-marked functions | VERIFIED | 55 in the engine tree, 0 in the pure tree (lens 2 counts 97 applications in 38 files with a wider pattern) |
| 38 | W5.1a silent `RULES.put` overrides | VERIFIED for `times` (Scalars.java:294, :311) | the other five cited from W5-W7 only |
| 39 | W5.3 StatementExecutor.java:3050,3218 concatenate SQL | VERIFIED | schema DDL strings |
| 40 | W5.5 a non-H2 session silently renders DuckDB | VERIFIED | Compiler.java:748-758 → `dialectOf` defaults to DuckDb |
| 41 | W6.1 570 plan-text asserts | ASSUMED | cited from W5-W7 #14, no method |
| 42 | W3.2b the pure-m3-core jar's GTM/TM/MM can run against our types | ASSUMED | never spiked; needs a Type → M3 CoreInstance bridge |
| 43 | D10: corpus run both ways; compile-all lane and API; per-model memo | ASSUMED/unowned | no item builds any of it |
| 44 | D9 "waits for W4.4a" (:7) | WRONG (circular) | §2 says D9 "Blocks W4.4"; §5 "W4.4a (D9)" |
| 45 | status: §7 "rulings D12 open"; IN_FLIGHT ("W0.4 waits on D6", "Next: W1.1", "Seven decisions open") | STALE | D6, D12 ruled; W1.1 (1) done; only D9, D11 open |
| 46 | total 96–151 (:393) | WRONG | the per-wave list sums to 95–152; the headings (W6 11–18) to 94–150 |
| 47 | W0.1 gate: a file/tcp connection in a request is refused (:154) | STALE | the item dropped per-spec refusal; no such test |
| 48 | W0.5 gate: the GATES entry lists each removed guard | not met | ed85b5166 has no GATES entry |
| 49 | H5 quiet baselines have a receipt | VERIFIED | receipts/rebuild-h5-baselines-ed85b5166/timings.tsv |
| 50 | "every GATES entry names its receipt" (§7:428) | WRONG in practice | only rebuild-h5 and rebuild-w1.6 exist; W0 batches, W0.3, W1.1 (1) name none; receipts not in git |

Also: "no hand-typed counts" (:15-16) is broken throughout (two counts went stale within the day); rule 0.12's commit
5a2c8132e added `core_layering_test` with no GATES entry.

## 2. Where the size estimates come from

- Unit undefined ("working sessions, judgment", :138).
- Basis: H1 auditors' judgement informed by counts (W4-middle.md:59-62, W2 #24, W5-W7 #13); no conversion factor.
- Only 6 items have their own size (W1.1, W1.5, W2.3a, W4.1a+b, W4.3, W5.5); wave sizes are not sums of items.
- The evidence base disagrees: 45–65 (09-28), 90–145 (H1 README), 65–100 (W4-middle.md:62), 96–151 now (which does not add
  up, #46).
- Calibration: W0 (sized 3–5) plus W1.6 plus W1.1 (1) landed as commits between 00:36 and 01:59 on 09-29 in one session,
  with drafting fanned out to subagents: mechanical and probe items are overestimated ~3–5×, and "session" changes size
  with subagents. The real cost driver so far is re-planning (step 3's Callee design ruled 09-27, superseded 09-29; H2's
  side table reversed within hours; the plan rewritten four times in five days); nothing measures it.
- Least grounded: W4.3 18–30; W4.4b "open-ended" (in no total); W3.2b/W3.3 (unspiked matcher differential); D10's
  compile-all mode, lane, API and memo (unsized, unowned); W1.8 (no size, no design); W6.2; W5.5.
- Recommendation: record per item in GATES the commits, wall time, chain runs and red first chains; re-fit after W1.

## 3. Fresh-session test (documents only)

**W0.4.** (1) IN_FLIGHT says W0.4 waits on D6; the plan says D6 is ruled (guess: trust the plan). (2) Finding the pass
needed grep: StableScanOrder.java, DuckDb.java:218, MinimalCorpusTest.java:139, the rcorpus registers; the always-on
`CanonicalRenderSql:436` found by hand (guess: whether D6 covers it). (3) Counting the 993: method unspecified (static
classification of the rewritten SQL vs dynamic rerun with the pass off, which needs a code change; positional reads in the
Pure test body happen on the host and never show in SQL); host (993) vs database (936) set; which lane; where the count is
written. (4) The seam: where the rewriter lives, how the harness injects it, whether core-layers.txt gains an edge. (5) No
gate, so by rule 0.3 not ready.

**W1.1b** (the name is not in the plan). (1) Sources: W1.1 bullets 1–2 (:200-204), GATES "Still to come", H3 #1, H1
W0-W1 #2. (2) Reference: extend RefResolutions to print `_genericType`, `_multiplicity`, `_resolvedTypeParameters`
(rebuilds ref_dump, ~50 s, 8 GB); guess: the M3 accessor API and column format. (3) Ours: OurResolutions can print
`c.info()` directly (result type and multiplicity already on the call nodes); bindings from Overloads; guess: where the
side table lives and which guardrails it trips. (4) One canonical printer: where, and the mapping of M3 FQNs, Nil,
function types, relation column types, multiplicity spellings. (5) Join and bless via ReferenceLaneTest.java:42-44;
guesses: bucket naming, whether form-node ids belong here, the receipt path.

**W2.0b** (by §5 after W1.8; the documents never say it can run early). (1) Source: d11's "Open questions" (the plan
cites §6; the questions are in the unnumbered section after it). (2) Hooks: StoreResolver.resolve exit (~:221), Lowerer
relation() default (:749), scalar catch-all (:3135), Anchors.spaceOf (:140), the six native relation arms. Two unmentioned
layering blockers: the probe SPI `DecisionProbe` is in `builtin`, which cannot name `TypedSpec`; the `probe` target has no
`compiler` edge in core-layers.txt: a new SPI plus a recorded layer edge. (3) New rows in probe/Shadow.java and
tools/untangle/probe_counts.py. (4) `--test_env=LL_SHADOW=1`; which lanes is "every suite". (5) No decision criteria for
choosing A–D.

**Documentation a fresh session lacks:** a current next-item pointer (IN_FLIGHT stale); a start-of-session checklist
(fetch/rebase, branch, `OB=$(bazel info output_base)`, load check; the rebuild's GATES entries sit mid-file at ~5685, so
"read the last GATES entries" misleads); a pre-chain run (`bazel test //core:guardrails //core:census //spec:spec_tests`)
and a register checklist for new or moved files (JdbcSurfaceCensusTest, the env-flag list, the OwnCorpusParityTest floor,
per-file pins, claims `also`, ErrorShape, JavaEvalLedger line pins): three of four landed pushes went red on these first;
the commit trailer text; receipt naming and contents; a GATES entry template; how to add a probe; bless procedures per
gate; that `//tools/deps:all` is Bazel's wildcard; a gate for the ~24 of 50 items without one (W0.4, W1.2, W1.3, W1.4,
W1.8, W2.0b, W3.1–W3.2b, W3.5, W3.6, W4.3's later steps, W5.3–W5.5, W6.2, W6.4); a definition of a session.

## 4. Load-bearing assumptions never validated

| assumption | if false | cheap validation |
|---|---|---|
| the reference lane is deterministic (n = 2) | flaky reds, or reasons fitted to noise | 10 runs incl. a cold ref_dump rebuild |
| 8 GB is enough; the chain fits at HOST_RAM×0.6 | OOM once type rows are added | measure peak RSS after W1.1b |
| the corpus represents users (datacube, services) | byte identity on the corpus misses user-path regressions | census datacube's query paths; add a datacube query set to W1.7 |
| DuckDB = H2 is a valid oracle (W1.8) | common-mode bugs; blind to W4 | seed the fuzzer with W0.3's known lowering bugs |
| probe rows cover the decisions | "identical" rows while an unprobed site changed | count row-emitting sites vs all selector sites |
| W1.3's two Compiler hooks see the pipeline | verifier green while the executor path violates | count pipeline entries; hook at stage constructors |
| a static count can split the 993 | misclassifies host-side positional reads | dynamic run with the pass off vs static classification |
| one owner, serial | roster confusion | IN_FLIGHT handshake |
| sessions are about the same size | totals meaningless | log per-item cost |
| legend-pure matchers callable with our types (W3.2b) | the gate cannot be built | a one-day spike: GTM on two World types |
| D10's demand-driven path equals compile-all | silent divergence | the both-ways run needs an owner |
| canonical printers make the two sides' types comparable | type rows all DRIFT noise | diff 100 sampled rows by eye first |
| the four dump prefixes cover what W2–W3 change | coverage pins pass while untouched modules regress | a second module closure, or record out-of-scope modules |

## 5. Shortcuts driven by churn or cost rather than correctness

1. W1.1's side table is justified by cost ("not new fields on 100 constructor sites"); the number has no source and the
   result type is already on the node. Re-justify or narrow to bindings.
2. W0.4/D6 leaves `CanonicalRenderSql:436`'s always-on `ScanOrder.stabilize` unexamined: the product adds an order it did
   not ask for on the database-judge path, contradicting D6 and the 2026-09-20 ruling.
3. W0.5's kept guards: the claims `also` column deferred as "a generator output change" (cost); duplicated generator tests
   kept for tool modes; JavaEvalLedgerTest kept because AGENTS.md names it (process). These pins turned W1.6's first chain
   red; the saving is illusory.
4. W1.6 keeps `accessProperty` in Typer ("churn"); declared in GATES but plan :195 still says it moves.
5. D7 keep both judges: keeps the status quo, avoids a roster re-base, leaves the charter-vs-JUDGING_TWO_MODES conflict
   standing and does not say which judge wins on disagreement beyond the per-assert join. Mild.
6. D10 keeps the difference from the engine: tenet-based, but contradicts §1 ("copy exactly, oddities included"); its memo
   conflicts with ruling 0.8 unless the both-ways check lands first; no item owns it.
7. W4.3's print-back adapter lives from step 7 to W5.1c and reproduces today's stamps (W0.3 showed them broken); nothing
   pins its deletion. Add a pin owned by W5.1c.
8. W1.4 one JVM: consistent with rule 0.8, not a shortcut.
9. W2.3a today's rule first: correctness (rule 0.5), not a shortcut.
10. W0.1 dropped per-spec refusal and the custom header: the reasoning holds but the gate text still demands the refusal;
    fix the gate line.
11. W1.8's DuckDB = H2 oracle: cheap and adequate for W5.2–5.4; must not be cited as a W4 gate.
