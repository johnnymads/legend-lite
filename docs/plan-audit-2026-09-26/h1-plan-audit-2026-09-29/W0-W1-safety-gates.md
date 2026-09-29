# H1 audit — W0 (W0.1–W0.4) and W1 (W1.1–W1.6), branch `compiler/rebuild` @ 772547a18, 2026-09-29

Reader's report, preserved as returned (the parent persists it; subagents cannot write files). Read: the plan, the
architecture review, stage readings A05/A10/A11/A12/A13, the listed tool files, and the code cited. Nothing built or
edited. Outside git: the downloaded `@maven_upstream` jars inspected with `unzip -l/-p`. Paths under
`core/src/main/java/com/legend/` unless stated.

## 1. Item by item

**W0.1 Close `/engine/sql`.** Cited lines right: `server/LegendHttpServer.java:40` (all interfaces), `:53` (the route),
`:248` (CORS `*`). Nothing in `server/` reads request headers (no Origin or Content-Type check).
- **The stated threat survives the offered fix.** "Bind to localhost behind a dev flag" does not stop "any web page can run
  SQL": a page can POST to `http://localhost:8080` as a simple `text/plain` request with no preflight, and the handlers
  parse the body as JSON whatever its content type.
- **The same exposure stays on endpoints the plan keeps.** `/api/pure/v1/execution/execute` (`PureV1Api.java:179-189`)
  compiles caller-supplied model text and resolves a caller-declared connection; `ConnectionResolver.java:170-205` opens
  `jdbc:duckdb:<path>` / `jdbc:sqlite:<path>` for a `LocalFile` spec (arbitrary file create/write), `jdbc:h2:file:<path>`,
  and `jdbc:h2:tcp://host:port` (SSRF); `DuckDb.sourceUrl` (`sql/dialect/DuckDb.java:329-341`) reads `file:` URLs through
  `read_json_objects`. The real fix: an Origin allow-list, a required non-simple header or token on every POST, refusing
  file/tcp connection specs from request bodies.
- **What deleting it breaks.** `LegendHttpServerIntegrationTest` (/engine/sql at :205-273, :451, :472),
  `ConnectionIsolationTest:68-80`, `ConnectionLeaseTest:100-246`, `QueryServiceDirectTest:105-143` seed tables through
  `QueryService.executeSql` (`QueryService.java:147`); also `README.md:296`, `ErrorShapeGuardrailTest.java:103` (per-file
  count 5 for LegendHttpServer), `JavaEvalLedgerTest.java:1248`.
- The gate as written (the route is gone) cannot catch the remaining exposure.

**W0.2 Five defects.**
- **(a) H2 UDF.** `H2.java:719` confirmed; `H2Modern` inherits it. `EngineStyleH2.java:1704,1899` are **not defects**: that
  class is "the ENGINE's own H2 SQL text … never for execution" (`EngineStyleH2.java:18-27`) and
  `legend_h2_extension_split_part` is the engine's golden spelling (GATES batch 139); likewise 1665, 1668, 1702 (lpad,
  rpad, reverse_string). The fix is not one line: native `SPLIT_PART` (`H2.java:300-322`) keeps empty tokens, returns `''`
  past the end, and takes a literal one-character separator; `PURE_SPLIT_PART` needs commons-split semantics (token is a
  set of characters, adjacent separators collapse, NULL past the end; `spec/.../H2ExtensionFunctions.java:98-110`). Three
  routes, each with roster effects: ship the alias through `H2.sessionSetup()` (class in the product), a probed REGEXP
  spelling, or a loud wall. The corpus H2 lane installs the aliases on the product session (`MinimalCorpus.java:493`), so
  no corpus lane can see the defect or the fix: the failing test must be a bare-H2 core test.
- **(b) `StaticFold` toOne.** Confirmed at `StaticFold.java:692-694`: returns the list for a 1-arg `toOne` over any
  non-singleton list, empty included. Fix: return `null` (not static). Small.
