# Meta-audit lens 2 — a Legend (Pure/engine) expert's view: spec versus implementation (2026-09-29)

Read-only review, persisted by the parent session. Read: the plan, TENETS, TENET_CHARTER, WORLD_MAP, AGENTS.md,
reference-matching (with corrections), kernel-reading, engine-resolution, the H1 W3/W4 reports; claims checked against
the pinned trees. `P` = `…/646bc514…/external/+http_archive+legend_pure_src` (5.99.0); `E` = `…/+http_archive+legend_engine_src`
(4.145.0, its pom declares pure 5.99.0); `M3` = `P/legend-pure-core/legend-pure-m3-core/src/main/java/org/finos/legend/pure/m3`;
`FEP` = `M3/compiler/postprocessing/processor/valuespecification/FunctionExpressionProcessor.java`. One other cache,
`cc0d5a61…`, holds a different pin (pure 5.103.0) and must not be used.

## Verdict

As a spec-driven program the plan is well built: it keeps the Pure-source and engine-input front doors apart; the
reference lane is test-only from the pinned jars; it runs a property differential against the real matchers; it keeps TDS
nominal with the schema as a side fact (matching Pure's type); D10's demand-driven compile is checked against compile-all;
D6 moves scan-order emulation into the harness; PCT and category checks are banned from the compiler.

It goes wrong in three places:
1. **One rule is copied from a misreading**: the kernel reading gets the automap trigger backwards, and the plan commits
   to reproducing it exactly.
2. **It copies the reference's mechanism, not its observable semantics**: §1 "copy the reference exactly, oddities
   included" (plan :51-52) plus W3.3 "port TypeInferenceContext" commit lite to inference steps the reference itself calls a
   bug (TIC:472-480) and to hash-order ties.
3. **The oracle budget is inverted**: W2–W3 (26–41 sessions) buy an exact typer differential where the corpus already
   compiles; W4, where users' rows are decided (routing, mapping, joins, milestoning), has only the corpus's expected
   values and a DuckDB-vs-H2 fuzzer that runs lite's own SQL on both and cannot see a wrong join.

Separately, ~2,200 lines of engine-SQL-text reproduction (`EngineStyleH2/DB2/Composite`) sit in the product dialect target,
and the plan gates the plan printer on engine plan text: that copies engine output format, not semantics. Fix the automap
reading, restate the differential contract, add an engine-result oracle before W4.3, and the plan is sound.

## 1. Where the plan uses Pure/engine correctly as spec

- Candidate scope and the 29-package core group for Pure source only (W2.2, W2.3b): m3.pure:181-211 has 29 entries; the
  engine uses 32, adding `metamodel::variant`, `metamodel::relation`, `precisePrimitives` (CompileContext.java:90-123).
- Matcher ordering (W3.2b): types first, then multiplicities (FM:69-103); distance = index in the C3 linearization (TM:418;
  Type.java:150-153); a type parameter matches as NON_CONCRETE (GTM:170-177); multiplicity arithmetic MM:273-301. The jar
  property test is the right oracle.
- FunctionId as the reference's element name (visible in function pointers and PMCD).
- Keeping D10's difference from the engine (the engine compiles every body in its third pass,
  `FunctionCompilerExtension.java:124-143`).
- D8 instead of the engine's general preeval: matches the answers (column names) without its algorithm (a general partial
  evaluator before routing, router_routing.pure:203-241; routing.pure:629,666). The right model for the whole plan.
- D6: the engine tests' reliance on H2 insertion order is a test artefact, now in the harness.
- Milestoned generated properties (`x(date)`, `xAllVersions`, `xAllVersionsInRange`) are spec; lite models them
  (`TypedMilestonedAccess.java`).

## 2. Findings, ranked

- **F1 (high): the automap trigger in the spec reading is inverted.** kernel-reading :17, :164-183, :550 and trap 23 say
  FEP calls `isToOne(m, strict=false)` so a `[0..1]` receiver does not automap; reference-matching correction 6 repeats it.
  Source: FEP:306, :325, :359 all call `Multiplicity.isToOne(sourceMultiplicity, true)`; the strict form requires lower ==
  1 (Multiplicity.java:78-83), so `[0..1]` DOES automap (same in all four cached trees). The engine automaps any receiver
  not `PureOne` (HelperValueSpecificationBuilder.java:284); `map` has a `T[0..1]` overload (map.pure:43). Every
  optional-association dot access would disagree in the lane. Change: correct both documents; add a `[0..1]` receiver case
  (property and qualified property) to W2.4's gate; see F4.
