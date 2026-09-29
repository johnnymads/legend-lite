# Meta-audit lens 3 — SQL and query-compiler view of the back half (H → I → J → P/K), compiler/rebuild @ ee7617ec8

Read-only review, persisted by the parent session. Paths relative to `core/src/main/java/com/legend/` unless stated;
"not verified" marks what was not checked against a probe or a running database.

## Verdict

The target is recognisably what a query-compiler engineer would build: a store resolver emitting a join tree with
`ColumnRef(JoinNodeId, col)`, a semantic MIR, per-dialect legalisation with a verifier, a dumb printer, a staged plan with
late-bound nodes; it matches Calcite's RelNode → RelToSql → SqlDialect split and SQLGlot's per-dialect transforms.

Two load-bearing semantic layers are missing:
1. **No logical relational algebra.** `SqlSelect` is a SQL-block syntax record with every clause slot
   (`sql/SqlSelect.java:26-31`); block formation (the `Fold` isolation predicates) is decided during semantic lowering.
   A09's clean sheet asked for HIR → logical algebra → block formation; the plan's row I and W5.2 dropped it.
2. **No properties on the relational IR for ordering, determinism or null-strictness.** Ordering and determinism live in
   harness registers and name lists (D6); NULL semantics are decided by operand shape and droppable side-stamps (W0.3
   proved it: a lost CORRELATION stamp made NULL join keys match).

Verification is strong at catching change (byte-identical SQL snapshot, goldens, rosters) and weak at catching wrong rows:
DuckDB = H2 is common-mode (both render the same MIR); the reference lane cannot see store resolution; corpus fixtures
rarely contain the orphans, NULLs, ties and multiple versions that separate right from wrong.

Executable as a refactor program, with four additions: a determinism/collation property on the MIR; equality semantics
as distinct typed nodes; a wrong-rows harness (adversarial-data differential + metamorphic TLP/NoREC + a live
legend-engine oracle) before W4.3; W5.5 (Postgres) after the semantic collection nodes.

## Direct answers

1. Architecture: right in shape; missing the logical algebra (finding 1) and per-node semantic properties (2, 3, 6).
   Identifier quoting has a real escaper (`AnsiSqlRenderer.delimited` :1196-1199, `ident` :1333-1345) but no per-dialect
   case-folding model. Every value is inlined as a literal (no `setObject`/`setString` under `exec/`; `PlanParam` is
   plan-text only), so injection safety rests on `stringLit` (:1026-1043), correct for DuckDB and H2. Output determinism
   is addressed only by W1.7.
2. Correctness risks: the table below; most important uncovered: order-sensitive aggregates and windows, order lost
   through isolated subselects, outer-join predicate placement in milestoning, filters pushed below windows, the
   null-strictness blacklist, the Float-literal type cliff, Unicode length, collation.
