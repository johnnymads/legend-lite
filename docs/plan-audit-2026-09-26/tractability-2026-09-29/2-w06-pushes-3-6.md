# Tractability review 2 — W0.6 pushes 3–6, dry run against the code (2026-09-29)

Read-only check at `compiler/rebuild` = `34c49baad`, drafted by a subagent and persisted verbatim in substance by the
parent session. No `core/src/main` file changed since the homework base `89dc45871` (`git diff --stat 89dc45871..HEAD --
core/src/main` is empty), so every homework line number holds. No bazel run. "Not verified" = read, not executed.

## Verdicts

| push | verdict | size (main + test) |
|---|---|---|
| 3 prefix keys from the materialization map | **needs amendments** (step 3 as written changes union SQL; step 6 is out of order; step 5 optional but the gate needs it) | 3 main files, ~60–90 lines (+50 with step 5); ~250 test lines |
| 4 the killed head match | **needs a user ruling** (the `nullTolerant` path has a second, association-channel caller the report missed; "a temporary throw" rider count can be swallowed — use a recording probe) | 1–2 main files, ~80–120 lines; ~300 test lines |
| 5a section imports | **needs amendments** (~24 files, not ~12; opening a section on each `###` changes the scoping rule, rule 0b.5; front-end → reference lane) | ~24 files, ~350–500 lines |
| 5b sourceless mapping `nn()` | **implementable as written** | 1 line + ~60 test lines |
| 5c service-test provisions | **implementable, 2 small choices** (sharing across a `###Data` reference; latent ids) | ~50 main + ~120 test lines |
| 6-A null-safe `==` by multiplicity | **implementable with amendments** (operand multiplicities available; whether they are Pure-level not verified) | ~15 main + ~150 test lines; ladder SQL goldens may move |
| 6-A2 ModelJoin/XStore equality | **needs a user ruling** — not a local fix: store-join and Pure-lambda association conditions share one carrier and a per-join flag is wrong once conditions merge; it is W5.2's equality-kind node | 6–10 files, 150–250 lines, or a pin |
| 6-H `COALESCE` on the list sum | **implementable with amendments** (numeric returns only; `times([])` has the same defect) | ~25 main + ~100 test lines |
| 6-D `ANY_VALUE` on H2 | **needs an engineering decision** (not a wrong-results defect; lite's two H2 versions differ) | ~15 main + ~50 test lines |

Order: 3 → 4 right; 2 before A2 and A before A2 right; 5, H, D independent.

## Push 3 — prefix keys from the materialization map (report 2 §2)

**Fits.** The `for navE` loop in `StoreResolver.materializeRoot` (StoreResolver.java:1883-1924) runs after `m =
Pipelines.materialize(...)` (:1868), so step 1 can read `m.slotPrefixes().get(navE.getKey())` / `.get(slot)` for the
mid-slot keys (:1907, :1919); `null` = stripped → skip. Step 2 (`NavSlot` record): `applyJoinTemporalFilters` has 3
overloads (TemporalFrame.java:1605-1622); its only non-`Map.of()` caller is StoreResolver:1930 (8 others pass `Map.of()`:
NavExistsMaterial:178, UnionHeads:291, NavMaterializer:493, DottedExists:181, AssociationJoins:265/407/970/1037, which infers
any value type). The 6-arg method is ~168 lines (under 250). `bare` (1675-1677) and `getOrDefault(prefix, bare)`
(1681-1682) are replaced by `NavSlot.alias`/`.chain`. No guardrail pins these files by line; no new fields.

**Issues → amendments:**
1. **Step 3 ("add `prefixes.values()` to the taken-check") would change SQL bytes for unions:** `TypedConcatenate` arms share
   one `prefixes` map (Pipelines.java:713-718); both arms legitimately mint `alias_` for the same alias; treating every
   prior prefix as taken pushes arm 2 to `alias_2_` with no real collision. **Amend:** a prefix is taken only if a
   *different* alias minted it.
2. **The alias→prefix map is last-wins** (`prefixes.put`, Pipelines.java:487, :632): across union arms that minted
   different prefixes for one alias, keying by `m.slotPrefixes().get(alias)` finds one arm's join only. **Amend:** record
   the inverse `prefix → alias` (or `prefix → NavSlot`) at mint time for every mint; TemporalFrame already looks up
   `j.prefix()`, so it reads that map directly (also makes step 1 exact).
3. **Step 6 is out of order:** StoreResolver:1795 (the `AssocSub` prefix) is in `registerNavigations` (1560-1826), which runs
   *before* `materializeRoot` (1835). **Amend:** after `materializeRoot`, rebuild each `AssocSub` with
   `m.slotPrefixes().get(alias)` (`AssocSub` is a record; entries keyed by `headKey9`; `navHeadByAlias` maps them); ~15 lines.
   (The `cs.rowType()` vs left-row worry remains not verified.)
4. **Step 4's "loud miss" at TemporalFrame.java:2224** (`datedEmbeddedMidSlots`): `reads` is collected over
   `Pipelines.slotAliases(...)`, which recurses into every child (Pipelines.java:1349-1356), stripped slots included.
   **Amend:** skip aliases in `m.stripped()` (a new parameter; the call at StoreResolver:1926 passes only
   `m.slotPrefixes()`), throw only when neither minted nor stripped. At 2455→2486, passing `js.alias()` is purely textual
   (that path runs before materialization and keys `chain.alias`).
5. **The gate needs step 5:** push 3's gate includes "the sub-hop collision (the ClsT window on ClsT)", which the probing at
   503-512/646-653 cannot pass; the README makes step 5 optional. **Amend:** do step 5 in push 3 (feasible: `materializeRoot`
   holds `navMats` at :1835 and each `NavMat.subNavs()` carries the sub-hop's minted prefix, comment :1780-1784; bundle the
   maps into one record argument, not a 7th parameter; `SubNav` covering `subProp_nav_` not verified), or move that case
   to push 4 as "fails loudly".
6. **Gate text:** judge by the roster files and `test.outputs/corpus2-{pass,fail}.txt`, not `docs/RELATIONAL_CORPUS.md`.

## Push 4 — the killed head match (report 2 §3)

**Fits.** `detachSpineJoin` (TemporalFrame.java:607-626) is small; `hoistDeferredOuterSubJoins` (487-600, ~114 lines) has
room. The repro shape is confirmed in code (MakerT's join above ClsT's; `detachSpineJoin` returns null at the first
`TypedJoin` with another prefix).

**Issues → amendments:**
1. **"Delete the `nullTolerant` path" misses a second channel:** `withDeferredOuterSubWindows` (628-667, `nullTolerant` true
   at :663) is also called from `AssociationJoins.withOuterDatedWindow` (AssociationJoins.java:530-541, at :535), reached from
   AssociationJoins:276/411/1084, NavMaterializer:506, StoreResolver:2305/2542 — none has a hoist. Commit `794a0b154` names
   a "union cluster member's bicycle-6 case" as a rider. Deleting the path makes every association-channel deferred window
   loud (roster LOST) or wrong. **Needs a ruling:** (a) scope push 4 to the nav-head channel (:1732), keep `nullTolerant`
   for associations, pin an association variant of the repro `@KnownDefect(owner="W4.3")`; or (b) build an
   association-channel hoist too (unsized; its joins are built in StoreResolver.foldAssociationJoins 2040-2049,
   2160-2170). Reviewer recommends (a), with the association variant written first (same wrong rows there is predicted,
   not probed).
2. **Counting riders:** "a temporary throw" is unreliable — catch-and-continue sites on the path (GraphEmission.java:2607
   `NotImplementedException`, InnerDemand.java:621, ClassSources.java:986, AssociationJoins.java:508; `RuntimeException`
   catches at GraphEmission 1466/1599/1744/2337); a throw also fails the host pre-run so the database pass never runs, and it
   cannot see riders that already fail. `Census.FALLBACK_REASONS` → `corpus2-fallbacks.tsv` (MinimalCorpusTest.java:265-266,
   :297) cannot be used (`resolver` may not depend on `exec`). **Amend:** a local-only probe commit printing
   `NULLTOLERANT_RIDER <nav|assoc> <chainHead>` to **stdout** inside the loop at :661 (only when a window is composed); run
   `//spec:corpus_duckdb //spec:corpus_h2 //core:core_tests --nocache_test_results
   --test_env=JAVA_TOOL_OPTIONS=-Drcorpus.trace=1` (the trace prints `[corpus2] run <fqn>` before each test,
   MinimalCorpusTest.java:208-212, attributing the probe lines); join with `corpus2-pass.txt`/`corpus2-fail.txt`; record per
   channel: passing riders, failing riders, core tests. The pool is large (285 milestoning tests pass on DuckDB today).
3. **The "empty" return:** the hoist also returns null when `byPfx.isEmpty()` (:520-522) — no deferred windows, the common
   case. After the fallback goes, the caller builds the plain `outerDatedCond` and throws only when windows exist but cannot
   be hoisted.
4. **Deleting the duplicated block (1285-1302 / 1304-1321) is not text-only:** it removes a doubled `OR … IS NULL` from the
   emitted SQL (same rows, bytes change).
5. **Dependent grandchild joins:** the report says both "hoisted along" and "needs W4.3 step 6". **Amend:** in W0.6, a join
   above the sub whose condition *or a filter predicate* reads the sub's columns fails loudly (today's detach also rebuilds
   `TypedFilter`s above the sub without checking whether their predicates read the removed columns); hoisting-along waits for
   W4.3 step 6; size the loud cases from the probe.
