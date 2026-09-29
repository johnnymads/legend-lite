# What to do next, and what is waiting on the user (2026-09-28)

This is the handoff for the next session. Read it first, then `architecture-review-2026-09-28.md`, then the stage
reading for the area you touch (`stage-readings-2026-09-28/`). It supersedes the "next" guidance in `EXECUTION_PLAN`
step 3's header and in `program-audit-2026-09-27.md` §E where they disagree.

## Where things stand

- Steps 0, 1, 2 of `EXECUTION_PLAN_2026_09_26.md` are done and on main.
- The step 3 probe push is on main (`d484e1f78`; GATES.md "step 3, the probe push"). Its counts are the before-state
  for everything in step 3.
- Step 3a has NOT started. It is blocked on user rulings (below). The program audit (`program-audit-2026-09-27.md`)
  and the architecture review both say it cannot start as ruled on 2026-09-27.
- The quiet corpus timing owed since step 0 has still not been taken (the other session was building every time).

## The recommendation

The plan's thesis is right; its reach and order are not. Do the following, in this order. Each item is one push with
the usual discipline (homework → probe → switch → gate → deletion → GATES.md record → push).

### 0. Outside the untangle, now
1. **Close `/engine/sql`** (arbitrary SQL, all interfaces, `Access-Control-Allow-Origin: *`;
   `server/LegendHttpServer.java:40,53,248`). Owner: whoever owns `server/` (the warehouse/DataCube session wrote the
   upstream-API server). Either delete it or bind it to localhost behind a dev flag. Announced in `IN_FLIGHT.md`.
2. **Five confirmed defects, one small push each, each with a failing test first:**
   - the H2 dialect emits a test-only UDF (`sql/dialect/H2.java:719`, `EngineStyleH2.java:1704,1899`) — spell
     `splitPart` natively as `H2.java:307-322` already does elsewhere, or wall it;
   - `StaticFold` folds `[a,b]->toOne()` to the list (`compiler/spec/StaticFold.java:692-694`) — return "not static";
   - `InferenceKernel.unifyGeneric` pairs arguments positionally when `asSuper` fails (`:84-101`) — fail instead;
   - the static-state guard misses a two-line `static volatile` (`exec/CanonicalDivergence.java:558-559`) — replace the
     regex with an ArchUnit field rule, then pass the context through options;
   - `sql/dialect` depends on `compiler.element.type` through a javac-inlined constant (`EngineStyleH2.java:262`) —
     move `TDS_NULL_CELL` into `sql`, drop the dependency from `core/BUILD.bazel:85`.