- **(c) Kernel positional fallback.** Confirmed: `InferenceKernel.java:88-90` `.orElse(ag0)`. `asSuper` (`:1779-1822`)
  returns empty whenever `ctx.findClass(raw)` is empty, while the admission test above uses `ctx.isSubtype` — so the
  fallback may be what types every platform generic whose class declaration is absent. Replacing it with a throw is a
  switch: rule 0.2 requires a firing-count probe first; the right judge is W1.1's type rows, which do not exist yet.
- **(d) Static-state escape.** Confirmed (`exec/CanonicalDivergence.java:558-559`; regex at
  `CodeShapeGuardrailTest.java:224-226`). A whole-module scan finds exactly one non-final static field in main code:
  `CONTEXT_SOURCE` — a bytecode "static ⇒ final" rule is red on landing. The field needs redesign: an injected seam
  replacing the harness write at `MinimalCorpus.java:552`, 6 reads in CanonicalDivergence. The rule does not reach the
  `static final` mutable holders in the same class (queues, AtomicBoolean, maps at `:38, :220-228, :277-289, :360-362`).
- **(e) sql → compiler.element.type.** Confirmed (`EngineStyleH2.java:262`, `core/BUILD.bazel:85`); the only reference into
  `compiler..` from `sql..`. Moving `TDS_NULL_CELL` into `sql` (which `compiler_element_type` already depends on) and
  dropping the dep lets strict-deps enforce it. Small and correct.

**W0.3 Probes.** Evidence exists for all ten (review §4; A03:79, A04:101, A07-A08:198). Missing: how a confirmed defect
whose fix belongs to a later wave (let scoping → W2.5, inliner capture → W4.2, import scope → W2.2) sits in a green chain
— it needs an expected-failure test with an owner (rule 0.8). The UTF-16 probe (confirmed: `lexer/TokenStream.java:245`
`s - ls[line] + 1` against the code points at `:217-220`) decides W1.2's column unit and has wire-parity consequences for
`sourceInformation`.

**W0.4 The corpus certifies product SQL.** Confirmed (`DuckDb.java:218`, `MinimalCorpusTest.java:139`). Option 1 ("move the
pass into the harness") changes where the code lives; the corpus still runs non-product SQL on the 993 rewritten tests —
only a product-SQL lane meets the title. Option 1 also needs unlisted work: no injection seam (dialect chosen statically in
`Compiler.dialectOf`, `Compiler.java:744-860`); `exec/Census.java:92` reads `StableScanOrder.firings()`;
`TestLaneOrderGuardrailTest.java:48-93` pins DuckDb's exact source text; the 4 engine-order registers. The H2 lane has the
parallel problem: it runs on test-installed aliases on the same session its referee uses (A13). The choice is an unruled
decision; rule 0.3's "LOST 0" is ambiguous until made.

**W1.1 Reference lane.**
- **Facts hold.** All 27 closure repositories resolved at 4.145.0 / 5.99.0 and downloaded; repository → jar mapping verified
  through each jar's `*.definition.json` (`platform` in `legend-pure-m3-core`, `core` in
  `legend-engine-pure-code-compiled-core`, 574 `.pure` files). Each jar ships its `.pure` sources, PAR and a
  `CodeRepositoryProvider` entry. `core_relational` ships 553 `.pure` files (258 tests), **all byte-identical to the pinned
  tree** — SOURCE_DRIFT 0 for that module (other 26 unchecked). The closure uses only `###Pure`, `###Mapping` (416),
  `###Relational` (138), `###Diagram` (27); all 7 m2 grammar jars are in the Maven closure of `xt-relationalStore-core-pure`;
  no `###Service` needed. No interpreted runtime needed (`RefResolutions` only calls `PureRuntimeBuilder` and
  `loadAndCompile*`).
