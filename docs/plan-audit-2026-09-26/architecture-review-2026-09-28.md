# Architecture review, 2026-09-28: the code as it is, the plan as it stands, and what an expert compiler would be

Read-only. Tree `6ab32198d` (origin/main). Method: fourteen independent readers, each reading one pipeline stage
WHOLE (no sampling; every one reported "NOT READ: none"), plus one reader of the guard/test architecture and one
of the plan documents; every headline claim below was then re-checked by hand against the code or the pinned
reference trees. Paths are relative to `core/src/main/java/com/legend/`. Where a reader's claim was not
re-checked it says "(reader, not re-checked)". One reader claim was REFUTED on re-check (§6).

Scope read: 719 main files / 214,407 lines of `core`, plus the guard tests, the corpus harness, the generators,
the BUILD files and every plan document (`EXECUTION_PLAN`, `COMPILER_DESIGN`, `REAL_PLAN`, `PLAN_AUDIT`,
`plan-audit-2026-09-26/*`, `TENETS`, `TENET_CHARTER`, `WORLD_MAP`, `UPSTREAM_BOUNDARY_PROGRAM` §3).

## 1. The verdict in one page

**The code works and is badly shaped.** It passes 2,472 of 2,613 relational corpus tests on DuckDB with a
serious oracle behind it, a parser at byte parity with the engine, and a reference-faithful catalog (787 exact
declarations, 0 divergent). But it is not built like a compiler. There is no symbol layer anywhere: every
function, class, property, store, table, column, join and variable is a `String`, and every stage re-derives
identity from spelling. The same untyped tree type is read by phases D, E, G, lineage and the executor; the same
typed tree type serves G, G½, H and I with phase-only nodes policed at run time. Diagnostics carry no source
position after the parser (0 of 231 typer exceptions, 0 of ~240 resolver exceptions, 0 in the normalizer).
There are 513 `default ->` arms in main code, and every stage has a list of silent fallbacks that AGENTS.md
invariant 4 forbids. The guard layer (about 23 regex-over-text tests and one bytecode test) exists to hold
shapes that types would hold for free, and two of its rules are green while their invariant is broken (§5).

**The plan's diagnosis is right and its reach is too short.** "Bind once, hold declarations, one overload rule,
one registry, the oracle decides" is the correct thesis, and the reference-fidelity work behind it
(`kernel-reading`, `reference-matching`, the positional differential) is the best part of the program — better
than most production reimplementations do. But the plan attacks ONE kind of identity (function calls) in ONE
place (the call node). Even with steps 0–10 complete, the compiler would still have: string variables with
name-based substitution (no step builds binder identities), string properties/classes/stores/columns (A4 has no
step), a normalizer that emits untyped text-shaped Pure before any type exists, a 36,000-line store resolver
keyed by dotted strings and `#` suffixes, an executor that is a second pipeline driver, and no diagnostics with
spans. Those are 70% of the code by line count and are not in the plan.

**Is it expert?** In parts. Following the reference compiler's matcher exactly, making layering a compile error
(29 Bazel targets), refusing a second SQL IR, probing before switching, and catching a 2× timing regression at
the algorithm are what a strong compiler team does. Counting regex spellings as the progress metric, a hard
3,500-line file limit that forces line golf (Typer, Lowerer, SpecParser, MappingProtocolParser, ProtocolEmitter
all sit at 3,494–3,499), plan state carried in seven superseding documents with hand-typed numbers that already
disagree with the code, routing compiler desugars back through overload resolution, and a phase distinction
enforced at run time rather than by the type system are not.

**Is it executable?** Steps 0–2 were executed well. Step 3 as ruled cannot start (the program audit's two
blockers stand; §3 adds a third reason). Beyond step 3 the order violates its own dependencies in four places
(§3.4). The plan is executable after a re-cut; it is not a route to an expert compiler without a second
program that it does not yet contain.

## 2. How the code is now, stage by stage

