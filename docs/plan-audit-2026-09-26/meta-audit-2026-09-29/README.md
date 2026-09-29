# Meta-audit of the execution plan, 2026-09-29: synthesis

Six independent read-only reviews of `docs/EXECUTION_PLAN_2026_09_26.md` at `ee7617ec8`, each through one expert lens, each
told to verify claims in the code and the pinned upstream sources rather than trust the plan. Reports in this directory:

| # | lens | file | headline |
|---|---|---|---|
| 1 | programming-language / compiler | `1-programming-language.md` | front end textbook; the middle IR is the wrong shape; missing instantiations, node ids, a query layer |
| 2 | Pure / legend-engine | `2-pure-engine.md` | spec used well; one misreading; copies mechanism in places; oracle budget inverted |
| 3 | SQL / query compiler | `3-sql-query-compiler.md` | pipeline shape right; no logical algebra; semantics carried by flags; no wrong-rows oracle |
| 4 | Java / Bazel, measured class graph | `4-java-bazel-dependency-graph.md` | layer direction right; the target map was guessed; a measured, acyclic map exists |
| 5 | evidence and fresh-session executability | `5-evidence-executability.md` | code facts well backed; text drifts; sizes uncalibrated; next items not executable from docs |
| 6 | macro, product, users | `6-macro-product.md` | no user outcome, metric or checkpoint; wrong rows fixed last; the branch freezes the product |

The parent verified two load-bearing claims itself: legend-pure's automap fires for a `[0..1]` receiver
(`FunctionExpressionProcessor.java:306,325,359` call `isToOne(m, true)`, and strict mode requires lower bound 1,
`Multiplicity.java:78-83`), so our spec reading (kernel-reading trap 23, reference-matching correction 6) is inverted; and
`lowering/CanonicalRenderSql.java:436` applies `ScanOrder.stabilize` always, on the assertion path (a user ruling of
2026-08-29 made it a feature of the assert surface, so it is not user-query SQL, but D6's text does not mention it).

## Answers to the questions asked

**Is it comprehensive?** No. Consistently missing across lenses: a wrong-rows oracle for store resolution and SQL (the
reference lane cannot see it; DuckDB-vs-H2 runs lite's own SQL on both); a program frame (users, outcomes, metrics,
checkpoints, budgets); performance and footprint limits, although the planner runs in the browser through WASM; an oracle
for the engine front door that lite's real clients use; semantics the plan never assigns (graph-fetch output, constraints
and checked fetch, enum mappings, timezone and session settings, collation, empty-set aggregates, Unicode length).

**Homework or guesswork?** Mixed, and now measured. Code facts are well backed: 31 of 50 spot-checked claims exact, most of
the rest off by a line or by a grep pattern (lens 5). Structural claims were partly guessed: the §1b target map omits the
targets every stage names directly and has no row for the World stage (lens 4, with a measured class graph of 715 files);
W1.3's hook points miss the executor's pipeline; D6 missed the assertion-path pass; the sizes are judgement with no unit,
overestimating mechanical items about 3–5× on the evidence of what landed this week (lens 5).

**Unvalidated assumptions?** The load-bearing ones (lens 5 §4): the reference lane is deterministic (two runs); 8 GB is
enough once type rows are added; the corpus represents DataCube's and services' queries; DuckDB = H2 is a valid oracle;
the probe rows cover the decisions; legend-pure's matchers can be driven with our types (W3.2b, never spiked); demand-driven
typing equals compile-all (no owning item); SQL byte identity can hold through W4.3's join-tree steps.

**Correct, tractable, implementable?** Correct in direction; tractable through W3; W4.3 is where every lens expects it to
stall (18–30 sessions extracting passes in place from a 36k-line pass). All recommend a W4 spike during W3 and a go/no-go
before W4.3.

**Expert, and does it keep Pure/engine as spec?** The front end is expert (lens 1: how rustc and Roslyn are built). Three
places copy implementation rather than semantics (lens 1, 2): porting `TypeInferenceContext` wholesale (it carries a
reference bug the source itself flags, TIC:472-480, and hash-order ties); emitting the reference's `map`/`extractEnumValue`
rewrites into lite's IR (string enum identity, against rule 0.8); and ~2,200 lines of engine SQL-text formatting
(`EngineStyleH2/DB2/Composite`) living in the product dialect target, with the plan printer gated on engine plan text. The
engine's preeval was correctly replaced by D8's fenced evaluator, but the fence as written excludes the helper that does the
branching and the name arguments inside row lambdas (lens 2 F6).

**What would each expert say?** Compiler: the middle is three IRs in one; add an explicit "algebraize" step into a
relational/scalar IR before store resolution, record instantiations and node ids, and wrap typing in a memoized query layer
(lens 1). Legend: most user-visible Legend bugs come from routing, joins, milestoning and SQL null semantics, not overload
ranking; the rigour sits in the typer and should also go there (lens 2). SQL: make semantics node properties (equality
kind, determinism, null-strictness, collation), add a logical algebra, gate on rows not only bytes (lens 3). Java: enforce
exhaustiveness with a checker (76 of 77 typed-tree switches have a default), use explicit node ids instead of structural
record equality, fix the target map from the measured graph (lens 4). Director: correctness first, land on main, budgets,
checkpoints, build the minimum expert compiler first (lens 6).

