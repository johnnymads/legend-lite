# H1 audit — W5, W6, W7 (back end, runtime, close-out), 2026-09-29

Reader's report, preserved as returned. Read: the plan, the review, A09–A14, renderer.md, lowering.md, TENET_CHARTER.md.
Whole: PlatformRegistrations, ExecuteOptions, BodyCompiler, core/BUILD.bazel, MinimalCorpusTest's judge-mode logic.
Structure of Scalars (static initializer 81–2487); the parts of Lowerer, StatementExecutor, Compiler.dialectOf,
HostJudge, DatabaseJudge, AssertVerdicts, the dialects and plan/ the claims depend on. Paths under
`core/src/main/java/com/legend/` unless stated.

## Direct answers
- **W5.1 vs A14 #10: keep the table derived.** "The lowering table IS the implementation table" cannot be built: `:platform`
  depends only on base, builtin, model (core/BUILD.bazel:73) and `:compiler` depends on `:platform` (:95), while a rule is
  typed over `TypedNativeCall` and `SqlExpr` (Scalars.java:54-56) — platform cannot hold rules without a cycle; the typer
  reads the table before any lowering exists (compiler/spec/CallNodes.java:29-37); the table is per model and includes user
  Body rows (PureModelContext.java:595-598) while rules are process constants; moving 131+ lambdas into rows is churn.
  Instead: one immutable `LoweringTable` in lowering, (FunctionId, Position) → Rule, built once, refusing duplicates,
  checked one-to-one against the ImplementationTable's Intrinsic positions at construction (replacing the key-set
  derivation, PlatformRegistrations.java:54-59, RegistryKeys); optionally a `RuleRef` enum in platform plus a total EnumMap
  in lowering.
- **W5.2 vs the renderers' idiom matching:** the enum part can land; the semantic-collection part cannot. ~150+ shape-match
  sites (CarrierStrategies 56 `instanceof` + 5 `fn()==` across 13 "witnessed" rules; EngineStyleH2 51 `instanceof`; H2 16
  `==SqlFn`; LateralExplodeToUnion 10; FoldToListReduce; CheckedDefectsToLists) key on SqlFn and node shape, not unit
  strings, so enum work leaves them intact. Unit strings are the exposure: 13 `to_*` emit sites (DateShifts 10, Scalars 2,
  CalendarAgg 1) decoded at H2 9, EngineStyleH2 9, EngineStyleDB2 7, Ansi 1 (plus `"to_weeks".equals`,
  AnsiSqlRenderer.java:785); the eight `(SqlExpr.StringLit)` hard casts are run-time casts javac will not find.
- **Postgres lane:** 3–6 sessions for the lane alone (finding 10).
- **"Database judge only" (W6.3):** inconsistent with the charter as written (16); host-only passes: DuckDB 0, H2 65 (17).
- **W6.2:** needs a staged plan design, not "plan whole, then run" (14).
- **W7 guard deletions:** prerequisites in 24.