| stage | size | IR in → out | identity | diagnostics | the one-line verdict |
|---|---|---|---|---|---|
| A–C lexer/parser | 26 files, 17,046 | text → `ValueSpecification` + `Protocol.P*` + model + PMCD JSON | strings; parser mints 24 function names | `ParseException` with `[l:c]` baked into the message; no recovery | a hand-written ANTLR-walk port; decides semantics on unresolved strings (quote/eval fold, EnumValue by receiver shape, column-vs-expression by `contains("::")`) |
| sections + protocol | 76 files, 26,266 | tokens → 289 `P*` records → 6 hand JSON emitters | strings; ~45 `String kind` discriminators | 360 positioned throws in grammars (good), 46 unpositioned in protocol | ~18k lines of the same five patterns written by hand; one wire shape known by four independent walkers |
| model + catalog | 85 files, 14,832 | — (vocabulary) | `FunctionId(String)`, a LOSSY mangle (drops packages and type args; 0 collisions today by luck, no guard at `Pure.java:616`) | no spans by design (`FromProtocol.java:24-27`) | catalog is a 2,769-line Java class that parses Pure in static init; `NativeFn` names downstream consumers (layering inversion) |
| D resolver + F elements | 41 files, 10,978 | same tree in → same tree out (no "resolved" type) | strings; unresolved bare names pass through silently (`NameResolver:745`) | 0 errors with a position | bare calls interpreted in four places; import scope keyed by element FQN, first-wins (overloads from two sections share one scope) |
| G typer + kernel | 82 files, 21,278 | `ValueSpecification` → `TypedSpec` | callee `TypedFunction` (good) beside 136 `"meta::"` literals, 62 `qualifiedName()` reads | 231 `TypeInferenceException(String)`, 0 positioned | two overload algorithms that disagree (additive score + 5 tie-breaks; deferred path takes the first that types); 93 `AppliedFunction`s minted DURING typing, re-entering by bare name |
| E normalizer + typed HIR + tables | 127 files, 18,361 | parser records → untyped synthesized Pure → re-resolved | 53 bare-name mints + ~50 `Pure.Lite` shims; 5 private name resolvers | 0 `SourceInfo` in the package | mapping semantics emitted as TEXT-shaped programs and type-decided on strings before types exist |
| H store resolver | 57 files, 35,925 | typed HIR → typed HIR (same type) | dotted chain keys, `#fN/#dN` suffixed heads, column-name prefixes, 169 `callee().qualifiedName()` reads, 37 `findFunction(fqn)` re-picks | ~400 unpositioned throws | a god pass with mutable threaded state; re-types (188 hand-built `ExprType`s nobody checks); re-runs G½; private β-inliners with name-based capture avoidance |
| I lowering | 75 files, 23,746 | typed HIR → SQL MIR | FunctionId-keyed rule maps (good) plus 30 callee-name dispatch sites | 153 unpositioned throws | five mutable rule maps filled by side effect, later writes silently win; infers types (invariant 2) and names DuckDB functions (invariant 3a) |
| J MIR + dialects | 54 files, 14,109 | MIR → SQL text | — | render-time walls | the "ANSI" base is DuckDB (its own `Spellings.java:14-16` says so); MIR carries SQL spellings as strings; renderers pattern-match lowering idioms back |
| driver + executor + plan | 71 files, 23,525 | everything | 30 FQN string compares | `Map<String,String>` walls with three key domains | the executor re-runs G, G½, H and I per statement: a second pipeline driver; 35% of the area is test-oracle code shipped in the product; `plan/` has no plan IR |
| periphery | 33 files, 10,692 | — | strings | — | lineage is a second, name-based mapping resolver over the untyped tree; test-data generation spells SQL outside the dialect |

Cross-cutting, measured over all of `core/src/main`: 513 `default ->` arms; ~34 `System.getenv` reads and a dozen
`System.err` writes in product code; process-global mutable state in the typer (`SUPPRESSED_ONCE`), the executor
(`ESTABLISHED`, `BOOT`, 46 census statics, 3 `ThreadLocal`s) and the dialect (`StableScanOrder.FIRINGS`); four
separate β-substitution engines and three constant folders; ~150 orphaned javadoc blocks (a symptom of
mechanical splitting to stay under the line guard).

**What is genuinely good and should survive any restructuring:** the sealed `ValueSpecification` and `TypedSpec`
roots with exhaustive `synth`/`applyCore` switches; `Type`/`Multiplicity`/`ExprType` as data; `FunctionId`-keyed
lowering registration (step 2); the SQL MIR's shapes and the `SqlRewriter` framework; `PureDateLiteral`'s sealed
precision lattice; the corpus harness and its rosters; the generator + diff-test chain from the pinned trees;
`PlannerRunsOnJavaBaseTest`; the Bazel target split; the kernel reading.