3. "The database computes every value": not consistently. Java re-spells database values as SQL literals
   (`exec/DynamicPivot.java:61-111`; W6.1's `ForEach(values, template)` makes it a plan node), picks types from values
   (`Executor.decodeAny`: Long, then Double, then String) and rewrites plan types from JDBC metadata (`WireTypes`), and the
   host judge (kept by D7) compares with 2-ULP tolerance and multisets in Java (`exec/Equality.java:71-83`). D8's fenced
   schema folding is model-space and fine.
4. Multi-dialect: the "ANSI" base is DuckDB (A10 #1); the W5.4 split is right but only after the MIR carries semantic
   types. DuckDB = H2 is a valid oracle only for legalisation (J), and only once every divergence is adjudicated by a third
   party; a live disagreement exists (`splitPart`, finding 5). The right oracle is layered (finding 4).
5. Verification: snapshot and goldens catch drift, not LEFT-vs-INNER, window placement or NULL handling on fixtures
   without orphans/NULLs/versions. Add the adversarial-data old-vs-new differential, TLP/NoREC at Pure level, and
   legend-engine execution on randomized data.

## Ranked findings

1. **The logical relational algebra is missing between H and SQL-block formation (structural).** `SqlSelect` slots
   (`sql/SqlSelect.java:26-31`); isolation decided while lowering (`Fold.filterSlot` :265-276, `groupByFolds` :360-365,
   `sortFolds`/`limitFolds`/`offsetFolds`/`distinctFolds` :436-461, `Lowerer.isolate` :3455-3457 from the limit/drop/slice
   arms :638-661); A09 §3 proposed HIR → logical algebra (Scan, Filter, Project, Aggregate, Window, Join, Sort, Slice,
   SetOp, Unnest) → block formation with the Fold predicates. The Fold predicates are Calcite's `SqlImplementor`
   "needNewSubQuery" check, correct only over an algebra with defined bag/order/NULL semantics; today semantics and block
   shape are one step. D11 is really this question; its option C (a scalar family beside a relational family) is the
   RelNode/RexNode answer. Change: state in §1 that H's skeleton (W4.3 step 7) is the logical algebra and covers all
   relation operators; I becomes (a) scalar lowering to a Rex-like family and (b) block formation reusing Fold; the D11
   census prices option C. Size (judgment): +4–8 net, overlapping W4.3 step 7 and W5.1c, repaid by deleting the ~38
   run-time relation/scalar decisions.
2. **No ordering or determinism property; D6's classifier is incomplete (correctness, verification).** `first()` in
   `groupBy` lowers to `ANY_VALUE` (`lowering/Aggregates.java:43-47`); unordered `joinStrings` emits unordered
   `STRING_AGG` by ruling (`Lowerer.java:1328-1332`); order carried across isolation only for sort-over-sort
   (`lowering/Sorts.java:50-58`); `ScanOrder` injects `rowid` keys (`sql/ScanOrder.java:36-80`, DuckDB-specific). D6 lists
   only positional reads. Also order-dependent and unlisted: sort with non-unique keys then take; order-sensitive
   aggregates; windows without ORDER BY or with ties; order through subselects. The harness already has the sound
   technique (page-membership verdict, `spec/.../harness/H2Verify.java:369-383`). Change: a `Determinism`/collation trait
   on every relational MIR node (Calcite's RelCollation + a nondeterminism flag); derive D6's split from it; judge
   nondeterministic results by set-of-valid-answers verdicts (page membership, sorted-prefix, token multiset for
   `string_agg`); keep harness `rowid` ordering only for goldens encoding H2 insertion order, registered as
   "engine-artifact".
3. **NULL semantics from operand shape and droppable stamps (wrong rows, witnessed).** `NullSemantics.equalNullArms`
   picks null-safe equality only when both operands are `SqlExpr.Column` and `[0..1]` (`lowering/NullSemantics.java:116-123`),
   so `upper($a) == upper($b)` with both empty renders `=` and drops the row (Pure says true); the `verbatim` stamp turns
   null-safe back into `=` (:101-105); optional-operand guards depend on resolver-minted multiplicities (188 `new ExprType(`
   in A07's half). W0.3: a lost CORRELATION stamp made NULL keys match. Change: G or H emits two equality kinds (Pure total
   equality; mapping/SQL `=`) as distinct MIR nodes, deleting the verbatim stamp and the shape test; any kept engine shape
   approximation becomes a declared, pinned divergence; test with TLP.
4. **No wrong-rows oracle for H and I; the fuzzer is common-mode (verification).** Change: W1.10 before W4.0 (judgment
   sizes): (a) adversarial-data old-vs-new differential, 2–3 sessions: each corpus query's W1.7 baseline SQL vs new SQL over
   mutated fixtures from `testdatagen` (orphans on every FK, NULL in every nullable column, duplicate business keys,
   several milestone versions incl. boundary dates, ties on sort keys, empty tables, non-BMP strings, extreme numerics);
   (b) Pure-level metamorphic tests, 3–5 sessions: TLP (`R->filter(p)->size() + R->filter(!p)->size() == R->size()`),
   NoREC (filter count = count of true in `project(p)`), PQS (a pivot row must be returned); (c) legend-engine as the
   executing oracle for H (the pinned shaded engine jar runs here) on randomized H2 data. DuckDB = H2 stays the oracle for
   J only, at MIR level with random well-typed MIR trees.
5. **DuckDB and H2 disagree on meaning today; the divergence register needs an adjudicator.** `PURE_SPLIT_PART` on DuckDB
   splits on the whole separator string (`sql/dialect/DuckDb.java:576-587`); on H2 on any character of it
   (`sql/dialect/H2.java:725-735`); W0.2(a) tested H2 alone. Also `H2AvgDelivers` (DECFLOAT AVG) and `SqlTyping`'s 67
   DuckDB-probed rules imposed on H2. Change: every register row names its adjudicating spec (PCT test or engine run) and
   which dialect is wrong; a row without an adjudicator is a defect.
6. **The SQL type system is DuckDB's, inside dialect-free constructors; literal typing has a magnitude cliff.**
   `SqlSelect`'s constructor re-labels outputs through `SqlTyping.reconcileSlot` (`sql/SqlSelect.java:33-53`);
   `plainFloat` renders 1e-6 ≤ |v| < 1e15 as a bare decimal (DuckDB types DECIMAL) and exponent form outside (DOUBLE)
   (`AnsiSqlRenderer.java:1370-1378`), so arithmetic kind changes with magnitude (charter C2.2 bans that for values);
   `NaN` throws in `BigDecimal.valueOf`; `±Infinity` renders as a bare identifier. Pure Float is computed as DECIMAL for
   engine parity (NUMERIC_CHARTER Rule 1). Change: semantic MIR types from the HIR; a per-dialect delivered-type function
   in legalisation used only to place conform casts (W5.4 reframed); spell or refuse non-finite floats; register "Float
   computed as DECIMAL".
7. **The null-strictness test is a blacklist that misses null-skipping functions.** `SqlTyping.nullStrict` treats every
   unlisted function as null-strict (`sql/SqlTyping.java:708-729`); `CONCAT` is NULL-skipping on both dialects
   (`AnsiSqlRenderer.java:658-667`), `GREATEST`/`LEAST` ignore NULLs on DuckDB and Postgres; none listed;
   `wherePadNeutralized` (`SqlTyping.java:602-625`, from `SqlSelect` :44-51) marks a LEFT-join side non-null under
   `WHERE concat(r.x,'y') = 'y'`. Whether rows change is not verified. Change: a null-strictness property on each `SqlFn`
   (whitelist, exhaustive switch), in W5.2.
8. **Tenet gaps: Java re-spells database values as SQL; nothing is bound as a parameter.** `DynamicPivot.discover`
   converts JDBC objects to literal nodes (`exec/DynamicPivot.java:61-111`, with recorded past bugs); W6.1's
   `ForEach(values, template)`; probe and main query are two statements (snapshot not verified). Change: late-bound nodes
   pass values as JDBC bind parameters typed by the compile-time column type (carriage C1.2, not rendering C2.5); service
   and user parameters too (shrinks W5.3's injection surface); probe and query in one transaction; `Executor.decodeAny` and
   the `WireTypes` rewrite named in W6.2.
9. **Known wrong rows in milestoned outer joins, unpinned (rule 0.11 gap).** `resolver/TemporalFrame.java:1285-1322`:
   "a PRESENT sub row failing its window drops the head match where the engine keeps head + NULL sub" (block duplicated
   verbatim); no `@KnownDefect` covers it. Change: pin now, owner W4.3 step 6; join-tree nodes carry their ON predicate set;
   the W1.3 verifier asserts no null-supplying-side predicate outside its ON.
10. **A filter over non-window columns is pushed below a window (parity-justified deviation).** `Fold.filterSlot`
    (`lowering/Fold.java:265-276`, comment :280-295, PCT `testExtendFilterOutNull`). Relationally valid only when the
    predicate touches partition keys. Change: a declared divergence confirmed against a live engine run; excluded from
    TLP/NoREC until ruled.
11. **W5.5 (Postgres) is mis-ordered and under-scoped.** The MIR is built on DuckDB list-lambda idioms (H2 needs ~150
    shape-reversing rules, `CarrierStrategies`); `ident` leaves plain names unquoted (`AnsiSqlRenderer.java:1333-1336`), so
    case folding differs (H2 upper, Postgres lower, DuckDB insensitive); `ddlIdentifier` quotes a declared-quoted name
    without doubling (:1322-1324); `stringLit` splices `chr(0)` (:1026-1041), rejected by Postgres; no homework on
    collation, QUALIFY, `ROUND(double,int)`, integer `/`, strict casts. Change: W5.5 after W5.2 or scoped to the relational
    subset with walls; `C` collation; an `Identifier` value with per-dialect folding in W5.3.
12. **Semantics depend on session settings.** DuckDB `SET TimeZone='UTC'` (`sql/dialect/DuckDb.java:32-33`); H2 URL
    settings `MODE=LEGACY`, `DEFAULT_NULL_ORDERING=HIGH`, `NON_KEYWORDS` (`exec/H2Settings.java:45-51`), no timezone setup;
    tests pin `TZ=GMT` (`.bazelrc:14`); `dialectOf` runs session setup every call. Change: each dialect declares its
    required settings; the runner applies and verifies them once per connection (W6.2); one lane under a non-UTC JVM zone.

Positives to keep: `concatenate` renders UNION ALL (`Lowerer.java:764-766`); quantified subqueries made two-valued
(`lowering/RelationPredicates.java:160-170`); explicit NULLS placement (`AnsiSqlRenderer.java:249-274`); join ON/kind
coupling and pad nullability on the node (`sql/SqlSource.java:142-219`); banker's rounding probed per dialect
(`DuckDb.java:422`, `H2.java:593-606`); `toOne` checked in SQL (`SqlExpr.CheckedOne` :848ff).

## Semantic risks not covered by the plan

| # | risk | evidence | covered? | action |
|---|---|---|---|---|
| 1 | order-sensitive aggregates (`ANY_VALUE` for `first`, unordered `STRING_AGG`/`list`) | `Aggregates.java:43-47`; `Lowerer.java:1328-1332` | no | determinism trait; token-multiset verdict |
| 2 | order lost through isolated subselects | `Lowerer.isolate` :3455; `Sorts.java:50-58` | no | collation trait; re-apply ORDER BY at the root or wall |
| 3 | sort with ties then limit/at | D6; `H2Verify.java:369-383` pages only | partly | classifier from the trait |
| 4 | windows with ties or no ORDER BY | not verified | no | trait + verdict policy |
| 5 | NULL equality by operand shape | `NullSemantics.java:116-123` | no | typed equality kinds; TLP |
| 6 | `NOT IN` over a list containing NULL | `NullSemantics.negate` :190-192 | no | TLP; null-safe membership node |
| 7 | empty-set aggregates (`sum([])`: NULL vs 0) | `Aggregates.java:36-38` | not verified | adjudicate vs PCT and engine |
| 8 | division by zero | `AnsiSqlRenderer.java:697-699` | no | register + explicit semantics |
| 9 | Float literal DECIMAL/DOUBLE cliff; NaN/Inf | `AnsiSqlRenderer.java:1370-1378` | no | finding 6 |
| 10 | decimal/integer width, overflow | A10 (`SqlTyping` :1234-1243) | via W5.4 only | semantic types; overflow fuzz |
| 11 | Unicode length/substr (code points vs UTF-16) | no handling found | no | probe; register or fix |
| 12 | string collation | none | no | `C` collation; verifier |
| 13 | identifier case folding; case-only-distinct names | `AnsiSqlRenderer.java:1333-1345` | partly | `Identifier` with folding |
| 14 | timezone and session settings | `DuckDb.java:32-33`; `H2Settings.java:45-51` | no | finding 12 |
| 15 | outer-join predicate placement (milestoning) | `TemporalFrame.java:1285-1322` | no pin | finding 9 |
| 16 | filter pushed below a window | `Fold.java:265-295` | no | finding 10 |
| 17 | null-strictness blacklist | `SqlTyping.java:708-729` | no | finding 7 |
| 18 | `splitPart` multi-character separator | `DuckDb.java:576-587` vs `H2.java:725-735` | no | finding 5 |
| 19 | scalar subquery returning more than one row | not verified | no | probe; `CheckedOne`-style guard |
| 20 | two-phase dynamic pivot without a snapshot | `DynamicPivot.java:61-111` | no | one transaction; bind parameters |

## What a SQL expert would say

- The pipeline shape is right. Name the missing layer: a logical algebra with bag, order and 3VL semantics where scalars
  are their own family (D11 option C); H's skeleton should be that algebra; the Fold predicates are good RelToSql rules
  and belong after it.
- Make semantics node properties, never flags or shapes: equality kind, null-strictness, determinism, collation,
  nullability. Every W0.3-style bug so far is a flag dropped on a rebuild.
- Gate on rows, not only bytes: byte identity proves nothing changed, not that the baseline is right. Before W4.3 stand up
  the adversarial-data differential and Pure-level TLP/NoREC (~5–8 sessions, judgment), legend-engine execution as the H
  oracle, DuckDB = H2 at MIR level for W5 only with an adjudicated divergence register.
- Cut or change: drop harness `rowid` ordering as a certification device for set-of-valid-answers verdicts; reframe W5.4
  as semantic types + per-dialect delivered-type legalisation; bind parameters instead of re-spelling literals.
- Add: W1.10 (the wrong-rows harness); a determinism/collation trait (the source of D6's classifier); typed equality kinds
  (with W2.4/W3, emitted in G); a null-strict whitelist (W5.2); `@KnownDefect` pins for the temporal outer-join residual
  and the `splitPart` split; per-dialect declared session settings; Postgres homework.
- Re-order: W1.10 before W4.0; split W1.8 (MIR-level DuckDB/H2 fuzzer before W5; the Pure-level metamorphic part with
  W1.10); W5.5 after W5.2; W5.4 after W5.1b and W5.2.
- Sizing (judgment): W4 +5–8 for W1.10; W5 10–16 only if the logical algebra is absorbed into W4.3 step 7 / W5.1c,
  otherwise +4–8; W5.5 3–6 optimistic unless scoped.

Not verified: DuckDB 1.5 / H2 2.1 behaviour for division by zero, multi-row scalar subqueries, `GREATEST` with NULL;
whether the null-strictness mislabel changes any corpus row; whether `H2Settings` applies to user-supplied H2
connections; which spec the corpus expects for `sum([])`; whether Pure's `splitPart` is whole-string or character-class
splitting (the H2 comment cites commons-split).