3. **Probe-then-fix the latent ones** (write the failing test; if it passes, record "not reproducible"): lowerer let
   scoping (`lowering/Lowerer.java:194,2589,2949`); inliner capture (`UserCallInliner.java:1439-1446` and the sites in
   A05 #4); `TypedFilter.stamp` dropped at 12 rebuild sites (A07-A08 §2b); `withChildren` field drops (A02 #2); import
   scope keyed by element FQN (A04 #3); UTF-16 vs code-point columns (A01 #5); `ServiceTestRunner` hashCode keys (A12 #9);
   `PureDateLiteral` crash with validation off (A03 #8); the NameResolver NPE (A04 #5); the prefix-contract temporal bug
   (A07-A08 §2b).
4. **The corpus lane must test product SQL.** The lane sets `legend.exec.engineScanOrder=true`, which installs a
   test-only pass inside the product DuckDB dialect (`DuckDb.java:218`; `MinimalCorpusTest.java:139`). Move that pass
   into the harness, or run a second lane without it, so the roster certifies what ships.

### 1. Make the reference a gate (before any matcher work)
The reference dump today runs a 4.138.5 jar against 4.145.0 spec trees, compares only which declaration a call binds
to, and runs in no lane. The pinned jars are ALREADY in Bazel: `@maven_upstream` carries `legend-pure-m3-core` 5.99.0,
`legend-pure-runtime-java-engine-interpreted`, `legend-engine-pure-code-compiled-core` 4.145.0 and the interpreted
function extensions (MODULE.bazel:113-160), and the PCT lane already runs the real interpreter from them. So:
- add `core_relational`'s Pure artifact and its closure to `@maven_upstream` (homework: which artifacts; the manifest
  closure is in D7);
- port `tools/reference/RefResolutions.java` to a Bazel `java_test` over those jars;
- dump per call site: declaration id, resolved type parameters, type and multiplicity of every expression;
- port `join.py`'s join into the lane; pin the disagreement set with reasons.
Result: SOURCE_DRIFT goes to zero (same release on both sides), types become checkable, and steps 3c, 5, 6 get an
external gate instead of judging themselves.

### 2. Split the typer along its stage seam (EXECUTION_PLAN step 4, moved earlier)
`Typer.java` is 3,499/3,500 and step 3 edits it. Split `applyCore` and the checker dispatch out now, as step 4
specifies, with the seam named in the record.

### 3. Diagnostics foundation (new step)
`Span` (one column unit), `Diagnostic(code, severity, phase, span, args)`, a sink, and poison-and-continue. "Strict"
becomes "zero diagnostics", not "abort on the first". Start with the resolver and the typer (0 of their ~250 errors carry
a position today). This is what makes a bind error at a call site possible at all.

### 4. Step 3a, re-cut (after the rulings below)
The resolver produces the resolved form of every name, not only of calls: call candidate ids, `Member(name)` for the dot
spelling, a `VarId` for every binder, element references as ids. The merge point's bare rule moves into the resolver in
the same push (program audit #2: 27 parsed bare names, 41 minted). Desugars that know their declaration bind that one id.

### 5. Then 3e's inventory → 3c (the matcher, no TDS exception) → 3d → step 6's classification → step 5 → a binder-based
step 7. Everything after that is the second program (see "The size of the job").

## Decisions waiting on the user

1. **The call node's type.** Keep the 2026-09-27 ruling (one `AppliedFunction`, a `Callee` slot that is `Spelled` or
   `Bound`, checked at run time), or give the resolved tree its own type (`ParsedExpr` → `ResolvedExpr`, or a phase type
   parameter), so the compiler proves a parsed node never reaches the typer. The review recommends the distinct type:
   it is what Trees That Grow actually provides, and the same single-type pattern is why phases H and I police their
   boundaries at run time. Either way, add `Member(name)` and give `new` its catalog declaration.
2. **Binding scope.** Bind only function calls in step 3 (the plan), or bind calls, members, binders (`VarId`) and
   element references together (the review). Without binders, step 7 has nothing to stand on and the identity pins
   cannot reach zero.
3. **The reference gate.** Approve adding `core_relational` and its closure to `@maven_upstream` for a reference lane
   (test input only, per the reference-checkout tenet).
4. **"No tolerant modes".** Confirm the reading "collect every diagnostic, poison the failed unit, fail on any error"
   (error recovery), rather than "abort on the first error".
5. **The second program.** Whether to plan, now, the work outside function identity: mapping elaboration after typing
   (the normalizer emits untyped text-Pure today), the store resolver's decomposition (36k lines on string identities),
   the executor as a runner over a plan IR (today a second pipeline driver with 35% test-oracle code), the ANSI split.

## The size of the job (estimate, labelled as such)

The corrected function-identity program (items 1–5 above): roughly fifteen to twenty working sessions. The whole
compiler to an expert shape (distinct phase types, symbols for every kind, typed mapping IR, decomposed store resolver,
executor as a runner, diagnostics with spans): a second program of comparable or larger size over the ~70% of the code
the current plan does not touch.

## Rules that still hold
IN_FLIGHT.md's rules; the commit identity and trailers; push only after `bazel test //...` and `//tools/deps:all` are
green on the exact tree; never force-push; a timing is a lane run alone with `--nocache_test_results` at load under 3;
probe before switch; no string identity, no category checks, no caches before the algorithm, every deferral pinned with
an owner.
