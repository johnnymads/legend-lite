# The execution plan: the whole compiler, rebuilt stage by stage behind the oracle

**Rewritten 2026-09-28** after the whole of `core` was read stage by stage
(`plan-audit-2026-09-26/architecture-review-2026-09-28.md`, evidence in `plan-audit-2026-09-26/stage-readings-2026-09-28/`).
This is the ONE living plan. It replaces the step list of the 2026-09-26 version (steps 0–2 of which are done; their
records are in `docs/GATES.md` and the old text is in git history at `601995bc2`), `REAL_PLAN_2026_09_25.md`'s order, and
`NEXT_STEPS_2026_09_28.md` (folded in here and deleted). The research files in `plan-audit-2026-09-26/` stay as the
homework they are; this page says what to build, in what order, gated how.

Keep this page current: when a step lands, mark it done with the GATES.md entry's date; when a number changes, the tool
that measures it prints it into GATES.md — this page carries no hand-typed counts except as dated context.

## 0. Rules

1. **Homework before code, from primary sources** — the pinned trees
   (`$(bazel info output_base)/external/+http_archive+legend_{pure,engine}_src`) and our code, by file:line.
2. **Probe before switch**; the probe's receipt is saved before the switch and the switch is judged against it.
3. **The gate is the oracle plus the numbers**: corpus rosters LOST 0 (by name AND failure class once W1.4 lands), the
   reference lane's disagreement set not grown (W1.1), the phase verifier green (W1.3), golden dumps unchanged except
   where the record explains (W1.5), `bazel test //...` and `//tools/deps:all` green, timing read alone and quiet.
4. **Deletions land with the switch.** A pin that moves carries a dated reason naming the step.
5. **One variable at a time.** Names change with the world held constant; the world changes with names held constant.
6. **Every slice:** homework → probe → switch → gate → deletion → GATES.md record → push to main. Never force-push;
   commit as `neema2 <neema2@gmail.com>` with the session trailers.
7. **A timing is a lane run alone** with `--nocache_test_results`, load under 3 at start; a lane inside a chain is not a timing.
8. **Standing rulings:** no string identity for a declaration; no PCT or category checks in the compiler; no caches
   before the algorithm is proven; every deferral pinned with an owner; we own everything the program needs.
9. **"Strict" means: collect every diagnostic in one pass, poison the failed unit, fail the build on any error**
   (ruled 2026-09-28). It does not mean abort on the first error; it never means accept bad input.
10. **Every new stage gets its own IR type.** A phase boundary is proved by javac, not checked at run time.

## 1. The target (what "expert" means here)

The product is judged by a differential against legend-pure, so resolution and overload semantics copy the reference
exactly, oddities included (`reference-matching.md`, `kernel-reading-2026-09-26.md`). Around that constraint the
architecture is a conventional production front end and a query compiler back end:

| # | stage | IR out (a distinct sealed type) | identity it carries | today's code | stage reading |
|---|---|---|---|---|---|
| A–C | lex, parse | syntax tree (`ValueSpecification` without resolver fields; wire trivia in a side record) | spans only | lexer/, parser/ | A01, A02 |
| W | World (eager knowledge) | declaration tables per kind; per-section import groups; C3 linearizations and variance | `FunctionId` (external key, the reference's element name); `ClassId`/`EnumId`/`StoreId`… as typed FQN wrappers; `DeclId` handles | model/, builtin/, compiler/ModelBuilder | A03, A04 |
| D | resolve | `ResolvedExpr` | call: `Candidates(List<FunctionId>)`; dot access: `Member(name)`; every binder: `VarId`; every element reference: `Ref<Kind>` | compiler/NameResolver | A04 |
| F | elements | typed declarations (`TypedClass`, `TypedFunction`…) keyed by id | ids | compiler/element | A04 |
| G | type | typed HIR (`TypedSpec`): every node typed; every call ONE declaration; every member its property | ids, `VarId` | compiler/spec | A05, A06 |
| E′ | mapping elaboration (after F) | typed mapping IR: per set a typed relation expression and property bindings keyed by `PropertyId` | ids, spans | normalizer/ (today emits untyped text-Pure before types exist) | A06 |
| G½ | inline, shape-evaluate | typed HIR | substitution by `VarId`, one engine | UserCallInliner, StaticFold, SourceSubst, AlphaRename, LiteralUnroll, NormalizeFolds… | A05 |
| H | store resolution, as passes | physical IR (distinct type): routed sets, a join tree, `ColumnRef(JoinNodeId, column)` | `SetId`, `NavId`, `JoinNodeId` | resolver/ (35,925 lines, one pass) | A07-A08 |
| I | lower | SQL MIR (semantic nodes; units, parts, join kinds as enums; no SQL spelling) | `FunctionId` → one immutable rule table | lowering/ | A09 |
| J | legalise + render | SQL text per dialect | — | sql/, sql/dialect | A10 |
| P | plan | plan IR (sealed: SqlExec, Sequence, Allocation, Effect, VerdictBatch…) | — | plan/ (no IR today), StatementExecutor | A11 |
| K | run | results | — | exec/, a thin runner | A11 |

Cross-cutting: `Diagnostic(code, severity, phase, span, args)` in a sink from every stage; a phase verifier asserting
each IR's post-conditions after every pass in tests; per-pass golden dumps; the reference lane; the corpus with rosters by
(name, failure class); a query fuzzer with DuckDB-equals-H2 as oracle.

## 2. Decisions

| id | question | status |
|---|---|---|
| D1 | The call node's type: the 2026-09-27 ruling (one `AppliedFunction`, a sealed `Callee` slot `Spelled`/`Bound`, checked at run time) or a distinct `ResolvedExpr` family so javac proves no unresolved tree reaches the typer | **RULED 2026-09-29 (the user): a distinct `ResolvedExpr` family.** It supersedes the 2026-09-27 run-time `Callee` slot; W2 is written for it; §6 is kept only as the record of the alternative |
| D2 | Binding scope | **RULED 2026-09-28: everything** — calls, members, binders (`VarId`), element references. Landed as separate pushes on one new tree type (W2.3–W2.6) so each roster change is attributable |
| D3 | A reference lane at the pinned release | **RULED 2026-09-29 (the user): build it as W1.1 describes.** No new downloads appear needed: all 27 modules of `core_relational`'s closure are already resolved in `maven_upstream_install.json` at 4.145.0 / 5.99.0 (checked 2026-09-28); the lane is a new test target over them |
| D4 | "No tolerant modes" | **RULED 2026-09-28**: rule 0.9 |
| D5 | Plan the whole program now | **RULED 2026-09-28**: this page |

## 3. Done

| step | what | record |
|---|---|---|
| 0 | annotations to `com.legend.base`; two leaf moves; `//core` as 29 Bazel targets | GATES.md 2026-09-26 "Execution plan step 0" |
| 1 | the reference differential joins call by call | GATES.md 2026-09-26 "step 1" |
| 2 | lowering registers by `FunctionId`; one identity | GATES.md 2026-09-26 "step 2" |
| 3-homework | kernel reading, resolver per-statement fix, tier probe | GATES.md 2026-09-26 "step 3 homework" |
| 3-probes | nine counts before any step-3 switch; tier classifier corrected | GATES.md 2026-09-27 "step 3, the probe push" |
| audits | program audit; architecture review; stage readings | `plan-audit-2026-09-26/` |

## 4. The waves

Each item is one push unless it says otherwise. Estimates are in working sessions and are judgment, labelled as such.

### W0 — Now: safety and confirmed defects (≈2–3 sessions)
- **W0.1 Close `/engine/sql`** (arbitrary SQL, all interfaces, CORS `*`; `server/LegendHttpServer.java:40,53,248`). Owner:
  the `server/` owner (the DataCube/warehouse session); announce in IN_FLIGHT. Delete it, or bind to localhost behind a
  dev flag.
- **W0.2 Five confirmed defects**, each with a failing test first: H2's test-only UDF (`sql/dialect/H2.java:719`,
  `EngineStyleH2.java:1704,1899`); `StaticFold` `toOne` on a list (`StaticFold.java:692-694`); positional unify fallback
  (`InferenceKernel.java:84-101`); the static-state guard's two-line escape (`exec/CanonicalDivergence.java:558-559`,
  replace the regex with an ArchUnit field rule); `sql` → `compiler.element.type` via an inlined constant
  (`EngineStyleH2.java:262`, `core/BUILD.bazel:85`).