- **The reference side can give types**: every compiled `ValueSpecification` carries `_genericType`/`_multiplicity`, and
  `FunctionExpression` carries `_resolvedTypeParameters`/`_resolvedMultiplicityParameters` (m3.pure:2028-2040, set in
  `TypeInference.java:83,98`). `RefResolutions.walk` must extend to VariableExpression and property reads, plus a
  generic-type printer.
- **Our side does not have what the plan says it dumps.** Only `TypedNativeCall` and `TypedUserCall` carry a position (2 of
  91 typed files); typed forms (TypedFilter, TypedMap, TypedProject…) have none — these are the 42,174 ABSENT rows, where
  W3.4/W3.5 need type rows. Neither call record stores resolved type parameters (`TypedNativeCall.java:27`,
  `TypedUserCall.java:21`): adding them touches 100 constructor sites in 29 files, or a typer side table (Typer at 3,499).
  A canonical type printer on both sides is unplanned. As written, "the type and multiplicity of every expression" is
  reachable only for joined calls.
- **The gate cannot catch a regression.** `OurResolutionsTest.java:66-89` drops whole source files until the model builds; a
  regression that makes a file fail *shrinks* the disagreement set, so "not grown" passes. Pin the dropped-source set, the
  FAILED-body set (1,319 today) and an AGREE floor.
- **Other.** "A reason per row" for ~55k ABSENT/EXTRA rows is infeasible — reasons per class or pattern. The reference dump
  is a pure function of the jars: a cached build output (genrule), not recompiled every run. 12 GB `manual`: CI's 7 GB
  macOS runner cannot run it, so "run on every front-end slice" rests on session discipline.
- **Size:** 2–3 sessions.

**W1.2 Diagnostics foundation.** Throw statements (`\bthrow\b`, non-comment lines):

| area | throws |
|---|---|
| parser | 666 |
| lexer | 1 |
| protocol | 67 |
| NameResolver | 3 |
| compiler/element | 40 |
| compiler/spec | 280 |
| normalizer | 128 |
| resolver | 294 |
| lowering | 157 |
| sql | 79 |
| exec | 51 |
| plan | 38 |
| total | 2,110 |

