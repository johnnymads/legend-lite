# The execution plan: the whole compiler, rebuilt stage by stage behind the oracles

**Rev H2, 2026-09-29.** This is the ONE living plan. History: rewritten 2026-09-28 after the whole of `core` was read stage by
stage (`plan-audit-2026-09-26/architecture-review-2026-09-28.md`, `stage-readings-2026-09-28/`); rev H1 after an
adversarial audit of every wave (`plan-audit-2026-09-26/h1-plan-audit-2026-09-29/`); **rev H2 after a six-lens meta-audit
of the plan itself** (`plan-audit-2026-09-26/meta-audit-2026-09-29/`, synthesis in its `README.md`) and the user's rulings
D13–D18. Rev H1's text is in git history at `89dc45871`. Audit findings are cited as `[W2 #5]` (H1 report
`W2-resolved-tree.md`, finding 5) and `[L3 #4]` (meta-audit lens 3, finding 4).

The research files in `plan-audit-2026-09-26/` are the homework; this page says what to build, in what order, gated how.
Keep it current: when an item lands, move it to §3 with its GATES.md heading, and update §0's "Now" line in the same push.

---

## 0. Start here (a fresh session with no context)

**Now (update in every push):** W0.6, fix the reproduced wrong-results defects, in the push order of
`plan-audit-2026-09-26/w0.6-homework/README.md` (homework done: each report names the root cause at file:line, the fix,
the blast radius and the gate). Open decisions that block only single fixes: D20, D21. After W0.6: W1.0b (baselines), W0.4, then W1 in §5's order.

**What this program is, in one paragraph.** legend-lite (`core/`, ~229k lines of product Java) is a clean-room
replacement for legend-pure's compiler and legend-engine's query execution: Pure text → parse → resolve names → type →
inline → resolve classes to tables → SQL → run on DuckDB/H2. It works (corpus rosters, PCT lanes), but its middle is
tangled: a 3,500-line typer, a 36k-line one-pass store resolver, names compared as strings, semantics carried as flags
that rebuilds drop. The program rebuilds it stage by stage into a conventional expert compiler (§1), landing on `main`
slice by slice, every slice gated green, never a big bang. Goals (D17): cleaner, more bulletproof, much less code,
faster, the cruft deleted, and wrong answers found and fixed first.

**Checklist, every session:**
1. `cd ~/legend/legend-lite/.claude/worktrees/build-audit` (one session owns the repo since 2026-09-29; untracked `nlq/`
   is not ours, leave it). `git fetch origin && git status -sb`. Work on branch `compiler/rebuild`; it must equal or be
   ahead of `origin/main` (D18: every gated slice is pushed to both). If `origin/main` moved, `git merge --ff-only
   origin/main`; if that fails, stop and ask.
2. Read, in order: this §0; §2 (decisions, do not re-ask a ruled one); the item's entry in §4 and the homework it cites;
   the item's stage reading in `stage-readings-2026-09-28/`; the three newest `— Rebuild` entries in `docs/GATES.md`
   (they are NOT at the end: `grep -n '— Rebuild' docs/GATES.md | head -3`; rebuild entries are newest-first, starting
   near line 5685). `AGENTS.md` (repo root) holds the architectural invariants; `docs/TENETS.md` and
   `docs/TENET_CHARTER.md` the tenets. `docs/SEMANTICS_REGISTER.md` lists every deliberate difference from legend-pure
   and legend-engine.
3. Pinned upstream sources (spec, read-only): `OB=$(bazel info output_base)`; `$OB/external/+http_archive+legend_pure_src`
   (5.99.0) and `$OB/external/+http_archive+legend_engine_src` (4.145.0); jars at the same releases in `@maven_upstream`.
   `find` needs `-L` there. Never use another cache (one holds pure 5.103.0). The `~/legend/legend-pure` and
   `~/legend/legend-engine` checkouts lag the pins; do not cite them.