- **W0.3 Probe the latent ones** (a failing test or a recorded "not reproducible"): lowerer let scoping; inliner
  capture; `TypedFilter.stamp` dropped at 12 rebuilds; `withChildren` field drops; import scope keyed by element FQN;
  UTF-16 vs code-point columns; `ServiceTestRunner` hashCode keys; `PureDateLiteral` with validation off; the
  NameResolver NPE; the store resolver's alias-prefix temporal bug. Evidence per item: the review's §4 table and the
  stage readings.
- **W0.4 The corpus certifies product SQL**: move the `legend.exec.engineScanOrder` pass out of the product DuckDB
  dialect into the harness, or add a product-SQL lane (`DuckDb.java:218`, `MinimalCorpusTest.java:139`).

### W1 — Gates and foundations (≈4–6 sessions). Everything later is judged by these.
- **W1.1 The reference lane at the pinned release.** A Bazel `java_test` (tagged manual, `resources:memory:12288`, run
  on every front-end slice) that loads `core_relational`'s 27-module closure from `@maven_upstream` with legend-pure's
  interpreted runtime, compiles it, and dumps per call site the declaration id, resolved type parameters, and the type and
  multiplicity of every expression; our side dumps the same from the typed HIR; the join (today `tools/reference/join.py`)
  becomes Java in the lane; the disagreement set is pinned with a reason per row. Removes SOURCE_DRIFT (52,266 rows today,
  jar 4.138.5 vs trees 4.145.0) and adds types. Homework: confirm the `-pure` jars ship their `.pure` resources; the load
  order `loadAndCompileCore` → `loadAndCompileSystem` (tools/reference/README.md).
- **W1.2 Diagnostics foundation**: `SourceFile`/`LineMap` with ONE column unit, `Span`, `Diagnostic`, a sink,
  poison-and-continue; the parser, resolver and typer report into it first. The corpus harness classifies failures by
  diagnostic code, not message text.
- **W1.3 Phase verifier**: after each pass in tests, assert the IR's post-conditions (every typed node typed; no
  store-only node after H; no SQL-spelling string in MIR…). Starts with today's IRs; each new IR adds its own.
- **W1.4 Rosters by (name, failure class)** and the corpus as sharded dynamic tests; the stress lane's pass COUNT
  (`StressServiceSuitesTest:154`) becomes a roster.
- **W1.5 Golden dumps per pass** (typed HIR, MIR, SQL per dialect) for a fixed set of programs, blessed by
  `update_generated`; replaces `sql.contains(...)` asserts over time.
- **W1.6 The typer split along its stage seam** (the old step 4): `applyCore` and the 39 checkers out of `Typer.java`
  (3,499/3,500) so W2 has room.

### W2 — The resolved tree (≈6–9 sessions). The old step 3a/3b, widened by D2.
- **W2.1 World tables**: per-kind declaration tables with ids; one `(package, name) → List<FunctionId>` index built once
  per World (the lite partition applied at the index; 37 `meta::legend::lite` natives, GATES "probe push" #6);
  duplicate ids refused (the four qualified-property collisions of step 2 stay walls until W3.5); a collision guard on
  the mangle (`Pure.java:616` has none).
- **W2.2 Import groups per section**, attached to each declaration by section, not keyed by element FQN (fixes the
  first-wins bug, `NameResolver.java:258`, `ElementParser.java:325,393,478`); the core group is the reference's 29 for
  Pure source and the engine's 32 for engine input (the parser's `Dialect` carried on `ParsedModel` and the query entry
  points).