## 3. How the plan is

### 3.1 What it gets right

- **The thesis.** Identity is the declaration; after binding nothing re-reads a spelling; the implementation
  table is the one registry; the oracle decides. This is exactly how rustc (`DefId`), Roslyn (bound tree with
  symbols) and Swift (`OverloadedDeclRefExpr` → `DeclRefExpr`) are built.
- **Declaration-id lists on the call node, typer chooses.** Correct, and it is the reference compiler's own
  model. The index `(package, name) → List<FunctionId>` built once per World IS a symbol table.
- **Reproducing the reference matcher exactly.** Because the product is judged by a differential against
  legend-pure, "most specific wins" in the textbook sense is not enough; the lenient-order candidate loop, the
  C3 distance, `T` below `Any`, `[1..*]` rejecting `[*]` must all be copied. The plan knows this and has the
  twelve methods read with line citations. This is unusually good.
- **Probe before switch, one variable at a time, deletions in the same commit.** Correct strangler discipline.
- **No second SQL IR.** Correct; the MIR is the plan.

### 3.2 What it gets wrong

1. **The phase distinction is enforced at run time, not by types.** The ruled design (one `AppliedFunction`
   whose `Callee` slot is `Spelled` before resolution and `Bound` after) cites Trees That Grow, but TTG gives
   each phase a DISTINCT TYPE (`HsExpr GhcPs` / `GhcRn` / `GhcTc`): a renamed tree cannot be passed where a
   parsed one is expected, and the compiler proves it. Under the ruling a `Spelled` callee reaching the typer is
   detected by a `throw` at run time. The same one-type-for-all-phases pattern is the root cause of the store
   resolver's `StoreEscapees` runtime walk and of the typed HIR carrying 11 phase-restricted nodes and 27 mode
   flags. The Java-native way to get TTG's guarantee is either distinct node types per phase or a phase type
   parameter (`AppliedFunction<C extends Callee>` with `Parsed`/`Resolved` instantiations). This is a real
   design choice the ruling made without weighing it; it should be re-weighed, not assumed.
2. **The member case is missing** (program audit #1, confirmed: 106 dot-spelled names per corpus lane reach the
   typer with no function candidate). The plan's own `COMPILER_DESIGN` §3.3 had `Member(receiver, Name)`; the
   ruling dropped it.
3. **Binding covers functions only.** Variables: no step gives a binder an identity, yet step 7 assumes it
   ("inlining with symbols, no alpha-renaming"); today four substitution engines rename by text, and two of them
   have live capture hazards (§4). Elements and properties: A4 has no step number. Columns, joins, stores, set
   ids: not mentioned. So "the identity pins read zero" is unreachable by the plan as written — the pins count
   function spellings, and the other spellings are most of the code.
4. **Compiler desugars re-enter overload resolution** (revision 2 §1: a mint is `Bound(spelled, group)` and the
   kernel picks again). javac's `Lower` and Roslyn's lowering emit calls to a KNOWN symbol. Re-resolving makes
   every desugared call depend on the matcher, so when 3c changes the matcher, desugared picks move and look like
   kernel regressions. Bind the one declaration the desugar means; use a group only where the reference itself
   searches (the automap `map`).
5. **"No tolerant modes, ever" conflates error recovery with accepting bad input.** Production compilers poison a
   failed node (`ErrorTypeSymbol`, `ty::Error`) and keep going to report every error in one pass. The strict
   builder's abort-on-first is why the census needs a 28-round, 72.7 s retry loop. Define "strict" as: collect
   every diagnostic, poison the failed unit, fail the build on any error.
6. **Diagnostics are in no step.** `COMPILER_DESIGN` §5 (spans, owning stage, no message grepping) is right and
   unscheduled. Every stage throws string-concatenated exceptions with no span; the corpus classifies failures by
   grepping messages; the LSP guesses positions from message text.
7. **The oracle covers less than the gates claim.** The reference dump runs a 4.138.5 jar against 4.145.0 spec
   trees: 52,266 rows are excluded as source drift and 42,174 as absent (forms, rewrites), against 42,589 AGREE.
   "OVERLOAD 0" certifies under half of plain calls and none of the forms. It compares resolution only — no
   types, no multiplicities. And it runs in no lane (opt-in, Python, outside Bazel). Steps 5 and 6 would judge
   themselves.