(H4 counted `throw new X(` only — parser 32; this count includes the parser's helper-funnelled throws.)
- Parser throws funnel through helpers (already positioned); converting is cheap, but poison-and-continue needs parser
  recovery that does not exist (A01).
- The resolver has 3 throws: "report into it first" really means making the silent pass-through (`NameResolver:745`) an
  error — W2.3's behaviour change. Say which.
- The typer has 21 speculative catch sites (CallShapes, EvalChecker, `checkWithDeferred`, StaticFold…). Diagnostics inside a
  speculative attempt must be discarded (a probe/snapshot sink); a naive sink reports every rejected overload candidate.
- "The corpus harness classifies failures by diagnostic code" cannot hold: most corpus failures come from resolver,
  lowering, normalizer and exec (NotImplementedException 461, IllegalStateException 336 sites), untouched by W1.2.
- The item edits Typer (3,499), SpecParser (3,494), MappingProtocolParser (3,496) against the 3,500 line guard
  (`CodeShapeGuardrailTest.java:38,520-532`).

**W1.3 Phase verifier.** Named post-conditions are false today: "no SQL-spelling string in MIR" is violated by
`SqlSource.Join.Kind.sql`, the ADD_INTERVAL StringLit names and `Frame.Bound.IntervalPreceding(unit String)` (A10) — pin
as known violations or defer to W5.2. "Every node typed" is already enforced by record construction. No single pass seam:
G→G½→H→I exists twice in `Compiler` (`:591-614`, `:1173-1194`) and more in StatementExecutor; `StoreResolver` constructed at
7 sites; `new SpecCompiler(` 9 times. A hook in StatementExecutor moves its exact pin (`JavaEvalLedgerTest`: 2,392).

**W1.4 Rosters and sharding.** `MinimalCorpusTest` holds lane-wide aggregate pins: DIFFERENTIAL floor (`:569`),
spelling/weak ceilings (`:572-575`), unjudged ceiling (`:538`), faults = 0 (`:731`), census equality (`:881-885`),
INERT_SETUPS, registers. The DATABASE run is "judged AGAINST host mode's roster" (`:953`) through a ledger file.
`tools/junit/JUnitMain` has no shard support. Sharding needs a merge/aggregation step and a host/database pairing rule;
neither planned. Stress floors confirmed (`StressServiceSuitesTest.java:153-154`).

**W1.5 Golden dumps.** No printer exists for TypedSpec (91 files) or MIR. Both needed and deterministic; the dumps must be
produced by a build action blessed by `//:update_generated` (`BUILD.bazel:22`). Unsized.

**W1.6 Typer split. Factually wrong target.** The 39 checkers already live in their own files (39 `*Checker.java`, 6,083
lines); only `applyCore`, the dispatch switch at `Typer.java:1310-1463` (~155 lines), is in Typer. The real seams: the
pre-dispatch desugars (`:343-1310`, ~610 lines at `:700-1310`) — W2.7's and A05's "separate desugar pass"; the overload
machinery (`applyGeneric`/`checkGeneric`/`checkWithDeferred`, `:1465-2090`) — W3.2/W3.3; `accessProperty` (`:2951-3192`) —
W2.4. Also at the guard: Lowerer 3,499, ProtocolEmitter 3,497, MappingProtocolParser 3,496, SpecParser 3,494,
Substitution 3,479, Scalars 3,476, StoreResolver 3,472.

## 2. Ordering
1. W1.6 must precede W1.2 (typer diagnostics) and W1.1's our-side change (bindings on call nodes): both edit Typer at 3,499.
2. W1.1's type rows depend on positions for typed nodes (W1.2 spans, or a side map built during `synth`), yet W1.1 is first.
3. W0.2(c) should follow W1.1 plus a probe.
4. The W0.3 UTF-16 probe comes before W1.2's column-unit choice.
5. W0.4 needs a ruling before W1.4 redefines rosters, or rosters are re-pinned twice.
6. W1.3 needs a single pass driver (today that is W6.2) or accepts inserting at every duplicated sequence.

## 3. Missing work
- Origin/token guard on all POSTs; refuse file/tcp connection specs from request bodies (W0.1).
- `CONTEXT_SOURCE` injection redesign (W0.2(d)).
- A decision on the H2 lane's session aliases and a separate referee session (W0.4).
- Expected-failure-with-owner mechanism (W0.3).
- Canonical type printers both sides; call-node type arguments; positions for typed forms (W1.1).
- Coverage pins against survivorship (dropped sources, FAILED bodies, AGREE floor) (W1.1).
- Cached reference-dump build action; a CI answer for a 12 GB lane (W1.1).
- Speculative diagnostic scopes; parser recovery (W1.2).
- Shard merge step and host/database pairing (W1.4).
- HIR and MIR printers (W1.5).
- Guard edits: `TestLaneOrderGuardrailTest`, `CodeShapeGuardrailTest.noStaticMutableState` deletion,
  `ErrorShapeGuardrailTest:103`.

## 4. False or unverified statements in the plan
- W1.6 "the 39 checkers out of `Typer.java`": false, already out.
- W0.2 `EngineStyleH2.java:1704,1899` as defects: false, golden text by design.
- W0.1 "bind to localhost" as a fix: false for the cited threat.
- W1.1 "type and multiplicity of every expression" from the typed HIR: unreachable.
- W1.2 "classify failures by diagnostic code": 3 of ~12 throwing areas covered.
- W1.3 "no SQL-spelling string in MIR" as a starting post-condition: false today.
- D3 "no new downloads": **true**, verified.
- SOURCE_DRIFT removal: verified for core_relational only.

## 5. Findings
1. **BLOCKER** — W1.6 names a seam that does not exist. Split out the desugars (`Typer:700-1310`) and the overload machinery
   (`:1465-2090`); move W1.6 to the head of W1.
2. **BLOCKER** — W1.1 cannot dump per-expression types or type parameters from our side. Add typer-recorded
   `(pos → ExprType, bindings)` or positions on typed forms, plus a canonical printer; scope types to joined calls until then.
3. **WRONG/SECURITY** — W0.1's localhost option leaves CSRF and the `/api/pure/v1/execution/execute` file-write/SSRF path
   open. Delete `/engine/sql` and `executeSql`, add an Origin allow-list and a required header/token on all POSTs, refuse
   `LocalFile`/`StaticDatasource` from request models; re-seed the 4 test classes.
4. **WRONG** — W0.2 lists `EngineStyleH2:1704,1899`. Scope the fix to `H2.splitPartCall` (H2, H2Modern), probe the
   spelling, test on bare H2 outside the corpus.
5. **GAP** — W0.2(d)'s ArchUnit rule is red on landing. Redesign `CONTEXT_SOURCE` in the same push; the rule does not cover
   `static final` mutable holders.
6. **RISK** — W0.2(c) is a switch with no probe. Count firings first; gate on W1.1's type rows.
7. **WRONG/GAP** — W0.4 option 1 does not certify product SQL. Rule it as the product-SQL lane; list the Census, guard and
   register relocations; address the H2 lane's aliases.
8. **GAP** — W1.1's gate can pass while coverage drops. Pin dropped sources, FAILED bodies, AGREE floor.
9. **RISK** — W1.1 at 12 GB, manual, absent from CI. Reference dump as a cached genrule keyed on the jars; the lane runs our
   side and the join; the GATES entry cites the lane's receipt.
10. **GAP** — "a reason per row" infeasible at ~55k rows; reasons per (kind, spelling) class.
11. **GAP** — W1.2 has no speculative-diagnostics design and no parser recovery; add both to H4.
12. **WRONG** — W1.2 corpus classification by code. Failure class = (phase, exception class, code if any), defined in W1.4.
13. **WRONG** — W1.3's MIR post-condition violated today. Pin the known-violation set or defer the MIR check to W5.2.
14. **GAP** — W1.4 sharding vs lane-wide aggregate pins and host/database pairing. Shard with a merge target, or keep one JVM
    and add only (name, class) rosters now.
15. **GAP** — W1.5 needs deterministic TypedSpec and MIR printers; size 1–2 sessions.
16. **GAP** — W0.3 has no pinning for confirmed-but-deferred defects: expected-failure tests with owner and wave.
17. **RISK** — guard collisions: W1.2 touches SpecParser 3,494 and MappingProtocolParser 3,496; W1.3 moves the
    StatementExecutor pin 2,392. List splits and pin moves inside the items.
18. **NIT** — W1.1's "interpreted runtime" not needed. The spike BUILD was untracked at the audited commit (since committed
    at `b3af51609`).
19. **RISK (size)** — W0 3–5 sessions (not 2–3); W1 8–12 (not 4–6).

## 6. Verdict
**Executable after the listed changes, not as written.** W0.2(b) and (e) are correct and small. W0.1, W0.2(a), W0.2(d) and
W0.4 each rest on a wrong fact or omit required co-work. W1.6 targets code that already moved. W1.1 — the gate every later
wave depends on — cannot produce the promised type rows from today's typed HIR, and its "not grown" gate can be passed by
losing coverage. Re-cut W1: W1.6 (desugar/overload split), then W1.1 (calls first, typer-recorded positions and bindings,
coverage pins, cached reference dump), then W1.2, W1.4, W1.3, W1.5; add a ruling on W0.4; widen W0.1 to Origin/token checks
on every endpoint. Nothing found invalidates D3: the jars are there and ship their sources.