- **F2 (high): the differential contract copies mechanism.** One context per call (FEP:124), scope changed per candidate
  (FEP:136) is accurate, but the port would carry over a merge-mode drop the source marks as a bug (TIC:472-480: "We are not
  currently doing it, but it should eventually be fixed"), ties broken by set iteration order (correction 5,
  nondeterministic), and leftover bindings from earlier candidates (`cleanProcess` touches arguments only). Change: state
  the contract as observable outcomes: (a) the same accept/reject set on the corpus and the same error class; (b) the same
  chosen declaration wherever the choice changes lowering or result type; (c) the same result type and multiplicity per
  call. Build lite's inference as its own solver with a written rule table (first binding wins, LUB by variance, relation
  concatenation/widening); keep reverse inference (part of (a) per W3's silent-survival finding). Then by rule 0.2 count
  the calls where the reference's leftovers or merge-drop change (a)–(c); add a rule only for a non-zero class; pin the rest
  as reference artefacts by class.
- **F3 (high): nothing independent checks store resolution.** The reference lane does no routing or store work; W1.8's
  DuckDB-equals-H2 runs lite's own SQL on both (an INNER-for-LEFT join or a missing milestone predicate gives the same wrong
  rows); W1.7 proves "unchanged", not "right"; corpus passes are mostly multiset compares over small fixtures. Change: an
  engine-result lane before W4.3 step 6 (test-only; the real engine from the Maven shaded jar) comparing rows for corpus
  queries over mutated fixtures (orphans, nulls, to-many fan-out, overlapping milestone versions) and fuzzer queries over
  the mapping-heavy set. In W4.3's join-strategy inventory, mark each decision observable or shape-only (observable: fan-out
  in `project`, null-extension for optional properties, EXISTS de-duplication in `filter`).
- **F4 (medium-high): W2.4 copies the reference's representation into lite's IR.** "emits the reference's rewrites
  (automap `map`, `extractEnumValue`, milestoning dates)": Pure identifies the enum value by string
  (`extractEnumValue(enum,'NAME')`, FEP:298-302, :1096-1106; engine HelperVSB:199), against rule 0.8 and W2.6's
  `Ref<Kind>`; `map(v_automap|…)` is a representation choice. Observable: result type and multiplicity, and the reference
  excluding automap lambdas from milestoning propagation (HelperVSB:137, :163). Change: keep `Member(PropertyId)` with
  lifted multiplicity and `Ref<EnumValue>` in lite's IR; normalise the reference's synthesised `map`/`extractEnumValue`
  rows in the lane's join.
- **F5 (medium-high): engine SQL and plan text reproduced in the product.** `sql/dialect/EngineStyleH2.java` 1,901 lines
  (byte-exact engine formatting contract :18-27); `EngineStyleDB2.java` 308; product `StatementExecutor` picks them for
  `toSQLString` (:473-480) and plan text (`planDialect`, :1179-1190); W5.3/W5.4 keep repointing them; W6.1 gates lite's
  plan printer on 570 plan-text asserts. That is engine formatting (`"root"`, `<table>_<n>` aliases, lowercase keywords),
  not semantics; WORLD_MAP rule 8 classes tests whose subject is engine internals as walls. It also collides with D8: the
  engine preevals data-position constants (`'a'+'b'` reaches its SQL as `'ab'`), lite leaves them to the database, so these
  goldens differ. Change: an "engine-text" roster class; move `EngineStyle*` into a harness target (precedent
  `spec/…/H2ExtensionFunctions.java`); gate lite's plan printer on its own goldens; declare the D8/preeval text differences
  and never fold to match.
- **F6 (medium): the D8 fence (C6.2a) as written would reject its own motivating function.** The `if($col.type == Integer,
  …)` branching is in the unmarked private helper `extendMatchColumns` (tdsExtension.pure:66-95), called by the marked
  `columnValueDifference` (:96-102); C6.2a item 1 fences to "a body marked NormalizeRequiredFunction". Name arguments inside
  row lambdas (`$r.getInteger($col.name + '_1')`, :73) are schema positions in a data lambda, which item 3 could reject. The
  engine reaches helpers because preval inlines them (`shouldInlineFxn`). Change: define the fence as schema positions
  reachable from a marked call site after inlining its callees; list TDSRow accessor name arguments explicitly; record that
  the Relation API constructors among the marked functions (`over`, `rows`, `range`, `ascending`, `descending`, `lead`,
  `lag`: 16+7+4+2+2+2+2 applications) are already re-declared as lite natives (`Pure.java:826`, `:1853-1856`); decide them
  under the WORLD_MAP §8 amendment, not D8.