8. **Line-count guards make every step a squeeze.** Five files sit within six lines of 3,500. The guard's
   METHOD_LIMIT regex cannot see `Scalars`' 2,407-line static initializer. The amendment "split along a stage
   seam at the step that touches it" is right; it has to happen BEFORE 3a, not at step 4.
9. **Plan state lives in documents.** A fresh session reads ~7,000 lines across seven superseding files to learn
   one step's state, and the hand-typed numbers already drift (category pin 13 vs 14 in the code; `Pure.java`
   2,870 vs 2,768; NAME_COMPARE's function share "20" vs 78; the gate command in §3 vs rule 0.7).

### 3.3 Is it executable

Steps 0–2 were executed with discipline and measured results. Step 3 cannot start as ruled (the two program-audit
blockers plus 3.2.1 above). The order also violates its own dependencies:

- the Typer split (step 4) must precede 3a (Typer is at 3,499/3,500 and 3a edits it);
- 3e's TDS inventory must precede 3c (otherwise 3c carries a kernel tolerance the stop rule forbids);
- step 6's checker classification must precede step 5 (step 5's owed homework IS step 6's);
- a variable-binder step must precede step 7.

With those fixed, steps 3–6 are executable by successive sessions IF the plan state moves out of prose and into
tool-emitted numbers. The steps most likely to fail: 3c (the reference loop must reproduce lenient order exactly,
lambda typing per candidate multiplies the cost of the stage that is already a third of the profile, and the
reference breaks exact ties by hash order); step 6 (LUB merging and reverse inference against a functional
typer); step 9 (its remaining walls include open-ended M2M product features).

## 4. Defects found (concrete, each checked in the code unless marked)

| # | severity | what | evidence |
|---|---|---|---|
| 1 | SECURITY | `/engine/sql` executes arbitrary SQL, the server binds all interfaces (`new InetSocketAddress(port)`), and responses carry `Access-Control-Allow-Origin: *` — any web page the user visits can run SQL against a running legend-lite | `server/LegendHttpServer.java:40, 53, 248`; `server/QueryService.java:147-159` (reader) |
| 2 | DEFECT | the product H2 dialect emits `legend_h2_extension_split_part(...)`, a function defined only in the TEST harness; `splitPart` fails on any real H2 | `sql/dialect/H2.java:719`; `spec/.../harness/H2ExtensionFunctions.java:100` |
| 3 | DEFECT | `StaticFold` folds `[a,b]->toOne()` to the list `[a,b]` instead of refusing | `compiler/spec/StaticFold.java:692-694` |
| 4 | DEFECT | the kernel unifies a subclass's type arguments POSITIONALLY when `asSuper` finds no path, contradicting its own comment three lines above | `compiler/spec/InferenceKernel.java:84-101` |
| 5 | DEFECT | the corpus lane sets a JVM system property that installs a test-only SQL pass inside the PRODUCT DuckDB dialect; 993 corpus tests run SQL the product never emits | `sql/dialect/DuckDb.java:218`; `spec/.../MinimalCorpusTest.java:139` |
| 6 | DEFECT | the "no static mutable state, NO allowlist" guard misses a live `public static volatile` field declared across two lines, written by the harness | `exec/CanonicalDivergence.java:558-559`; `MinimalCorpus.java:552`; `CodeShapeGuardrailTest.java:631` |
| 7 | DEFECT | `ArchitectureTest`'s "sql depends on nothing" is green while false: javac inlines `PlatformTypes.TDS_NULL_CELL` into `EngineStyleH2`, and `core/BUILD.bazel:85` grants the dependency | `sql/dialect/EngineStyleH2.java:262` |
| 8 | DEFECT (latent) | the lowerer's let bindings are one flat map, never popped for an expression-position `let`, and consulted BEFORE lambda parameters: a lambda parameter named like an earlier let binds to the let | `lowering/Lowerer.java:194, 2589, 2949` |
| 9 | DEFECT (latent) | `UserCallInliner.bind` renames a binder only when a capture set was pushed; the `match`-arm, `map` β-reduction and literal-unroll substitution sites push none | `compiler/spec/UserCallInliner.java:1439-1446` (sites: reader) |
| 10 | POLICY | the product's default judge is HOST: a test verdict of record is computed by Java equality with tolerances, although the charter makes the database the authority for in-query values | `ExecuteOptions.java:35` |
| 11 | DEFECT (reader, not re-checked) | `TypedFilter.stamp` is dropped at 12 hand-rebuild sites in the store resolver, including CORRELATION-stamped EXISTS relations the lowerer keys equality on | `resolver/Substitution.java:2057-2062` et al. |
| 12 | DEFECT (reader) | `ValueSpecification.withChildren` drops `AppliedProperty.pos`, `LambdaFunction.pos`, `ColSpec` stereotypes and `GraphFetchLiteral.subTypeTrees`; the emitter uses null positions as discriminators, so a rewrite can change the wire | `protocol/spec/ValueSpecification.java:151-208` |
| 13 | DEFECT (reader) | import scopes are keyed by element FQN with `putIfAbsent`: overloads of one FQN declared in two sections all resolve with the first section's imports | `compiler/NameResolver.java:258`; `parser/ElementParser.java:325, 393, 478` |
| 14 | DEFECT (reader) | span columns count UTF-16 units while error columns count code points; any non-BMP character earlier on a line makes them disagree | `lexer/TokenStream.java:217-220` vs `:249, 256` |
| 15 | DEFECT (reader) | `ServiceTestRunner` keys provisioned test data by a 32-bit `hashCode` of the CSV values; a collision shares a runtime | `test/ServiceTestRunner.java:323, 366` |

