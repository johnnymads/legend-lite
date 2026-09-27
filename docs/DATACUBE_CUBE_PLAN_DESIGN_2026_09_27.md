# DataCube: pivots as two plain queries, the first piece of the cube plan (2026-09-27)

Leg A of the fix order in `DATACUBE_PRODUCTION_AUDIT_2026_09_26.md` (pass 2). The user's
decisions (2026-09-27):
- NULL pivot values get their own column;
- too many pivot values is refused with a message;
- we send a `groupBy` with conditional aggregates rather than upstream's `pivot()` + `cast`;
- the pivot values are found by a query that legend-lite plans like any other.

## What is wrong today (measured)

A cube that is both grouped and pivoted sends, per refresh:

1. **The dynamic pivot, one query per open level.** `pivot(~[year], ~[aggs])`, which DuckDB
   expands into more than one statement. A warehouse reader is refused it (FORBIDDEN): the
   reader check sees no single SELECT (D1 design, H3).
2. **A second query per level once the app has seen the first result (`#syncPivotCast`).** The
   pivot runs over a finer intermediate (the level's keys plus every carried dimension). A `cast`
   declares the columns the first result happened to have (types learned from a result), and an
   outer `groupBy` re-applies each measure's aggregate over the intermediate. That is an average
   of averages, a count of cells and a median of medians (P2-4, CRITICAL; re-run and confirmed).
   Upstream DataCube emits the same shape (`_groupByAggCols` re-applies the base column's
   aggregate over `pivot.castColumns`), so the defect was copied, not invented.
3. **A probe per child level** (`withChildPivotCast`, the pivot with `limit(0)`), to learn which
   of the cast's columns that group makes.
4. **A pivot-total query per level** (`pivotTotalQuery`), joined to the rows in JavaScript by
   group key.

The same machinery causes more of the audit:
- a stale cast after a filter change (P2-0);
- a sort on a pivot column that breaks every expansion (P2-1, P2-6);
- undo stuck on the cast re-run (P2-99);
- NULL pivot keys in the total but in no cell (P2-5);
- count and weighted average that cannot pivot (P2-7, P2-8);
- no cap on pivot columns (P2-81);
- drill that ignores the clicked pivot value (P2-128);
- settings that do not follow a pivoted column (P2-211);
- a pinned-values form that matches no overload (P2-20);
- a snap-time DISTINCT that nothing reads (P2-91).

## The design

### Step 1: the pivot values

An ordinary Pure query, planned by legend-lite and run on the cube's engine:

```
<source>-><row-stage extends>->filter(<the cube's filter>)
  ->select(~[<pivot keys>])->distinct()->sort([<each key, its direction>])->limit(MAX + 1)
```

It carries the cube's filter, so the columns are the values present in what the cube shows. It
does not carry a group's own keys, so every tree level has the same column set. NULLs are values:
a NULL key becomes its own column, labelled "(empty)", and the cells add up to the Total. More
than `MAX_PIVOT_VALUES` (500) value combinations is a `CubeRefusal` that names the key and says
to filter or pivot on something with fewer values. Nothing is silently cut off.

Pinned values (`pivotValues`, the escape hatch) replace step 1. They no longer pre-filter the
source: a group whose rows all fall outside the list keeps its Total.

The answer is `PivotFacts`: the value combinations, each value as a group-key text (the same
encoding a tree path uses, so a pivot value and a group key become a literal by the same rule).

### Step 2: one `groupBy` per level

The pivot, the Total and every carried column are aggregates of ONE `groupBy` over the level's
keys:

```
<source>-><extends>->filter(<filter and the parent's keys>)->select(~[<what is read>])
  ->groupBy(~[<level keys> or the root constant], ~[
      '2021__|__notional': x|if($x.year == 2021, |$x.notional, |[]) : y|$y->average(),
      ...one per value combination and measure...,
      '__pivot_total____|__notional': x|$x.notional : y|$y->average(), // the Total, when on
      <carried measures and dimensions on their own aggregate>
  ])->extend(<group-stage calculated columns>)->sort(...)->limit(...)
```

A pivot cell is its measure over exactly the rows of that value, so every aggregate is right,
average, count, median, standard deviation, variance and unique value included. The weighted average
wraps both arguments: `if(k, |$x.n, |[])->wavgRowMapper(if(k, |$x.w, |[]))`. The WASM planner
compiles every form into one `SELECT … GROUP BY` with `CASE WHEN` inside the aggregates (tried on
the real module before this was written). That covers:
- sum, average, count, median, sample standard deviation, unique value, joined strings and the
  weighted average;
- DATE, TIMESTAMP (with milliseconds), BIT, text keys with quotes, and a NULL key;
- two keys at once, the root constant, and a sort on a cell.

So a warehouse reader can run it, and Live, Snap and the engine page run the same SQL. Column
types come from the compiler for both steps; nothing is learned from a result.

A sort naming a column the level does not produce (a pivot value the new data lacks) is dropped
from that level, not sent. The Total is a real column, so it can be sorted on.

### Where it lives

`serialize.ts` writes both queries:
- `pivotValuesQuery(snapshot)` is step 1;
- `pivotColumns(snapshot, facts)` returns the planned pivot columns, each with its measure and
  its values, for every consumer that needs to know what a column IS.

`src/plan.ts` is the first piece of the cube plan and runs them:
- `planPivot` runs step 1 through the cube's own runner;
- `pivotFacts` reads its answer, refusing past the cap.

`serialize(snapshot, scope, facts)` requires the facts when the cube pivots: a missing one is a
programming error and throws. The controller runs step 1 once per refresh, then the levels. The
view carries the facts and the planned columns. The column model, the tool panel, the
calculated-column scope, formats and settings, drill-through and the context menu read them;
nothing parses a `2021__|__notional` name any more.

Deleted: `pivotCast` (snapshot field), `#syncPivotCast`, `forgetStaleCast`,
`withChildPivotCast`, `withPivotTotals`, `pivotTotalQuery`, the cast and the second-stage
`groupBy` in `serialize`, and the snap's pivot DISTINCT. A saved view that still carries a
`pivotCast` loads, and the field is ignored.

### Queries per refresh

| | before | after |
|---|---|---|
| grouped pivot, N open levels | 2N-3N+ | 1 + N |
| flat pivot | 2-3 | 2 |

### Saving as a DataCube specification (task #21, later)

Upstream's `DataCubeSpecification.query` is Pure text, read back by a builder that expects its
own stage order (`pivot`, `cast`, `groupBy`). When save/load lands, it writes that upstream shape
from the snapshot and the last facts (the cast columns are the planned pivot columns). The
queries this design EXECUTES are not the saved query.

### Not in this leg, recorded

**The planner continuation API** (the north star): `plan` returns "run this probe, give me its
rows" and then the final SQL. It is `exec/DynamicPivot` split across the WASM boundary, and it is
how hand-written Pure `pivot()` would run on a backend without a dynamic PIVOT. DataCube does not
need it: its pivot means more than Pure's `pivot` (a Total, carried columns, the NULL column, a
cap), so it is written as plain Pure.