4. The slice (rule 0.6): homework → probe → switch → gate → deletion → GATES.md entry → push.
5. Before the full chain, run the lanes that catch per-file pins (three of four pushes on 2026-09-29 went red here
   first): `bazel test //core:guardrails //core:census //parser-equivalence:parser_parity //spec:spec_tests`. If you
   added, moved or renamed a file, check the registers that name files: `JdbcSurfaceCensusTest`,
   `ObservabilityGuardrailTest.ENV_FLAGS` (any new `LEGEND_LITE_*`/`LL_*` variable), `OwnCorpusParityTest.MIN_MATCHED`,
   `ErrorShapeGuardrailTest` (broad-catch counts per file), `ArchitectureTest.PROTOCOL_DESUGAR_DEBT` (per file),
   `JavaEvalLedgerTest` (exact line pins), `IdentityGuardrailTest`; regenerate generated files with `bazel run
   //core:update_generated` (the claims ledger's `also` column moves with any file move).
6. The gate chain on the exact tree: `bazel test //...` then `bazel test //tools/deps:all` (Bazel's wildcard over that
   package). Read the summary line (`Executed N out of M tests: M tests pass`), never only the exit code. For any
   front-end slice also `bazel test //spec:reference_lane` (manual, 8 GB). Read per-test times of the corpus lanes
   against the previous entry: a green lane that got 10× slower is a regression.
7. One test class: `//core:core_tests` is one package-wide `junit_test` and ignores `--test_filter`
   (`tools/junit/defs.bzl:25-66`); run the target, or drive the jars in `bazel-bin/core/core_tests.runfiles` from jshell
   (JDK 25 under `external/rules_java++toolchains+remotejdk25_macos_aarch64`). One corpus test:
   `--test_env=JAVA_TOOL_OPTIONS=-Drcorpus.test=<fqn>`. A PASSING `@KnownDefect` test means the defect is still present.
8. A timing is a lane run alone with `--nocache_test_results`, `uptime` load under 3 at the start, nothing else
   building. A lane's time inside `bazel test //...` is not a timing.
9. Commit: write the message to a file, then `git -c user.name=neema2 -c user.email=neema2@gmail.com commit -F <file>`;
   the message ends with the two trailers `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and
   `Claude-Session: <this session's URL>`. Push: `git push origin HEAD:compiler/rebuild HEAD:main` (fast-forward only).
   Never force-push; never bare `git stash`.
10. GATES.md entry (insert above the newest `— Rebuild` heading), template:
   `## <date> — Rebuild <item>: <one-line result>` then: what changed and why (files); the probe and its numbers; the
   gate lanes with their summary lines and quiet timings if any; pins moved, each with its reason; what was deleted
   (lines); the program number the item moves (§1a); cost (commits, wall time, chain runs, red first chains); the
   receipt path.
11. Receipts: `~/legend/platform-architecture/receipts/rebuild-<item>-<short-sha>/` (not in git): probe outputs, lane
    logs, timing tables; the GATES entry names the folder.

**Definition of a session:** one working context of one agent, including the subagents it launches. Sizes in this plan
are judgement; the first week showed mechanical and probe items overestimated 3–5× and re-planning as the real cost
driver [L5 §2]. Every GATES entry logs the item's actual cost; sizes are re-fitted at checkpoint C1.

---

## 0b. Rules

1. **Homework before code, from primary sources**: the pinned trees and our code, by file:line.
2. **Probe before switch**; the probe's receipt is saved before the switch and the switch is judged against it.
3. **The gate is the oracles plus the numbers** (§1c): corpus rosters LOST 0 (by name AND failure class once W1.4 lands);
   the product-SQL snapshot byte-identical for refactor slices (W1.7); the reference lane's disagreement set not grown
   AND its coverage pins not shrunk (W1.1); the wrong-rows harness green (W1.10, from W4.0 on); the pass-manager
   verifier and lint green (W1.3); `bazel test //...` and `//tools/deps:all` green; timings read alone and quiet.
   **Every item states its own gate**; an item without one is not ready.
4. **Deletions land with the switch.** A pin that moves carries a dated reason naming the item.
5. **One variable at a time.** Names change with the world held constant; the world changes with names held constant; a
   new tree lands with today's rule, and the rule changes in a later push.
6. **Every slice:** homework → probe → switch → gate → deletion → GATES.md record → push to `compiler/rebuild` and `main`.
7. **A timing is a lane run alone** (§0 step 8).
8. **Standing rulings:** no string identity for a declaration; no PCT or category checks in the compiler; no caches or
   memos for slowness before the algorithm is proven right (D10's per-model query memo is the semantics of demand-driven
   typing, ruled, not a performance cache); every deferral pinned with an owner; we own everything the program needs.
9. **"Strict" means: collect every diagnostic in one pass, poison the failed unit, fail the build on any error**
   (ruled 2026-09-28). Never abort on the first error; never accept bad input. D10 rules the unit.
10. **Every new stage gets its own IR type.** A phase boundary is proved by javac, not checked at run time; every switch
    over an IR family is exhaustive with no `default` (enforced by W1.11's checker).
11. **Defects (narrowed by D14):** a reproduced wrong answer, wrong binding or security defect is fixed now, in place,
    with a correct targeted fix, and its test becomes a regression test. Only a cosmetic or diagnostic defect whose fix
    belongs to a later wave is pinned `@KnownDefect(owner, reason)` (W0.0); the pin flips when the owner lands. A fix
    that is only correct in the new structure is reported and pinned, never patched around.
12. **Every stage is its own Bazel target, with only the dependencies it should have** (ruled 2026-09-29). A rewrite is
    done only when its stage is carved out as a target whose direct dependencies match the measured map (§1b).
    `//tools/deps:core_layering_test` compares Bazel's graph (a genquery per target) with `tools/deps/core-layers.txt`
    exactly; W1.12 hardens it.
13. **Outcomes, not mechanism (D15).** Lite matches legend-pure's observable outcomes (accept/reject and error class,
    the chosen declaration where it changes lowering or result type, the result type and multiplicity) and legend-engine's
    rows. It never copies a reference's nondeterminism (hash-order ties), its self-declared bugs, or its internal
    representation (e.g. automap `map` nodes, `extractEnumValue` strings). Every deliberate difference is a row of
    `docs/SEMANTICS_REGISTER.md` with its evidence and owner; the reference lane pins it by class.
14. **Oracles are cited for what they can see (§1c).** DuckDB-equals-H2 is evidence for dialect work only, never for
    store resolution or lowering; the reference lane is evidence for resolution and types only.
15. **Every item names what it deletes and the program number it moves (§1a).** Code that a new structure replaces is
    deleted in the push that switches, not later.
16. **One source of status:** this page's §0 "Now" line and §3. `docs/IN_FLIGHT.md` points here. A decision is recorded
    once, in §2, with the date, who ruled, and (for OPEN ones) when it must be decided.

---

## 1. The target (what "expert" means here)

The product is judged by outcomes against legend-pure (resolution, types, accept/reject) and legend-engine (rows), under
rule 0.13. The architecture is a conventional production front end (how rustc and Roslyn are built) and a query compiler
back end (how Calcite is built):

| # | stage | IR out (a distinct sealed type) | identity it carries | today's code | stage reading |
|---|---|---|---|---|---|
| A–C | lex, parse | syntax tree (`protocol` records, `ImportScope`), wire trivia in a side record | spans | lexer/, parser/, protocol/ | A01, A02 |
| W | World (eager knowledge) | declaration tables per kind; per-section import groups; C3 linearizations and variance | `FunctionId` (the reference's element name); `ClassId`/`EnumId`/`StoreId` as typed FQN wrappers; `DeclId` handles internal to the tables | model/, builtin/, compiler/ModelBuilder and friends | A03, A04 |
| D | resolve | the resolved declaration family carrying `ResolvedExpr` (D12) | calls: `Candidates(List<FunctionId>)`; dot access `Member(name)`; binders `VarId`; element references `Ref<Kind>`; every node an `ExprId(body, local)` | compiler/NameResolver | A04 |
| F | elements | typed declarations keyed by id | ids | compiler/element | A04 |
| G | type | typed HIR: every node typed; every call ONE declaration **with its recorded instantiation** (type and multiplicity arguments); every member its `PropertyId` | ids, `VarId`, `ExprId` | compiler/spec | A05, A06 |
| E′ | mapping elaboration (after F) | typed mapping IR: per set a typed relation expression; bindings keyed by a sealed `BindingKey` | ids, spans | normalizer/ | A06 |
| G½ | inline, shape-evaluate | typed HIR; substitution by `VarId` with the recorded instantiation; **no unification and no overload choice in G½** | fresh ids per copy | UserCallInliner, StaticFold, SourceSubst, AlphaRename, StatementInline, LiteralMapUnroll | A05 |
| R | **algebraize (if the D11 experiment passes)** | a logical relational algebra (Scan, Filter, Project, Aggregate, Window, Join, Sort, Slice, SetOp, Unnest) over class-level scans, with a scalar family; semantics as node properties: equality kind, null-strictness, determinism/collation, nullability | node ids | none today (forms are typed kinds; ~38 lowering sites decide relation vs scalar at run time) | A05, A09 §3 |
| H | store resolution, as passes | if R: rewrites of the algebra (mappings are views; navigation becomes joins); if not: a relational skeleton (routed sets, a join tree, `ColumnRef(JoinNodeId, column)`) with typed-HIR scalar leaves | `SetId`, `NavPath`, `JoinNodeId`, `PropertyId` | resolver/ (35,925 lines; four sequential sub-passes, one mutable state) | A07-A08 |
| I | lower | SQL MIR: semantic nodes (units, parts, join kinds, equality kinds as distinct records); block formation by the `Fold` predicates | `FunctionId` → one immutable rule table | lowering/ | A09 |
| J | legalise + render | SQL text per dialect; each dialect declares its required session settings | — | sql/, sql/dialect | A10 |
| P | plan | staged plan IR (SqlExec, Sequence, Allocation, Effect barrier, late-bound SchemaProbe/DynamicPivot/ForEach with bind parameters, VerdictBatch) | — | plan/, StatementExecutor | A11 |
| K | run | results | — | exec/, a thin runner | A11 |

**Cross-cutting machinery (each owned by an item):** `Diagnostic(code, severity, phase, span, args)` in a sink from
every stage, read by the LSP (W1.2); a **pass manager** that runs every stage through one pipeline object with the
verifier, a type-consistency lint, dumps and timings between passes (W1.3); per-pass golden dumps with a parseable text
form (W1.5); a **memoized query layer** (`parse(unit)`, `declIndex`, `resolveBody(id)`, `typeBody(id)`,
`specialize(id, args)`, `elaborate(mapping, set)`) keyed within a model snapshot, so compile-all and demand-driven are the
same computation (W2.2b, D10); an **exhaustiveness checker** (W1.11); the oracles of §1c; the semantics register.

---

## 1a. The program frame (D17)

**Users** (from code, not from any earlier plan): DataCube (the browser app; plans queries in the browser through the
TeaVM WASM planner, `wasm/README.md`, `datacube/src/wasm-planner.ts`, and speaks legend-engine's API to `server/`);
legend-engine API clients (Studio and services, `server/PureV1Api.java`); model authors in an IDE (`/lsp`,
`server/PureLspServer.java`); the planned warehouse/server modes (`docs/SERVER_PROGRAM_2026_09_26.md`, paused while this
program runs).

**What each wave gives users, and the number that must move** (printed into GATES.md by a tool, never hand-typed):

| wave | user outcome | the number (baseline to be printed by W1.0b unless given) |
|---|---|---|
| W0 | no known wrong answers from the pinned defects; the server's raw-SQL door closed (done) | reproduced wrong-results defects open: 7 pinned + the suspects W0.6 confirms → 0 |
| W1 | the IDE shows positioned diagnostics; wrong rows become detectable | positioned diagnostics % in the LSP; wrong-rows harness cases; reference-lane coverage |
| W2 | overload and import bugs gone; model memory bounded | CANDIDATES agreement; heap after resolve on `//core:scale_stresstest100k` |
| W3 | overload picks and types match legend-pure | reference lane: OVERLOAD rows 769 → pinned residue; "reference typed, we FAILED" bodies 1,521 → shrinking |
| W4 | routing, joins and milestoning proved on adversarial data | engine-oracle row disagreements → 0 or registered; resolver lines 35,925 → |
| W5 | dialect correctness; Postgres | PCT fail rosters by class; lowering lines → |
| W6 | a thin runner; a multi-request-safe server | request-reachable static state sites → 0 |
| every wave | less code, faster | product lines (229k at `89dc45871`) → down; plan latency p50/p95 over corpus queries; WASM bytes; `//wasm` cold start; 100K-model build time (2.7 s) and heap |

Known baselines at `89dc45871`: corpus fail rosters DuckDB 107, H2 361 (`spec/src/test/resources/rcorpus/*-fail-roster.txt`);
reference lane AGREE 72,081, OVERLOAD 769, ABSENT 68,232, EXTRA 15,825, bodies FAILED 1,521, sources DROPPED 32
(GATES "Rebuild W1.1 (1)"); product Java 229,168 lines under `*/src/main` (core 217,084: compiler 38.6k, resolver 35.9k,
parser 25.2k, lowering 23.7k, sql 14.1k); quiet lane times at `ed85b5166`: corpus DuckDB 75.7 s, H2 79.8 s, core 29.9 s,
stress 23.0 s, guardrails 9.5 s. **Budgets** (the numbers a slice may not exceed) are set at checkpoint C1 from W1.0b's
measurements; until then, a slice may not make any of them worse by more than noise (two quiet runs).

**Checkpoints** (the user reviews at each; the plan is re-cut at each):
- **C1, end of W1:** gates delivered? sizes re-fitted from logged cost; budgets set; the cut list below ruled.
- **C2, after W2.3a:** re-plan if W2.3a took more than 13 sessions; heap within budget.
- **C3, end of W3:** OVERLOAD residue and REF-FAILED trend; the D11 experiment's result (W3.7) rules D11; W4 re-sized from
  the experiment.
- **C4, go/no-go before W4.3:** on the wrong-rows harness's defect data and W4.0–W4.2's cost: continue extracting passes;
  or build a new H behind a per-query router (branch by abstraction, judged by snapshot plus rows); or fix the store
  resolver's defects in place and stop the middle rebuild.
- **C5, end of W4;** then per wave. Tag `main` at each checkpoint (`rebuild-C<n>`).

**Cut list, to be ruled at C1** (candidates from [L6 §4], [L1 #11]; nothing is cut before the user rules): W5.5 Postgres
until a user needs it; W5.4 ANSI split; W6.1's staged plan IR beyond what bind parameters need; carve-outs where no wave
rewrites the code (keep the no-new-edges test); W2.6 `Ref<Kind>` outside the sites a slice needs; W3.5's second half until
the reference lane shows the need; W7 as a wave (fold guard deletions into their owning slices).

**Risks** (owner is the session; each has a trigger and a response): W4.3 overrun → C4; oracle drift (the reference lane
non-deterministic) → W1.1d; performance/WASM regression → budgets from C1; the other account's machine contention → no
timings until quiet; CI capacity (macOS runner 7 GB; Linux/Windows public runners 16 GB, not verified) → W1.1d; an
upstream pin bump → forbidden during the program except as its own slice at a checkpoint.

**Rollback:** every slice is on `main` behind a converter seam or a gated switch; abandoning the program at any
checkpoint leaves a working product with fewer defects. Record at each checkpoint which seams are live.

---

## 1b. The target map (rule 0.12), measured

Measured from the whole class graph at `ee7617ec8` (715 files, 7,717 file edges, 241 package edges; 39% of edges are
fully-qualified references that import-only analysis misses) and simulated acyclic [L4 §3]. Tools and outputs:
`~/legend/platform-architecture/receipts/meta-audit-2026-09-29/java-dependency-graph/` (`graph.py`, `sim.py`,
`out/violations.txt`, `out/corrected-map-sim.txt`). Re-run `graph.py` before each carve-out; the table is the target,
the tool the truth.

| target | contents | direct deps it needs | carved in |
|---|---|---|---|
| `base`, `json`, `values`, `error`, `spi`, `cache` | as today | base | exists |
| `sql`, `sql_dialect` | SQL tree; per-database printers | base; `sql` | done (W0.2(e)) |
| `ids` | `FunctionId` without `of(Function)` (34 callers move the mangling out); later `ClassId`, `PropertyId`, `VarId`, `ExprId` | base | W2.1 |
| `syntax_tree` | `protocol`, `protocol.spec`, `ImportScope` | base, json, values | W1.9 |
| `parser` | lexer, parser, parser.section | syntax_tree, spi, values, error | W1.9 |
| `decls` | today's `model` records (parsed declarations) and the converter (`FromProtocol`, `MappingFromProtocol`, `RelOpFromProtocol`) | syntax_tree, base, error | W1.9 |
| `catalog` | builtin, platform (platform declarations generated at build time, not parsed at class load) | decls, ids, syntax_tree, error | W2.1 |
| `types` | `compiler.element.type` with `Type → SqlType` moved out | catalog, ids, syntax_tree | W2.1 |
| `world` | ModelBuilder, KnowledgeLayer, TableIndex, SynthFqn, StoreLookups, RelationalKinds, DerivedProps, SymbolTable | decls, syntax_tree, types, catalog, error | W2.3a |
| `resolved` | the D12 family, `ResolvedExpr` | ids, syntax_tree, error, types | W2.3a |
| `binder` | NameResolver, BareNames, ResolvedNames | syntax_tree, decls, catalog, resolved, error | W2.3a |
| `elements` | compiler.element | world, binder, catalog, types, decls, syntax_tree, ids, error | W2.3a |
| `typed` | compiler.spec.typed without `ContextReading` | types, ids, values; (elements, sql, decls only until call nodes carry ids, W3) | W3 |
| `inliner` | StatementInline, LiteralMapUnroll, SourceSubst, Env (then the one G½) | typed, types, binder, elements, syntax_tree | W3 / W4.2 |
| `typer` | compiler.spec plus `ContextReading` | typed, elements, types, catalog, binder, inliner, ids, values, error | W3 |
| `mappings` | normalizer | today world, binder, decls, syntax, catalog; from W4.1 typer, typed, resolved | W4.1 |
| `store` | resolver plus `LazyRows` and `PlanRows.scopeId` | typed, types, elements, typer (named edge until W6.2), catalog, decls, ids, values, error; **never** lowering or plan | W4.3 (the 15 lowering/plan sites move in W1.12) |
| `lowering` | lowering | typed, types, sql, catalog, ids, values, elements, error | W5 |
| `lineage` → `plan` → `runner` → `validation`/`testdatagen` → driver → `server`/`ide` | the periphery | as measured | W6 |
| `probe`, test support | out of the product jar | | W6.4 |

Cuts the map assumes (sites): W1.9 parser→decls 112; builtin's class-load parses 11; `Type`→SqlType/SqlExpr/
ClassDefinition 15; `FunctionId.of` 6; `Temporal.java:87,98,99`, `TypeClassifier.java:47`, `KnowledgeLayer.java:406`;
`ExecutionContext`→`ContextReading` 6; store→lowering/plan 15. The one class-level cycle crossing a boundary:
`SetId ↔ ClassMapping/MappingDefinition` (`SetId` stays in `decls` until W4.3 gives it a real id).

---

## 1c. The oracles, and what each can see

| oracle | sees | cannot see | where it gates |
|---|---|---|---|
| corpus rosters (`//spec:corpus_duckdb`, `//spec:corpus_h2`) | the engine tests' expected values on their small fixtures | wrong rows on data the fixtures lack (orphans, NULLs, ties, milestone versions) | every slice |
| reference lane (`//spec:reference_lane`, manual) | legend-pure's resolution and (after W1.1b) types per call, Pure source | engine input; store resolution; SQL; rows | front-end slices |
| engine-input differential (W1.13) | legend-engine's compile of engine-grammar input: accept/reject, chosen function, return type | rows | W2.3b, W3.3, D13 |
| rejection corpus (W1.1c) | programs legend-pure refuses, by error class | — | W2, W3 |
| product-SQL snapshot (W1.7) | any change in emitted SQL | whether the old SQL was right | refactor slices W4–W5 |
| adversarial-data old-vs-new (W1.10a) | refactor-induced row changes on data built to separate right from wrong | a bug present in both | W4.0 on |
| metamorphic TLP/NoREC/PQS (W1.10b) | internal inconsistency of filter/project/count under NULL and three-valued logic | a consistent wrong answer | W4.0 on, W5 |
| legend-engine execution (W1.10c) | the engine's rows for the same model, query and data | engine bugs (registered, not copied) | W4.3, D13 |
| PCT lanes (`//pct:pct_duckdb`, `//pct:pct_h2`) | per-function value semantics | mapping/routing | W5 |
| DuckDB = H2 at MIR level (W1.8) | dialect legalisation differences; each register row names its adjudicator (PCT or engine) | anything above J | W5 only |
| soundness monitor (W1.3) | a result whose shape (columns, cardinality) contradicts the typer's type | — | every corpus run |

---

## 1d. Semantics nobody owned, now owned [L2 §5, L3 table]

| area | owner item |
|---|---|
| graph fetch output (`serialize` config, `@type`, date/float/decimal JSON forms, property order, nulls) | W4.3 step 8, with a golden JSON class |
| `graphFetchChecked`, class constraints, defects | scope ruled at C3 (constraint checking must be SQL) |
| M2M scope boundary (chains, JSON source, union) | W4.4b; boundary written at C3 |
| null semantics in SQL (`==` on empty, `NOT IN` with NULL, `sum([])`, `toOne` failure) | W0.6 (reproduced ones), W5.2 (equality kinds as nodes), `EqualityWorldsConformanceTest` as a W5 gate |
| date/time (partial dates, StrictDate vs DateTime, connection timezone, `now`) | W6.1 session settings; a non-UTC JVM lane (W1.10) |
| decimal/float (Integer division, rounding, Float computed as DECIMAL, literal magnitude cliff, NaN/Inf) | W5.2; register row "Float computed as DECIMAL" |
| string collation, identifier case folding | W5.3 (`Identifier` with per-dialect folding; `C` collation) |
| Unicode length/substr (code points vs UTF-16) | W0.6 suspect list, then W5.2 |
| enumeration, embedded, inline, otherwise, merge, inheritance mappings | W4.1a, each with a shadow-probe row |
| aggregation-aware | W1.10c engine-result lane |
| service parameters (`[*]` in `in`, nulls, dates and timezone) | W6.1 homework |
| service tests and mapping testSuites (deleted; Studio's "run tests" fails against lite) | recorded in `SEMANTICS_REGISTER.md`; scope at C3 |
| cross-store (walled), external formats | recorded out of scope in `SEMANTICS_REGISTER.md` |

---

## 2. Decisions

| id | question | status |
|---|---|---|
| D1 | The call node's type | **RULED 2026-09-29 (the user): a distinct `ResolvedExpr` family.** §6 records the alternative |
| D2 | Binding scope | **RULED 2026-09-28: everything**: calls, members, binders (`VarId`), element references, on one new tree type; ids added in separate pushes (W2.3a, W2.5, W2.6) |
| D3 | A reference lane at the pinned release | **RULED 2026-09-29 (the user): build it.** Built (W1.1 push 1) |
| D4 | "No tolerant modes" | **RULED 2026-09-28**: rule 0b.9 |
| D5 | Plan the whole program now | **RULED 2026-09-28**: this page |
| D6 | How the corpus certifies product SQL | **RULED 2026-09-29 (the user):** the scan-order ORDER BY lives only in the harness, and only for tests where an unordered compare cannot be correct (a `first`, `take`, `limit`, `slice`, `at` or positional read whose rows depend on scan order); every other test runs the product's exact SQL compared without order. W0.4 implements it, including the always-on pass on the assert path the ruling's text missed |
| D7 | The judge charter | **RULED 2026-09-29 (the user): keep BOTH judges** (host judge and database judge), joined per assert as today (`pinJudgeDifferential`). W6.3 shrinks to the judge SPI |
| D8 | Computing a query's column names at compile time | **RULED 2026-09-29 (the user): yes, as type checking, very ring-fenced** (TENET_CHARTER C6.2a): only schema positions of `NormalizeRequiredFunction` bodies and column-metadata reads; a closed, pinned operation list; never a row value; anything else a clear error. The database computes every value. Owner W4.2. See D19 for the fence's one open edge |
| D9 | The manifest world | **OPEN; must be ruled before W4.4a starts** (it blocks W4.4a). The 2b stdlib question, WORLD_MAP rule 8, and whether roadmap test files may be excluded by a named, pinned register [W4 F9] |
| D10 | The failure unit under rule 0b.9 | **RULED 2026-09-29 (the user): two modes** (`docs/TENETS.md`). Compile-all types the whole world, collects every diagnostic, fails on any (a lane and an API). User paths are demand-driven and memoized per model; demand-driven is an optimisation only (equal by construction through the query layer, W2.2b, and checked by running the corpus both ways); Knowledge errors are eager. **The difference from legend-engine is kept** (a query touching only valid code runs even if another body is broken) and is a row of the semantics register. Sub-rule from the meta-audit [L1 #4]: a declaration-header reference is Knowledge (eager); an unknown name inside a body poisons that body only on user paths and is reported in compile-all |
| D11 | Where the relational form begins | **RE-SCOPED 2026-09-29; decided by the W3.7 experiment (ruled by the user).** Option R: an explicit algebraize step after G½ turns the query into a logical relational algebra with semantics as node properties, and store resolution becomes rewrites of it. Option S (today's direction): relational only after store resolution, a skeleton with typed-HIR leaves. Pass criteria in W3.7. If S wins, the original narrower question (what type the skeleton's scalar leaves have; homework `d11-homework-2026-09-29.md`) is answered by the W2.0b census at W4.0 |
| D12 | The `ResolvedExpr` design | **RULED 2026-09-29 (the user):** a resolved declaration family carrying `ResolvedExpr`, not a side table; readers take names from declaration ids; candidate sets fixed at resolution; StaticFold and AlphaRename ported. Read `h2-resolved-expr-design-2026-09-29.md` with its revision and its reading guide (form recognition by id moves into W2.3a) |
| D13 | Which overload rule engine input gets | **RULED 2026-09-29 (delegated by the user):** one rule, legend-pure's outcomes, over the engine's namespace (its 32 imports and handler names). The engine's first-match handler order is registration order, not semantics; no second matcher. Gate: W1.13 lists every disagreement before the rule serves engine input; each is classified (engine defect, lite superset, or a real difference ruled case by case) into the register |
| D14 | Wrong-results defects: now or in their owner waves | **RULED 2026-09-29 (the user): now**, rule 0b.11 |
| D15 | The typer's contract with legend-pure | **RULED 2026-09-29 (the user): our own expert inference engine** judged by observable outcomes, with a written rule table and a deterministic tie rule; reference artefacts pinned by class, never copied. Rule 0b.13 |
| D16 | The legend-engine SQL text (`EngineStyleH2`, `EngineStyleDB2`, `EngineStyleComposite`) | **RULED 2026-09-29 (the user): a backwards-compatible product dialect**: a printer over the same SQL tree as every dialect (it never re-lowers); rows are its gate (its SQL runs and must return the native dialect's rows); byte differences from engine goldens allowed only as register rows (e.g. D8: lite leaves constants to the database, the engine pre-evaluates them). Owner W5.6 |
| D17 | The program's goals | **RULED 2026-09-29 (the user): cleaner, more bulletproof, much less code, faster, cruft deleted.** §1a; rule 0b.15 |
| D18 | Where the rebuild lands | **RULED 2026-09-29 (the user): on `main`**, every gated slice; `compiler/rebuild` kept only as the working branch name, always equal to `main` after a push |
| D19 | D8's fence and helper functions | **OPEN; must be ruled before W4.2's schema evaluator.** The motivating function's branching sits in an unmarked private helper (`extendMatchColumns`, `tdsExtension.pure:66-95`) called by the marked `columnValueDifference` (:96-102), and its name arguments sit inside row lambdas (`$r.getInteger($col.name + '_1')`, :73) [L2 F6]. Recommendation: the fence is "schema positions reachable from a marked call site after inlining its callees", with TDSRow accessor name arguments listed as schema positions; the Relation API constructors among the marked functions (`over`, `rows`, `range`, `ascending`, `descending`, `lead`, `lag`) are already lite natives and fall under WORLD_MAP §8, not D8 |
| D20 | `splitPart` with a multi-character separator | **OPEN; blocks only its W0.6 fix.** Pure's `split` doc says the separator is "matched literally" (`split.pure:17-21`) but the interpreter tokenizes on a character set (`Split.java:54-60`, `StringTokenizer`, adjacent separators collapse); the multi-character PCT is commented out as "incorrect behaviour … TODO" (`splitPart.pure:46-54`); engine-H2 uses a character set, engine-DuckDB the whole string. Lite: DuckDB whole string with collapse, H2 character set (report 4 F). Recommendation: the documented literal semantics on every dialect (the reference marks the other behaviour as incorrect), the empty-token rule taken from `split`'s documented contract; a register row for the engine-H2 difference |
| D21 | Float literals: the magnitude cliff | **OPEN; blocks only its W0.6 fix.** Under NUMERIC_CHARTER Rule 1 literals render bare and the database types them; `AnsiSqlRenderer.plainFloat` (`:1370-1378`) switches to exponent form outside 1e-6..1e15, which DuckDB types DOUBLE, so `i * 0.00000013 == 0.00000039` is false on DuckDB and true on H2 and in the interpreter (report 4 G, ran). Whether the engine's `%s` formatting has the same cliff is not verified. Recommendation: no cliff (a value's kind must not depend on its magnitude, charter C2.2): spell plainly with per-value DECIMAL precision; register the engine difference if the engine has the cliff |

---

## 3. Done

| item | what | record |
|---|---|---|
| 0–2 | annotations to `com.legend.base`; `//core` as 29 targets; the reference differential by call; lowering by `FunctionId` | GATES 2026-09-26 "Execution plan step 0/1/2" |
| 3-homework, 3-probes | kernel reading; resolver per-statement fix; nine counts before any switch | GATES 2026-09-26/27 |
| audits | program audit; architecture review and stage readings; H1 plan audit; **meta-audit (six lenses)** | `plan-audit-2026-09-26/` |
| H1–H6 | plan audit, `ResolvedExpr` design, reference-lane spike, diagnostics design, quiet baselines, superseded docs marked | `h1-…/`, `h2-…`, `h3-…`, `h4-…`; GATES "Rebuild H5 and W1.6" |
| W0.0, W0.1, W0.2 | expected-failure pins; the server's doors (loopback bind, Origin allow-list, `/engine/sql` gone); four confirmed defects; the static-final rule | GATES "Rebuild W0, first batch", "second batch" |
| W0.3 | ten latent defects reproduced and pinned | GATES "Rebuild W0.3" |
| W0.5 | the line guard, DanglingState rule 2, the JDBC test register, 15 zero rows dropped (commit `ed85b5166`; its GATES entry was never written, owed by W1.0) | commit `ed85b5166` |
| W1.6 | the typer split: TdsDesugars and Overloads out of Typer (3,499 → 1,748 lines); `accessProperty` stayed in Typer (`Typer.java:~1200`) by choice, moves in W3.3 | GATES "Rebuild H5 and W1.6" |
| W1.1 (1) | the reference lane, calls first | GATES "Rebuild W1.1 (1)" |
| rev H2 | this page; D13–D18 ruled; automap reading corrected; `main` fast-forwarded to the program (`89dc45871`) | GATES "Rebuild rev H2" |

---

## 4. The waves

Each item is one push unless it says otherwise. Sizes are judgement (§0). Every item names its gate, what it deletes,
and its number; every rewrite ends by carving its stage as a target (rule 0b.12).

### W0 — Correctness and safety now (≈2–4 sessions left)

- **W0.4 The corpus certifies product SQL**, per D6. Facts [L5 #4–#8]: the pass is `sql/ScanOrder.java` (every join tree
  rooted at a bare scan), installed in `sql/dialect/DuckDb.java:218` when `Boolean.getBoolean("legend.exec.engineScanOrder")`,
  set unconditionally at `MinimalCorpusTest.java:139`; firings counted by `exec/Census.java:92`
  (`StableScanOrder.firings()`); registers `spec/src/test/resources/rcorpus/duckdb-engine-order-register.txt` (993, host
  mode) and `duckdb-database-engine-order-register.txt` (936, database mode); the H2 registers are empty. A second,
  always-on application: `lowering/CanonicalRenderSql.java:436` (`ScanOrder.stabilize(plan)` on the assert/verdict
  path; a 2026-08-29 ruling made it a feature of the assert surface, so it is harness semantics living in product code).
  Steps: (1) count dynamically: rerun both registers' tests with the pass off (a harness flag), compare rows unordered,
  and classify each test as order-only (passes unordered) or scan-order-dependent (fails); static classification of the
  SQL is not enough because positional reads in the Pure test body happen on the host. Write the split as two register
  files. (2) Move the pass out of `DuckDb` into a harness-injected rewriter (a dialect seam replacing
  `Compiler.dialectOf`'s static choice; the rewriter lives in `spec` test code, so `core-layers.txt` gains no edge),
  applied only to the scan-order-dependent tests; (3) move `CanonicalRenderSql`'s stabilize behind the same seam;
  (4) prefer set-of-valid-answers verdicts (page membership, `spec/.../harness/H2Verify.java:369-383`) where they
  suffice, and keep harness `rowid` ordering only for goldens encoding H2 insertion order [L3 #2]. Gate: product
  DuckDB dialect has zero ScanOrder firings on the non-register tests (Census row); rosters LOST 0; the two new
  registers pinned; `TestLaneOrderGuardrailTest` re-pinned. Deletes: the system property and the product-side pass.
  Number: product SQL statements carrying harness ORDER BYs → only the registered set.
- **W0.6 Fix the reproduced wrong-results defects now** (D14). **Homework done:** `plan-audit-2026-09-26/w0.6-homework/`
  (`README.md` is the index and the push order; four reports give each defect's root cause at file:line, every other
  site of the same class, the fix, the blast radius and the gate). The defects, all correct to fix in today's structure
  unless marked: `InlinerMatchCaptureTest` (capture-avoiding substitution; first), `LowererLetScopeTest` ×2 (lets as the
  outermost scope), `NestedExistsCorrelationStampTest` (rebuilds carry the stamp; delete the 3-argument constructor),
  `NavPrefixCollisionTemporalTest` (prefixes from the materialization map), **the killed head match** in
  `TemporalFrame.java:1285-1322` (probed wrong rows, unpinned: pin it, count the fallback's corpus riders, then hoist and
  delete the fallback), `SectionImportScopeKnownDefectTest` (sections carry imports, incl. the cross-file variant in
  `Compiler.parseSources`), `SourcelessPureMappingKnownDefectTest` (drop `nn()` at `NameResolver.java:1148`),
  `ServiceTestProvisionKeyTest` (value-record keys, ordinal names; the three latent content-hash ids), null-safe `==`
  chosen by operand shape (report 4 A), ModelJoin/XStore conditions forced to plain `=` (A2, confirm first), `sum` of an
  empty list giving NULL (H), `ANY_VALUE` missing on H2 (D). After D20/D21: `splitPart` (F), the Float literal cliff (G).
  Every predicted defect gets a failing lite test first. Gate per push: pins removed and tests asserting the right
  answer; the homework's adversarial cases added; rosters LOST 0 (read `docs/RELATIONAL_CORPUS.md`'s diff); the chain
  green. Number: open wrong-results defects → 0.
- **W0.7 Request-reachable static state** [L6 F12]: list the statics and ThreadLocals a concurrent request to
  `server/` can reach (the dispatcher is single-threaded today, `LegendHttpServer.java:314`); make each per-request or
  immutable, or record why the single-threaded dispatcher makes it safe with a test pinning single-threadedness.
  Gate: the list in GATES; ArchUnit `staticFieldsAreFinal` still green. Number: request-reachable mutable statics → 0.

### W1 — Gates and foundations (≈10–15 sessions). Everything later is judged by these.

- **W1.0 This page executable** (rev H2 did: this page's §0 checklist; `IN_FLIGHT.md` points here; `AGENTS.md` routes
  here; `docs/SEMANTICS_REGISTER.md`; superseded/paused banners on `PROGRAM_MAP`, `ONE_PLATFORM_PLAN`,
  `END_TO_END_PLAN_2026_09_08`, `OPEN_REGISTER`, `ENGINEERING_LOG`'s queue, `SERVER_PROGRAM_2026_09_26` (legs renamed
  S0–S3); the owed W0.5 GATES entry; the automap correction; the H2 note's reading guide). Gate: a cold-read test: an
  agent given only the repository explains the program, the next three items, their gates and the decisions, and finds
  no contradiction the documents do not resolve; its prompt and answer are saved under `plan-audit-2026-09-26/cold-read/`.
  Repeat the cold read at every checkpoint.
- **W1.0b Baselines for §1a**: a `tools/metrics` target printing, in one run: product lines per package; plan latency
  p50/p95 over the corpus queries (compile only, alone and quiet); `//wasm` bundle bytes and cold start; 100K-model build
  time and heap after build (`//core:scale_stresstest100k`); reference-lane buckets; fail rosters. Gate: the output
  pinned in GATES with its receipt. Budgets are set from it at C1.
- **W1.1b Type rows and recorded instantiations** [W0-W1 #2, L1 #2, L5 #11]: the reference side prints
  `_genericType`, `_multiplicity` and `_resolvedTypeParameters` per call (extend `tools/reference` `RefResolutions`;
  rebuilds `ref_dump`, ~50 s, 8 GB). Our side: result type and multiplicity are already on the call nodes (`c.info()`);
  what is missing is the instantiation (type and multiplicity arguments). **Record it permanently** in the typer, as a
  field on `TypedNativeCall`/`TypedUserCall` (the evidence for "a side table to avoid 100 constructor sites" had no
  source: `new Typed*(` is 394 sites in `compiler/spec`), so that G½ can later substitute instead of re-unifying. One
  canonical type printer used by both sides (M3 FQNs, Nil, function types, relation column types, multiplicity
  spellings); sample 100 rows by eye before blessing. Gate: the lane's type rows joined and bucketed; reasons per class;
  the AGREE floor and coverage pins held. Size 2–3.
- **W1.1c The rejection bucket** [L1 #6d]: the lane pins "we typed, the reference failed" as its own bucket; import
  legend-pure's compile-failure tests as a negative corpus asserting error classes. Gate: both pinned.
- **W1.1d The lane is trustworthy and runs somewhere**: 10 runs including a cold `ref_dump` rebuild must agree
  byte-for-byte; peak RSS measured after W1.1b; confirm a Linux CI runner's memory (`free -g`) and run the lane nightly
  there if ≥ 12 GB. Gate: the ten-run receipt; the CI job green or the reason it cannot run.
- **W1.2 Diagnostics foundation** per `h4-diagnostics-design-2026-09-29.md`: types, a sink, a bridge at each stage
  boundary; the parser first (codes, spans, UTF-16); speculative scopes (diagnostics inside an overload attempt are
  discarded with it; the 30 `catch (` sites in `compiler/spec` listed and classified); parser recovery. **The LSP reads
  the sink in this item** (`server/PureLspServer.java:177-219` guesses positions from message text today) [L6 F7].
  Gate: positioned-diagnostic % for the parser's errors (the number); the LSP test reads a code and a span.
- **W1.4 Rosters by failure class = (phase, exception class, diagnostic code if any)**, in one JVM; the stress lane's
  pass count becomes a roster. Gate: rosters rewritten with classes, LOST 0 by (name, class).
- **W1.3 The pass manager** [L1 #6a,b; W0-W1 #13]: one pipeline object that every entry runs through: `Compiler`'s two
  sequences (`Compiler.java:592-614`, `:1173-1194`) **and the executor's own** (StatementExecutor builds a third
  StoreResolver at `:510`, runs `new UserCallInliner` at 9 sites and 2 more Lowerers; route them through the pipeline
  object now, delete the copies in W6.2). Between passes, in tests: the phase verifier (post-conditions true today;
  known violations such as `SqlSource.Join.Kind.sql` and interval unit strings pinned shrink-only, owned by W5.2; every
  variable bound in scope; ids unique once W2.5 lands); a **type-consistency lint** (re-derives each node's type from
  its children where the rule is local; violations shrink-only; the store resolver hand-builds 188 `ExprType`s nothing
  checks today); per-pass timing; the soundness monitor (result shape vs the typer's type). Gate: every pipeline entry
  counted and routed (a test enumerates entries); verifier and lint green against their pinned sets.
- **W1.5 Golden dumps per pass** with deterministic printers for the typed HIR and the MIR, in a parseable text form (so
  later tests can be written as input text → pass → expected text), blessed by `//:update_generated`; a fixed program
  set including a mapping-heavy set. Size 1–2. Gate: dumps stable across two runs.
- **W1.7 The product-SQL snapshot** [W4 F10]: the store resolver made deterministic (NavReducer names from
  `identityHashCode`, `NavReducer.java:63,75`); an injected observer records every statement's SQL per test per dialect,
  including `EngineStyleH2`; aliases canonicalised; **plus a DataCube query set** (the corpus is not DataCube's queries).
  Refactor slices gate on byte identity; semantic slices on a reviewed diff. Needs W0.4.
- **W1.9 The syntax targets** (rule 0b.12's first carve-out, re-scoped from the measured graph [L4 §2a–c]):
  `syntax_tree` (protocol, protocol.spec, `ImportScope`), `parser` (lexer, parser, section; deps spi, values, error)
  and `decls` (today's `model` records and the converter). Work: the parser returns syntax only; the conversion
  (`FromProtocol`, `MappingFromProtocol`, 25 uses; the 19 section grammars' `toModel`, declared
  `RawSectionGrammar.java:39`, `LexableSectionGrammar.java:50`, called `ElementParser.java:385,471`) moves to `decls`;
  the five constructions straight to model with no protocol record (`ElementParser.java:505, :1332, :1373, :2504`;
  `OverlayElementSink.java:41`) get protocol records; `ParsedModel`'s consumers (builtin 7, compiler 20, ide 4,
  normalizer 15, server 6, root 17) read the syntax result plus the converter; refusals that move phase
  (`ElementParser.java:741` turns `UnsupportedMappingShape` into a `ParseException`) are listed and their roster class
  change recorded; `AGENTS.md`'s layer table edited in the same push. **Proof by caching** (the user's point): the
  parser-equivalence lanes depend on `//core:parser` and `//core:syntax_tree` plus the few decls types their tests
  name (`Sectionize.java`, `OwnCorpusConformanceTest.java`, `Surfaces.java`), and the own-corpus snippet harvest becomes a
  build action whose output file is their input. Gate: rosters and parser-equivalence lanes unchanged; `core-layers.txt`
  updated; a no-op edit to a typer file leaves both lanes `(cached)`, an edit to a parser file reruns them. Size 3–5.
- **W1.8 The dialect fuzzer at MIR level** [L3 #4, #5]: random well-typed MIR trees rendered for DuckDB and H2, rows
  compared; a register of declared DuckDB/H2 divergences in which every row names its adjudicator (a PCT test or an
  engine run) and which dialect is wrong; a row without an adjudicator is a defect. Seeded with the known `splitPart`
  divergence. Gate for W5 only (rule 0b.14).
- **W1.10 The wrong-rows harness** (before W4.0) [L3 #4, L2 F3, L1 #6c]:
  - (a) adversarial-data old-vs-new: for each corpus query, W1.7's baseline SQL vs the new SQL over fixtures mutated by
    `testdatagen` (orphans on every foreign key, NULL in every nullable column, duplicate business keys, several milestone
    versions with boundary dates, ties on sort keys, empty tables, non-BMP strings, extreme numerics). Size 2–3.
  - (b) metamorphic tests at Pure level over the mapping-heavy set: TLP (`R->filter(p)->size() + R->filter(!p)->size() +
    R->filter(isEmpty(p))->size() == R->size()`), NoREC (filter count = count of true in `project(p)`), PQS (a pivot row
    must be returned). Size 3–5.
  - (c) legend-engine as the executing oracle for store resolution: `//tools/engine-runner` (its own jar pool
    `@maven_runner` at `LEGEND_ENGINE_RELEASE` = 4.145.0, the pin; `tools/engine-runner/README.md`; its stress-corpus
    command is stale, see the README's note) runs the same model, query and randomized H2 data; rows compared. (Maven
    Central's shaded server jar stops at 4.138.5, below the pin: do not use it as the oracle.) Size 2–3.
  - A non-UTC JVM-zone lane. Gate: all three run on the mapping-heavy set with their disagreements pinned by class; each
    disagreement is a W0.6-style defect (fixed) or a register row.
- **W1.11 Exhaustiveness and language level** [L4 §4.1, §4.5]: an ErrorProne check (the plugin path exists for NullAway)
  that fails a `switch` over a sealed IR family with a `default` arm, with a shrink-only baseline (76 of 77 typed-tree
  switches have one today); a ratchet on `instanceof Typed*` (1,313 today); `.bazelrc`'s `--java_language_version` raised
  from 21 to 25 (runtime is 25) after a TeaVM compatibility check of the `//wasm` targets. Gate: the check fires on a
  seeded violation; baselines pinned.
- **W1.12 Layering test hardened; store stops reaching into lowering and plan** [L4 §4.8, §2d]: the genquery test
  enumerates `kind(java_library, //core:*)` instead of a hand list; reads `exports` and `runtime_deps`; compares against a
  map file (§1b) plus shrink-only named exceptions each with an owner item; flags declared-but-unused deps (4 today:
  `cache→base`, `lowering→protocol`, `resolver→platform`, `exec→platform`); carved targets get `visibility`. In the same
  item, one push: the 15 store→lowering/plan sites move (`lowering.AsorRef` below both; `lowering.Aggregates.isReducer`/
  `isDemandReducer` to catalog or a typer annotation; `plan.LazyRows` and `PlanRows.scopeId` into store). Gate: the edges
  gone from `core-layers.txt`; the test fails on a seeded new edge, a seeded `exports`, and a new unlisted target.
- **W1.13 The engine-input differential lane** (D13) [L2 F7, L1 #5]: engine-grammar inputs (PMCD/JSON lambdas as DataCube
  and Studio send them) compiled by the pinned engine jar and by lite; rows are (input, accept/reject, chosen function,
  return type). Known differences to expect: `between` registered only for Date, Number, String
  (`Handlers.java:2847-2849`); user overloads chosen first-registered; 32 imports, not 29. Gate: the lane runs; every
  disagreement classified in the register.

### W2 — The resolved tree (≈16–25 sessions)

- **W2.0 = H2**, ruled (D12). Read its revision and reading guide.
- **W2.1 World tables, the index in three layers, and the `ids`, `catalog`, `types` targets** [W2 #9, L4]: a cached
  boot index (platform declarations generated at build time as a serialized resource, not 854 parses at class load,
  `Pure.java:148/318/738`, `Prelude.java:55`, `SystemMetamodel.java:1517`; a generated class would exceed the 64 KB
  static-initializer limit), a graph index built before D, an extension after E. Refuse model↔model duplicate ids now;
  native↔model twins wait for W2.8. A collision guard on the mangle (`Pure.java:616`). `FunctionId.of/ofAll(Function)`
  moves out of the id type. Gate: CANDIDATES identical; boot time within noise.
- **W2.2 Import groups per section**, attached by section, not keyed by element FQN (the first-wins `putIfAbsent`,
  `ElementParser.java:325,393`, read at `NameResolver.java:258`); every `elementImports` and `elementOffsets` reader
  switched. (If W0.6 already fixed the section-import defect this item is the structural completion.) The core group
  becomes the reference's 29 for Pure source only after a probe of resolutions served only by `variant`, `relation`,
  `precisePrimitives`. Gate: CANDIDATES identical, or the probe's rows explained.
- **W2.2b The query layer** (before W2.3a push 2) [L1 #4, L4 §4.6]: the named, pure, memoized queries of §1 over a model
  snapshot; each result carries its diagnostics; an in-progress sentinel reports cycles as diagnostics; diagnostics
  sorted by (span, code); deterministic iteration; a retention policy tied to the server's model cache
  (`cache/HandleStore`); no `ConcurrentHashMap.computeIfAbsent` recursion (it forbids it, cf. `PureModelContext.java:249`,
  `ClassLayouts.java:81`). Today's per-`SpecCompiler` memo (`SpecCompiler.java:48`, 8 creation sites in `Compiler.java`,
  1 in `StatementExecutor`) becomes a query. Compile-all = demand every body. Gate: the corpus run both ways gives equal
  diagnostics per body; per-query latency not worse.
- **W2.3a The resolved model with TODAY'S rule** (D12) [W2 #4, #5]: the resolver lowers the parsed model into the resolved
  declaration family whose bodies are `ResolvedExpr`: calls (`Candidates`), `Member(name)`, `new`, the flags; **every
  node gets an `ExprId(body, local)`** (spans are a table keyed by it, so no span sits in any record's `equals`; types and
  instantiations stay on the typed nodes, W1.1b); variables and element references still carry names. Form recognition by declaration id (a
  `FunctionId → Form` table; a candidate set disagreeing on the form is an error) replaces the name-dispatching readers
  (18 `CoreFn.of`, 31 `ResolvedNames`, 85 `.function()`); `spelled` is read only by diagnostics and printers (a guard).
  The merge point's full rule (BareNames ENGINE/CORE/FORM tiers) moves inside D unchanged. E's and G's untyped
  constructions (~500–600; recount at push 1) go through the builder; E.6 re-resolution deleted; an ArchUnit rule forbids
  `compiler.spec` constructing `protocol.spec` nodes. Every reader of a resolved body switches (169 main files, 1,958
  references). Resolved declarations carry spans (the LSP's go-to-definition reads them). Carve `world`, `resolved`,
  `binder`, `elements` (§1b; `world` must go with `elements` or Bazel refuses the cycle). Poisoning per D10. Four pushes
  behind a converter seam (H2 §6). Gate: CANDIDATES by (site, candidate set) identical; poisoned calls counted by code
  against the UNKNOWN-FN baseline; heap after build on the 100K stress test within budget; the reference lane unchanged.
  Deletes: E.6, the name-dispatching readers, the parse records' body use after the resolver. Size 10–14.
- **W2.3b The reference's candidate rule** (imports ∪ core ∪ Root, no own-package tier; `reference-matching.md` 1–3) for
  Pure source; engine input keeps the engine's namespace (D13) [W2 #6]. The parser's minted and bare names (`col`, `agg`,
  `func`, `olapGroupBy`, `tdsRows`, `tableReference`) each get a declaration or a syntax node D binds [W2 #7]. Gate: the
  reference lane's rows; moved rows listed by class; W1.13's rows unchanged or classified.
- **W2.4 Member semantics** [W2 #19, W4 F3, L2 F1, F4, F8, F10]: the typer resolves `Member` against the receiver's type.
  **Automap (corrected reading):** a `[0..1]`, `[0]`, `[*]`, `[1..*]` or multiplicity-parameter receiver automaps; only
  `[1]` takes the direct path (FEP:306,:325,:359 call `isToOne(m, true)`). Lite's IR keeps `Member(PropertyId)` with the
  lifted multiplicity and `Ref<EnumValue>` for enum values; it does NOT emit the reference's `map(v_automap|…)` or
  `extractEnumValue(enum,'NAME')` (representation, and string identity); the reference lane's join normalises those rows.
  Milestoning date propagation into lambdas follows the reference's rule, keyed by declaration id (the reference
  propagates only into `map`, `filter`, `exists`, `project`, the `getAll` date forms and `subType`,
  `NativeFunctionIdentifier.java:26-32`, `MilestoningDatesPropagationFunctions.java:131-134`): a date-less milestoned
  property elsewhere is a compile error there; lite matches it or registers the difference. `new` has two overloads
  (`new.pure:29, :37`), `copy` two (`copy.pure:25, :33`); the String argument is an object id. `PropertyId` introduced on
  member access. Gate: reference-lane PROPERTY_AS_CALL rows; a `[0..1]` receiver case for a property and a qualified
  property; a milestoned-property-in-`sortBy` case; rosters.
- **W2.5 `VarId` for every binder** [W2 #11–#13]: D allocates ids for explicit and implicit binders (`this`, service
  parameters, `_path`, `_gf<n>`, `_s<N>_`); `ParameterDefinition` gains a `VarId`; G gets a fresh-id supply; the record
  keeps only the id in equality (the display name is a table entry) [L4 §4.3]. D, E and G readers switch; G½, H and I
  switch inside W4. Alpha-renaming becomes id-freshening per copy. Gate: verifier (bound in scope, unique) and golden
  dumps modulo ids.
- **W2.6 Element references as `Ref<Kind>`** (FQN wrappers; `DeclId` never in a tree) [W2 #14, #15], limited to the
  sites a later slice or a defect needs unless C1 rules otherwise. Gate: rosters; element-name compares shrink.
- **W2.7 Typer desugars bind their declaration** [W2 #25]. Gate: PICK rows identical.
- **W2.9 Mapping-DSL references resolved in D** [W4 F5]: the normalizer's private resolvers
  (`AssociationSynthesis.resolveAssociation`, `StoreSubstitutionRewrite`, `MappingClosures`) replaced by D's output.
  Gate: rosters.
- **W2.8 The merge point by table**, after W3.3 [W2 #17]: `FunctionCompiler.functionsAt` reads the declaration table
  only; `isPlatformOwnedFunction`, the PCT stereotype check and `SUPPRESSED_ONCE` deleted; broken overloads reported
  (`FunctionCompiler.java:139-158`). Gate: OVERLOADS and PICK rows identical.

### W3 — Lite's own expert typer (≈12–19 sessions)

- **W3.1 TDS inventory and the carrier decision**: ~100 relation readers, `TdsErasure.refineResult`
  (`InferenceKernel.java:1050`), `eraseTdsRow`/`TDS_ROW`, `TypeAnnotations:152-163`, `CastChecker:33-39`, the
  `isSchemaErased` inlining gates; how the schema fact rides on 557 `new ExprType(` sites [W3 #14]. Carrier: nominal
  `TabularDataSet`, schema as a side fact. Gate: the inventory in GATES with each reader's fate; D-style ruling recorded
  in §2 if the carrier changes.
- **W3.2a Matcher prerequisites** as sub-pushes [W3 #10]: C3 linearization (ours is BFS, `KnowledgeLayer.java:139`,
  `InferenceKernel.java:1836`); class type-parameter variance (the parser drops `-U`); lambda values carrying
  `LambdaFunction<{…}>`; schema-algebra formals as NON_CONCRETE; a PrecisionDecimal row. Gate per sub-push: a unit test
  per prerequisite against the reference's documented behaviour; CANDIDATES/PICK unchanged.
- **W3.2b The matcher**: one lexicographic key over (type distances by C3 index, multiplicity distances), types before
  multiplicities (FM:69-103), a type parameter NON_CONCRETE (GTM:170-177), multiplicity arithmetic as MM:273-301; one test
  per matcher trap (C1–C11, C31). **First a one-day spike** [L5 §4]: call the `legend-pure-m3-core` jar's GTM on two World
  types through a Type → M3 bridge; if it cannot be driven, the property test compares against a table of reference
  outcomes generated by the reference dump instead. Then the differential property test over type pairs drawn from the
  World. Gate: the property test green; the trap tests green.
- **W3.3a Type facts before the loop** [W3 #1, #2]: the TDS switch and the argument-type facts (literal multiplicities,
  relation/Variant multiplicities, lambda carrier types, Nil/Enum/Any escapes). Gate: the reference lane's type rows not
  grown; rosters.
- **W3.3 The candidate loop, lite's own solver** (D15) [W3 #3–#9, L2 F2, L1 #7]: a written rule table
  (`docs/TYPER_RULES.md`, created by this item: first binding wins, LUB by variance, relation concatenation/widening,
  reverse inference, failure semantics per catch site) implemented as one inference context per call carried across
  candidates, keyed by (context, name); a deterministic tie rule of lite's own (declaration order) with ties the reference
  breaks by hash order pinned as a "reference-nondeterministic" class; the reference's merge-mode drop (TIC:472-480, a
  bug by its own comment) and candidate leftovers NOT copied unless a probe shows they change an observable outcome on the
  corpus (then a rule, a register row, and a test). Every selector listed with its fate (`CoreFn.of` pre-dispatch, the
  `resolveOverload` sites, `kernel.accepts` sites, QP routes); silent survival measured before anything is walled; the
  kernel's positional fallback (`InferenceKernel.java:88-90`) after its firing-count probe; `accessProperty` moves out of
  Typer. **Before W3.3: front-end differential fuzzing** (whole expressions compiled by legend-pure and lite; pick, types,
  accept/reject) [L1 #6g]. Both of today's overload algorithms deleted. Gate: reference lane OVERLOAD rows to the pinned
  residue; type rows not grown; rejection bucket not grown; W1.13 rows classified; a cost probe and a quiet timing
  within budget.
- **W3.4 G½ substitutes, never re-types** [L1 #2]: with instantiations recorded (W1.1b), `UserCallInliner`'s re-unification
  (`UserCallInliner.java:453-479`, swallowing `TypeInferenceException`), `redispatch` (`:485-522`) and `resolveStamps`
  (`:529-540`) are replaced by substitution with the recorded instantiation; any genuine re-selection after
  instantiation becomes a named typer query `specialize(FunctionId, typeArgs)` and a register row. Gate: G½ contains no
  `unify` and no candidate selection (an ArchUnit rule); fold results identical per test; snapshot byte-identical.
- **W3.5 Kernel rules, second half**: `register`, LUB with variance, `GenericTypeOperation`; checkers that existed only
  for kernel gaps retire. Gate: reference lane type rows; the retired checkers deleted.
- **W3.6 Forms by declaration** [W3 #15]: the Form table from W2.3a drives the typer; the typer's `CoreFn.of` sites
  deleted. If D11 chooses R, the typer emits uniform calls and algebraize (W4.1r) recognises forms, and W3.6 stops there;
  if S, each ambiguous typed kind splits into relation and scalar kinds by the chosen overload and `TypedRelationOp`
  grows to every relational kind. Gate: the lowerer's run-time relation checks counted and shrinking; rosters.
- **W3.7 The D11 experiment** (ruled 2026-09-29), during W3, also the W4 spike [L1 #9]: build, throwaway, a minimal
  algebra (Scan over a class, Filter, Project, Join, Aggregate, with a scalar family) and an algebraize step from the typed
  HIR after G½, and a rewrite that expands a class mapping into tables; take three hard cases end to end to SQL:
  navigation across a milestoned association, a graph fetch, a model-to-model chain. Pass: all three expressed with no
  object-level escape hatch (no node that means "do what today's resolver does here") and their rows equal today's on
  W1.10's adversarial fixtures. Record what each case needed. Result rules D11 at C3 and re-sizes W4. Size 3–5.

### W4 — The middle (≈30–50 sessions; re-sized at C3)

- **W4.0 The H gate**: W1.7's snapshot plus a post-H dump over the mapping-heavy set; W1.10 green on it; any open W0.6
  store-resolver pins listed. If D11 = S: the W2.0b census (`d11-homework-2026-09-29.md`, the questions after §6; hooks
  at `StoreResolver.resolve`'s exit, `Lowerer` `relation()` default and scalar catch-all, `Anchors.spaceOf`, the six
  native relation arms; the probe SPI `DecisionProbe` lives in `builtin`, which cannot name `TypedSpec`, so it needs a new
  SPI and a recorded layer edge) decides the leaf type by rule: a kind that ever reaches H's output in scalar position is
  in the scalar family.
- **W4.1a Mapping elaboration after F, today's shape**: per (MappingId, SetId), on demand through the query layer; a set's
  failure poisons the set; bindings keyed by a sealed `BindingKey` (Property | Local | SubtypeColumn | PrimaryKey)
  [W4 F4]; the set kinds listed and each with a shadow-probe row: embedded, inline, otherwise, merge, inheritance,
  enumeration mappings, aggregation-aware. Gate: the shadow probe (new `ClassSource` = old up to renaming) for every
  (mapping, set) the corpus and stress lanes touch [W4 F16]. Size 7–10 with W4.1b.
- **W4.1r (if D11 = R) Algebraize**: the step from W3.7 made real: every relational form recognised by declaration id;
  semantics as node properties (equality kind: Pure total equality vs SQL `=`; null-strictness; determinism/collation;
  nullability); the lowerer's ~38 run-time relation/scalar decisions deleted as their kinds disappear.
- **W4.2 One G½ and the schema evaluator** (after W2.5, W3.1/3.3a/3.4/3.6 and D19): one hygienic engine over the typed
  HIR by `VarId`, replacing SourceSubst, UserCallInliner, `StaticFold.inlineUserCall`, AlphaRename, StatementInline,
  LiteralMapUnroll and the resolver's private inliners, one slice each [W4 F8]; source-level β-expansion during typing
  ends. The D8 schema evaluator replaces `StaticFold`: folds only in schema positions over the pinned operation list;
  homework first: the operations the corpus's `NormalizeRequiredFunction` bodies use (selection criterion stated; counts
  differ: 55 marked functions vs 97 applications in 38 files [L2 F11]). Gates: fold results identical per test; the
  snapshot byte-identical; the operation-list pin; the never-a-row-value test; `columnValueDifferenceTest`,
  `rowValueDifferenceTest`, `zScoreTest` on DuckDB unchanged.
- **C4 go/no-go** (§1a) before W4.3.
- **W4.3 Store resolution as passes** (if D11 = R: as rewrites of the algebra, and steps 2–7 below collapse into it), each
  slice landing alone [W4 F2, F3, F13, F14]: 1 the desugar pre-pass (ChainNormalizer, ChainDispatch, the chain-op
  rewrites, SubQueryLift); 2 a structural `NavPath` key replacing dotted chain keys, `#fN/#dN` heads and identity-keyed maps
  (36 `IdentityHashMap`s; SQL byte-identical); 3 route as an annotation on `TypedGetAll`; 4 temporal spec collection, then
  one demand trie keeping first-read order; 5 temporal attribution `NavPath → TemporalContext`; 6 an inventory of the
  join-strategy decisions, **each marked observable (fan-out in `project`, null-extension for optional properties, EXISTS
  de-duplication in `filter`) or shape-only** [L2 F3], then an explicit join tree whose nodes carry their ON predicate set
  (the verifier asserts no null-supplying-side predicate outside its ON) [L3 #9], with **W4.1b** (join edges as data);
  7 read lowering through the join tree, a naming pass, the relational skeleton behind a print-back adapter whose
  deletion is pinned to W5.1c; 8 graph fetch in two halves; 9 relocations and the unowned concerns (metamodel rows, JSON
  source frames, M2M composition, execution-option appends, the 37 `findFunction` re-picks). Gates: snapshot
  byte-identical per refactor step; W1.10 (all three) green per step. Deletes: the one-pass resolver's state. Size 18–30
  (re-sized at C3).
- **W4.4a Load by manifest, non-M2M walls** (after D9); **W4.4b** M2M on the new passes, scope boundary from C3. Gate:
  census pins, boot-time growth within budget.

### W5 — The back end (≈10–16 sessions)

- **W5.1a One lowering table, derived** [W5-W7 #1, #2]: an immutable `LoweringTable`, `(FunctionId, Position) → Rule`,
  built once, refusing duplicates, checked one-to-one against the implementation table; first a probe naming each
  silently overridden `RULES.put` (`times`, `Scalars.java:294, :311`; `startsWith`, `endsWith`, `median`, `hash`,
  `dayOfWeekNumber`). Gate: snapshot byte-identical.
- **W5.1b Lowering decisions become typer annotations** (cast policy, static disjointness, match subtyping, compare kinds,
  lambda parameter types) [W5-W7 #3]. Gate: snapshot; the lowerer imports no model lookup.
- **W5.1c The lowerer reads the relational form**; W4.3's adapter deleted [W5-W7 #4].
- **W5.2 Semantic MIR** [W5-W7 #5, #6, L3 #3, #6, #7]: each unit or part a distinct record; `Join.Kind.sql` removed;
  **equality kinds as distinct nodes** (Pure total equality vs SQL `=`; the `verbatim` stamp and the operand-shape test in
  `NullSemantics.java:101-123` deleted); a **null-strictness property per `SqlFn`** (an exhaustive whitelist replacing the
  blacklist `SqlTyping.nullStrict`, `:708-729`); a **determinism/collation trait** on relational nodes (the source of D6's
  classifier); literal typing from the HIR, not magnitude (`AnsiSqlRenderer.java:1370-1378`), non-finite floats spelled or
  refused; the carrier ladder, gated by `CarrierPurityRatchetTest` reaching zero; deep immutability after a probe. Gates:
  snapshot reviewed; PCT rosters by class; `EqualityWorldsConformanceTest`'s declared divergences as a gate; W1.10b.
- **W5.3 Legalisation and one escaper per dialect** with a verifier before emission; an `Identifier` value with
  per-dialect case folding; escaping also reaches the SQL concatenated outside the dialects (`StatementExecutor.java:3050,
  3218`, `exec/Ddl.insertText`, `plan/InProtocol`, `TestDataGenerator`) [W5-W7 #11]. Gate: an injection test per site.
- **W5.4 Semantic types and per-dialect delivered types** (reframed from "the ANSI split") [L3 #6]: `Spellings.ANSI`,
  DuckDB as a layer, `SqlTyping` per dialect used only to place conform casts. After W5.1b and W5.2. Gate: snapshot
  reviewed; W1.8.
- **W5.5 The Postgres lane** (after W5.2; cut candidate) [W5-W7 #10, L3 #11]: homework first (collation, QUALIFY,
  `ROUND(double,int)`, integer `/`, strict casts, `chr(0)` in `stringLit`, identifier folding); zonky embedded Postgres;
  a Postgres dialect; `Compiler.dialectOf` dispatch fixed (today a non-H2 session silently renders DuckDB,
  `Compiler.java:748-758`); a first fail roster.
- **W5.6 Engine SQL text as a product dialect** (D16): `EngineStyleH2` (1,901 lines), `EngineStyleDB2` (308),
  `EngineStyleComposite` render from the same MIR and never re-lower; their goldens are kept; their SQL executes and must
  return the native dialect's rows (a lane); every byte difference from an engine golden is a register row (D8
  constants; alias shapes the MIR does not carry). `StatementExecutor`'s `toSQLString`/`planDialect` choice
  (`:473-480`, `:1179-1190`) becomes an explicit option. Gate: the rows lane; goldens pinned; the register.

### W6 — Plan, runner, periphery (≈10–16 sessions)

- **W6.3 The judge SPI** (D7), before W6.2: a public judge SPI; the per-assert join of the two judges stays a gate.
- **W6.1 A staged plan IR**: late-bound nodes (SchemaProbe, DynamicPivot, ForEach(values, template), Effect barrier)
  **passing values as JDBC bind parameters** typed by the compile-time column type, never re-spelling database values as
  SQL literals (`exec/DynamicPivot.java:61-111`) [L3 #8]; service and user parameters bound too; probe and main query in
  one transaction; each dialect's required session settings applied and verified once per connection
  (`DuckDb.java:32-33` TimeZone, `H2Settings.java:45-51`) [L3 #12]; one printer gated by lite's own plan goldens (engine
  plan text is D16's dialect, not this printer's gate). Gate: goldens; an injection test through parameters.
- **W6.2 The runner**, after W6.3 and W4.2: resolves late-bound nodes in order; `StatementExecutor` stops re-running G,
  G½, H, I (W1.3 routed them; now the copies are deleted); the census and env tracing become an injected observer;
  global static state removed; `Executor.decodeAny` and the `WireTypes` rewrite named and typed by the plan.
- **W6.4 Periphery**: lineage over the typed HIR plus H's binding map; test-data generation through the MIR; the server a
  thin adapter; test runners and the probe out of the product jar. Gate: the product jar's contents list.

### W7 — Close-out (≈1–3 sessions, or folded into owning slices per C1)

- The target map met (§1b), `core-layers.txt` equal to the map file with no exceptions left.
- Each regex guard deleted after the type or verifier that asserts its invariant: `IdentityGuardrailTest` pattern by
  pattern; `STRING_DISPATCH_SITES` with a charter C6.1 amendment; `VerdictChannelRegisterTest` after W6.3;
  `JavaEvalLedgerTest`'s residue register after W6.2/W6.3 and an `AGENTS.md` edit; the ArchUnit rules that javac or the
  layering test now enforce.

**Size (judgement):** W0 2–4 left, W1 14–22, W2 16–25, W3 12–19, W4 30–50, W5 10–16, W6 10–16, W7 1–3: about 95–155
sessions, which the first week's evidence says overestimates mechanical items 3–5×. Re-fitted at C1 from logged cost.

---

## 5. Order

Serial; one owner.
1. W0.6 → W1.0b → W0.4 → W0.7.
2. W1.1b → W1.1c → W1.1d → W1.2 → W1.4 → W1.3 → W1.5 → W1.7 → W1.11 → W1.12 → W1.9 → W1.13 → W1.10 → W1.8. **C1.**
3. W2.1 → W2.2 → W2.2b → W2.3a (**C2**) → W2.3b → W2.4 → W2.5 → W2.6 → W2.7 → W2.9.
4. W3.1 → W3.2a → W3.2b → W3.3a → (front-end fuzzing) W3.3 → W2.8 → W3.4 → W3.5 → W3.6, with W3.7 during W3. **C3.**
5. W4.0 → W4.4a (D9) → W4.1a → W4.1r (if R) → W4.2 (D19) → **C4** → W4.3 steps with W4.1b → W4.4b. **C5.**
6. W5.1a (may start after W1.7) → W5.1b → W5.1c → W5.2 → W5.3 → W5.4 → W5.6 → W5.5.
7. W6.3 → W6.1 → W6.2 → W6.4. W7 last.

## 6. The alternative D1 did not take (record only)

W2.3–W2.6 put the resolution on the parse nodes instead: `AppliedFunction`'s callee becomes a sealed `Callee` (`Spelled` |
`Bound` | `Member(name)`); `VarId` and element ids become fields on `Variable`, `LambdaFunction` parameters,
`PackageableElementPtr` and `EnumValue`, null before resolution. Rule 0b.10 is then waived for D.