**Modules guessed or measured?** The target map was guessed; it is now measured (lens 4): 241 package edges (39% visible
only through fully-qualified references, which import-only analysis misses), 20 class-level cycles of which one crosses a
proposed boundary, and a simulated, acyclic corrected map. Missing rows `world` and `decls`; `syntax` must split into
`syntax_tree` and `parser`; `model` is both syntax and semantics, which is the real defect.

**Lazy shortcuts?** Found (lens 5 §5): W1.1's side-table justified by cost with an unsourced number; `accessProperty` kept
in Typer as "churn" while the plan still says it moves; W0.5's kept guards (whose pins turned the next chain red); the W4.3
print-back adapter with no pinned deletion; D7 kept the status quo (mild). And one program-level shortcut (lens 6): known
wrong-rows bugs deferred to their architectural owner waves (30–110 sessions away) instead of fixed now.

**Macro lens?** Not enough. Decisions for W4 (D8, D11) were ruled on day one while the program questions (who the users
are, what improves when, performance budgets, branch strategy, checkpoints, upstream pin policy) were never asked (lens 6).

**Right detail for a fresh session?** Not yet. W1.1b could start from the documents; W0.4 and W2.0b could not without
rediscovering files, seams and a layering blocker (the probe interface lives in `builtin`, which cannot name typed nodes).
Missing: a start-of-session checklist, the pre-chain guard lanes that catch per-file pins (three of four pushes went red on
them first), receipt conventions, a GATES template, and gates for ~24 items (lens 5 §3).

## Converging findings, in priority order

1. **Wrong rows are the least protected risk.** Fix the reproduced wrong-rows defects now, in place (the pins become
   regression tests), and build a wrong-rows harness before W4: adversarial-data old-vs-new differential; Pure-level
   metamorphic tests (TLP/NoREC); legend-engine execution as the oracle for store resolution; DuckDB = H2 kept only for
   dialect work. (lenses 2, 3, 5, 6)
2. **Restate the reference contract as observable outcomes**: the same accept/reject set and error class, the same chosen
   declaration where it changes lowering or types, the same result type and multiplicity. Build lite's own inference solver
   with a written rule table; a deterministic tie rule; one "lite semantics register" listing every deliberate divergence.
   Correct the automap misreading. (lenses 1, 2)
3. **Re-scope D11 to "where the relational IR begins"**: an explicit algebraize step (after inlining, before store
   resolution) into a relational family with its own scalar family; store resolution becomes rewrites over it; semantics
   (equality kind, determinism/collation, null-strictness) become node properties. (lenses 1, 3)
4. **Add the missing front-end machinery before W2.3a's typer push**: node ids for every expression, recorded
   instantiations on typed calls (so inlining stops re-typing), a memoized query layer that makes compile-all and
   demand-driven the same computation (D10), a pass manager that runs the verifier, a type-consistency lint, dumps and
   timings between passes, and an exhaustiveness checker. (lenses 1, 4)
5. **Replace the §1b target map with the measured one**, add `world` and `decls`, split `syntax_tree`/`parser`, re-scope
   W1.9, move the 15 store→lowering/plan sites in one early push, and strengthen the layering test (enumerate targets,
   check a map file with owned exceptions, use `visibility`). (lens 4)
6. **Move engine SQL-text emulation out of the product** into a harness target with an "engine-text" roster class; gate
   lite's plan printer on its own goldens; add an engine-input differential lane and a ruling (D13) on which selection rule
   engine input gets. (lenses 1, 2)
7. **Give the program a frame**: a user outcome and one number that must move per wave; performance, memory and WASM
   budgets; checkpoints (end of W1, after W2.3a, end of W3, go/no-go before W4.3 with a W4 spike during W3); a "minimum
   expert compiler" milestone and a cut list; trunk-based landing on main, which the user's standing rule already asks
   for; an upstream pin freeze; a one-page status per wave. (lens 6)
8. **Make the documents executable**: one source of status, fixed drift, a start-of-session checklist, the pre-chain guard
   lanes, receipts for every GATES entry, a gate on every item, a defined unit for sizes and per-item cost logging to
   re-fit them after W1. (lens 5)

## Decisions this audit puts to the user

- Land each gated slice on `main` (the standing rule) instead of a long-lived branch?
- Fix reproduced wrong-rows defects now, in place, instead of in their owner waves?
- Restate the reference contract as observable outcomes and build lite's own inference solver, rather than port
  `TypeInferenceContext`?
- Re-scope D11 to an explicit algebraize step before store resolution?
- Move engine SQL-text emulation (`EngineStyle*`) out of the product into the test harness?
- Adopt a program frame: per-wave outcomes and metrics, budgets (with numbers), checkpoints including a go/no-go before
  W4.3, and a "minimum expert compiler" milestone with a cut list?
- D13: which overload rule engine input gets (Pure's matcher over the engine namespace, or the engine's first-match order)?