## 5. The guard and test layer

The guards are a substitute for types, and the substitute leaks. About 23 of 25 guard classes are regexes over
source text with ad-hoc comment stripping; their own comments record repeated escapes ("BLIND SPOTS closed by
the audit", a method-reference spelling that escaped, pattern-matching `case` invisible). 349 dated pin moves
were counted in the files read. The single largest drop in any pin (CATALOG_LOOKUP_BY_NAME 170 → 10) came from a
TYPE change (FunctionId-keyed tables), not from the ratchets. Two rules are green while broken (§4 #6, #7).
Several guards are ceremony: `JavaEvalLedgerTest` pins the exact line counts of 15 product files and is 81%
comments; a guard exists over other guards' comments.

The corpus oracle is strong as a regression detector and weaker than "LOST 0" implies: rosters pin test NAMES,
not failure reasons ("messages are printed, never compared"); 1,020 of ~2,472 passes are row-differential
against a referee; 921 are multiset compares; the judge that decides pass/fail is product code; the lane runs a
test-only SQL pass (§4 #5). The reference differential runs in no lane.

The test pyramid is inverted: 107,508 test lines of which 51,434 are end-to-end integration; 5 files assert
exact SQL against 258 `sql.contains(...)` sites; 237 `getMessage().contains` asserts; 7 files build typed HIR
directly; zero property-based or fuzz tests — although the project already pays for two backends (DuckDB and H2)
that could be each other's oracle.

## 6. A reader claim refuted on re-check

The parser reader called the engine's arithmetic mis-association (`1 < 2+3*4` parsed as `1 < (2+3)*4`) a
semantic defect that "real Pure" does not have, citing `parser/EngineQuirks.java:43-49`. The pinned legend-pure
has the SAME one-level "snatch the last parameter" rule
(`legend-pure-m3-core/.../m3parser/antlr/AntlrContextToM3CoreInstance.java:1909-1939`,
`isStrictlyLowerPrecendence:1880-1884`), so legend-pure parses Pure source identically. Reproducing it is
fidelity to the oracle, not a bug. What IS wrong is `EngineQuirks`' javadoc, which calls `1 < 14` "real Pure's
precedence".

## 7. What an expert clean-sheet compiler for this language would be

Constraint that shapes everything: the product is judged by a differential against legend-pure, so resolution
and overload semantics must be copied exactly, including the reference's oddities.

1. **Source layer.** `SourceFile(id, text, LineMap)`, one column unit, `Span(file, start, end)`.
2. **Syntax tree** (per phase C output): surface nodes with spans and no resolver fields — `Call(Named|Member|Syntax,
   args, style)`, `Let`, `New`, `Lambda(params)`, literals, islands — plus the reference's value/function split
   (`let`, `new`, `cast` are functions). Wire-only trivia (`propertyCall`, `grouped`, `infix`) in a side record.
3. **World** (eager Knowledge, per the project's own TENETS): interned declarations with a stable `DeclId` per
   kind; per-kind `(package, name)` indexes; C3 linearizations and variance; the core-29 import group generated
   and drift-tested; duplicate ids an error. `FunctionId` stays as the EXTERNAL key (it is the reference's
   element name) and becomes an attribute of the declaration.
4. **Resolver → a distinct resolved tree type.** Every name becomes a handle: `Ref<Kind>(DeclId)`; calls carry
   candidate `DeclId` lists; dot-access stays `Member(name)` for the typer; every binder gets a `VarId`; failure
   is a positioned diagnostic and a poisoned node, never a pass-through string.
5. **Typer → typed tree.** The reference matcher (FEM/FM/GTM/TM/MM) as a self-contained module with one test per
   trap, under the FEP loop; bidirectional lambda typing; meta-variables with union-find instead of name-keyed
   `Bindings`; member lookup against the receiver type, emitting the reference's rewrites (automap `map`,
   `extractEnumValue`, milestoning dates) so the typed tree matches the reference's processed graph. Desugars
   emit typed nodes bound to one `DeclId`.
6. **Mapping elaboration AFTER typing of declarations**: a typed mapping IR (per set: a typed relation expression
   and typed property bindings keyed by `PropertyId`), not untyped text-Pure re-resolved later.
7. **Store resolution as several small passes** over the typed tree with explicit identities (`NavId`, `JoinId`,
   `ColumnRef`): route → demand → join planning → read lowering; physical names minted once, last.
8. **Lowering** to the existing MIR from one immutable, duplicate-refusing table keyed by `DeclId`; MIR enums for
   units/parts/join kinds; per-dialect legalisation passes with a verifier before emission.
9. **Diagnostics** as records `(code, severity, phase, span, args)` in a sink; a phase verifier (in the style of
   GHC's Core Lint / LLVM `-verify`) asserting each phase's post-conditions in tests.
10. **Oracles**: the reference at the SAME pinned release, dumping per-expression declaration, type and
    multiplicity, run in a Bazel lane and gated; the corpus as sharded dynamic tests pinning (name, failure
    class); a query fuzzer with DuckDB-equals-H2 as oracle; per-pass golden dumps.

## 8. What I recommend

**Keep:** steps 0–2 and their results; the thesis; the kernel reading and the matcher-exactness goal; the
probe/record discipline; the MIR; the corpus and generator chains.

**Change before any more step-3 code:**

1. **Re-weigh the `Callee` ruling against a distinct resolved tree type.** The run-time `Spelled`/`Bound` check
   buys a slice of what a type distinction buys, and the same single-type pattern is what makes H and I police
   phases at run time. Whichever is chosen, add `Member(name)` (106 names per lane need it) and give `new` its
   declaration.
2. **Widen binding to what a binder binds:** add `VarId` for every binder in the same step as the call handle,
   and schedule element and property handles (A4) with a number. Without them the identity pins cannot reach
   zero and step 7 has nothing to stand on.
3. **Re-order:** typer split → 3a; 3e's inventory → 3c; step 6's classification → step 5; a binder step → step 7.
4. **Make the reference a gate:** re-run the reference dump at 4.145.0, add per-expression types and
   multiplicities, run it in a Bazel lane, pin the disagreement set. This is the gate for steps 3c, 5 and 6.
5. **Schedule diagnostics** (spans, codes, a sink, poison-and-continue) as a numbered step; "strict" becomes
   "zero diagnostics", not "abort on first".
6. **Replace regex pins with types where a type exists**, and with a phase verifier where it does not; delete the
   ceremony guards (§5).
7. **Move plan state out of prose:** one living design per stage; every number emitted by a tool into the GATES
   record; superseded text deleted (git keeps it).

**Separately, and independent of the plan:** fix §4 #1 (the open SQL endpoint) now; fix #2–#7 as small slices
with a test each; confirm or refute #8, #9 and #11–#15 with a failing test before fixing.

**The honest size of the job.** The plan as corrected turns function-call identity into an expert design over
roughly the next fifteen to twenty working sessions. Turning the WHOLE compiler into one — resolved and typed
trees as distinct types, symbols for every kind, mapping elaboration after typing, a decomposed store resolver,
the executor reduced to a runner over a plan IR, diagnostics with spans — is a second program of comparable or
larger size, over the 70% of the code the current plan does not touch. It should be planned as such, stage by
stage behind the same oracle, not discovered one blocker at a time.
