# The execution plan: the whole compiler, rebuilt stage by stage behind the oracle

**Rewritten 2026-09-28** after the whole of `core` was read stage by stage
(`plan-audit-2026-09-26/architecture-review-2026-09-28.md`, evidence in `plan-audit-2026-09-26/stage-readings-2026-09-28/`).
**Revised 2026-09-29 (rev H1)** after an adversarial audit of every wave against the code
(`plan-audit-2026-09-26/h1-plan-audit-2026-09-29/`, synthesis in its `README.md`): the target is unchanged; items were
corrected, split, re-ordered, given gates, and re-sized; six decisions (D6–D11) are owed.

This is the ONE living plan. It replaces the step list of the 2026-09-26 version (steps 0–2 of which are done; their
records are in `docs/GATES.md` and the old text is in git history at `601995bc2`), `REAL_PLAN_2026_09_25.md`'s order, and
`NEXT_STEPS_2026_09_28.md`. The research files in `plan-audit-2026-09-26/` stay as the homework they are; this page says
what to build, in what order, gated how. An item's audit finding is cited as `[W2 #5]` (report `W2-resolved-tree.md`,
finding 5), `[W4 F3]`, `[W0-W1 #8]`, `[W3 #1]`, `[W5-W7 #14]`.

Keep this page current: when a step lands, mark it done with the GATES.md entry's date; when a number changes, the tool
that measures it prints it into GATES.md — this page carries no hand-typed counts except as dated context.

## 0. Rules

1. **Homework before code, from primary sources** — the pinned trees
   (`$(bazel info output_base)/external/+http_archive+legend_{pure,engine}_src`) and our code, by file:line.
2. **Probe before switch**; the probe's receipt is saved before the switch and the switch is judged against it.
3. **The gate is the oracle plus the numbers**: corpus rosters LOST 0 (by name AND failure class once W1.4 lands), the
   product-SQL snapshot byte-identical for refactor slices (W1.7), the reference lane's disagreement set not grown AND its
   coverage pins not shrunk (W1.1), the phase verifier green (W1.3), golden dumps unchanged except where the record
   explains (W1.5), `bazel test //...` and `//tools/deps:all` green, timing read alone and quiet. **Every item states its
   own gate**; an item without one is not ready.
4. **Deletions land with the switch.** A pin that moves carries a dated reason naming the step.
5. **One variable at a time.** Names change with the world held constant; the world changes with names held constant; a
   new tree lands with today's rule, and the rule changes in a later push.
6. **Every slice:** homework → probe → switch → gate → deletion → GATES.md record → push. Never force-push; commit as
   `neema2 <neema2@gmail.com>` with the session trailers.
7. **A timing is a lane run alone** with `--nocache_test_results`, load under 3 at start; a lane inside a chain is not a timing.
8. **Standing rulings:** no string identity for a declaration; no PCT or category checks in the compiler; no caches
   before the algorithm is proven; every deferral pinned with an owner; we own everything the program needs.
9. **"Strict" means: collect every diagnostic in one pass, poison the failed unit, fail the build on any error**
   (ruled 2026-09-28). It does not mean abort on the first error; it never means accept bad input. What the "unit" is and
   when an undemanded unit's error counts is D10.
10. **Every new stage gets its own IR type.** A phase boundary is proved by javac, not checked at run time. For H, D11
    proposes a scoped form.
11. **A confirmed defect whose fix belongs to a later wave** is pinned as an expected-failure test naming its owner item
    (W0.0); the test flips when the owner lands.

## 1. The target (what "expert" means here)

The product is judged by a differential against legend-pure, so resolution and overload semantics copy the reference
exactly, oddities included (`reference-matching.md`, `kernel-reading-2026-09-26.md`). Around that constraint the
architecture is a conventional production front end and a query compiler back end:

| # | stage | IR out (a distinct sealed type) | identity it carries | today's code | stage reading |
|---|---|---|---|---|---|
| A–C | lex, parse | syntax tree (`ValueSpecification` without resolver fields; wire trivia in a side record) | spans only | lexer/, parser/ | A01, A02 |
| W | World (eager knowledge) | declaration tables per kind; per-section import groups; C3 linearizations and variance | `FunctionId` (external key, the reference's element name); `ClassId`/`EnumId`/`StoreId`… as typed FQN wrappers; `DeclId` handles internal to the tables only | model/, builtin/, compiler/ModelBuilder | A03, A04 |
| D | resolve | `ResolvedExpr` | call: `Candidates(List<FunctionId>)`; dot access: `Member(name)`; every binder: `VarId`; every element reference: `Ref<Kind>` (FQN wrappers, never handles) | compiler/NameResolver | A04 |
| F | elements | typed declarations (`TypedClass`, `TypedFunction`…) keyed by id | ids | compiler/element | A04 |
| G | type | typed HIR (`TypedSpec`): every node typed; every call ONE declaration; every member its `PropertyId` | ids, `VarId` | compiler/spec | A05, A06 |
| E′ | mapping elaboration (after F) | typed mapping IR: per set a typed relation expression and bindings keyed by a sealed `BindingKey` | ids, spans | normalizer/ (today emits untyped text-Pure before types exist) | A06 |
| G½ | inline, shape-evaluate | typed HIR | substitution by `VarId`, one engine, fresh ids per copy | UserCallInliner, StaticFold, SourceSubst, AlphaRename, StatementInline, LiteralMapUnroll… | A05 |
| H | store resolution, as passes | a relational skeleton (routed sets, a join tree, `ColumnRef(JoinNodeId, column)`) with typed-HIR scalar leaves (D11) | `SetId`, `NavPath`, `JoinNodeId`, `PropertyId` | resolver/ (35,925 lines, one pass) | A07-A08 |
| I | lower | SQL MIR (semantic nodes; units, parts, join kinds as distinct records or enums; no SQL spelling) | `FunctionId` → one immutable rule table, derived and checked against the implementation table | lowering/ | A09 |
| J | legalise + render | SQL text per dialect | — | sql/, sql/dialect | A10 |
| P | plan | staged plan IR (SqlExec, Sequence, Allocation, Effect barrier, late-bound SchemaProbe/DynamicPivot/ForEach, VerdictBatch) | — | plan/ (no IR today), StatementExecutor | A11 |
| K | run | results | — | exec/, a thin runner resolving late-bound nodes in order | A11 |

Cross-cutting: `Diagnostic(code, severity, phase, span, args)` in a sink from every stage; a phase verifier asserting
each IR's post-conditions after every pass in tests; per-pass golden dumps; the reference lane; the corpus with rosters by
(name, failure class); a per-test product-SQL snapshot; a query fuzzer with DuckDB-equals-H2 as oracle.

## 2. Decisions

| id | question | status |
|---|---|---|
| D1 | The call node's type | **RULED 2026-09-29 (the user): a distinct `ResolvedExpr` family.** §6 records the alternative |
| D2 | Binding scope | **RULED 2026-09-28: everything** — calls, members, binders (`VarId`), element references, on one new tree type; ids added in separate pushes (W2.3a, W2.5, W2.6) so each change is attributable |
| D3 | A reference lane at the pinned release | **RULED 2026-09-29 (the user): build it.** Spike done (H3): the whole closure compiles from `@maven_upstream` in 35 s at 5.3 GB; no new downloads |
| D4 | "No tolerant modes" | **RULED 2026-09-28**: rule 0.9 |
| D5 | Plan the whole program now | **RULED 2026-09-28**: this page |
| D6 | W0.4: how the corpus certifies product SQL | **OPEN.** Recommendation: a product-SQL lane (the corpus runs the product dialect unmodified; the engine-scan-order pass becomes a harness-side comparison policy), because moving the pass only relocates the non-product SQL [W0-W1 #7]. Includes a separate referee session for the H2 lane |
| D7 | The judge charter | **OPEN.** TENET_CHARTER C2b/C2c and Z2 make verdicts World 1's (host) job; JUDGING_TWO_MODES (2026-09-17) made the database judge the product goal; the charter was never amended. Either amend C2c/Z2 and make the database judge the only product judge (cost: H2 roster −65/+72, the stress lane needs a database EqualToJson), or keep the host judge as the product judge [W5-W7 #16, #17] |
| D8 | The shape evaluator's scope | **OPEN.** May compile-time string `+` produce an identifier (a column name)? C6.2 and WORLD_MAP §4 call it COMPUTED; `StaticFold` does it today [W4 F7]. Blocks W4.2 |
| D9 | The manifest world | **OPEN.** The 2b stdlib question, WORLD_MAP rule 8 (an engine file only if every function passes the deletion test), and whether roadmap test files may be excluded by a named, pinned register [W4 F9]. Blocks W4.4 |
| D10 | The failure unit under rule 0.9 | **OPEN.** Does an ill-typed body or mapping set that nothing demands fail the build? The reference fails the whole compile; today we poison per body and per set lazily (407 of 410 unknown-function failures are in bodies). Recommendation: resolve and type everything eagerly, collect every diagnostic, and fail the build (the reference's behaviour); the corpus harness attributes each test's failure to the diagnostics in its dependency closure — a report, not a tolerant mode [W2 #8, W4 F6]. Blocks W2.3a's poisoning and W4.1 |
| D11 | Rule 0.10 for H | **OPEN.** A javac-distinct physical IR over arbitrary scalar leaves means duplicating 77 typed records. Proposal: a distinct sealed relational skeleton with typed-HIR scalar leaves plus `ColumnRef`, introduced LAST in W4.3 behind a print-back adapter that W5.1c deletes; "no store-only node in a leaf" is a verifier check [W4 F1] |
| D12 | The six rulings of the `ResolvedExpr` design (H2, `h2-resolved-expr-design-2026-09-29.md` §7) | **OPEN.** Recommendations: (1) resolved bodies in a side table `ResolvedBodies`, not generic records (169 files); (2) freeze candidate sets at resolution if the push-1 probe counts 0 boot-body divergences; (3) today's callee strings ride `Call`/`Member` as a shrink-only `Legacy` field during W2.3a only; (4) W2.3a does not need D10 (an `Error` node replays today's failure lazily; D10 becomes its own flip); (5) port StaticFold and AlphaRename rather than bridge them; (6) identity keys for non-function body slots |

## 3. Done

| step | what | record |
|---|---|---|
| 0 | annotations to `com.legend.base`; two leaf moves; `//core` as 29 Bazel targets | GATES.md 2026-09-26 "Execution plan step 0" |
| 1 | the reference differential joins call by call | GATES.md 2026-09-26 "step 1" |
| 2 | lowering registers by `FunctionId`; one identity | GATES.md 2026-09-26 "step 2" |
| 3-homework | kernel reading, resolver per-statement fix, tier probe | GATES.md 2026-09-26 "step 3 homework" |
| 3-probes | nine counts before any step-3 switch; tier classifier corrected | GATES.md 2026-09-27 "step 3, the probe push" |
| audits | program audit; architecture review; stage readings; H1 plan audit | `plan-audit-2026-09-26/` |
| H3, H4 | reference lane spike from the pinned jars; diagnostics design | `h3-reference-lane-spike-2026-09-29.md`, `h4-diagnostics-design-2026-09-29.md` |
| H1, H2 | the plan audit (this revision); the `ResolvedExpr` design | `h1-plan-audit-2026-09-29/`, `h2-resolved-expr-design-2026-09-29.md` |
| W0.0, W0.1, W0.2 | expected-failure pins; the server's doors; the four confirmed defects; the static-final rule | GATES.md 2026-09-29 "Rebuild W0, first batch" and "second batch" |
| W0.3 | ten latent defects reproduced, each pinned to its owner item | GATES.md 2026-09-29 "Rebuild W0.3" |
| W0.5 | the line guard and three ceremony guards dropped; what stays and why is in W0.5 | GATES.md 2026-09-29 "Rebuild W0, first batch"; commit ed85b5166 |
| H5 | quiet baselines at ed85b5166 (corpus DuckDB 75.7 s, H2 79.8 s, core 29.9 s, stress 23.0 s, guardrails 9.5 s) | GATES.md 2026-09-29 "Rebuild H5 and W1.6" |
| W1.6 | the typer split: TdsDesugars and Overloads out of Typer (3,499 → 1,748 lines), probe rows identical | GATES.md 2026-09-29 "Rebuild H5 and W1.6" |
| W1.1 (1) | the reference lane, calls first: cached reference dump, Java join, whole report pinned, a reason per class | GATES.md 2026-09-29 "Rebuild W1.1 (1)" |

## 4. The waves

Each item is one push unless it says otherwise. Estimates are working sessions, judgment, labelled as such. Every item
names its gate.

### W0 — Now: safety, confirmed defects, guard room (≈3–5 sessions)
- **W0.0 Expected-failure pins** (rule 0.11): a small test annotation or register naming the owner item, so a confirmed
  defect whose fix is later sits in a green chain [W0-W1 #16]. Gate: a deliberately flipped pin turns the chain red.
- **W0.1 Close the server's open doors.** Delete `/engine/sql` and `QueryService.executeSql`; bind the loopback
  interface by default; refuse any request whose `Origin` is outside an allow-list (loopback origins plus a configured
  list), and answer CORS with the allowed origin, never `*`. Localhost binding alone does not stop a browser page
  [W0-W1 #3]; the Origin check does, because a browser always sends `Origin` on a cross-origin POST. **Revised
  2026-09-29:** no required custom header (datacube's client, `datacube/src/pure-v1.ts`, speaks to the real
  legend-engine too, and lite serves upstream's API unchanged), and no per-spec refusal of `LocalFile`/`tcp` specs:
  a request's model already runs arbitrary setup SQL on its connection (`testDataSetupSqls`), so refusing file specs
  alone would be theatre; the boundary is loopback plus Origin, and binding elsewhere prints a warning. Re-seed `LegendHttpServerIntegrationTest`, `ConnectionIsolationTest`,
  `ConnectionLeaseTest`, `QueryServiceDirectTest` through a test-only seeding path; move `ErrorShapeGuardrailTest:103` and
  `JavaEvalLedgerTest:1248` pins with the push. Gate: tests that a text/plain cross-origin POST and a file/tcp connection
  in a request are refused.
- **W0.2 Four confirmed defects**, each with a failing test first:
  - (a) H2's split-part UDF in the product dialect (`H2.splitPartCall`, `H2.java:719`, inherited by `H2Modern`).
    `EngineStyleH2`'s `legend_h2_extension_*` names are engine golden text, not defects [W0-W1 #4]. Native `SPLIT_PART`
    has different semantics, so the fix is a probed spelling or a loud wall; the failing test runs on a bare H2 session,
    because the corpus lane installs the aliases.
  - (b) `StaticFold` `toOne` on a non-singleton list returns the list (`StaticFold.java:692-694`): return "not static".
  - (d) the static-state escape (`exec/CanonicalDivergence.java:558-559`): redesign `CONTEXT_SOURCE` as an injected seam
    (the harness write at `MinimalCorpus.java:552`) in the same push as an ArchUnit "static fields are final" rule, which
    is red today on exactly that field; `static final` mutable holders are named as the rule's known limit [W0-W1 #5].
  - (e) `sql` → `compiler.element.type`: move `TDS_NULL_CELL` into `sql` and drop the Bazel dep (`EngineStyleH2.java:262`,
    `core/BUILD.bazel:85`).
  - (c), the kernel's positional fallback (`InferenceKernel.java:88-90`), moved to W3.3: it is a switch with no probe and
    its judge is W1.1's type rows [W0-W1 #6].
- **W0.3 Probe the latent ones** (a failing test pinned by W0.0 with its owner, or a recorded "not reproducible"): lowerer
  let scoping (→ W2.5); inliner capture (→ W4.2); `TypedFilter.stamp` dropped at 12 rebuilds; `withChildren` field drops;
  import scope keyed by element FQN (→ W2.2); UTF-16 vs code-point columns (decides W1.2's unit; H4 chose UTF-16);
  `ServiceTestRunner` hashCode keys; `PureDateLiteral` with validation off; the NameResolver NPE; the store resolver's
  alias-prefix temporal bug (→ W4.3).
- **W0.4 The corpus certifies product SQL**, per D6. Lists the co-work: a dialect injection seam (`Compiler.dialectOf`),
  `exec/Census.java:92`, `TestLaneOrderGuardrailTest`, the four engine-order registers, and the H2 lane's aliases on its
  referee session.
- **W0.5 Guard room** (moved from W7) [W0-W1 #17, W5-W7 #12, #24]: drop the 3,500-line guard (every early item edits a
  file at 3,472–3,499); delete the ceremony guards whose invariant no type or test needs (A13 §2: the JDBC
  TEST_REGISTER, DanglingState rule 2, ParkedWork, ShadowWalker zero rows, the claims `also` column, duplicate parity
  tests). **Not** `JavaEvalLedgerTest` (its exact line pins and funnel registers): AGENTS.md names it as the execution
  tenet's enforcement, so it goes after W6.2/W6.3 with an AGENTS.md edit (W7) [W5-W7 #24]. **Done 2026-09-29:** the line
  guard, DanglingState rule 2, the JDBC test register, the 15 zero rows of the shadow-walker census. **Kept, with
  reasons:** `ParkedWorkLedgerTest` (a real deferral ledger: each row has an owner and a price; its PARK-4 anchor is
  fragile, and parked rows become `@KnownDefect` pins when their owner item is planned); `preludeIsCurrent` and
  `signatureTextIsCurrent` (they duplicate the diff tests but carry the generators' census, bootstrap and dump modes);
  the claims `also` column (a generator output change, W7). Gate: the chain green; the GATES entry lists
  each guard with the reason its invariant is not needed or is held elsewhere.

### W1 — Gates and foundations (≈9–14 sessions). Everything later is judged by these. Re-cut order: W1.6 first.
- **W1.6 The typer split along its real seams** [W0-W1 #1] (the 39 checkers are already separate files): the pre-dispatch
  desugars (`Typer.java:700-1310`) into a desugar pass; the overload machinery (`applyGeneric`/`checkGeneric`/
  `checkWithDeferred`, `:1465-2090`) into its own class; `accessProperty` (`:2951-3192`) beside it. Pure moves. Gate: the
  corpus rosters and CANDIDATES/PICK probe rows byte-identical.
- **W1.1 The reference lane at the pinned release** (spike: H3). A `java_test` (manual, `resources:memory:12288`) whose
  reference dump is a **cached build output keyed on the jars** (a genrule over `//tools/reference:ref_resolutions`), so
  a run pays only our side and the join; the join ported from `tools/reference/join.py` to Java.
  - Rows start with **calls**: declaration id, resolved type parameters and multiplicity parameters, and result
    type/multiplicity on both sides (the reference: `_resolvedTypeParameters`, `_genericType`, `_multiplicity`; ours: a
    typer-recorded `position → (ExprType, bindings)` side table, not new fields on 100 constructor sites), printed by one
    canonical type printer used by both sides [W0-W1 #2].
  - Form nodes (filter/map/project/…) get an id and a span so later gates can see them [W3 #8].
  - **Coverage pins** against survivorship: the dropped-source set, the FAILED-body set, an AGREE floor
    (`OurResolutionsTest` drops failing files, so "not grown" alone passes when coverage shrinks) [W0-W1 #8].
  - Disagreements pinned with reasons **per (kind, spelling) class**, not per row [W0-W1 #10].
  - Not in CI (12 GB); every front-end slice's GATES entry cites the lane's receipt [W0-W1 #9].
  Size 2–3.
- **W1.2 Diagnostics foundation** per `h4-diagnostics-design-2026-09-29.md`: types, a sink, a bridge at each stage
  boundary; the parser first (codes, spans, UTF-16). Adds to H4: **speculative scopes** (diagnostics inside an overload
  attempt or a `checkWithDeferred` retry are discarded with the attempt; 21 catch sites) and **parser recovery** for
  poison-and-continue [W0-W1 #11]. The resolver converts in W2.3a (it is new code), not here.
- **W1.4 Rosters by failure class = (phase, exception class, diagnostic code if any)** [W0-W1 #12], kept in ONE JVM
  (sharding needs a merge step and host/database pairing; deferred until a timing shows the need) [W0-W1 #14]; the stress
  lane's pass count becomes a roster.
- **W1.3 Phase verifier** hooked at `Compiler`'s two G→G½→H→I sequences (`Compiler.java:591-614`, `:1173-1194`); starts
  with today's post-conditions true today; known violations (e.g. `SqlSource.Join.Kind.sql`, interval unit strings) are
  pinned as a shrink-only set owned by W5.2 [W0-W1 #13]. Adds: every variable reference bound in scope, ids unique (once
  W2.5 lands).
- **W1.5 Golden dumps per pass** with deterministic printers for TypedSpec and MIR, produced by a build action blessed by
  `//:update_generated`; a fixed program set including a mapping-heavy set [W0-W1 #15, W4 F10]. Size 1–2.
- **W1.7 The product-SQL snapshot** (new) [W4 F10, W5-W7 #9]: the store resolver made deterministic (NavReducer names from
  `identityHashCode`, `NavReducer.java:63,75`); an injected observer (not the `LL_TMP_SQL` stderr print) records every
  statement's SQL per test per dialect, including `EngineStyleH2`; aliases canonicalized. Refactor slices in W4 and W5
  gate on byte identity; semantic slices gate on a reviewed diff. Needs W0.4.
- **W1.8 The query fuzzer** (moved from W7) [W5-W7 #23] with a register of declared DuckDB/H2 divergences first; the oracle
  W5.2–W5.4 need.

### W2 — The resolved tree (≈12–18 sessions). The old step 3a/3b, widened by D2.
- **W2.0 = H2, the `ResolvedExpr` design note** — **written 2026-09-29** (`h2-resolved-expr-design-2026-09-29.md`; rulings D12; it sizes W2.3a at 6–8 sessions in four pushes) [W2 #1–#3]: what holds a resolved body (the ~15 body
  fields across `protocol` and `model`; `FunctionId` lives in `model`); the one builder that makes `ResolvedExpr` from a
  spelling and a scope, used by D, E and G; `Member`, `new`/`copy`, the `infix` and `propertyCall` flags; the binder
  scope and fresh-id supply; the World index lifecycle.
- **W2.1 World tables and the index in three layers** [W2 #9]: a cached boot index, a graph index built before D, an
  extension after E (E's lifted functions are called by E's own mints and the typer). Refuse model↔model duplicate ids
  now; native↔model twins wait for W2.8 [W2 #18]. A collision guard on the mangle (`Pure.java:616`). Gate: CANDIDATES
  identical.
- **W2.2 Import groups per section**, attached by section, not keyed by element FQN (fixes the first-wins bug,
  `NameResolver.java:258`; `elementOffsets` has the same key, `ElementParser.java:326,391`); every `elementImports`
  reader switched [W2 #16]. The core group becomes the reference's 29 for Pure source only after a probe of resolutions
  served only by `variant`, `relation`, `precisePrimitives`. Gate: CANDIDATES identical, or the probe's rows explained.
- **W2.3a The `ResolvedExpr` family with TODAY'S rule** [W2 #4, #5]: calls (`Candidates`), `Member(name)` for every dot
  spelling, `new`, the flags; variables and element references still carry names. The merge point's full rule (BareNames
  ENGINE/CORE/FORM tiers) moves inside D unchanged. E's and G's ~595 untyped constructions go through the builder; E.6
  (re-resolution) is deleted; an ArchUnit rule forbids `compiler.spec` constructing `protocol.spec` nodes [W2 #2, #3].
  Every reader of a resolved body (108 files) switches. Poisoning per D10. Gate: CANDIDATES compared by (site, candidate
  set) identical; poisoned calls counted by diagnostic code against the UNKNOWN-FN baseline [W2 #22]. Size 4–6 (several
  pushes behind one feature seam; the plan for the seam is in H2).
- **W2.3b The reference's candidate rule** (imports ∪ core ∪ Root, no own-package tier; `reference-matching.md` 1–3) for
  Pure source; engine input keeps the engine's Handlers namespace [W2 #6]. The parser's minted and bare names (`col`,
  `agg`, `func`, `olapGroupBy`, `tdsRows`, `tableReference`) each get a declaration or a syntax node D binds [W2 #7].
  Gate: the reference lane's rows; moved rows listed by class.
- **W2.4 Member semantics**: the typer resolves `Member` against the receiver's type and emits the reference's rewrites
  (automap `map`, `extractEnumValue`, milestoning dates); the arrow spelling is a function call only; **`PropertyId`
  introduced** on member access [W2 #19, W4 F3]; `new` reshaped to the reference's `new(Class, String, KeyExpression[*])`
  with `copy` and lite declarations [W2 #20]. `resolveOverload` stays for qualified properties (three LIFTED n>1 cases
  pinned) until W3.3 [W3 #13]. Gate: reference lane PROPERTY_AS_CALL rows; rosters.
- **W2.5 `VarId` for every binder** with the display name kept: D allocates ids for implicit binders (`this`, service
  parameters, `_path`, `_gf<n>`, `_s<N>_`) and E and validation reuse them; `ParameterDefinition` gains a `VarId`; G gets a
  fresh-id supply [W2 #11]. D, E and G readers switch; engines W4.2 keeps key on ids; G½, H and I switch inside W4
  [W2 #12, W4 F12]. Alpha-renaming becomes id-freshening per copy [W2 #13]. Gate: verifier (bound in scope, unique) and
  golden dumps modulo ids.
- **W2.6 Element references as `Ref<Kind>`** (FQN wrappers; `DeclId` never in a tree [W2 #15]): pointer and enum-value
  sites (~155), element-record `resolveName` sites (~56), type names in `TypeExpression` inside bodies; kinds include
  Package, a function by signature id, a unit, Profile, multiplicity constants [W2 #14]. Gate: rosters; element-name
  compares shrink to type-shape tests.
- **W2.7 Typer desugars bind their declaration**: G's mints name the ONE declaration they mean (the normalizer's mints are
  W4.1's) [W2 #25]; an overload group only where the reference searches. Gate: PICK rows identical.
- **W2.9 Mapping-DSL references resolved in D** (new) [W4 F5]: the normalizer's private resolvers
  (`AssociationSynthesis.resolveAssociation`, `StoreSubstitutionRewrite`, `MappingClosures`) replaced by D's output, so
  W4.1 has something to read. Gate: rosters.
- **W2.8 The merge point by table** — **after W3.3** [W2 #17]: `FunctionCompiler.functionsAt` reads the declaration table
  only; `isPlatformOwnedFunction`, the PCT stereotype check and `SUPPRESSED_ONCE` deleted; one declaration per id; broken
  overloads reported, not silently dropped (`FunctionCompiler.java:139-158`). Gate: OVERLOADS and PICK rows identical.

### W3 — The typer is the reference's (≈11–18 sessions). Re-ordered: type facts and the TDS switch before the loop.
- **W3.1 TDS inventory and the carrier decision**: ~95 relation readers (not 45), plus `TdsErasure.refineResult`,
  `eraseTdsRow`/`TDS_ROW`, `TypeAnnotations:152-163`, `CastChecker:33-39`, and the `isSchemaErased` inlining gates; how
  the schema fact rides on 557 `new ExprType(` sites [W3 #14]. Recommended carrier unchanged (nominal `TabularDataSet`,
  schema as a side fact).
- **W3.2a Matcher prerequisites** as sub-pushes [W3 #10]: C3 linearization (ours is BFS); class type-parameter variance
  (the parser drops `-U`); lambda values carrying `LambdaFunction<{…}>`; schema-algebra formals as NON_CONCRETE; a
  PrecisionDecimal row.
- **W3.2b The matcher** (FEM/FM/GTM/TM/MM) with one test per matcher trap (C1–C11, C31) and a **differential property
  test** running the `legend-pure-m3-core` jar's matchers against ours over type pairs drawn from the World [W3 #11].
- **W3.3a Type facts before the loop** [W3 #1, #2]: the TDS switch (old W3.4) and the argument-type half of old W3.5
  (literal multiplicities, relation/Variant multiplicities, lambda carrier types, Nil/Enum/Any escapes).
- **W3.3 The candidate loop** (FEP): ONE inference context per call carried across candidates, a port of
  `TypeInferenceContext` keyed by (context, name) — not union-find [W3 #3, #4]; failure semantics as the reference's
  (a register-only `typeLambda`; which of the 21 catch sites keep checking) [W3 #5]; every selector listed with its fate
  and wave (`CoreFn.of` pre-dispatch, 11 direct `resolveOverload` sites, `kernel.accepts` sites, QP routes) [W3 #7];
  silent survival measured by the right probe before anything is walled [W3 #6]; the kernel's positional fallback
  (old W0.2(c)) after its firing-count probe; the ids each pick change needs registered (e.g. `isEmpty(Any[0..1])`, and
  its lowering rule) [W3 #9]; a cost probe and a quiet timing against the 60 s ceiling [W3 #16]. Both of today's overload
  algorithms deleted. Gate: reference lane OVERLOAD rows to the pinned residue; type rows not grown.
- **W3.5 Kernel rules, second half**: `register`, reverse inference, LUB with variance, `GenericTypeOperation`; checkers
  that existed only for kernel gaps retire (about three) [W3 #17].
- **W3.6 Forms by a candidate's Form row**; the typer's 16 `CoreFn.of` sites deleted; the other five go with W4 and W6
  [W3 #15].

### W4 — The middle (≈32–51 sessions). Identity first; the physical IR last.
- **W4.0 The H gate**: W1.7's snapshot plus a post-H dump over the mapping-heavy set; W0.3's resolver defects fixed or
  pinned before the baseline.
- **W4.1a Mapping elaboration after F, today's shape**: per (MappingId, SetId), on demand and memoized per World, a set's
  failure poisons the set (per D10); what `ClassSource` carries today, produced by the real typer; bindings keyed by a
  sealed `BindingKey` (Property | Local | SubtypeColumn | PrimaryKey) [W4 F4]; query-time parts stay in H's route pass.
  The normalizer's untyped mints go through the W2 builder. Gate: a shadow probe comparing, for every (mapping, set) the
  corpus and stress lanes touch, the new `ClassSource` with the old one up to variable renaming [W4 F16]. Size 7–10 with
  W4.1b.
- **W4.2 One G½** after W2.5, W3.1/3.3a/3.6 and D8: one hygienic engine over typed HIR by `VarId`, replacing ≥10 sites
  (SourceSubst, UserCallInliner, `StaticFold.inlineUserCall`, AlphaRename, StatementInline, LiteralMapUnroll, the
  resolver's private inliners — one slice each) [W4 F8]; source-level β-expansion during typing ends. Gate: fold results
  identical per test; the snapshot byte-identical.
- **W4.3 Store resolution as passes**, in this order, each slice landing alone [W4 short answers, F2, F3, F13, F14]:
  0 gate (W4.0); 1 the desugar pre-pass (ChainNormalizer, ChainDispatch, the chain-op rewrites, SubQueryLift);
  2 a structural `NavPath` key replacing dotted chain keys, `#fN/#dN` heads and identity-keyed maps (SQL byte-identical);
  3 route as an annotation on `TypedGetAll`; 4 temporal spec collection, then one demand trie keeping first-read order
  (the ≥8 walkers switched one per probe); 5 temporal attribution `NavPath → TemporalContext`; 6 an inventory of the
  join-strategy decisions, then an explicit join tree emitting today's shapes — with **W4.1b** (join edges as data);
  7 read lowering through the join tree, a naming pass, and the relational skeleton (D11) behind a print-back adapter
  reproducing names and stamps; 8 graph fetch in two halves (tree-to-demand before 4, emission after 6); 9 relocations
  and the unowned concerns (metamodel rows, JSON source frames, M2M composition, execution-option appends, the 37
  `findFunction` re-picks). H's calls into the typer, G½, the executor and nested resolvers are named edges, accepted
  until W6.2 [W4 F11]. Size 18–30.
- **W4.4a Load by manifest, non-M2M walls** (after W3, per D9); **W4.4b** the M2M features on the new passes, last
  [W4 F9]. Gate: census pins, boot-time growth, chain budget.

### W5 — The back end (≈10–16 sessions).
- **W5.1a One lowering table, derived** [W5-W7 #1]: an immutable `LoweringTable` in lowering, `(FunctionId, Position) →
  Rule`, built once, refusing duplicates, checked one-to-one against the implementation table's Intrinsic rows at
  construction. First a probe push naming each silently overridden `RULES.put` (`times`, `startsWith`, `endsWith`,
  `median`, `hash`, `dayOfWeekNumber`) and deleting the dead one [W5-W7 #2]. Gate: snapshot byte-identical.
- **W5.1b Lowering decisions become typer annotations** after W3.5 and W4.3 [W5-W7 #3] (cast policy, static
  disjointness, match subtyping, compare kinds, lambda parameter types).
- **W5.1c The lowerer reads the relational skeleton**; W4.3's adapter deleted [W5-W7 #4].
- **W5.2 Semantic MIR**: each unit or part a distinct record so javac lists every reader (the unit enum starts in G's
  `WindowFrame`) [W5-W7 #5]; `Join.Kind.sql` removed; the carrier ladder included, gated by `CarrierPurityRatchetTest`
  reaching zero [W5-W7 #6]; deep immutability after a probe.
- **W5.3 Legalisation and one escaper per dialect** with a verifier before emission; escaping also reaches the
  concatenated SQL outside the dialects (`StatementExecutor.java:3050,3218`, `exec/Ddl.insertText`, `plan/InProtocol`,
  `TestDataGenerator`) [W5-W7 #11]; the fresh-name supply never reaches `EngineStyleH2` golden text.
- **W5.4 The ANSI split**, after W5.1b and W5.2, serial: `Spellings.ANSI`, DuckDB as a layer, `EngineStyleH2` and the
  SQLite constructor repointed in the same commit; `SqlTyping` per dialect [W5-W7 #7, #8].
- **W5.5 The Postgres lane** (3–6) [W5-W7 #10]: zonky embedded Postgres with per-OS binaries (a repin; Windows CI
  unverified), a Postgres dialect, `Compiler.dialectOf` dispatch fixed (today a non-H2 session silently renders DuckDB),
  a third harness backend, per-session databases, and a first fail roster.

### W6 — Plan, runner, periphery (≈12–20 sessions). D7 first.
- **W6.3 Judges** per D7, before W6.2 [W5-W7 #15]: roster re-base (H2 −65/+72; DuckDB 0); the stress lane moved to a
  database EqualToJson or out of the product; a public judge SPI (HostJudge and AssertVerdicts share package-private
  state) [W5-W7 #17, #18].
- **W6.1 A staged plan IR**: late-bound nodes (SchemaProbe, DynamicPivot, ForEach(values, template), Effect barrier) for
  every plan-time read of the live database; one printer gated by the 570 plan-text asserts; lineage facts carried until
  W6.4 [W5-W7 #14, #20].
- **W6.2 The runner** after W6.3 and W4.2: resolves late-bound nodes in order; `StatementExecutor` stops re-running G, G½,
  H, I; the census and env tracing become an injected observer, probed both ways before the switch [W5-W7 #19]; global
  static state removed.
- **W6.4 Periphery**: lineage over the typed HIR plus H's binding map; test-data generation through the MIR; the server a
  thin adapter (`QueryService.execute` kept for PCT); test runners and the probe out of the product jar, with the spec
  harness's deps changed [W5-W7 #21].

### W7 — Close-out (≈2–4 sessions).
- `//core:compiler` (the cyclic group; `compiler_mid` does not exist) split into per-stage targets; a below-top-level
  cycle rule [W5-W7 #22].
- Each regex guard deleted after the type or verifier that asserts its invariant [W5-W7 #24]: IdentityGuardrailTest
  pattern by pattern after W2.3–W2.8, W4.1, W4.3, W5.1; `STRING_DISPATCH_SITES` with a charter C6.1 amendment;
  VerdictChannelRegisterTest after W6.3 and D7; JavaEvalLedgerTest's residue register after W6.2/W6.3 and an AGENTS.md
  edit.

**Size (judgment, from the H1 readers):** W0 3–5, W1 9–14, W2 12–18, W3 11–18, W4 32–51, W5 10–16, W6 12–20, W7 2–4 —
roughly **90–145 working sessions**. W4.3 is the largest and least certain.

## 5. Order
Serial; one owner; nothing in flight against the same rosters (rule 0.5).
1. W0.0, W0.5, W0.2, W0.1, W0.3; W0.4 once D6 is ruled.
2. W1.6 → W1.1 → W1.2 → W1.4 → W1.3 → W1.5 → W1.7 (needs W0.4) → W1.8.
3. W2.0 (H2) → W2.1 → W2.2 → W2.3a (needs D10) → W2.3b → W2.4 → W2.5 → W2.6 → W2.7 → W2.9.
4. W3.1 → W3.2a → W3.2b → W3.3a → W3.3 → W2.8 → W3.5 → W3.6.
5. W4.0 → W4.4a (D9) → W4.1a → W4.2 (D8) → W4.3 steps 1–6 with W4.1b → W4.3 steps 7–9 (D11) → W4.4b.
6. W5.1a (may start after W1.7) → W5.1b → W5.1c → W5.2 → W5.3 → W5.4 → W5.5.
7. W6.3 (D7) → W6.1 → W6.2 → W6.4. W7 last.

## 6. The alternative D1 did not take (record only)
W2.3–W2.6 put the resolution on the parse nodes instead: `AppliedFunction`'s callee becomes the sealed `Callee`
(`Spelled` | `Bound` | a third case `Member(name)`); `VarId` and element ids become fields on `Variable`,
`LambdaFunction` parameters, `PackageableElementPtr` and `EnumValue`, null before resolution. The typer switches on
`Spelled` and throws "compiler bug". Rule 0.10 is then waived for D.

## 7. Session bootstrap
- **Repo:** `~/legend/legend-lite`, worktree `.claude/worktrees/build-audit`. The program runs on branch
  `compiler/rebuild` (from `main` at `caf0cf71f`, 2026-09-29; draft PR #8 against `main` so CI runs on every push); `main`
  fast-forwards at wave boundaries. One session owns the whole repository since 2026-09-29. Bazel 9. Untracked `nlq/`
  is not ours.
- **Homework status (2026-09-29):** H6 done (superseded docs marked); H1 done (this revision; reports in
  `plan-audit-2026-09-26/h1-plan-audit-2026-09-29/`); H3 done; H4 done (W1.2 adds speculative scopes and parser recovery);
  H2 = W2.0 written (rulings D12 open); H5 done (the other account's servers stopped; timings in §3). All homework done.
- **Read, in order:** `docs/IN_FLIGHT.md`; this page; the H1 synthesis; `architecture-review-2026-09-28.md`; the stage
  reading and the H1 report for the area you touch; the last `docs/GATES.md` entries; for anything in D/F/G the reference
  research (`reference-matching.md` with its corrections, `kernel-reading-2026-09-26.md`).
- **Pinned trees:** `OB=$(bazel info output_base)`; `$OB/external/+http_archive+legend_pure_src` (5.99.0),
  `…legend_engine_src` (4.145.0); jars at the same releases in `@maven_upstream`.
- **Gates:** `bazel test //...` then `bazel test //tools/deps:all`; for any front-end slice also `bazel test //spec:reference_lane` (manual, 8 GB). Corpus `//spec:corpus_duckdb`, `//spec:corpus_h2`.
  Probe `--test_env=LL_SHADOW=1` (counts: `tools/untangle/probe_counts.py`, `bare_tiers.py`). One corpus test:
  `--test_env=JAVA_TOOL_OPTIONS=-Drcorpus.test=<fqn>`. Reference spike: `bazel run //tools/reference:ref_resolutions`.
- **Receipts:** `~/legend/platform-architecture/receipts/` (not in git); every GATES.md entry names its receipt.
- **Commits:** `git -c user.name=neema2 -c user.email=neema2@gmail.com commit -F <file>` with the session trailers.