## The proof, named before the code

New `//datacube:pivot_rows_test`: the real app (jsdom) over the real WASM planner and
DuckDB-WASM, on trades with several desks per region and year, a NULL year and a NULL region.
Each check compares cells with a truth query that does not pivot (`GROUP BY region, year`):

| # | check | measured before (2026-09-27) | after |
|---|---|---|---|
| R1 | grouped pivot, average: every cell | red: the second stage is refused (`sum` over a String) | green |
| R2 | grouped pivot, count and median | red (same run as R1) | green |
| R3 | an expanded group's cells (level 2) | red: `PlanError`, `sum` of a String | green |
| R4 | the NULL year has a column, and a sum's cells add up to its Total | red: `NO COLUMN` for the NULL year | green |
| R5 | the Total is the aggregate over all the group's rows, for the average | (in R1's run) | green |
| R6 | sort by a pivot cell, then expand a group | red: `unknown column '2021__|__avg_n'` (P2-1) | green |
| R7 | a filter that removes a pivot value | red (as R1) | green |
| R8 | a flat pivot (no row groups): one row, right cells, Total | red: no NULL-year column | green |
| R9 | more values than the cap: refused, with the message | red: no cap, a 600-column attempt | green |

The measured "before" was worse than predicted. With NAMED measures (`avg_n` on `notional`),
today's grouped pivot does not even run. The cast looked each measure up by its COLUMN,
missed, declared it `String`, and summed it (P2-3). The planner refused, so the average of
averages (P2-4) was hidden behind a refusal for named measures, and silent for unnamed ones.

Plus:
- `//datacube:live_snap_test` with `REFUSED_LIVE` empty (4 today);
- `//datacube:wasm_differential_test` planning both new query forms on the JVM and in WASM;
- the new form run on legend-engine from the engine page;
- a pivot live on the warehouse in the browser.

## Landed (2026-09-27)

**What changed.** The pivot is two plain queries everywhere: the tab, the warehouse and the
engine page. Deleted:
- `pivotCast`, `#syncPivotCast` and `forgetStaleCast`;
- `withChildPivotCast` (a probe per child level), `withPivotTotals` and `pivotTotalQuery`;
- the snap's pivot DISTINCT and its uncalled cell-budget and expressibility checks.

Net 321 lines fewer.

**Also fixed while there:**
- Drill-through on a pivot cell pins its value (P2-128). A key is typed (`== 2021`, not
  `== '2021'`), for the tree, the pivot and the drill alike: one rule, `keyValue`.
- Hidden, blurred, width and link settings on a measure hold for its pivot cells (P2-211).
- No value filter is offered on a pivot cell (P2-134).
- The values are ordered by the database in each key's direction (`pivotSort`), so numbers
  sort as numbers (P2-216/217).
- A configured measure excluded from the pivot is carried, not spread (P2-16).
- Pinned values no longer pre-filter (P2-20).

**The proofs:**
- `//datacube:pivot_rows_test`: R1-R9 green.
- `//datacube:live_snap_test`: `REFUSED_LIVE` is empty. Every pivot runs live as a warehouse
  reader and agrees with the snap.
- `//datacube:wasm_differential_test`: both pivot query forms planned by the JVM and in WASM.
- All 73 `//datacube` tests.
- legend-engine 4.145.0 at `127.0.0.1:6300`:
  - `verify_engine` compiles 61/61, the values queries included;
  - `verify_engine_differential` gives the same rows for 58/58, both pivot cases included.
- Chromium, the real page: a reader signs in, opens a warehouse table live, groups by region
  and pivots year from the menus.
  - The warehouse received 3 DISTINCT queries, 2 `CASE WHEN` queries and no `PIVOT`.
  - Headers `2021 | 2022 | (empty) | Total`.
  - EMEA 2021 = 60 = 10+20+30; (empty) 7; Total 167.
  - Snapped, the 18 cells are identical. No page errors.