6. **Stale citation:** `testMilestoningContextPropagatedThruPropertyToViewWithNonMilestonedRoot` is in neither fail roster
   nor `corpus2-fail.txt` (it passes today; it is in the engine-order registers only).

## Push 5a — section imports (report 3 §1)

**Fits.** `ParsedModel` is in the `model` target; `Section`/`Declared` need only `model` types (no new layer edge);
`ElementParser.parseModel` (268-~422, ~155 lines) has room; ArchitectureTest's construction-debt count covers
`com.legend.protocol` only.

**Issues → amendments:**
1. **Blast radius ~24 files, not ~12.** Unlisted readers/writers of `elementImports`/`elementOffsets`/`elementSources`:
   **wasm/src/main/java/planner/Wasm.java:349** (product code; a duplicate of Compiler:298's boot concat);
   **ModelBuilder.java:263** (`from()` passes `model.elementImports()`); **spec MinimalCorpus.java:356-384** (the corpus's own
   multi-unit merge; classes/enums only, semantically safe, must be ported); PreludeGenerator.java:890-901,
   EagerCorpusCompileProbe.java:133, ManifestWorldCensusTest.java:174/217, OurResolutions.java:72, SpecBodyCensusTest.java:137;
   pct ChannelB.java:143-152/197/260; parser-equivalence Sectionize.java:76. Constructors: 21 `new ParsedModel(` in 13 files
   (11 in NameResolverTest). **Amend:** list every module — `//wasm`, `//pct`, `//parser-equivalence`, `//spec` fail to
   compile if one is missed.
2. **Opening a `Section` "on each `###` boundary" changes the scoping rule:** today `sectionImports` resets only when an
   `import` follows elements (ElementParser.java:305-316), so an import-free `###Pure` section **inherits** the previous
   section's imports. Real Pure scopes imports per section — a second latent defect; fixing it in the same push can turn
   models that resolve through the leak into resolve errors (roster LOST) and breaks rule 0b.5. **Amend:** push 5a opens a
   `Section` exactly where today's code starts a new scope (an import after elements; a claimed section) — a keying change
   only. Record the `###` leak as a separate pinned finding for W2.3b (which owns the rule), after a probe counts the
   elements that resolve only through an inherited import.
3. **Front-end** (`parser/`, `compiler/`): §0 step 6 requires `//spec:reference_lane` — add it to the gate (disagreement set
   not grown).
4. The cross-file effect on the corpus is not measured; cheap before the switch: list function FQNs with >1 declaration
   across `Compiler.parseSources` units whose sections carry different imports.

## Push 5b — sourceless mapping (report 3 §2)

Confirmed: NameResolver.java:1147-1148 `nn(sourceClass)`; `ClassMapping.Pure.sourceClass` is `@Nullable`
(model/ClassMapping.java:320). One line. Front-end (the reference-lane note applies). Adversarial case (d) ("fails at
compile or query") not verified.

## Push 5c — value-keyed provisions (report 3 §3)

Fits: `runtimes` and `shared` are `final` maps (ServiceTestRunner.java:116-118); `Provision` a private record (:137);
nothing asserts the `$test$<hex>` name (only :366). ErrorShapeGuardrailTest:59 (4 catches) and ArchitectureTest:1258 (2
protocol constructions) unchanged if no catch/protocol node is added. Two choices to state: (1) today the key includes
`ref:<path>>` (:305), so identical CSV via a `###Data` reference and inline do **not** share a runtime; adversarial case (c)
changes that — recommend pure value equality (they share), recorded. (2) The latent ids (ConstructedInstances:90-98,
FunctionBodyRows:37, PlanRows:51) are not reproduced from a user query — recommend pinning `@KnownDefect(owner="W6.4")`
rather than fixing; the "whole text as id" idea is unverified against where those ids land.

## Push 6-A — null-safe `==` by multiplicity (report 4 A)

**The engine rule is confirmed** (pureToSQLQuery.pure:8447-8462, `nullSafeEqualsOperation`: both operands empty; one empty
→ `isNull`; case 4 either side `hasOptionalVarPlaceHolderValue` → `nullSafeEqual`; case 5 both lower bounds 0 →
`nullSafeEqual`). **Both multiplicities are available at the call site:** `NullSemantics.equalNullArms(n, cargs)`
(NullSemantics.java:108-123, called at Scalars.java:~163) already reads `n.args().get(i).info().multiplicity()`; the fix
deletes the two `instanceof SqlExpr.Column` tests. Case 4 is implementable (`SqlExpr.PlanParam` has an `optional` flag,
SqlExpr.java:557).

**Amendments/risks:** (1) **Pure-level vs substituted multiplicity (not verified):** the engine reads the Pure
expression's multiplicity (`$a.ustreet` is `[0..1]`); lite lowers the *store-substituted* tree, so the operand's info may
be the binding's (`toUpper(...)`, possibly `[1]`); if so, deleting the Column test does not fix repro 1. Write the failing
test first and also assert the SQL contains `IS NOT DISTINCT FROM`; if not, check whether Substitution keeps the
property's `ExprType` on the replacement. (2) `isOptional` requires upper bound 1 (NullSemantics.java:57-60); the engine
requires lower bound 0 only (`[*]` counts) — match or register. (3) Wider blast radius than "computed operands":
`CastPolicy.comparisonWireOperand`, `MixedEncoding.equalityEmission`, `VariantShapes.alignLiteralToJson` (Scalars.java:~139-153)
can wrap a column in a non-`Column` expression, so some column-to-column comparisons that emit `=` today become null-safe
(engine-correct, bytes change). (4) Byte oracles: 24 ladder goldens at `core/src/test/resources/ladder/*.sql` (already
contain `not distinct from`; `LeanSqlLadderTest`). (5) PCT: by name no pinned expected failure looks affected (the Grammar
pins `testEq/EqualNonPrimitive`, `…PrimitiveExtension` are about instances; pct_h2's 27 pins include no equality or sum
rows), but the PCT lanes fail when a pinned failure is fixed ("a fix … fails the run", pct/BUILD.bazel gate-7 comment) —
read the lanes. (6) The repro harness exists: `Compiler.execute(MODEL, query, "m::RT", conn)` over in-memory DuckDB
(NullSemanticsTest.java:33-62); extend its `MODEL` with `ustreet: toUpper([s::DB] A.STREET)`.

## Push 6-A2 — ModelJoin/XStore equality provenance (report 4 A2)

**Confirmed that the conditions reach resolver synthesis as plain `=`, but not via Pipelines:** ModelJoin
(MappingNormalizer.java:1103), XStore (:1028, XStorePureEnds:235) **and store-Join associations**
(AssociationSynthesis.java:525) all emit the same `legacyAssocPredicate(a,b,src,tgt,cond)` carrier; AssociationJoins.java:1226
consumes it without knowing the origin; joins are then built with `false /* resolver-synth */` at StoreResolver:2049/2170 and
in CorrelatedSubselects (7 sites); every one of the 17 resolver `new TypedJoin` sites passes `false` or copies the flag. The
EXISTS form is a `CORRELATION`-stamped filter, and that stamp alone forces plain `=` (Lowerer.java:1500-1502). **Why a
per-join flag is wrong:** conditions get merged — `pkEqualityCond` back-joins (StoreResolver:2160-2164), composed temporal
windows, the `SyntheticHeads.java:1693-1700` merge into a CORRELATION filter — so a `userCondition=true` join would make the
resolver's own key equalities null-safe too (NULL keys would join). The correct form is an equality kind on each equality
node (W5.2). **Needs a user ruling:** (a) confirm with the planned failing fixture (testComplexRelationFunction + a NULL
CITY), then pin `@KnownDefect(owner="W5.2")`; or (b) pull W5.2's equality-kind node forward (normalizer, resolver, lowering;
~6–10 files). Any provenance must come from `model` or `ctx` (`resolver` may not depend on `normalizer`, core-layers.txt); a
new FQN comparison may trip IdentityGuardrailTest's shrink-only counts.

## Push 6-H — `COALESCE` on the list sum (report 4 H)

Confirmed at Scalars.java:1277-1281 (`sum`) and :289-290 (`plus`); no test or golden asserts `list_sum` (only a comment,
PctCensusGate:57, and SQL-level fixtures CarrierDifferentialTest:532-535, unaffected). Amendments: (1) the `plus` rule is
registered for **`AT_STRING_PLUS` too** (:276) — apply `COALESCE` only when the Pure return type is numeric, never `0` against
a String. (2) **Same defect:** `times([])` is `1` in Pure (times.pure:22) but lite emits `LIST_PRODUCT` (Scalars.java:306-307),
presumably NULL on empty (not run) — add `COALESCE(…, 1)` in the same push or pin. (3) Repro via the correlated `#TDS` form
(the literal form may fold), the `TypeInferenceIntegrationTest:700-722` pattern.

## Push 6-D — `ANY_VALUE` on H2 (report 4 D)

**Not a wrong-results defect** (fails loudly); the README's "12 → 11 … D" overstates W0.6. **New fact:** lite runs two H2
versions: core and the corpus use 2.1.214 (MODULE.bazel:68), whose `AggregateType` has **no** `ANY_VALUE`; `//pct:pct_h2` uses
2.4.240 (MODULE.bazel:91), which **has** it (both checked in the jars). The base `reducer` spells `r.fn()` by name
(AnsiSqlRenderer.java:986-997); H2.java:531-575 has no arm. No `corpus_h2` fail-list row mentions it; no PCT relation test
uses `first()` in an aggregate. **Decision:** a spelling valid on both versions (`MIN(x)` fits the any-non-null contract; its
behaviour on JSON/ARRAY carriers not verified) or a `DialectCapability` refusal (reviewer recommends the refusal). Repro with
the H2SplitPartTest.java:31-43 pattern (`jdbc:h2:mem:`, `type: H2`).

## Push order and dependencies

3 → 4 right (push 4's hoist uses the sub-prefix probe at 503-512; without push 3's step 5 a collision case becomes loud in
push 4 — acceptable, say so). 2 → 6-A2 and 6-A → 6-A2 right (A2 needs the stamp mechanism; ModelJoin conditions contain
non-column operands, `lower(...)`, testModelJoinSimple:252). 2 → 4: push 4's rebuilds should use push 2's stamp-carrying
`TypedFilter` API. 5a, 5b, 5c, H, D depend on nothing in 3/4; 5a and 5b are front-end (reference lane). Keep 5a/5b/5c as three
pushes so a roster move is attributable.

Not verified overall: any lite end-to-end run; the multiplicity carried by substituted bindings (A); the rider counts and
the association-channel repro (push 4); cross-file overloads in the corpus (5a); `list_product([])` NULL; `MIN` on H2 carrier
types; whether `SubNav` covers the `_nav_` prefixes (step 5).