- **F7 (medium): the engine front door has no differential.** Lite serves the upstream API unchanged; datacube and Studio go
  through the engine's Handlers and ParametersInference. Known differences from Pure: `between` registered only for Date,
  Number, String (Handlers.java:2847-2849); user overloads chosen first-registered; 32 imports not 29. W2.3b keeps the
  Handlers namespace but every gate is legend-pure. Change: one overload rule (Pure's matcher) for both doors, the engine
  door differing only by namespace (32 imports, handler names, the engine's qualified-name collapse); don't port handler
  registration order; a small test-only engine-compile lane over engine-grammar inputs pinning accept/reject and return
  types.
- **F8 (medium): the milestoning propagation rule is incomplete.** Dates propagate into lambdas only for functions named
  `map`, `filter`, `exists`, `project`, plus the `getAll` date forms and `subType` (NativeFunctionIdentifier.java:26-32; name
  check MilestoningDatesPropagationFunctions.java:131-134). Lite resolves missing dates late in `resolver/TemporalContext`;
  W2.4 moves this into the typer without the list. A date-less milestoned property inside `sortBy`, `fold` or a user
  function's lambda is a compile error in the reference; lite may silently accept it. Change: add the rule keyed by
  declaration id, with tests, or declare the permissiveness a divergence.
- **F9 (medium): value-semantics oracles are in no W5 gate.** The PCT lanes `pct_duckdb`, `pct_h2` (pct/BUILD.bazel:93, 136)
  and `EqualityWorldsConformanceTest`'s declared divergences. Change: gate W5.x on the PCT roster by class and on the
  divergence register.
- **F10 (low): `new` and `isEmpty(Any[0..1])` corrections.** `new` has two overloads (new.pure:29, :37), `copy` likewise
  (copy.pure:25, :33); the parser always spells `new`/`copy` (AntlrContextToM3CoreInstance.java:1645); W2.4 should say the
  String is an object id. `isEmpty(Any[0..1])` has a body, `eq($p->size(),0)` (isEmpty.pure:31-34): WORLD_MAP §8 says
  compile it as a program, contradicting W3 #9's "and its lowering rule".
- **F11 (low): the NormalizeRequired count.** W4.2 cites "55 marked functions"; this reviewer counts 97 non-comment
  `functionType.NormalizeRequiredFunction` applications in 38 files (most: `over.pure` 16, `binding/functions.pure` 14,
  `tdsExtension.pure` 8, `range.pure` 7). State the selection criterion.

## 3. Spot-checked reference claims

| # | claim (where) | verdict | source |
|---|---|---|---|
| 1 | one TypeInferenceContext per call, kept across candidates (W3.3) | correct | FEP:124, :136, :223-227 |
| 2 | `isEmpty(Any[0..1])` exists and is PCT-bodied (W3 #9) | correct | isEmpty.pure:23, :31-34 |
| 3 | 29-package Pure core group; engine 32 (W2.2) | correct | m3.pure:181-211; CompileContext.java:90-123 |
| 4 | automap does not fire for `[0..1]` (kernel-reading trap 23, correction 6) | **wrong** | FEP:306, :325, :359 `isToOne(…, true)`; Multiplicity.java:78-83; HelperVSB:284 |
| 5 | milestoning dates propagated from context (W2.4) | partly | FEP:328-331; MDPF.java:147-157; the name whitelist (NativeFunctionIdentifier.java:26-32) missing |
| 6 | `new(Class, String, KeyExpression[*])` (W2.4) | partly | new.pure:37; the 2-arg overload (:29) and `copy` (copy.pure:25, :33) omitted |
| 7 | enum member access becomes `extractEnumValue` | correct | FEP:298-302; HelperVSB:199 |
| 8 | distance = C3 index; `T` NON_CONCRETE | correct | TM:418; Type.java:150-153; GTM:170-177 |
| 9 | merge mode drops concrete over non-concrete (correction 5) | correct, the source calls it a bug | TIC:465-482 |
| 10 | `[1..*]` rejects a `[*]` argument | correct | MM:273-279 |
| 11 | unconditional accept for property/column/qualified-property matches | correct | FEP:200-203; :384-388 |
| 12 | "Too many matches" only on a strict tie | correct | FEM:140-148 |
| 13 | engine `between` only for Date/Number/String | correct | Handlers.java:2847-2849 |
| 14 | engine rejects the whole model if any body is broken (D10) | correct | FunctionCompilerExtension.java:124-143 |
| 15 | `columnValueDifference` builds names with `+ '_1'` and branches on `$col.type` (C6.2a) | partly | tdsExtension.pure:31, :48; the branch is in the unmarked helper :66-95 |
| 16 | NormalizeRequired handled by router preval (D8) | correct, but a general preeval | router_routing.pure:203-241; preeval.pure:53-104 |
| 17 | engine `isEmpty` dispatches `[0..1]` like Pure | correct | Handlers.java:1685-1686 |

## 4. Implementation leaks and lite-native alternatives

| item | spec or mechanism? | recommendation |
|---|---|---|
| W3.3 port of TypeInferenceContext (leftovers, merge-drop, hash ties) | mechanism, incl. admitted bugs | own solver with a written rule table; differential on outcomes (a)–(c); rules only where a probe shows an observable class |
| FEM/FM/GTM/TM/MM matcher structure | ordering is spec; five-class structure is not | one lexicographic key over (type distances, multiplicity distances); keep the jar property test |
| automap `map` and `extractEnumValue` in the product IR (W2.4) | representation | `Member`/`Ref<EnumValue>` in the IR; normalise in the lane join |
| `legend_h2_extension_*` in the product H2 dialect | leak | native spelling or a loud wall (W0.2a is right); the harness mirror is fine |
| EngineStyleH2/DB2/Composite, `planDialect`, W6.1 gated on 570 plan-text asserts | engine output format | harness target + "engine-text" roster class; lite's plan printer on its own goldens |
| scan-order emulation and engine-order registers | engine-test artefact | D6 handles it; the product DuckDB dialect ends with zero firings |
| NormalizeRequired/preeval | the engine's general partial evaluator | D8 is the right replacement; fix the fence (F6); declare the SQL-text differences |
| router concepts (ClassSource, set ids) | set ids are spec; ClassSource is lite-native | keep; don't import engine routing types |
| Handlers namespace for engine input | namespace is spec; dispatch order is mechanism | namespace only; Pure's matcher decides; engine-compile lane |
| PCT | test framework | the compiler rule is right; use PCT as a value-semantics gate |
| milestoning propagation list | spec, name-keyed upstream | key by declaration id |

## 5. Semantics the plan does not cover

| area | lite today | plan | recommendation |
|---|---|---|---|
| graph fetch output (`serialize` config, `@type`, date/float/decimal JSON forms, property order, nulls) | present | resolution half only (W4.3 step 8) | an owner and a golden JSON class; C2.5 applies |
| `graphFetchChecked`, class constraints, defects | present | silent | decide scope explicitly; constraint checking must be SQL |
| M2M (chains, JSON source, union M2M) | partial | W4.4b, open-ended | name the scope boundary now |
| null semantics in SQL (`==`/`!=` on empty, `isEmpty` of `[0..1]`, sum/count over empty, `toOne` failure) | declared divergences in `EqualityWorldsConformanceTest` | not a gate | the declared-divergence register as a W5 gate |
| date/time (partial dates, StrictDate vs DateTime, connection timezone, `now`/`today` point, `adjust`/`dateDiff` per DB) | ~30 timezone files | silent | PCT roster + a timezone fixture lane |
| decimal/float (`/` of Integers → Float, rounding, scale, overflow) | C2.5 rules | silent | PCT roster class |
| string collation across H2/DuckDB/Postgres | 1 file | W1.8 register only | declared-divergence register (Postgres) |
| enumeration mappings | ~31 files | only the typer's enum rewrite | on W4.1a's list |
| embedded, inline, otherwise, merge, inheritance mappings | present | "~10 set kinds" | each listed in W4.1a with a shadow-probe row |
| aggregation-aware | present | facts and route only | add to F3's engine-result lane |
| cross-store | walled (`CrossStoreGuard.java`) | silent | record out of scope |
| service parameters (`[*]` in `in`, nulls, date params and timezone; engine templated SQL) | present | P stage only | W6.1 homework |
| service tests and mapping testSuites | deleted (`DEFERRED_TEST_EXECUTION.md`) | silent | Studio's "run tests" against lite fails; say so |
| external formats | not verified | silent | rule on scope |
| Relation API vs legacy TDS | both | W3.1/W3.6 | covered; keep TDS nominal |

## 6. What a Legend engine/pure expert would say

Praise: the reference lane from the exact pinned jars; Pure source and engine input kept apart; the TDS schema as a side
fact under the nominal type; D8 replacing the engine's heaviest mechanism (preeval) with a fenced checker; D10 an
improvement over the engine; probe-before-switch and gates by failure class.

Alarms: the automap misreading (F1); committing to reproduce the reference's inference bugs (F2); the inverted oracle
budget (exact typer parity while routing, joins and milestoning are checked only by small fixtures and a fuzzer blind to
wrong joins, F3); engine SQL-text emulation growing inside the product (F5); no differential for the front door lite's real
clients use (F7). Most user-visible Legend bugs historically come from routing, join and milestoning, and null semantics in
SQL, not from overload ranking: put the rigour there too.