- **W2.3 `ResolvedExpr` + calls.** The resolver emits `ResolvedExpr`; a call carries `Candidates(List<FunctionId>)` under
  the reference's rule (imports ∪ core ∪ Root, no own-package tier; `reference-matching.md` 1–3); the merge point's
  bare-name rule moves into the resolver (27 parsed bare names, 41 minted — probe push #8); zero candidates is a
  positioned diagnostic poisoning the call. The typer reads `ResolvedExpr`. Proof: CANDIDATES multiset identical except
  rows the reference lane explains.
- **W2.4 `Member(name)`** for the dot spelling (106 names per corpus lane, program audit #1); the typer resolves it
  against the receiver's type and emits the reference's rewrites (automap `map`, `extractEnumValue`, milestoning dates);
  the arrow spelling is a function call only (7 qualified properties reached from it today become reference-lane rows).
  `new` gets its catalog declaration (`new.pure:29`).
- **W2.5 `VarId` for every binder** (lambda parameters, `let`); every reader switches (≈88 `new Variable(` and ≈118
  `new TypedVariable(` constructions, ≈217 matches, 126 files — counted 2026-09-28). The four substitution engines key on
  `VarId`; name-based alpha-renaming is deleted where `VarId` makes it moot.
- **W2.6 Element references as ids** (`Ref<Class|Enum|Store|Mapping|Runtime…>`; ≈167 pointer/enum-value sites); the 175
  element-name compares shrink to the ones that are genuinely type-shape tests.
- **W2.7 Desugars bind their declaration**: the ~69 typing-time mints and the normalizer's bare-name mints name the ONE
  declaration they mean; an overload group only where the reference itself searches (automap `map`).
- **W2.8 The merge point by table** (old 3d): `FunctionCompiler.functionsAt` reads the declaration table only;
  `isPlatformOwnedFunction`, the PCT stereotype check and `SUPPRESSED_ONCE` deleted; one declaration per id (task #43).

### W3 — The typer is the reference's (≈6–10 sessions). Old 3c, 3e, steps 5 and 6, re-ordered.
- **W3.1 TDS inventory first** (old 3e homework): the 45 `isRelation`/`relationValued` readers; decide the carrier
  (recommended: nominal `TabularDataSet` as the type, the schema as a side fact, a widened `isRelationShaped` in
  lowering); the parameter-half probe.
- **W3.2 The matcher** (FEM/FM/GTM/TM/MM) as a self-contained module, one test per trap in `kernel-reading` §C;
  meta-variables with union-find replace name-keyed `Bindings`.
- **W3.3 The candidate loop** (FEP): lenient order, per-candidate lambda typing, strict re-rank, "Too many matches";
  silent survival walled with the reference's reason and declared as a reference-lane elision. Both of today's overload
  algorithms and their tie-breakers deleted. Gate: reference lane OVERLOAD 0 and TYPE-DIFF not grown.
- **W3.4 TDS erasure out of the typer** per W3.1's decision (the eight `size` rows → 0; 32 → 14).
- **W3.5 Kernel rules** (old step 6): classify the census's kernel failures against `TypeInferenceContext.register`
  (LUB with variance, `GenericTypeOperation` for relation schema algebra, reverse inference); each rule gated by the
  reference lane's type rows; checkers that existed only for kernel gaps retire.
- **W3.6 Forms by a candidate's Form row** (old step 5), only for what W3.5 leaves special (legacy TDS, column-spec
  post-match fix-ups); `CoreFn.of(spelling)` deleted.

### W4 — The middle (≈10–15 sessions). New.
- **W4.1 Mapping elaboration after F**: a typed mapping IR (per set: typed relation expression, `PropertyId`-keyed
  bindings, join edges) replacing the normalizer's untyped text-Pure; embedded user fragments typed by the real typer;
  the normalizer's private name resolvers and string typing (`DeclaredCoercions`) deleted.
- **W4.2 One G½**: one hygienic substitution engine over typed HIR by `VarId`; the shape evaluator within the charter
  ruling (old step 7: the ruling in `TENET_CHARTER.md` first); `StaticFold`, `SourceSubst`, `AlphaRename`,
  `inlineNormalized` deleted; source-level β-expansion during typing ends.
- **W4.3 Store resolution as passes** into a distinct physical IR: route (mapping dispatch, set choice incl.
  aggregation-aware) → demand (one path trie by `PropertyId`) → temporal attribution (an immutable `NavId →
  TemporalContext` map) → join planning (an explicit join tree with the strategy table as data) → read lowering to
  `ColumnRef(JoinNodeId, column)`; physical names minted last; graph-fetch planning its own pass. Landed pass by pass,
  each behind the corpus and golden dumps; the string identity schemes (`#` heads, dotted chain keys, prefixes) deleted
  as each pass replaces them. The largest item in the program.
- **W4.4 Load by manifest** (old step 9), names held constant: walls to zero, then the corpus loader reads the manifest
  closure strictly (rule 0.9).

### W5 — The back end (≈5–8 sessions).
- **W5.1 One lowering table**: `FunctionId → rule`, immutable, duplicate-refusing, IS the implementation table; the five
  mutable maps and six side channels and the 30 callee-name dispatches deleted; no type inference in the lowerer
  (those decisions become typer annotations).
- **W5.2 Semantic MIR**: units, parts, join kinds, frame roles as enums; no DuckDB spellings in MIR; deep immutability.
- **W5.3 Legalisation per dialect** with declared pre/post-conditions and a verifier before emission; a fresh-name
  supply; one `Identifier` value and one escaper per dialect (fixes the injectable DDL paths).
- **W5.4 The ANSI split** with an embedded Postgres corpus lane (the old "later phase"): `Spellings.ANSI`, DuckDB as a
  layer, H2's undo-overrides deleted; `SqlTyping` per dialect.

### W6 — Plan, runner, periphery (≈6–10 sessions).
- **W6.1 Plan IR**: a sealed plan tree; one printer (engine plan text), one row serializer, one renderer; `plan/`'s string
  plans deleted.
- **W6.2 The runner**: plans a test body whole, then runs it; `StatementExecutor` stops re-running G, G½, H, I; the
  census and env tracing become an injected observer; global static state removed.
- **W6.3 Judges**: the database judge is the only product judge; the host judge moves to the test module.
- **W6.4 Periphery**: lineage over the typed HIR plus a binding map from H; test-data generation through the MIR and
  the dialect; the server a thin adapter over one compiled workspace; test runners and the probe out of the product jar.

### W7 — Close-out (≈3–5 sessions).
- `compiler_mid` and the other cyclic groups split into per-stage targets; a below-top-level cycle rule.
- Regex guards subsumed by types deleted (identity shapes, carrier idioms, string dispatch, funnel registers); the
  ceremony guards deleted (A13 §2); the line-count guard dropped.
- The query fuzzer (DuckDB vs H2) as a standing lane.

**Size (judgment):** W0 2–3, W1 4–6, W2 6–9, W3 6–10, W4 10–15, W5 5–8, W6 6–10, W7 3–5 — roughly 45–65 working
sessions. W4.3 (the store resolver) is the largest and least certain.

## 5. Order and parallelism
W0 and W1 first; W1.1 (the reference lane) before any W2 or W3 switch. W2 before W3. W4.1 after W2 (it needs ids). W4.3
after W4.1 and W3 (it needs typed mappings and one declaration per call). W4.4 after W2–W3 (names constant while the world
changes). W5 after W4.3 (it lowers the physical IR). W6 can start after W5.1. W0.1 and W5.4 have separate owners and can
run in parallel with anything. Nothing runs against the same rosters as another slice in flight (rule 0.5).

## 6. The alternative D1 did not take (record only)
W2.3–W2.6 put the resolution on the parse nodes instead: `AppliedFunction`'s callee becomes the sealed `Callee`
(`Spelled` | `Bound` | a third case `Member(name)`); `VarId` and element ids become fields on `Variable`,
`LambdaFunction` parameters, `PackageableElementPtr` and `EnumValue`, null before resolution. The typer switches on
`Spelled` and throws "compiler bug". Everything else in this plan is unchanged; rule 0.10 is then waived for D.

## 7. Session bootstrap
- **Repo:** `~/legend/legend-lite`, worktree `.claude/worktrees/build-audit`, branch `datacube/app` tracking
  `origin/main`. Bazel 9. Untracked `nlq/` is not ours.
- **Read, in order:** `docs/IN_FLIGHT.md`; this page; `plan-audit-2026-09-26/architecture-review-2026-09-28.md`; the stage
  reading for the area you touch; the last `docs/GATES.md` entries; for anything in D/F/G the reference research
  (`reference-matching.md` with its corrections, `kernel-reading-2026-09-26.md`).
- **Pinned trees:** `OB=$(bazel info output_base)`; `$OB/external/+http_archive+legend_pure_src` (5.99.0),
  `…legend_engine_src` (4.145.0); jars at the same releases in `@maven_upstream`.
- **Gates:** `bazel test //...` then `bazel test //tools/deps:all`. Corpus `//spec:corpus_duckdb`, `//spec:corpus_h2`.
  Probe `--test_env=LL_SHADOW=1` (counts: `tools/untangle/probe_counts.py`, `bare_tiers.py`). One corpus test:
  `--test_env=JAVA_TOOL_OPTIONS=-Drcorpus.test=<fqn>`.
- **Receipts:** `~/legend/platform-architecture/receipts/` (not in git); every GATES.md entry names its receipt.
- **Commits:** `git -c user.name=neema2 -c user.email=neema2@gmail.com commit -F <file>` with the session trailers.
