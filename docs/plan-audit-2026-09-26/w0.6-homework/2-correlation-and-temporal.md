# W0.6 homework 2 — the lost correlation stamp, the prefix collision, the killed head match

Read-only homework, drafted by a subagent at `compiler/rebuild` @ `89dc45871` and persisted verbatim by the parent session
(2026-09-29). Nothing edited. Behaviour was observed with **jshell** (JDK 25 from
`external/rules_java++toolchains+remotejdk25_macos_aarch64`) against the jars in `bazel-bin/core/core_tests.runfiles`, not
`bazel test`: `junit_test` ignores `--test_filter` (`tools/junit/defs.bzl:25-66`; JUnitMain has no filter), so a focused
run would be the whole core_tests suite. `libresolver.jar` was built at 01:33; the only later `core/src/main` commits
(01:37, 01:44) touch `compiler/spec` Typer/Overloads/TdsDesugars and native-claims.tsv, so the resolver jar matches the
source. Every "PROBE" line is observed output. Paths under `core/src/main/java/com/legend/resolver/` unless stated.

---

## 1. The nested exists drops its CORRELATION stamp (`NestedExistsCorrelationStampTest`)

**Symptom / pin.** The model, data and query are the test's `MODEL`, `rows()`, `NESTED` (F/P/C tables, Emp and Own
associations): `m::Firm.all()->filter(f|$f.staff->exists(s|$s.cars->exists(c|$c.make=='VW')))->project(~[legal:f|$f.legal])`
→ `[BETA]`, expected `[]`. PROBE, today's SQL: `... WHERE EXISTS (SELECT 1 FROM P AS t1 LEFT OUTER JOIN C AS t2 ON t1.ID =
t2.PID WHERE EXISTS (SELECT 1 FROM C AS t3 WHERE (t1.ID IS NOT DISTINCT FROM t3.PID) AND t3.MAKE = 'VW') AND t1.FID =
t0.ID)`. The single-level query lowers `t0.ID = t2.PID` (correct). Two further oddities, not verified as defects: the
correlation precedes the user conjunct (the engine order is [user][correlation]); a stray `LEFT OUTER JOIN C AS t2`
(inside an EXISTS, does not change which rows return).

**Root cause.** The inner scope builds the EXISTS relation stamped CORRELATION: `new CorrTarget(new TypedFilter(exPipe,
corr, exPipe.info(), Stamp.CORRELATION), ...)` (Substitution.java:3264-3266). The outer scope re-passes the inner
predicate through its own `rewrite`: `inner.body().stream().map(this::rewrite)` (Substitution.java:3336; the same at
3364). `rewrite` (Substitution.java:1900) reaches the "relation material" arm at 2057-2062 and rebuilds with the
3-argument constructor, whose stamp defaults to NONE (`compiler/spec/typed/TypedFilter.java:31-33`): `new
TypedFilter(rewrite(f.source()), rewriteLambdaBodyOnly(f.predicate()), f.info());`. The lowerer uses plain `=` only for
CORRELATION: `verbatimEquality = ... || f.stamp() == Stamp.CORRELATION` (`lowering/Lowerer.java:1502`); the stamp also
picks the WHERE zone (`mergeWhere(..., f.stamp())`, Lowerer.java:1531 → WhereMerge.java:37-42). So the join key lowers
null-safe and NULL matches NULL.

**The same defect elsewhere** (sites rebuilding an existing `TypedFilter f` with the 3-arg constructor, stamp → NONE; 14
methods, 17 sites):

| site | reach |
|---|---|
| Substitution.java:2061 | **live, proven** |
| Substitution.java:3035 | object-space filter, stamp always NONE there; latent |
| NavMaterializer.java:773 | resolved pipeline; can carry a stamp (not verified) |
| Pipelines.java:1235 (`rewriteRowReads`, a generic walker used on correlation bodies, Substitution.java:3240-3250) | not verified |
| Pipelines.java:1544 (`widenDistinctForKeys`) | target pipelines; TEMPORAL affects conjunct order only |
| StackBuilder.java:1875, 1898 (`demandBelow`/`demandForKeys`; reached from `widenForCorr` on EXISTS targets, Substitution.java:3272-3274) | not verified |
| StoreResolver.java:684 (`augmentNavPredicates`) | not verified |
| FlattenOps.java:279 (`innerizeOrNull`) | not verified |
| FlattenOps.java:139, 174 | object-space ops; latent |
| SyntheticHeads.java:785, 1703 | not verified |
| SyntheticHeads.java:1809 (`rebuildChildren`, 9 callers incl. AssociationJoins:492/1378/1391/1452, CorrelatedSubselects:2341, SubQueryLift:100) | not verified |
| GraphEmission.java:3298 (`substVars`) | derived bodies; latent |
| ChainNormalizer.java:87, ResultEnvelopeSplice.java:417 | pre-resolution, stamp always NONE; latent |

StoreResolver.java:3067 rebuilds the user's own op (NONE is correct there, though implicit). Sites that keep the stamp:
TypedFilter.java:45 and 50 (`withChildren`/`withInfo`), Pipelines.java:314-317 and 402, TemporalFrame.java:622, 1760,
1824. A merge site: SyntheticHeads.java:1693-1700 folds a user predicate into a CORRELATION filter and keeps CORRELATION —
the user's `==` then lowers plain `=` instead of null-safe, and an outer TEMPORAL stamp is lost (not verified). New
filters with no stamp that carry a correlation-like predicate: AssociationJoins.java:1504 (XStore parent-nav),
CorrelatedSubselects.java:295, 373, 390, 1945; TemporalFrame.java:1167 (a temporal window with NONE; affects order only).
Each needs an explicit decision; none verified as wrong rows. The same class on other records (A08): 6-arg TypedNavigate
rebuilds drop `routes`, `pairedPredicate`, `frameName` (Pipelines.java:98-100; NavMaterializer.java:760-762).

**Fix (correct in today's architecture; W4.3 not needed).**
- (a) Substitution.java:2061 → `f.withChildren(List.of(rewrite(f.source()), rewriteLambdaBodyOnly(f.predicate())))`: the
  stamp is node provenance; the re-pass only substitutes outer-variable reads.
- (b) Class fix: delete the 3-arg constructor; give the user path a named factory `TypedFilter.user(...)` (used by
  FilterChecker.java:19); add `withSource(src)`, `withPredicate(p)`, `rebuilt(src, p, info)` that carry the stamp; convert
  the 17 rebuild sites; write `Stamp.NONE` explicitly at the remaining new-filter sites. Then no rebuild can drop the stamp
  and still compile.

**SQL byte identity.** Output changes only where a stamp used to be dropped: a dropped CORRELATION: `IS NOT DISTINCT FROM`
→ `=` and the correlation moves after the user conjunct (the engine's order); a dropped TEMPORAL: conjunct order only.

**Blast radius.** The pin loses `@KnownDefect`. In core/src/test only the pin asserts `IS NOT DISTINCT FROM`. The
relational corpus and PCT nested-exists/forAll goldens are engine SQL, so should only move toward passing; re-run the
corpus lane and diff `docs/RELATIONAL_CORPUS.md`.

**Gate.** The pin (both stamps CORRELATION, no `IS NOT DISTINCT FROM`, result `[]`). Adversarial, rows checked: a NULL
key at the outer hop (a firm with `ID NULL` and a person with `FID NULL` must not match); an orphan car (`PID` matches no
person); three levels (Firm→staff→cars→parts: the re-pass runs twice); nested `forAll` (NOT EXISTS flips if NULL-safe
equality leaks); a chain filter inside the nested exists (`$s.cars->filter(...)->exists(...)`: top filter NONE, inner
CORRELATION); a user `$c.make == $s.nick` with both NULL stays null-safe (checks the SyntheticHeads merge); WHERE order
[user][correlation].

---

## 2. A colliding slot prefix loses the milestoning window (`NavPrefixCollisionTemporalTest`)

**Symptom / pin.** `OrderT` gets an unmapped column `product_name`; query `c::Order.all()->project(~[id:o|$o.id,
name:o|$o.product(%2015-06-01).name])`. PROBE: `LEFT OUTER JOIN ProdT AS t1 ON t0.PID = t1.ID` with no window, so both
versions join (`1|old`, `1|new`); without the collision the window is present. More PROBES: the same collision with
`product_from_z DATE` also drops it; filter position (`filter(o|$o.product(%2015-06-01).name=='new')`) drops it (wrong
rows); an exists over the dated navigation is correct (a different channel); **temporal root + collision + explicit
date** (`Order` businesstemporal, `c::Order.all(%2020-01-01)` with `$o.product(%2015-06-01)`): ProdT is dated
**2020-01-01**, the explicit date silently replaced by the root date (wrong versions).

**Root cause.** `Pipelines.slotPrefix` mints `alias_2_` when the left row already holds the composed spelling
(Pipelines.java:580-592); its own contract says "readers take the prefix from the materialization's map, never from the
alias" (577-579); the minted prefix is recorded `prefixes.put(alias, prefix)` (Pipelines.java:632, 487).
`StoreResolver.materializeRoot` keys the temporal maps by spelling: `navPrefixToClass.put(navE.getKey() + "_", ...)`,
`navPrefixToChain.put(... + "_", chain)` (StoreResolver.java:1889-1890), and the mid-slot maps likewise (1907, 1919).
`TemporalFrame.applyJoinTemporalFilters` looks up `j.prefix().map(navPrefixToClass::get)` (TemporalFrame.java:1634-1635):
the key `product_2_` misses → the physical-slot branch `stampByOwnBlocks(right, root, ...)` (1747-1752): with an empty
root nothing is stamped; with a temporal root, the root date is stamped in place of the explicit spec. The class branch
has a second spelling cut: `bare = prefix.substring(0, len-1)` (1675-1677), and the chain lookup falls back to it via
`getOrDefault(prefix, bare)` (1682-1683), an alias spelling.

**The same defect class elsewhere** (a prefix/alias recovered or guessed from a spelling):
- **PROBED, silent wrong rows:** the sub-hop prefix guessed by probing `subProp+"_"` / `subProp+"_nav_"` against the right
  row (TemporalFrame.java:503-512 in hoist, 646-653 in `withDeferredOuterSubWindows`). Setup: ProdT carries unmapped
  `classification_from_z`/`classification_thru_z`, the ClsT slot minted `classification_2_`; query
  `$o.product($o.orderDate).classification.type`; result: ClsT joins with **no window** (its versions fan out) and the head
  ON windows **ProdT's own** `classification_from_z`/`thru_z` against `orderDate`. With a collision but no such columns: a
  loud NotImplemented instead.
- The same guess for the outer-date column (`x_y` / `x_nav_y` in the left row): TemporalFrame.java:710-718, 896-903 (not
  verified).
- `bare` strips: TemporalFrame.java:1676; StoreResolver.java:1191-1192 (`preAlias` from `pre.prefix()`, feeds `stepOf`) (not
  probed).
- A round trip: TemporalFrame.java:2455 → 2486 builds `alias+"_"`, then strips it back.
- A fallback spelling: `slotPrefixes.getOrDefault(slot, slot+"_")` at TemporalFrame.java:2224.
- A recomputed prefix: `Pipelines.slotPrefix(alias, cs.rowType(), ...)` at StoreResolver.java:1795 recomputes instead of
  reading the recorded prefix; if `cs.rowType()` differs from the left row at materialization, the prefixes disagree (not
  verified).
- A startsWith guess: `anyMatch(c.name().startsWith(seg+"_"))` at CorrelatedSubselects.java:1468-1476 (a source column
  `seg_x` makes it re-point instead of join; not verified).
- Other spelled prefixes to audit: AssociationJoins.java:1813, ChainedExists.java:147, NavMaterializer.java:1006-1009.
- The hoist's column split is `startsWith(headPfx + p)` (TemporalFrame.java ~539-541): confuses `classification_` with
  `classification_2_`.

**Fix (correct today for the pinned path; the general form is W4.3 step 2).**
1. StoreResolver.java:1886-1920: key by `m.slotPrefixes().get(alias)` / `.get(slot)`; skip stripped aliases (no join).
2. Carry the alias, don't re-cut it: `navPrefixToClass`'s value becomes `record NavSlot(alias, classFqn, chain)`;
   TemporalFrame.java:1675-1683 reads `alias` and `chain` from it — no `substring`, no `getOrDefault`.
3. Prefixes injective per materialization: add the prefixes already minted (`prefixes.values()`) to `slotPrefix`'s
   taken-check (aliases `a` → `a_2_` and `a_2` over disjoint target rows could both mint `a_2_` — the reviewer's reading
   of `composesDuplicate`, not probed).
4. TemporalFrame.java:2224's fallback → a loud miss; pass the alias directly at 2455.
5. Replace the probing at 503-512 / 646-653 with the head target's materialization map (navMats → `slotPrefixes`, keyed
   by the sub alias); needs new plumbing into `applyJoinTemporalFilters`.
6. StoreResolver.java:1795 reads the recorded prefix.
The fully keyed form (a structural `NavPath` instead of dotted `chain.subProp` strings) is W4.3 step 2; steps 1-4 don't
need it.

**SQL byte identity.** With no collision `prefix == alias+"_"`, so the maps and SQL are identical; only colliding models
change.

**Blast radius.** The pin loses `@KnownDefect`; `datedNavigationFiltersTargetVersions` must stay byte-identical. Method
ceiling 250 lines (CodeShapeGuardrailTest.java:37): `applyJoinTemporalFilters` (1611–~1790) and Substitution `rewrite`
(~212 lines per A07) have little room for plumbing. IdentityGuardrailTest counts function-name text only (patterns
:53-65, shrink-only :192), so it pins none of these prefix spellings — a guardrail gap.

**Gate.** The pin; a temporal root + collision + a different explicit date: ProdT dated 2015; a temporal root + collision
+ an undated navigation: the root date propagates; filter position with a collision returns `[1]` for `'new'`; three
versions with boundaries (`from_z == date` included, `thru_z == date` excluded); an order with `PID NULL` → `1|null`; the
sub-hop collision above (the ClsT window on ClsT, ProdT's columns untouched); two aliases minting the same prefix → loud or
distinct.

---

## 3. A present-but-out-of-window sub row kills the head match (TemporalFrame.java:1285-1322)

**Real, and it returns wrong rows today (PROBED).** The repro to pin (only `maker` is non-temporal; `Order` plain;
`Product`, `Cls` business-temporal):
```
Class c::Order { id: Integer[1]; orderDate: Date[1]; product: c::Product[0..1]; }
Class <<temporal.businesstemporal>> c::Product { name: String[1]; classification: c::Cls[0..1]; maker: c::Maker[0..1]; }
Class <<temporal.businesstemporal>> c::Cls { type: String[1]; }
Class c::Maker { name: String[1]; }
###Relational
Database c::DB (
  Table OrderT ( ID INTEGER PRIMARY KEY, PID INTEGER, orderDate DATE )
  Table ProdT ( milestoning( business(BUS_FROM=from_z, BUS_THRU=thru_z) ) ID INTEGER PRIMARY KEY, name VARCHAR(64), CID INTEGER, MID INTEGER, from_z DATE, thru_z DATE )
  Table ClsT ( milestoning( business(BUS_FROM=from_z, BUS_THRU=thru_z) ) ID INTEGER PRIMARY KEY, type VARCHAR(64), from_z DATE, thru_z DATE )
  Table MakerT ( ID INTEGER PRIMARY KEY, name VARCHAR(64) )
  Join OP (OrderT.PID = ProdT.ID)  Join PC (ProdT.CID = ClsT.ID)  Join PM (ProdT.MID = MakerT.ID) )