## Findings
1. **BLOCKER** — W5.1 as worded cannot be built (above). Change to the derived design; cite A14 #10.
2. **GAP** — refusing duplicates will fail class initialization today: 124 `RULES.put` in Scalars + 13 `register(RULES)`
   calls into 9 satellites (Scalars.java:469…2011); silent overrides `times` (:294, :311), `startsWith`/`endsWith` (:525
   then :556), `median`, `hash`, 2-arg `dayOfWeekNumber`; `in([0..1])` reads `in([1])` lazily (:2401-2410). Add a probe
   push naming the dead earlier rule per key, then delete them (rule 0.2's receipt).
3. **GAP** — "no type inference in the lowerer (decisions become typer annotations)" is typer work no W3 item owns:
   CastPolicy 208-252; InstanceEquality.staticallyDisjoint; MixedEncoding.kindMismatch; MatchFold subtyping by FQN (46-61);
   Numerics.compareKind; Scalars.instanceOfFold (2521-2545); precision from `date()` arity; LambdaBinding lambda parameter
   types from SQL types (292-343); 40 `instanceof TypedC*`; 19 layout lookups. Split: W5.1a (the table), W5.1b (HIR
   annotations; depends on W3.5 and W4.3).
4. **BLOCKER-class GAP** — no item migrates lowering onto W4.3's physical IR: 49 of 75 lowering files use typed HIR nodes
   (~1,089 references to 82 `Typed*` names); the Rule signature is over TypedNativeCall. W4.3 must say whether scalar
   subtrees stay TypedSpec; if not, several uncosted sessions.
5. **WRONG** — "join kinds as enums": `SqlSource.Join.Kind` is already an enum; only its `sql` field (SqlSource.java:172) is
   the defect, read at 2 sites (AnsiSqlRenderer:316, EngineStyleH2:1022). Interval units also exist as strings in the typed
   HIR (`WindowFrame.Bound.Interval*(long, String unit)`, compiler/spec/typed/WindowFrame.java:32-35; Frames.java:129-132):
   the enum starts in G. Make each unit/part a distinct MIR record (`AddInterval(IntervalUnit,…)`, `Extract(DatePart,…)`)
   so javac lists every reader.
6. **GAP** — W5.2 ignores the carrier program in flight: CarrierStrategies is already "the strategy pass" for semantic
   collection nodes (CarrierStrategies.java:15-28) with shrink-only pins in CarrierPurityRatchetTest (`new SqlExpr.ArrayLit(`
   at 40). State whether W5.2 includes that ladder; if so it owns the ~150 sites and the ratchet reaching zero is its gate.
   Deep immutability (~29 uncopied List components; `SqlRewriter.mapList`) needs a probe first.
7. **BLOCKER** — "SqlTyping per dialect" (W5.4) depends on W5.1b and W5.2: typing runs inside MIR constructors (79
   `SqlTyping.` calls in SqlExpr.java) and lowering reads the results (39 TypeFact references); dialect-dependent typing
   cannot run in dialect-blind constructors.
8. **WRONG** — §5 "W0.1 and W5.4 have separate owners… parallel with anything": one session owns everything; W5.4 rewrites
   the base DuckDb (DuckDb.java:21), H2 (H2.java:29), EngineStyleH2 (:28, :305 with Spellings.DUCKDB) and SQLite
   (Compiler.java:855-859) inherit — parallel breaks rule 0.5; EngineStyleH2 and the SQLite constructor must be repointed in
   the same commit.
9. **GAP** — no render-diff harness; DuckDB byte identity guarded only by execution; W1.5's goldens cover a fixed program
   set. W5.2–5.4 are refactors: their gate should be corpus-wide byte identity per dialect incl. EngineStyleH2. Add W5.0.
10. **GAP** — the Postgres lane: only DuckDB, SQLite and H2 drivers in MODULE.bazel (:66-68); `org.postgresql` only in the
    `maven_runner` tool pool ("never on a test classpath"); needs zonky `embedded-postgres` plus binaries per OS (CI: ubuntu,
    macos-14, windows-2022, gate.yml:53-86; Windows not verified) — a repin; no Postgres dialect class;
    `Compiler.dialectOf` sends any non-H2 session with H2-declared connections to DuckDb (Compiler.java:747-758,832-835) — a
    Postgres session would silently render DuckDB SQL; the harness is binary (`H2_BACKEND`, MinimalCorpus.java:480, 26
    ternaries in three files); sessions in-process today (the DuckWorkspaces warehouse child is the out-of-process
    precedent); isolation per session (CREATE DATABASE); the corpus's raw SQL is written for H2; each lane runs twice (host
    prerun + database, spec/BUILD.bazel:90-94), existing lanes ~340 s in-chain — renderer.md's "+40–60 s" not credible; the
    first fail roster unknown (H2's went 727 → 361).
11. **GAP** — W5.3's escaping reaches only the dialects; concatenated SQL outside: StatementExecutor.java:3050-3051
    (`"Create schema if not exists " + evalStringArg(...)`), :3218-3219; exec/Ddl.insertText; plan/InProtocol.tempSelectSql;
    TestDataGenerator.planLit. RISK: the fresh-name supply must not reach EngineStyleH2 text compared byte-for-byte with
    engine goldens whose aliases are fixed (`unionAlias`…).
12. **RISK** — the line guard blocks W5.1: Lowerer 3,499, Scalars 3,476, FILE_LIMIT 3500, empty allowlist
    (CodeShapeGuardrailTest.java:38,48). Drop it or split lowering before W5.
13. **RISK** — size: W5 10–16 sessions (table 2–3, annotations 3–5, enum MIR 1–2 without the carrier ladder, W5.3 2–3,
    ANSI 1–2, Postgres 3–6); W6 12–20 (ScanRelations alone 2,717 lines; W6.2 the hardest back-end item).
14. **BLOCKER** — "plans a test body whole, then runs it" contradicts plan-time reads of the live database: a verdicts
    segment planned only after preceding effects ran (BodyCompiler.java:43-52: frame wire types after seeding, a raw read's
    schema); the TDG census fold reads the session (:67); `establishContexts` (:70); `DynamicPivot.staticize` and
    `PctProbe.probe` in `lowerAndPrepare` (StatementExecutor ~2190, 2211); `WireTypes.reconcile`/`staticized` (:2731, :2761);
    GridProbe via `gridOracle` (:1336); a per-connection wire-type memo in static ESTABLISHED (:2096-2103); `map` over an
    effectful lambda iterating per fetched value (:2471-2506). Change: a staged plan IR with late-bound nodes (SchemaProbe,
    DynamicPivot, ForEach(values, template), Effect barrier) and a runner resolving them in order; add them to W6.1.
15. **ORDER** — W6.2 needs W6.3 first (under the host judge nothing is deferred: batch null, BodyCompiler.java:186; "the value
    runs now, in walk order", :204-206) and W4.2 before it can stop re-running G½.
16. **WRONG premise, needs a ruling** — W6.3 vs the charter: C2b (TENET_CHARTER.md:61-76) grants asserts and "comparison
    policies over already-produced results" as legitimate Java natives; C2c (:78-92) makes verdicts World 1's job and says
    compiling the assert library into SQL to produce verdicts violates it; Z2 pins PureAsserts as the verdict channel.
    JUDGING_TWO_MODES (user decision 2026-09-17) made DATABASE mode the product goal with HOST "the reference"; the charter was
    never amended (last commit 2026-09-03); the gate still says "host is the reference" (MinimalCorpusTest.java:519-521).
    Review defect #10 misreads C2b. Change: a decision D6 and amendments to C2c, Z2 and VerdictChannelRegisterTest before code.
17. **GAP** — the cost of "database judge only": DuckDB loses 0 (lost register empty); 3 DuckDB rows accepted only in
    database mode as engine-golden defects; H2 loses 65 (61 "DialectCapability: variant navigation reached a dialect without
    JSON support", 4 an UNJUDGED `assertJsonStringsEqual`), 8 untriaged, unjudged ceiling 5, gains 72. The roster of record
    is the host prerun (spec/BUILD.bazel:91; MinimalCorpusTest.java:944-975): W6.3 re-bases both rosters (H2 nets −7) and
    inverts `pinJudgeDifferential`. The stress lane has no database mode (MIN_PASS 4,700 / 4,622,
    StressServiceSuitesTest.java:153-154); its judge is `test/TestAssertions` (EqualToJson) and no EqualToJson verdict exists
    in lowering or DatabaseJudge: W6.4 moves the service runner out first, or a database EqualToJson native is built.
18. **GAP** — moving the host judge is not a file move: HostJudge is a package-private VerdictArm (HostJudge.java:14, :794)
    over package-private `StatementExecutor.ExecEnv` (35 uses) and `evalValue` (5); AssertVerdicts calls HostJudge 10 times
    (:370-371, :729, :863, :873, :1545-1548) and uses `TdsCompare.grids` in a shared arm (:365); `DatabaseJudge.eq` delegates
    class-instance pairs to `HostJudge.eq` (:649); TestDataGenerator uses `PureAsserts.repr` (:1295). Needs a public judge
    SPI or a split package; cost it.
19. **GAP** — W6.2's gate (the outside-body registers, DuckDB 43, H2 142, MinimalCorpusTest.java:984-1041) is measured by the
    `StatementOrigin` ThreadLocal census W6.2 replaces; probe both before switching.
20. **GAP** — W6.1's plan IR depends on later work: `plan/` calls G (RelationalMapperRenames.java:106) and depends on
    lineage; PlanAllocations re-walks C's AST for lineage; the printer needs those facts, so it depends on W6.4's lineage over
    HIR or carries a protocol field meanwhile. Its gate can be the 570 plan-text assert sites.
21. **GAP** — W6.4: PCT calls `QueryService.execute` (55 spellings in 10 pct files), so the adapter keeps it; `:core` exports
    `:test` and `:probe` (BUILD:205-208) and the spec harness imports `com.legend.test.PureTests` — moving them changes spec's deps.
22. **WRONG** — `compiler_mid` does not exist; the cyclic group is `//core:compiler` (BUILD:91-99).
23. **ORDER** — the fuzzer at W7 is too late: it is the oracle W5.2–5.4 need, and it needs a register of declared DuckDB/H2
    divergences first (H2AvgDelivers; LateralExplodeToUnion handles literals only; H2 361 fails vs DuckDB 107). Move it before W5.
24. **ORDER** — W7 guard deletions: safe now, before W5/W6 — the ceremony guards (JavaEvalLedger EVICT_SIZE, the JDBC
    TEST_REGISTER, DanglingState rule 2, the funnel registers, ParkedWork, ShadowWalker zero rows, the claims `also` column,
    duplicate parity tests); EVICT_SIZE pins exact line counts (StatementExecutor 2,392 at JavaEvalLedgerTest.java:668,
    AssertVerdicts 1,249, HostJudge 806, DatabaseJudge 595, SqlTextVerdicts 1,240, PlanText 882), so every W6 push would edit
    a pin. The line guard: before W5.1. IdentityGuardrailTest (NAME_COMPARE 208 etc., :140-151): pattern by pattern after
    W2.3–2.8, W4.1, W4.3, W5.1, W6.2. CarrierPurityRatchetTest: when W5.2 brings its pins to zero. ObservabilityGuardrailTest
    `STRING_DISPATCH_SITES = 87` (:76) is the charter's C6.1 enforcement (TENET_CHARTER.md:194): replace it or amend the
    charter. VerdictChannelRegisterTest: after W6.3 and D6. JavaEvalLedgerTest's residue register (AGENTS.md's execution-tenet
    enforcement): only after W6.2/6.3 and an AGENTS.md edit. General rule: a regex guard goes only when the W1.3 verifier
    asserts its invariant.

## Not verified
Whether database mode ever reaches AssertVerdicts' Java grid arm (:352-372; host-compared register 0 on both lanes suggests
not); zonky on Windows CI; MIR list mutation after construction; which judge the PCT lanes use.

## Verdict
W5 and W6 are not executable as written. W5 after: W5.1 derived and split (table / annotations); W5.2 scoped as distinct
records or enums plus a decision on the carrier ladder; W5.0 a render-diff harness first; W5.4 after W5.1b and W5.2, in
series, with the Postgres lane costed (jars per OS, dialect dispatch, a third harness backend); the lowering move onto the
physical IR scheduled. W6.2/W6.3 need a re-plan: a D6 charter ruling, then W6.3 (roster re-base, stress lane, judge SPI),
then a staged plan IR with late-bound probe, effect and loop nodes, then W6.2. W7 executable once the name is fixed and its
guard deletions redistributed (ceremony guards and the line guard to W0/W1; each regex guard after the type or verifier
that replaces it).