###Mapping
Mapping c::M (
  *c::Order : Relational { ~mainTable [c::DB] OrderT id: OrderT.ID, orderDate: OrderT.orderDate, product: [c::DB]@OP }
  *c::Product : Relational { ~mainTable [c::DB] ProdT name: ProdT.name, classification: [c::DB]@PC, maker: [c::DB]@PM }
  *c::Cls : Relational { ~mainTable [c::DB] ClsT type: ClsT.type }
  *c::Maker : Relational { ~mainTable [c::DB] MakerT name: MakerT.name } )
(+ the DuckDB Conn/RT sections of the pin tests)
```
Query `c::Order.all()->project(~[id:o|$o.id, pn:o|$o.product($o.orderDate).name,
cls:o|$o.product($o.orderDate).classification.type, mk:o|$o.product($o.orderDate).maker.name])`; data OrderT
`(1,10,'2015-06-01')`, ProdT `(10,'P',100,7,'2010-01-01','9999-12-31')`, ClsT `(100,'LATE','2016-01-01','9999-12-31')`,
MakerT `(7,'Acme')`. PROBE, lite: `[1, null, null, null]`; the engine gives `[1, P, null, Acme]`. Lite's SQL: a composite
`(ProdT ⋈ ClsT ⋈ MakerT) AS t4 ON t0.PID=t4.ID AND <product window> AND (<cls window> OR t4.classification_from_z IS NULL
OR t4.classification_from_z IS NULL)` (the clause doubled by the duplicated block). Swapping `mk` and `cls` in the
projection gives the same; without `maker`, the flatten rung hoists ClsT correctly (PROBED; `[1, null]`).

**Root cause.** A deferred outer-dated sub-window is composed into the **head's** ON by
`withDeferredOuterSubWindows(..., nullTolerant true)` (TemporalFrame.java:628-667, called at 1732); with `nullTolerant` it
becomes `window OR sub.from IS NULL` (1285-1322, the same block twice; introduced by 794a0b154). A present sub row failing
its window fails the whole head ON, and LEFT nulls every head column. The correct path, `hoistDeferredOuterSubJoins`
(TemporalFrame.java:487-600), returns null (→ the guarded path) whenever `detachSpineJoin` (607-626) meets a `TypedJoin`
with a different prefix above the sub join ("a JOIN above falls back", commit 790f9475a) — here MakerT's join sits above
ClsT's — and also when the prefix probe misses (503-512; the §2 collision case).

**What the engine does.** `applyMilestoningFilters` over the relational tree ANDs each table's milestone filter into
**that JoinTreeNode's own `join.operation`**, recursing into each child node separately (milestoning.pure:169-190,
core_relational/relational/milestoning/milestoning.pure in the pinned engine): every hop is its own top-level `LEFT OUTER
JOIN` whose ON carries its own window. Golden: testBusinessDateMilestoning.pure:580-585 (`... left outer join ProductTable
"producttable_0" on (fk and window("root".orderDate)) left outer join (...) "productclassificationtable_0" on
(window("root".orderDate) and "producttable_0".type = ...)`). A failing sub row nulls only the sub's columns.

**Fix.** Correct today: generalise `detachSpineJoin` to descend through joins whose condition does not read the sub's
columns, rebuilding each with its row minus the sub's columns, matched as the exact set `pfx + c` for c in
`sj.right()`'s columns (never `startsWith`); dependent grandchild joins above (e.g. `classification.exchange`) are
hoisted along, their head-side reads re-pointed as at 562-574; **delete the `nullTolerant` path** — any shape that still
cannot hoist fails loudly (NotImplemented), never wrong rows (D14, no fallbacks); delete the duplicated block either way
(text only); key prefixes by the materialization map (§2 step 5). Needs W4.3 step 6: the general flat form (an explicit
join tree where sub windows land on their own nodes).

**SQL byte identity.** Only fallback shapes change (to flat sibling joins or a loud error). How many corpus milestoning
rows ride the fallback today is **not verified**: count them before deleting it (a temporary throw, then the relational
corpus lane). Commit 790f9475a says the fallback is "count-correct for absent-sub cases", so some passing rows may depend
on it. The corpus row testMilestoningContextPropagatedThruPropertyToViewWithNonMilestonedRoot (FAILs with `2,John
Martinez` where `TDSNull` is expected) may be this class; not verified.

**Gate.** The repro → `[1|P|null|Acme]` with ClsT a top-level LEFT join whose ON reads `t0.orderDate`; sub absent (`CID
NULL`) → `[1|P|null|Acme]`; sub in window → `LATE` for an order dated 2016-02-01; two ClsT versions, one in and one out →
exactly one row; boundaries (`from_z == orderDate` included, `thru_z == orderDate` excluded); product out of window →
`[1|null|null|null]`; `orderDate NULL` → head NULL; two orders with different dates hitting different ClsT versions; the
§2 sub-hop collision model; a loud error for a shape that remains unhoistable.

---

## Registers and tests pinning the touched files

Grepped CodeShapeGuardrailTest, IdentityGuardrailTest, JavaEvalLedgerTest, ErrorShapeGuardrailTest: none pins
Substitution, TemporalFrame, Pipelines, StoreResolver, TypedFilter, SyntheticHeads, FlattenOps or StackBuilder by file or
line. The only rows naming these classes are mutable-field allowlist entries (`StoreResolver.freshVarCounter`/`temporal`,
CodeShapeGuardrailTest.java:126; `StoreResolver.serializeTypeCfg`/`checkedEnvelope`, 154, 158; `SyntheticHeads.*`,
159-172), untouched unless a fix adds fields. `ErrorShapeGuardrailTest` pins `GraphEmission.java` catches at 4 (:92);
unaffected. Tests that will move: the two pins; `ResolveTemporalContextTest` (the #81/flatten area); the relational corpus
ledger `docs/RELATIONAL_CORPUS.md` (milestoning/tests, and any nested-exists goldens); PCT exists/forAll.
