# DataCube TypeScript audit, pass 2: the full catalogue (2026-09-26)

Companion to `DATACUBE_PRODUCTION_AUDIT_2026_09_26.md` (read its "Pass 2" section first: the method, the themes and the fix order). Every entry here is a distinct defect, merged from one or more auditor reports, each of which survived an adversarial check (HIGH and CRITICAL: at least two of three independent refuters upheld it). "Reproduced" means a verifier ran the real product code and saw the failure. Entry numbers (`P2-n`) are stable: the themes and the fix order cite them. Read-only: nothing here has been fixed.

**417 defects**: 2 CRITICAL, 36 HIGH, 182 MEDIUM, 197 LOW; 204 reproduced by running the code.

## Index by area

| area | entries |
|---|---|
| pivot cast lifecycle | P2-0, P2-1, P2-2, P2-3 |
| pivot & aggregation query semantics | P2-4, P2-5, P2-6, P2-7, P2-8, P2-9, P2-10, P2-11, P2-12, P2-13, P2-14, P2-15, P2-16, P2-17, P2-18, P2-19, P2-20, P2-21, P2-22, P2-23, P2-24 |
| identifiers & literal escaping | P2-25, P2-26, P2-27, P2-28, P2-29, P2-30, P2-31, P2-32, P2-33, P2-34, P2-35 |
| selection & copy | P2-36, P2-37, P2-38, P2-39, P2-40, P2-41 |
| export | P2-42, P2-43, P2-44, P2-45, P2-46, P2-47, P2-48, P2-49 |
| temporal values | P2-50, P2-51, P2-52, P2-53, P2-54, P2-55, P2-56, P2-57, P2-58 |
| number formatting & precision | P2-59, P2-60, P2-61, P2-62, P2-63, P2-64, P2-65, P2-66, P2-67, P2-68, P2-69 |
| saved views | P2-70, P2-71, P2-72, P2-73, P2-74, P2-75, P2-76, P2-77, P2-78, P2-79 |
| snap & live plane | P2-80, P2-81, P2-82, P2-83, P2-84, P2-85, P2-86, P2-87, P2-88, P2-89, P2-90, P2-91, P2-92, P2-93, P2-94, P2-95, P2-96, P2-97, P2-98 |
| refresh lifecycle & rollback | P2-99, P2-100, P2-101, P2-102, P2-103, P2-104, P2-105, P2-106, P2-107, P2-108, P2-109, P2-110, P2-111, P2-112, P2-113, P2-114, P2-115, P2-116 |
| tree view & grouping | P2-117, P2-118, P2-119, P2-120, P2-121, P2-122, P2-123, P2-124, P2-125, P2-126, P2-127 |
| drill-through | P2-128, P2-129, P2-130, P2-131, P2-132, P2-133 |
| context menu | P2-134, P2-135, P2-136, P2-137, P2-138, P2-139, P2-140, P2-141, P2-142, P2-143 |
| filter editor | P2-144, P2-145, P2-146, P2-147, P2-148, P2-149, P2-150, P2-151 |
| calculated columns & JSON | P2-152, P2-153, P2-154, P2-155, P2-156, P2-157, P2-158, P2-159, P2-160, P2-161, P2-162, P2-163, P2-164, P2-165, P2-166, P2-167, P2-168 |
| properties editor & panels | P2-169, P2-170, P2-171, P2-172, P2-173, P2-174, P2-175, P2-176, P2-177, P2-178, P2-179, P2-180, P2-181, P2-182, P2-183, P2-184, P2-185, P2-186 |
| columns selector & panel | P2-187, P2-188, P2-189, P2-190, P2-191, P2-192, P2-193, P2-194, P2-195, P2-196, P2-197, P2-198, P2-199, P2-200, P2-201, P2-202, P2-203 |
| grid rendering & keyboard | P2-204, P2-205, P2-206, P2-207, P2-208, P2-209, P2-210, P2-211, P2-212, P2-213, P2-214, P2-215, P2-216, P2-217, P2-218, P2-219 |
| windows & shortcuts | P2-220, P2-221, P2-222, P2-223, P2-224, P2-225, P2-226, P2-227 |
| accessibility | P2-228, P2-229, P2-230, P2-231, P2-232, P2-233, P2-234, P2-235, P2-236 |
| styling & CSS | P2-237, P2-238, P2-239, P2-240, P2-241, P2-242, P2-243, P2-244, P2-245, P2-246, P2-247, P2-248, P2-249, P2-250, P2-251, P2-252, P2-253, P2-254 |
| charts | P2-255, P2-256, P2-257, P2-258 |
| ad hoc analysis | P2-259, P2-260, P2-261, P2-262, P2-263, P2-264, P2-265, P2-266, P2-267, P2-268, P2-269, P2-270, P2-271, P2-272, P2-273, P2-274, P2-275, P2-276, P2-277, P2-278, P2-279, P2-280, P2-281, P2-282, P2-283, P2-284, P2-285, P2-286, P2-287, P2-288, P2-289, P2-290, P2-291 |
| warehouse client | P2-292, P2-293, P2-294, P2-295, P2-296, P2-297 |
| engine plane | P2-298, P2-299, P2-300, P2-301, P2-302, P2-303, P2-304 |
| DuckDB & file ingest | P2-305, P2-306, P2-307, P2-308, P2-309, P2-310, P2-311, P2-312, P2-313, P2-314, P2-315, P2-316, P2-317, P2-318, P2-319 |
| planner & browser support | P2-320, P2-321, P2-322, P2-323, P2-324, P2-325, P2-326, P2-327 |
| demo host & boot | P2-328, P2-329, P2-330, P2-331, P2-332, P2-333, P2-334, P2-335, P2-336, P2-337, P2-338 |
| security & dev server | P2-339, P2-340, P2-341, P2-342, P2-343, P2-344, P2-345, P2-346, P2-347, P2-348 |
| build & deploy | P2-349, P2-350, P2-351, P2-352, P2-353, P2-354, P2-355, P2-356, P2-357, P2-358 |
| browser harnesses | P2-359, P2-360, P2-361, P2-362, P2-363, P2-364, P2-365, P2-366, P2-367, P2-368, P2-369, P2-370, P2-371, P2-372, P2-373, P2-374, P2-375, P2-376, P2-377, P2-378, P2-379, P2-380, P2-381, P2-382, P2-383, P2-384, P2-385, P2-386, P2-387, P2-388, P2-389, P2-390, P2-391, P2-392, P2-393, P2-394 |
| unit tests | P2-395, P2-396, P2-397, P2-398, P2-399, P2-400, P2-401, P2-402, P2-403, P2-404, P2-405, P2-406, P2-407, P2-408, P2-409, P2-410, P2-411, P2-412, P2-413 |
| late verification | P2-414, P2-415, P2-416 |

## CRITICAL (2)

### P2-4. A cube that is both grouped and pivoted shows wrong average, count, median, stdDev and variance cells, because the outer groupBy aggregates the pivot's partial results a second time

*data-semantics · pivot & aggregation query semantics · reproduced* — `src/serialize.ts:1081`, `src/serialize.ts:1082`, `src/serialize.ts:1090`, `src/serialize.ts:840-865`, `src/serialize.ts:134-135`, `src/app.ts:752-780`

Once the first result lands, #syncPivotCast (app.ts:752) re-runs the query with a cast. The outer stage then does `const base = byMeasure.get(c.measure) ?? defaultMeasure(...); outer.push(aggregateSpec({ name: c.name, column: c.name, fn: base.fn, ... }))`, which applies the measure's own function again. The pivot's rows are partials grouped by the row keys plus every carried() dimension. Re-aggregating them is only correct for sum, min and max. Scenario: rows=[region], pivot on year, notional set to Average, with 4 EMEA 2021 trades (desk d1: 10, 20, 30; d2: 100). The cell shows AVG of the per-desk averages, 60.0, where the true value is 40.0. A count shows 2 where there are 4 trades, and with no carried columns every count cell reads 1. The pivot Total comes from the unpivoted query and shows the true figure, so each row contradicts itself. wavg also breaks, because the pivot consumes its weight column. The planner and DuckDB runs reproduced all of this, and the tests only assert `->sum()`.

**Fix:** In the outer stage, re-aggregate each partial with its function's combiner: sum for sum and count, min for min, max for max. For average, wavg, median, stdDev and variance, either carry sum and count through the pivot and divide, or skip the carried-column intermediate: group by rows and pivot keys before the pivot, or fetch carried columns in a separate grouped query joined by key, as pivotTotalQuery does. Add planner-and-execute tests for these functions.

### P2-36. Copy (Ctrl+C and the menu) and the selection sum/avg/min/max read a different column from the one highlighted whenever columns are hidden, reordered, pivoted or folded into the tree

*data-semantics · selection & copy · reproduced* — `datacube/src/selection.ts:112`, `datacube/src/selection.ts:152`, `datacube/src/selection.ts:153`, `datacube/src/grid/grid.ts:1023`, `datacube/src/grid/grid.ts:1188`, `datacube/src/grid/grid.ts:1428`, `datacube/src/app.ts:1858`, `datacube/src/app.ts:1873`

A selection's column is a position in `model.leaves`: the grid sets it with `const col = cells.indexOf(cell)` (grid.ts:1023) and renders each cell from `table.columns[leaf.index]` (grid.ts:1188). But `selectionStats` reads `table.columns[c]` (selection.ts:112) and `selectionTable` does `table.columns.slice(b.left, b.right + 1)` (selection.ts:152), both on the raw result table, from grid.ts:1428 (Ctrl+C), app.ts:1858 (status-bar stats) and app.ts:1873 (Copy Selection). Leaves drop hidden columns, `__root__` and the dimensions shown in the tree, and they follow the declared order, so leaf position and result index differ in every tree grouped by two or more dimensions and in every pivot, with no user action needed. This was reproduced on the default engine cube, whose result is [__tree, desk, book, year, qtr, notional, pnl, qty] with desk hidden: selecting pnl cells holding 10 and 20 shows notional's sum 3,000,000, and Ctrl+C copies the neighbouring column. On the demo pivot, copying the `2021__|__notional` cell put the 2022 value on the clipboard. The pasted numbers and stats look plausible, and nothing warns the user. #rowsCsv (app.ts) and #columnCsv already map through `view.columns.leaves`, and the only copy test (grid-dom.test.ts) uses a layout where leaf order equals table order.

**Fix:** Translate each selected display column through `model.leaves[c].index` before reading the table. Either pass the ColumnModel into selectionStats/selectionTable, or expose a `selectedTable()` on the grid that both the grid's copySelection and the app's stats and CSV reuse. Add tests with a hidden column, a tree grouped by two dimensions, and a pivot.

## HIGH (36)

### P2-0. A learned pivot cast survives filter changes: a filter that removes a pivot value fails with a binder error and is rolled back, and clearing a filter silently drops pivot columns

*correctness · pivot cast lifecycle · reproduced* — `src/app.ts:266`, `src/app.ts:771`, `src/app.ts:1540`, `src/app.ts:2474`, `src/treeview.ts:201`, `src/serialize.ts:818`, `Lowerer.java:3296`

forgetStaleCast drops pivotCast only when the pivot columns change (`if (next.pivotOn.join('\u0000') === from.pivotOn.join('\u0000')) return next;`, app.ts:266), and #applyFilter (app.ts:2474) spreads the snapshot without calling it at all. The top-level query (treeview.ts:201-203) uses the full cast, because only child levels go through withChildPivotCast. castFits (serialize.ts:818-828) compares measures only, and Lowerer passes a cast over a dynamic pivot through unchanged. Narrowing case, reproduced with the real WASM planner and DuckDB: a cube grouped by region and pivoted by year, with cast [2021, 2022], plus "Add Filter: region = 'APAC'" (APAC has no 2021 rows) gives `Binder Error: Values list "t2" does not have a column named "2021__|__notional"`, and #refreshOr rolls the filter back. So no filter that empties a pivot value can be applied, and the default demo cube (pivot on year) hits this with `year >= 2024`. Widening case, also reproduced: a cast learned under region=='APAC' ([2022]) is kept after Clear All Filters. EMEA then shows 2022=210 with pivot total 310, the 2021 column is gone, and the status says 'ok'. #syncPivotCast re-learns from the result the cast itself narrowed, so the key comparison at app.ts:771 returns early and the column never comes back (the same happens for new pivot values in Live mode). HIGH, not CRITICAL: every value shown is correct and the pivot total exposes the gap.

**Fix:** Tie the cast to the exact pre-pivot query it was learned from. Drop pivotCast in forgetStaleCast and #applyFilter whenever the filter, source, pivotValues or measures change (for example, key it on serialize(snapshot without cast)) and let #syncPivotCast re-learn it. Or derive the level-1 cast from the same cast-less limit-0 pivot probe that withChildPivotCast already runs for child levels.

### P2-1. Sorting a pivot column in a grouped and pivoted cube makes every group expansion fail, and the cube stays stuck until the sort is cleared

*correctness · pivot cast lifecycle · reproduced* — `src/treeview.ts:273`, `src/treeview.ts:202`, `src/snapshot.ts:722`, `src/app.ts:1747`, `src/cube.ts:308`, `src/app.ts:541`

withChildPivotCast strips only the cast (`const { pivotCast, ...bare } = snapshot;` treeview.ts:273) and probes with `serialize(bare, { ...request, limit: 0 })`, so the probe still carries `sorts`. totalOrderSorts (snapshot.ts:722) keeps a pivot-leaf sort because that column is not a row dimension, and without the cast the planner cannot see the dynamic pivot's columns. Reproduced with the real planner and DuckDB-WASM: rows [region, desk], pivot on year, cast [2023, 2024]. The user sorts the '2023 / notional' header (level 1 works because it has the cast), then expands AMER, and the probe `...->pivot(~[year], ...)->sort([~'2023__|__notional'->descending(), ...])->limit(0)` is refused with "unknown column '2023__|__notional' in (region:String[0..1], desk:String[0..1])". CubeController.toggle flips the tree before refreshing and never rolls it back, so every later refresh fails the same way until the sort is cleared or the group collapsed. There is a second gap behind it: even with the probe fixed, a child whose narrowed cast lacks the sorted column would still sort on it and be refused.

**Fix:** Strip `sorts` (and groupDerived) from the probe snapshot in withChildPivotCast, since it only needs the column list. Make the child-level query drop any sort that names a pivot column its narrowed cast does not contain. Consider rolling back the tree toggle when the refresh fails.

### P2-5. Rows whose pivot key is NULL silently drop out of every pivot cell but still count in the pivot Total, so the cells never add up

*data-semantics · pivot & aggregation query semantics · reproduced* — `src/serialize.ts:1026`, `src/serialize.ts:1345-1402`

serialize.ts:1026 emits `pivot(~[${on}], ~[${aggs}])`. The planner lowers this to a native DuckDB `PIVOT ... ON "desk" USING ...` with no NULL handling, and DuckDB creates no column for a NULL key. pivotTotalQuery drops the pivot key, so the Total still includes those rows. In a reproduction through the real WASM planner, DuckDB-WASM and fetchTree, the data was AMER/Eq 10, AMER/NULL 20, APAC/NULL 30 and EMEA/Fx 40, pivoted on desk. The grand-total row showed Eq=10, Fx=40, Total=100, and APAC had every cell blank with Total=30, so 50 of notional appears in no column. With the pivot Total hidden, that 50 disappears without a trace. The native DuckDB warehouse behaves the same way.

**Fix:** Give NULL keys a bucket of their own: pivot on a coalesced key with a reserved label, or have the planner lower NULL to its own column. At minimum, detect NULL keys and warn. Add a NULL-key case to the pivot tests.

### P2-6. Sorts that name a column the pivot consumes or never selects are still emitted after the pivot, so the planner refuses a pivot or unpivot on any sorted cube

*correctness · pivot & aggregation query semantics · reproduced* — `src/serialize.ts:1167`, `src/snapshot.ts:722`, `src/app.ts:1364`, `src/serialize.ts:592`

totalOrderSorts filters with `(present.has(x.column) || !s.rows.includes(x.column)) && !apart.has(x.column)`. That removes only deeper row dimensions and child aggregates. The result is emitted with `parts.push(sortClause(sorts))` after the pivot, and nothing prunes `sorts` when pivotOn changes (#onZoneChange, the menu and the editor all leave sorts untouched). Scenario, checked with the real WASM planner: the user groups by region, clicks the notional header, then drags year into Column Labels. The query becomes `...->pivot(~[year], ~[notional:...sum()])->sort([~notional->descending(), ~region->ascending()])` and the planner refuses it with "unknown column 'notional' in (region:String[0..1])". #refreshOr then rolls the pivot back. The same failure happens for a sort on the pivot key itself, and for a sort on a pivot cell such as '2023__|__notional' after the pivot is removed. detailSnapshot and group-level calculated columns fail the same way.

**Fix:** Prune sorts to the columns the emitted stage actually produces. In the first pivot stage that is groupCols, in the second it adds carried and cast columns, and without a pivot it excludes pivot-cell names. Preferably prune the `sorts` state in the zone-change path, so the snapshot stays honest.

### P2-7. Setting count on a column in Column Properties, then pivoting a measureless cube, splits each group into one row per distinct value of that column

*correctness · pivot & aggregation query semantics · reproduced* — `src/serialize.ts:1008`, `src/serialize.ts:773-781`, `src/serialize.ts:866-873`

measureLike() puts every measure-kind column into the projection. pivotAggs then emits `aggregateSpec(defaultMeasure(name, spec, 'sum'))` with fn 'count', and that lowers to `x|1`, so no aggregate reads the column. A pivot groups by every selected column it does not aggregate, so the counted column becomes an implicit grouping key. Scenario: an uploaded or warehouse cube (measures: []), pnl set to Count, rows=[region], pivot on year. The query is `select(~[region, year, notional, pnl])->pivot(~[year], ~[notional:...sum(), pnl:x|1:y|$y->count()])`, which DuckDB runs as `PIVOT ... USING SUM(notional), COUNT(*)`. It returns 4 EMEA rows, one per distinct pnl, each with count 1 and a partial notional, where there should be one row with count 4 and notional 160.

**Fix:** Do not project a count-aggregated column in the pivot path, as referencedColumns (snapshot.ts:669) already does for configured count measures. Alternatively, make the aggregate read the column (`x|$x.col:y|$y->count()`) so the pivot consumes it.

### P2-8. A weighted-average or unique-value aggregate anywhere on the cube makes the whole cube impossible to pivot, and the planner's error message is misleading

*correctness · pivot & aggregation query semantics · reproduced* — `src/serialize.ts:990`, `src/serialize.ts:996`, `src/serialize.ts:1008`, `src/serialize.ts:136-167`, `src/ui/panel-column.ts:104-106`

pivotAggs passes the configured aggregate straight into pivot(...). It emits either `x|$x.notional->wavgRowMapper($x.w):y|$y->wavg()` or `y|$y->uniqueValueOnly()`. The real planner refuses both with "aggregate 'notional' composes multiple reducers (wavg) — PIVOT USING takes exactly one", and it says `(wavg)` even for uniqueValueOnly. Scenario: in Column Properties, set notional's Aggregation to Weighted average with weight w. Grouping still works. Then drag year to the pivot zone: every level query is refused and #refreshOr rolls the pivot back. A measureless pivot aggregates every measure-kind column, so a single wavg or unique column blocks pivoting for the whole cube. When the weight is a dimension column, the measureless projection also drops it ("relation has no column"). No wasm-differential case pivots either aggregate.

**Fix:** Lower wavg under a pivot as two pivoted sums, SUM(v*w) and SUM(w), divided afterwards. Lower unique as a COUNT(DISTINCT)/MAX pair, or have the planner rewrite PIVOT for composite reducers. Until then, refuse up front with an accurate message and add pivot cases for wavg and unique to the differential tests.

### P2-50. DATE values are written out as UTC instants, so CSV, spreadsheet, clipboard copies, the drill overlay and the cell tooltip show the previous day for users east of UTC

*data-semantics · temporal values · reproduced* — `src/duckdb.ts:203-206`, `src/export.ts:74`, `src/export-rich.ts:142-145`, `src/export-rich.ts:176`, `src/grid/grid.ts:187`, `src/grid/grid.ts:1428`, `src/app.ts:1873`, `src/app.ts:1883`, `src/app.ts:1906`, `src/app.ts:2022`, `src/app.ts:2091`, `src/app.ts:2099`, `src/app.ts:2102`, `test/export-rich.test.ts:121`

dateOnly (duckdb.ts:203-206) deliberately builds every DATE at LOCAL midnight (`new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate())`), and the warehouse plane uses the same toResultTable. Every machine-format writer then reads that Date back in UTC: export.ts:74 `if (v instanceof Date) return v.toISOString();` (CSV, Ctrl+C, the copy menu entries, the drill overlay), export-rich.ts:145 `${v.toISOString().replace(/\.\d+Z$/, '')}` under a 'Short Date' style, and grid.ts:187 `Value = ${value.toISOString()}`; the HTML export gets no formatters and prints `String(date)`. Reproduced with the real toResultTable on an Arrow Date32 of 2021-02-09 under TZ=Europe/Paris: the grid shows 'Feb 09, 2021' while the CSV cell is '2021-02-08T23:00:00.000Z' and the spreadsheet cell is '2021-02-08T23:00:00', which spreadsheet shows as 2/8/2021 (Tokyo gives ...08T15:00; New York keeps the day but gains a false 05:00). The export test builds `new Date('2026-03-01T00:00:00Z')` (UTC midnight), which the product never produces, so it cannot catch this.

**Fix:** Add one shared temporal serializer keyed by the column type. It writes a StrictDate from its local Y-M-D parts ('YYYY-MM-DD' in CSV and the clipboard, 'YYYY-MM-DDT00:00:00' in SpreadsheetML) and a DateTime as local wall-clock with a date-time NumberFormat. Use it in rawText, toSpreadsheetML and valueTitle, pass the formatters to toHtml, and add export tests that build dates the way dateOnly does and run under a non-UTC TZ.

### P2-51. A date filter does not survive Save View/Load View or the JSON export: it comes back as a UTC ISO string, so the reopened view either fails to plan or filters the previous day

*state-persistence · temporal values · reproduced* — `src/persist.ts:108`, `src/persist.ts:215`, `src/persist.ts:218`, `src/serialize.ts:116`, `src/snapshot.ts:494`, `src/ui/filter-editor.ts:275-280`, `src/ui/filter-editor.ts:690`, `src/app.ts:2191`, `src/app.ts:2213-2262`

The filter editor turns a typed date into a JS Date (filter-editor.ts:278 `new Date(Number(m[1]), Number(m[2]) - 1, ...)`), and toJson (persist.ts:108) runs a plain JSON.stringify, which writes the Date as its toISOString text. migrateSnapshot restores it without revival (`...(raw['filter'] ? { filter: raw['filter'] as NonNullable<CubeSnapshot['filter']> } : {})`; pivotValues at line 218 behaves the same), and literal() then quotes it as a Pure String (`if (typeof v === 'string') return `'${escapePure(v)}'``). Reproduced with the real modules and the WASM planner under TZ=America/New_York: `$x.d < %2024-03-01` becomes `$x.d < '2024-03-01T05:00:00.000Z'`, and range operators are refused with "no overload of 'lessThan' ... (STRICT_DATE, STRING)". Where equality passes the planner, DuckDB casts the text to a DATE, so under Asia/Tokyo a view filtered to 2021-02-09 silently returns 2021-02-08 rows. Reopening the filter editor makes it worse: its date regex has no `$` anchor, so it ignores '.000Z' and rewrites the filter as a local DateTime such as `%2024-03-01T05:00:00`, which matches no DATE row.

**Fix:** Persist temporal FilterValues in a tagged, zone-free form (for example {date:'2024-03-01'} or {dateTime:'2024-03-01T09:30:00'} built from local parts, as temporalLiteral does). Revive them in migrateSnapshot by walking the filter trees and pivotValues, and validate the filter tree on load. Anchor the filter editor's date regex with `$` and reject zone-suffixed text. Add a save/load round-trip test with a Date filter run under two TZs.

### P2-52. TIMESTAMP WITH TIME ZONE columns are modelled as zone-less TIMESTAMP, so filters, drills and date parts depend on the server's zone on Live and on DuckDB-WASM's fixed offset and ICU load state on Snap

*data-semantics · temporal values · reproduced* — `src/infer.ts:68-69`, `src/duckdb.ts:375-398`, `src/treeview.ts:113-116`, `src/serialize.ts:103-111`, `warehouse/src/main/java/com/legend/warehouse/server/duck/ArrowStreams.java:175`

infer.ts:68-69 `case 'TIMESTAMP': case 'TIMESTAMP WITH TIME ZONE': case 'TIMESTAMPTZ': return 'TIMESTAMP';` tells the planner the column is zone-less, but it stays TIMESTAMPTZ on both engines (ArrowStreams tags it UTC, and loadArrow recreates it as TIMESTAMP WITH TIME ZONE). The planner then emits zone-less literals and casts (`t0.tz < TIMESTAMP '2024-01-01T00:00:00'`, `date_part('year', t0.tz)`, `CAST(t0.tz AS DATE)`), which DuckDB resolves in the session TimeZone. The warehouse never sets TimeZone, so Live uses the server host's zone. DuckDB-WASM uses emscripten's fixed standard offset (Etc/GMT+5 all year for New York) and uses UTC until ICU is autoloaded from the network. Reproduced with the browser in New York and the server in UTC: the same Snap filter returns id 1 and then ids 1,2 in the same session once a date_part query loads ICU. A drill on a grid row shown as 'Dec 31 2023 23:30' returns 0 rows on Live and 0 or 1 rows on Snap, depending on whether ICU has loaded.

**Fix:** Pin one zone for both engines. Either keep TIMESTAMPTZ as its own kind in the model with instant literals (or have the planner emit AT TIME ZONE), or SET TimeZone to the same named zone on the warehouse connection and in DuckDB-WASM right after instantiate. Load ICU eagerly from our own origin so session history cannot change results.

### P2-59. Large DECIMAL values arrive as strings, so the chart, spreadsheet export, selection sum, heatmap and default formatting silently skip them

*data-semantics · number formatting & precision · reproduced* — `src/duckdb.ts:134`, `src/duckdb.ts:147`, `src/warehouse.ts:138`, `src/format.ts:266`, `src/format.ts:269`, `src/config.ts:548`, `src/chart.ts:47`, `src/chart.ts:83`, `src/export-rich.ts:51`, `src/export-rich.ts:139`, `src/selection.ts:120`, `src/style.ts:116`, `src/style.ts:292`, `src/style.ts:348`

decimalToScalar checks the UNSCALED integer against the safe-integer range (`const safe = unscaled >= BigInt(Number.MIN_SAFE_INTEGER) && unscaled <= BigInt(Number.MAX_SAFE_INTEGER); ... return safe ? Number(text) : text;`). So a DECIMAL(38,6) value above about 9.0e9 becomes a string, and a DECIMAL(38,18) value above about 0.009 does too. DuckDB widens SUM(DECIMAL(p,s)) to DECIMAL(38,s), and the Live warehouse path uses the same toResultTable. Every numeric consumer accepts only `typeof v === 'number'`: chart isNumeric, export-rich isNumber, the selection sum, valueState and the heatmap. The default 'auto' format sends strings to `applyCase(String(value))`. Reproduced on real duckdb-wasm: sum(notional DECIMAL(18,6)) gave [12.5, '10000000000.250000']. The chart showed only the APAC bar (the largest group was dropped with no note), SpreadsheetML wrote `<Data ss:Type="String">10000000000.250000</Data>`, which spreadsheet's SUM ignores, and the selection sum over both cells read 12.5. In the grid the cell appears ungrouped with six decimals, and a negative one gets no parentheses or red colour.

**Fix:** Stop replacing numeric values with bare strings. Either return a number whenever the scaled value round-trips exactly (see the 16-digit precision entry, which shares this function), or carry large values as a typed numeric wrapper or flagged exact text. The formatter's auto path, valueState, the heatmap, the selection stats, the chart and the exporters must then all treat it as a number (Number() for geometry and sums, the exact text for display and for ss:Type="Number" export). Add consumer-level tests with a value above 2^53 unscaled.

### P2-70. A saved view keeps only the query shape: Load View never reads the saved column formats and order, and hidden columns, display names, widths, appearance and title are never saved at all

*state-persistence · saved views · reproduced* — `src/app.ts:2213`, `src/app.ts:2223`, `src/app.ts:2248`, `src/persist.ts:27`, `src/persist.ts:47`, `src/config.ts:628`

saveView writes `columns: { order: this.#config.columnOrder, formats: toFormats(this.#config) }`, but loadView uses only `view.snapshot` and `treeOf(view)` (`this.#config = fromSnapshot(view.snapshot, this.#config)`), and nothing in src/ or demo/ reads `view.columns`. The ColumnSettings `hidden` and `widths` fields are never written, and the rest of CubeConfiguration (displayName, pinned, appearance, heatmap, reportTitle, showRootAggregation) is never saved. Reproduced with two real CubeApps sharing one storage: app A sets a GBP currency format on `total` (or 0 decimals, hidden, renamed 'Notional USD') and saves; the stored JSON has the format; a fresh app B runs Load View, gets 'loaded "mine"', and `configuration.columns.total.format` is undefined. The app test passes only because it loads into the same app whose config still holds the settings. Because the slot is single, the next Save View after such a load overwrites the stored formats with the defaults.

**Fix:** Persist the whole CubeConfiguration (or its non-default part, or upstream's DataCubeSpecification configuration) in the saved view and restore it on load before the refresh; until then at least fold view.columns.order/formats back into the config. Delete or wire the unused ColumnSettings fields. Add a test that saves in one app and loads in a fresh one.

### P2-71. persist.load rebuilds the snapshot from an allow-list, so tree sort, pivot-total aggregates, leaf/child counts and kept grouped columns silently revert on load (the Total column can show SUM where AVERAGE was saved)

*state-persistence · saved views · reproduced* — `src/persist.ts:181`, `src/persist.ts:200`, `src/persist.ts:13`, `src/config.ts:600`, `src/config.ts:628`

migrateSnapshot returns `{ source: { expression }, columns, derived, ...groupDerived, ...filter, rows, pivotOn, ...pivotValues, measures, sorts, ...window, ...maxRows, epoch: 0 }` and drops every other CubeSnapshot field that applyToSnapshot writes: `treeColumnSort`, `pivotTotal` (with per-measure `functions`), `leafCount`, `childCount`, `keepGroupedColumns`, `pivotCast`. KNOWN_KEYS/unknown preserves only top-level keys, so the header's 'Unknown fields are PRESERVED, not dropped' rule does not hold where the settings live. Reproduced: a user sets tree sort desc and Pivot Total aggregation = average for pnl, saves, reloads and loads; `load(toJson(save(x)))` has neither field, fromSnapshot keeps the page defaults, and the Total column shows SUMs under the same 'Total' header with the tree order flipped and no warning. The persist round-trip test's SNAPSHOT has none of these fields.

**Fix:** Carry every snapshot field through migrateSnapshot (spread the raw snapshot, then normalise the known fields), or preserve unrecognised snapshot keys as top-level keys are preserved. Add a test that `load(toJson(save(app.snapshot)))` deep-equals a real app snapshot.

### P2-72. Load View merges the saved snapshot onto the CURRENT session's configuration, so the session's aggregates, column kinds and row limit override what the view saved

*correctness · saved views · reproduced* — `src/app.ts:2248`, `src/config.ts:628`, `src/config.ts:632`, `src/app.ts:693`, `test/app.test.ts:646`

loadView runs `this.#config = fromSnapshot(view.snapshot, this.#config)`. fromSnapshot only adds: `const limit = snapshot.maxRows ?? base.maxRows;`, `treeColumnSort: snapshot.treeColumnSort ?? base.treeColumnSort`, and a column patch only when non-empty (aggregateBack returns `{}` when the saved spec carries no aggregate). #refresh then applies applyToSnapshot, which strips the loaded aggregates and re-applies the config's. Reproduced: a view saved with pnl on its default SUM and no row limit, loaded into a session where pnl is Aggregation = average, Kind = dimension and Row Limit = 50, runs as `{name:'pnl', kind:'dimension', aggregate:'average'}` with maxRows 50, and the status says 'loaded'. test/app.test.ts:646 asserts `maxRows === 123` after loading, but 123 is still in this.#config, so it passes either way.

**Fix:** Build the loaded configuration from a clean base (DEFAULT_CONFIGURATION or the host's initial configuration), not this.#config; better, persist the configuration in the view and restore from it. Make the test move maxRows away before loading.

### P2-80. The snap table's source leaks into the app's own snapshot, so after Snap, any edit, then Live, every query reads the dropped snap table and the cube stays broken until reload. Saved views also record the snap table.

*state-persistence · snap & live plane · reproduced* — `src/cube.ts:367`, `src/cube.ts:371`, `src/cube.ts:385`, `src/cube.ts:438`, `src/app.ts:949`, `src/app.ts:702`, `src/app.ts:2197`, `src/app.ts:2221`, `src/app.ts:2927`, `src/snap.ts:184`, `src/snap.ts:294`, `src/snap.ts:296`, `demo/boot.ts:194`, `demo/boot.ts:409`

refresh() rewrites the source for execution with `const source = this.#snaps.sourceFor(snapshot.source.expression); const withEpoch = { ...snapshot, epoch, source: { ...snapshot.source, expression: source } }` and returns it as `view.snapshot` (cube.ts:385/438). #onView then adopts it with `this.#snapshot = view.snapshot` (app.ts:949), and the next edit sends it back through `controller.update` (app.ts:702). release() sets live mode and runs `DROP TABLE IF EXISTS`, but `sourceFor` returns its argument unchanged when live, and that argument is now `#>{trades::DB.TRADES_SNAP}#`. Scenario, reproduced with the real CubeController, WasmPlanner and DuckDB-WASM on index.html/index-server.html: Snap, group by region, then Live. The badge reads Live, but every query fails with 'Table with name TRADES_SNAP does not exist'. Re-snapping also fails because it reads FROM TRADES_SNAP. #refreshOr rolls back to a snapshot that names the same table. Save View (app.ts:2221), the spec export (app.ts:2197) and undo history made while snapped all persist the snap source. The warehouse page is unaffected because its snap target expression equals the live source (boot.ts:661); the finding that limited the bug to cubes with no snapTarget had the scope wrong.

**Fix:** Keep the plane substitution internal to the query. CubeView should carry the caller's logical snapshot (new epoch, live source), and sourceFor should apply only to what is planned and run. Add an app-level test that feeds view.snapshot back through update() before release() and before a save.

### P2-81. Nothing limits how many columns a pivot makes, so dragging a high-cardinality dimension to Columns freezes the tab for many seconds

*performance-memory · snap & live plane · reproduced* — `src/snap.ts:60`, `src/snap.ts:327`, `src/app.ts:1364`, `src/grid.ts:439`, `src/treeview.ts:585`, `src/viewport.ts:8`, `src/snapshot.ts:522`

`checkCellBudget(groupCount, pivotColumnCount)` and `MAX_PIVOT_CELLS = 1_000_000` exist, but only test/snap.test.ts calls them; nothing in src/ or demo/ does. No other pivot-width cap exists, and the grid renders every pivot leaf because column windowing was dropped (viewport.ts, snapshot.ts:522). #fit then measures every `[data-column]` element (grid.ts:439-453), and assemble() does a `columns.find` per cell (treeview.ts:585). Reproduced on the built demo with a 300k-row CSV: `book` (501 values) on Row Groups and `trader` (2,003 values) on Columns gave 6,013 columns and 541,170 DOM cells. It took 17.3 s from drop to paint (the query took 536 ms), and one scroll step then took 4.7 s. This applies in both Live and Snap.

**Fix:** Before running a pivot, count the pivot key's distinct values and refuse above a column/cell budget, or ask the user to confirm (wire the existing checkCellBudget into the refresh path for both planes). Separately, window the grid's columns or cap the rendered leaves, and index the columns in assemble().

### P2-82. Live mode on the warehouse refuses every column pivot with FORBIDDEN, and the user sees a raw execution error

*correctness · snap & live plane* — `test/live-snap/live-snap.ts:48`, `demo/boot.ts:660`, `src/cube.ts:192`, `src/cube.ts:211`, `docs/WAREHOUSE_D1_DESIGN_2026_09_26.md:35`

The test pins the refusal as expected: `const REFUSED_LIVE = ['pivot', 'pivot-two-measures', 'tree-detail-pivot', 'window-row-under-pivot'];` with `assert.match(l.refused, /FORBIDDEN/ ...)`. The D1 design doc gives the cause: the dynamic PIVOT expands into more than one statement, so the server's reader check cannot see a single SELECT. The shipped page wires `live: new WarehouseEngine(session)` (boot.ts:660), and every unsnapped query goes through that runner (cube.ts:192-212). A grep of src/ finds no FORBIDDEN or pivot-specific handling. Scenario: a reader signs in, opens a table live and drags `year` to Column Labels. Every level query and the detail rows under the pivot come back FORBIDDEN as a raw error, so pivoting only works after Snap.

**Fix:** Emit the static two-query pivot on the Live plane: SELECT DISTINCT for the values, then PIVOT ... ON col IN (values) as one SELECT, as measured in the D1 doc. Until that exists, refuse the pivot gesture up front in Live mode with a message that says to Snap first.

### P2-99. Undo gets stuck on a grouped and pivoted cube: the automatic cast re-run records its own undo step, so Undo lands on it and re-runs forward

*state-persistence · refresh lifecycle & rollback · reproduced* — `src/app.ts:779`, `src/app.ts:2709`, `src/app.ts:702`, `src/cube.ts:348`, `src/cube.ts:452`

After a grouped and pivoted query lands, #onView calls #syncPivotCast, which sets `this.#snapshot = { ...snapshot, pivotCast: cast }` and calls `this.#refreshOr(snapshot)`. That goes through #refresh to `this.#controller.update(...)`, and update() runs `this.#remember()`, so the intermediate state without the cast is recorded as a user step. After an Undo that state renders, #syncPivotCast fires again, records again and clears the redo stack. Reproduced with the real planner and DuckDB: a freshly opened cube with rows [region] and pivotOn [year] already reports canUndo=true with past depth 1, and Undo does nothing. After 'Horizontal Pivot on qtr', three Undos in a row all leave pivotOn=['qtr'] with past depth 3 and future depth 0. #syncCalcTypes uses the same path.

**Fix:** Run learned-fact follow-up queries (pivot cast, calculated-column types) through a controller method that replaces the current snapshot and refreshes without calling #remember, the way refresh() already works for snap and retry.

### P2-128. Drill-through ignores the clicked column: on a pivoted cube, a cell's drill lists the rows for every pivot value, not the rows behind that cell

*data-semantics · drill-through · reproduced* — `datacube/src/app.ts:544`, `datacube/src/app.ts:2010`, `datacube/src/grid/grid.ts:1353`, `datacube/src/drill.ts:61`, `datacube/src/drill.ts:108`, `datacube/src/drill.ts:9`

The grid passes both row and column (grid.ts:1353 `this.#options.onActivateCell?.(row, col)`), but CubeApp throws the column away (app.ts:544 `onActivateCell: (row) => { void this.#drillThrough(row); }`). #drillThrough then builds `drillQuery(view.snapshot, { path: meta.path })` with no `pivotPath`. drillConditions (drill.ts:61-64) pins pivot columns only from `request.pivotPath`, and `pivotPathOf` (drill.ts:108) is called only from test/drill.test.ts. Reproduced with the real drill.ts on rows=['region'], pivotOn=['year']: pressing Enter on the EMEA / 2023 cell runs `#>{db.trades}#->filter(x|$x.region == 'EMEA')->limit(500)` with no year condition. The overlay lists EMEA trades from every year as the rows behind the 2023 figure, and nothing warns the user. This breaks the promise in drill.ts's header ("plus the clicked column's pivot value ... provably the same population"). Ad Hoc mode (adhoc/mode.ts:87) does use the column. Two auditors rated this MEDIUM because the grid's numbers stay correct and the overlay is a capped peek. HIGH stands, because the feature exists to audit a number and here it silently shows the wrong population on any pivoted cube.

**Fix:** Take the column in onActivateCell and pass it to #drillThrough. Resolve the leaf from `view.columns.leaves[col]`; for a pivot leaf, set `pivotPath: pivotPathOf(leaf.path, measureNames)` on the DrillRequest. For pivot-total and non-drillable leaves, refuse with a message or say what was pinned. Add an app-level test that activates a pivot cell and asserts the Pure that was sent.

### P2-144. The Filters window stays open with an old copy of the filter, and its Apply/OK overwrites any filter change made elsewhere since it opened

*correctness · filter editor · reproduced* — `datacube/src/ui/filter-editor.ts:763-771`, `datacube/src/ui/filter-editor.ts:906-919`, `datacube/src/ui/filter-editor.ts:20-22`, `datacube/src/app.ts:2444`, `datacube/src/app.ts:2472-2476`, `datacube/src/app.ts:2489`, `datacube/src/app.ts:2740-2743`, `datacube/src/ui/menu.ts:820-837`

The editor reads the filter into `#tree` and `#applied = JSON.stringify(this.filter ?? null)` only once, in its constructor. apply() then publishes the whole draft, and `#applyFilter` replaces the cube filter outright: `this.#snapshot = filter ? { ...this.#snapshot, filter } : ...`. The window is non-modal, and reopening it only brings the existing window to the front (`if (open && !options.replace) { this.#raise(open); return open; }`), so nothing re-reads the filter after a change. Scenario: with Filters open on `region = EMEA`, the user runs grid menu "Add Filter: desk = 'Rates'", and the cube filter becomes AND(region, desk). The user then changes EMEA to APAC in the window and clicks OK. The filter becomes `region == 'APAC'`: the desk condition is dropped without any message. Undo, Clear All and loading a view while the window is open fail the same way.

**Fix:** Re-read the filter into the open Filters window whenever the cube filter changes: either rebuild it with #showOverlay(..., {replace: true}) or add a setValue that resets #tree and #applied. Alternatively, merge only the editor's own edits onto the current filter, as #applyDraft does for Properties.

### P2-145. Every edit rebuilds the whole filter editor, so the first click on OK/Apply after typing a value is lost and keyboard focus jumps to <body>

*correctness · filter editor · reproduced* — `datacube/src/ui/filter-editor.ts:787-791`, `datacube/src/ui/filter-editor.ts:853`, `datacube/src/ui/filter-editor.ts:923-928`, `datacube/src/ui/filter-editor.ts:960-977`, `datacube/src/ui/filter-editor.ts:1130`, `datacube/src/ui/filter-editor.ts:1156-1162`, `datacube/src/ui/filter-editor.ts:1164`, `datacube/src/ui/filter-editor.ts:1395-1413`

Text fields save their value only on 'change' (`input.addEventListener('change', () => onChange(input.value))`), and number fields save on 'blur'. Both go through update() and the `tree` setter to render(), which runs `this.#root.replaceChildren()` and builds new body and footer controls, including new OK and Apply buttons. Nothing restores focus afterwards. change and blur fire on mousedown, so the button that received the mousedown is gone before mouseup and its 'click' handler never runs. Reproduced against the real file in Chromium: type APAC over EMEA and click OK once, and the result is applied=[], closed=0. Apply loses its first click the same way, with no feedback. Keyboard users are also affected: pressing Tab after an edit leaves document.activeElement at BODY, and a second ArrowUp in a number field is lost (5 goes to 6, not 7), because the first ArrowUp re-rendered and removed the focused field.

**Fix:** Keep the DOM stable across edits: update only the row that changed, and render the footer once outside the re-rendered body. At minimum, record the focused control (node id plus control role) before render() and focus its replacement afterwards, and have OK/Apply read any unsaved input before re-rendering.

### P2-187. Dimensions editor: renaming a dimension or clicking Add after editing its hierarchy discards the hierarchy edits

*correctness · columns selector & panel · reproduced* — `datacube/src/ui/panel-dimensions.ts:50`, `datacube/src/ui/panel-dimensions.ts:100`, `datacube/src/ui/panel-dimensions.ts:143`, `datacube/src/ui/panel-dimensions.ts:163`, `datacube/src/ui/editor.ts:199`, `datacube/src/ui/columns-selector.ts:188`

`const dimensions = draft.dimensions;` is captured once per render. The hierarchy selector writes the draft with `ctx.setDimensions(dimensions.map(... { ...d, columns: [...columns] } ...))` and does not refresh, so the panel's closure keeps the stale array. Rename then rebuilds from that array (`dimensions.map((d, i) => i === cursor.index ? { ...d, name } : d)`), and Add does the same (`[...dimensions, { name: freshName(dimensions), columns: [] }]`). Reproduced in jsdom with a real CubeEditor: starting from [{Geography, []}], double-clicking region and country gives [{Geography,[region,country]}], and renaming it to 'Geo' gives [{Geo,[]}]. Adding city and then clicking Add gives [{Geo,[]},{Dimension 1,[]}]. If the user presses OK without noticing, the empty hierarchy is saved. The count badge also stays stale while columns are edited, and the existing test (editor.test.ts:485) never covers edit-then-rename.

**Fix:** Read `ctx.draft().dimensions` inside every handler (Add, Delete, rename, selector onChange) rather than the render-time capture, or call `ctx.refresh()` after a selector change. Add a test that edits columns and then renames or adds.

### P2-204. After a cell is clicked, wheel or trackpad scrolling keeps snapping back to that cell

*accessibility · grid rendering & keyboard · reproduced* — `src/grid/grid.ts:1286`, `src/grid/grid.ts:1290`, `src/grid/grid.ts:1396`, `src/grid/grid.ts:1082`, `src/grid/viewport.ts:89`

#render keeps focus across a rebuild with `const hadFocus = doc.activeElement !== null && this.#root.contains(doc.activeElement); this.#body.replaceChildren(frag); ... if (hadFocus) this.#focusCell();`, and #focusCell calls `el?.focus()` with no `preventScroll`. The scroll path (#onScroll -> rAF -> #render) rebuilds the body at every row boundary (see the isCovered entry), so every scroll frame re-focuses the new element for the clicked cell, and the browser scrolls it back into view. Reproduced in the shipped demo page (Playwright/Chromium, 2,000-row CSV, the default Row Buffer of 50): with no cell clicked, 10 and 30 wheel ticks of 100px reach scrollTop 1000 and 3000. After clicking a cell in row 5 or 6, the same input stops at 100 and 300, and with 60px steps scrollTop cycles 60, 0, 60, 120, 0, ... So after any click, a mouse user cannot wheel more than about one screen away from that cell.

**Fix:** Restore focus inside #render with `el.focus({ preventScroll: true })`, and only when the focused cell was actually replaced and is still in view. Scroll only from the keyboard path, which already calls #scrollFocusIntoView.

### P2-220. Every title-bar rebuild adds another document keydown listener, so one Ctrl-Z/Ctrl-Y undoes or redoes several steps, and dispose() leaves the extra listeners driving a dead cube

*correctness · windows & shortcuts · reproduced* — `src/app.ts:3035`, `src/app.ts:3062`, `src/app.ts:607`, `src/app.ts:1182`, `src/app.ts:1195`, `src/app.ts:2249`, `src/app.ts:2529`, `src/app.ts:2537`, `src/app.ts:2271`

#buildToolbar() ends with `this.#onDocKey = (event) => {...}; this.#doc.addEventListener('keydown', this.#onDocKey);` and never removes the previous closure; the only removeEventListener is in dispose() (2271), which removes just the latest one. #buildToolbar runs from the constructor (607) and from every #renderChrome (1195), which is reached from #setChrome (zone/title-bar fold and unfold, the Show/Hide menu entries), loadView (2249) and every Properties Apply or rollback (2529/2537). Reproduced on jsdom with the real CubeApp: after 4 undoable changes and one zone fold/unfold, a single Ctrl-Z moved history from {past:4,future:0} to {past:1,future:3}; in Ad Hoc mode one Ctrl-Z called AdHocMode.undo() 4 times. After dispose() and a rebuild in the same element (boot.ts does this on every file or table open), the old cube still answered Ctrl-Z and one Ctrl-E opened two Properties windows, one bound to the disposed controller, which also stays pinned in memory.

**Fix:** Register the document keydown listener once, in the constructor, outside the rebuildable #buildToolbar (or remove the previous #onDocKey before adding a new one), so dispose() removes the only one. Add a test that rebuilds the chrome (fold/unfold, Apply, loadView), presses Ctrl-Z once and asserts historyDepth moves by exactly one, and that no shortcut fires after dispose().

### P2-237. All pinned and row-label columns stick at left:0 (or right:0) with no offsets, so after a horizontal scroll they stack on top of each other and a pinned column covers the row labels

*correctness · styling & CSS · reproduced* — `src/grid/grid.css:222`, `src/grid/grid.css:492`, `src/grid/grid.css:500`, `src/grid/grid.css:514`, `src/grid/grid.css:522`, `src/grid/grid.ts:633`, `src/grid/grid.ts:1174`, `src/grid/columns.ts:343`, `src/grid/columns.ts:554`, `src/adhoc/mode.ts:165`, `src/adhoc/query.ts:294`, `src/theme.css:98`, `demo/verify-features.mjs:1489`

grid.css:492-505 gives every `.dc-cell.dc-pin-left, .dc-cell.dc-dim` `position: sticky; left: 0` (right:0 for pin-right), and the header rules at :514-527 do the same. grid.ts only adds the classes and never sets a per-column left/right offset, and columns.ts:554-561 does not move pinned columns to the edge. In Ad Hoc Analysis each row dimension becomes its own dc-dim column (mode.ts:165-167, columns.ts:343). So with rows Region x Product and a wide column axis, scrolling right parks both label columns at x=0 and Product hides Region. Pinning a measure in a grouped cube covers the tree column once scrolled. Three verifiers reproduced this in Chromium with the real CSS: at scrollLeft=1200, elementFromPoint returns the pinned measure over both label columns. The only test (verify-features.mjs:1489-1512) checks just that the first pinned cell stays put.

**Fix:** Put pinned-left columns first and pinned-right columns last in the column model. Give each sticky cell and header its cumulative offset (the sum of the widths of the sticky columns before it) through an inline style or a per-column custom property, and draw the separator that the unused --dc-pinned-separator token was defined for.

### P2-255. Plot and Treemap chart every displayed tree row, so subtotals (and the grand total) are drawn beside their own children and treemap areas are double-counted

*data-semantics · charts · reproduced* — `src/app.ts:2052-2058`, `src/chart.ts:79-86`, `src/chart.ts:304-306`, `src/tree.ts:259-305`, `src/treeview.ts:243`, `src/cube.ts:393`, `test/chart.test.ts:44-55`

#chart passes the assembled tree table straight in, `toBarChart(view.rows, { title })` / `toTreemap(view.rows, { title })`, and chartData keeps every numeric row (`for (let r = 0; r < table.rowCount && out.length < limit; r++) { ... out.push({ label, value: v }) }`) with no check of level, isTotal or isDetail. flattenTree puts each expanded group row (its subtotal) right before its children, and also adds the level-0 Total row when showRootAggregation is on. That toggle is off by default, but the expanded-parent double count happens with the default config. Reproduced against the real chart.ts: with EMEA=100 expanded into Equities 60 and Rates 40, and AMER=100, the treemap gives EMEA+children 66.7% of the area and AMER 33.3%, though both regions are 100. With Total shown, the Total tile takes 50% of the area and its bar dwarfs every other bar. The only tree-column test uses ['EMEA','AMER'], with no expanded group and no Total row.

**Fix:** Chart a single level. Use the tree metadata the view already carries (view.treeRows: level, isTotal, isDetail) to pass #chart a filtered row set: the deepest visible leaves or one chosen level, and never the level-0 total or an expanded subtotal. Add a chart test over a real assemble() output with an expanded group and the Total row.

### P2-256. Plot and Treemap plot the first numeric column in raw result order, which can be a hidden column, a year/key column or one pivot slice, and never say which measure they drew

*correctness · charts · reproduced* — `src/chart.ts:66-75`, `src/app.ts:2052-2058`, `src/chart.ts:103-113`, `src/grid/columns.ts:118`, `src/grid/columns.ts:351-375`

chartData chooses `valueCol = byName(options.valueColumn) ?? table.columns.find((c) => c.name !== labelCol?.name && c.values.some(isNumeric))`, and #chart passes only `{ title }`, so the user cannot pick a column. view.rows still carries hidden columns, because hiding is display-only. The SVG has no axis title or legend naming the measure. Reproduced on the flat demo cube [region, desk, book, year, qtr, notional, ...]: the bars are the year values (`[{label:'EMEA', value:2021}, ...]`) and not notional, and hiding `year` does not change that. On a cube pivoted by year, only the `2022__|__notional` slice is plotted. On a flat [year, revenue] result with no string column, the years are plotted as values with blank labels.

**Fix:** Take the value column from the visible leaves (view.columns.leaves) in display order, skipping hidden, dimension, pivot-total and machinery columns, or let the menu entry pass the right-clicked column. Print the chosen measure's display name in the chart title or on the axis. Only fall back to a label column that is a real dimension.

### P2-259. A failed Ad Hoc step is still committed to the session, so the screen and the session disagree, and retrying the step paints the old numbers under the new POV

*error-handling · ad hoc analysis · reproduced* — `src/adhoc/session.ts:105`, `src/adhoc/session.ts:107`, `src/adhoc/session.ts:111`, `src/adhoc/session.ts:120`, `src/adhoc/mode.ts:154`, `src/adhoc/state.ts:172`, `src/adhoc/state.ts:277`

apply() runs `this.#past = [...this.#past, this.#grid]...; this.#future = []; this.#grid = next;` before `this.refresh()`, and nothing rolls this back when the query throws. undo() and redo() move the stacks the same way. mode.#run's catch only calls `reportFailure(error)` and skips #paintPov, although its doc says a failure 'leaves the grid on the last answer'. CubeController.#applyHistory does the opposite and commits all or nothing. Scenario (reproduced in jsdom with the real mode and session): the grid shows region=all with Time 75. The user picks EMEA on the region chip and the query fails. The chip still says 'region', but session.grid.pov is {region:['EMEA']}. The user retries the same pick: setPov returns the same grid (`if (now === undefined || same(now, member)) return grid;`), apply returns the old view without a query, and #paintPov now labels the old all-region 75 as EMEA. A failed Keep Only also turns later gestures on members the user can still see (Zoom In, Remove Only) into silent no-ops (state.ts:172 `at < 0` returns the same grid).

**Fix:** Commit a step only once its answer lands: in apply/undo/redo, snapshot #grid, #past and #future and restore them when refresh() throws while it is still the latest seq, as CubeController.#applyHistory does. Also repaint the POV bar in mode.#run's catch, and add session and mode tests with a Run that rejects.

### P2-260. Changing an Ad Hoc option re-places old answers on a grid whose POV or members have changed, so stale numbers appear under the new POV with no query and no marker

*data-semantics · ad hoc analysis · reproduced* — `src/adhoc/session.ts:193`, `src/adhoc/session.ts:198`, `src/adhoc/mode.ts:175`, `src/adhoc/mode.ts:493`

setOptions does `if (!this.#last) return this.refresh(); this.#view = assembleGrid(this.cube, next, this.#last.results, this.#last.queries);`, but #last holds answers to an earlier grid. assembleGrid finds cells by shape key and member values only, and the POV is not part of that key. Scenario (reproduced): zoom Time (75/35/40), turn on Navigate Without Data, set POV region=EMEA (no query, by design), then turn Navigate Without Data off. No query runs, and the grid shows 75/35/40 under an 'EMEA' chip; the correct values are 30/30 with 2022 suppressed. The ' (not refreshed)' suffix disappears because the option is now off. If the user zoomed while navigating instead, the new shapes have no answers and are suppressed, so the zoom looks as if it returned nothing.

**Fix:** Re-place #last only when it answered a grid equal to `next` apart from its display options (store the grid #last answered and compare axes, members and POV, or compare planQueries(cube, next) keys with #last.queries). Otherwise, and always when navigateWithoutData goes from on to off, call refresh(). Add a session test for navigating without data.

### P2-274. Ad Hoc Analysis sums every measure and ignores the aggregation set in Column Properties (avg, wavg, max...), so its figures differ from the cube's

*data-semantics · ad hoc analysis · reproduced* — `src/adhoc/outline.ts:55`, `src/serialize.ts:666`

buildCube: `snapshot.measures.length > 0 ? [...snapshot.measures] : columns.filter((c) => c.kind === 'measure').map((c) => ({ name: c.name, column: c.name, fn: 'sum' as const }))`. The cube's serializer uses `fn: spec?.aggregate ?? fallback` plus aggregateWeight (serialize.ts defaultMeasure). The no-explicit-measures case applies to every uploaded file. Scenario (reproduced): `price` has aggregate 'avg' and `qty` has 'wavg' weighted by price. The main grid emits `price:...->avg()` and `qty:...->wavg()`, but Ad Hoc plans `sum` for both, so an average price is shown as the sum of prices with no warning.

**Fix:** Build each default measure as defaultMeasure does, with `fn: c.aggregate ?? 'sum'` and `weight: c.aggregateWeight` when set. rowColumns drops those two fields, so read them from snapshot.columns and snapshot.derived. Add an ad hoc test with a non-sum column aggregate.

### P2-286. Ad Hoc queries skip the Snap source rewrite, so Ad Hoc reads live rows under a 'Snapped' badge, or fails on a dropped snap table after Live

*data-semantics · ad hoc analysis · reproduced* — `src/cube.ts:638`, `src/cube.ts:240`, `src/cube.ts:367`, `src/app.ts:2296`, `src/app.ts:2300`, `src/app.ts:2919`

controller.query does `const { rows } = await this.#runner.run(pure, snapshot, scope, signal);` with no `this.#snaps.sourceFor(...)`, unlike refresh (cube.ts:367) and compile (cube.ts:240). enterAdHoc freezes the source once through `carryOver(this.#snapshot, ...)`. The Snap/Live toggle stays usable in Ad Hoc mode, and snap()/release() refresh only the hidden cube. Reproduced: (A) enter Ad Hoc while Live, press Snap, then change the live source; the snapped cube total stays 24,847,025 while Ad Hoc returns 25,847,025, so Ad Hoc shows moving data under a 'Snapped' badge. (B) Snap, enter Ad Hoc (source `#>{trades::DB.TRADES_SNAP}#`), press Live; release drops TRADES_SNAP, and every Ad Hoc refresh or zoom fails with 'Table with name TRADES_SNAP does not exist!' until the user exits.

**Fix:** Apply `this.#snaps.sourceFor(...)` in query() and runQuery() as refresh and compile do, keep the live source (not the snap one) in the session, and refresh Ad Hoc mode when a snap or release completes.

### P2-287. The cube's Filter button stays on screen under the Ad Hoc grid and shows 'Filter (on)', but the Ad Hoc numbers ignore the filter, even after Refresh

*data-semantics · ad hoc analysis · reproduced* — `src/app.ts:1059`, `src/app.ts:2296`, `src/app.ts:2319`, `src/app.ts:2472`

enterAdHoc hides only the cube grid and the zone bar. `.dc-app-stats` stays visible (there is no CSS rule for dc-adhoc-on), and #renderStatusBar keeps '⧨ Filter' wired to openFilters and labels it `filtered ? '⧨ Filter (on)'` from this.#snapshot.filter. #applyFilter changes only the cube snapshot, while the session's cube was frozen at entry and AdHocSession.refresh re-plans from `this.cube`. Reproduced: with Geography showing 350 / AMER 50 / EMEA 300, apply region == EMEA from that button; the bar reads 'Filter (on)', and Ad Hoc still shows 350, even after Refresh, which queries with no filter. With a filter on a column that is not on the Ad Hoc grid, the unfiltered totals look plausible under a bar that says a filter is on.

**Fix:** Hide or disable the cube's status-bar actions (Filter, Properties) and its readout while Ad Hoc is on. Or, if a cube filter should apply, rebuild the session's cube from the new snapshot and refresh the mode.

### P2-298. Engine plane passes date cells through as strings, so outside UTC, expanding or drilling into a date group queries the wrong day, and the 'Date' format shows the previous day

*data-semantics · engine plane · reproduced* — `src/engine-remote.ts:138`, `src/treeview.ts:107`, `src/serialize.ts:103`, `src/serialize.ts:519`, `src/serialize.ts:525`, `src/format.ts:276`

toResultTable copies legend-engine's JSON cells as they arrive (`values[r] = (rows[r]?.values?.[i] ?? null) as Scalar;`) but still labels the column 'StrictDate' or 'DateTime'. legend-engine writes a DATE as "yyyy-MM-dd". groupValue only reformats `instanceof Date`, so the string becomes the path key unchanged. keyValue then runs `const at = new Date(value)`, which reads a date-only ISO string as UTC midnight, and temporalLiteral writes it back with local getters. Reproduced: an engine cell "2021-02-09" produces the child filter `$x.d == %2021-02-08T19:00:00` in America/New_York and `%2021-02-09T09:00:00` in Asia/Tokyo. Only UTC gives `%2021-02-09`, so expanding the group, drilling through (detailSnapshot) or building Ad Hoc memberConditions silently returns no rows or another day's rows. The same string with a 'Date' column format goes through format.ts:276 `new Date(String(value))` and renders 'Feb 08, 2021' west of UTC. Scope: the shipped demo model (trades-h2.pure) has no date column, so the demo page reaches this only through a date-typed calculated column. The executor is product code in src/, though, and any real model with a date dimension hits it for every non-UTC user.

**Fix:** In engine-remote toResultTable, convert temporal cells using the builder's declared type, as duckdb.ts does: turn StrictDate 'yyyy-MM-dd' into a local-midnight Date (as dateOnly does) and parse DateTime strings as instants. Every plane then hands the grid the same scalar. Optionally, harden format.ts and keyValue so they read a bare YYYY-MM-DD as a local calendar date. Add engine-remote tests with StrictDate and DateTime columns under a non-UTC TZ that cover groupValue/keyValue output and date formatting.

### P2-305. Opening a warehouse table or uploaded file runs an unlimited flat query that pulls the whole source into the tab

*data-semantics · DuckDB & file ingest · reproduced* — `src/cube.ts:412`, `src/cube.ts:413`, `src/config.ts:162`, `src/config.ts:600`, `src/serialize.ts:1173`, `demo/boot.ts:642`, `demo/boot.ts:684`, `src/warehouse.ts:126`, `src/duckdb.ts:229`

In the flat branch of refresh, cube.ts:412-416 has `const scope = maxRows === undefined ? undefined : ({ level: 1, parent: [], limit: maxRows + 1 } as const)`, and serialize emits limit() only from scope.limit. DEFAULT_CONFIGURATION leaves maxRows unset (config.ts:156-162, "UNSET means no limit"), applyToSnapshot adds a limit back only when one is configured, and both boot.ts entry points (warehouse open, file open) build `rows: []` cubes from DEFAULT_CONFIGURATION. The first query is therefore SELECT * with no LIMIT. WarehouseEngine keeps every Arrow RecordBatch and toResultTable also copies every cell into Scalar[], so peak memory is about twice the data. Scenario: opening a 3M-row warehouse table ships every row to the tab and stalls or kills it. A table over 10M rows fails on its very first query because of the server's 10,000,000-row cap. A measured 300k x 12 CSV took 91 MB of JS heap. The tree path is capped at DEFAULT_MAX_ROWS; the flat path has no cap.

**Fix:** Give flat and detail views a default fetch cap (DEFAULT_MAX_ROWS + 1 with the existing truncation warning), or page with LIMIT/OFFSET as the viewport moves. Keep 'unlimited' as an explicit user choice.

### P2-306. TIME columns are declared String and show raw microsecond counts (09:30:00 becomes 34,200,000,000); expanding a group and text filters then fail. BLOB and INTERVAL values also show internals

*data-semantics · DuckDB & file ingest · reproduced* — `src/infer.ts:60`, `src/infer.ts:74`, `src/infer.ts:75`, `src/duckdb.ts:154`, `src/duckdb.ts:164`, `src/duckdb.ts:170`, `src/duckdb.ts:185`, `src/result.ts:150`, `src/upload.ts:104`, `src/upload.ts:128`

sqlTypeOf has no TIME arm (`default: return isNestedType(t) ? 'SEMISTRUCTURED' : 'VARCHAR(4096)'`), so the model declares TIME as String. upload.ts rewrites only nested columns (to_json), so the DuckDB table stays TIME. On the way back, converterFor handles only decimals and `temporalKindOf` (/^Date\d*</, /^Timestamp</) and otherwise `return toScalar;`. The Time64 bigint is narrowed to a Number, and pureTypeOfArrow reports 'Unknown'. Reproduced with real DuckDB-WASM, ingestFile and the WasmPlanner: a CSV `region,trade_time / EMEA,09:30:00` returns 34200000000, which the grid formats as '34,200,000,000'. Expanding a trade_time group sends `WHERE t0.trade_time = '34200000000'`, which fails with 'Conversion Error: time field value out of range'. A 'contains' filter fails with 'Binder Error: ... strpos(TIME, STRING_LITERAL)'. Through the same toScalar fallback, `ArrayBuffer.isView(v) ? String(v)` makes a BLOB show as '97,98,99', and INTERVAL 3 DAY shows as '0,0'. The Live warehouse path is hit the same way, because it ships TIME as Time64<MICROSECOND>.

**Fix:** At ingest, cast every column whose DuckDB type falls to the VARCHAR default (TIME, INTERVAL, BLOB, ...) to VARCHAR, the way nested columns are already turned into JSON, so the table holds what the model declares. Or give TIME a real mapping end to end and add Time/Binary/Interval arms to converterFor (HH:MM:SS[.ffffff], UTF-8 or hex, ISO duration). Add TIME to the upload test corpus.

### P2-339. A ?warehouse= link picks where the warehouse password is sent, overriding config.json, and the attacker's host is then remembered for later visits

*security · security & dev server · reproduced* — `demo/page-config.ts:47`, `demo/boot.ts:600`, `demo/boot.ts:610`, `demo/boot.ts:613`, `src/warehouse.ts:86`, `demo/index.html:194`, `demo/index.html:196`

page-config.ts:47 `warehouse: text(q.get('warehouse')) || file.warehouse` lets the query string beat both the deployment's config.json and the remembered URL, with no allowlist and no https check. boot.ts:600 pre-fills the box (`if (!whUrl.value) whUrl.value = config.warehouse || remembered;`), Connect calls `signIn(whUrl.value.trim(), ...)`, and warehouse.ts:86 POSTs `JSON.stringify({ user, password })` to `<that host>/sql/v1/login`. After a 200, boot.ts:613 stores the host under `datacube.warehouse.url`. Scenario (reproduced with fetch mocked): a victim opens `https://datacube.corp/index.html?warehouse=https://warehouse.corp.example.evil.io`. The page is on the real origin, so the password manager autofills #whpass, and the size=24 box shows only `https://warehouse.corp.e`. One click on Connect sends the credentials to the attacker, who can then serve made-up rows under 'live as <user>'. The shipped config.json has `"warehouse": ""`, so every later visit pre-fills the attacker host again. Severity is capped at HIGH rather than raised further because signIn is documented as the development sign-in that SSO will replace, but the shipped page posts passwords today.

**Fix:** Stop taking credential-bearing endpoints from the query string. Take the warehouse from config.json only, or let the parameter pick from an allowlist of origins in config.json, and require https except on loopback. Never persist a URL that is not in config or the allowlist. Show the full origin next to the password field.

### P2-349. The //datacube:dist deploy folder is 9 absolute symlinks into the builder's Bazel cache plus one real file, so a copied deployment is dead links

*build-deploy · build & deploy · reproduced* — `datacube/demo/make-dist.mjs:30`, `datacube/demo/make-dist.mjs:35`, `datacube/BUILD.bazel:357`, `datacube/demo/README-realdata.md:125`

make-dist copies with `await cp(join(ROOT, 'demo', f), join(DIST, f));` (line 30) and `await cp(v(f), join(DIST, 'vendor', f));` (line 35). fs.promises.cp defaults to `dereference: false`, and Bazel's action inputs are symlinks, so the output holds the links, not the bytes. In the built tree, bundle.js, planner-worker.js, trades.pure and all six vendor/ files point to `/Users/neema/Library/Caches/bazel/_bazel_neema/.../execroot/_main/bazel-out/darwin_arm64-fastbuild/bin/datacube/demo/...`. Only index.html, written with writeFile at line 48, is a regular file. README-realdata.md:125 says `dist/` is self-contained and can be copied anywhere. Scenario (reproduced): `bazel build //datacube:dist`, then `cp -R`, `tar`, `rsync -a` or a Docker COPY to a web host. index.html loads, but bundle.js, the planner and the DuckDB wasm/workers all 404, and the page never gets past "loading…". The same happens on the build machine after `bazel clean`.

**Fix:** Copy the bytes: `cp(src, dst, { dereference: true })`, or readFile/writeFile. Add a test on :dist that lstat()s every entry and fails on any symlink.

## MEDIUM (182)

### P2-2. A calculated measure on a grouped and pivoted cube never learns its type, so the second-stage cast declares it String and sums it, and the planner refuses on every refresh

*correctness · pivot cast lifecycle · reproduced* — `src/app.ts:2653`, `src/app.ts:2658`, `src/serialize.ts:1065`, `src/serialize.ts:1073`, `src/ui/column-editor.ts:212`, `src/snapshot.ts:688`

#learnCalcTypes looks a calculated column up by its exact name (`const type = seen.get(d.name)`, app.ts:2658). A pivoted result only has 'A__|__dbl' / '2021__|__d', so a measure-kind calc column added (or loaded without a type) while the cube is grouped and pivoted never gets a type, and the ColumnEditor builds DerivedColumns with no type. The second stage then types the cast with `columnType(snapshot, name) ?? 'String'` (serialize.ts:1065). Reproduced with the real serialize: `cast(@Relation<(region:String, 'A__|__notional':Float, 'A__|__dbl':String)>)->groupBy(~[region], ~[..., 'A__|__dbl':x|$x.'A__|__dbl':y|$y->sum()])`. Pure has no sum over String, so the query is refused. #refreshOr rolls back to the uncast snapshot and #syncPivotCast re-adds the cast on the next view, so every interaction shows the error and the carried columns never appear. This is reachable on the measure-less Snap/Live cubes through the column editor. The same typeOf also mislabels count on a Float column and average on an Integer column, which is harmless. MEDIUM: the failure is loud and the first-stage pivot values that are shown are correct.

**Fix:** Type each pivot result column from the aggregate's result: the type the pivot result reported for that column (the view's column type when #syncPivotCast learns the cast), or the aggregate's return type (Integer for count, Float for average/stdDev/variance, the source column's type otherwise). Record the compiler's type when the ColumnEditor applies a column instead of relying on a same-name result column.

### P2-3. The pivot second stage looks up measures by name in a map keyed by column, so a measure named differently from its column is cast as String and re-aggregated with sum, and the planner refuses

*correctness · pivot cast lifecycle · reproduced* — `src/serialize.ts:1040`, `src/serialize.ts:1073`, `src/serialize.ts:1082`, `src/app.ts:764`, `src/app.ts:856`

`const byMeasure = new Map(snapshot.measures.map((m) => [m.column, m]));` (serialize.ts:1040) is keyed by column, but it is read with `c.measure`, which is the measure NAME: #syncPivotCast takes the leaf path's last segment (app.ts:764-767), castFits compares against m.name, and app.ts:856-863 says the cast carries the name. So for {name:'total', column:'notional'}, typeOf falls back to 'String' and the outer aggregate falls back to `defaultMeasure(c.measure, ..., 'sum')`, which also discards an 'average' fn. Reproduced with the real WASM planner: `cast(@Relation<(... '2021__|__total':String)>)->groupBy(~[region], ~['2021__|__total':...:y|$y->sum()])` fails with "no overload of 'meta::pure::functions::math::sum' structurally matches ... STRING", and the error comes back on every refresh because #syncPivotCast re-learns the cast. MEDIUM rather than HIGH: no shipped page or UI path creates a measure whose name differs from its column (the demo seeds name == column, and Snap/Live use `measures: []`). Only a host that embeds the app with named measures, which the public Measure type and the tests use, triggers it. If a name happened to match another numeric column, the query would plan and silently sum averages.

**Fix:** Key the lookups by measure name (`new Map(snapshot.measures.map((m) => [m.name, m]))`). Type the cast from the measure's result type (the source column's type via m.column, Integer for count, Float for average and similar). Add a named-measure grouped-pivot case to the serialize tests and the WASM differential.

### P2-9. Grouped queries keep at most one configured measure per column, so a second measure on the same column, or a count measure, silently disappears from grouped levels, totals and Ad Hoc queries

*correctness · pivot & aggregation query semantics · reproduced* — `src/serialize.ts:908`, `src/serialize.ts:903-935`, `src/adhoc/query.ts:172`

groupedAggs builds `new Map(snapshot.measures.map((m) => [m.column, m]))` and then loops over the projected columns only, skipping keys. Each column therefore yields at most one aggregate, the last measure on it wins, and a count measure whose column is a key or is not projected is dropped. A run of the real serialize() with measures a=sum(n_float), b=average(n_float), e=count(n_float) and rows=[region] emitted `groupBy(~[region], ~[e:x|1:y|$y->count(), n_int:...])`: a and b are gone, and n_float's figure is replaced by the count. The pivot path (`snapshot.measures.map(aggregateSpec)`) keeps every measure, so the same cube shows different measures pivoted and unpivoted. pivotTotalQuery and the Ad Hoc queries lose the same measures. Severity is MEDIUM rather than HIGH because no shipped page builds such measures today. Only a library host or a saved view can supply them, although app.ts:864 says several measures per column are intended.

**Fix:** Emit every configured measure in its own right, under its name, reading m.column and m.weight, as pivotAggs does. Then default-aggregate only the projected non-key columns that no measure claims. Never skip a measure because its column is a key or is not projected.

### P2-10. Filtering on a row-stage calculated column breaks child-group aggregates, because their query drops the calculated column but keeps the filter

*correctness · pivot & aggregation query semantics · reproduced* — `src/serialize.ts:1245-1248`, `src/serialize.ts:735-746`, `src/cube.ts:254`, `src/treeview.ts:214`

childAggregateQuery sets `derived: derivedNeeded ? snapshot.derived : []`. derivedNeeded looks only at group keys and measure columns, while `...rest` still carries snapshot.filter, and serialize applies the filter after the derived extends. Scenario: calculated column margin = $x.pnl / $x.notional, filter margin > 0.1, rows=[region, desk], and a group-level child aggregate 'max of notional'. The query is `t->filter(x|$x.margin > 0.1)->select(...)`, which the planner refuses with "relation has no column 'margin'". cube.ts pre-compiles it, so Apply is refused. If the filter is added later, treeview awaits withChildAggregates, so the whole level fetch fails.

**Fix:** Keep every derived column that the filter references, or keep all derived columns as pivotTotalQuery does. Narrowing snapshot.columns is enough to trim the projection.

### P2-11. A row-stage running or moving window with no order silently becomes a whole-partition aggregate

*data-semantics · pivot & aggregation query semantics · reproduced* — `src/serialize.ts:408`, `src/serialize.ts:426`, `src/ui/column-editor.ts:114`, `src/ui/column-editor.ts:262`

frameOf returns undefined when there is no order (`if (sorts.length === 0) return undefined; // running / moving need an order`), and the else branch then forces `rows(unbounded(), unbounded())`. The editor refuses an empty order only for `meta.ordered` functions, and sum, average, min, max and count are not ordered. Scenario: the default new window (fn sum, frame 'running', order []) on pnl emits `extend(over([], [~pnl->ascending()], rows(unbounded(), unbounded())), ...)`. Every row then shows the grand total under a column the user set up as a running sum, and with a partition it shows the desk total. No refusal or hint appears.

**Fix:** Throw CubeRefusal at the row stage when the frame is running or lastRows and there is no order, or make the editor require an order for those frames. The group stage already falls back to display order.

### P2-12. The median of a DECIMAL column is truncated to the column's scale (1.875 shows as 1.87)

*data-semantics · pivot & aggregation query semantics · reproduced* — `src/serialize.ts:172`

serialize.ts:172 emits `y|$y->median()`, and the planner lowers it to `CAST(MEDIAN(t0.pnl) AS DOUBLE)`. The median is therefore computed in DECIMAL(18,2) and cast only afterwards. Scenario: pnl DECIMAL(18,2) with the values 1.50 and 2.25 in one group. Both DuckDB 1.4.4 and DuckDB-WASM 1.5.4 return 1.87, where the true median is 1.875 (1.88 at the default 2-dp format). The truncated value appears in leaf subtotals and the pivot Total on every plane. AVG is unaffected because it lowers to AVG(1.0*x).

**Fix:** In the planner's median lowering (in core, not datacube), cast before the median: MEDIAN(CAST(x AS DOUBLE)), or widen the DECIMAL scale.

### P2-13. A child-group aggregate of a weighted-average measure can never run, because the child query projects away the weight column

*correctness · pivot & aggregation query semantics · reproduced* — `src/serialize.ts:1241`

childAggregateQuery builds `reads` from the row keys and `measureOf(d.childAggregate!.of).column` only, and then filters `columns` by it. Measure.weight is never added, yet the inner groupBy still maps `$x.notional->wavgRowMapper($x.w)`. Scenario: measure wa = wavg(notional, w), rows region>desk, and a group-level calculated column 'max of wa'. The planner refuses with "relation has no column 'w'", so Apply is refused with that confusing message, and a saved view carrying the column fails the whole tree. A column whose Column Properties aggregate is wavg fails the same way.

**Fix:** Add each wanted measure's weight to `reads`, as pivotTotalQuery already does (serialize.ts:1382).

### P2-14. A child-group aggregate column on a cube with no row groups, or one pivoted later, is accepted and then never shown

*correctness · pivot & aggregation query semantics* — `src/serialize.ts:1220`, `src/serialize.ts:1157`, `src/ui/column-editor.ts:252-256`, `src/cube.ts:254`

childAggregateQuery deliberately returns null when `snapshot.rows.length === 0 || snapshot.pivotOn.length > 0`, and serialize skips child-aggregate columns with `if (!d.childAggregate) parts.push(...)`. The editor's #bodyProblem refuses only a pivoted cube, not a flat one. Scenario: on a flat upload, create Group Level > Child groups 'min of f' and click OK. The live check passes because the plain `select(~[s, f])` plans, but no query ever produces min_child. The grid shows no column and no message. The same happens when an existing column's cube loses its last row group or gains a pivot.

**Fix:** Refuse the draft in #bodyProblem when there are no row groups. Flag or hide existing child-aggregate columns, with a reason, when the rows become empty or a pivot appears.

### P2-15. A sort on a child-aggregate calculated column shows a sort arrow but is never applied

*correctness · pivot & aggregation query semantics* — `src/snapshot.ts:721`, `src/app.ts:1747-1768`, `src/app.ts:990`, `src/ui/menu.ts:466-503`

totalOrderSorts removes these sorts on purpose, via `apart` in `!apart.has(x.column)`, and it is the only source of the level's ORDER BY. Meanwhile #sortByHeader and the menu's sort.* items accept the column, and `this.#grid.setSorts(view.snapshot.sorts)` draws the arrow and aria-sort. Scenario: rows [region, desk] and 'weakest' = min of the children's notional, sorted descending. The query is `...->sort([~region->ascending()])` and the rows come back in region order, while the header shows a descending arrow. With a Row Limit, the 'top N by weakest' are simply the first N regions.

**Fix:** Either refuse the sort by disabling the header click and menu items with a reason, or sort client-side after the child-aggregate join on untruncated levels. Never draw an indicator for a sort that was not applied.

### P2-16. 'Exclude Column from Horizontal Pivot' does nothing on a cube with configured measures

*correctness · pivot & aggregation query semantics · reproduced* — `src/app.ts:1604`, `src/serialize.ts:991-993`, `src/serialize.ts:1001`, `src/ui/menu.ts:565-571`

The menu entry calls `this.#patchColumn(column, { excludedFromPivot: true })`, and applyToSnapshot copies the flag onto the ColumnSpec. But pivotAggs returns `snapshot.measures.map(aggregateSpec)` unfiltered whenever measures are configured, and only the no-measures branch honours `excludedFromPivot`. A run through the real serialize, with measures [sum notional, sum pnl], pivot on year and pnl excluded, still emitted `pivot(~[year], ~[notional:..., pnl:...sum()])` and the '2021__|__pnl' cast. The configuration records the exclusion, but the grid does not change.

**Fix:** In pivotAggs, drop measures whose source column is excludedFromPivot and carry them as un-pivoted aggregates, as the no-measures path and the pivot-total 'carried' logic already do.

### P2-17. Unticking 'Exclude from horizontal pivot', or switching a column back to measure, never puts the column back into the pivot

*correctness · pivot & aggregation query semantics · reproduced* — `src/config.ts:587`, `src/config.ts:583-592`, `src/ui/panel-column.ts:361`, `src/ui/panel-column.ts:289`

applyToSnapshot spreads `...withoutAggregate(spec)` and then adds `excludedFromPivot` only `if (c.excludedFromPivot !== undefined)`. The untick writes `excludedFromPivot: v ? true : undefined`, which prunes the config key, so the previous snapshot's `true` survives every later refresh. A run of the real config.ts confirmed that after an untick, applyToSnapshot(previousSnapshot, config) still yields `{name:'pnl', excludedFromPivot:true}`. The grid keeps pnl un-pivoted while the checkbox reads unticked, and the same happens after changing Kind from dimension to measure. On reload, fromSnapshot reads the stale true back into the config. Only the context-menu 'Include' works, because it writes an explicit false.

**Fix:** Make applyToSnapshot authoritative for the fields the configuration owns. Strip excludedFromPivot (and kind) from the incoming spec, as withoutAggregate does for the aggregate, then set them only from the config. Add an untick test.

### P2-18. The Horizontal and Vertical Pivot menu entries can put a column on both axes, which the planner refuses

*correctness · pivot & aggregation query semantics* — `src/ui/menu.ts:539-551`, `src/ui/menu.ts:845-861`, `src/ui/pivot-panel.ts:310-330`

'pivot.horizontal' is only `disabled: !groupable`, and applyMenuAction does `case 'pivot.horizontal': return col ? { ...s, pivotOn: [col] } : s;`, leaving s.rows unchanged. pivot.vertical and addVertical likewise leave pivotOn unchanged. PivotPanel.#drop enforces 'A COLUMN IS ON AT MOST ONE AXIS', but the menu path does not. Scenario: in a cube grouped by region, right-click an EMEA cell and choose Pivot > 'Horizontal Pivot on region'. This gives rows=['region'] and pivotOn=['region'], and the query `select(~[region, notional])->pivot(~[region], ...)->sort([~region->ascending()])` is refused and rolled back with an error. The drag-and-drop zones would have moved the column instead.

**Fix:** In applyMenuAction, remove the column from the other axis, as PivotPanel.#drop does. Share one moveToAxis helper between the menu, the drop zones and drillTo so they cannot drift apart.

### P2-25. Uploads named after a DuckDB reserved word (check.csv, show.csv, to.csv, unique.csv and about 50 others) load, but every query on them fails

*correctness · identifiers & literal escaping · reproduced* — `src/upload.ts:59`, `src/upload.ts:118`, `src/infer.ts:130`, `core/src/main/java/com/legend/sql/dialect/Lexicon.java:23`

tableNameOf('check.csv') returns `check`. ingestFile quotes it for its own SQL (`const qt = dq(table)`), so CREATE, DESCRIBE and count all succeed. inferModel then declares `Table check` without quotes, because quoteIdent passes any `^[A-Za-z_][A-Za-z0-9_]*$` name through unchanged. The planner quotes only the roughly 60 words in Lexicon.DUCKDB, which includes pivot but not check, show, describe, unique or to, so it emits `FROM check AS t0`. Three verifiers reproduced this with real DuckDB-WASM and the real WASM planner, testing 54 keywords from the reserved, type_function and column_name categories. With check.csv the demo cube is already disposed, the user gets an empty grid and `could not open check.csv: {"exception_type":"Parser",..."syntax error at or near \"check\""}`, and renaming the file is the only workaround. The finder rated this HIGH; all three verifiers settled on MEDIUM because the failure is loud and has a workaround.

**Fix:** Fix it in the planner: quote every emitted table and schema identifier, or build the quoting set from DuckDB's full duckdb_keywords() list. Also have tableNameOf add a suffix when the name is a reserved word, and add each duckdb_keywords() entry as an upload test case.

### P2-26. Pure string literals and quoted names keep raw newlines, so text with a line starting '###' cuts the token short and the query or model fails

*correctness · identifiers & literal escaping · reproduced* — `src/serialize.ts:67`, `src/serialize.ts:116`, `src/infer.ts:137`, `src/calc.ts:161`, `src/serialize.ts:542`

escapePure is `s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")`, and quoteIdent and columnRef handle only the backslash and the quote in the same way, so a raw '\n' reaches the Pure text. The core Lexer's scanStringLiteral and scanQuotedString loop `while (pos < length && !atSectionBoundary(pos))`, and atSectionBoundary is true at a '###' at the start of a line, so the token stops there, unterminated. Scenario: a notes column holds Markdown such as 'Summary\n### Risks'. When the user groups by it and expands that group, parentConditions turns the key into `$x.notes == 'Summary\n### Risks'`, and the WASM planner returns "[1:47] malformed string literal: missing surrounding quotes". Filters and drills on that value fail the same way. A CSV or warehouse column named "Notes\n### Heading" makes the generated model fail to parse ("[8:5] Unexpected token"). The escaped form `'Summary\\n### Risks'` plans correctly.

**Fix:** In one shared escaper used by escapePure, quoteIdent and columnRef, also escape '\n' as '\\n', '\r' as '\\r' and '\t' as '\\t' (the lexer already decodes these), so no raw control character ever reaches Pure text.

### P2-27. Warehouse tables or schemas whose names need quoting cannot be opened: quoted table names do not resolve, and quoted schemas produce invalid SQL

*correctness · identifiers & literal escaping · reproduced* — `src/infer.ts:270`, `src/infer.ts:271`, `src/infer.ts:272`, `demo/boot.ts:639`

inferModel builds the accessor `#>{${pkg}::DB.${quoteIdent(schema)}.${quoteIdent(table)}}#`, and demo/boot.ts:639 passes the warehouse catalog names in unchanged (`inferModel(chosen.columns, { table: chosen.name, schema: chosen.schema })`). The planner does not strip the Pure quotes when it resolves the island accessor. Two verifiers confirmed the results with the WASM planner: sales.'order-lines' (also 'daily-pnl', '2024_orders', "o'brien") fails with `unknown table 'sales."order-lines"' in database 'local::DB'`. A schema 'my-schema' does plan, but to `FROM ""my-schema""."t"`, and DuckDB rejects that as a zero-length delimited identifier. A table named `orders{x}` fails at '[1:1] Unexpected token' because the island lexer ends at braces. Uploads avoid this only because tableNameOf reduces names to [A-Za-z0-9_].

**Fix:** In the planner, resolve quoted names inside #>{...}#: strip the Pure quotes, then quote once when emitting SQL, doubling any embedded quote. Alternatively, have the model declare a plain alias that maps to the real name. Until then, the picker should refuse non-plain catalog names with a clear message instead of showing a planner error.

### P2-37. Copy says 'copied' without checking the write: on plain-http deployments or a rejected clipboard write nothing is copied, and the user pastes stale data

*error-handling · selection & copy* — `datacube/src/app.ts:1990`, `datacube/src/app.ts:1992`, `datacube/src/grid/grid.ts:1303`, `datacube/src/grid/grid.ts:1429`, `datacube/demo/boot.ts:446`, `datacube/demo/main-engine.ts:139`

`#copy(text) { if (text === '') return; void this.#options.writeClipboard?.(text); this.#status('copied', 'ok'); }` (app.ts:1990-1994) and grid.ts:1429 `void this.#options.writeClipboard?.(text);` neither await nor check the write. The shipped hosts pass `(text) => navigator.clipboard?.writeText(text)` (boot.ts:446, main-engine.ts:139). `navigator.clipboard` does not exist outside a secure context, and writeText rejects with NotAllowedError in an unfocused document or in an iframe without clipboard-write, which becomes an unhandled rejection. Ctrl+C in the grid also calls `event.preventDefault()` (grid.ts:1303-1306), so the browser's own copy never runs, and src has no execCommand or clipboardData fallback. Scenario: dist is served at http://datacube.intranet as make-dist suggests. The user selects figures and chooses Copy, the status reports 'copied', and pasting into a spreadsheet inserts the clipboard's previous contents.

**Fix:** Have writeClipboard return success or failure, await it, and report 'could not copy' when the write fails or no writer exists (hide the copy entries when the host provides none). For Ctrl+C, write in a `copy` event listener with `event.clipboardData.setData('text/plain', text)`, which needs no secure context or permission, instead of calling preventDefault on keydown and then the async API.

### P2-38. The menu's Copy Selection / Copy Column / Copy Rows put comma CSV with a BOM on the clipboard, so a spreadsheet paste lands in one column with a stray U+FEFF in A1

*correctness · selection & copy · reproduced* — `datacube/src/app.ts:1873`, `datacube/src/app.ts:1883`, `datacube/src/app.ts:1906`, `datacube/src/app.ts:1583`, `datacube/src/app.ts:1586`, `datacube/src/app.ts:1592`, `datacube/src/export.ts:111`, `datacube/src/export.ts:127`

#selectionCsv, #columnCsv and #rowsCsv all `return toCsv(...)`, and the copy.selection/copy.column/copy.rows menu cases pass the result to #copy. toCsv uses a comma delimiter with CRLF and adds a BOM by default (export.ts:111 `options.bom === false ? body : `﻿${body}``). export.ts already has `toClipboard` (TSV, no BOM), whose own comment says 'a BOM pasted into a cell shows up as a stray character', and the grid's Ctrl+C uses it (grid.ts:1428). Scenario: the user right-clicks, chooses Copy Selection on a 3-column block and pastes into spreadsheet or Sheets. Each row lands in column A as one 'notional,pnl,qty' string, A1 begins with the invisible U+FEFF so a lookup on that header fails, and the same data behaves differently from Ctrl+C.

**Fix:** Use `toClipboard` for all three menu copy entries (and build them through the column model, as in the selection-column finding). Keep toCsv for file downloads only.

### P2-39. Selection and focus are not cleared or clamped when a new result arrives, so stats count cells that no longer exist, copies are padded with blank rows, and keys move to rows that are not there

*correctness · selection & copy · reproduced* — `datacube/src/grid/grid.ts:353`, `datacube/src/grid/grid.ts:391`, `datacube/src/grid/grid.ts:1314`, `datacube/src/grid/grid.ts:1333`, `datacube/src/grid/grid.ts:1349`, `datacube/src/grid/grid.ts:1352`, `datacube/src/app.ts:1103`, `datacube/src/app.ts:1845`

`setRows` and `setColumns` replace #table, #totalRows and #model but never touch `#selection` or `#focus`, and nothing in app.ts clears its own copy of the range (app.ts:1845), which is re-rendered against each new table at app.ts:1103. ArrowUp, ArrowLeft and PageUp only floor at 0 (`row = Math.max(0, row - 1)`), and Enter calls `onActivateCell(row, col)` with the stale focus. Reproduced in jsdom: the user selects the qty column in a 1,000-row result and then filters to 10 rows. The status bar reads '10 of 1000 numeric · 990 blank', Ctrl+C writes 1,002 lines of which 990 are empty, and with focus at row 500 ArrowUp moves to row 499 of a 10-row grid, where Enter drills through on a row that does not exist. After a regroup, the same column indices name different columns.

**Fix:** In setRows/setColumns, when the epoch or the model changes, clear the selection (or clamp it to the new bounds), clamp #focus to [0,lastRow]x[0,lastCol], and call onSelectionChange so the app's stats update. Clamp every keyboard move to both bounds.

### P2-40. Selection stats silently skip large DECIMAL/BIGINT values, which arrive as exact strings, so sum, avg, min and max leave out the biggest figures

*data-semantics · selection & copy · reproduced* — `datacube/src/selection.ts:120`, `datacube/src/duckdb.ts:75`, `datacube/src/duckdb.ts:83`, `datacube/src/duckdb.ts:132`

selectionStats counts only `typeof v === 'number' && Number.isFinite(v)`. Any other non-null value is neither summed nor counted as blank. duckdb.ts deliberately returns a BIGINT, or a DECIMAL whose unscaled value exceeds MAX_SAFE_INTEGER, as its exact string (toScalar and decimalToScalar). Scenario: a notional column of DECIMAL(38,6), the type sum() produces over DECIMAL(18,6), has group totals above about 9.0e9, which arrive as strings such as '12345678901.123456'. When the user selects 5 groups of which 2 are that large, the bar shows a sum and max over the 3 small groups only, labelled '3 of 5 numeric'. The largest values are the ones dropped, and the count is the only hint.

**Fix:** Treat numeric-looking strings in numeric-typed columns as numbers and sum them with exact decimal (BigInt-scaled) arithmetic. At minimum, count them separately and mark the sum, min and max as partial instead of showing them as complete.

### P2-42. Full exports (CSV, spreadsheet, HTML, text, PDF, email) write the raw result instead of the grid, so hidden columns, the internal `__tree`/`__root__` columns, in-tree duplicate dimensions and engine column order all end up in the file

*correctness · export* — `datacube/src/app.ts:2089`, `datacube/src/app.ts:2091`, `datacube/src/app.ts:2099`, `datacube/src/app.ts:2102`, `datacube/src/app.ts:2108`, `datacube/src/app.ts:2110`, `datacube/src/export.ts:84`, `datacube/src/export-rich.ts:33`, `datacube/src/export-doc.ts:47`, `datacube/src/grid/columns.ts:351`, `datacube/src/grid/columns.ts:441`, `datacube/src/treeview.ts:546`, `datacube/src/serialize.ts:1127`

`#render` passes `view.rows` whole to every exporter with no `columns` option: `toCsv(view.rows)`, `toSpreadsheetML(view.rows, { title })`, `toHtml(view.rows, { title })`, `toPlainText(view.rows, doc)`, `toPdf(view.rows, doc)`. With no `columns`, each exporter falls back to every result column in result order. Hiding, dropping in-tree dimensions and `ROOT_COLUMN`, the configured column order and the desc pivot reseating all happen only in `buildColumnModel`, which feeds the grid and never the exporters. Hidden columns are still queried (persist.ts:30: "hidden from the grid but still available to the query"). The same class already does this correctly in `#rowsCsv` (app.ts:1891-1911), which maps through `view.columns.leaves` "so hidden columns and the tree's machinery stay out". Scenario: group by region/desk, hide `pnl`, then choose Export > CSV or Email. The file's header is `__tree,desk,book,...,pnl,...`, including the mostly blank uniqueValueOnly `desk` column and the `pnl` column the user deliberately hid, with pivot columns in DuckDB order (2023 before 2024 even when the screen is sorted desc).

**Fix:** Build the export column list from the current ColumnModel: pass `columns: view.columns.leaves.map(l => l.name)` (visible leaves, screen order, pivot direction applied) to every exporter, as `#rowsCsv` and `selectionTable` already do, and give TREE_COLUMN a readable header.

### P2-43. spreadsheet and HTML exports ignore display names and formats: renamed headers revert to raw names, HTML numbers are unformatted, and HTML dates print as JS Date.toString() text

*correctness · export · reproduced* — `datacube/src/app.ts:2083`, `datacube/src/app.ts:2099`, `datacube/src/app.ts:2102`, `datacube/src/export-rich.ts:66`, `datacube/src/export-rich.ts:77`, `datacube/src/export-rich.ts:158`

`#render` builds `doc = { title, formatters, formats, labels: this.#labels() }` and passes it only to text and PDF. spreadsheet gets `toSpreadsheetML(view.rows, { title })` and HTML gets `toHtml(view.rows, { title })`, although both functions accept labels/formatters/formats and the comment at app.ts:2031-2034 says document exports must say what the screen says. Without formatters, toHtml falls back to `String(v)`. Reproduced with TZ=Asia/Tokyo: a DATE cell exports as 'Tue Feb 09 2021 00:00:00 GMT+0900 (Japan Standard Time)', notional exports as '-1234567.891' where the grid shows '(1,234,567.89)', and a column renamed 'Notional (USD)' has the header `notional` in both HTML and spreadsheet. The email.html path carries the same output.

**Fix:** Pass `doc` (labels, formatters, formats) to toHtml, and pass labels (plus formats for text cells) to toSpreadsheetML. Extend test/app.test.ts to assert header text and one formatted cell.

### P2-44. PDF export and PDF email garble accented text ('ZÃ¼rich') and write wrong /Length and xref offsets, because a Latin-1 PDF string is written out as UTF-8; €, … and other non-Latin-1 WinAnsi characters become '?'

*data-semantics · export · reproduced* — `datacube/src/export-doc.ts:68`, `datacube/src/export-doc.ts:164`, `datacube/src/export-doc.ts:176`, `datacube/src/export-doc.ts:308`, `datacube/src/export-doc.ts:315`, `datacube/src/export-doc.ts:319`, `datacube/src/app.ts:199`, `datacube/src/app.ts:2110`, `datacube/src/app.ts:2158`, `datacube/src/app.ts:2187`, `datacube/src/export.ts:157`, `datacube/demo/boot.ts:460`, `datacube/demo/main-engine.ts:141`

escapePdfText keeps `\xA0-\xFF` as single chars for WinAnsiEncoding (`.replace(/[^\x20-\x7E\xA0-\xFF]/g, '?')`), and assemble() computes `/Length ${content.length}`, `offsets.push(out.length)` and startxref in UTF-16 code units. The string then goes through `download(name, mime, text: string)` to `new Blob([text], { type: mime })` in both hosts, or through toEml → base64Lines → `new TextEncoder().encode(text)`, and both encode UTF-8. Several auditors reproduced this with the real toPdf. Rows 'Zürich Rates' and 'Société Générale' give a 907-char string but a 912-byte file, the bytes at startxref read "dobj" instead of "xref", and ü is written as C3 BC, which a WinAnsi font draws as 'Ã¼'. The same regex also turns € (EUR currency format gives '?1,234.50') and the '…' that clip() appends to long cells into '?', although WinAnsi has both at 0x80/0x85. Severity is MEDIUM, not the HIGH some members claimed: numbers stay intact, most readers repair the xref, and the garbling is visible rather than silently wrong. The existing tests use only ASCII and measure offsets on the JS string, so none of them catch this.

**Fix:** Produce the PDF as bytes: map each char to its WinAnsi byte (including 0x80-0x9F for €, …, quotes, dashes) in a Uint8Array, compute /Length and offsets on that array, and widen the download/email contract to carry binary content (Uint8Array/Blob) that base64 encodes directly. Add a test with accented cells that checks offsets on the encoded bytes.

### P2-45. PDF export overprints columns on any table wider than about 110 characters: column widths are scaled down but text is still drawn at full size and never clipped

*correctness · export · reproduced* — `datacube/src/export-doc.ts:156`, `datacube/src/export-doc.ts:203`, `datacube/src/export-doc.ts:204`, `datacube/src/export-doc.ts:247`, `datacube/src/export-doc.ts:261`

When the table is too wide, toPdf scales only the column widths (`const scale = total > available && total > 0 ? available / total : 1; const colWidth = natural.map((n) => n * scale);`). Every cell is still drawn at `/F1 ${FONT_SIZE}` (9pt) and headers at 10pt bold, and nothing truncates text to colWidth. The gaps are not scaled, so even the scaled layout overruns the page. Reproduced arithmetic: 10 columns of 16-char values on A4 give scale 0.637; column 1 starts at x=91.7 while column 0's text ends at x=110.9 (about 19pt of overprint), and the last column ends at x=612 on a 595pt page. A normal pivot export with a dozen measure columns comes out as unreadable, overprinted figures, which contradicts the 'never overlapping' comment at line 156.

**Fix:** When the natural width does not fit, scale the font size by the same factor (and include gaps in the scaled budget), clip each cell to its column width, or switch to landscape or horizontal pagination. Measure headers at their own size.

### P2-46. The spreadsheet sheet name is cut to 31 characters after XML escaping, which can split an entity (e.g. 'P&L' becomes 'P&am') and produce a malformed .xls that spreadsheet will not open; spreadsheet-illegal sheet-name characters are never removed

*correctness · export · reproduced* — `datacube/src/export-rich.ts:178`, `datacube/src/app.ts:2081`, `datacube/src/app.ts:2099`

`<Worksheet ss:Name="${escapeXml(title).slice(0, 31)}">` escapes the user's Report Title first and truncates afterwards. Reproduced with the real function: 'Global Markets daily flash P&L' gives `ss:Name="Global Markets daily flash P&am"` and 'Quarterly results for EMEA & APAC' gives `...EMEA &amp"`. Both are unterminated entity references, so the XML is not well-formed and both the spreadsheet export and the emailed .xls fail to open. Titles containing : \ / ? * [ ] (e.g. 'P&L 2024/25'), and an empty title (`??` does not replace ''), pass through although spreadsheet forbids them in sheet names. The only test uses `'x'.repeat(60)`.

**Fix:** Sanitize the raw title first (strip []:*?/\, fall back to 'Sheet1' when empty), slice to 31 UTF-16 units without splitting a surrogate pair, THEN escapeXml. Add tests with '&' near the cut and with forbidden characters.

### P2-49. Exports, emails and charts of a row-capped view give no sign that rows were cut, so recipients total a prefix as if it were the whole result

*data-semantics · export* — `datacube/src/app.ts:2091`, `datacube/src/app.ts:2110`, `datacube/src/app.ts:2166`, `datacube/src/app.ts:1004`, `datacube/src/app.ts:1089`, `datacube/src/cube.ts:411`, `datacube/src/treeview.ts:211`

When a cap applies, cube.ts and treeview.ts record `truncated: [{level, ...}]` on the view, but `view.truncated` is read only by the two status-bar warnings (app.ts:1004, 1089). `#render` passes only `view.rows` plus `{title, formatters, formats, labels}` to every exporter. The email body is `${title} — ${rowCount} rows` and #confirmExport shows only a generic attestation, so neither mentions the cut. Scenario: a flat cube with Row Limit 1,000 over 50,000 rows, or a tree whose level 1 has 5,000 groups against the default 1,000 cap. The CSV/PDF/HTML file or email attachment holds exactly 1,000 rows with no note, and a recipient who sums the column gets a wrong total.

**Fix:** Pass `view.truncated` into #render and the document renderers. Add a title-block/footer line for PDF, HTML and text, and a warning in the confirm dialog and email body (for CSV/spreadsheet, a trailing note row or the dialog warning), or offer 'export all' by re-running the query without the cap.

### P2-53. Tree group keys drop milliseconds and read timestamps as local wall-clock time, so distinct timestamp groups collide: one row shows the other's figures and expanding either returns nothing

*data-semantics · temporal values · reproduced* — `src/treeview.ts:107-117`, `src/treeview.ts:142`, `src/treeview.ts:332-334`, `src/treeview.ts:378-382`, `src/treeview.ts:480`, `src/adhoc/query.ts:249`, `src/duckdb.ts:168`

groupValue writes a Date only to the second in local components: `${v.getFullYear()}-...T${p(v.getHours())}:${p(v.getMinutes())}:${p(v.getSeconds())}`. That string is the path identity. assemble takes the first match (`data.paths.findIndex((p) => pathKey(p) === pathKey(row.path))`), the pivot-total and child-aggregate maps keep the last match, and the Ad Hoc key map at adhoc/query.ts:249 overwrites members. Reproduced with the real planner and DuckDB: groups at 10:00:00.100 (qty 5) and 10:00:00.900 (qty 700) show as two rows both labelled '2021-02-09T10:00:00' and both showing 5, while Total says 705. Expanding either row issues `WHERE t0.ts = TIMESTAMP '...T10:00:00'` and returns 0 rows. Instants in the DST fall-back hour collide the same way (America/New_York: 05:30Z and 06:30Z both key as '2021-11-07T01:30:00'). Rated MEDIUM, not HIGH: the figures are silently wrong, but only when rows are grouped by a raw sub-second timestamp or fall in the repeated DST hour.

**Fix:** Key groups by a lossless value kept apart from display text: the engine's full-precision value (epoch microseconds or the raw Arrow bigint) or ISO with an offset. Make the child-filter literal round-trip that key. Assert that paths are unique per level instead of letting findIndex pick the first match, and add a test with keys that differ only in milliseconds.

### P2-54. The default 'auto' format shows TIMESTAMP values as a date only, so distinct times look identical in the grid and in the text and PDF exports

*data-semantics · temporal values · reproduced* — `src/format.ts:208-212`, `src/format.ts:263-265`, `src/config.ts:537-553`, `src/export-doc.ts:80-81`

In the 'auto'/'text' branch every Date is formatted as a date: `if (value instanceof Date) { return this.format(value, { ...format, kind: 'date' }); }`, and the 'date' Intl formatter has only year, month and day. renderFormats sets defaults only for numeric columns, so a DateTime column with no configured format always takes this path. Reproduced with the real FormatterCache: `format(new Date(2021,1,9,9,0), {kind:'auto'})` and the 17:00 value both return 'Feb 09, 2021'. Trades at 09:30 and 15:45 look identical, a sort by the column has no visible basis, and the text and PDF exports print only the date, while the same column used as a row group shows '2021-02-09T10:30:00'. Rated MEDIUM, not HIGH: the data is hidden, not wrong, and choosing 'Date and time' shows it.

**Fix:** Resolve the default format from the column type (ResultColumn.type), as numberDefaults does for numbers: 'datetime' for DateTime/Timestamp and 'date' only for StrictDate. Do not infer from `instanceof Date`, which cannot tell the two apart.

### P2-55. DATEs in years 0-99 are rebuilt as 1900-1999, so a 0001-01-01 'no date' sentinel shows as 1901 and filters and drills on it match the wrong rows

*data-semantics · temporal values · reproduced* — `src/duckdb.ts:203-206`, `src/ui/filter-editor.ts:278`, `src/serialize.ts:104-111`

dateOnly uses the multi-argument Date constructor, `new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate())`, which maps years 0..99 to 1900+year. The filter editor's parseTyped has the same bug (`new Date(Number(m[1]), Number(m[2]) - 1, ...)`). Reproduced: `SELECT DATE '0001-01-01', DATE '0099-12-31'` through DuckDbEngine returns years 1901 and 1999. A column that holds the common 0001-01-01 sentinel (.NET MinValue, SAP) shows 'Jan 01, 1901'. Filtering, drilling or expanding that group emits `%1901-01-01`, which matches nothing or matches real 1901 rows, and typing '0001-01-01' in the filter editor filters 1901 too.

**Fix:** Build the Date and then call setFullYear(y, m, d), which has no two-digit remap, in both dateOnly and parseTyped. Or, better, represent StrictDate values zone-free (see the DST-gap entry) so no local constructor is involved.

### P2-56. A DATE whose local midnight falls in a DST gap becomes 01:00, so 'Add Filter' and group expansion on that day return zero rows

*data-semantics · temporal values · reproduced* — `src/duckdb.ts:203-206`, `src/serialize.ts:104-111`, `src/treeview.ts:113-117`

dateOnly builds a DATE as local midnight with `new Date(y, m, d)`. On a day whose midnight is skipped by DST, JavaScript moves the value to 01:00. temporalLiteral tests `v.getHours() === 0 && ...` and writes a DateTime literal instead, and groupValue writes '...T01:00:00'. Reproduced through the real toResultTable, literal and memberConditions: DATE 2023-04-28 under Africa/Cairo (also 2022-09-11 under America/Santiago and 2018-11-04 under America/Sao_Paulo) gives the filter `$x.d == %2023-04-28T01:00:00`, which no DATE row equals. This hits zones whose DST starts at midnight (Egypt, Chile, Paraguay, Cuba, Lebanon, historic Brazil and Iran).

**Fix:** Represent StrictDate values zone-free: either a Y-M-D value, or a UTC-noon Date read with UTC getters. Have temporalLiteral and groupValue emit dates from those components instead of testing for local midnight.

### P2-57. INTERVAL cells show garbage such as "0,1" on both Live and Snap, because Arrow JS 17 reads MONTH_DAY_NANO as YEAR_MONTH

*data-semantics · temporal values · reproduced* — `src/duckdb.ts:99`, `warehouse/src/main/java/com/legend/warehouse/server/duck/ArrowStreams.java:197`, `src/warehouse.ts:17-18`

The server declares INTERVAL as MONTH_DAY_NANO (ArrowStreams.java:197 `case "INTERVAL" -> { id = 11; ... b.fieldShort(0, 2); }`), and DuckDB-WASM exports the same type. apache-arrow 17's getInterval handles only DAY_TIME and YEAR_MONTH, so it reads one int32 at the wrong stride and returns an Int32Array. duckdb.ts:99 `if (ArrayBuffer.isView(v)) return String(v);` then stringifies that array, and the column type is 'Unknown'. Reproduced on both planes: INTERVAL '1 month 2 days 3 hours', '14 months' and '90 minutes' show as "0,1", "0,2" and "-153562453,-4", with no error. The warehouse.ts claim that cells are identical on both planes holds only because both are wrong the same way.

**Fix:** Add an Interval branch in converterFor that reads the raw MONTH_DAY_NANO buffer (int32 months, int32 days, int64 nanos, 16 bytes per row) and formats it. Or have the server and the Snap SQL send INTERVAL as its DuckDB text.

### P2-58. The 'in' list on a DateTime/Timestamp column uses date-only inputs, so existing timed entries show blank and no time can be entered

*correctness · temporal values* — `src/ui/filter-editor.ts:107-115`, `src/ui/filter-editor.ts:674-678`, `src/ui/filter-editor.ts:1248`, `src/ui/filter-editor.ts:1257`

dataTypeOf returns 'date' for DateTime and Timestamp as well as StrictDate, so `if (dataTypeOf(type) === 'date') input.type = 'date';` (1248) and the same check for the add field (1257) give timed columns an `<input type=date>`. itemText renders a timed value as '2024-03-01T10:30:00', which a date input clears to ''. The author reported checking this in Chromium, but the verifier only confirmed it by reading the code. In that check, a DateTime `in` condition with [2024-03-01 10:30, 2024-03-02 00:00] opened with the first entry blank. New entries can only be dates, so `ts in [%2024-03-01]` matches only rows at exactly midnight, and a user filtering a timestamp list by day gets few or no rows.

**Fix:** When hasTime(type) is true, use `datetime-local` with step=1 for both the item inputs and the add field, and render the items with dateText(value, true).

### P2-60. DECIMALs with 16 significant digits are converted to doubles that silently change the last digit, so displays are off by a cent and expanding such a group finds no rows

*data-semantics · number formatting & precision · reproduced* — `src/duckdb.ts:134`, `src/duckdb.ts:147`, `src/treeview.ts:107`, `src/serialize.ts:113`

The same `safe` test (unscaled <= MAX_SAFE_INTEGER) lets 16-digit decimal text through to `Number(text)`, but a double round-trips only about 15 significant digits. The doc comment's promise of 'a number when the unscaled value is exactly representable' is wrong once the scale is applied. Reproduced: decimalToScalar('7948141509648071', 2) returns 79481415096480.7 instead of 79481415096480.71. '8999999999999999' and '8999999999999998' at scale 3 both return 8999999999999.998, so two distinct group keys collide. About 7-9% of random 16-digit values change at scales 2-4. With such a column as a row dimension, groupValue writes String(v) = '90071992547409.9' as the key, and the expand filter matches 0 rows. Ad Hoc members and drill-through fail the same way.

**Fix:** Return a Number only when String(Number(text)) equals the normalised decimal text (always true at 15 or fewer significant digits). Otherwise keep the exact value, using the same representation chosen for the large-DECIMAL entry so that consumers still treat it as numeric. Add boundary tests at 15, 16 and 17 significant digits.

### P2-61. Choosing a Number, Currency or Percent format turns exact big-number strings back into doubles, so BIGINT ids and large DECIMALs show wrong trailing digits

*data-semantics · number formatting & precision · reproduced* — `src/format.ts:282`, `src/duckdb.ts:80`, `src/duckdb.ts:147`

toScalar and decimalToScalar deliberately keep BIGINT and DECIMAL values beyond 2^53 as exact strings ('A trade id that loses its last digits is worse than one rendered as a string'). The formatter undoes this on any explicit numeric kind: `let n = typeof value === 'number' ? value : Number(value);`. Reproduced with the real FormatterCache: format('1234567890123456789', {kind:'number', displayCommas:false}) gives '1234567890123456800', and format('123456789012345678.91', {kind:'number', decimals:2}) gives '123,456,789,012,345,680.00'. The formatted exports (export.ts, export-rich.ts, export-doc.ts) use the same formatter and carry the same wrong digits. Under the default 'auto' the same values render raw instead, so one column formats inconsistently either way.

**Fix:** When the value is a numeric string, pass the string itself to Intl.NumberFormat.format, which formats decimal strings exactly. Apply scale divisors in decimal arithmetic, or skip named scales for exact strings. Route exact strings through this numeric branch from 'auto' as well. Add a format test with a value above 2^53.

### P2-62. The default Float/Decimal format shows tiny negative residues as a red '(0.00)', which brings back the negative-zero display that the signDisplay fix removed

*data-semantics · number formatting & precision · reproduced* — `src/format.ts:307`, `src/format.ts:308`, `src/config.ts:529`, `src/style.ts:119`

The parentheses branch tests the unrounded value: `format.negativeParens && n < 0 ? `(${prefix}${intl.format(Math.abs(n))}${suffix})` : ...`. The `signDisplay: 'negative'` fix (format.ts:243-246) only affects Intl's own minus sign, so this branch bypasses it. numberDefaults gives every non-Integer numeric column `{ decimals: 2, negativeParens: true }`, so the shipped default takes this branch, and the negative-zero test (format.test.ts:102-109) covers only formats without parentheses. Reproduced with the real FormatterCache: -1e-12, -1e-7, -0.0012 and -0.004 all render '(0.00)', and as currency -0.004 renders '($0.00)'. valueState also tests the raw value, so a flat P&L sum carrying a -1e-12 float residue shows as a negative zero in red.

**Fix:** Decide negativity after rounding to the displayed precision, for example with formatToParts or by checking whether the rounded magnitude is zero, before choosing the parentheses branch. Apply the same rounded-sign rule in valueState for colouring. Extend the negative-zero test to the default {decimals:2, negativeParens:true} format and to currency.

### P2-63. An Integer column keeps its 0-decimal default when aggregated as an average, median, stdDev or variance, so fractional results are silently rounded to whole numbers

*data-semantics · number formatting & precision · reproduced* — `src/config.ts:525`, `src/config.ts:529`, `src/config.ts:548`, `src/snapshot.ts:139`

numberDefaults picks decimals from the source type alone: `{ decimals: type === 'Integer' ? 0 : 2, negativeParens: true }`. renderFormats never reads the column's aggregateFn, and rowColumns reports the source type 'Integer' even though avg() returns DOUBLE. aggregatesFor offers average, wavg, median, stdDev* and variance* for Integer columns. The pivot leaves inherit the measure's format, as does the pivot total when pivotStatisticColumnFunction is average. Reproduced: with qty set to Aggregation = Average, the group averages 2.5, 1.4 and 0.49 render as '3', '1' and '0', and the panel shows decimals 0, so nothing tells the user the figure was rounded.

**Fix:** Choose the defaults from the result type rather than the source type: when the column's aggregate or the pivot-total function is non-integral (average, wavg, median, stdDev*, variance*), use the 2-decimal default even for Integer columns.

### P2-64. The engine plane parses results with plain JSON.parse, so BIGINTs above 2^53 and high-precision DECIMALs are silently rounded, while the local planes keep them exact

*data-semantics · number formatting & precision · reproduced* — `src/engine-remote.ts:256`

LegendEngineExecutor returns `JSON.parse(raw)` with no reviver, and toResultTable copies the numbers unchanged. The engine writes Long and BigDecimal cells as bare JSON numbers, so precision is lost in the parse, whereas duckdb.ts toScalar/decimalToScalar keep such values as exact strings. Reproduced with JSON.parse: 9007199254740993 becomes 9007199254740992, 1823456789012345678 becomes 1823456789012345600, and 12345678901234.5678 becomes 12345678901234.568. A a cloud warehouse-style BIGINT tradeId therefore displays wrong on the engine page with no warning. Grouping and expanding on it would build a filter on the rounded key, though that path was not traced end to end.

**Fix:** Parse the execute response with a lossless JSON parser, or a reviver with source access, that keeps integers outside the safe range and decimals with more than 15 significant digits as exact values, using the same representation as the DuckDB plane.

### P2-65. A currency code that is not three letters ('$', 'US$', 'EURO') is accepted, and formatting that column then throws RangeError, so Apply is refused, or in some cases a bad format is saved and breaks later renders

*error-handling · number formatting & precision · reproduced* — `src/ui/panel-column.ts:417`, `src/format.ts:224`, `src/format.ts:230`, `src/grid/grid.ts:1189`

The currency box feeds `textInput(doc, format.currency, (currency) => patchFormat({ currency }), { placeholder: 'USD', width: 80 })` with no validation (textInput only trims). FormatterCache.#get then builds `new Intl.NumberFormat(locale, { style: 'currency', currency: format.currency ?? 'USD', ... })` outside any try and caches only on success, so every call throws `RangeError: Invalid currency code : $` (reproduced with the real FormatterCache for '$', 'US$' and 'EURO'). On the common path, Apply's try/catch rolls back and shows the raw Intl error. If the column is hidden, or its visible cells are null at Apply time, the bad format commits and is saved with the view. The grid's #render, and the formatted exports that share this formatter, then throw when the column's data appears. HIGH overstated the main flow, so this entry is MEDIUM.

**Fix:** Validate the code in the panel: uppercase it, require /^[A-Z]{3}$/, and test-construct an Intl currency formatter before accepting it. Also make FormatterCache.#get fall back to a plain number format with the text as a unit instead of throwing, because a display preference must never break rendering.

### P2-73. A saved view that fails to run is never rolled back: Load View leaves the cube on the refused snapshot, so every later action fails the same way until Undo or reload

*error-handling · saved views · reproduced* — `src/app.ts:2235`, `src/app.ts:2247`, `src/app.ts:2248`, `src/app.ts:2256`, `src/app.ts:2260`, `src/app.ts:722`, `src/app.ts:2525`

loadView assigns before it knows the view runs: `this.#snapshot = view.snapshot; this.#config = fromSnapshot(view.snapshot, this.#config); this.#renderChrome(); this.#controller.adoptTree(treeOf(view)); await this.#refresh();`, and its catch only reports: `catch (e) { this.#status(..., 'error'); }`. #refreshOr and #applyDraft's `rollback` restore the previous snapshot and config for exactly this reason (the #refreshOr comment describes the wedge). Reproduced: a stored view groups by 'book', a column the table no longer has (or names a source the current planner model lacks); Load View shows 'column book not found', app.snapshot.rows stays ['book'], and the next menu action fails with the same error because #refreshOr 'rolls back' to the broken snapshot. A malformed view (e.g. `columns: [null]`) ends the same way, since fromSnapshot throws after #snapshot was replaced. Undo recovers, which is why this is not higher, but nothing tells the user.

**Fix:** Compute the new snapshot, config and tree into locals, and on failure restore the previous snapshot, config and tree (app and controller) and repaint the chrome, as #applyDraft's rollback does.

### P2-74. Every cube on the origin shares one saved-view slot: Save View silently overwrites the only saved view, and Load View applies a view from another file, table or page without checking its source

*state-persistence · saved views · reproduced* — `src/app.ts:246`, `src/app.ts:2213`, `src/app.ts:2216`, `src/app.ts:2235`, `src/app.ts:2247`, `src/app.ts:3128`, `src/persist.ts:85`, `demo/boot.ts:410`, `demo/main-engine.ts:113`

`const VIEW_KEY = 'datacube.savedView';` is one fixed key, and both demo/boot.ts:410 (demo cube, every opened file, every warehouse table) and demo/main-engine.ts:113 pass `storage: window.localStorage`. saveView calls `storage.setItem(VIEW_KEY, ...)` with no prompt or confirmation (the menu passes `this.#config.reportTitle ?? 'view'`, and the name lives only inside the value), and loadView sets `this.#snapshot = view.snapshot` without comparing `view.snapshot.source.expression` to the open cube's source. Reproduced: Save View on the Trades cube, open budget.csv, Load View: the source becomes `#>{trades::DB.TRADES}#` and the planner refuses 'unknown table TRADES' (then the no-rollback wedge applies); saving on budget.csv instead destroys the Trades view silently, and a file whose name derives to the same table gets the other file's view applied. The stored JSON also keeps filter literals and expanded group values in localStorage after a warehouse user signs out.

**Fix:** Key saved views by source (and plane and principal for the warehouse) and name, or keep a named list; confirm before overwriting; refuse or warn with a plain message when a loaded view's source differs from the open cube's.

### P2-75. A saved view loses the 'Initially expand to level' groups and the user's closed groups, and loads a tree that disagrees with the configuration

*state-persistence · saved views · reproduced* — `src/tree.ts:150`, `src/tree.ts:137`, `src/persist.ts:95`, `src/persist.ts:235`, `src/app.ts:2256`

`get openPaths(): string[] { return [...this.#open]; }` omits #expandTo and #closed, save() writes only `expanded: options.tree.openPaths` and `showTotals`, and treeOf rebuilds with `TreeState.fromPaths(...)`, which always has expandTo 0. Reproduced: `TreeState.empty(true).withExpandTo(1).collapse(['APAC']).expand(['EMEA','FX'])` shows EMEA, AMER and EMEA/FX open; after save, load and treeOf, AMER is closed and expandTo is 0, while General Properties still reads level 1. Likewise a view saved with the grand total on, loaded into a session with showRootAggregation=false, shows the total while the checkbox is off.

**Fix:** Persist expandTo and the closed set (or the effective open set) in SavedView and restore them in treeOf; or rebuild the tree from the loaded configuration with withExpandTo(config.initialExpandToLevel) and sync showRootAggregation from view.showTotals.

### P2-76. The 'unknown fields are preserved' promise is not wired: the app drops view.unknown on re-save and CURRENT_VERSION was never bumped, so a newer view's settings are deleted silently

*state-persistence · saved views · reproduced* — `src/app.ts:2219`, `src/app.ts:2235`, `src/persist.ts:13`, `src/persist.ts:25`, `src/persist.ts:181`

persist.ts:13-15 promises that an older client re-saving a newer view 'must not silently delete the settings it did not understand', but saveView calls `save({ name, snapshot: this.#snapshot, tree, columns })` without `unknown`, and loadView never reads `view.unknown` (no `.unknown` anywhere in app.ts); inside the snapshot the migrateSnapshot allow-list drops unknown keys. `CURRENT_VERSION = 1` although pivotTotal, leafCount, childCount, keepGroupedColumns and groupDerived were added to CubeSnapshot, so an older build does not refuse a newer view with 'upgrade to open it'. Scenario: a colleague's view with a newer top-level field loads without it, and the next Save View overwrites the single slot, deleting it. The mechanism's only test (test/persist.test.ts:117-138) calls persist.ts directly, never through the app.

**Fix:** Carry view.unknown (and a snapshot-level unknown) from loadView into saveView; bump CURRENT_VERSION on each shape change with a migration per version; add an app-level load-then-save test that checks an unknown field survives.

### P2-83. Snap on an uploaded file or built sample uses the trades demo's snap target, so the snap overwrites TRADES_SNAP and then leaves the cube 'Snapped' with every query failing

*correctness · snap & live plane · reproduced* — `demo/boot.ts:194`, `demo/boot.ts:196`, `demo/boot.ts:409`, `demo/boot.ts:678`, `demo/boot.ts:684`, `src/snap.ts:246`, `src/snap.ts:283`, `src/snap.ts:286`, `src/cube.ts:505`, `src/infer.ts:242`

`snapTarget: place.snapTarget ?? snapTarget` (boot.ts:409) falls back to the global `{ table: 'TRADES_SNAP', expression: '#>{trades::DB.TRADES_SNAP}#' }`, because openFile calls makeApp with no `place` (boot.ts:684). By then `useModel(opened.model, ...)` (boot.ts:678) has replaced the planner's model with an inferred `local::DB` that has only the file's table. SnapManager runs `CREATE OR REPLACE TABLE "TRADES_SNAP" AS <file rows>` and commits `this.#state = { mode: 'snapped', ... sourceExpression: options.target?.expression }` (snap.ts:283-286) before cube.ts:505's refresh has shown that the snapped plane can answer. Reproduced with the real WasmPlanner and DuckDB-WASM: open sales.csv and press Snap. The refresh fails with "unknown table 'TRADES_SNAP' in database 'trades::DB'", the badge says Snapped, and every edit fails until the user presses Live. The failure is visible and pressing Live recovers, but Snap can never work on a file cube on the default page.

**Fix:** Derive the snap target from the model in use: have inferModel declare a sibling `<table>_snap` table and pass it as `place.snapTarget` from openFile, as the warehouse path does, or pass no target. In CubeController.snap, commit the snapped state only after the first snapped refresh succeeds; otherwise drop the table and stay live.

### P2-84. Snapping a cube pivoted on a calculated column fails with a binder error and leaves the materialised copy behind

*correctness · snap & live plane · reproduced* — `src/cube.ts:486`, `src/cube.ts:487`, `src/cube.ts:500`, `src/snap.ts:257`, `src/snap.ts:259`, `src/snap.ts:263`

The snap copies only source columns (`${snapshot.source.expression}->select(~[${columns}])`, cube.ts:487), but it passes `pivotCandidates: snapshot.pivotOn` (cube.ts:500), which can name a derived column. After the CREATE/load has run, snap.ts:263 issues `SELECT DISTINCT ${quoteIdent(col)} AS v FROM ${table} ...` per pivot column, and nothing cleans up on failure. Reproduced with the real SnapManager on DuckDB: with a calculated `decade` on Column Labels, pressing Snap gives 'Binder Error: Referenced column "decade" not found in FROM clause'. The cube stays live, but the full copy (dc_snap_N, or the target table) stays in tab memory, and on the warehouse plane the whole download has already been paid for. The values this pass captures are never read (see the dead-capture entry).

**Fix:** Remove the DISTINCT capture, or restrict it to columns the snap table has. Drop the table if any step after the CREATE/load fails. Add a CubeController.snap test with a derived pivot.

### P2-85. Rebuilding the title bar during a snap brings back an enabled toggle. A second snap then drops the first one's table, which can leave a Snapped badge over a partial table and wrong totals.

*async-concurrency · snap & live plane · reproduced* — `src/app.ts:2835`, `src/app.ts:2920`, `src/app.ts:2926`, `src/app.ts:1195`, `src/cube.ts:496`, `src/duckdb.ts:387`, `demo/boot.ts:661`

The only in-flight guard is `snap.disabled = true` on that DOM node (app.ts:2920). #buildToolbar calls `bar.replaceChildren()` and builds a fresh, enabled 'Live' button whenever the chrome is re-rendered: folding the title bar, Properties Apply, or Load View. Neither CubeController.snap nor SnapManager.snap guards against a second call, and loadArrow starts with `DROP TABLE IF EXISTS` on the fixed warehouse target. Reproduced with a streaming stand-in warehouse: snap A (5,000 rows) is loading, the user folds and unfolds the title bar and clicks Live again (snap B). B drops A's table, loads one chunk, then its stream fails. A then commits with rowCount 5000 over a table holding 1,000 rows, so the region totals show about 4.9M against a real 24.8M. The only error shown belongs to B. It takes a specific sequence of UI actions during a load, so MEDIUM rather than HIGH.

**Fix:** Allow one plane transition at a time in CubeController: a snap()/release() while one is pending returns the pending promise or refuses. Paint the rebuilt button from that pending state (disabled, 'Snapping...'). Load into a staging table and rename it into place only when the stream completes.

### P2-86. Going Live drops the snap table before checking that Live works, so a failing warehouse or expired token destroys the frozen data

*state-persistence · snap & live plane* — `src/snap.ts:291`, `src/snap.ts:294`, `src/snap.ts:296`, `src/cube.ts:508`, `src/cube.ts:510`, `src/app.ts:2929`

release() runs `this.#state = { mode: 'live' }; await ...execute(`DROP TABLE IF EXISTS ...`)` (snap.ts:294-296), and only then does cube.ts:508-511 call `refresh()` against the live plane. The toolbar only reports the error. Scenario: a warehouse user snaps at 09:00 to reconcile. Snapped queries run locally, so they keep working after the token expires. Clicking Snapped to go live drops the table, and the live refresh then gets a 401. The 09:00 snap is gone and cannot be retaken because live data has moved. The same happens when the warehouse or network is down, which is when the snap is most needed.

**Fix:** Run the first live refresh while still holding the snap, and drop the table only after the live view has landed. On failure, stay snapped and say why.

### P2-87. Opening a new table or file never releases the previous cube's snap, so snap copies pile up in the tab's DuckDB

*performance-memory · snap & live plane* — `src/app.ts:2270`, `demo/boot.ts:641`, `demo/boot.ts:683`, `src/snap.ts:291`

`dispose(): void { ...removeEventListener...; this.exitAdHoc(); this.#menu.close(); }` (app.ts:2270-2275) never calls `controller.release()`, and SnapManager.release is the only code that drops a snap table. boot.ts:641 and :683 call `app.dispose(); app = makeApp(...)` with the same engine, and the new app's SnapManager starts live and knows nothing of the old table. Scenario: snap sales.orders (up to MAX_SNAP_ROWS = 10M rows, about 500 MB per snap.ts:62-67), then open sales.trades and snap it. Both copies stay resident in the 32-bit WASM heap, which never shrinks, until later snaps or queries fail out of memory. A different user who signs in on the same tab also leaves the previous user's snapped rows in memory.

**Fix:** Make dispose() async (or have the host await it) and release the controller's snap and destroy the grid. Alternatively, have the host drop the previous snap table before it builds the next app.

### P2-88. An ENUM column sorts in declaration order on Live but alphabetically after Snap, so groups reorder and a row-capped view keeps different groups

*data-semantics · snap & live plane · reproduced* — `src/infer.ts:75`, `src/snapshot.ts:738`, `src/serialize.ts:1164`

infer.ts:75 `return isNestedType(t) ? 'SEMISTRUCTURED' : 'VARCHAR(4096)'` maps `ENUM(...)` to a String. The server sends the ENUM as plain Utf8 (ArrowStreams.java:209), so the snapped column becomes VARCHAR. The planner's `ORDER BY t0.e NULLS LAST` orders by enum index on the warehouse and by text on the snap, and `limit(maxRows+1)` comes after the sort (serialize.ts:1164-1172). Reproduced on the DuckDB 1.4.4 CLI and 1.5.4 WASM: status ENUM('new','open','closed') shows new, open, closed on Live and closed, new, open after Snap. With a Row Limit below the group count, the capped prefix is a different set of rows, and both views say only 'truncated'.

**Fix:** Give both engines the same type. Either send ENUMs as an Arrow dictionary so DuckDB-WASM rebuilds the ENUM, or declare the column VARCHAR in the model and have the planner cast to VARCHAR on Live as well.

### P2-89. String filters on UUID (and UHUGEINT) columns fail on Live with a binder or conversion error but work after Snap

*correctness · snap & live plane · reproduced* — `src/infer.ts:54`, `src/infer.ts:75`

UUID and UHUGEINT fall to `default: ... 'VARCHAR(4096)'` (infer.ts:54-76), so the cube offers String operators. The planner emits `strpos(t0.u, 'abc') > 0`, `starts_with`, `lower` and `t0.u = 'abc'` against a native UUID on the warehouse. The snapped copy arrives as VARCHAR text. Reproduced on the DuckDB CLI: 'No function matches strpos(UUID, STRING_LITERAL)', and `u = 'abc'` gives 'Could not convert string ... to INT128'. The same filters return rows on the VARCHAR copy. Scenario: 'contains 550e' on a UUID trade_id errors on Live and the grid keeps the old answer, while after Snap it works. UHUGEINT also fails strpos on Live and sorts numerically on Live (9,10,100) but lexically on Snap (10,100,9).

**Fix:** Give non-text scalar types one text view that works on both engines. Declare them VARCHAR with the planner emitting `CAST(col AS VARCHAR)` for string operators, or map them to a kind whose operators the planner casts explicitly.

### P2-90. A column collation on the warehouse (e.g. COLLATE NOCASE) is lost in the snap, so grouping, equality and sort change after snapping

*data-semantics · snap & live plane · reproduced* — `src/snap.ts:257`, `src/duckdb.ts:387`

snap.ts:257 streams the server's Arrow chunks into a table created from the Arrow schema (duckdb.ts:385-398, `create: first`). Arrow Utf8 carries no collation, and the catalog (`c.column_name, c.data_type FROM duckdb_columns()`) reports `VARCHAR COLLATE NOCASE` as plain VARCHAR. Reproduced with the DuckDB CLI, rows abc/1, ABC/2, b/3, B/4: on Live, `GROUP BY s` gives 2 groups and `s = 'Abc'` matches 2 rows. The snapped copy gives 4 groups, and the same filter matches 0 rows. Subtotals by customer name change when the user presses Snap, with no refusal and no note.

**Fix:** Have the catalog report column collations. Create the snap table with the same COLLATE before appending the chunks, or refuse to snap collated columns.

### P2-100. When a change is refused, only the app's copy of the snapshot is rolled back: the controller keeps the refused one, so expand, collapse, Snap and Live re-run it, and a no-op undo step is left behind

*state-persistence · refresh lifecycle & rollback · reproduced* — `src/cube.ts:348`, `src/cube.ts:349`, `src/cube.ts:350`, `src/cube.ts:660`, `src/app.ts:722`, `src/app.ts:728`, `src/app.ts:541`, `src/app.ts:1551`, `src/app.ts:2483`, `src/app.ts:2527`, `src/history.ts:118`

`async update(next) { this.#remember(); this.#snapshot = next; return this.refresh(); }` records the undo step and installs the new snapshot before the query runs. On failure, #fail reports the error and rethrows, and nothing restores either one. The host's rollback does only `if (previous) this.#snapshot = previous;` (#refreshOr, and the same in #applyFilter, #setCalc and #applyDraft). toggle, setTree, snap, release and refresh then run the controller's refused snapshot, and #onView copies it back into the app. Reproduced several times with jsdom and the real CubeApp: the planner refuses an alt-click sort, and afterwards app sorts=[] but controller sorts=[{total asc}]. Every group expand re-plans the refused sort, shows the same error and raises an unhandled rejection. After a transient failure (for example 'connection reset' on Apply, then Cancel), the cancelled change silently reappears on the next expand. The phantom history entry means the first Ctrl+Z re-renders the screen already showing, and Redo replays the refused query.

**Fix:** Make update() all-or-nothing, as #applyHistory already is. Capture the previous snapshot and state before #remember. When a non-stale refresh throws, restore #snapshot and drop the recorded entry, or record history only once the refresh lands. Alternatively, give the host a controller.rollback(previous) that installs the state without querying or recording.

### P2-101. A failed expand or collapse leaves the tree flipped in the controller while the screen shows the old state, so the next click on the same chevron looks like it does nothing

*error-handling · refresh lifecycle & rollback · reproduced* — `src/cube.ts:308`, `src/cube.ts:309`, `src/cube.ts:310`, `src/cube.ts:335`, `src/app.ts:541`, `src/app.ts:1551`

`async toggle(path) { this.#remember(); this.#tree = this.#tree.toggle(path); await this.refresh(); }` does not restore #tree when refresh throws, and setTree (Collapse All) has the same shape. Reproduced (r4.ts): the query to expand EMEA fails, so the error shows and the grid still shows EMEA collapsed, but tree.openPaths = ['EMEA']. The user's retry click closes it, and the refresh succeeds with EMEA still collapsed. Only a third click expands it. If the user does something else instead, the next successful refresh suddenly shows EMEA expanded, and every later query re-requests the invisible branch. This is the same missing all-or-nothing handling as the update() rollback defect, applied to the tree.

**Fix:** In toggle and setTree, capture the previous TreeState and restore it (and drop the history entry #remember pushed) when refresh() throws, but not when it returns Stale, mirroring #applyHistory. Catch the rejection in the onToggleExpand handler.

### P2-102. After a refused zone change, the drag zones and tool panel keep showing the refused layout and feed it into the next drag

*state-persistence · refresh lifecycle & rollback* — `src/app.ts:695`, `src/app.ts:696`, `src/app.ts:700`, `src/app.ts:701`, `src/app.ts:728`, `src/app.ts:1370`, `src/app.ts:1414`, `src/ui/pivot-panel.ts:331`

#refresh repaints before it queries: `this.#pivots.setColumns(next.rows, next.pivotOn); this.#sideZones.setColumns(...)`, then formats, appearance and the tool panel. #refreshOr's rollback only does `if (previous) this.#snapshot = previous;`, and #setCalc's catch restores only the snapshot and config. Only #applyDraft's rollback repaints. PivotPanel builds the next change from its own #state (`placeColumn(this.#state[zone], ...)`). Scenario: the user drags a JSON column `meta` into Column Labels. serialize refuses it ('cannot pivot on meta: it holds JSON') and the snapshot reverts, but the zone still shows the `meta` chip over an unpivoted grid. The next drop of `region` sends ['meta','region'] and is refused again, until the user notices and removes the phantom chip.

**Fix:** Share #applyDraft's rollback helper: after restoring the snapshot or config in #refreshOr, #setCalc and #applyFilter, call #pivots.setColumns, #sideZones.setColumns, #refreshFormats, setAppearance and #refreshToolPanel from the restored state.

### P2-103. Moving a chip between zones is sent as two separate query changes, so a refused move rolls back to the half-done state and silently drops the row grouping

*correctness · refresh lifecycle & rollback · reproduced* — `src/ui/pivot-panel.ts:329`, `src/ui/pivot-panel.ts:331`, `src/app.ts:1364`, `src/app.ts:1370`, `src/app.ts:695`, `src/app.ts:722`

PivotPanel #drop first reports the removal, `this.#options.onChange(other, this.#state[other]);` (329), and then the add through `this.#set(zone, placeColumn(...))` (331). Each call reaches #onZoneChange, which captures its own `previous` and calls #refreshOr(previous). Reproduced in jsdom with a real CubeApp and rows=[payload], a Variant column: dragging payload from Row Groups to Column Labels first applies rows=[], then pivotOn=[payload], which serialize refuses. The rollback restores the intermediate snapshot, giving `rows [] pivotOn []`, so the user's grouping is lost although the move was refused, and the zones show the refused layout.

**Fix:** Make a move one atomic change: add an onMove, or an onChange that carries both zones, so the app captures one `previous` and runs one query. Re-sync both PivotPanels from the restored snapshot on rollback.

### P2-104. A superseded refresh turns off the Loading overlay and 'Fetching data...' task while the newer query is still running, so stale numbers look current

*async-concurrency · refresh lifecycle & rollback · reproduced* — `src/cube.ts:359`, `src/cube.ts:457`, `src/cube.ts:458`, `src/app.ts:568`, `src/app.ts:571`, `src/app.ts:572`

Each refresh does `this.#options.onBusy?.(true); try { ... await this.#guard.issue(...) } finally { this.#options.onBusy?.(false); }` with no count of refreshes in flight and no epoch check. The app maps false straight to `this.#grid.setBusy(false)` and ends #endFetch. Reproduced with the real CubeController and an engine that honours abort: refresh A starts, B starts about 20-50 ms later, A is aborted and settles STALE, and busy=false fires while B runs for hundreds of ms more. In the app, a sort followed quickly by a filter, or any grouped and pivoted cube's cast re-run, shows the previous answer with no loading signal. The user can read or export figures that do not match their current settings.

**Fix:** Report busy from an in-flight counter, for example the guard's inflight count, or emit onBusy(false) only when the settling refresh's epoch is still current.

### P2-105. dispose() stops nothing: the old cube's in-flight queries, drag listeners and callbacks outlive it, so its late errors and Pure/SQL land over the newly opened cube

*async-concurrency · refresh lifecycle & rollback* — `src/app.ts:2270`, `src/app.ts:612`, `src/app.ts:632`, `src/app.ts:633`, `demo/boot.ts:392`, `demo/boot.ts:641`, `demo/boot.ts:683`

`dispose(): void { if (this.#onDocKey) this.#doc.removeEventListener('keydown', ...); this.#onDocKey = null; this.exitAdHoc(); this.#menu.close(); }` does not advance or abort the controller's EpochGuard, sets no disposed flag, and leaves the root's dragstart, dragend and drop listeners (which close over `this`) attached. boot.ts disposes the app, then builds a new CubeApp on the same host element. Scenario: while table A's slow query is in flight, the user opens table B. When A fails, #reportFailure appends a 'Data Fetch Failure' window into the shared root over cube B, and an unhandled rejection follows. If A succeeds instead, its onView overwrites the Generated Pure & SQL panel with A's query. A's dragstart handler still fires on B's header drags, and each reopen keeps the previous CubeApp, its grid and its result table reachable.

**Fix:** Hold the root and grid listeners in an AbortController and abort it in dispose(). Add a controller.dispose() that aborts the guard so in-flight queries resolve stale, and make #onView, #reportFailure and the host callbacks no-ops once the app is disposed.

### P2-106. An action taken while an Undo is in flight combines the undone configuration with the un-undone query, and the redo is lost

*async-concurrency · refresh lifecycle & rollback · reproduced* — `src/cube.ts:583`, `src/cube.ts:601`, `src/cube.ts:605`, `src/app.ts:949`

#applyHistory calls `this.#install(state)`, which runs restoreHost(state.host) immediately, and then awaits refresh(). The host's snapshot changes only when onView fires. A new interaction before then builds on the host's old snapshot and supersedes the undo's refresh ('A SUPERSEDED refresh is not a failure and is not rolled back'), and #remember records the state from before the undo and clears the future. Reproduced (h4.ts, 50 ms engine): pin a column, add a filter, press Ctrl+Z, then sort before the undo lands. The filter stays applied but the configuration is back to before the pin, a combination no history step produced, and canRedo=false.

**Fix:** Serialise history moves: queue interactions behind an in-flight undo or redo, or build them on the installed state. Alternatively, apply restoreHost only when the undo's view lands, and revert it if the undo is superseded.

### P2-107. Two overlapping Undos where the second fails roll back to a state that was never rendered, leaving model, configuration and screen out of sync

*async-concurrency · refresh lifecycle & rollback* — `src/cube.ts:605`, `src/cube.ts:611`, `src/app.ts:3051`, `src/app.ts:3078`

#applyHistory captures `const current = this.#state()` and on failure does `this.#install(current); rollback(current);`. `current` is the controller's model, which a still-in-flight first undo may already have moved, and nothing serialises undo (the Ctrl+Z handler calls `void this.#undo()` on every press). Scenario: the engine is failing and the screen shows S2; the user presses Ctrl+Z twice quickly. Undo 1 installs S1 and is superseded, so its failure is swallowed as stale. Undo 2 captures current=S1, installs S0, fails, and rolls back to S1 and S1's host config. The screen still shows S2, the controller and config sit at S1, and redo holds [S2]. This is the model/display split the rollback comment says it prevents.

**Fix:** Roll back to the last rendered state (#lastState) instead of the model state captured at call time, or ignore or queue undo and redo while one is in flight.

### P2-108. Undo and redo restore the configuration but not the grid appearance or the zone and title bar, so the screen disagrees with the restored settings

*state-persistence · refresh lifecycle & rollback* — `src/app.ts:584`, `src/app.ts:622`, `src/app.ts:700`

`restoreHost: (host) => { this.#config = host as CubeConfiguration; this.#refreshFormats(); this.#refreshToolPanel(); }` calls neither `this.#grid.setAppearance(...)` nor #renderChrome(), and #onView does not call setAppearance. Only #refresh and #applyDraft's rollback do. The docstring of #renderChrome says every whole-configuration swap must go through it 'or the flags and the DOM drift apart'. Scenario: apply fontSize 18, then Undo; the configuration says 11 but the grid's --dc-font-size stays 18px. Or fold the drag zones, make an undoable change and Undo: config.showDragZones is true while the bar stays hidden. The dragstart peek then returns early on `if (this.#config.showDragZones) return;`, so a header drag has nowhere to drop.

**Fix:** Route restoreHost through one shared 'adopt configuration' helper that runs #renderChrome(), grid.setAppearance(config.appearance, toColumnAppearance(config)), #refreshFormats and #refreshToolPanel.

### P2-109. The undo key ignores groups collapsed from an auto-expand level, so collapsing several of them merges into one undo step

*state-persistence · refresh lifecycle & rollback · reproduced* — `src/history.ts:60`, `src/history.ts:120`

stateKey serialises `{ snapshot: rest, open: [...state.tree.openPaths].sort(), totals: state.tree.showTotals, host }`, but TreeState also carries #expandTo and #closed, and isOpen() depends on both. Collapsing a group opened by 'Initially expand to level' only adds it to #closed, so the key does not change, and record() drops the next step as a duplicate. Reproduced (h3.ts): with expand level 1, collapse EMEA and then AMER, and past depth is 1. One Ctrl+Z reopens both groups, the 'only EMEA closed' state cannot be reached, and redo jumps back to both closed.

**Fix:** Include expandTo and the sorted closed set in stateKey, exposing them from TreeState alongside openPaths.

### P2-110. While a refresh is in flight, the context menu pairs the old view's rows with the new snapshot's dimensions and offers a filter on the wrong column

*async-concurrency · refresh lifecycle & rollback* — `src/app.ts:694`, `src/app.ts:1449`, `src/app.ts:1458`

#refresh sets `this.#snapshot = next` before the query lands, while #view and #treeRows stay on the previous view until onView. The menu mixes the two: `const meta = this.#treeRows[abs]` with `column = this.#snapshot.rows[path.length - 1]`. The busy overlay is a small centred badge and does not block the grid. Scenario: on a slow Live warehouse cube grouped by [region, desk], the user moves desk above region and right-clicks 'EMEA' on the still-visible old grid. The menu offers "Add Filter: desk = 'EMEA'", and choosing it empties the grid. After removing a dimension, `path.length - 1` indexes past the new rows and the column is undefined.

**Fix:** Resolve the context menu against the snapshot of the view on screen (this.#view.snapshot) for everything derived from treeRows, or disable value filters while the view's snapshot differs from #snapshot.

### P2-111. Presentation-only changes (column resize, pin, hide, auto-size, minimise, size-to-fit, unpin-all) re-run every query of the cube

*performance-memory · refresh lifecycle & rollback* — `src/app.ts:550`, `src/app.ts:1580`, `src/app.ts:1724`, `src/app.ts:1809`, `src/app.ts:1836`, `src/app.ts:1839`, `src/app.ts:1962`, `src/app.ts:1987`, `src/app.ts:702`

`async #setConfiguration(next) { if (next === this.#config) return; this.#config = next; await this.#refresh(); }`, and #refresh always ends in `this.#controller.update(...)`, which re-runs fetchTree or the flat query with no result cache. `column.unpinAll` goes through `#refreshOr(null)`. config.ts itself states that 'restyling a cube must never re-run a query'. Scenario: on a Live warehouse cube with 10 regions expanded, each column-edge drag release (grid.ts:903 → onResizeColumn → #patchColumn) sends 11 or more SQL statements, shows 'Loading...', and fails with an error alert if the warehouse token has expired.

**Fix:** Compare applyToSnapshot(snapshot, next) with the current snapshot. When the part that shapes the query is unchanged, rebuild the column model and repaint from the existing view instead of calling controller.update, and record the undo step separately.

### P2-112. Every refresh rebuilds the grid body before the query runs, then renders the header twice and the body again when the result lands

*performance-memory · refresh lifecycle & rollback* — `src/app.ts:700`, `src/app.ts:779`, `src/app.ts:952`

#refresh calls `this.#grid.setAppearance(this.#config.appearance, toColumnAppearance(this.#config));` on every refresh, whether or not the appearance changed. setAppearance sets `#rendered = null; this.#render()` (grid.ts:504-507), a full rebuild of the current window against the old rows. #onView then calls setColumns (header render), setSorts (a second header render) and setRows (another full body render), then #fit, which measures every cell. #syncPivotCast and #syncCalcTypes can trigger a second full refresh. The auditor measured about 430 ms per full window rebuild at 401 columns (a verifier did not re-measure this), so each sort, filter or expand spends about 0.9 s of main thread on rendering alone.

**Fix:** Apply appearance through CSS variables and re-render only when it actually changed. Render the header once per view, either by merging setColumns and setSorts or by having setSorts update the sort marks in place.

### P2-113. All ok and warn feedback goes only to the optional onStatus callback, which both shipped hosts drop, so refused or finished actions show nothing

*error-handling · refresh lifecycle & rollback* — `src/app.ts:664`, `src/app.ts:1721`, `src/app.ts:1749`, `src/app.ts:1993`, `src/app.ts:2154`, `src/app.ts:2239`, `src/app.ts:2297`, `demo/boot.ts:471`, `demo/boot.ts:472`, `demo/main-engine.ts:135`

`#status(text, kind) { this.#options.onStatus?.(text, kind); }` is the only channel, and the cube's own status bar shows only timing and truncation. Both hosts start with `if (kind !== 'error') return;`. The following are all dropped: 'saved "..."', 'no saved view', 'Ad Hoc Analysis needs at least one dimension column', 'a pivot total cannot be sorted on', 'nothing to resize', 'Nothing to undo', 'copied', and the Ad Hoc 'Navigating without data -- Refresh to query' warning (mode.ts:152). Scenario: an Ad Hoc user with 'Navigate without data' on zooms in, the grid keeps the old numbers, and the only signal is discarded, so the stale grid reads as current. A click on a pivot-total header, or on Ad Hoc Analysis with no dimension, does nothing and says nothing.

**Fix:** Give the cube its own transient message slot in the status bar, or a toast, for ok and warn messages, and keep onStatus as an extra notification for hosts. At minimum, have the hosts render warnings.

### P2-117. Right-click filters on a tree group use the raw path text, so a NULL group filters on an internal sentinel (empty grid) and number/date groups offer <, <=, >, >= filters the planner refuses

*correctness · tree view & grouping · reproduced* — `datacube/src/app.ts:1457-1459`, `datacube/src/treeview.ts:107-118`, `datacube/src/serialize.ts:494`, `datacube/src/serialize.ts:517-560`, `datacube/src/ui/menu.ts:740-757`, `datacube/src/tree.ts:20`

For a TREE_COLUMN cell the menu value is the path segment as it is: `value = path.length > 0 ? (path[path.length - 1] ?? null) : undefined;` (app.ts:1459). Path segments are the strings groupValue writes: SQL NULL becomes `NULL_GROUP = '\u0000null'`, a Date becomes 'YYYY-MM-DDTHH:MM:SS', and a number becomes String(n). The drill-down path turns them back into typed values (parentConditions/keyValue, NULL_GROUP to isEmpty), but this path does not. So menu.ts filterSubmenu never takes its `value === null` branch, which offers isEmpty/isNotEmpty. Reproduced through the real buildMenu, applyMenuAction and filterExpression: right-clicking the blank NULL region group offers "Add Filter: region = 'null'" (with an invisible NUL) and applies `$x.region == '\u0000null'`, which matches no row, so the grid goes empty. On an Integer `year` group, More Filters > '<' sends `$x.year < '2021'` and fails with "no overload of ... lessThan ... (INTEGER, STRING)" for all four ordering operators on Integer, Float, Decimal, StrictDate and DateTime dimensions. Rated MEDIUM, not the HIGH one member claimed: '=' and '!=' on typed keys still work because DuckDB casts the string, the ordering filters fail with a visible error and are reverted, and the NULL filter is visible in the filter panel.

**Fix:** Decode the segment in the TREE_COLUMN branch the way parentConditions does: NULL_GROUP becomes null (which brings up the is-empty items), and anything else goes through keyValue(columnType, segment) (export it from serialize.ts), or a shared `segmentValue(snapshot, column, text)` helper. Add menu tests that right-click a NULL group and a date group.

### P2-118. 'Show grouped columns' copies the internal NULL-group sentinel into the rebuilt dimension columns, so the grid shows 'null' with a hidden NUL character and CSV/HTML exports write a raw NUL byte

*data-semantics · tree view & grouping · reproduced* — `datacube/src/treeview.ts:532-539`, `datacube/src/treeview.ts:566`, `datacube/src/treeview.ts:108`, `datacube/src/treeview.ts:512`, `datacube/src/serialize.ts:494`, `datacube/src/app.ts:2091`

keptDims builds each dimension column from the row paths: `values: rows.map((row) => (row.level > d ? (row.path[d] ?? null) : null))` (treeview.ts:536-538). A NULL key's segment is NULL_GROUP = '\u0000null'. labelOf maps that back to null (`own === NULL_GROUP ? null : own`, line 512), but only for the tree column. Reproduced with assemble() and keepGroupedColumns: true: with region values [null, 'EMEA'], the kept region column comes out as ["\u0000null","EMEA"] on the NULL group's row and on every row under it. The grid shows 'null' after an invisible NUL, and toCsv(view.rows) writes `,\u0000null,1`, a NUL byte that breaks many downstream parsers. The perDimension branch (line 566, `counted(row.path[d] ?? null, i)`) has the same leak, but no product caller reaches it today. The same root cause (a path segment leaving the tree without being decoded) also produces the context-menu defect in the right-click filter entry.

**Fix:** Map NULL_GROUP to null, and use the dimension's real type, when rebuilding keptDims and the per-dimension columns. Better, route every path segment that leaves the tree through one decode helper, shared with the context-menu fix. Extend the sentinel test (treeview.test.ts:223-240) to keepGroupedColumns and perDimension.

### P2-121. When 'Initially expand to level' reaches the deepest dimension, the first click on a deepest group's expander does nothing; it takes two clicks to open

*correctness · tree view & grouping · reproduced* — `datacube/src/tree.ts:154-167`, `datacube/src/tree.ts:185-195`, `datacube/src/cube.ts:308-311`, `datacube/src/app.ts:540-542`

`toggle(path) { return this.isOpen(path) ? this.collapse(path) : this.expand(path); }` calls isOpen without `depth`, which defaults to Infinity. The renderer (flattenTree and requiredLevels) calls `state.isOpen(child, depth)`, where `path.length < depth` is false for the deepest groups, so those rows render as collapsed. toggle, however, sees them as open, calls collapse, and that only adds the key to #closed. The row stays collapsed, and the second click finally expands it. Reproduced: with depth 2 and withExpandTo(2), row A/x shows expanded=false, and after toggle(['A','x']) it is still expanded=false. With a one-dimension cube and 'Initially expand to level: 1' (the UI minimum, panel-general.ts:320), every group needs two clicks, and the first click still runs a full refresh with a spinner.

**Fix:** Make toggle use the same predicate as the renderer: toggle(path, depth), with the controller passing snapshot.rows.length. Alternatively, make isOpen's expand-level branch independent of the caller-supplied depth. Add a test that toggles a deepest group under expandTo.

### P2-122. Every expand, collapse, sort or filter re-runs the query for every open tree level, one after another, so a click's cost grows with the number of open groups (hundreds of queries and 15+ s with the expand level)

*performance-memory · tree view & grouping · reproduced* — `datacube/src/treeview.ts:180`, `datacube/src/treeview.ts:194-237`, `datacube/src/cube.ts:303-311`, `datacube/src/tree.ts:154-162`, `datacube/src/engine-remote.ts:184-201`, `datacube/src/warehouse.ts:146-174`

fetchTree starts each refresh with `const levels = new Map<string, LevelData>()` (treeview.ts:180). It then runs `for (const request of wanted)` and awaits withChildPivotCast, deps.runner.run, withPivotTotals and withChildAggregates for each request in turn, although the requests in a round are independent. CubeController.toggle calls refresh(), which calls fetchTree from scratch. Its docstring says "Only the newly-opened branch is fetched", which the code does not do. Measured with the real planner and DuckDB-WASM: 300 regions, rows [region, desk, book] and expand level 1 took 301 queries and 15.9 s on first load, and another 301 queries and 14.9 s for a single sort click. On the demo, chevron clicks 1-6 issued 5, 8, 9, 10, 11 and 12 queries (one more per group already open). On the engine plane each query is two sequential POSTs (grammarToJson, then execute), and on the warehouse each is at least a POST, a chunk GET and an awaited DELETE. A pivoted child level adds up to three more queries.

**Fix:** Keep LevelData across refreshes, keyed by requestKey plus a hash of the snapshot without its epoch, so a toggle fetches only the newly opened level and a snapshot change invalidates only what it affects. Run the independent requests of a round concurrently through a small pool, or batch the siblings of a level into one query filtered on the parent keys. Cache grammarToJson results by text in the engine client. Fix the toggle docstring.

### P2-123. assemble() is quadratic in the rows of a level and in value columns, freezing the UI thread for seconds on large levels or wide pivots

*performance-memory · tree view & grouping · reproduced* — `datacube/src/treeview.ts:480`, `datacube/src/treeview.ts:497`, `datacube/src/treeview.ts:585`

For every display row, `data.paths.findIndex((p) => pathKey(p) === pathKey(row.path))` (treeview.ts:480) scans the level linearly and rebuilds both key strings on every comparison, so the cost is O(R_level^2). For every cell, `hit.data.table.columns.find((c) => c.name === name)` (line 585) does another linear search, which is O(V*R*C), and countOf repeats this for the leaf count (line 497). Timing the real assemble() in Node: one level of 20,000 groups took about 5.6 s (Row Limit goes up to 1,000,000, panel-general.ts:332), 501 rows x 2,000 pivot columns took 3.6 s, and 1,000 x 500 took 616 ms. This runs synchronously on the main thread in every refresh, and runs twice when #syncPivotCast re-runs.

**Fix:** Build a Map<pathKey, index> once per level and a Map<name, column> once per level table, then look each value up in O(1).

### P2-127. The host toggles instead of applying the requested expand state, so a double-click on a chevron or a repeated ArrowRight during an in-flight query expands and then collapses the group again

*async-concurrency · tree view & grouping · reproduced* — `datacube/src/app.ts:540-542`, `datacube/src/grid/grid.ts:1047-1049`, `datacube/src/grid/grid.ts:1320-1322`, `datacube/src/cube.ts:308-311`

The grid sends a target state: `onToggleExpand?.(key, !expanded)`, read from the stale DOM aria-expanded (grid.ts:1047-1049), and `onToggleExpand?.(meta.key, true)` on ArrowRight (grid.ts:1322). The app discards it: `onToggleExpand: (key) => { void this.#controller.toggle(parsePathKey(key)); }` (app.ts:540). controller.toggle flips the tree state immediately, while the DOM and rowMeta stay stale until the view lands. The second click of a double-click also reaches the chevron branch, because #onDoubleClick returns early for chevrons. Reproduced with the real CubeApp, a 300 ms engine delay and rows ['region','desk']: focusing EMEA and pressing ArrowRight twice ends with openPaths [] and aria-expanded=false, and two queries and two undo entries were recorded. A single ArrowRight expands the group correctly.

**Fix:** Pass the requested state through and apply it explicitly (a controller setExpanded(path, expanded) that is a no-op when the state already matches) instead of toggle. In the grid, also skip the chevron branch when `event.detail > 1`.

### P2-129. Drill-through silently stops at 500 rows in engine scan order, and nothing says the list is incomplete

*data-semantics · drill-through* — `datacube/src/drill.ts:36`, `datacube/src/drill.ts:97`, `datacube/src/drill.ts:98`, `datacube/src/app.ts:2010`, `datacube/src/app.ts:2019`, `datacube/src/app.ts:2022`

drill.ts:97-98 always appends `limit(${request.limit ?? DEFAULT_DRILL_LIMIT})` with DEFAULT_DRILL_LIMIT = 500 and no sort. The only caller (app.ts:2010) passes no limit, and it never asks for limit+1 the way the tree does for `truncated`. The overlay renders only `pre.textContent = toCsv(table)` under the fixed title 'Drill-through', with no row count and no truncation note. Scenario: the user activates a subtotal built from 12,000 trades and gets an arbitrary 500 rows (whichever the engine scans first) that do not add up to the figure, with nothing saying they are a subset. The aggregate on the grid is still correct, so this is MEDIUM, but the audit view looks complete when it is not and can change between runs.

**Fix:** Request limit+1. When the extra row comes back, show 'first 500 of more than 500 rows' in the overlay and offer a full export. Apply the cube's detail-level total order (totalOrderSorts) so the peek is stable. Show the row count.

### P2-130. Drill-through pins group keys as untyped strings, unlike tree expansion, so drilling a JSON/Variant-keyed group returns zero rows

*data-semantics · drill-through · reproduced* — `datacube/src/drill.ts:51`, `datacube/src/drill.ts:54`, `datacube/src/drill.ts:56`, `datacube/src/serialize.ts:519`, `datacube/src/serialize.ts:526`, `datacube/src/serialize.ts:534`

drill.ts:51-54 `pin` puts the raw path text into `{ kind: 'condition', column, operator: 'equal', value }`. Tree expansion instead goes through parentConditions -> keyValue (serialize.ts:519-526), which turns a Variant key into `{ json }` and a temporal key into a Date. The exported typed helper `memberConditions` (serialize.ts:534) is not used here. Reproduced with the real WASM planner and DuckDB-WASM on a JSON column j with rows {"a":1} x2 and "x": the tree shows amt 3 and 4, but the drill emits `filter(x|$x.j == '{"a":1}')->limit(500)` and returns 0 rows with no error. The detail query for the same group (`fromJson(...)`) returns 2. A date key is pinned the same way (`$x.traded == '2024-01-05T00:00:00'`, a String against a StrictDate), but DuckDB casts it implicitly and returns the right rows. So on the local engine the silent wrong answer is limited to Variant keys, and on other engines it is unverified.

**Fix:** Build drill's row-path (and pivot) conditions with the same typed rule as expansion: `memberConditions(snapshot, snapshot.rows, path)`. Add a drill test for each key type (Variant, StrictDate, DateTime, NULL).

### P2-131. Drill-through has no stale-result guard: on a remote engine, a slow earlier drill can overwrite the window of a later one

*concurrency · drill-through* — `datacube/src/app.ts:2006`, `datacube/src/app.ts:2015`, `datacube/src/app.ts:2019`, `datacube/src/app.ts:2729`

#drillThrough awaits `this.#controller.runQuery(pure, view.snapshot)` with no epoch, sequence number or AbortSignal, then calls `#showOverlay('Drill-through', ..., { replace: true })`. With `replace`, the window's contents are rebuilt by whichever result arrives last. On the Live warehouse plane (PlanThenRun over WarehouseEngine, and RemoteRun too), each drill makes its own request with no queue, so results can arrive out of order. The in-tab DuckDB-WASM plane runs queries FIFO and is not affected. Scenario: the user presses Enter on a big group, moves down, and presses Enter on a small group. The small group's rows appear first, then the big group's rows replace them in the same untitled window. If the user already closed the window, it pops open again. The losing query is never cancelled.

**Fix:** Keep a drill sequence number or AbortController on the app. Abort the previous drill when a new one starts, and drop any result whose sequence is no longer current. Put the drilled group in the window title.

### P2-134. Right-clicking a pivot result cell offers 12 value filters on a column that exists only after the pivot, and every one of them is refused

*correctness · context menu* — `/Users/neema/legend/legend-lite/datacube/src/app.ts:1462`, `/Users/neema/legend/legend-lite/datacube/src/app.ts:1471`, `/Users/neema/legend/legend-lite/datacube/src/app.ts:1475`, `/Users/neema/legend/legend-lite/datacube/src/ui/menu.ts:747`, `/Users/neema/legend/legend-lite/datacube/src/serialize.ts:739`

#wireContextMenu clears `value` for pivot TOTAL columns (`isPivotTotalColumn`) and for group-stage calculated columns ('every filter runs before it -- so a value filter on one could only ever be refused'). It does not clear it for ordinary pivot leaves such as `2021__|__notional`. `columnType` for such a leaf is undefined because rowColumns() has no such column, so menu.ts falls back to `filterOperatorsFor(ctx.columnType ?? 'String')` and offers 6 comparisons plus 6 text predicates (contains/startsWith on a number). serialize.ts emits `filter(x|...)` before the pivot. Scenario: with pivotOn=[year], right-click a 2021/notional cell showing 1234.5 and pick 'Add Filter: 2021 / notional = 1234.5'. The query is `filter(x|$x.'2021__|__notional' == 1234.5)->...->pivot(...)`, the planner refuses the unresolvable column, and #refreshOr shows an error and reverts. menu.test.ts checks only the pivot.* entries on a pivoted column, never the filter entries.

**Fix:** Set value undefined when the column is a pivot leaf (facts.pivotBase is defined / leaf path length > 1), matching the pivot-total and groupDerived guards. More generally, offer no value filter for any column absent from rowColumns(snapshot). Replace the `?? 'String'` operator fallback with 'no operators', or map the cell to its pivot key plus the measure's source column. Add a menu test asserting that a pivoted column has no enabled filter.add.

### P2-135. A value filter taken from a group (aggregated) row filters source rows by the group total or a blank, which silently empties the cube

*data-semantics · context menu* — `/Users/neema/legend/legend-lite/datacube/src/app.ts:1462`, `/Users/neema/legend/legend-lite/datacube/src/ui/menu.ts:740`, `/Users/neema/legend/legend-lite/datacube/src/serialize.ts:739`

For any non-tree cell, app.ts reads `this.#view.rows.columns[leaf.index]?.values[abs]` without checking whether row `abs` is a group row. #treeRows is consulted only for the tree column. menu.ts then offers `filterItem(column, 'equal', value)`, or the is-null/is-not-null pair for a blank cell, and the filter is applied to snapshot.filter, which runs before groupBy. Scenario: with rows=[region] and measure sum(notional), right-click EMEA's notional cell showing 12,000,000 and choose 'Add Filter: notional = 12000000'. Only source trades whose own notional equals the group total survive, so every group disappears and no error is shown. Similarly, a group row's `desk` cell is blank (uniqueValueOnly over several desks gives null), so the menu leads with 'Add Filter: desk is null', which removes every row.

**Fix:** Pass a value only when the row is a detail row (isDetailPath) or the column is one of that level's grouping keys. On aggregated measure cells, omit the value-filter entries or label them clearly as source-row filters.

### P2-136. The tree-column header menu targets the internal '__tree' column: Sort sends ORDER BY __tree and is refused, and Hide/Heatmap/Copy expose the internal name

*correctness · context menu* — `/Users/neema/legend/legend-lite/datacube/src/grid/grid.ts:619`, `/Users/neema/legend/legend-lite/datacube/src/ui/menu.ts:466`, `/Users/neema/legend/legend-lite/datacube/src/ui/menu.ts:799`, `/Users/neema/legend/legend-lite/datacube/src/snapshot.ts:722`, `/Users/neema/legend/legend-lite/datacube/src/app.ts:1752`

The tree header gets `el.dataset['column'] = leaf.name`, which is TREE_COLUMN='__tree'. The header path in #wireContextMenu does not remap it (only tree *cells* are remapped), and buildMenu gates Sort only on `disabled: !column`, so sort.asc yields `sorts: [{ column: '__tree', ... }]`. totalOrderSorts keeps it because '__tree' is not in s.rows (`present.has(x.column) || !s.rows.includes(x.column)`). A header click instead goes through #sortByHeader, which flips config.treeColumnSort. Scenario: right-click the tree header and choose Sort > Ascending. The level query becomes `...->groupBy(~[region], ...)->sort([~__tree->ascending(), ...])`, the planner refuses the column, and the change is rolled back with an error. The same menu shows 'Hide __tree', 'Add Heatmap to __tree' and similar entries.

**Fix:** Treat TREE_COLUMN as its own context in buildMenu: map Sort asc/desc to treeColumnSort (as #sortByHeader does), disable Clear Sort/Hide/Heatmap/per-column entries, and label it with the tree's display name.

### P2-137. Context-menu arrow keys walk hidden submenu items: ArrowUp gets stuck on every entry that follows a submenu, and there is no ArrowRight/ArrowLeft or aria-expanded

*accessibility · context menu · reproduced* — `/Users/neema/legend/legend-lite/datacube/src/ui/menu-view.ts:39`, `/Users/neema/legend/legend-lite/datacube/src/ui/menu-view.ts:245`, `/Users/neema/legend/legend-lite/datacube/src/ui/menu-view.ts:253`, `/Users/neema/legend/legend-lite/datacube/src/ui/menu-view.ts:259`, `/Users/neema/legend/legend-lite/datacube/src/grid/grid.css:692`, `/Users/neema/legend/legend-lite/datacube/src/grid/grid.css:696`

`items` is `querySelectorAll('[role="menuitem"], [role="menuitemcheckbox"]')` over the whole menu, including nested submenu children. ArrowUp does `items[(current - 1 + items.length) % items.length]?.focus()`. A `.dc-submenu` is `display: none` unless its parent is :hover or :focus-within, and focus() on a display:none element is a no-op. Reproduced in Chromium with the real MenuView: ArrowDown walks Copy→Sort→Ascending→Descending→Filters..., but ArrowUp from Filters... stays on Filters... on every press. In the grid menu, almost every top-level entry (Email, Copy, Sort, Filter, Pivot, Resize, Pin, Hide, Plot, ...) follows a submenu parent, so upward movement is dead throughout. ArrowDown reaches the end only by stepping through every submenu item (about 60 stops). There is no ArrowRight/ArrowLeft case and submenu parents never get aria-expanded, contrary to the APG menu pattern the file cites. menu-view.test.ts uses a fixture with no submenus and so cannot see any of this.

**Fix:** Navigate only the current level's direct children (`:scope > [role=menuitem]` of the open menu or submenu). ArrowRight/Enter on a parent opens its submenu and focuses the first child, and ArrowLeft/Escape returns to the parent. Set aria-expanded on parents. Add a test with a submenu fixture.

### P2-138. Choosing a menu entry runs the action first and then close() pulls focus back to the grid, taking it from the dialog the action just opened

*accessibility · context menu · reproduced* — `/Users/neema/legend/legend-lite/datacube/src/ui/menu-view.ts:177`, `/Users/neema/legend/legend-lite/datacube/src/ui/menu-view.ts:217`

The item click handler is `this.#options.onSelect(item); this.close();`, and close() ends with `(back as HTMLElement).focus()` on #returnFocus. Export entries synchronously reach #confirmExport → #alert → buildAlert, which does `buttons[0]?.focus()` on Decline (alert.ts:87), and that focus is immediately overwritten. Reproduced with the real CubeApp: focus a cell, open the menu, choose Export > CSV. The alertdialog is open, but document.activeElement is the dc-cell showing 600.00. Pressing Enter goes to the grid's onActivateCell → #drillThrough and opens a Drill-through window behind the unanswered confirmation. The same applies to every window opened from a menu (Filters..., Properties..., Add New Column..., Settings...) and to title-bar menu actions, where focus returns to the burger button.

**Fix:** Close the menu before running onSelect, or have close() restore focus only when focus is still inside the menu (`this.#el.contains(doc.activeElement)` before removal). Have #showOverlay move focus into the new window.

### P2-139. Submenus never flip: the .dc-flip-x rule is never applied, so near the right or bottom edge submenus open off-screen and cannot be reached

*correctness · context menu · reproduced* — `/Users/neema/legend/legend-lite/datacube/src/grid/grid.css:692`, `/Users/neema/legend/legend-lite/datacube/src/grid/grid.css:710`, `/Users/neema/legend/legend-lite/datacube/src/ui/menu-view.ts:232`

grid.css defines `/* A submenu that would run off the right edge opens leftward. */ .dc-menu.dc-flip-x .dc-submenu { left: auto; right: 100%; }`, but grep of src/ and demo/ finds 'dc-flip' only in grid.css. #place flips only the top-level menu (`x + rect.width > vw ? Math.max(0, x - rect.width) : x`), and submenus are always `left: 100%; top: -3px` with no vertical check. Traced with Playwright, real CSS, 1280px viewport: a menu at left 1150 puts the hovered Sort submenu at 1311-1473, entirely off-screen. In the product, right-clicking a cell in the last couple of columns makes #place flip the menu so its right edge sits at the pointer, and then every submenu (Export, Email, Copy, Sort, Filter, Pivot, Resize, Pin, Heatmap) runs off the right edge. The menu is position:fixed, so no scroll reaches those entries. Long submenus opened near the bottom run below the viewport the same way.

**Fix:** On submenu open (pointerenter/focusin), measure it and toggle dc-flip-x when rect.right > innerWidth, and shift it up when rect.bottom > innerHeight. A cheaper alternative is to set dc-flip-x in #place whenever x + 2×menuWidth > vw.

### P2-143. On touch-only iPad/iPhone WebKit there is no way to open the context menu, so Export, Email, Copy, Sort and value filters cannot be reached

*browser-compat · context menu* — `/Users/neema/legend/legend-lite/datacube/src/app.ts:1426`, `/Users/neema/legend/legend-lite/datacube/src/ui/menu.ts:411`, `/Users/neema/legend/legend-lite/datacube/src/app.ts:2950`, `/Users/neema/legend/legend-lite/datacube/src/adhoc/mode.ts:96`, `/Users/neema/legend/legend-lite/datacube/src/adhoc/mode.ts:207`

`this.#els.grid.addEventListener('contextmenu', ...)` is the only way into buildMenu's Export/Email/Copy groups. The hamburger menu carries Undo/Redo/Settings/view/host items but not Export or Copy, and grep finds no touchstart, long-press or pointerType handling in src. iOS/iPadOS WebKit does not fire contextmenu for a touch long-press. Scenario: an iPad user without a mouse long-presses a cell, gets the system callout or nothing, and cannot export, email or copy the view at all. Ad Hoc mode has the same entry point.

**Fix:** Open the same menu on a long-press (pointerdown with pointerType 'touch' held about 500 ms, cancelled on move). Also expose Export/Copy from the hamburger menu.

### P2-146. An invalid number shows #ERR, but OK still closes the window with the old value, and an invalid list entry is stored as "NaN" and silently left out of the filter

*error-handling · filter editor · reproduced* — `datacube/src/ui/filter-editor.ts:1146-1152`, `datacube/src/ui/filter-editor.ts:907`, `datacube/src/ui/filter-editor.ts:1258-1263`, `datacube/src/ui/filter-editor.ts:429`

When the number field's text does not parse, its commit only does `input.value = '#ERR'` and never calls onChange, so the draft keeps the previous number. apply() then returns early (`if (!this.dirty) return true;`), and OK closes the window. #problem is never set. For lists, push stores `String(evaluateArithmetic(v))`, which is the text "NaN". conditionOf later drops that entry through parseTyped → null, and if every entry is invalid the whole condition is dropped. Scenario: with filter `notional > 100`, the user types "25O" (letter O) and clicks OK. The window closes with the cube still at > 100. In a number `not in` list, the entry "1O" appears as NaN but excludes nothing.

**Fix:** Treat #ERR, or any input that does not parse, as a blocking error: set #problem and make apply() refuse while the error stands. Reject NaN in the list's push instead of storing it.

### P2-147. A value typed into a list's 'Add value' box is thrown away when the user clicks Done, OK or Apply without first pressing Enter or '+'

*error-handling · filter editor* — `datacube/src/ui/filter-editor.ts:1254-1277`, `datacube/src/ui/filter-editor.ts:906-919`, `datacube/src/ui/filter-editor.ts:970-973`

The add input listens only for keydown Enter/Escape, and the '+' button is the only other way to add an entry: `const push = (): void => { const v = add.value.trim(); ... set([...items, ...]) }`. It has no change or blur listener. Done just runs `this.#openList = null; this.render();`, which discards the input, and apply() builds the filter only from #tree. Every other value field in the editor saves on change or blur, so this is the one field that does not. Scenario: with `region in [EMEA]`, the user opens the list, types APAC and clicks OK. The window closes with only EMEA applied and no warning.

**Fix:** Add any non-empty pending value when the user clicks Done, when the field loses focus, and before apply(). Alternatively, disable OK/Apply while the add field holds unsaved text.

### P2-148. Number filter fields remove every comma, so a decimal comma is read as a thousands separator: "1,5" becomes 15

*data-semantics · filter editor · reproduced* — `datacube/src/ui/filter-editor.ts:191`, `datacube/src/ui/filter-editor.ts:267`, `datacube/src/ui/filter-editor.ts:1142`, `datacube/src/ui/filter-editor.ts:1146-1150`, `datacube/src/ui/filter-editor.ts:1262`, `datacube/src/app.ts:302`, `datacube/src/format.ts:224`

evaluateArithmetic starts with `const src = text.replace(/,/g, '').trim();`, and every number path goes through it: parseTyped, the #numberInput commit and arrow keys, and list entry. The grid formats numbers in the browser's locale (FormatterCache is built with no locale, and Intl.NumberFormat(undefined)). The field also sets inputMode='decimal', which on touch keyboards in comma-decimal locales offers ',' as the decimal key. Reproduced: '1,5' becomes 15, '1234,5' becomes 12345, and '1.234,50' becomes 1.2345. Scenario: a de-DE user reads 1,5 in the grid, filters `rate > 1,5`, and gets `rate > 15`. The field does redisplay 15 after the commit, so the change is visible but easy to miss.

**Fix:** Parse with the same locale's group and decimal separators (from Intl.NumberFormat(locale).formatToParts), or reject an ambiguous comma rather than deleting it. Add a de-DE test.

### P2-149. Integer IDs above 2^53 typed into a number filter are rounded, so the filter matches the wrong row or none

*data-semantics · filter editor · reproduced* — `datacube/src/ui/filter-editor.ts:200`, `datacube/src/ui/filter-editor.ts:267`, `datacube/src/ui/filter-editor.ts:1146-1148`, `datacube/src/ui/filter-editor.ts:1262`, `datacube/src/snapshot.ts:494`, `datacube/src/serialize.ts:113-121`, `datacube/src/duckdb.ts:78-86`

evaluateArithmetic converts the digits with `return Number(m[0]);`. The number field then writes `input.value = String(n)` back into itself, and FilterValue has no bigint or exact-decimal form. Reproduced: 1541815603606036480 becomes `$x.id == 1541815603606036500`, and 123456789012345678 becomes 123456789012345680. The grid does not have this problem: duckdb.ts deliberately keeps BIGINT and large DECIMAL values as exact strings. So the user can copy an exact trade ID from the grid, and the filter for it still matches no row or the wrong one. Decimals with more than about 16 significant digits lose precision the same way.

**Fix:** For Integer and Decimal columns, keep the literal text when it contains no arithmetic operators, check that it is an exact decimal, and carry it as an exact value (string-backed or bigint) through to the Pure literal. Evaluate arithmetic only when operators are present.

### P2-150. Reopening the Filters window silently drops or rewrites conditions whose value is '', a numeric-looking string, or a quoted string, and the next Apply publishes the damaged filter

*state-persistence · filter editor · reproduced* — `datacube/src/ui/filter-editor.ts:683-694`, `datacube/src/ui/filter-editor.ts:690`, `datacube/src/ui/filter-editor.ts:267`, `datacube/src/ui/filter-editor.ts:285-289`, `datacube/src/ui/filter-editor.ts:375-381`, `datacube/src/ui/filter-editor.ts:429`, `datacube/src/ui/filter-editor.ts:449-451`, `datacube/src/ui/filter-editor.ts:630-642`, `datacube/src/ui/filter-editor.ts:771`, `datacube/src/ui/menu.ts:741-749`, `datacube/src/ui/menu.ts:820-837`, `datacube/src/duckdb.ts:79-85`

The editor turns each stored value into display text with scalarText and reads it back with parseTyped, and that round trip loses information. scalarText quotes only non-blank numeric-looking strings (`if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) return `"${value}"`;`), with three results: (1) '' becomes empty text, and the text arm returns null for it (`if (t === '') return null;`); (2) a quoted numeric string on a number column, such as a BIGINT id that toScalar turned into a string, reaches evaluateArithmetic and gives NaN, so it becomes null; (3) a real value '"N/A"' has its quotes stripped by parseTyped and becomes 'N/A'. toFilterNode drops the null conditions, and because `#applied` is computed from this already-damaged draft, the editor opens as not dirty and gives no sign of the loss. Scenario (reproduced with the real menu and editor): the filter is and(notional>5, region=='') from "Add Filter: region = ''". The user opens Filters, changes 5 to 6 and clicks OK. The published filter is just `notional > 6`, so the grid widens without warning.

**Fix:** Build the draft from the stored FilterValue rather than from display text. Alternatively, make the text encoding reversible: quote empty strings and strings that already begin and end with a quote in scalarText/itemText, and have the number arm of parseTyped accept a quoted string as an exact literal. Add a fromFilterNode→toFilter identity test covering every kind of value.

### P2-152. When the serializer refuses a draft, compile throws instead of returning a refusal: the column editor hangs on 'Compiling…' and Properties Apply silently does nothing

*error-handling · calculated columns & JSON · reproduced* — `src/cube.ts:253`, `src/ui/column-editor.ts:315`, `src/ui/editor.ts:245`, `src/app.ts:2506`, `src/serialize.ts:950`, `src/serialize.ts:425`

CubeController.compile builds its queries with `scopes.flatMap((scope) => ... [serialize(s, scope)] ...)` before the try/catch, and that try/catch wraps only runner.compile. So a CubeRefusal thrown by serialize rejects the promise instead of coming back as `{pure, refusal}`. Two callers then lose the rejection. The column editor's `catch { return; // aborted: a newer compile owns the form }` treats every throw as an abort, so #check stays 'compiling' and OK stays disabled. #applyDraft awaits `this.#controller.compile(...).finally(endValidate)` with no catch, the editor button calls `() => void this.apply()`, and nothing in src/ or demo/ registers an unhandledrejection handler. Scenario (reproduced in node against the real serialize/CubeController.compile): pivot on the JSON column of the built-in 'Orders — nested JSON' sample and click Apply. compile rejects with "cannot pivot on 'meta': it holds JSON...". No status or alert appears and the editor stays open, so the message that tells the user what to pivot on instead is never seen. A second trigger: on a flat cube with no rows, measures or pivots, a group-level Rank with no order or partition passes #bodyProblem, which checks order only at the row stage. serialize then throws "needs an order or a partition" and the column editor shows 'Compiling…' forever.

**Fix:** In CubeController.compile, build the queries inside the try and return `{pure, refusal: message}` for a CubeRefusal. In the column editor, return silently only when `abort.signal.aborted`; on any other error, set #check to refused with the error message. Give #applyDraft (or editor.apply) a catch that reports failures through #status/#codeCheckAlert. Optionally, stop groupableColumns from offering Variant columns for pivots, and have #bodyProblem require an order for ordered group-level functions when the level has no keys.

### P2-153. Renaming a calculated column that another column uses as its weighted-average weight is refused, because the old name stays in the query

*correctness · calculated columns & JSON · reproduced* — `src/snapshot.ts:775`, `src/snapshot.ts:809`, `src/config.ts:758`, `src/config.ts:699`, `src/app.ts:1400`

renameColumnReferences renames rows, pivotOn, sorts, measures[].column/weight, filters and windows, but not `columns[].aggregateWeight` or `derived[].aggregateWeight`. renameColumnConfig moves only the renamed column's own entry and columnOrder (`columns: moved === undefined ? config.columns : { ...others, [to]: moved }`). It leaves other columns' `aggregationParameters` and `config.dimensions[].columns` unchanged. On refresh, applyToSnapshot re-derives the weight from config (`const weight = c.aggregationParameters?.[0]`), which brings the old name back. Scenario (reproduced with the real planner): set notional to wavg weighted by calculated column `w`, then rename `w` to `wt`. The query emits `wavgRowMapper($x.w)`, the planner refuses with "relation has no column 'w'", and #setCalc reverts the rename. This contradicts the function's own contract that a rename is carried through. A named dimension that lists the renamed column also drops out of the title-bar menu.

**Fix:** In renameColumnReferences, map aggregateWeight on columns, derived and groupDerived. In renameColumnConfig, rewrite `from` to `to` in every column's aggregationParameters and in config.dimensions. Extend the 'renaming a calculated column that is in use' test with the weight case.

### P2-154. A calculated column whose name differs from an existing column only by letter case is accepted, and DuckDB then silently returns wrong numbers, wrong sort order and a blank column

*data-semantics · calculated columns & JSON · reproduced* — `src/calc.ts:284`, `src/ui/column-editor.ts:286`

nameProblem checks `if (taken.includes(trimmed))`, an exact, case-sensitive match, and no case folding happens anywhere in calc.ts or serialize.ts. DuckDB identifiers are case-insensitive. Scenario (reproduced three times with the real wasm planner and DuckDB-WASM): a cube grouped by region with column `notional`, plus a calculated column `Notional` = notional*2 and a group-level `ratio` = `$x.Notional / $x.notional`. The planner wraps the query as `SELECT t1.*, (CAST(t1.Notional AS DOUBLE) / CAST(t1.notional AS DOUBLE)) AS ratio FROM (... SUM(t0.notional) AS notional, SUM(t0.notional * 2) AS Notional ...) AS t1`. DuckDB renames the inner duplicate to `Notional_1` and resolves both references to `notional`, so ratio is 1 where 2 is correct, with no error. Sorting by `Notional` also sorts by `notional`, and the grid's `Notional` column gets no data. HIGH is overstated: all three verifiers put it at MEDIUM, because it needs a case-only name collision plus a sort or group-level calc that triggers the planner's subquery wrap.

**Fix:** Compare case-folded names in nameProblem (`taken.some(n => n.toLowerCase() === trimmed.toLowerCase())`) and add a test. Apply the same case-insensitive uniqueness check wherever column names enter the cube.

### P2-155. The 'total of k' and 'every k, as text' JSON extractions make the whole grid query fail whenever any array element lacks k or has k = null

*correctness · calculated columns & JSON · reproduced* — `src/json-shape.ts:371`, `src/json-shape.ts:378`

arrayExtractions offers `${many}->map(e | $e->get(${key})->to(@String)->toOne())->joinStrings(', ')` and `...->to(@${t})->toOne())->sum()` for every key seen in any element. It ignores `f.present` and `f.nulls`, which it already tracks. `toOne` compiles to a runtime guard that raises an error when the value is NULL. Scenario (reproduced with the wasm planner and duckdb-wasm): the rows are `{"items":[{"sku":"X","q":2},{"sku":"Y","q":3.5}]}` and `{"items":[{"sku":"Z"}]}`. Picking 'total of q' or 'every q, as text' compiles cleanly, but execution fails with `Invalid Input Error: Cannot cast a collection of size 0 to multiplicity [1]`, and the whole grid errors, not just that cell. Optional keys in arrays of objects are common in real JSON.

**Fix:** When a field is not present and non-null in every element (`f.present - f.nulls < el.objects`), leave out `->toOne()` or filter empty values before `to()`, so that sum and joinStrings skip missing values.

### P2-156. A calculated column extracted 'as JSON' gets the learned type String, so it can never be extracted, filtered or drilled as JSON again

*correctness · calculated columns & JSON · reproduced* — `src/result.ts:118`, `src/app.ts:2653`, `src/ui/column-editor.ts:574`, `src/app.ts:1619`, `src/json-shape.ts:316`

DuckDB returns JSON as plain Arrow Utf8 with no metadata, and pureTypeOfArrow maps it with `case 'Utf8': case 'LargeUtf8': return 'String';`. #learnCalcTypes copies that type onto the derived column with no guard. The Extraction's declared `type: 'Variant'` is never used, because the column editor's onPick copies only name, kind and expression. Every isVariantType gate then fails: the column editor's 'From JSON:' list at :574, calc.extend at app.ts:1619 and the filter editor's variant bucket. Scenario (reproduced): pick items → 'as JSON' to create `doc_items`. After the first result its type is 'String', so Add Column lists only `doc` under From JSON, and Extend on `doc_items` opens a plain `$x.doc_items` expression. This contradicts json-shape.ts:316-318, which says a pulled-out value 'groups, drills and extracts again like any JSON column'.

**Fix:** Carry the compiler's column types across the plan boundary, as result.ts's own comment suggests. Until then, keep the Extraction's declared type on the derived column, and do not let a learned 'String' overwrite a Variant the expression is known to produce.

### P2-157. Changing the window Function rebuilds the window from a stale copy, silently dropping the partition, column, direction or offset chosen since the last repaint

*correctness · calculated columns & JSON* — `src/ui/column-editor.ts:686`

#paintWindow captures `const w = this.#draft.window` once per paint. The Function select then builds `this.#draft.window = { ...w, fn: v as WindowFunction, ... }` from that copy. The partition checkboxes, 'Of:', the order column and direction, and the number inputs all update the live draft and call `changed()` without repainting, so `w` goes stale. Scenario: Window, Of: notional, '+ Add' an order (this repaints), tick Partition by: region, then change Function from Sum to Average. The partition goes back to [], the repainted form shows region unticked, the compile succeeds, and OK applies a running average over all rows instead of per region. A Lag offset of 3 is likewise lost on switching to Lead.

**Fix:** Spread the live `this.#draft.window` in the Function handler instead of the captured `w`.

### P2-158. 'Last value' keeps the default Running frame, so the new column just copies the current row's value instead of the partition's last value

*data-semantics · calculated columns & JSON* — `src/ui/column-editor.ts:114`, `src/ui/column-editor.ts:689`, `src/ui/column-editor.ts:778`

`NEW_WINDOW = { fn: 'sum', partition: [], order: [], frame: 'running' }`, and the Function handler keeps it: `...(next.framed ? { frame: w.frame ?? 'running' } : {})`. The per-function default `w.frame ?? (w.fn === 'last' ? 'partition' : 'running')` at :778 and in serialize.windowExtend is therefore unreachable from the editor. serialize's own comment warns that a 'last' ending at the current row 'is always itself'. Scenario: Window, Function: Last value, Of: px, Order by: d, Partition by: desk. The result serializes to `rows(unbounded(), 0)` with `$p->last($w,$r).px`, so the column equals px instead of each desk's latest price. The Frame dropdown does show 'Running', which keeps this from being completely silent.

**Fix:** Leave frame undefined in NEW_WINDOW and let the per-function default apply, or set frame to 'partition' when switching to 'last' unless the user picked a frame.

### P2-159. Window partition columns ticked at one Column Kind stay in the draft, with no checkbox, after switching kind, and can silently partition by a hidden column

*correctness · calculated columns & JSON* — `src/ui/column-editor.ts:707`, `src/ui/column-editor.ts:421`

When the level changes, the handler sets `this.#draft.level` and repaints, but never prunes `this.#draft.window.partition`. #paintWindow draws checkboxes only for the `partitionable` columns of the new stage, and #window() copies `partition: [...w.partition]` in full. Scenario: in a cube grouped by desk, tick Partition by: region at Leaf level, then switch to Group Level. The form shows only 'desk', but the applied window has `partition:['region']`. derivedExtend keeps region because it is not a row key. With no explicit measures, the groupBy aggregates region with `unique`, so the running figure is silently partitioned by a hidden aggregated column. With measures, the planner refuses on 'region' and no visible control explains why. The verifier noted that order entries are always rendered with a remove button, so only partitions are affected. They can be cleared only by switching back to Leaf and unticking.

**Fix:** On a level change, drop partition entries (and an Of column) that are not in the new stage's columnsInScope. Alternatively, render every drafted partition entry, marking out-of-scope ones as removable.

### P2-169. If one Properties Apply also changes 'Show root aggregation' or 'Initially expand to level', its row-group, pivot and sort edits are silently lost

*correctness · properties editor & panels · reproduced* — `src/app.ts:2535`, `src/app.ts:2550`, `src/app.ts:949`, `src/cube.ts:335`

#applyDraft sets `this.#snapshot = draft.snapshot` and then, when root aggregation or the expand level changed, calls `await this.#controller.setTree(tree.withTotals(...).withExpandTo(expandTo)); await this.#refresh();`. setTree refreshes the controller's own snapshot, which is still the pre-draft one. #onView (app.ts:949) then runs `this.#snapshot = view.snapshot`, which overwrites the draft before #refresh() runs. This is the same clobbering that loadView avoids by calling adoptTree. Repro (jsdom, real CubeApp): add 'desk' to Vertical Pivots and tick 'Show root aggregation' in the same Apply. The rows stay ['region'] while the grand total appears, apply() returns true and `#opened` becomes the draft. A second Apply therefore sends no diff for the lost edit, and one action records two undo steps. The grid visibly lacks the edit and reopening the editor recovers, so MEDIUM, not HIGH.

**Fix:** Use `this.#controller.adoptTree(tree.withTotals(...).withExpandTo(...))` followed by a single `this.#refresh()`, as loadView does. On failure, restore with adoptTree(tree) as the catch already does.

### P2-170. Edits made in the Properties editor while an Apply is still running are lost: the editor records them as already applied

*async-concurrency · properties editor & panels · reproduced* — `src/ui/editor.ts:178`, `src/app.ts:3194`

`const took = await this.#options.onApply(this.#draft, this.#opened); if (!took) return false; this.#opened = this.#draft;` sets the base to the draft as it is AFTER the await, not the draft that was sent. The panels and the Apply/OK buttons stay live while the compile and query run. mergeDraft sends only `edited` minus `base`. Repro (jsdom): click Apply on Sorts, then double-click 'price' while the query runs. The next Apply/OK calls onApply with draft.sorts equal to base.sorts ([price asc]), so the sort the editor shows never reaches the grid, and OK closes the dialog. Double-clicking OK/Apply also starts two overlapping applies.

**Fix:** Capture `const sent = this.#draft` before the await and set `this.#opened = sent` afterwards. Also disable the footer (or ignore re-entrant apply() calls) while an apply is pending.

### P2-171. The Sorts tab's direction dropdown reads a map built with the panel, so after any re-render it shows a direction that differs from what Apply will use

*correctness · properties editor & panels* — `src/ui/editor.ts:365`, `src/ui/editor.ts:387`, `src/ui/editor.ts:390`, `src/ui/columns-selector.ts:458`

`const directions = new Map(draft.snapshot.sorts.map((s) => [s.column, s.direction]))` is built once, when the panel is built. But `actionFor: (name) => dropdown(ctx.doc, directions.get(name) ?? 'asc', ...)` runs again every time ColumnsSelector.render() runs (on a row click, a search keystroke or a move). Scenario: the cube is sorted by price desc. Remove price and add it back: the draft holds {price, asc}, but the dropdown shows Descending, and OK applies ascending. The reverse also happens: set region to Descending, then click another row, and the dropdown shows Ascending while the draft holds desc. Picking Ascending then fires no change event.

**Fix:** Inside actionFor, read the direction from `ctx.draft().snapshot.sorts` on every call, as horizontalPivotsPanel already does with ctx.draft().config.

### P2-172. Changing the heatmap 'to' colour reverts the 'from' colour, and vice versa

*correctness · properties editor & panels* — `src/ui/panel-column.ts:576`, `src/ui/panel-column.ts:593`, `src/ui/panel-column.ts:596`

`const heat = c.heatmap;` is captured once when the panel is built. The pickers then write `patch({ heatmap: { ...heat, from: from ?? '#ffffff' } })` and `patch({ heatmap: { ...heat, to: ... } })` without a refresh, and setConfig does not rebuild the panel. Repro (jsdom, real columnPropertiesPanel): set 'from' to blue, and the draft is {from:#0000ff, to:#ff8a65}. Then set 'to' to green, and the draft becomes {from:#ffffff, to:#00ff00}. The blue is lost, although the 'from' swatch still shows it.

**Fix:** Read the current spec at change time (`cfg().heatmap`) instead of the captured `heat`, as patchFormat and patchAppearance already do.

### P2-173. General 'Use Default Styling' applies a partial default: negatives lose their red, zeros their grey, and the Roboto 11px font is dropped

*correctness · properties editor & panels* — `src/ui/panel-general.ts:487`, `src/ui/panel-general.ts:537`, `src/config.ts:294`

The button runs `ctx.setConfig({ ...config(), appearance: DEFAULT_APPEARANCE })`. DEFAULT_APPEARANCE (panel-general.ts:537-543) holds only the grid-line booleans and the banding fields. DEFAULT_CONFIGURATION.appearance (config.ts:294-313) also sets fontFamily 'Roboto', fontSize 11, textAlign, gridLineColor, alternateRowsColor, and the normal, negative ('#ef4444'), zero ('#a3a3a3') and error foregrounds. cellStyle(DEFAULT_APPEARANCE, -5) returns {}, while a new cube renders -5 in red. After the reset, negatives, zeros and errors all render in plain text colour, and no new cube looks like that.

**Fix:** Reset to `DEFAULT_CONFIGURATION.appearance`, or define DEFAULT_APPEARANCE as that object instead of a separate hand-written subset.

### P2-174. For calculated columns, Column Properties shows the wrong Kind, and its Kind, 'Exclude from horizontal pivot' and group-stage Aggregation settings are silently ignored

*correctness · properties editor & panels* — `src/ui/panel-column.ts:260`, `src/ui/panel-kit.ts:99`, `src/app.ts:684`, `src/config.ts:582`, `src/snapshot.ts:148`, `src/serialize.ts:778`

`const kind = c.kind ?? (spec ? kindOf(spec) : 'measure');` has no spec for a calculated column, so it shows 'measure' even for a declared dimension. The code that reads the kind uses `c.derived ? c.kind : columnConfig(...).kind ?? c.kind`, so config.kind is never read for a derived column. applyToSnapshot copies kind and excludedFromPivot only onto snapshot.columns and never onto groupDerived. Repro (jsdom): a calculated dimension shows Kind 'measure' with Aggregation enabled. Ticking Exclude on a calculated measure writes config that serialize.ts:778 never sees, so the pivot still spreads the column.

**Fix:** Show the kind from rowColumns (the declared kind), and disable or hide Kind/Exclude for calculated columns and Aggregation for groupDerived columns. Alternatively, make applyToSnapshot and rowColumns carry these settings for derived columns.

### P2-175. Width 'In range' fixes the column at one bound: it renders exactly at the minimum (or at the maximum when only a max is set), never auto-fits, and drag-resizes are discarded

*correctness · properties editor & panels · reproduced* — `src/grid/columns.ts:548`, `src/config.ts:419`, `src/grid.ts:414`, `src/ui/panel-column.ts:535`, `src/app.ts:550`

In range mode, resolvedWidths returns only `{minWidth, maxWidth}`, and buildColumnModel then does `let width = raw ?? lo ?? hi;`. The column therefore always gets a fixed width, and #fit skips any leaf with a defined width, so the fit's own min/max clamping never runs. toColumnLayout on {widthMode:'range', minWidth:100, maxWidth:400, width:250} was run and produced no width, so the column renders at 100px. A drag to 250 stores config.width, which range mode ignores, and the column snaps back to 100. grid.test.ts:641 pins this behaviour ('uses a bound as the width when none was set').

**Fix:** In range mode, leave width undefined unless there is an explicit (dragged) width, and clamp that into [min, max]. Let autosize measure the column and clamp the result into the range. Update the pinned test.

### P2-176. Properties panels rebuild on each change, so keyboard focus drops to the page after one arrow press in 'Choose Column' and after the font toggles

*accessibility · properties editor & panels* — `src/ui/panel-column.ts:252`, `src/ui/editor.ts:185`, `src/ui/panel-column.ts:237`, `src/ui/panel-column.ts:291`, `src/ui/panel-column.ts:328`, `src/ui/panel-column.ts:412`, `src/ui/panel-column.ts:524`, `src/ui/panel-column.ts:560`, `src/ui/panel-column.ts:589`, `src/ui/panel-column.ts:604`, `src/ui/panel-general.ts:127`, `src/ui/panel-general.ts:160`, `src/ui/panel-general.ts:169`, `src/ui/panel-general.ts:433`, `src/ui/panel-general.ts:443`, `src/ui/panel-general.ts:488`, `src/ui/panel-dimensions.ts:57`, `src/ui/panel-dimensions.ts:83`, `src/ui/pivot-panel.ts:271`, `src/ui/columns-panel.ts:338`

The 'Choose Column' onChange does `uiState.chosen = next ?? null; ctx.refresh();`, and refresh() runs `this.#body.replaceChildren(build(...))`. The focused control is destroyed and focus goes to <body>. On Windows, ArrowDown on a closed <select> fires 'change' at once, so a keyboard user moves one column and then loses their place. The same happens with the U/S font toggles and with every other on-change ctx.refresh() site listed. columns-panel.ts:296 already restores focus for its own toggle.

**Fix:** After refresh, restore focus to the matching control in the rebuilt panel (as columns-panel.ts:296 does), or update the affected controls in place instead of rebuilding.

### P2-177. Settings number fields accept fractional and unbounded values: a Row Buffer of 15.5 blanks every row once the grid scrolls, a huge one renders every row, and both persist

*correctness · properties editor & panels · reproduced* — `src/settings.ts:108`, `src/settings.ts:109`, `src/ui/settings-panel.ts:117`, `src/ui/settings-panel.ts:122`, `src/grid/viewport.ts:54`, `src/grid/viewport.ts:75`, `src/grid.ts:1139`, `src/app.ts:2614`, `src/app.ts:506`, `demo/boot.ts:453`

readSettings does `out[s.key] = Math.max(s.min, v)` with no integer check and no upper bound. The panel accepts any `Number(input.value)` >= min and never enforces `step`. computeRowWindow({scrollTop:2400, ..., overscan:15.5}) returns {start:84.5, end:136.5}. grid.ts:1139 then iterates fractional row indexes, and `values[84.5]` is undefined. Reproduced: 0 of 52 rendered rows had a value, and aria-rowindex was fractional. In the other direction, Row Buffer 1000000 on a large flat result builds a DOM row for every fetched row on each render. The host persists the value and it is reapplied at construction, so either fault returns on every load.

**Fix:** Treat numeric settings as integers with a `max` (for example 500 for rowBuffer), enforced both in the settings panel and in readSettings. Also floor and clamp overscan inside computeRowWindow.

### P2-179. numberInput shows a value the model does not hold: an unparseable entry like '5,000' silently removes the Row Limit, and out-of-range values are clamped without updating the box

*correctness · properties editor & panels* — `src/ui/form.ts:104`, `src/ui/form.ts:108`, `src/ui/form.ts:117`, `src/ui/panel-general.ts:332`, `src/cube.ts:249`

`if (el.value.trim() === '') { onChange(undefined); return; }` never checks `el.validity.badInput`. The browser sanitises a non-numeric entry to '' ('1,000' gives '' in jsdom; Gecko does the same for '10k'), so the edit is reported as absent. Typing '5,000' in Row Limit calls setConfig({maxRows: undefined}), which removes the limit, while the field still shows '5,000'. On a flat cube the query then has no limit scope, the whole source is fetched and the truncation warning never fires. Separately, `onChange(clamp(n, min, max))` never writes the clamped value back: typing 5000000 stores 1000000 while the box shows 5000000.

**Fix:** When `el.validity.badInput` is true, reject the edit: restore the previous value and mark the field invalid. Treat only a truly empty field as absent. After clamping, write the effective value back to `el.value`.

### P2-188. Pressing Space or Enter on a sort- or pivot-direction dropdown removes that column from Sorts or Horizontal Pivots

*correctness · columns selector & panel · reproduced* — `datacube/src/ui/columns-selector.ts:479`, `datacube/src/ui/columns-selector.ts:462`, `datacube/src/ui/columns-selector.ts:463`, `datacube/src/ui/editor.ts:322`, `datacube/src/ui/editor.ts:386`

Each selected row has `row.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); this.#move(pane.which, [name]); } })`. The per-row action `<select>` inside the row stops only 'click' and 'dblclick' from bubbling, and the row handler never checks `event.target === row`. Reproduced (jsdom, real ColumnsSelector and form.ts dropdown): a Space keydown on region's direction select with selected [region,desk,x1,x2] calls onChange(['desk','x1','x2']) and is defaultPrevented. A keyboard user who Tabs to 'Ascending' and presses Space or Enter to open it cannot open the dropdown and deletes the sort or pivot key instead. OK then applies the cube without it.

**Fix:** In the row keydown handler, return unless `event.target === row`, or stop keydown propagation on the action element as is already done for click and dblclick.

### P2-189. Dropping into the Selected pane while its search is active inserts at the wrong position, which reorders sort and pivot keys

*correctness · columns selector & panel · reproduced* — `datacube/src/ui/columns-selector.ts:380`, `datacube/src/ui/columns-selector.ts:389`, `datacube/src/ui/columns-selector.ts:410`

#indexAt measures `[...list.children]`, which holds only the rows that pass the search, but #drop applies that index to the unfiltered list with `insertAt(this.#state.selected, drag.names, index)`. Reproduced in jsdom: with selected=[region,desk,x1,x2] and search 'x', dragging x2 above x1 (visible index 0) yields [x2, region, desk, x1] instead of [region, desk, x2, x1]. On the Sorts or Horizontal Pivots tabs, where order is the meaning, x2 silently becomes the primary sort key or outermost pivot, above columns the user could not see. Dropping at the end of a filtered pane inserts at visible.length, not at the end.

**Fix:** Map the visible index to the full list before calling insertAt: insert before the full-list position of visible[index], or after the last visible row when index === visible.length.

### P2-190. Dragging a highlighted row moves every highlighted row, including rows the search hides

*correctness · columns selector & panel* — `datacube/src/ui/columns-selector.ts:489`, `datacube/src/ui/columns-selector.ts:338`, `datacube/src/ui/columns-selector.ts:402`, `datacube/src/ui/columns-selector.ts:405`

The drag payload is `const names = pane.picked.has(name) ? [...pane.picked] : [name];`, while #movePicked filters picked to the visible rows ('Scoped by the search: a hidden row is not moved even if it is still highlighted'). #renderPane prunes picked only to live columns, not visible ones. Scenario: in the Columns tab the user shift-selects six available columns, types 'x' so only x1 and x2 show, then drags x1 to Selected. All six are added, including four the user cannot see, which is the failure the file header says the design prevents. Related: when every highlighted row is hidden, the '>' and '<' buttons stay enabled (disabled only on `picked.size === 0`) and do nothing.

**Fix:** Build the drag payload from the picked rows that are also visible (the same filter #movePicked uses), and compute the move buttons' disabled state from the visible picks.

### P2-191. Columns selector is mostly unusable from the keyboard: only the first row is reachable, no add-all, no reorder, and focus is lost after each move

*accessibility · columns selector & panel · reproduced* — `datacube/src/ui/columns-selector.ts:442`, `datacube/src/ui/columns-selector.ts:479`, `datacube/src/ui/columns-selector.ts:276`, `datacube/src/ui/columns-selector.ts:424`

Rows use a roving tabindex (`row.tabIndex = index === 0 ? 0 : -1;`), but the file has no ArrowUp/ArrowDown/Home/End handler, and the only key handling is Enter/Space to move a row. '[All Columns]' responds only to `header.addEventListener('dblclick', ...)`, and reordering the Selected pane is drag-only. Every move calls render(), which replaces all rows with `pane.list.replaceChildren`, so the focused row is detached and focus falls to <body> (reproduced). A keyboard user on Sorts, Vertical Pivots or Horizontal Pivots can reach only the first row of each pane, cannot add all, and cannot change sort or group-by order at all. The only workaround is to search each column so it becomes the first row.

**Fix:** Implement the listbox keyboard pattern: arrows and Home/End move the roving focus, Space toggles aria-selected, Enter moves. Make the header a real button that moves all on click or Enter, add Alt+Up/Down (or Move Up/Down buttons) for the Selected pane, and restore focus to a neighbouring row after each render.

### P2-192. Double-click or Enter on an already-grouped column in the Columns panel groups by it a second time

*correctness · columns selector & panel* — `datacube/src/ui/columns-panel.ts:394`, `datacube/src/app.ts:433`, `datacube/src/app.ts:925`

The panel wires onPick on every groupable row, whatever its usedAs: `if (column.groupable && this.#options.onPick) { ... row.addEventListener('dblclick', () => this.#options.onPick?.(column.name))`. The host appends with no membership check: `onPick: (c) => this.#onZoneChange('rows', [...this.#snapshot.rows, c])`, and #onZoneChange does not dedupe. With 'Keep grouped columns in the grid' on, the grouped 'region' is listed with its 'Row' badge and the tooltip 'Double-click to group'. Double-clicking it makes rows [region, region], and serialize emits `->groupBy(~[region, region], ...)`. The planner then either refuses (and #refreshOr shows an error) or the tree gains a redundant region-under-region level.

**Fix:** Offer the pick only when usedAs is undefined, and make the host's onPick a no-op when the column is already in rows (placeColumn semantics, as PivotPanel#drop uses).

### P2-193. Every Columns panel refresh rebuilds the whole panel, so a landing query steals focus from the search box and a checkbox toggle resets scroll and drops focus

*usability · columns selector & panel · reproduced* — `datacube/src/ui/columns-panel.ts:262`, `datacube/src/app.ts:701`, `datacube/src/app.ts:923`, `datacube/src/app.ts:997`

render() creates a new search input, list (the scroll container) and rows, then calls `this.#root.replaceChildren(head, search, this.zones, section, list)`. setColumns runs it on every #refresh and on every view landing (#onView -> #refreshToolPanel). Reproduced in jsdom: with the search input focused, setColumns leaves activeElement as BODY, so keystrokes typed while a query lands go to the document, where global shortcuts listen. Separately, unticking column 40 of 60 runs #patchColumn -> #refresh -> setColumns synchronously, which resets scrollTop to 0 and detaches the focused checkbox, so a keyboard user is sent back to <body> on every toggle.

**Fix:** Keep the search input and list container across renders and update only the rows (or diff them), preserving scrollTop and restoring focus to the element with the same data-column.

### P2-194. Enter on a Columns panel row's visibility checkbox or fold button groups the cube by that column

*correctness · columns selector & panel · reproduced* — `datacube/src/ui/columns-panel.ts:404`, `datacube/src/ui/columns-panel.ts:351`, `datacube/src/ui/columns-panel.ts:321`, `datacube/src/app.ts:433`

The row handler is `row.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); this.#options.onPick?.(column.name); } })`. The checkbox and twist button inside the row stop pointerdown and click propagation but not keydown, and the handler does not check `event.target === row`. Reproduced in jsdom: Enter on the 'desk' checkbox gives picks=['desk'], and the host re-queries grouped by desk, reshaping the grid into a tree. On a groupable row with pivot children, preventDefault cancels the fold button's Enter activation, so the cube is grouped instead of folded.

**Fix:** Ignore keydown unless `event.target === row`, or stop keydown propagation on the checkbox and twist button.

### P2-195. The Dimensions list cannot be operated from the keyboard, so only the current dimension can be renamed, edited or deleted

*accessibility · columns selector & panel* — `datacube/src/ui/panel-dimensions.ts:72`, `datacube/src/ui/panel-dimensions.ts:81`

Each role=option row gets `row.tabIndex = current ? 0 : -1;`, and the only handler is `row.addEventListener('click', () => { cursor.index = i; ctx.refresh(); })`. The file has no keydown handler. Rename, hierarchy editing and Delete all act on cursor.index. With three dimensions, a keyboard or screen-reader user can focus only the current one and cannot select the others to rename, edit or delete them, except by deleting the ones before them.

**Fix:** Implement the listbox pattern: ArrowUp/ArrowDown (and Home/End) move cursor.index, refresh, and focus the new current row, as the editor's tab strip does in editor.ts #tabKey.

### P2-196. A dimension can be renamed to another dimension's name, and the grid menu then applies the wrong hierarchy

*correctness · columns selector & panel* — `datacube/src/ui/panel-dimensions.ts:139`, `datacube/src/app.ts:3005`, `datacube/src/app.ts:3134`

The rename handler rejects only an empty name (`if (name === undefined) { ctx.refresh(); return; }`) and has no uniqueness check; freshName guards only Add. The menu builds `items.push({ id: 'view.dimension', label: d.name, column: d.name })` and resolves a click with `this.#dimensions().find((d) => d.name === item.column)`. Scenario: Geography=[region,country] and Dimension 1=[desk,trader]. The user renames Dimension 1 to 'Geography', and the menu shows two 'Geography' entries. Picking the second one groups by region, and the desk/trader hierarchy cannot be reached from the menu, with no message.

**Fix:** Refuse a rename that collides with another dimension's name (or suffix it via freshName) and show a message. Resolve menu entries by index or id rather than by display name.

### P2-205. Keyboard focus falls to <body> when the focused row stops being rendered (collapse, filter or scrollbar jump), so arrow keys stop working

*accessibility · grid rendering & keyboard · reproduced* — `src/grid/grid.ts:1290`, `src/grid/grid.ts:1396`, `src/grid/grid.ts:391`, `src/grid/grid.ts:348`

#focusCell only does `this.#body.querySelector('.dc-focus')?.focus()`. A cell gets `.dc-focus` only when its row equals #focus.row and falls inside the rendered window, and setRows never clamps #focus to the new row count. When the focused row is outside the new window or past totalRows, replaceChildren removes the focused element, nothing is focused in its place, and document.activeElement becomes BODY. The keydown listener is on the grid root, so the next ArrowDown does nothing. Reproduced with the real CubeApp: expand EMEA, ArrowDown to AMER (row 3), then collapse all; the result has 2 rows and focus is on BODY. The same happens after dragging the scrollbar past the rendered band (repro: scrollTop 20000, activeElement BODY, ArrowDown scrolls the page instead of moving the grid's focus).

**Fix:** Clamp #focus to the new row count in setRows. When the focused row is not rendered, move focus to the grid root (tabIndex 0), optionally with aria-activedescendant, instead of letting it drop to <body>.

### P2-206. The overscan buffer never saves a rebuild: every row crossed while scrolling, and every arrow key or click, rebuilds the whole rendered band

*performance · grid rendering & keyboard · reproduced* — `src/grid/grid.ts:1127`, `src/grid/grid.ts:1128`, `src/grid/grid.ts:1289`, `src/grid/grid.ts:518`, `src/grid/viewport.ts:75`, `src/grid/viewport.ts:76`, `src/grid/viewport.ts:89`, `src/grid/grid.ts:1037`, `src/grid/grid.ts:1374`, `src/grid/grid.ts:1414`

#render returns early only on `isCovered(this.#rendered, wanted)`, but `wanted` is `this.window`, and computeRowWindow re-centres the overscan on each call (`start = firstVisible - overscan`, `end = firstVisible + visibleCount + overscan`). #render then stores exactly that window with `#rendered = wanted`. A one-row scroll therefore gives `wanted.end = rendered.end + 1`, isCovered is false, and the whole band (about 141 rows at the default Row Buffer of 50, times every column, since columns are not virtualised) is rebuilt with fresh format, mergeAppearance and cellStyle calls per cell. The keyboard, click and select paths force the same rebuild with `this.#rendered = null; this.#render()`. On the built demo in headless Chromium, 60 one-row scroll steps caused 60 full rebuilds. Median frame time was 79 ms at 61 columns and 429 ms at 401 columns, and 20 ArrowDown presses took 9.2 s at 401 columns, so a wide pivot scrolls at 2 to 12 fps.

**Fix:** Test coverage against the visible band (the window without overscan) and re-render the overscan window only when the visible rows leave the rendered band. Update the focus and selection classes in place instead of nulling #rendered on every key or click, and ideally recycle row elements instead of calling replaceChildren.

### P2-207. Auto-fit and Auto-size measure the header's resize grip, so fitted column widths depend on the current width and drift on every query

*correctness · grid rendering & keyboard · reproduced* — `src/grid/grid.ts:435`, `src/grid/grid.ts:445`, `src/grid/grid.ts:412`, `src/grid/grid.ts:617`, `src/grid/grid.ts:619`, `src/grid/grid.ts:911`, `src/grid/grid.ts:953`

contentWidths runs `range.selectNodeContents(el); const content = range.getBoundingClientRect().width;` over every `[data-column]` element, header cells included. The header cell contains the `.dc-col-resize` grip that #resizable adds with `el.append(grip)` (`position: absolute; right: -3px; width: 7px`), and the label is centred, so the measured range runs from the label's left edge to past the column's right edge: about W/2 + label/2 for current width W. The app always sets onResizeColumn and autoFit: true, so this always applies. Reproduced in Chromium: a column fitted to 291px for a long value and then re-queried with the value 'EQ' goes 178, 121, 93, 79 over successive queries, where the same grid without a grip goes straight to 50. Re-querying identical data also creeps (76, 62, 55, 51, 50). Widths therefore shift under the user on every sort, expand or filter.

**Fix:** Measure only the label, for example with a range over the header's text node or label span that excludes `.dc-col-resize` and the sort mark (and add the sort mark's width explicitly), or measure headers with the grip detached.

### P2-208. ArrowRight on a collapsed group row expands it from any column, so keyboard users cannot move across collapsed subtotal rows

*accessibility · grid rendering & keyboard* — `src/grid/grid.ts:1317`, `src/grid/grid.ts:1321`, `src/grid/grid.ts:1330`, `src/app.ts:540`, `src/app.ts:1266`

The ArrowRight branch tests only `if (meta?.expanded === false) { this.#options.onToggleExpand?.(meta.key, true); } else { col = Math.min(lastCol, col + 1); }` and never checks `col`, while ArrowLeft collapses only when `meta?.expanded === true && col === 0`. The app's rowMeta sets `expanded` on every group row, and onToggleExpand calls `this.#controller.toggle(...)`, which runs a query. On a freshly grouped cube every top-level row is collapsed. So a keyboard user on the notional cell (column 3) of the collapsed 'EMEA' row who presses Right to read the next measure expands the group instead, a query runs (a warehouse query in Live mode), and focus stays in column 3. The only test presses ArrowRight at column 0.

**Fix:** Expand on ArrowRight only when focus is in the tree column (`col === 0`), matching ArrowLeft; in any other column, move right.

### P2-209. Links in 'display as link' cells cannot be opened from the keyboard, and Enter on one drills through a different row

*accessibility · grid rendering & keyboard* — `src/grid/grid.ts:1248`, `src/grid/grid.ts:1254`, `src/grid/grid.ts:1351`, `src/grid/grid.ts:1353`, `src/grid/grid.ts:1360`, `src/grid/grid.ts:348`

Link cells render a real anchor (`const a = doc.createElement('a'); a.href = link.href; a.target = '_blank'; ... cell.appendChild(a)`) with no tabIndex, so each link is an extra Tab stop outside the grid's roving tabindex. Keydown bubbles to the root handler, which ignores event.target: it takes `let { row, col } = this.#focus;`, calls `this.#options.onActivateCell?.(row, col)` on Enter or Space, and then calls `event.preventDefault()`, which stops the link from activating. Scenario: a keyboard user Tabs to the link in row 3 while the grid's focus cell is (6,0) and presses Enter. The link does not open, and a Drill-through opens for row 6, a row the user never picked, and focus jumps back to that cell.

**Fix:** Give cell anchors tabIndex=-1 and open the focused cell's link on Enter when it holds one. Also return early from #onKeyDown when event.target is an interactive descendant (a, button, input) that is not a cell.

### P2-210. If a result arrives during a column-resize drag, the drag never ends: the width sticks, is never saved, and later configured widths for that column are ignored

*state-persistence · grid rendering & keyboard* — `src/grid/grid.ts:898`, `src/grid/grid.ts:905`, `src/grid/grid.ts:551`, `src/grid/grid.ts:355`, `src/grid/grid.ts:461`, `src/app.ts:989`

The move, pointerup and pointercancel handlers are attached only to the grip, which holds pointer capture (`grip.setPointerCapture?.(event.pointerId); grip.addEventListener('pointerup', up)`), and there is no lostpointercapture or document-level listener. #renderHeader calls `this.#headGrid.replaceChildren()` from both setColumns and setSorts, which app.ts #onView calls for every view. A view that lands mid-drag (an expand or a Live query the user just started) detaches the grip, so `up` never runs and `#dragWidths` keeps the entry. #templateColumns then prefers `this.#dragWidths.has(l.name)` over `l.width`, and #fit skips the column. In the finder's Playwright repro, `desk` ends the drag at 204px, onResizeColumn is never called, so nothing is saved, and a later configuration width of 120 is still rendered as 204 until another completed drag of that column.

**Fix:** Listen for move and up on the document or window, or handle `lostpointercapture` on the grip, and always delete the #dragWidths entry when the drag ends or the header is rebuilt. Do not let a stale drag width override a model width.

### P2-211. Blur, rename, link, pin, width and hidden settings on a measure are dropped for every pivoted column, so blurred figures show in the clear after a pivot

*privacy · grid rendering & keyboard · reproduced* — `src/grid/columns.ts:542`, `src/grid/columns.ts:563`, `src/grid/columns.ts:598`, `src/config.ts:456`, `src/app.ts:783`, `src/app.ts:959`

buildColumnModel looks each setting up by the exact leaf name: `blurred.has(l.name)`, `displayNames[l.name]`, `pinned[l.name]`, `links[l.name]`, `widths[l.name]`, `hidden.has(l.name)`. The keys are source column names from config.columns, but a pivoted leaf is named `2021__|__notional`, so none match. Formats (#refreshFormats, app.ts:783-800) and heatmaps fall back from a pivot leaf to its measure; these layout settings do not. Reproduced with the real code: 'Blur content' plus the rename 'Notional (USD)' on notional gives `{blurred: true, label: 'Notional (USD)'}` unpivoted, but after pivoting by year the leaves 2021__|__notional and 2022__|__notional have blurred undefined, so every notional figure is readable, which defeats the feature's stated purpose (screen shares, over-the-shoulder viewing). The value-first header also loses the rename, while the measures-first header keeps it (line 598).

**Fix:** For a pivoted leaf, fall back to the measure's settings (the path's last segment) when the leaf name has none, as #refreshFormats does, and use displayNames[measure] for the leaf's own label.

### P2-212. An empty pivot value merges its header with the tree column's, so two header cells overlap and the tree column loses sort, resize and menu

*correctness · grid rendering & keyboard · reproduced* — `src/grid/columns.ts:604`, `src/grid/columns.ts:330`, `src/grid/columns.ts:160`, `src/grid/columns.ts:486`, `src/grid/grid.ts:582`, `src/grid/grid.ts:609`

The header merge loop continues while `samePrefix(path, hp(next), level)`, then sets `rowSpan: isLeafHere ? depth - level : 1` and gives `leafIndex` only when `j - i === 1`. It never stops at a cell that ends at this level. The tree column's path is [''] when it is not alone, and an empty pivot value yields a column named `__|__notional` with path ['', 'notional'], which the ascending pivot sort places first, next to the tree column. Reproduced: grouped by region and pivoted by year with some empty years, header row 0 gets `{label:'', colStart:0, colSpan:2, rowSpan:2}` while row 1 also has a cell at colStart 1, so the two draw in the same CSS grid area. The tree header has colSpan 2 and no leafIndex, so its sort, resize, drag and column-menu wiring is gone, and the blank pivot value has no group header.

**Fix:** Never merge across a leaf cell: break the merge loop when the current or next column has `path.length === level + 1`, so a leaf cell always spans exactly one leaf.

### P2-213. Building header drag handlers is cubic in the column count for flat tables, so a 1,000-column table spends about 1.5 s per refresh on them

*performance · grid rendering & keyboard · reproduced* — `src/grid/grid.ts:712`, `src/grid/grid.ts:727`, `src/grid/grid.ts:618`, `src/grid/grid.ts:355`, `src/grid/grid.ts:461`, `src/app.ts:989`

#reorderable runs once per leaf header and rebuilds the whole column order each time: `for (const l of model.leaves) { ... const key = rank(l); if (!order.includes(key)) order.push(key); }`. For a flat table, where every leaf is its own key, that is L headers x L leaves x an includes over up to L keys, which is O(L^3). onReorder is always set by app.ts, and #renderHeader runs from both setColumns and setSorts, which #onView calls back to back, so the cost is paid twice per view. A timed copy of the loop takes 44 ms at L=400, 771 ms at L=1000 and 4.6 s at L=2000 per header render. Pivots, which have few measures, are much cheaper.

**Fix:** Compute `order` (and a Set or index map of it) once per #renderHeader and pass it into #reorderable.

### P2-214. Scroll height is rows x row height with no cap, so on very large flat results the last rows cannot be scrolled to

*correctness · grid rendering & keyboard* — `src/grid/viewport.ts:57`, `src/grid/grid.ts:1132`, `src/grid/grid.ts:1384`, `src/app.ts:991`

`const totalHeight = totalRows * rowHeight;` goes straight into `this.#spacer.style.height`, and firstVisible comes from the raw scrollTop; nothing caps or scales it. A flat cube has no default row limit (config.ts:156-162) and app.ts always passes the whole result to setRows. At the app's 20px row height, a 1M-row table needs 20,000,000px, above Gecko's maximum element height (about 17.9M px; Chromium's cap of about 33.5M px is reached at about 1.67M rows). The spacer is clamped, so scrolling stops near row 895k in Gecko and the rows past it never render. Ctrl+End sets focus to the last row and #scrollFocusIntoView assigns an unreachable scrollTop, so the focused row is never rendered.

**Fix:** Cap the spacer height at a safe maximum and map scrollTop to a row index proportionally (scaled virtual scrolling), or apply a default row limit to flat cubes.

### P2-221. Escape pressed in any text field inside a window closes the whole window and throws away its unapplied draft

*state-persistence · windows & shortcuts* — `src/app.ts:2765`, `src/app.ts:2807`

#showOverlay wires `win.addEventListener('keydown', (event) => { if (event.key === 'Escape') this.#closeWindow(key); });` with no check of event.target or defaultPrevented. The comment says 'the panels inside stop their own Escape', but only columns-selector.ts:253 and filter-editor.ts:1128/1266 do; the column editor's expression textarea and its type=search 'Insert' picker, and the General Properties inputs, do not. #closeWindow disposes the ColumnEditor and sets `this.#editor = null`, and the Properties editor holds every change in a draft until Apply. Scenario: in Add New Column the user types an expression, then presses Escape in the 'Insert' search box to clear it; the window closes and the expression is gone. The same Escape in the Properties report-title input discards unapplied changes on every tab.

**Fix:** Close only when Escape reaches the window from a non-editable target (skip isTextEntry targets and defaultPrevented events), or confirm before discarding a dirty draft.

### P2-222. Resizing a window from its top edge is not clamped, so the title bar and close button can be dragged above the page and the position is restored on every reopen

*correctness · windows & shortcuts · reproduced* — `src/ui/window.ts:256`, `src/ui/window.ts:258`, `src/ui/window.ts:178`, `src/ui/window.ts:141`, `src/app.ts:2793`

resize() computes `height = Math.max(minHeight, from.height - dy); y = from.y + (from.height - height);` and never clamps y at 0, unlike the drag path (`clamp(from.y + ..., 0, maxY)` at window.ts:178). The grips use setPointerCapture, so pointermove keeps arriving after the pointer leaves the viewport. Running the real resize() on Properties opened at y=150 and dragged to clientY=-30 gives {y:-30, height:780}: the 28px header, its x button and the n grip are all above the viewport, and with the demo's body overflow:hidden the page cannot scroll, so the window cannot be moved or closed with the mouse. app.ts:2793 remembers the spec by title and window.ts:141 restores it verbatim, so closing with Escape and reopening Properties puts it back at y=-30 for the rest of the session.

**Fix:** Clamp y (and x) in resize() against the container the same way the drag path does, keeping the title bar reachable.

### P2-223. Remembered window positions are restored verbatim and never re-fitted when the container shrinks, so a reopened window can land entirely off-screen

*correctness · windows & shortcuts* — `src/ui/window.ts:141`, `src/app.ts:2787`, `src/app.ts:2793`

`let spec = options.spec ?? fitWindow(bounds, options);` means a remembered spec skips fitWindow and every clamp; the drag clamp (maxX = live.width - 40) applies only while dragging. #showOverlay passes `spec: remembered` from the in-memory #windows map on every reopen, and neither window.ts nor app.ts has a resize listener or ResizeObserver for windows. Scenario: on a 1600px browser the user drags Filter to x=1300 and closes it, snaps the browser to 800px wide, and reopens Filter: it opens at x=1300, wholly right of the viewport, with no scrollbar (body overflow:hidden), and every later reopen in the session does the same. A window already open when the viewport narrows is also left off-screen.

**Fix:** Pass every restored spec through a fit/clamp step against the current container bounds (at least the title-bar strip visible, as the drag clamp keeps), and re-clamp open windows on container resize with a ResizeObserver.

### P2-224. Floating windows are not labelled dialogs and get no focus management: focus does not move in on open or return on close

*accessibility · windows & shortcuts* — `src/app.ts:2741`, `src/app.ts:2745`, `src/app.ts:2807`

#showOverlay creates a plain `div.dc-app-overlay` appended at the end of the app root, with a title <span> but no role, aria-modal or aria-labelledby, and never calls focus(); #closeWindow only does `win.remove()`. Only alerts and the Properties editor root (editor.ts:116) set a dialog role; Filter, column editor, Settings, Member Selection, Ad Hoc Options, Documentation, Drill-through and Plot/Treemap set none. Scenario: a keyboard user presses Ctrl-E; Properties appears over the grid while focus stays behind it, reachable only by Tabbing through the rest of the app (the columns panel alone is about 120 stops for 60 columns), and screen readers announce nothing. Escape or the x button removes the window and focus falls to <body>, so the user loses their place in the grid.

**Fix:** In #showOverlay set role='dialog' and aria-labelledby pointing at the title, remember document.activeElement, and focus the first control (or the window); restore the remembered element in #closeWindow.

### P2-228. Grid cell selection is invisible to screen readers and barely visible on screen

*accessibility · accessibility* — `src/grid/grid.ts:1267`, `src/grid/grid.ts:864`, `src/grid/grid.ts:266`, `src/grid/grid.css:607`, `src/grid/grid.css:611`, `src/grid/grid.css:615`

A selected cell is marked only by a class, `if (this.#selection && contains(this.#selection, abs, c)) { cell.classList.add('dc-selected'); }`, and headers only toggle `dc-th-selected`. No aria-selected is set on any gridcell and the treegrid root has no aria-multiselectable. The visual cue is a wash, not a border: `.dc-cell.dc-selected { background: var(--tw-sky-50); }` is #f0f9ff on white (about 1.07:1), and the header fallback #cfe2f7 on #f5f5f5 is about 1.21:1. There is no forced-colors rule, so in forced-colors mode the range disappears. Scenario: a keyboard or screen-reader user extends a block with Shift+Arrow and presses copy. Only the active cell has a focus outline, nothing announces or clearly shows the range, and the clipboard receives a rectangle the user could not perceive.

**Fix:** Set aria-selected on gridcells as the selection is painted, and aria-multiselectable=true on the treegrid. Draw the selection with a border or a fill of at least 3:1 contrast against the cell background, and add a forced-colors rule (for example Highlight) for it.

### P2-230. Property panel, column editor and settings form controls have no accessible name, so screen readers announce unnamed combo boxes and spin buttons

*accessibility · accessibility* — `src/ui/form.ts:41`, `src/ui/form.ts:47`, `src/ui/column-editor.ts:868`, `src/ui/column-editor.ts:400`, `src/ui/column-editor.ts:412`, `src/ui/column-editor.ts:434`, `src/ui/panel-column.ts:241`, `src/ui/panel-column.ts:535`, `src/ui/panel-column.ts:638`, `src/ui/panel-general.ts:134`, `src/ui/panel-general.ts:245`, `src/ui/panel-general.ts:313`, `src/ui/panel-general.ts:328`, `src/ui/panel-dimensions.ts:125`, `src/ui/settings-panel.ts:111`, `src/ui/settings-panel.ts:113`

form.ts field() renders the label as a sibling `const l = make(doc, 'div', 'dc-field-label'); l.textContent = label;` with no <label for>, id or aria-labelledby, and textInput/numberInput/dropdown set no aria-label, so the only name is the '(None)' placeholder or nothing. column-editor.ts has its own field() that does the same with a <span> (Column Name, Column Kind, Calculation, window Function/Of/Frame), and panel-dimensions.ts:125-130 builds the same pattern by hand. settings-panel.ts appends the numeric `input.type = 'number'` beside plain title/description divs, while only the boolean case wraps in a <label>. Some controls have no label even visually: the font family/size selects (panel-general.ts:134-150), the Width min/max range inputs (panel-column.ts:535-548) and the heatmap from/to colour inputs (panel-column.ts:638-655). Scenario: a screen-reader user opens Add New Column and hears 'edit text' then two unnamed 'combo box' controls, or tabs through General Properties and hears 'spin button, (None)' for both Row Limit and Initially expand to level; grep of src finds no htmlFor or aria-labelledby anywhere.

**Fix:** Make form.ts field() (and the column-editor and panel-dimensions copies) render a real <label> or give the label an id and set aria-labelledby on each control it wraps; ideally have column-editor reuse form.ts field(). Set aria-label (or aria-labelledby to the title div) on settings numeric inputs, and give explicit aria-labels to the font family/size selects, Width min/max inputs and heatmap From/To inputs.

### P2-231. Alert dialogs have no accessible name or description, and the refused-Apply code-check alert never receives focus

*accessibility · accessibility* — `src/ui/alert.ts:47`, `src/ui/alert.ts:71`, `src/ui/alert.ts:87`, `src/ui/alert.ts:217`, `src/app.ts:2511`, `src/app.ts:2120`, `src/app.ts:2773`

buildAlert sets `host.setAttribute('role', options.type === 'error' || options.type === 'warning' ? 'alertdialog' : 'dialog')` on the overlay body, but no aria-labelledby/aria-describedby points at .dc-alert-message or .dc-alert-text, and the window title span is outside the role element (empty for #confirmExport). With actions, focus goes to `buttons[0]?.focus()` (for export, 'Decline') inside an unnamed dialog; with none, `if (actions.length === 0) return;` skips focus entirely, and buildCodeCheckAlert passes no actions. Scenario: a screen-reader user presses Apply in Properties with an invalid calculated column; the 'Query Validation Failure' window opens, focus stays on Apply, nothing is announced (no aria-live exists in src), and the user believes it applied. The export attestation text is visible DOM and reachable in browse mode, so that half is a naming defect rather than a hard block.

**Fix:** Give the message element an id and set aria-labelledby on the dialog element, give the text element an id and set aria-describedby, and put the role on the window element consistently. Always move focus into the alert: to the first action, or to the window close button / a tabindex=-1 body when there are no actions.

### P2-238. Context-menu items remove the focus outline, and the only sign of keyboard focus is a nearly invisible 1.09:1 grey tint

*accessibility · styling & CSS · reproduced* — `src/grid/grid.css:659`, `src/ui/menu-view.ts:129`, `src/ui/menu-view.ts:253`, `src/theme.css:133`

grid.css:659-663 is `.dc-menu-item:hover, .dc-menu-item:focus { background: var(--tw-neutral-100); outline: none; }`, which is #f5f5f5 on the white menu (1.09:1). Menu items are divs with role=menuitem and tabIndex=-1 (menu-view.ts:129-132), so the only menu focus ring, theme.css:133 `.dc-menu button:focus-visible`, never applies to them. A keyboard user opens the menu with Shift+F10 or the ContextMenu key and presses ArrowDown (menu-view.ts:253-267 moves real focus). They cannot tell which command Enter will run. This fails WCAG 2.4.7/1.4.11.

**Fix:** On .dc-menu-item:focus-visible, keep the tint but add a 2px outline or inset box-shadow in --dc-focus/--dc-active (at least 3:1 on white), or use a darker fill with a left bar.

### P2-239. The cell-selection wash is 1.07:1 on white rows and 1.16:1 on the default band, so selected ranges are almost invisible

*accessibility · styling & CSS · reproduced* — `src/grid/grid.css:599`, `src/grid/grid.css:608`, `src/grid/grid.css:611`, `src/grid/grid.css:615`, `src/grid/grid.css:559`, `src/config.ts:302`, `src/theme.css:94`, `src/app.css:1290`, `src/app.css:1401`

`.dc-cell.dc-selected { background: var(--tw-sky-50); }` (#f0f9ff) is 1.07:1 against white. Banded rows use sky-100 #e0f2fe against the default band #d7e0eb, which is 1.16:1 and lighter than the unselected band. Banding is on by default (config.ts:302). The selection deliberately has no border (comment at grid.css:599-603), and `--dc-selection-border` (theme.css:94) is defined but never read. Drag-selecting a 5x10 block leaves the user unable to see which cells Ctrl+C or the selection statistics act on. Picked rows in the Columns and dimension lists (app.css:1290, :1401, 1.15:1) and the header highlight (grid.css:608, 1.21:1) have the same problem.

**Fix:** Draw an outline around the selected range (for example a sky-600 box-shadow on the edge cells, using --dc-selection-border), or use a fill that reaches at least 3:1 against both white and the band colour.

### P2-240. Heatmap and user-set cell backgrounds are inline styles that override the selection class, so selected cells show no change

*correctness · styling & CSS* — `src/grid/grid.ts:1201`, `src/grid/grid.ts:1267`, `src/grid/grid.css:611`, `src/style.ts:189`

grid.ts:1201-1208 sets the appearance background inline with `cell.style.setProperty(k, v)` and then `if (heat) cell.style.backgroundColor = heat;`. Selection only adds a class (grid.ts:1268), and `.dc-cell.dc-selected { background: var(--tw-sky-50) }` (grid.css:611) cannot beat an inline declaration. Turn on Heatmap for a measure, or set a Normal/Negative background in the column editor, then drag-select in that column. The selected cells keep their colours and show no selection cue, while the status-bar statistics and Ctrl+C act on the invisible range. Only the header highlight and the focus-cell outline remain.

**Fix:** Draw the selection on a layer inline backgrounds cannot hide, such as a translucent ::after overlay or an inset box-shadow on .dc-selected, or route the selection through a custom property that the inline background combines with.

### P2-241. No forced-colors (Windows High Contrast) support, so cell selection, menu focus, selected filter nodes and drop markers disappear

*accessibility · styling & CSS* — `src/grid/grid.css:126`, `src/grid/grid.css:339`, `src/grid/grid.css:611`, `src/grid/grid.css:659`, `src/app.css:312`, `src/app.css:897`, `src/app.css:1290`, `src/app.css:1401`, `src/app.css:1924`, `src/app.css:1943`

No stylesheet under src/ or demo/ contains `@media (forced-colors`; the only media queries are prefers-reduced-motion (grid.css:256, :542). Several states are drawn only with background or box-shadow, which forced-colors mode replaces or removes: `.dc-cell.dc-selected` (grid.css:611), the menu focus with `outline: none` (:659-663), `.dc-filter-row.dc-selected` (:339-342), and the column drop markers `box-shadow: inset 2px 0 0 0 var(--dc-focus)` (:126-132, app.css:312-318, 1943-1956). A High Contrast keyboard user cannot see which menu item is focused, which cells are selected, or where a dragged column will land. The cell cursor survives because it uses an outline.

**Fix:** Add an `@media (forced-colors: active)` block that shows these states with outlines or borders in system colours, for example `.dc-cell.dc-selected { outline: 1px solid Highlight }` and `.dc-menu-item:focus { outline: 2px solid Highlight }`, and draw drop markers as borders.

### P2-242. Many small text styles fail WCAG AA contrast, including the 2.57:1 'Results truncated' warning

*accessibility · styling & CSS · reproduced* — `src/app.css:583`, `src/app.css:638`, `src/app.css:566`, `src/app.css:468`, `src/app.css:474`, `src/app.css:1441`, `src/app.css:1152`, `src/app.css:1639`, `src/app.css:1701`, `src/app.css:1784`, `src/app.css:1797`, `src/app.css:2189`, `src/grid/grid.css:880`, `src/grid/grid.css:895`, `src/app.ts:1090`

`.dc-status-warning { color: var(--tw-orange-500) }` is 10px #f97316 on the #f5f5f5 status bar, 2.57:1. That text is the only signal that totals are partial ('Results truncated to fit within row limit', app.ts:1090-1095). The status links (sky-600 on neutral-100) are 3.76:1. neutral-500 labels on neutral-100 are 4.35:1, which the comment at app.css:1462-1466 admits is under AA. The 'Loading...'/'0 rows' overlay, 'No columns selected' and the placeholders are neutral-400 on white, 2.52:1. green-600 and red-500 status text are 3.30:1 and 3.76:1. A low-vision user, or anyone viewing on a projector, can miss that they are looking at truncated numbers.

**Fix:** Use darker tokens for text: neutral-600 for secondary labels, orange-700/red-600 for the truncation warning, sky-700 for status links, and nothing lighter than neutral-500 for hints on white.

### P2-243. Default negative and zero value colours are hard to read on the default row band (2.82:1 and 1.89:1)

*accessibility · styling & CSS · reproduced* — `src/grid/grid.css:559`, `src/config.ts:302`, `src/config.ts:308`, `src/config.ts:310`, `src/config.ts:311`, `src/style.ts:188`

Banding is on by default (config.ts:302), and the band is `--dc-alt-row: #d7e0eb` (grid.css:559). The default value colours are `negativeForeground: '#ef4444'` and `zeroForeground: '#a3a3a3'` at 11px, applied inline by style.ts:188. In a default cube a negative figure on every other row is 2.82:1 (3.76:1 on white rows), and a zero is 1.89:1, close to blank. The error colour #2563eb is 3.88:1 on the band. Users can change these in the appearance settings, but the out-of-the-box figures fail AA on exactly the numbers users most need to read.

**Fix:** Choose defaults that reach at least 4.5:1 on both backgrounds (for example red-700 #b91c1c and neutral-600), or lighten the default band. Offer upstream's colours only as an opt-in.

### P2-244. In a host page that allows dark mode, several buttons render as white text on white because the app never sets color-scheme and these buttons never set a colour

*accessibility · styling & CSS · reproduced* — `src/app.css:1759`, `src/app.css:1726`, `src/app.css:1990`, `src/app.css:2021`, `src/app.css:2088`, `src/grid/grid.css:798`, `src/grid/grid.css:831`, `demo/index.html:28`

No file under src/ sets `color-scheme`. `.dc-adhoc-tool`, `.dc-adhoc-pov-chip` and `.dc-filter-list` set a white background but no `color`, so they take the UA's dark-scheme ButtonText. `.dc-calc-insert` and `.dc-filter-listplus` use `background: none`, and the calc inputs set neither. With Playwright colorScheme 'dark' and a host root of `color-scheme: light dark`, the verifier measured rgb(255,255,255) text on rgb(255,255,255) for the Ad Hoc toolbar buttons, POV chips and the `in`-list summary. The shipped demo pages are protected only because each forces `:root { color-scheme: light }` (demo/index.html:22-29), so this affects any other embedding host.

**Fix:** Declare `color-scheme: light` on .dc-app and .dc-menu (the component is light-only by design), and give every styled button and input an explicit `color`.

### P2-245. At 400% zoom (320x256 CSS px) the Ad Hoc and code-check windows lose their OK footers below the viewport, and the context menu's lower entries are off-screen

*accessibility · styling & CSS · reproduced* — `src/app.css:677`, `src/ui/window.ts:47`, `src/ui/window.ts:79`, `src/ui/window.ts:178`, `src/ui/alert.ts:106`, `src/adhoc/mode.ts:54`, `src/adhoc/mode.ts:57`, `src/grid/grid.css:631`, `src/ui/menu-view.ts:240`, `demo/index.html:36`, `demo/index.html:79`

fitWindow uses `height = Math.max(minHeight, ...)` and `y = Math.max(0, ...)`, dragging clamps y to 0 or more (window.ts:178), and resizing never goes below minHeight. The host body has `overflow: hidden` and #app is 100vh, so nothing can scroll the page. The verifier found that the column editor, Filter, Settings and plain alert (minHeight 200/80) fit. The code-check alert (alert.ts:106, minHeight 300), the Ad Hoc member selection window (mode.ts:55, minHeight 300) and the Options window (mode.ts:58, minHeight 360) open at y=0 in a 256px viewport, with their bottom 44-104px, including the OK footer, unreachable. `.dc-menu` (grid.css:631-644) has no max-height or overflow. The roughly 15-entry top-level menu is about 360px, so Pin through Properties fall below the fold for mouse users.

**Fix:** Clamp the window's minimum size to the container (min(minHeight, container minus margin)) and let the window scroll as a whole when the container is shorter. Give .dc-menu `max-height: 100vh` with overflow scrolling, which requires rendering submenus as separate fixed popups.

### P2-257. Charts silently stop at 50 points, and the treemap then lays those 50 out as if they were the whole result

*data-semantics · charts* — `src/chart.ts:80-81`, `src/chart.ts:304-306`, `src/chart.ts:345-353`, `src/app.ts:2057-2058`

chartData caps output with `const limit = options.limit ?? 50` and a loop guarded by `out.length < limit`, keeping the first 50 numeric rows in grid order (not the largest). #chart never passes a limit. toTreemap's only footnote counts `dropped = all.length - data.length`, computed after the cap, so it reports non-positive rows only, and toBarChart has no footnote at all. With 120 regions of value 1 each, the treemap spreads 100% of its area over the first 50, which overstates each tile's share 2.4x relative to the full data, and 70 bars vanish from the plot without a word while the grid beside it shows all 120.

**Fix:** Have chartData report the total count alongside the points. When rows exceed the limit, say so in both SVGs ('first 50 of 120 rows shown'), or roll the tail into an 'Other' item for the treemap so the areas stay true shares.

### P2-258. Chart number formatting rounds small values to '0' in every tooltip and axis label, and prints 999,950 as '1000.0k'

*correctness · charts · reproduced* — `src/chart.ts:197-204`, `src/chart.ts:168`, `src/chart.ts:170`, `src/chart.ts:181`, `src/chart.ts:334`

fmt is `if (abs >= 1e3) return `${(n / 1e3).toFixed(1)}k`; return String(Math.round(n * 100) / 100);`, and it is the chart's only numeric readout: the axis max/min labels, the bar tooltips and the treemap tooltips. Reproduced: plotting rates or returns such as [0.0031, 0.0012, -0.0004] makes every tooltip read 'EMEA: 0' and both axis extremes read '0', even though the bars have different heights. The unit is also chosen before rounding, so 999,950 becomes '1000.0k' instead of '1.0m'.

**Fix:** Format values below 1 in magnitude with significant digits (Intl.NumberFormat with maximumSignificantDigits, or toPrecision). Choose the k/m/b unit after rounding, so values cannot roll over to '1000.0k'.

### P2-261. An Ad Hoc option changed while a query is in flight is lost when that query lands, so the grid and the Options window disagree

*async-concurrency · ad hoc analysis · reproduced* — `src/adhoc/session.ts:82`, `src/adhoc/session.ts:84`, `src/adhoc/session.ts:93`, `src/adhoc/session.ts:193`

refresh() captures `const grid = this.#grid;` at the start and ends with `const view = assembleGrid(this.cube, grid, results, queries); if (seq !== this.#seq) return null; this.#view = view;`. setOptions replaces #grid and #view but does not bump #seq, so the older refresh still counts as current. The Options button stays clickable during a query, because setBusy only overlays the grid. Scenario (reproduced): with POV EMEA, start a slow Zoom In, then untick Suppress Missing Rows and press OK before it lands. When the refresh lands, the view still has 2022 suppressed (['Time',' 2021']) while session.grid.options.suppressMissingRows is false. The option looks ignored until the next action.

**Fix:** When the answers land, have refresh assemble with the current options (`withOptions(grid, this.#grid.options)`). Or have setOptions bump #seq and re-place the in-flight answer against the current grid. Add a test that interleaves a slow Run with setOptions.

### P2-262. Ad Hoc row indentation never shows because it is written as leading spaces in a nowrap flex cell, so the Indentation option has no visible effect

*correctness · ad hoc analysis · reproduced* — `src/adhoc/query.ts:310`, `src/grid/grid.ts:1250`, `src/grid/grid.css:172`, `src/grid/grid.css:222`

assembleGrid builds labels as `${' '.repeat(depth)}${memberLabel(dimension, path)}`, and grid.ts puts them in with `cell.textContent = text`. `.dc-cell` is `display:flex; white-space: nowrap`, and `.dc-cell.dc-dim` does not override it, so the leading spaces collapse. After Zoom In on Time, 'Time', ' 2021', '  Q1' and ' 2022' all render flush left, so parents and children on a mixed-generation axis cannot be told apart, whether Indentation is Subitems, Totals or None. The harness check reads view.table values, not the rendering, so it passes. Separately, 'totals' uses `Math.max(0, 3 - path.length)`, so on a 4-generation hierarchy generations 3 and 4 both get depth 0.

**Fix:** Render depth as padding (a per-row indent variable, as the tree column does) or set white-space: pre on the ad hoc label cells. Compute 'totals' depth from the dimension's generation count (deepest - path.length) instead of the literal 3.

### P2-263. Every Ad Hoc view has epoch 0, so the grid fits its columns only to the opening grid and zoomed member labels are clipped afterwards

*correctness · ad hoc analysis* — `src/adhoc/query.ts:333`, `src/grid/grid.ts:401`

assembleGrid always returns `table: { ..., epoch: 0, ... }`. The grid refits only when the epoch changes: `if (this.#options.autoFit && table.epoch !== this.#fittedEpoch) { this.#fittedEpoch = table.epoch; requestAnimationFrame(() => this.#fit()); }`, and a fitted width overrides --dc-dim-width. The opening grid has one row labelled with the dimension name, so the label column is fitted to that. After Zoom In, labels such as 'North America' show as 'North…', and the column never refits for the rest of the session unless the user drags it.

**Fix:** Give each assembled view a fresh epoch (a counter in the session, or the largest epoch of its results), so the grid refits after each answered step.

### P2-264. Every Ad Hoc column-axis operation is mouse-only, because header cells cannot be focused and a value cell gives the context menu no member

*accessibility · ad hoc analysis* — `src/adhoc/mode.ts:291`, `src/grid/grid.ts:267`, `src/grid/grid.ts:577`, `src/grid/grid.ts:591`

Column targets come only from `el.closest('.dc-th')` in #onContextMenu and from the header dblclick listener. Header cells get no tabIndex and no key handler, and the grid's focus model is clamped to body rows. For a body value cell, `view.rowDimensions.indexOf(column)` is -1, so #rowTarget returns null. A keyboard user who presses the ContextMenu key on a value cell under Year sees only Refresh/Undo/Redo/Options/Exit. They cannot Zoom, Keep Only, Remove Only, open Member Selection or Pivot any column-axis member or measure.

**Fix:** Bring header cells into the grid's keyboard model (let ArrowUp enter the header rows with a roving tabindex, Enter to zoom, the ContextMenu key for the menu), or resolve a value cell to its column tuple (view.columnTuples[col - rowDimensions.length]) as a column target in #onContextMenu.

### P2-265. assembleGrid builds the full row-by-column cross product before suppressing empty rows, so nested dimensions use gigabytes of memory and freeze the tab

*performance-memory · ad hoc analysis · reproduced* — `src/adhoc/query.ts:279`

`const rowTuples = tuples(grid.rows); ... const cells = rowTuples.map((row) => columnTuples.map((col) => valueOf(row, col)));` runs before suppression, and member lists have no cap. Measured with the real planQueries/assembleGrid on rows [customer (10,000), product (500)] × one measure with 3 products per customer: 2.9 s of synchronous work and 1.44 GB of heap to keep 30,000 rows. 2,000 × 500 takes 0.5 s and 317 MB. Customers at Bottom Level × products is a normal sparse ad hoc layout.

**Fix:** When missing rows are suppressed, build rows from the answers: iterate the result keys and emit only the tuples that have a value. Cap member lookups and the tuple count, with a clear message when the cap is hit.

### P2-266. Showing 65 or more members of a one-generation dimension drops its filter entirely, so the query fetches every member of that column

*performance-memory · ad hoc analysis · reproduced* — `src/adhoc/query.ts:102`

coveringMembers climbs to parents while `cover.length > MAX_FILTER_MEMBERS && (cover[0]?.length ?? 0) > 0`. On a one-generation dimension every parent is [], so the cover becomes [[]]. memberConditions then yields no condition, and planQueries pushes no filter. The shape query has no row limit. With Keep Only 65 customers on a 1,000,000-customer column, the engine (warehouse over HTTP or DuckDB-WASM) returns 1,000,000 aggregated rows, and assembleGrid indexes all of them to show 65. With 64 customers the same grid costs 64 rows.

**Fix:** Past the threshold, send the members as one `in` list (or a values-join or semi-join) instead of an OR of equalities, or chunk the OR. Climb to parents only for multi-generation dimensions, and only when the parent cover is actually small.

### P2-272. The Measures top member can be picked in Member Selection, which silently empties the grid on an axis or mislabels the POV

*correctness · ad hoc analysis · reproduced* — `src/adhoc/member-selection.ts:175`, `src/adhoc/query.ts:72`, `src/adhoc/query.ts:267`

paintTree always renders `walk([], 0)` with a checkbox or radio, including for Measures. measuresInPlay keeps only `onGrid.members.filter((m) => m.length === 1)`, and valueOf returns null when `measure === undefined`. Scenario (reproduced): Member Selection on Measures (columns) → Clear → tick the 'Measures' root, meaning 'all measures' → OK. planQueries returns [], every cell is null and suppressed, and the status shows '0 rows, 1 columns' with no explanation. Ticking the root alongside the measures adds an always-empty 'Measures' column. On the POV, picking the root sets pov.Measures = [], so the chip reads 'Measures' while every cell shows outline.measures[0].

**Fix:** Do not render a pick control for the Measures top member (or expand it to all measures in selectMembers), have session.members/selectMembers reject [] for Measures, and have OK require at least one real measure.

### P2-275. Member Selection search starts a new full scan of the whole dimension on every keystroke until the first scan finishes

*performance-memory · ad hoc analysis · reproduced* — `src/adhoc/member-selection.ts:213`, `src/adhoc/member-selection.ts:215`

The input handler returns early only `if (query === '' || everything)`. Otherwise it starts `guarded(async () => { ... for (let depth = 1; depth <= deepest; depth++) all.push(...await options.members([], depth)); everything = all; paint(); })`. `everything` stays null until a scan completes, and no in-flight promise is shared. Reproduced in jsdom on a 3-generation dimension: typing 'paris' (5 input events) issued 15 member lookups, which is 5 complete scans including the full leaf level. On the Live warehouse each scan is `deepest` remote statements run as the user, and a failure raises one error alert per scan.

**Fix:** Memoise the loading promise (`everything ??= load()`) or debounce, so all keystrokes share one scan. Cap the rendered matches (for example the first 500 plus a 'refine your search' row).

### P2-276. Picking many members in Member Selection takes quadratic time, so Bottom Level or Descendants on a 10k-leaf dimension freezes the tab for seconds

*performance-memory · ad hoc analysis · reproduced* — `src/adhoc/member-selection.ts:87`

`const key = (m) => JSON.stringify(m); const has = (m) => picked.some((p) => key(p) === key(m)); const add = (ms) => { for (const m of ms) if (!has(m)) picked = [...picked, m]; paint(); };`. paintPicked then does `picked.indexOf(m)` for each item, and paint() rebuilds the whole tree and picked list on every click or focus change. Measured with a copy of add/has: 2,000 members take 263 ms, 5,000 take 1,574 ms and 10,000 take 6,338 ms of main-thread time before any DOM work. Bottom Level on a Region>Country>City dimension with 10k cities freezes the tab for about 6 s, and each later click rebuilds all 10k picked items.

**Fix:** Keep a Set of keys beside the ordered array for O(1) lookup, append in one pass, and use the loop index in paintPicked. Render only the visible window of the tree, or at least do not rebuild it for a focus change.

### P2-277. The Descendants shortcut runs one query per parent member, one after another, where one query per generation would do

*performance-memory · ad hoc analysis · reproduced* — `src/adhoc/member-selection.ts:102`, `src/adhoc/member-selection.ts:104`, `src/adhoc/session.ts:148`

`async function descendantsOf(m) { const out = []; for (const c of await childrenOf(m)) out.push(c, ...await descendantsOf(c)); return out; }`. Each childrenOf is a separate planner compile and engine round trip, awaited in sequence, and it keeps running after the window closes. session.zoomIn gets the same set with one query per generation. Reproduced: Descendants on the top of a 3 × 4 × 5 hierarchy issued 15 serial lookups instead of 3. Year>Quarter>Month>Day over 10 years is 171 round trips, about 17 s at 100 ms each, with no progress and no cancel.

**Fix:** Implement Descendants as one members(focus, depth) call per depth from focus.length+1 to deepest, ordered with inHierarchyOrder as zoomIn does, and stop when the window closes.

### P2-278. Ad Hoc member lookups have no row limit and are spread into push() arguments, so large dimensions fail with 'Maximum call stack size exceeded'

*performance-memory · ad hoc analysis · reproduced* — `src/adhoc/outline.ts:108`, `src/adhoc/outline.ts:143`, `src/adhoc/session.ts:148`, `src/adhoc/member-selection.ts:104`, `src/adhoc/member-selection.ts:221`

The member query scope is `{ level: keys.length, parent: [] }` with no limit, unlike the main tree's maxRows+1 cap. The results are then spread as call arguments: `found.push(...await this.members(dimension, member, depth))` (session.ts:148), `all.push(...await options.members([], depth))` (member-selection.ts:221), `out.push(c, ...await descendantsOf(c))`, and `Math.min(...depths)`. Measured on Node 22: 100k arguments work and 125k throw RangeError. JavaScriptCore caps arguments at 65,536. Every dimension-kind column is its own dimension, so zooming into the top of an `account` column with 150k values, or typing one character in its member search, fetches all 150k keys and then fails. On WebKit this happens from about 70k members, with an error that does not say the dimension is too large.

**Fix:** Pass a limit (maxRows+1) on member queries and tell the user when it is hit, as the main tree does. Append with a loop or concat, never by spreading unbounded query results into call arguments.

### P2-279. The Member Selection tree is mouse-only: shortcut targets are set only by clicking a label, and every tick rebuilds the tree and drops focus

*accessibility · ad hoc analysis* — `src/adhoc/member-selection.ts:153`, `src/adhoc/member-selection.ts:154`

The target of Children, Descendants, Bottom Level and Same Level (`focus`) is set only in `label.addEventListener('click', () => { focus = m; paint(); })` on a non-focusable <span>. There is no keydown handler, tabindex, aria-level or aria-selected in the file. A checkbox change calls toggle → paint() → `tree.replaceChildren()`. A keyboard user can tick '2021' with Space, but focus then falls to <body>, and the shortcuts always act on the top member, so Children adds the top-level members instead of 2021's.

**Fix:** Make treeitems focusable with a roving tabindex, handle Arrow, Enter and Space, set aria-level and aria-selected, set the shortcut target on focus, and update rows in place or restore focus after paint().

### P2-288. Save View in Ad Hoc saves the hidden cube and reports 'saved', so the Ad Hoc layout on screen is lost

*state-persistence · ad hoc analysis · reproduced* — `src/app.ts:2213`, `src/app.ts:2219`, `src/app.ts:2998`, `src/app.ts:3129`

The hamburger keeps Save View while Ad Hoc is on, and 'view.save' calls saveView, which writes `snapshot: this.#snapshot, tree: this.#controller.tree` and reports `saved "${name}"`. The Ad Hoc grid (axes, POV, members, options) is never serialized. Reproduced: zoom Geography to AMER/EMEA in Ad Hoc and choose Save View; the stored view has rows ['region'] and no mention of Geography, and the status says 'saved "view"'. A later Load View gives back the cube view, not the Ad Hoc arrangement the user thought they saved.

**Fix:** While Ad Hoc is on, either disable Save View and Load View, or persist the Ad Hoc grid with the view and restore the mode on load. At least do not report 'saved' for something other than what is on screen.

### P2-289. Load View, Properties, dimension entries, Settings > Reload and Show Drag Zones stay offered in Ad Hoc but only re-query the hidden cube, so nothing visible changes

*correctness · ad hoc analysis* — `src/app.ts:2235`, `src/app.ts:2348`, `src/app.ts:2619`, `src/app.ts:2975`, `src/app.ts:3040`, `src/app.ts:1167`

These actions stay available while `this.#adhoc` is set (hamburger entries, Ctrl-E → openEditor, the status bar's Properties). loadView sets #snapshot and #config, calls #refresh() and reports `loaded ...`. useDimension and Settings > Reload go through #refreshOr, and Properties Apply through #refresh. 'Show Drag Zones' calls #setChrome, but #applyChrome keeps the zone bar hidden while Ad Hoc is on. None of them touch the Ad Hoc session. Scenario: in Ad Hoc showing Geography 350, Load View of a view grouped by desk with a desk == Rates filter; the status says 'loaded "mine"' and the bar says 'Filter (on)', but the Ad Hoc grid still shows Geography 350 with no filter.

**Fix:** While Ad Hoc is on, hide or disable the cube-only entries (Properties, dimensions, Load View, Drag Zones). Or route them: exit the mode first, or rebuild the session from the new cube snapshot and refresh it.

### P2-290. Under the Ad Hoc grid the status bar shows the hidden cube's row, column and timing counts, while the Ad Hoc counts go only to a host callback the demo drops

*correctness · ad hoc analysis* — `src/app.ts:998`, `src/app.ts:1013`, `src/app.ts:1026`, `src/adhoc/mode.ts:163`, `demo/boot.ts:467`

#renderStatusBar keeps writing `timingText(view, cols)` into `.dc-app-stats`, which stays visible in Ad Hoc mode. AdHocMode.#paint reports `${view.table.rowCount} rows, ${view.columnTuples.length} columns` through options.status → app #status → onStatus, and the demo's onStatus ignores everything but errors. A cube refresh during Ad Hoc also calls #status and the host's onView, so the 'Generated Pure & SQL' panel shows the cube's query. After zooming to 3 Ad Hoc rows, the readout under the grid says '2 rows × 2 cols in 1ms', and the Ad Hoc row count is shown nowhere in the demo.

**Fix:** While the mode is on, show the Ad Hoc view's own counts in the status bar (or hide the cube's), and keep the host's query panel on the Ad Hoc queries or blank it.

### P2-292. Superseding a Live query during its first POST (held open up to 10 s) never cancels it on the server, so abandoned statements occupy the 2 shared workers and their results stay held for 10 minutes

*async-concurrency · warehouse client · reproduced* — `datacube/src/warehouse.ts:147`, `datacube/src/warehouse.ts:155`, `datacube/src/warehouse.ts:175`, `datacube/src/warehouse.ts:123`, `datacube/src/runner.ts:126`, `datacube/src/epoch.ts:118`, `warehouse/src/main/java/com/legend/warehouse/server/WarehouseServer.java:335`, `warehouse/src/main/java/com/legend/warehouse/server/WarehouseServer.java:492`, `warehouse/src/main/java/com/legend/warehouse/server/WarehouseServer.java:495`

`arrowChunks` awaits `this.#call('POST', '/sql/v1/statements', signal, { ..., timeoutMs: TIMEOUT_MS /*300_000*/, waitMs: POLL_WAIT_MS /*10_000*/ })` before `const id = status.statementId; try {`, and only that try's catch sends `/statements/${id}/cancel`. The server holds the POST open with `waitFor(run, Math.min(Math.max(0, req.waitMs()), MAX_WAIT_MS))`, and nothing on the server cancels a run when the client disconnects. EpochGuard.advance() aborts the previous signal on every interaction, and runner.ts:126 passes that signal to `engine.execute`, so an abort in the first 10 s rejects the fetch before `id` exists: no cancel and no DELETE are sent. Scenario: on a Live cube whose group-by takes about 6 s, the user re-pivots twice within a second. Both abandoned statements run to completion (up to 300 s) on the default `concurrency = 2` pool shared by every user, so the query the user is waiting for, and other users' queries, queue behind them; each result is then retained for `retainMinutes = 10`. Three reproductions with a stubbed fetch showed only `POST /sql/v1/statements` was ever sent. The results shown stay correct (the epoch guard discards stale answers) and the damage is bounded by the timeout and the retain sweep, so this is MEDIUM rather than the HIGH one member claimed. It also breaks the doc comment on `execute`: 'the statement is cancelled on the server'.

**Fix:** Get the statement id before any long wait: submit with `waitMs: 0` (or a short wait) and do all the waiting in the GET poll inside the try. Alternatively, have the client send its own statement id or idempotency key that /cancel can target, so an abort at any point can cancel. Together with the try/finally in the next entry, every abort path then cancels or DELETEs the statement.

### P2-297. After the token expires, signing in again as the error asks never reaches the open cube: it keeps sending the old token, and the only fix that works (Open) rebuilds an empty cube

*error-handling · warehouse client · reproduced* — `datacube/src/warehouse.ts:107`, `datacube/src/warehouse.ts:191`, `datacube/src/warehouse.ts:201`, `datacube/demo/boot.ts:610`, `datacube/demo/boot.ts:641`, `datacube/demo/boot.ts:660`, `warehouse/src/main/java/com/legend/warehouse/server/WarehouseServer.java:518`

On a 401, `#call` throws `'the warehouse session has expired — sign in again'`, but `WarehouseEngine` keeps `readonly #session: WarehouseSession` for its whole life, and `#auth()` always reads `this.#session.token`. The Sign-in handler only reassigns boot's local variable (`session = await signIn(...)`); the engine is built once in the Open handler (`live: new WarehouseEngine(session as WarehouseSession)`). Scenario: the user builds filters and a layout on a Live table; after the default 1-hour token life every query returns 401; they sign in again successfully, yet every query still sends the old bearer token (a repro showed both requests carrying `Bearer tok1`). Only pressing Open recovers, and that runs `app.dispose(); app = makeApp({... rows: [], measures: [] ...})`. MEDIUM rather than HIGH: Save View and Load View (localStorage) let a user who knows the workaround keep the layout, so the problem is a misleading recovery path, not unavoidable loss of saved work. This shares its root cause with pass 1's M2 (no token refresh).

**Fix:** Give WarehouseEngine a way to take a new token, such as a mutable session holder or a token-provider callback read by `#auth()`. Have the Sign-in handler update the open cube's engine, not just boot's local variable.

### P2-299. The shared model-parse request is tied to the first query's abort signal, so a user action during first load fails with a 'superseded: epoch 1' error and no grid

*async-concurrency · engine plane · reproduced* — `src/engine-remote.ts:210`, `src/engine-remote.ts:211`, `src/engine-remote.ts:242`, `src/runner.ts:165`

#modelContext memoises `this.#model ??= this.#post('/grammar/grammarToJson/model', this.#options.model, pure, signal, true)` with the FIRST caller's signal, and every later query awaits that same promise. When EpochGuard supersedes query 1, #post rethrows `signal.reason` (`if (signal?.aborted) throw signal.reason ?? cause;`). The `.catch` that clears #model runs only after query 2 has already awaited the doomed promise. RemoteRun.run rethrows unwrapped only when its OWN signal is aborted, so query 2, which is current, wraps query 1's Superseded as a QueryFailure. Reproduced several times with the real LegendEngineExecutor, RemoteRun, EpochGuard and CubeController, using a fake fetch that honours abort: the user opens index-engine.html and sorts before the model parse returns. Update 1 resolves STALE, update 2 rejects with 'superseded: epoch 1 was replaced before it finished', the 'Data Fetch Failure' alert opens, and no view renders until the next action.

**Fix:** Do not pass a caller's signal to the shared, memoised model parse. Start it with no signal, or with a controller the executor owns that is aborted only when no caller is still waiting. Each caller races its own signal against the shared promise, so an abort rejects only that caller. Add a concurrent-query test.

### P2-307. TIMESTAMP_NS/_MS/_S, unsigned-integer and UUID columns (e.g. pandas Parquet) are typed String while the table keeps the native type, so date filters are refused and text filters fail in DuckDB

*data-semantics · DuckDB & file ingest · reproduced* — `src/infer.ts:50`, `src/infer.ts:62`, `src/infer.ts:64`, `src/infer.ts:68`, `src/infer.ts:75`, `src/upload.ts:128`, `demo/boot.ts:639`

sqlTypeOf maps only 'TIMESTAMP', 'TIMESTAMP WITH TIME ZONE' and 'TIMESTAMPTZ' to TIMESTAMP. It maps UBIGINT but not UTINYINT, USMALLINT, UINTEGER or UHUGEINT, and has no UUID arm. All of these hit the `VARCHAR(4096)` default, although the comment at infer.ts:50-52 says the list 'covers what DuckDB's CSV, Parquet and JSON readers actually produce'. Only nested columns are converted at load, so the physical column keeps its real type. Reproduced: a pyarrow/pandas Parquet file with nanosecond timestamps reads as TIMESTAMP_NS and is typed String. A date filter `ts_ns > %2024-03-01T12:00:00` is refused by the planner ('no overload of greaterThan ... STRING, DATE_TIME'), and the text filters offered instead fail with 'strpos(TIMESTAMP_NS, STRING_LITERAL)'. UINTEGER columns fail the same way ('contains(UINTEGER, STRING_LITERAL)') and cannot be used as measures. warehouse catalog columns go through the same inferModel.

**Fix:** Map TIMESTAMP_NS/_MS/_S to TIMESTAMP, UTINYINT/USMALLINT to INTEGER, and UINTEGER/UHUGEINT to BIGINT or DECIMAL(38,0). For anything still falling to the default (UUID etc.), CAST to VARCHAR at ingest with `SELECT * REPLACE (CAST(c AS VARCHAR) AS c)`, or refuse loudly.

### P2-308. A CSV is always read with HEADER=TRUE, so a headerless file silently loses its first data row into the column names

*data-semantics · DuckDB & file ingest · reproduced* — `src/upload.ts:104`

upload.ts:104 builds `read_csv('${virtualName}', AUTO_DETECT=TRUE, HEADER=TRUE)`, even though the comment above it says there is 'no reason to impose the narrower rule' of a required header. Reproduced with the duckdb CLI: `EMEA,Rates,100.5\nAMER,FX,200\nAPAC,Credit,300.25` loads with columns named EMEA / Rates / 100.5 and only 2 rows, so the sum of the third column is 500.25 instead of 600.75. Without the flag, the sniffer detects that there is no header and loads 3 rows as column0..2. No test covers header handling.

**Fix:** Drop HEADER=TRUE and let DuckDB's sniffer decide, or tell the user plainly that the first row was used as the header.

### P2-309. DECIMAL(p,0) columns such as integral ids are classified as measures and summed by default

*data-semantics · DuckDB & file ingest · reproduced* — `src/infer.ts:57`, `src/infer.ts:171`, `src/snapshot.ts:191`, `src/serialize.ts:918`

sqlTypeOf keeps `DECIMAL(10,0)` as written (and rewrites NUMERIC to DECIMAL). pureTypeOf then drops the parameters and yields 'Decimal', and `kindOf` returns `isFractionalType(pureType) ? 'measure' : 'dimension'`, so the scale never counts. serialize.ts:918-925 defaults a measure to sum. Reproduced with inferModel: `account_id DECIMAL(10,0)` (a Parquet export from another database) or a warehouse `customer_no NUMERIC(18,0)` comes out as kind 'measure'. After grouping by region the grid shows a meaningless summed account_id, which is the harm kindOf's own doc comment says the rule exists to prevent for integers.

**Fix:** Treat a DECIMAL whose scale is 0 as integral (a dimension); only a positive scale should make a column a measure.

### P2-310. Cancelling a DuckDB-WASM query never stops it: send() resolves only after the query finishes, so each superseded query runs to completion and blocks the next

*performance-memory · DuckDB & file ingest* — `src/duckdb.ts:478`, `src/duckdb.ts:490`, `src/duckdb.ts:415`, `test/duckdb-cancel.test.ts`

#stream awaits `batches = await send.call(this.#conn, sql);` with no second argument and without checking the signal. cancelSent() runs only inside the later `for await` loop or its catch. In the bundled duckdb-wasm 1.33.1-dev57.0, `send(text, allowStreamResult = false)` loops startPendingQuery/pollPendingQuery until the result is fully materialised, so by the time cancel could run there is nothing left to cancel. Scenario: a 2 s local GROUP BY is superseded 300 ms in and EpochGuard aborts it, but the engine stays parked in send() for the full 2 s. Because of #serialised, the new query waits behind it, so every quick re-pivot pays the full cost of the query it replaced. test/duckdb-cancel.test.ts passes only because its fake send() resolves at once with a lazy generator.

**Fix:** Register a signal 'abort' listener that calls conn.cancelSent() before awaiting send(), and remove it afterwards. Consider send(sql, true) so batches really stream. Test against a real duckdb-wasm connection with a query slow enough to interrupt.

### P2-311. Parquet/JSON upload, to_json and remote mounts need DuckDB extensions downloaded at runtime from extensions.duckdb.org, so they fail in firewalled deployments

*build-deploy · DuckDB & file ingest · reproduced* — `src/upload.ts:95`, `src/upload.ts:99`, `src/upload.ts:131`, `src/remote.ts:4`, `src/remote.ts:168`, `src/infer.ts:19`, `BUILD.bazel:292`

remote.ts:4 claims 'the duckdb-wasm binary has httpfs, parquet and iceberg compiled in', and infer.ts:19-20 claims the same for parquet. On the vendored duckdb-eh.wasm, duckdb_extensions() reports parquet, json, httpfs and iceberg as NOT_INSTALLED. After first use they load with install_mode REPOSITORY, meaning they were fetched over the network. With autoload disabled, `COPY ... (FORMAT parquet)` fails with 'Copy Function with name "parquet" is not in the catalog, but it exists in the parquet extension', and read_json_auto fails the same way. The vendor filegroup ships no .duckdb_extension files, and nothing sets custom_extension_repository. Scenario: in the air-gapped deployment boot.ts:230-236 targets, or once a CSP connect-src is added, picking a .parquet or .json file fails. Everywhere else, each browser contacts a third-party domain on first use.

**Fix:** Vendor the wasm extensions beside the bundle and point custom_extension_repository at the page's own origin, or LOAD them from there at boot. Correct the 'compiled in' comments.

### P2-312. CSV and JSON uploads are read into one JS string, so files over ~512M characters fail with a raw browser error, and peak memory doubles

*performance-memory · DuckDB & file ingest* — `src/upload.ts:88`, `src/upload.ts:91`, `demo/boot.ts:673`, `demo/boot.ts:717`

CSV/JSON go through `await db.registerFileText(virtualName, await file.text())`. duckdb-wasm then encodes the string and mallocs a copy in the WASM heap. Only Parquet takes the byte path (`registerFileBuffer(..., new Uint8Array(await file.arrayBuffer()))`). V8's maximum string length is about 512M characters, which boot.ts:717-720 already names for samples, and nothing checks file.size. Scenario: a 700 MB CSV (about 7-8M rows, under MAX_SNAP_ROWS) makes file.text() reject, and the note shows 'could not open trades.csv: ' followed by the raw allocation error. The file can never be opened, although registerFileBuffer or registerFileHandle would work.

**Fix:** Register CSV/JSON as bytes the way Parquet is registered, or better, with registerFileHandle(name, file, BROWSER_FILEREADER, true) so DuckDB reads the File lazily. Say in plain words when a file is too big for the tab.

### P2-313. Every uploaded file's raw buffer and table stay in DuckDB-WASM for the life of the tab; nothing is ever dropped

*performance-memory · DuckDB & file ingest · reproduced* — `src/upload.ts:22`, `src/upload.ts:85`, `src/upload.ts:91`, `src/upload.ts:120`, `demo/boot.ts:673`

ingestFile registers `upload_${table}.${format}` and runs `CREATE OR REPLACE TABLE ${qt} ...`, so only a file with the same name replaces an earlier one. The DuckDbFiles interface does not declare dropFile, and src/ and demo/ contain no dropFile and no DROP of earlier upload tables. openFile disposes only the JS app and reuses the same db and engine. Reproduced: opening four different 22.5 MB CSVs in turn took the table count from 1 to 4 and duckdb_memory() from 26 to 104 MB, with none released, although only the last file is on screen. A user working through several few-hundred-MB exports reaches the wasm32 4 GB limit, and later uploads or queries fail with out-of-memory.

**Fix:** Call db.dropFile(virtualName) right after CREATE TABLE AS, since the table no longer needs the file. When a new file is opened, DROP the previous upload's table.

### P2-314. Upload type sniffing reads only a sample, so a late row of a different type, or a JSON key that first appears late, fails the whole upload with no recourse

*error-handling · DuckDB & file ingest · reproduced* — `src/upload.ts:99`, `src/upload.ts:104`, `src/upload.ts:120`, `demo/boot.ts:673`

`read_csv(..., AUTO_DETECT=TRUE, HEADER=TRUE)` and `read_json(..., auto_detect=true)` use DuckDB's default sample_size (20,480). They set no union_by_name, ignore_errors or all_varchar fallback, and there is no retry. Reproduced with the real ingestFile: a 300,001-row CSV whose `code` column is numeric until a final 'N/A' fails with 'Could not convert string "N/A" to BIGINT'. A 30,001-record JSONL whose key 'late' first appears in the last record fails with 'JSON transform error ... unknown key "late"'. The user sees 'could not open <file>: ...' and DuckDB's advice to change reader options that the UI cannot set.

**Fix:** On a conversion or unknown-key error, retry with sample_size=-1 (and union_by_name=true for JSON), or fall back to all_varchar for the offending column. At minimum, rewrite the error in terms the user can act on.

### P2-315. A Row Limit on a flat cube or on detail rows has no total order, so which rows are kept at the cut changes from refresh to refresh

*correctness · DuckDB & file ingest · reproduced* — `src/snapshot.ts:736`, `src/cube.ts:412`, `src/treeview.ts:199`, `src/serialize.ts:1166`

totalOrderSorts appends only `groupCols` as tiebreakers (`for (const r of groupCols) { if (!seen.has(r)) ... }`). A flat cube and a group's detail rows have no group columns, so nothing is appended. The real planner emits `SELECT ... FROM TRADES AS t0 LIMIT 4`, or with a sort on a column that has ties, `ORDER BY t0.region NULLS LAST LIMIT 4`. Detail rows under a region group sort by the constant region. Scenario on the warehouse (multi-threaded DuckDB, 3M rows): with Row Limit 5 sorted by a 3-value region, successive runs of the same query returned ids 0,3,6,..., then 245760..., then 614400.... Every refresh (a format tweak, a filter toggle, undo) silently shows a different set of rows under the same 'first N' warning.

**Fix:** When a query is capped, append a tiebreaker that makes the order total: every projected column, or a row-identity column when the source has one. Or state in the UI that a limited unsorted view is an arbitrary sample.

### P2-320. The planner needs WebAssembly exnref as well as GC; on a GC-only browser the default page fails to start with a hidden, cryptic compile error and nothing names the browser floor

*browser-compat · planner & browser support · reproduced* — `src/wasm-planner.ts:133`, `src/wasm-planner.ts:257`, `src/wasm-planner.ts:261`, `src/planner-worker.ts:76`, `demo/main.ts:62`, `demo/boot.ts:313`, `demo/index.html:164`, `../wasm/README.md:95`

The shipped classes.wasm needs exnref (try_table) as well as WasmGC. On Node 22.16 plain `WebAssembly.compile` fails with `Compiling function #60 failed: Invalid opcode 0x1f (enable with --experimental-wasm-exnref)`, and it compiles OK with the flag. Nothing in src/ or demo/ feature-detects either feature: no `WebAssembly.validate`, no unsupported-browser page. wasm/README.md:98 says "Browsers that have shipped WASM-GC need no flag", which misstates the floor. The default page uses the worker path, which posts back only the raw `cause.message` (planner-worker.ts:79), wrapped as `the planner worker failed: ${e.data.error}`. The diagnostic hint exists only on the in-thread #load path, and there it blames the wrong feature (`' — this runtime may lack WebAssembly GC'`). Scenario: a user on Chromium/Edge 119-136, Gecko 120-130 or WebKit 18.0-18.3 opens index.html. `await engineReady` (boot.ts:313) rejects before #status has left `<div id="offstage" hidden>`, so main.ts writes "failed to start: ...Invalid opcode 0x1f..." into a hidden span and the page stays blank. The affected browsers are all 15+ months old, which is why this is MEDIUM and not HIGH.

**Fix:** Before loading, feature-detect GC and exnref once with `WebAssembly.validate` on tiny modules, and share the result between the worker and in-thread paths. Below the floor, show a visible, error-styled message such as "this browser is too old: needs Chromium 137 / Gecko 131 / WebKit 18.4". Fix the GC-only hint and the README floor. Alternatively, build the planner with legacy exception handling.

### P2-321. If DuckDB-WASM fails to compile in its worker (for example the .wasm is served with the wrong MIME type), boot hangs forever on a blank page

*async-concurrency · planner & browser support · reproduced* — `demo/boot.ts:253`, `demo/boot.ts:255`, `demo/main.ts:62`

boot.ts builds `new Worker(bundle.mainWorker!)` and then runs `await db.instantiate(bundle.mainModule, bundle.pthreadWorker)` with no timeout and no worker error listener. The vendored duckdb-browser-eh worker calls `WebAssembly.instantiateStreaming(a,e).then(...)` with no rejection handler. A failed compile therefore never posts an ERROR back, and the instantiate promise never settles, so main.ts's `.catch` never runs. Reproduced in headless Chromium 153 by serving only the duckdb *.wasm files as application/octet-stream, which is common on S3 and static hosts. After 25-40 s the status still read "starting DuckDB…" inside the hidden #offstage div, the body was empty, and the only trace was an uncaught pageerror, "Incorrect response MIME type". The same run with application/wasm booted normally. The same path fires when a CSP lacks 'wasm-unsafe-eval' or a constrained device cannot allocate the module.

**Fix:** Race `db.instantiate` against a rejection from `worker.addEventListener('error', ...)` and against a timeout, then show the failure visibly. Optionally, when streaming compile rejects for a MIME reason, fall back to fetch + arrayBuffer + compile.

### P2-328. Any boot failure leaves a blank white page: progress and the 'failed to start' error go into #status, which sits inside a hidden container

*error-handling · demo host & boot · reproduced* — `demo/boot.ts:211`, `demo/boot.ts:417`, `demo/boot.ts:512`, `demo/index.html:164`, `demo/index-server.html:175`, `demo/index-engine.html:173`, `demo/main.ts:62`, `demo/main-server.ts:83`

All three shells declare `<div id="offstage" hidden><span id="status">loading&hellip;</span>`. boot() writes every progress message ('starting DuckDB…', 'starting planner…') into that node. It only leaves #offstage through `hostStatus: (slot) => slot.append(status)` inside makeApp, and makeApp runs at boot.ts:512 after DuckDB, the data and the planner are all ready. The entry points' catch handlers (`s.textContent = `failed to start: ...``, main.ts:62-67 and main-server.ts:83-87) write to the same hidden node. This was reproduced in headless Chromium with a classes.wasm that fails to compile: the status held 'failed to start: the planner worker failed: WebAssembly.compileStreaming()…', its parent was 'offstage', #app had 0 children, and body.innerText was "". The same blank page follows a remote parquet that returns 404, a browser without WebAssembly GC, or an unreadable localStorage. On a normal boot the user also stares at a white page for the whole 36 MB DuckDB download.

**Fix:** Keep #status (or a dedicated boot/error banner) visible outside #offstage until makeApp adopts it. In every entry point's catch (main.ts, main-server.ts, main-engine.ts), move the node into #app or a visible banner before writing the error.

### P2-329. Unguarded `window.localStorage` read stops the cube from starting in any browser that refuses site storage

*browser-compat · demo host & boot* — `demo/boot.ts:410`, `demo/main-engine.ts:113`

makeApp's options literal evaluates `storage: window.localStorage,` before `new CubeApp`. main-engine.ts:113 does the same. The same file wraps every other storage access in try/catch and says 'storage may be refused (private windows), so never relied on' (boot.ts:452-457, 595-599, 612-616, storedSettings ~844-851). In Chromium with 'Don't allow sites to save data', in Gecko with cookies disabled, or in a sandboxed iframe, the getter throws SecurityError ('Access is denied for this document'). The throw comes from makeApp at boot.ts:512, so boot rejects and, through the hidden-#status defect, the user gets a blank page, even though storage only backs Save/Load View. Opening a file or a warehouse table rebuilds the app through the same path and fails the same way.

**Fix:** Resolve storage once through a guarded helper (`let store; try { store = window.localStorage } catch {}`) and pass `...(store ? { storage: store } : {})`. CubeAppBaseOptions.storage is already optional, and the app hides Save/Load View when storage is absent. Apply the same change in main-engine.ts.

### P2-331. Picking the same file again (e.g. after fixing or editing it) does nothing, because the file input is never reset

*correctness · demo host & boot* — `demo/boot.ts:785`

`input.addEventListener('change', () => { const file = input.files?.[0]; if (file) void openFile(file); });` and `input.value` is never cleared (the only value reset in boot.ts is the password field). Browsers fire `change` only when the selection differs, so re-selecting the same path fires nothing. Scenario: the note reads 'could not open sales.csv: …', and the user fixes the file and picks it again, which is exactly the retry the openFile comment anticipates ('An uploaded file is the one input the user can actually fix'). Nothing happens and the old error stays up. After a successful open, an edited file picked again leaves stale rows on screen, and the note still reads 'trades.csv: N rows'.

**Fix:** Clear `input.value = ''` right after reading `input.files[0]`, so every pick fires `change`.

### P2-340. ?engine=, ?legendLite= and ?remote= point the trusted page at any server or data file, so a link shows an attacker's figures under the real URL

*security · security & dev server* — `demo/page-config.ts:45`, `demo/page-config.ts:46`, `demo/main-server.ts:73`, `demo/main-engine.ts:88`, `demo/boot.ts:271-289`

page-config.ts:45-46 `legendLite: text(q.get('legendLite')) || file.legendLite, legendEngine: text(q.get('engine')) || file.legendEngine` override config.json with no allowlist. The only check on those addresses is a health fetch to the same host, which an attacker's server passes. boot.ts:272-289 mounts any `?remote=` URL as the `trades` view. Scenario: `index-server.html?legendLite=https://evil.example` makes the attacker's /engine/plan return SQL of its choosing (e.g. `SELECT 'EMEA', 999999999 ...`), which runs in the tab's DuckDB and renders as the Trades cube. `?engine=` does the same with TDS rows, and `?remote=https://evil.example/t.parquet` swaps in the attacker's file. Nothing on screen says the backend was replaced. No credentials are sent on these paths, so this is MEDIUM rather than HIGH.

**Fix:** Treat server and data addresses as deployment configuration: config.json, optionally with an allowlist the query string may pick from. If a development override is kept, show a persistent banner naming the non-default host.

### P2-341. The dev server never checks the Host header, so a DNS-rebinding page can read the --data file and everything else it serves on 127.0.0.1

*security · security & dev server · reproduced* — `demo/serve.mjs:111-137`, `demo/serve.mjs:40-52`

The createServer handler (serve.mjs:111-137) checks only the path (DATA_ROUTE, the redirect, servedPath) and never reads `req.headers.host`. The comment at lines 40-51 presents binding to loopback as the protection, but DNS rebinding gets past it. Reproduced: `curl -H 'Host: rebind.attacker.example:18731' http://127.0.0.1:18731/data.parquet` returned the --data file's contents. Scenario: the user runs `bazel run //datacube:serve -- --data ~/positions.parquet` and then visits http://rebind.attacker.example:8000. Once that name resolves to 127.0.0.1, the attacker page's same-origin `fetch('/data.parquet')` reads the private file, in browsers that do not enforce private-network access checks.

**Fix:** Reject any request whose Host is not localhost:<port>, 127.0.0.1:<port> or [::1]:<port> (or the explicit --host value), or require a random per-run token in the served URL.

### P2-342. The dev server exits on any read error after headers are sent: a GET of a directory, or DuckDB's HEAD on a --data file over 2 GiB, kills it

*error-handling · security & dev server · reproduced* — `demo/serve.mjs:80-86`, `demo/serve.mjs:136`

sendFile sends `res.writeHead(200, ...)` and only then runs `res.end(await readFile(path))` (lines 80-86). servedPath does not reject directories and nothing checks `st.isFile()`. When readFile throws (EISDIR, or ERR_FS_FILE_TOO_LARGE), the catch at line 136 calls `res.writeHead(404, ...)` again. That throws ERR_HTTP_HEADERS_SENT inside the async handler, the rejection goes unhandled, and Node 22 exits. Reproduced on Node 22.16: `curl http://127.0.0.1:8765/src/` killed the process with `Error [ERR_HTTP_HEADERS_SENT] ... at Server.<anonymous> (serve.mjs:136:9)`. `curl -I /data.parquet` on a sparse 2.3 GB --data file also killed it, and DuckDB-WASM sends exactly that HEAD when it opens the file, so the documented real-data flow crashes on first load.

**Fix:** Serve only regular files (`st.isFile()`). Stream the body with createReadStream and skip it for HEAD. In the catch, check `res.headersSent` and call `res.destroy()` instead of writing headers again.

### P2-343. The dev server reads the whole file into memory for every HEAD, unranged GET and `bytes=0-` request, so DuckDB's size probe loads the entire --data file

*performance-memory · security & dev server · reproduced* — `demo/serve.mjs:86`, `demo/serve.mjs:89-95`

sendFile never checks req.method. Without a Range header it runs `res.end(await readFile(path))` (line 86), even for HEAD. With `bytes=0-` it sets end = size-1 and runs `Buffer.alloc(len)` plus `fh.read` over the whole file (lines 89-95). DuckDB-WASM's worker opens files with `f.open("HEAD",_.dataUrl,!1),f.setRequestHeader("Range","bytes=0-")`. Reproduced: with a 1.5 GB --data file, one `curl -I -H 'Range: bytes=0-'` took the server's RSS from 95 MB to 1.56 GB. Every reload and every extra tab repeats this, which defeats the README's promise of reading only the bytes a query needs.

**Fix:** Answer HEAD with headers only, and stream bodies with fs.createReadStream(path, { start, end }) instead of buffering them.

### P2-350. CI never builds //datacube:dist, :site or the esbuild bundles, so the deployable artifact is untested and its defects ship with CI green

*test-coverage · build & deploy · reproduced* — `../.github/workflows/gates-run.yml:62`, `datacube/BUILD.bazel:81`, `datacube/BUILD.bazel:357`

The app lane runs `bazel test` only on `"targets":"//datacube:tests //wasm:all //warehouse:tests"`, not on `//...`. //datacube:tests (BUILD.bazel:80-86) is js_tests over :src, jsdom and //wasm targets. No test depends on :site, the `bundle_*` esbuild targets or :dist. The Playwright harnesses serve :site, never dist, and are run by hand. Scenario: the symlinked dist and the missing fonts.css both exist in the current tree with CI green. An esbuild-unresolvable import in demo/boot.ts would also pass every lane and be found only at deploy.

**Fix:** Add a js_test that depends on :dist and checks that every URL referenced by index.html, fonts.css and bundle.js exists as a regular file. Also point one Playwright smoke load at the dist directory instead of the site tree, and include the bundle targets in the app lane.

### P2-359. verify-smoke reports a sample as loaded when it failed to open: its wait passes on the previous cube's status, and it never reads the upload error

*test-gap · browser harnesses* — `demo/verify-smoke.mjs:122`, `demo/boot.ts:711`, `src/app.ts:286`

Each sample opens over the demo cube, which already shows `.dc-status-timing` as "N rows × M cols in Xms" (app.ts:286-289). So `waitForFunction(() => /rows/.test(...'.dc-status-timing'...))` returns at once, and after a fixed `waitForTimeout(400)` the harness reads `rows: document.querySelectorAll('.dc-row').length`. An ingest failure goes only to `#uploadnote` with class `bad` (boot.ts:711-713), which the harness never reads, and the demo cube stays on screen. Scenario: a sniffing change makes `ingestFile` throw on the quoted-header sample. The harness sees the demo's rows and headers, the invariants pass on the demo grid, the sample is reported ok, and the run prints "every shape loads" and exits 0. A sample that takes longer than 400 ms to load (the 30,000-row `tall` sample) has its first invariants run against the old grid.

**Fix:** Before reading state, wait for #uploadnote to show an outcome (`/rows,|could not open/`) and for #pure to name the new source, as verify-upload does at lines 94-114. Fail on `could not open` or `#uploadnote.bad`.

### P2-360. verify-real-data adds every '$' cell in a row, so the default pivot Total column is counted twice and a correct grid is reported as DIFFER

*test-gap · browser harnesses* — `demo/verify-real-data.mjs:136`, `src/config.ts:293`, `src/config.ts:612`, `demo/boot.ts:111`, `src/treeview.ts:348`

The harness sums `row.slice(1).filter((c) => /^\$/.test(c))`. DEFAULT_CONFIGURATION sets `pivotStatisticColumnPlacement: 'right'`, which applyToSnapshot folds into `pivotTotal`, and withPivotTotals appends a `__total` column. The demo configuration formats notional and pnl as MONEY. Scenario: `DATA=trades.parquet EXPECT='{"Iberia":74988250}'`. The year cells add up to $74,988,250 and the Total cell adds another $74,988,250, so the harness prints `DIFFER Iberia` and exits 1 on a correct product. Negative values render as `($…)`, fail `/^\$/`, and are silently left out of the sum.

**Fix:** Sum only the year leaves of the notional measure, selected by header `data-column` (e.g. `/^\d{4}__\|__notional$/`), or compare the Total column alone. Parse `($x)` as negative.

### P2-361. No browser harness runs in any gate, so broken harnesses and browser-only product regressions go unnoticed

*test-gap · browser harnesses* — `BUILD.bazel:366`, `BUILD.bazel:80`, `BUILD.bazel:381`, `.github/workflows/gates-run.yml:62`

BUILD.bazel:366-369 says the harnesses are "Run by hand, not tests"; every `_HARNESSES` entry is a `js_binary`, `test_suite(name = "tests")` holds only the node tests, the typecheck and the wasm differential, and CI runs `//datacube:tests //wasm:all //warehouse:tests`. verify-wasm-browser, verify-smoke, verify-remote and run-stress need no engine, only Chromium. Scenario: this audit found three harnesses already broken without anything going red: verify-real-data double-counts the pivot Total that became a default, run-stress references an undefined `offered`, and verify-smoke's wait became vacuous once the status bar carried "N rows". A regression that only a browser shows, such as a crushed header or a lost pivot column, ships the same way.

**Fix:** Wrap the engine-free harnesses (verify-wasm-browser, verify-smoke, verify-remote, run-stress) as tests in a tagged lane that CI runs, with Chromium provisioned by the build. Keep the engine-dependent ones manual.

### P2-395. Every Bazel test runs with TZ=GMT, so tests meant to catch local-versus-UTC date bugs cannot fail, and east-of-UTC date regressions ship green

*test-gap · unit tests · reproduced* — `../.bazelrc:14`, `BUILD.bazel:60`, `test/serialize.test.ts:770`, `test/serialize.test.ts:833`, `test/export-rich.test.ts:121`, `test/format.test.ts:83`, `src/ui/filter-editor.ts:278`

`.bazelrc:14` sets `test --test_env=TZ=GMT` for every test. The datacube js_test targets (BUILD.bazel:60-78) set no TZ of their own, and nothing in test/, demo/ or package.json varies it. At offset 0 a local-midnight Date and a UTC-midnight Date are the same instant. That means serialize.test.ts:833-844 ('keeps a date-only group on its own day', which says it guards 'any zone ahead of it') and 770-785 ('in LOCAL terms') can never fail. Fixtures such as export-rich.test.ts:121 are also built as UTC instants (`new Date('2026-03-01T00:00:00Z')`). Reproduced with a mutation: switching temporalLiteral to getUTCFullYear/getUTCMonth/getUTCDate gives serialize.test.ts 70/0 in GMT and in America/New_York, but 67 pass / 3 fail in Asia/Tokyo. So a change that moves every date group key and drill filter back a day for users east of UTC passes CI.

**Fix:** Add js_test variants of the temporal suites (serialize, treeview, drill, format, export, export-rich, persist, duckdb, filter-editor) with env TZ=Asia/Tokyo and TZ=America/New_York. Build date fixtures the way the product does (through toResultTable from Arrow, as local-midnight Dates), not as hand-made UTC instants.

### P2-396. No test drives snap and release the way the host does, so the wedged cube after snap-edit-release and the other snap lifecycle bugs pass the suite

*test-gap · unit tests · reproduced* — `test/plane.test.ts:170`, `test/app.test.ts:1111`, `src/cube.ts:366`, `src/app.ts:949`, `src/app.ts:693`

plane.test.ts:170-190 ('goes back to the live source on release') runs `c.update(SNAPSHOT); c.snap(); c.release(); c.refresh()`. It never sends `view.snapshot` back through update(), which the host does at app.ts:949 (`this.#snapshot = view.snapshot`) and app.ts:693/702. cube.ts:366-371 writes the redirected snap source into that view, so after one host edit the live source is gone. The verifier reproduced this against the real CubeController with update, snap, one edit using the host's snapshot, then release: release threw "Table with name TRADES_SNAP does not exist!", and every later edit and snap failed the same way, leaving the cube stuck. No test combines snap with enterAdHoc or an opened file (inferModel plus SNAP_TARGET), overlaps two snaps, or uses a failing chunk stream. app.test.ts:1100-1120 checks only the toggle's label.

**Fix:** Add controller-level tests that feed view.snapshot back through update() between snap and release. Also cover snap after useModel(inferModel(...)), snap then enterAdHoc and a plane switch, two overlapping snaps, and a RemoteSource whose arrowChunks throws after the first chunk.

### P2-397. Neither planner differential (WASM vs JVM, Live vs Snap) plans the pivot-total query or the two-stage pivot-cast query that grouped pivots send

*test-gap · unit tests* — `test/wasm-differential/cases.ts:83`, `test/live-snap/live-snap.ts:40`, `test/live-snap/live-snap.ts:48`, `src/config.ts:293`, `src/serialize.ts:818`, `src/treeview.ts:319`, `src/app.ts:771`

CASES (cases.ts:83-343) is built only from serialize(snap(...)), detailSnapshot and childAggregateQuery. No case sets pivotCast or calls pivotTotalQuery, and live-snap.ts imports the same list and refuses its four pivot cases in live mode (REFUSED_LIVE). Both queries run in the product by default. app.ts:771-778 learns pivotCast and serialize.ts:818-828 then writes the `cast(@Relation<...>)`/groupBy stage for every grouped pivot. config.ts:293 turns pivot totals on (`pivotStatisticColumnPlacement: 'right'`), so treeview.ts:319 sends pivotTotalQuery. serialize.test.ts:196-200 records that the cast has shipped broken once ("relation has no column '2021__|__notional'"). A planner regression on either query would pass wasm_differential_test and live_snap_test, and users would hit it on the second render of every grouped pivot.

**Fix:** Add differential cases built from serialize(snapshot with pivotCast set) and from pivotTotalQuery(...) at levels 0, 1 and 2, so both differentials plan and compare them.

### P2-398. The Live-versus-Snap test uses only VARCHAR, INTEGER and DOUBLE columns, so Live/Snap differences on temporal, decimal, enum, UUID, interval or nested types go unchecked

*test-gap · unit tests* — `test/live-snap/live-snap.ts:58`, `test/live-snap/live-snap.ts:45`, `src/warehouse.ts:11`

The only fixture table is `CREATE TABLE TRADES (region VARCHAR(32), desk VARCHAR(32), book VARCHAR(32), year INTEGER, qtr VARCHAR(8), notional DOUBLE, pnl DOUBLE, qty INTEGER)`. Both engines run in one process with the same TimeZone. There is no DATE, TIMESTAMP, TIMESTAMPTZ, DECIMAL, HUGEINT, ENUM, UUID, INTERVAL, collated or nested column, and no filter, group or sort on one. Yet warehouse.ts:11-12 names this test as the guarantee that Live and Snap agree. The server-side WarehouseArrowTest.java does check every type's Arrow encoding against JSON. It does not cover how the JS client reads the chunks, or zone, ENUM order, collation, filter and grouping differences between Live and Snap. As a result, a TIMESTAMPTZ zone shift or an ENUM sort-order difference between the two planes passes the chain.

**Fix:** Extend the fixture with one column per type the SQL API carries (ResultEncoder.SCALARS plus a LIST and a STRUCT). Run the server under a non-UTC TimeZone, and add cases that filter, group and sort on each column, including a group drill on a temporal key.

## LOW (197)

### P2-19. availableDimensions offers a dimension whose column is currently pivoted, and choosing it gives a cryptic planner error

*error-handling · pivot & aggregation query semantics · reproduced* — `src/dimensions.ts:99-106`, `src/dimensions.ts:65`, `src/app.ts:3004`

availableDimensions only checks that the columns exist, and drillTo returns `{ ...s, rows }` without touching pivotOn, so a column can end up in both rows and pivotOn. Scenario, reproduced with the real planner: rows [b], pivotOn [y], and a dimension G = [y, a]. useDimension produces rows [y] with pivotOn [y], and fetchTree fails with "in call to 'meta::pure::functions::collection::sort', argument 2: unknown column 'y' in ()". #refreshOr rolls back, but the user sees that message after choosing an entry the menu offered.

**Fix:** Exclude dimensions that intersect pivotOn from availableDimensions, or have drillTo remove those columns from pivotOn. Ideally use the same moveToAxis helper as the menu fix.

### P2-20. Pinned pivot values produce a pivot call the planner has no overload for, so a saved view with pivotValues cannot open, and a test pins the broken text

*api-contract · pivot & aggregation query semantics · reproduced* — `src/serialize.ts:1019-1024`, `test/serialize.test.ts:388`, `src/persist.ts:218-219`

With pivotValues set, serialize emits `pivot(~[${on}], [${vs}], ~[${aggs}])`, which passes a ColSpecArray, a value list and an AggColSpecArray. The only 4-argument overload (Pure.java:1901, upstream pivot.pure:25) takes a single ColSpec and a single AggColSpec, so the planner answers "no overload of 'meta::pure::functions::relation::pivot' matches 4 argument(s)". pivotValues is set only when persist.ts loads a saved view, so any such view opens to that error on every level. test/serialize.test.ts:388 asserts this string with a regex and stays green, even though the planner rejects it.

**Fix:** Emit a form the planner accepts: a pre-filter on the pinned values plus pivot/3, or the single-ColSpec pivot/4 when it fits. Otherwise stop accepting pivotValues. Replace the text assertion with a planned wasm-differential case.

### P2-21. The dead snapshot 'window' field still emits an unordered slice() with no truncation warning when a saved view carries it

*maintainability · pivot & aggregation query semantics* — `src/serialize.ts:1174`, `src/persist.ts:227`, `src/snapshot.ts:615`, `src/cube.ts:423`

No product code sets `window`, but persist.ts:227 restores it from JSON, and serialize emits `parts.push(`slice(${offset}, ${offset + limit})`)` from it. cube.ts computes `cut` only from maxRows, so this is never reported as truncation. Scenario: a saved or older view with "window": {"offset": 0, "limit": 50} on a flat cube with no Row Limit. The grid shows 50 arbitrary rows with no ORDER BY and no warning.

**Fix:** Remove `window` from CubeSnapshot, the persist migration and serialize. If it has to stay, give it a total order and report it as truncation.

### P2-22. applyToSnapshot sets keepGroupedColumns but never clears it, so unticking 'show grouped columns' leaves the flag in the snapshot and in exports

*maintainability · pivot & aggregation query semantics · reproduced* — `src/config.ts:600-605`

`...(config.showGroupedColumns ? { keepGroupedColumns: true } : {})` is spread over `unlimited`, which still holds the previous snapshot's flag. maxRows and pivotTotal, by contrast, are destructured out, and leafCount and childCount are always assigned. A run of r3.ts confirmed that after an untick applyToSnapshot still returns keepGroupedColumns:true. treeview.assemble keeps building path copies of the dimension columns, and the flag rides in the exported specification. Nothing shows on screen today, because grid/columns.ts reads layout.keepGrouped, but any new consumer of the snapshot flag inherits the stale value.

**Fix:** Destructure keepGroupedColumns out alongside maxRows and pivotTotal, and set it only from the config.

### P2-23. kindOf sums Integer columns even though the documented rule and infer.ts treat integers as dimensions, and the epoch doc contradicts epoch.ts

*maintainability · pivot & aggregation query semantics* — `src/snapshot.ts:108-111`, `src/snapshot.ts:178-184`, `src/snapshot.ts:637-643`, `src/infer.ts:171`, `src/serialize.ts:921-923`

kindOf returns `isNumericType(column.type) ? 'measure' : 'dimension'`, and isNumericType includes 'Integer'. rowColumns and groupedAggs follow the same rule. The isFractionalType doc says 'integers default to dimensions and fractions to measures', and infer.ts implements that. As a result, an Integer column with no kind (demo/main-engine.ts qty, or a hand-written view) is summed, while the same column opened through inferModel takes uniqueValueOnly. Separately, the CubeSnapshot.epoch doc calls the epoch 'the ONLY cancellation mechanism', which epoch.ts:9-20 says is no longer true.

**Fix:** Pick one rule: either have kindOf use isFractionalType and update the demos that rely on summed integers, or correct the doc. Point the epoch comment at EpochGuard.signal.

### P2-24. The dimensionColumns and measureColumns exports are dead and ignore calculated columns, the defect rowColumns was written to replace

*maintainability · pivot & aggregation query semantics* — `src/snapshot.ts:211-218`, `src/snapshot.ts:124-137`, `test/column-kind.test.ts:7-52`

`dimensionColumns(s)` returns `s.columns.filter((c) => kindOf(c) === 'dimension')`, and measureColumns does the same for measures. Both read `s.columns` only and never `s.derived`. No code in src/ or demo/ calls them, and only test/column-kind.test.ts imports them. The rowColumns doc says reading `snapshot.columns` alone 'was the one defect behind four'. A future caller who picks the obviously named helper would bring back the bug where a calculated dimension cannot be grouped or pivoted, and the test pins that old behaviour.

**Fix:** Delete both helpers, or redefine them over rowColumns(s), and move the test to rowColumns.

### P2-28. Columns named `true` or `false` are left unquoted, so the Pure parser rejects them and the file cannot be opened or queried

*correctness · identifiers & literal escaping · reproduced* — `src/serialize.ts:51`, `src/serialize.ts:72`, `src/infer.ts:130`, `src/calc.ts:160`, `src/calc.ts:265`

serialize.ident (PLAIN_IDENT), infer.quoteIdent and calc.columnRef all decide quoting with `/^[A-Za-z_][A-Za-z0-9_]*$/`, which accepts `true` and `false`. The core Lexer.java:57-58 maps those words to TRUE/FALSE tokens, and TokenStreamCursor.IDENTIFIER_TOKENS leaves them out on purpose ("TRUE/FALSE are NOT identifier tokens"). The three members reproduced this with the WASM planner. A CSV headed `true,amount` fails at model warm-up with "[6:9] expected identifier, got TRUE", and so does an upload named true.csv. `~[true]` fails with "expected column name after '~'", and `$x.true` fails with "expected property name". nameProblem also accepts `false` as a calculated-column name, which then fails with an unrelated parse error. One member rated this MEDIUM ("breaks every query"); it is LOW here because a header named exactly true or false is rare and the failure is a loud parse error, never wrong data.

**Fix:** Use one shared quoting helper in serialize.ident, infer.quoteIdent and calc.columnRef that also quotes when the name is `true` or `false`, or when it matches any non-identifier lexer keyword. Pin it in the tests, and optionally have nameProblem reject the two words.

### P2-29. A column named `milestoning` makes the generated Database model unparseable, so the file cannot be queried

*correctness · identifiers & literal escaping · reproduced* — `src/infer.ts:130`, `src/infer.ts:228`, `core/src/main/java/com/legend/parser/DatabaseProtocolParser.java:327`

quoteIdent leaves `milestoning` bare because it matches the plain-identifier regex, so buildModel emits `milestoning VARCHAR(4096),` inside the Table block. DatabaseProtocolParser.parseTable checks `peek() == TokenType.VALID_STRING && "milestoning".equals(text())` at every column position and reads the name as the start of a milestoning block. Scenario: an upload headed `milestoning,grp,v` refuses every flat or grouped query with `[6:21] expected PAREN_OPEN but found VALID_STRING ('BIGINT')`. The finder tested 55 other Pure lexer keywords, and they all pass. This is the same class as the true/false defect but a different grammar path, and it affects only the generated model.

**Fix:** Quote every column name in the generated Database model, or at least the words the Database grammar treats as keywords. Add `milestoning` to the escaping tests.

### P2-30. literal() turns any value it does not recognize into text with String(v), so a crafted saved-view filter can splice raw Pure into the query

*security · identifiers & literal escaping · reproduced* — `src/serialize.ts:113`, `src/serialize.ts:120`, `src/serialize.ts:258`, `src/persist.ts:215`

literal() ends with `if (Number.isInteger(v)) return String(v); return String(v);`, and persist.ts:215 restores the filter with a plain cast (`filter: raw['filter'] as NonNullable<...>`) and no validation. Scenario: a shared view JSON with `{operator:'equal', column:'region', value:["'EMEA' || true"]}` produces `$x.region == 'EMEA' || true`, which returns every row while the view still looks like a region filter. `{operator:'in', value:'EMEA'}` throws `TypeError: many(...).map is not a function` instead of CubeRefusal. The impact is bounded because a saved view already carries raw Pure in source.expression and derived expressions, but the escaping comment's claim that filter injection is closed does not hold.

**Fix:** In literal(), throw CubeRefusal for anything other than a string, finite number, boolean, Date, RelativeDate or JsonValue. Check Array.isArray for list operators and single values for the others, and validate the filter tree when a view is restored.

### P2-31. Uploaded columns named after internal columns (__root__, __leafCount, __tree) are hidden or dropped, or make grouped queries fail

*correctness · identifiers & literal escaping · reproduced* — `src/grid/columns.ts:61`, `src/grid/columns.ts:329`, `src/grid/columns.ts:374`, `src/serialize.ts:930`, `src/serialize.ts:1127`, `src/treeview.ts:434`, `src/treeview.ts:578`, `src/snapshot.ts:49`

The internal names are ordinary identifiers: ROOT_COLUMN='__root__', LEAF_COUNT_COLUMN='__leafCount' and TREE_COLUMN='__tree'. Nothing reserves them, and upload.ts keeps the user's headers unchanged. columns.ts:374 `|| (l.name !== ROOT_COLUMN && ...)` hides a source `__root__` column, and serialize.ts:1127 `extend(~[${ident(ROOT_COLUMN)}: ...])` adds it a second time. Scenario, reproduced with the real planner and DuckDB-WASM: with a `__root__` upload, grouping fails with `the column '__root__' already exists in the relation`. A `__leafCount` column disappears from every grouped view (treeview.ts:578), and Show leaf count fails with `duplicate column '__leafCount'`. A `__tree` column renders as a second tree column with a blank header.

**Fix:** Give internal columns names that no source can produce, or detect colliding headers at ingest and rename or refuse them with a message.

### P2-32. A plain column whose name contains '__|__' is drawn as a pivot header, merged under a group, and placed outside the configured column order

*correctness · identifiers & literal escaping · reproduced* — `src/grid/columns.ts:336`, `src/grid/columns.ts:212`

Every column that is not a dimension goes through `splitPath(c.name, measures, pivotArity)`. When no measure matches, splitPath falls back to `return name.split(PIVOT_SEPARATOR)`, even when pivotArity is 0 and the cube is not pivoted. `pivoted = (l) => l.path.length > 1` then treats the column as a pivot leaf for ordering. Scenario, run through the real buildColumnModel: a flat cube over id, `a__|__b`, `a__|__c`, z gets header rows [id, a(span 2), z] / [b, c], so the user's two columns show as 'b' and 'c' under a merged 'a'. With layout.order ['z','a__|__b','id'] the grid shows z, id, a__|__b. nameProblem blocks the separator only for calculated columns, not for uploaded headers.

**Fix:** Split on PIVOT_SEPARATOR only when the cube actually pivots (pivotArity > 0) and the leaf is not a source column. Otherwise keep the name as a single segment.

### P2-33. Duplicate, case-only duplicate and empty headers are renamed at ingest without telling the user, and 'a,a,a_1' puts the user's own a_1 label on different data

*data-semantics · identifiers & literal escaping · reproduced* — `src/infer.ts:205`, `src/upload.ts:104`

DuckDB's read_csv/DESCRIBE renames duplicate headers before inferModel sees them, so the check `if (seen.has(key)) throw ...` (commented 'DuckDB will have disambiguated already') never fires, and nothing reports the renames. Real DuckDB-WASM ingest gives: `Price,price` becomes Price, price_1; an empty header becomes column1; JSON key "" becomes C0; ' lead' becomes 'lead'. Scenario: for header `a,a,a_1` with row 1,2,3, the grid shows a_1=2 (the second 'a') and a_1_1=3 (the file's real a_1), so the header the user wrote labels the wrong value.

**Fix:** Compare the DESCRIBE names with the file's raw header (from sniff_csv or the reader's sniffed names), report every rename in the upload note, and pick disambiguating suffixes that cannot collide with an existing header.

### P2-34. A column named "__proto__" cannot be configured: its hide, format or width setting becomes the map's prototype and is lost

*correctness · identifiers & literal escaping · reproduced* — `src/config.ts:348`, `src/config.ts:514`, `src/app.ts:798`

withColumn copies the map with `{ ...config.columns }` and then assigns `columns[name] = next;`. toFormats uses `out[name] = c.format`, and app.ts uses `this.#formats[leaf.name] = format`. All three key plain {} objects by column names that come from the data. Scenario, verified: `withColumn(config, '__proto__', { hidden: true })` returns a map with no own keys whose prototype is {hidden:true}, so toFormats returns {} and `columns['hidden']` reads as set for the whole map. A CSV header or JSON key '__proto__' reaches this path. Object.prototype itself is not polluted (`({}).hidden` stays undefined).

**Fix:** Key these per-column maps with Object.create(null) or a Map, or write data-supplied keys with Object.defineProperty.

### P2-35. For warehouse tables with a schema, re-indenting the model inserts spaces into quoted column names that contain a newline, so the column cannot be found

*correctness · identifiers & literal escaping · reproduced* — `src/infer.ts:238`, `src/infer.ts:137`

With a schema, inferModel indents the table block with `${tableBlock.replace(/\n/g, '\n    ')}`, which also rewrites newlines inside the `"..."` identifiers from quoteIdent, and quoteIdent does not escape newlines. Scenario, reproduced: inferModel([{name:'a\nb',type:'VARCHAR'}], {table:'t', schema:'s'}) declares the column as 'a\n    b'. Selecting `~['a\nb']` fails with `unknown column 'a\nb' in (a\n    b:String[0..1])`, and the planner would emit `"a\n    b"`, which does not exist on the warehouse table. Uploads pass no schema, so only warehouse sources opened through demo/boot.ts:639 are affected. This is a different mechanism from the '###' newline defect, but escaping control characters in quoteIdent fixes both.

**Fix:** Escape control characters in quoteIdent (for example \n as \\n) so identifiers never contain raw newlines, or indent the block line by line from the structured column list instead of with a regex over the rendered text.

### P2-41. Copied selections use internal column names ('__tree', '2021__|__notional') as headers instead of the labels shown on screen

*correctness · selection & copy* — `datacube/src/selection.ts:152`, `datacube/src/export.ts:96`, `datacube/src/grid/grid.ts:1428`

selectionTable keeps each column's `name` (`.map((c) => ({ ...c, values: ... }))`), and toDelimited writes the header row with `wanted.map((c) => escapeField(c.name, delimiter))` (export.ts:96). Display names (layout.displayNames), the tree column's label and the joined pivot header path are therefore ignored. grid-dom.test.ts pins this behaviour with `/^region\t2023__\|__total/`. Scenario: the user copies a block from a grouped, pivoted cube with a column renamed to 'Notional (USD)'. The pasted header reads '__tree\t2023__|__total\t__pivot_total____|__notional', while the screen shows the tree label, '2023 / total' and the renamed column.

**Fix:** Build the clipboard and CSV header row from the column model's leaf labels (the displayName, the pivot header path joined with ' / ', and the tree's dimension names), and update the test's expectation.

### P2-47. Plain-text export does not neutralize newlines or tabs in cells, so a multi-line value breaks the row and misaligns every column to its right

*correctness · export · reproduced* — `datacube/src/export-doc.ts:80`, `datacube/src/export-doc.ts:97`

grid() builds cell text from the formatter or `String(v)` with no control-character handling, and toPlainText pads by `cell.text.length` and joins lines with '\n'. Only the PDF path (escapePdfText) replaces \r\n\t. Reproduced: a comment cell 'late fill\nre-booked' splits row 1 across two lines, with 're-booked' and its qty '10' landing at column 0 under the id heading. The comment column is also one character too wide, because the newline counts toward its width.

**Fix:** In grid(), replace [\r\n\t] and other C0 controls with a space (or a visible marker) before measuring, so text and PDF share one sanitization.

### P2-48. A download export that throws does nothing visible: the confirm dialog stays open, no file downloads and no status message appears

*error-handling · export* — `datacube/src/ui/alert.ts:79`, `datacube/src/app.ts:1645`, `datacube/src/app.ts:2148`, `datacube/src/app.ts:2186`

The alert button runs `action.handler(); close();` with no try, and `#export` calls `#render` synchronously without a try. So a throw from toHtml/toCsv/toPdf skips close() and never reaches #status. Scenario: a flat cube has no default row cap, so exporting HTML over a 2M-row upload can exceed V8's string limit and throw RangeError. The 'Confirm you want to proceed with export' dialog stays up, nothing downloads, and the error appears only in the console. For the email actions, `#email` is async, so the dialog does close there; the #render throw becomes a silent unhandled rejection because it happens before the try at app.ts:2161.

**Fix:** Close the alert before running the handler, and wrap #render inside #export and #email in a try that reports the failure through #status.

### P2-66. Auto number scale is chosen before rounding, so values just under a boundary render as '1,000k' or '1,000.0m'

*correctness · number formatting & precision · reproduced* — `src/format.ts:99`, `src/format.ts:104`, `src/format.ts:287`

autoScale picks the scale from the raw magnitude (`if (abs >= 1e6) return SCALES.millions; if (abs >= 1e3) return SCALES.thousands;`), and Intl then rounds at the column's decimals with no re-check. Reproduced with the real FormatterCache: format(999_999, {numberScale:'auto', decimals:0}) gives '1,000k', and format(999_950_000, {numberScale:'auto', decimals:1}) gives '1,000.0m'. The same happens under the defaults and for currency ('$1,000.00m' for 999,999,999). The value is numerically right but not in the intended form.

**Fix:** After scaling and rounding, check whether the rounded magnitude has reached 1,000, and if so step up to the next scale and re-round.

### P2-67. Format 'Text' has no effect on numbers and dates: they are still grouped and number-formatted

*correctness · number formatting & precision · reproduced* — `src/format.ts:260`, `src/ui/panel-column.ts:143`

format() handles 'text' exactly like 'auto': `if (format.kind === 'auto' || format.kind === 'text') { ... if (typeof value === 'number') return this.format(value, { ...format, kind: 'number' }); }`. Text is offered in the Format dropdown. Reproduced: format(12345678, {kind:'text', decimals:0, negativeParens:true}) returns '12,345,678', so a user choosing Text on an account-id column to drop the commas sees no change.

**Fix:** Make 'text' render String(value) (plus fontCase) for numbers and dates, and leave the behaviour of 'auto' unchanged.

### P2-68. 'Capitalize' case upper-cases the letter after an accented character and skips a leading accented letter ('naïve café' becomes 'NaÏVe CafÉ')

*correctness · number formatting & precision · reproduced* — `src/format.ts:118`

applyCase uses `text.replace(/\b\p{L}/gu, (ch) => ch.toUpperCase())`. In JavaScript `\b` is based on the ASCII-only `\w` even with the u flag, so é, ï and ü count as word boundaries. Reproduced in Node: 'naïve café' becomes 'NaÏVe CafÉ' and 'élan' becomes 'éLan'. Capitalize is offered in the column and general panels and applies to string, date and number text, so any column of non-English names with this option set is visibly garbled.

**Fix:** Use a Unicode-aware boundary such as /(^|[^\p{L}\p{N}'])(\p{L})/gu, or split on whitespace and upper-case the first code point of each word.

### P2-69. The Percent format combined with the Percent scale multiplies by 100 twice and prints '%%'

*correctness · number formatting & precision · reproduced* — `src/format.ts:233`, `src/format.ts:287`, `src/format.ts:293`

Kind 'percent' builds an Intl formatter with `style: 'percent'`, which multiplies by 100 and adds '%'. The percent numberScale then divides by SCALES.percent (1e-2) and appends another '%'. The panel lets the user choose both at once. Reproduced: format(0.05, {kind:'percent', numberScale:'percent'}) returns '500.0%%' for 5%. The output is visibly wrong rather than plausibly wrong.

**Fix:** Ignore numberScale for kind 'percent', or make the panel treat the Percent format and the Percent scale as mutually exclusive.

### P2-77. Save View does not guard storage.setItem: when storage is full or refused the error escapes the menu handler, the menu stays open and the user sees no message

*error-handling · saved views* — `src/app.ts:2216`, `src/app.ts:2237`, `src/app.ts:3128`, `src/ui/menu-view.ts:176`, `src/ui/menu-view.ts:177`, `demo/boot.ts:455`

`storage.setItem(VIEW_KEY, toJson(save({...})));` has no try/catch, and saveView is called synchronously from the menu dispatch, so a QuotaExceededError or SecurityError propagates to MenuView's click handler, where `this.#options.onSelect(item); this.close();` skips close(). loadView's `storage?.getItem(VIEW_KEY)` also sits before its try. demo/boot.ts wraps its own localStorage writes because 'storage refused (private window, quota)'. Scenario: with the origin's quota exhausted, clicking Save View leaves the menu open, shows neither 'saved' nor an error, and the user believes the view was saved.

**Fix:** Wrap setItem and getItem in try/catch and report 'could not save the view: <reason>' through #status('error'); close the menu in a finally.

### P2-78. Collapse All resets the tree's expand level, so the next unrelated Properties Apply re-expands the whole tree, and Undo cannot tell expand-level states apart

*state-persistence · saved views* — `src/tree.ts:199`, `src/app.ts:2548`, `src/history.ts:60`

`collapseAll(): TreeState { return new TreeState(new Set(), this.#showTotals); }` sets expandTo back to 0 while config.initialExpandToLevel keeps its value, and #applyDraft re-applies `withExpandTo(expandTo)` whenever `expandTo !== tree.expandTo` (app.ts:2548). history.ts stateKey keys only on `tree.openPaths` and showTotals, ignoring expandTo and #closed. Scenario: with initialExpandToLevel=2 the user clicks Collapse All, then changes a column format and presses Apply; the whole tree re-expands to level 2 and re-fires every branch query. With expandTo=1, collapsing A then B records one undo step, so one Undo reopens both.

**Fix:** Keep expandTo in collapseAll (record the closes in #closed, or a separate collapsed flag), include expandTo and #closed in stateKey, or compare the draft against the previous configuration rather than tree.expandTo.

### P2-79. 'Export > DataCube Specification' writes the private SavedView JSON, which neither upstream DataCube nor this app can open

*api-contract · saved views* — `src/app.ts:2190`, `src/ui/menu.ts:421`, `src/persist.ts:118`

#export('specification') downloads `toJson(save({ name: title, snapshot: view.snapshot, ... }))`, the private SavedView shape (version, name, savedAt, snapshot, expanded, showTotals, columns) with no Pure `query` text or typed `source`, under the label 'DataCube Specification' (ui/menu.ts:421). persist.load is called only from loadView, which reads `storage?.getItem(VIEW_KEY)`; there is no file-import path. ENGINE_API_CONTRACT.md:7 rules that a saved cube is upstream's DataCubeSpecification JSON; the shape mismatch is documented in UPSTREAM_CENSUS §1, but that the file cannot be reopened anywhere is not. Scenario: a user exports the specification to hand a cube to a colleague, who can open it neither in upstream DataCube nor in this product.

**Fix:** Until the DataCubeSpecification writer and reader land, relabel the entry (e.g. 'Saved view (JSON)') and add an open-file path that feeds persist.load; then emit upstream's shape.

### P2-91. Snap runs a DISTINCT scan per pivot column whose results nothing reads, and the documented cell-budget and expressibility checks are never called

*maintainability · snap & live plane* — `src/snap.ts:262`, `src/snap.ts:263`, `src/snap.ts:306`, `src/snap.ts:317`, `src/snap.ts:327`, `src/snap.ts:341`, `src/snap.ts:348`, `src/cube.ts:465`, `src/cube.ts:500`

snap.ts:262-274 runs `SELECT DISTINCT <col> ... ORDER BY v` for each `pivotCandidates` entry and stores the results in columnValues. valuesFor, literalsFor, checkCellBudget and checkExpressible have no caller outside test/snap.test.ts, and checkExpressible ends in `void missing;`. The cube.ts:465-466 comment claims the capture 'removes the per-query discovery pass while snapped', and the snap.ts header says the rules are 'enforced rather than documented', but neither is true. Scenario: snapping a 10M-row warehouse table pivoted on two columns runs two full DISTINCT scans on the DuckDB queue before the first snapped view and discards the results. The same pass is what breaks snapping on a calculated-column pivot.

**Fix:** Delete the capture, the unused helpers and the header/comment claims, or wire valuesFor into pivot planning and checkCellBudget into the refresh (see the pivot-width entry).

### P2-92. A warehouse snap reports the row count from a separate, earlier count query and stamps the time after the load finishes, so the badge can misstate what was frozen

*data-semantics · snap & live plane* — `src/snap.ts:197`, `src/snap.ts:239`, `src/snap.ts:257`, `src/snap.ts:276`, `src/snap.ts:280`, `src/app.ts:2906`

`const estimate = await this.preflight(sourceSql, epoch);` runs `SELECT count(*)` on the warehouse. The rows then come from a second statement, `this.#remote.arrowChunks(sourceSql)`, and the result records `rowCount: estimate.rowCount` with `takenAt = new Date()` taken after the load and DISTINCT passes. On a table receiving appends, the count returns 1,000,000, the load streams 1,004,000 rows, and the tooltip says 'frozen at <end of download>, 1,000,000 rows'. The 10M guard also applies to the earlier count, not to the rows loaded.

**Fix:** After loadArrow, count the local table (cheap in DuckDB-WASM) and record that as rowCount, and enforce the limit on it too. Take takenAt before the source statement starts.

### P2-93. A snap shows no progress and cannot be cancelled: the button just greys out for the whole download

*error-handling · snap & live plane* — `src/snap.ts:257`, `src/cube.ts:496`, `src/app.ts:2920`, `src/duckdb.ts:385`

controller.snap() runs a count, a CREATE TABLE AS or an Arrow stream of up to 10M rows, and the DISTINCT passes. It calls onBusy only in the final refresh, and no #startTask runs. The toolbar only does `snap.disabled = true`. arrowChunks accepts a signal, but snap.ts:257 passes none. Scenario: a user snaps a 9M-row warehouse table and sees only a greyed 'Live' button for minutes, with no way to stop it short of closing the tab. loadArrow also holds the DuckDB serial queue during that time, so local queries wait behind it.

**Fix:** Wrap snap/release in #startTask('Snapping...') and onBusy, and pass an AbortSignal through preflight, arrowChunks and loadArrow so a Cancel control can stop them.

### P2-94. loadArrow drops the target first and leaves a partial table in the tab when the chunk stream fails

*error-handling · snap & live plane* — `src/duckdb.ts:385`, `src/duckdb.ts:387`, `src/duckdb.ts:393`, `src/snap.ts:257`

duckdb.ts:385-398 runs `DROP TABLE IF EXISTS ${qualified}` and then inserts each chunk with `create: first`, with no try/catch. snap.ts:257 does no cleanup either. Scenario: a warehouse snap whose stream fails after 2 of 5 chunks (for example, the token expires between fetches) leaves main.TRADES with 2,000 rows in DuckDB-WASM. The cube correctly stays Live, so no wrong answer is shown, but the memory stays held until another snap or a reload. Anything the table held before is destroyed.

**Fix:** Stream into a temporary table inside the same serialised section. On success, drop the target and rename the temporary table into place. On failure, drop the temporary table and rethrow.

### P2-95. A large warehouse snap pulls chunks only as fast as DuckDB-WASM inserts them, so it can outlive the server's 10-minute result retention and fail midway

*async-concurrency · snap & live plane* — `src/warehouse.ts:165`, `src/duckdb.ts:389`

arrowChunks fetches chunk i only when loadArrow's `for await` asks for it (warehouse.ts:165-171). loadArrow inserts each chunk before pulling the next (duckdb.ts:389-396). The server's forgetOld (Statements.java:407-412, retainMinutes = 10 at WarehouseServer.java:495) drops a run 10 minutes after it finishes, even while a client is still reading it. Scenario: on a slow VPN, a 10M-row snap (100 chunks) takes more than 10 minutes, chunk k returns 404 'no chunk k for statement ...', and the snap throws after minutes of work, with a partly refilled local table.

**Fix:** Measure retention from the last chunk read rather than from finish, or prefetch chunk i+1 while chunk i inserts. At minimum, name the retention limit in the error.

### P2-96. Uploaded files stay registered in DuckDB-WASM, and replaced upload tables are never dropped, so each distinct file opened stays resident for the tab's life

*performance-memory · snap & live plane* — `src/upload.ts:87`, `src/upload.ts:90`, `demo/boot.ts:683`

ingestFile calls `db.registerFileBuffer(virtualName, new Uint8Array(await file.arrayBuffer()))` or `registerFileText`, and grep finds no `dropFile` in src/ or demo/. The previous upload's table is also never dropped when a new source replaces it (boot.ts:683). The virtual name is fixed per table name, so re-picking the same file replaces its registration, but each different file keeps its raw bytes plus its table. Scenario: opening five 100 MB CSVs in one tab keeps about 500 MB of file bytes and five tables resident.

**Fix:** Call db.dropFile(virtualName) after the CREATE TABLE in ingestFile, and drop the previous upload's table when openFile replaces the source.

### P2-97. The legend-engine page shows a Live/Snap toggle that fails on every click

*api-contract · snap & live plane* — `src/app.ts:2886`, `src/app.ts:2915`, `src/cube.ts:488`, `demo/main-engine.ts:107`

#buildToolbar always creates the toggle, and on a live plane its tooltip reads 'Live data, which may move while you work. Click to snap.' On a runner-built cube (main-engine.ts:107, `runner: new RemoteRun(executor)`), CubeController has no local store, and snap() throws `CubeRefusal('this cube’s queries run on a remote engine: there is no local store to freeze a snapshot into.')` (cube.ts:488-495). Scenario: on index-engine.html the user clicks 'Live' as the tooltip invites and gets that error on the status line every time.

**Fix:** Expose a `canSnap` from CubeController and render the toggle only when it is true, or show it as a disabled 'Live (engine)' indicator with an explanatory title.

### P2-98. Snap copies the whole source and ignores the cube's filter, but its refusal tells the user to 'Narrow the filter', so a source over 10M rows can never be snapped

*correctness · snap & live plane* — `src/cube.ts:487`, `src/snap.ts:204`, `src/snap.ts:211`

The snap query is `${snapshot.source.expression}->select(~[${columns}])` (cube.ts:487), which never reads snapshot.filter. The refusal says `... row snap limit. Narrow the filter, or stay live.` Scenario: a 15M-row warehouse table filtered to EMEA (2M rows) is refused with '15,000,000 rows exceeds the 10,000,000 row snap limit. Narrow the filter...'. Narrowing the filter changes nothing. Copying the whole source is deliberate (a snap stays drillable, cube.ts:480-485), so the defect is mostly the misleading advice.

**Fix:** Either apply the row-stage filter on source columns to the snap query, or reword the refusal to say the whole source is copied and the filter does not reduce it.

### P2-114. Fire-and-forget calls turn every failed query into an unhandled promise rejection, and failed presentation changes keep the new configuration

*error-handling · refresh lifecycle & rollback* — `src/cube.ts:660`, `src/cube.ts:662`, `src/app.ts:439`, `src/app.ts:526`, `src/app.ts:541`, `src/app.ts:1551`, `src/app.ts:1572`, `src/app.ts:1724`, `src/app.ts:1753`, `src/app.ts:1809`, `src/app.ts:1962`, `src/app.ts:1987`

`#fail(error) { this.#options.onError?.(error); throw error; }` reports and then rethrows. The call sites `void this.#controller.toggle(...)`, `void this.#controller.setTree(...collapseAll())`, `void this.applyConfiguration(...)` and `void this.#setConfiguration(...)` catch nothing, the pattern #refreshOr's own comment calls a bug. #setConfiguration also has no rollback, unlike #setCalc and #applyDraft. Scenario: with the warehouse token expired, the user pins a column. The error alert appears, an 'Uncaught (in promise)' reaches the console and any crash telemetry (so each failure is reported twice), and the pin stays in the configuration although the view never rendered with it.

**Fix:** Route these calls through one helper that catches like #refreshOr and restores the previous configuration (and repaints) on failure, or make toggle, setTree and #setConfiguration resolve once onError has reported.

### P2-115. Status, errors and the truncation warning are never announced to screen readers, and an unnamed progress bar is always present

*accessibility · refresh lifecycle & rollback* — `src/app.ts:385`, `src/app.ts:664`, `src/app.ts:1089`, `src/app.ts:1108`, `demo/boot.ts:417`, `demo/boot.ts:467`

`this.#progress.setAttribute('role', 'progressbar');` has no aria-label or aria-valuetext, and it is appended on every status-bar render even when idle. The readout and '⚠ Results truncated to fit within row limit' are plain divs rebuilt with replaceChildren. The host's `<span id="status">` (index.html:165), where errors are written, has no role and is re-appended on every render (boot.ts:417). No aria-live exists in src/ or demo/. Scenario: a screen-reader user hears an unnamed 'progress bar' when nothing is loading, and nothing is spoken when a query fails, finishes or is cut to the row limit.

**Fix:** Name the progress element and render it (or remove aria-hidden) only while tasks run. Keep one persistent element outside the rebuilt bar with role="status" (and role="alert" for errors), and write status text and the truncation warning into it.

### P2-116. The truncation message reads 'showing the first 1,000 of 2 levels' and never names which branch was cut

*error-handling · refresh lifecycle & rollback* — `src/app.ts:1003`, `src/app.ts:1008`

The text is built as `${base} — showing the first ${maxRows.toLocaleString()} of ${view.truncated.length} level${...}`, although the comment above it says 'Saying WHICH level was cut matters'. The tree adds no 'more…' marker under a truncated branch. Scenario: the user opens 30 regions and one region's desks exceed the cap. The status reads '... — showing the first 1,000 of 1 level', which parses as 1,000 out of 1, and the user has to scroll the whole tree to find the incomplete branch.

**Fix:** Word it as 'N level(s) cut at 1,000 rows', name the parent paths (for example 'EMEA > Rates'), and add a trailing '… more rows' row under each truncated branch.

### P2-119. A NULL group has a blank label with no leaf count, so it cannot be told apart from an empty-string group

*data-semantics · tree view & grouping · reproduced* — `datacube/src/treeview.ts:500-512`, `datacube/src/app.ts:552`, `datacube/src/adhoc/query.ts:193`, `datacube/src/adhoc/query.ts:211`

labelOf returns null for a NULL key (`counted(own === undefined || own === NULL_GROUP ? null : own, i)`, treeview.ts:512), and counted returns a null label unchanged (`n === null || label === null ? label : ...`), so the NULL group never shows its leaf count. An empty-string key is labelled '', and app.ts:552 `treeTitle: (_row, label) => (label === '' ? '' : ...)` gives neither group a tooltip. Reproduced with the real planner: with region values '', NULL, AMER and EMEA and the leaf count on, the top level reads " (2)", "AMER (2)", "EMEA (1)" and then a completely blank row (the NULL group). The user sees two blank-looking groups with different totals and cannot tell which one is NULL. Ad Hoc Analysis labels the same NULL key '(blank)'. Rated LOW, not MEDIUM: the aggregates are correct, and only the labelling is ambiguous.

**Fix:** Give the NULL group a visible label, the '(blank)' Ad Hoc uses or a configurable null text styled distinctly, and apply counted() to it. Render an empty-string key visibly (for example '(empty)'), and give both groups tooltips.

### P2-120. Tree group labels are the raw key text, so date and number dimensions ignore the column's format (for example '2021-02-09T00:00:00', '0.30000000000000004')

*data-semantics · tree view & grouping · reproduced* — `datacube/src/treeview.ts:505-512`, `datacube/src/treeview.ts:107-118`

labelOf returns the path segment `row.path[row.path.length - 1]`, which is groupValue's text: a zone-less local ISO string for a Date and String(v) for a number. The tree column has type 'Any', and formats[TREE_COLUMN] is never set, so format() prints the string unchanged. Grouping by trade_date shows '2021-02-09T00:00:00' where the same column elsewhere shows 'Feb 09, 2021', and a Float bucket shows '0.30000000000000004'. These strings also reach the PDF, plain-text and chart labels.

**Fix:** Format the label with the dimension column's format, reading the raw value from the level's key column, and keep the path text only as the key.

### P2-124. In a tree view, the Pure shown next to the SQL is not the query that ran: it lacks the ->limit(maxRows+1) that the SQL carries

*correctness · tree view & grouping* — `datacube/src/cube.ts:396-401`, `datacube/src/treeview.ts:203-222`

The tree branch reports `pure: serialize(withEpoch, { level: 1, parent: [] })` (cube.ts:396), with no limit. fetchTree actually ran `{ ...request, limit: maxRows + 1 }` and stored that grammar in `levels.get(key).pure`, and the `sql` on the very next lines is read from that stored level. So the query panes and the debug log show Pure ending at groupBy/sort next to SQL ending in `LIMIT 1001`, and anyone copying the Pure to reproduce a result runs a different query.

**Fix:** Take `pure` from `view.levels.get(requestKey({ level: 1, parent: [] }))?.pure`, as `sql` already does.

### P2-125. Path keys and the NULL sentinel assume NUL never appears in text, but DuckDB returns NUL inside VARCHAR, so distinct groups can collide

*data-semantics · tree view & grouping · reproduced* — `datacube/src/tree.ts:23-31`, `datacube/src/tree.ts:47-49`, `datacube/src/serialize.ts:494`

tree.ts:25-29 says NUL "cannot occur ... in a value DuckDB would return as text" to justify `const PATH_SEP = '\u0000'`, and NULL_GROUP is '\u0000null'. Reproduced on DuckDB-WASM: `SELECT 'a' || chr(0) || 'b'` returns "a\u0000b". A dimension value that contains NUL therefore makes pathKey(['a\0b']) === pathKey(['a','b']), and a value of '\0null' is indistinguishable from the NULL group. Open state and assemble's row lookup then merge distinct groups.

**Fix:** Encode segments unambiguously (length-prefixed, or JSON.stringify of the array) instead of relying on a reserved character, and represent NULL out of band (for example a tagged segment type) rather than as a string.

### P2-126. Dead or misleading tree surface: AssembleOptions.showLeafCount is never read, perDimension/rowLabel/drill helpers are test-only, and the maxRows comment contradicts the code

*maintainability · tree view & grouping* — `datacube/src/treeview.ts:444`, `datacube/src/treeview.ts:453-454`, `datacube/src/treeview.ts:554-568`, `datacube/src/treeview.ts:176-178`, `datacube/src/tree.ts:309`, `datacube/src/dimensions.ts`

AssembleOptions.showLeafCount (treeview.ts:444) is documented, but assemble() reads only treeColumn and totalsLabel. Leaf counts actually come from snapshot.leafCount/childCount. No product caller passes assemble options, so the 'perDimension' branch (554-568) cannot be reached, and it also leaks NULL_GROUP through `counted(row.path[d] ?? null, i)`. rowLabel (tree.ts:309), drillPath/drillUp/isDrilling (dimensions.ts) and pivotPathOf are referenced only by tests. treeview.ts:176 says "The snapshot wins", but line 178 is `deps.maxRows ?? snapshot.maxRows`, so deps wins. A maintainer who sets `assemble: { showLeafCount: false }` sees no change.

**Fix:** Delete the unused option and the test-only exports, or wire them into the product. If perDimension is kept, fix its NULL leak. Correct the maxRows comment, or swap the precedence to match it.

### P2-132. Drill-through on a detail row returns its whole parent group (up to 500 rows) instead of the one record

*ux-correctness · drill-through · reproduced* — `datacube/src/drill.ts:56`, `datacube/src/drill.ts:59`, `datacube/src/treeview.ts:138`, `datacube/src/app.ts:2003`, `datacube/src/app.ts:2010`

A detail row's path is `[...request.parent, `${DETAIL_ROW}${i}`]` (treeview.ts:138). In drillConditions, `const column = snapshot.rows[i]; if (column !== undefined) out.push(pin(column, value));` silently skips that last segment, so only the parent group is pinned. The docstring above #drillThrough says 'a leaf drills to itself'. Reproduced: rows=['region','desk'] with path ['EMEA','Rates','\u00017'] gives exactly the same query as the group row ['EMEA','Rates']. With no row grouping, every detail row drills to the first 500 rows of the whole source. The overlay plainly shows many rows, so this is a pointless or misleading action rather than a silently wrong number.

**Fix:** For an isDetail row, either disable drill-through (the row already is the record) or pin the record's own column values. Do not silently drop path segments past snapshot.rows.

### P2-133. Drill-through does nothing on a flat (ungrouped) cube: pressing Enter on a cell is silently ignored

*ux-correctness · drill-through* — `datacube/src/cube.ts:441`, `datacube/src/app.ts:2009`

A flat cube view returns `treeRows: []` (cube.ts:441). #drillThrough looks up `const meta = this.#treeRows[row];` and hits `if (!view || !meta) return;` (app.ts:2009), so Enter or Space on any cell of a flat cube with measures does nothing and shows no message. Two auditors confirmed this as a side claim of the pivot finding by reading the code; it was not run.

**Fix:** Give flat cubes a drill path (the grand total, [] plus any pivot path for the column), or show a message that drill-through is not available in this view.

### P2-140. ArrowUp in a freshly opened menu focuses the second-to-last entry instead of wrapping to the last

*accessibility · context menu* — `/Users/neema/legend/legend-lite/datacube/src/ui/menu-view.ts:114`, `/Users/neema/legend/legend-lite/datacube/src/ui/menu-view.ts:259`

On open the menu element itself is focused (`menu.focus()`), so `current = items.indexOf(activeElement)` is -1. ArrowUp then computes `(-1 - 1 + n) % n = n - 2`. In the grid menu that is the entry before 'Properties...'. If that target is inside a hidden submenu, focus() does nothing at all. APG, and the test's own 'wraps to the end' intent, expect the last item.

**Fix:** When current === -1, send ArrowUp to items.length - 1 and ArrowDown to 0. Combine this with the per-level navigation fix.

### P2-141. Tab moves focus out of an open context menu without closing it, leaving an orphaned menu the keyboard can no longer drive

*accessibility · context menu* — `/Users/neema/legend/legend-lite/datacube/src/ui/menu-view.ts:98`, `/Users/neema/legend/legend-lite/datacube/src/ui/menu-view.ts:278`

#onKeyDown's `default: break;` covers Tab, and only a pointerdown outside the menu or Escape closes it. The menu is appended at the end of body. Scenario: a keyboard user presses Tab in the open menu. Focus leaves (to browser chrome or the page start) while the menu stays drawn over the grid, and the arrow keys no longer drive it because its keydown listener is on the menu element.

**Fix:** On Tab, close the menu (APG menu pattern), restoring focus to the return target.

### P2-142. Dead and contradictory fields and comments in the menu model (unused isRowDimension, wrong canGroup doc, stranded doc comment, duplicate tabIndex)

*maintainability · context menu* — `/Users/neema/legend/legend-lite/datacube/src/ui/menu.ts:61`, `/Users/neema/legend/legend-lite/datacube/src/ui/menu.ts:71`, `/Users/neema/legend/legend-lite/datacube/src/ui/menu.ts:347`, `/Users/neema/legend/legend-lite/datacube/src/app.ts:1501`, `/Users/neema/legend/legend-lite/datacube/src/ui/menu-view.ts:67`, `/Users/neema/legend/legend-lite/datacube/src/ui/menu-view.ts:69`

`readonly isRowDimension?: boolean` is set by app.ts but never read in menu.ts. The canGroup doc says 'the menu already omits actions that cannot apply rather than disabling them', but the code uses `disabled: !groupable`, and the file header also says entries are disabled. The doc comment '"Add Filter: region = EMEA" -- their wording exactly' sits stranded above valueLabel's own doc instead of on filterItem. menu-view.ts sets `menu.tabIndex = -1` twice. A maintainer who trusts the canGroup doc, or assumes isRowDimension is consulted, will change the wrong thing.

**Fix:** Remove isRowDimension from MenuContext and its call site, correct the canGroup comment, move the stranded comment onto filterItem, and drop the duplicate tabIndex line.

### P2-151. Wrapping a group with '( )' ORs in a complete default condition such as `notional == 0`, contrary to layerNode's doc comment that the wrap leaves the meaning unchanged

*correctness · filter editor* — `datacube/src/ui/filter-editor.ts:587-588`, `datacube/src/ui/filter-editor.ts:597-604`, `datacube/src/ui/filter-editor.ts:364`, `datacube/src/ui/filter-editor.ts:845`, `datacube/src/ui/filter-editor.ts:301-307`

The doc comment says "The new group inherits the node's `not` and the node loses it, so the meaning of the tree is unchanged". The code does something else: `const partner = child.kind === 'condition' ? cloneNode(child) : fresh(); return { ...newGroup([child, partner]), join: 'or' as const };`. newGroup always sets `not: false`, and the child keeps its own flag. For a group, fresh() is #fresh(), which returns the first column with defaultText ('0', 'false' or today's date), and that is a complete condition. Scenario: with the tree `A AND (B OR C)`, clicking '( )' on the group gives `A AND ((B OR C) OR notional == 0)`, which lets zero-notional rows through on the next Apply. The new condition is visible in the tree, and the only test covers layering a condition, not a group.

**Fix:** Make a group's partner an incomplete condition (empty text) so that it is dropped until the user edits it. Also correct the doc comment about `not`.

### P2-160. Deleting a calculated column that is still sorted, filtered, grouped or measured on fails with a raw planner error, and a successful delete leaves its column settings in saved views

*correctness · calculated columns & JSON* — `src/app.ts:1630`, `src/app.ts:2437`, `src/snapshot.ts:722`

`case 'calc.delete': if (column) this.#deleteCalc(column);` calls `#setCalc(derived.filter(d => d.name !== name), ...)` with no reference cleanup. Rename has renameColumnReferences, but delete has no counterpart. totalOrderSorts keeps sorts on non-row columns that are no longer present (`present.has(x.column) || !s.rows.includes(x.column)`). Scenario: add `margin`, sort by it, then choose Delete Column margin. The query still orders by `margin`, the planner refuses, the column comes back, and the status line shows the planner's message without naming what to clear. After a successful delete, `config.columns.margin` (format, width) stays in saved views.

**Fix:** On delete, remove the column from sorts, filters, rows, pivotOn and measures (or refuse up front with a message naming each reference), and drop its config.columns entry.

### P2-161. The group-stage column scope leaves out columns the query does produce, so the completion list and the window/child pickers cannot offer them

*correctness · calculated columns & JSON* — `src/calc.ts:204`, `src/ui/column-editor.ts:616`, `src/ui/column-editor.ts:651`

columnsInScope adds non-key columns only `if (snapshot.measures.length === 0 && snapshot.pivotOn.length === 0)`. But serialize's groupedAggs aggregates every projected non-key column whether or not measures exist, and a cast pivot's outer groupBy re-emits `carried()` dimensions. Scenario: with rows [region] and one measure `total` over notional, the groupBy outputs desk, year, total and pnl, but the scope is only ['region','total']. The Window partition/order selects and the child-aggregate 'Of:' select therefore cannot pick desk, year or pnl, although a hand-typed `$x.pnl` resolves.

**Fix:** Derive the group-stage scope from the same functions serialize uses for the groupBy and cast column lists, or at minimum add the non-key detail columns when there is no pivot, plus carried() dimensions under a cast pivot.

### P2-162. Changing Column Kind away from Group Level while in Child-groups mode leaves a stale error and a disabled OK until the user types

*correctness · calculated columns & JSON* — `src/ui/column-editor.ts:423`

The level handler calls `this.#edited()` first, while the mode is still 'children'. #bodyProblem returns 'Child groups are a Group Level calculation' and the check goes idle. Only then does `showMode()` switch `this.#draft.mode = 'expression'`, and it does not reschedule. Scenario: Extend Column with a seeded expression, pick Calculation: Child groups, then switch to Leaf Level Measure. The mode shows Expression with a valid expression, but the status still shows the child-groups message and OK stays disabled until the next edit.

**Fix:** Call showMode() before #edited() in the level handler, or reschedule after showMode changes the mode.

### P2-163. Number inputs (buckets, lag offset, moving rows) ignore values below 1 and decimals without saying so, so OK applies a value the form does not show

*correctness · calculated columns & JSON* — `src/ui/column-editor.ts:676`

`const n = Math.floor(Number(input.value)); if (Number.isFinite(n) && n >= 1) onChange(n);`: an invalid value is neither applied nor flagged, and a floored decimal is never written back to the field. The input is not in a form, so the `min` attribute is never enforced. Scenario: Moving is set to 3 and the user types 0. The field shows 0 while the draft keeps 3. If the user types 2.5 instead, the field shows 2.5 and the draft uses 2.

**Fix:** Write the applied number back to the input on blur, or report an out-of-range value as a body problem.

### P2-164. When the cube changes, an open column editor recompiles but does not refresh its insert list, window column lists or JSON picker

*state-persistence · calculated columns & JSON* — `src/ui/column-editor.ts:187`

`recheck(): void { this.#schedule(0); }` only recompiles and repaints the status. #paintPicker, #paintWindow, #paintChildren and #paintJson each read `this.#options.snapshot()` once, and they run only at #render and on level or mode changes. Scenario: with Add New Column window A open, add `fx_rate` in window B and press OK. A's Insert list, Of/Order-by lists and partition choices do not offer fx_rate until A's level or mode changes. In the reverse case, a column deleted in B stays offered in A and compiles to a refusal.

**Fix:** In recheck(), repaint the scope-dependent sections (picker, window, children, JSON) while keeping the current input values.

### P2-165. Edits made while OK's apply is still running are lost on success, or shown next to a refusal that belongs to the earlier draft

*async-concurrency · calculated columns & JSON* — `src/ui/column-editor.ts:343`

#ok sets `this.#busy = true` and awaits `this.#options.apply(row, group, this.#rename())`, but only the OK button is disabled, so every input stays live. #edited clears #refusal, and when the await returns it overwrites #refusal with the verdict on the earlier draft, or calls onClose. Scenario: on a slow warehouse plane, press OK and keep editing the expression while the query runs. On success the window closes and the edit is gone. On refusal, the old draft's message appears next to the new text and OK stays disabled until the next keystroke.

**Fix:** Disable or make inert the form's inputs while #busy, or compare the draft before and after the await and ignore a stale outcome.

### P2-166. The completion list shows only its first 60 entries with columns first, so on wide cubes the functions and operators never appear unless the user searches

*correctness · calculated columns & JSON* — `src/ui/column-editor.ts:825`, `src/calc.ts:245`

`for (const c of shown.slice(0, 60)) this.#item(items, c, expr);` runs over completionsFor, which returns `[...columnsInScope(...), ...CALC_FUNCTIONS..., ...CALC_OPERATORS]`. Scenario: in the built-in 'wide' sample (60 columns), the placeholder reads 'Insert — 93 in scope', but only c0..c59 are listed. None of the 21 functions or 12 operators appears, and nothing indicates the list was cut short. The 'pivot' sample's group stage (250 pivot-cast columns) behaves the same way.

**Fix:** Cap columns, functions and operators separately (or list functions and operators before a truncated column list), and show that the list was truncated.

### P2-167. Choosing 'if' from the completion list inserts the arrow form '->if(', which after a comparison binds to the right-hand operand and gets refused

*correctness · calculated columns & JSON* — `src/calc.ts:248`

Every CALC_FUNCTIONS entry completes as `insert: `->${f.name}(``, including `if`, whose own example uses the prefix form `if($x.pnl->toOne() > 0, |'up', |'down')`. Scenario: typing `$x.pnl->toOne() > 0` and picking `if` gives `$x.pnl->toOne() > 0->if(`. Because `->` binds tighter than `>`, this parses as `> 0->if(...)`, and the planner refuses it with a type error. The receiver form is valid Pure only when the receiver is a single Boolean term, so the failure is loud rather than silent.

**Fix:** Give CalcFunction its own insert text: `if(` for `if`, and `->name(` for receiver-style functions.

### P2-168. JSON value counting stops taking new values after 50 distinct ones, so the 'contains' suggestions can miss the most common value

*correctness · calculated columns & JSON · reproduced* — `src/json-shape.ts:178`

`if (shape.values.has(text) || shape.values.size < MAX_VALUES) { shape.values.set(text, ...) }`: a value first seen after the map is full is never counted, however often it recurs, and topValues sorts only the values admitted before that. Scenario (reproduced on a scratch copy): 50 rows with unique tags followed by 900 rows tagged 'urgent'. The picker offers 'contains t0'…'contains t15' and no 'contains urgent'. Only the suggestions are affected; no query result is wrong.

**Fix:** Count over a larger bound, or use a heavy-hitters sketch (Misra-Gries or space-saving) so that frequent late values push out rare early ones.

### P2-178. A fractional Row Limit (e.g. 2.5) is accepted and produces `limit(3.5)`, which the planner rejects, so every refresh fails

*correctness · properties editor & panels · reproduced* — `src/ui/form.ts:117`, `src/ui/panel-general.ts:332`, `src/cube.ts:249`, `src/serialize.ts:1173`, `src/persist.ts:228`

numberInput runs `onChange(clamp(n, options.min, options.max))` without rounding. The type=number step only marks the field :invalid, and el.value still reads '2.5'. cube.ts passes `limit: s.maxRows + 1`, and serialize writes `limit(${scope.limit})`, but limit takes Integer[1]. Reproduced: the query becomes `->limit(3.5)` and the planner answers with a 1.5 KB 'no overload ... structurally matches ... FLOAT' refusal. The value is also saved into the configuration. persist.ts:228 accepts any number as maxRows from a saved view (0, negative or fractional). The same unrounded path feeds band size and 'Initially expand to level'.

**Fix:** Add an `integer: true` option to numberInput (round or reject), and use it for Row Limit, expand level, band size, decimals and widths. Validate maxRows as a positive integer when loading a saved view.

### P2-180. Alignment toggle buttons keep the pressed state they had when the panel was built, so the highlight and aria-pressed are wrong and re-clicking cannot clear the choice

*correctness · properties editor & panels · reproduced* — `src/ui/form.ts:282`, `src/ui/panel-general.ts:173`

toggleGroup computes `const on = value === c.value` once and sends `onChange(on && options.allowNone ? undefined : c.value)` on click. The only caller, fontControls (used by both the General and Column panels), passes `(textAlign) => patch({ textAlign })` without refresh(). Repro (jsdom): clicking 'Align Right' updates the draft, but Left stays pressed (aria-pressed true,false,false). Clicking Right again sends 'right' instead of clearing it. The sibling toggle() (form.ts:308-311) documents this bug and fixes it for itself. The model value is correct and only the display and the clear gesture are wrong, so LOW.

**Fix:** Keep the current value inside toggleGroup, as toggle() does: on click, compute the next value, repaint every button's aria-pressed and dc-on, then call onChange. Alternatively, have the caller refresh().

### P2-181. A colour picked for an unset swatch still looks unset, and an unset or cleared swatch cannot be set to black or to its previous colour

*correctness · properties editor & panels* — `src/ui/form.ts:208`, `src/ui/form.ts:210`, `src/ui/form.ts:211`, `src/ui/form.ts:218`, `src/ui/panel-general.ts:219`

`el.value = normaliseHex(value) ?? '#000000'; wrap.classList.toggle('dc-color-unset', value === undefined); el.addEventListener('change', () => onChange(el.value));`. The change handler never removes 'dc-color-unset', so a picked colour stays drawn at 40% opacity with a dashed border (jsdom: `picked #ff0000 still has unset class true`). A native colour input fires 'change' only when its value differs. An unset slot already holds #000000, so black can never be committed. Clear leaves el.value at the old colour, so re-picking that same colour fires nothing and the slot stays cleared.

**Fix:** Remove 'dc-color-unset' in the change handler, and track 'unset' separately from el.value (or listen to 'input' and compare with the model) so that any pick, including black or the previous colour, commits.

### P2-182. The Count dropdown's disabled state does not follow the 'Show leaf count' checkbox until the tab is reopened

*correctness · properties editor & panels* — `src/ui/panel-general.ts:282`, `src/ui/panel-general.ts:299`

`checkbox(doc, 'Show leaf count', c.showLeafCount, (v) => setConfig({ showLeafCount: v }))` has no ctx.refresh(), and the dropdown's `disabled: !c.showLeafCount` is evaluated only when the panel is built. Ticking the box leaves Count disabled, and unticking it leaves Count enabled for a setting that no longer does anything.

**Fix:** Call ctx.refresh() in the Show leaf count handler, as the Standard and Custom modes already do.

### P2-183. A drag-resized, minimized or sized-to-fit column shows 'Width: Fixed' although it is not fixed, and choosing Fixed then does nothing

*correctness · properties editor & panels* — `src/ui/panel-column.ts:491`, `src/app.ts:550`, `src/app.ts:1960`, `src/app.ts:1983`, `src/config.ts:478`, `src/app.ts:1940`

`const widthMode = c.widthMode ?? (c.width !== undefined ? 'fixed' : 'any');`. Drag-resize, Minimize and Size to fit write `{ width }` with no widthMode, while the grid and the app treat a column as fixed only when `widthMode === 'fixed'`. After a drag, the panel shows Fixed, but the column keeps its resize grip and the next Size to Fit still changes it. Selecting 'Fixed' in a select that already shows Fixed fires no change event, so widthMode is never written until the user goes through '(Any)' first.

**Fix:** Show an absent widthMode as '(Any)' (or as a distinct 'set by resize' state) to match how the grid interprets it.

### P2-184. The Properties tabs lack ids and aria-controls, the tab panel has no accessible name, and Home/End do nothing

*accessibility · properties editor & panels* — `src/ui/editor.ts:206`

#renderTabs sets role=tab, aria-selected and a roving tabindex, but no id or aria-controls. `this.#body.setAttribute('role', 'tabpanel')` has no aria-labelledby, and #tabKey handles only ArrowLeft and ArrowRight. A screen-reader user entering the panel hears an unnamed 'tab panel' and cannot tell which of the seven tabs it belongs to. Home/End, which the ARIA tabs pattern expects, do nothing.

**Fix:** Give each tab an id and aria-controls, point the panel's aria-labelledby at the current tab, and handle Home/End in #tabKey.

### P2-185. Documentation pop-ups show Markdown backticks as literal characters

*correctness · properties editor & panels* — `src/ui/docs.ts:46`, `src/ui/docs.ts:97`

Entries such as `'A column represents either a `dimension` or a `measure`.'` and the Display Value as Link text are written with `el.textContent = ... block.text`, so nothing turns the backticks into code formatting. The (?) help next to Column Kind shows the backticks, where upstream renders inline code.

**Fix:** Store inline-code spans as structured blocks, or split the text on backticks and render <code> elements.

### P2-186. onApply has two stacked JSDoc blocks, and the one explaining the `base` contract is never shown

*maintainability · properties editor & panels* — `src/ui/editor.ts:74`

Lines 74-78 (`base` is the draft as it stood...) are followed directly by lines 79-83 (Whether the cube TOOK the draft...), both above `readonly onApply`. TypeScript attaches only the last block. The diff-against-base contract (only the changed part may reach the cube) therefore never appears in IDE hovers or generated docs, and that is the contract the in-flight Apply defect breaks.

**Fix:** Merge the two blocks into one JSDoc comment.

### P2-197. Reordering in the Columns panel sends pivot child names, so dragging a pivot child does not move its measure and stale child names are saved in columnOrder

*correctness · columns selector & panel* — `datacube/src/ui/columns-panel.ts:461`, `datacube/src/ui/columns-panel.ts:490`, `datacube/src/ui/columns-panel.ts:526`

`[...this.#root.querySelectorAll('.dc-tool-panel-row')]` also matches child rows (class 'dc-tool-panel-row dc-tool-panel-child', data-column '2021__|__notional'). Children are draggable from 'panel', so a parent row accepts them, despite the comment that 'a pivoted leaf reorders its MEASURE'. Scenario: dragging child '2022' onto 'region' sends [2022__|__notional, region, desk, notional, 2021__|__notional]. mergeColumnOrder leaves 'notional' where it was, but a history step and a query are still spent. Every reorder also writes the visible child names into config.columnOrder, where they go stale once the pivot changes and are persisted with the view.

**Fix:** Collect only non-child rows (`:not(.dc-tool-panel-child)`), and map a dragged child to its parent measure's name before reordering (or make child rows non-reorder sources).

### P2-198. Columns panel search matches the raw column name instead of the label shown, and never matches pivot child rows

*usability · columns selector & panel* — `datacube/src/ui/columns-panel.ts:253`, `datacube/src/ui/columns-panel.ts:355`, `datacube/src/ui/columns-panel.ts:378`, `datacube/src/app.ts:432`

The filter is `if (q !== '' && !column.name.toLowerCase().includes(q)) continue;`, while the row shows `this.#options.labelFor?.(column.name) ?? column.name` (the config displayName). Children appear only under a parent whose name matched. A column displayed as 'Counterparty' (raw 'cpty_nm') disappears when the user types 'counter', and searching '2021' never reveals notional's '2021' child. The checkbox aria-label and title also use the raw name ('Hide cpty_nm from the grid'), not the visible label.

**Fix:** Match against the displayed label as well as the name, include a parent when any child label matches, and build the checkbox label from the display label.

### P2-199. Editor selector search matches the raw name while rows show the display label, so searching for the text on screen finds nothing

*usability · columns selector & panel* — `datacube/src/ui/columns-selector.ts:410`, `datacube/src/ui/columns-selector.ts:446`, `datacube/src/ui/editor.ts:294`, `datacube/src/ui/editor.ts:386`

`const names = filterColumns(source, pane.search.value);` matches the raw name, while rows show `this.#options.labelFor?.(name) ?? name`. Callers pass displayName (editor.ts:294) and sortLabel, which renders '2023__|__EMEA' as '2023 / EMEA'. On a pivoted cube's Sorts tab, typing '2023 / EMEA' shows '0 of N'. On the Columns tab, 'Counterparty' (raw 'cpty_nm') is not found by 'counter'. Because moves are scoped by the search, search cannot be used to isolate these columns.

**Fix:** Filter on labelFor(name) as well as name (pass the label function into filterColumns).

### P2-200. Columns panel search re-renders on every keystroke, forcing the caret to the end and breaking IME composition

*usability · columns selector & panel* — `datacube/src/ui/columns-panel.ts:209`, `datacube/src/ui/columns-panel.ts:218`

The input handler calls `this.render()`, which replaces the input, then `next?.setSelectionRange(next.value.length, next.value.length)`, despite the comment 'put the caret back where the user left it'. There is no isComposing check. Scenario: with 'notional' in the search, the user clicks between 'n' and 'o' and types 'x', and the caret jumps to the end. With an IME (Japanese or Chinese), each composition update replaces the focused input and ends the composition, so CJK text cannot be typed normally. This has the same root as the full-panel rebuild behind the focus-loss finding (218).

**Fix:** Keep the search input across renders and re-render only the list, or restore selectionStart/selectionEnd and skip re-rendering while event.isComposing is true.

### P2-201. Shift-click does nothing when the anchor row has moved to the other pane or is hidden by the search

*usability · columns selector & panel* — `datacube/src/ui/columns-selector.ts:508`

`if (event.shiftKey && anchor !== null) { const from = visible.indexOf(anchor); const to = visible.indexOf(name); if (from >= 0 && to >= 0) { ... } }`: when from is -1, picked is left unchanged and the anchor is never reset. Scenario: the user clicks 'a' in Available and presses '>', which moves a to Selected. Shift-clicking 'c' in Available then highlights nothing, and every later shift-click in that pane does nothing until a plain click. The same happens after a search hides the anchor.

**Fix:** When the anchor is not visible, treat shift-click as a plain click: pick the single row and set the anchor.

### P2-202. Ticking a pivoted measure's parent checkbox runs one full refresh and query per child

*performance · columns selector & panel* — `datacube/src/ui/columns-panel.ts:365`, `datacube/src/ui/columns-panel.ts:367`

The parent change handler loops `for (const child of children) { this.#options.onVisibility?.(child.name, box.checked); }`, and each call goes through #patchColumn -> #setConfiguration -> #refresh. That runs applyToSnapshot, re-renders the panels, calls grid.setAppearance and issues controller.update(), all synchronously. For a measure with 20 pivot children, unticking the parent runs 20 panel and grid rebuilds and starts 20 queries, 19 of them aborted by the epoch guard. This causes a visible stall on large pivots.

**Fix:** Add a batch visibility callback (for example onVisibility(columns[], visible)) that patches every child in one configuration change and one refresh.

### P2-203. Removing a pivot chip with the keyboard sends focus to the page body, and the remove button is named with the internal column id

*accessibility · columns selector & panel* — `datacube/src/ui/pivot-panel.ts:268`, `datacube/src/ui/pivot-panel.ts:141`, `datacube/src/ui/pivot-panel.ts:237`, `datacube/src/ui/pivot-panel.ts:245`

Delete or Backspace on a chip calls `this.#set(zone, placeColumn(this.#state[zone], column, null))`. render() then replaces the zone's children and nothing restores focus, so the user must Tab from the top of the page to reach the next chip. The chip shows `labelFor?.(column) ?? column`, but the button uses `remove.setAttribute('aria-label', `Remove ${column}`)`. A screen reader therefore announces 'Remove trade_dt' next to the visible 'Trade Date'.

**Fix:** After a keyboard removal, focus the next chip, the previous chip or the zone. Build the button's title and aria-label from the same labelFor text as the chip.

### P2-215. Growing the grid's height does not re-render, so newly exposed space stays blank until the user scrolls

*correctness · grid rendering & keyboard · reproduced* — `src/grid/grid.ts:339`, `src/grid/grid.ts:342`, `src/grid/grid.ts:519`

The ResizeObserver callback returns unless the width changed (`if (width === seen) return; seen = width; this.#syncHeaderOffset();`) and never clears #rendered or calls #render, and the rendered window was computed from clientHeight at the last render. No window resize listener covers it. With Row Buffer at its minimum of 10 (200px of slack at 20px rows), maximising a half-height window adds about 400px of grid, and the bottom ~200px shows no rows until the next scroll, although the scrollbar shows more data. At the default buffer of 50 (1,000px of slack) only a larger growth shows it. The same happens when rows arrive while the grid has zero height.

**Fix:** On any observed size change, height included, reset #rendered and call #render (cheap when covered), and keep the width check only for the header sync.

### P2-216. Numeric pivot values are sorted as text, so a month pivot's columns read 1, 10, 11, 12, 2, ...

*data-semantics · grid rendering & keyboard · reproduced* — `src/grid/columns.ts:476`, `src/grid/columns.ts:486`, `src/app.ts:980`

Pivot columns are sorted by the value segments of their names, which are strings, with `return desc ? vb.localeCompare(va) : va.localeCompare(vb);` and no numeric option or type check. app.ts always fills pivotDirections with `pivotSortDirection ?? 'asc'`, so this sort runs on every pivot. Reproduced with the real buildColumnModel: pivoting on an Integer month column gives headers 1, 10, 11, 12, 2, 3, ..., 9. The same applies to any integer or decimal pivot key, and plain localeCompare also makes the order depend on the viewer's locale.

**Fix:** Compare by the pivot key's type from the snapshot (numeric or temporal compare for those types), or at least use localeCompare with `{ numeric: true }` and a fixed locale.

### P2-217. The same text values sort differently as rows and as pivot columns (database byte order vs localeCompare)

*data-semantics · grid rendering & keyboard · reproduced* — `src/grid/columns.ts:484`, `src/grid/columns.ts:486`, `src/snapshot.ts:738`

Pivot headers are ordered with `va.localeCompare(vb)`, while group rows are sorted by the database: totalOrderSorts adds each group column ascending, and the planner emits a plain ORDER BY in DuckDB's default binary collation, with no collation set anywhere. For the values amer, EMEA, Eire (with an accented E) and zulu, the tree rows read EMEA, amer, zulu, Eire (byte order), but the same dimension dragged to the pivot reads amer, Eire, EMEA, zulu. Users see the same members in two orders, and on the row axis accented values sort after 'z'. This is separate from the numeric-as-text pivot sort.

**Fix:** Use one collation on both axes: either emit a collated ORDER BY for group keys, or order pivot headers by the order the database returns the pivot columns in.

### P2-218. destroy() cancels animation frame id 1 instead of the pending scroll frame and leaves the grid's timers running

*maintainability · grid rendering & keyboard* — `src/grid/grid.ts:541`, `src/grid/grid.ts:1093`, `src/grid/grid.ts:403`, `src/grid/grid.ts:473`, `src/grid/grid.ts:1119`

#onScroll sets a pending flag, `this.#frame = 1;`, and discards the id that requestAnimationFrame returns (deliberately, per its comment), yet destroy() does `if (this.#frame) cancelAnimationFrame(this.#frame);`, which cancels id 1, not the queued frame. destroy() also never clears #hintTimer, #busyTimer or the autoFit rAF from setRows. If the user scrolls and immediately leaves Ad Hoc mode (app.ts:2330 -> adhoc/mode.ts:131 -> grid.destroy()), the queued frame still runs #showScrollHint, #syncHeaderOffset and #render on the destroyed grid and starts a new 800 ms hint timer. The harm today is small: work after teardown, plus cancelling whatever unrelated callback holds id 1.

**Fix:** Keep the real rAF id in a separate field from the pending flag, cancel it in destroy(), and clear #hintTimer, #busyTimer and the fit frame there too.

### P2-219. sliceFor, valueColumns and cellCount are exported and tested but have no product caller, which implies a block-fetch design that does not exist

*maintainability · grid rendering & keyboard · reproduced* — `src/grid/viewport.ts:97`, `src/grid/columns.ts:661`, `src/selection.ts:54`, `src/app.ts:991`, `src/adhoc/mode.ts:174`

A whole-word grep over src/, demo/ and test/ finds each of sliceFor, valueColumns and cellCount defined once and referenced only in test/grid.test.ts and test/selection.test.ts; the other `valueColumns` hits are unrelated local variables. The windowing comments describe fetching rows in blocks, but both setRows callers (app.ts:991, adhoc/mode.ts:174) pass blockOffset 0 and the full row count. So the tests exercise block-slicing logic that no production path uses, while the blockOffset mapping that real selection code would need goes untested.

**Fix:** Delete the unused exports and their tests, or wire them into the block-fetch path they describe.

### P2-225. Windows can be moved, resized and raised only with a pointer, so keyboard users cannot move a window off the data it covers and can tab into a buried window

*accessibility · windows & shortcuts* — `src/ui/window.ts:156`, `src/ui/window.ts:197`, `src/app.ts:2752`

Dragging is only `handle.addEventListener('pointerdown', ...)` (window.ts:156) and the eight resize grips are `aria-hidden` divs listening only for pointerdown (193-222); window.ts has no keydown handling at all. Raising is `win.addEventListener('pointerdown', () => this.#raise(win))` (app.ts:2752) with no focusin equivalent. Scenario: a keyboard user with the 800x600 centred Properties window open cannot move it to see the effect of Apply on the grid; with Properties and Filter both open, Tabbing into Properties (earlier in the DOM, underneath) focuses controls hidden behind Filter (WCAG 2.1.1, 2.4.11, 2.5.7). The missing dialog role and focus-on-open that one member also cites are the separate windows-focus entry.

**Fix:** Raise a window on focusin, and offer keyboard move and resize (arrow keys on a focusable title bar, or Move/Resize menu commands).

### P2-226. A cube built with its title bar folded has no keyboard shortcuts at all: Ctrl-E, Ctrl-Z and Ctrl-Y do nothing

*correctness · windows & shortcuts* — `src/app.ts:2847`, `src/app.ts:2862`, `src/app.ts:3062`

The document shortcut listener is installed at the end of #buildToolbar, but the folded-title-bar branch (`if (!this.#config.showTitleBar) { ... bar.append(open); ... return; }`, ending at 2862) returns before `this.#doc.addEventListener('keydown', this.#onDocKey)`. A host that configures showTitleBar:false (or a loaded view with it folded, on a cube whose constructor ran folded) therefore gets no Ctrl-E, undo or redo shortcuts until the user unfolds the title bar. The same misplacement is the root of the duplicate-listener entry; moving the registration to the constructor fixes both.

**Fix:** Register the document keydown listener once in the constructor, independent of whether the title bar is shown.

### P2-227. Ctrl-E is captured inside text fields, where on macOS it means 'move to end of line', and opens Properties instead

*correctness · windows & shortcuts* — `src/app.ts:3039`, `src/app.ts:3049`

In #onDocKey, `if (key === 'e') { event.preventDefault(); this.openEditor(); return; }` runs before the `if (isTextEntry(event.target)) return;` guard at 3049, and it accepts ctrlKey as well as metaKey. Scenario: on macOS a user typing a filter value or a calculated-column expression presses Ctrl-E to jump to the end of the line; the caret does not move and the Properties editor opens on top.

**Fix:** Move the isTextEntry check above the Ctrl-E branch, or accept only metaKey for this shortcut on macOS.

### P2-229. The treegrid has no accessible name, and rows never get the aria-posinset/aria-setsize the header promises

*accessibility · accessibility* — `src/grid/grid.ts:15`, `src/grid/grid.ts:266`, `src/grid/grid.ts:1160`

The root gets only `this.#root.setAttribute('role', 'treegrid'); this.#root.tabIndex = 0;` with no aria-label or aria-labelledby. The file header (line 15) lists `role=row with aria-level, aria-expanded, aria-posinset, aria-setsize`, but grep of src finds posinset and setsize only in that comment; rows get only aria-level and aria-expanded from rowMeta. Because the DOM is windowed, the browser computes sibling position from the rendered band only. Scenario: a screen-reader user tabs to the grid and hears an unnamed 'tree grid', then moves through a group's children and hears no correct 'n of m' within the group. aria-rowindex/aria-rowcount still give the absolute row, so this is not a blocker.

**Fix:** Give the treegrid an aria-label (the report title, or 'Data grid'). Extend rowMeta with the sibling index and sibling count and set aria-posinset/aria-setsize on each rendered row.

### P2-232. Filter editor column, operator and value controls have no accessible name

*accessibility · accessibility* — `src/ui/filter-editor.ts:1416`, `src/ui/filter-editor.ts:1119`, `src/ui/filter-editor.ts:1056`, `src/ui/filter-editor.ts:1057`, `src/ui/filter-editor.ts:1087`

#select (1416-1436) creates a bare <select> and #textInput (1119-1132) a bare <input>, with no aria-label, title or <label>; only #button sets aria-label (1405-1407). These build the column (1056), operator (1057), right-column (1078), group join (1025) selects and the number, time, date and list value inputs; only the default text input has a 'value' placeholder. Scenario: a screen-reader user moving through a condition row hears 'combo box, region', 'combo box, =' and then just 'edit text' for a number value, with nothing saying which is the column, operator or value. The current value and row order give some context, so it is not a hard blocker.

**Fix:** Let #select and #textInput take an aria-label and pass one at each call site, for example 'Column', 'Operator', 'Compare to column', 'Value for <column>'.

### P2-233. JSON fields picker (and ad hoc member selection) declare role=tree/treeitem without focusable items or arrow-key navigation

*accessibility · accessibility* — `src/ui/json-fields.ts:47`, `src/ui/json-fields.ts:81`, `src/adhoc/member-selection.ts:65`, `src/adhoc/member-selection.ts:126`

json-fields.ts sets `tree.setAttribute('role', 'tree')` and `row.setAttribute('role', 'treeitem')` on plain divs that hold <button> children, with no tabindex and no keydown handling anywhere in the file or its caller. member-selection.ts repeats the pattern and appends all nodes flat into the tree with only paddingLeft, so the hierarchy is announced as one level while aria-expanded sits on unfocusable rows. Scenario: NVDA or JAWS switch to focus mode inside the tree and the user presses arrow keys expecting to move between items; nothing happens, and the nested buttons are announced inconsistently. Tab still reaches every button, so the feature remains usable.

**Fix:** Either drop the tree roles in favour of plain nested lists (ul/li, role=group for nesting), or implement the ARIA tree pattern with a roving tabindex, arrow-key handling and correct aria-level/aria-expanded on focusable treeitems.

### P2-234. Plot and treemap charts expose only the report title (or 'cube') to screen readers; bar and tile values are hidden

*accessibility · accessibility* — `src/chart.ts:107`, `src/chart.ts:181`, `src/chart.ts:334`, `src/app.ts:2055`

svg() wraps every chart in ` role="img" aria-label="${esc(title ?? 'chart')}"`, and app.ts #chart passes `this.#config.reportTitle ?? 'cube'`. The per-bar/per-tile <title> elements and <text> labels are children of role=img, which are presentational, and the SVG is inserted via `box.innerHTML = svg` with no aria-describedby, summary or table. Scenario: a screen-reader user with no report title set chooses Plot and hears only 'cube, image'. The same numbers remain in the grid, so this is a missing text alternative, not a blocker.

**Fix:** Add a text alternative next to the chart: a visually hidden data table or a summary of the top labels and values, referenced by aria-describedby. Alternatively use role=graphics-document with labelled item elements.

### P2-235. Treemap tile labels are white 10px text on light palette colours, with contrast as low as 1.61:1

*accessibility · accessibility · reproduced* — `src/chart.ts:329`, `src/chart.ts:340`, `src/chart.ts:41`

toTreemap colours tile i with `const colour = PALETTE[i % PALETTE.length];` and always draws its label with `font-size="10" fill="#ffffff"`. Measured white-text contrast: #edc948 1.61, #ff9da7 1.98, #bab0ac 2.12, #76b7b2 2.29, #f28e2b 2.42; only #4e79a7 (4.55) passes 4.5:1, nine of ten fail. Scenario: in any treemap with six or more positive values, the sixth tile is yellow with a white label at 1.61:1, which low-vision users cannot read; the only other way to read it is a hover tooltip.

**Fix:** Choose black or white text per tile from the background's relative luminance, or darken the palette so every entry reaches 4.5:1 with white.

### P2-236. Demo Data window controls lack accessible names, and host windows open without moving focus

*accessibility · accessibility* — `demo/index.html:183`, `demo/index.html:195`, `demo/index.html:196`, `demo/index.html:198`, `demo/boot.ts:802`, `src/ui/window.ts:197`

`<input id="whuser" ... placeholder="user">` and `<input id="whpass" type="password" placeholder="password">` rely on placeholders, `<select id="whtable" hidden></select>` has no name at all, and samplerows relies on title="rows"; boot.ts never adds names at runtime. toggleHostWindow (boot.ts:802-817) sets `el.hidden = false` and calls makeWindow but never focuses the window, and #datawin has no role="dialog". Scenario: after choosing 'Data…' from the menu, focus stays where it was, so a keyboard user must tab through the whole grid to reach the window at the end of <body>, where the table picker is read as an unnamed combo box.

**Fix:** Add <label>s or aria-labels to whuser, whpass, whtable and samplerows. Give .hostwin role="dialog" with aria-labelledby to its title, and focus its first control when toggleHostWindow opens it.

### P2-246. Pinned cells ignore row banding and total shading, and an expanded total row on a banded line gets a band-coloured label cell

*correctness · styling & CSS* — `src/grid/grid.css:492`, `src/grid/grid.css:500`, `src/grid/grid.css:231`, `src/grid/grid.css:583`, `src/grid/grid.css:589`

`.dc-cell.dc-pin-left/right` hard-code `background: var(--tw-white)`, and only `.dc-dim` has alt and total overrides. With default banding, a pinned measure is therefore a white stripe through every #d7e0eb band row and is white instead of #fafafa on totals. `.dc-row.dc-alt .dc-cell.dc-dim` (:589) and `.dc-row.dc-total .dc-cell.dc-dim` (:231) have equal specificity, and the alt rule comes later. So an expanded group on an odd row is #fafafa while its tree label cell is blue-grey, contradicting the comment at :583-584 ('Banded rows sit UNDER the total shading').

**Fix:** Drive sticky-cell backgrounds from the row state (for example `background: inherit` or a shared custom property set per row class), and put the total rule after the alt rule or raise its specificity.

### P2-247. A pinned-right column's header sits 10px (the scrollbar width) to the right of its cells

*correctness · styling & CSS · reproduced* — `src/grid/grid.css:500`, `src/grid/grid.css:522`, `src/grid/grid.ts:671`, `src/theme.css:142`

`.dc-th.dc-pin-right { position: sticky; right: 0 }` sticks inside .dc-head, which is as wide as the grid. The body cell sticks inside .dc-scroller, whose clientWidth excludes the forced 10px vertical scrollbar (theme.css:142-146). `#syncHeaderOffset` (grid.ts:671-693) corrects only overshoot. Reproduced in Chromium with a 600px grid and column 5 pinned right: at scrollLeft 0 the header is at x=508 and its cells at x=498, and at scrollLeft 200 both are at 308. The label hangs offset from its figures whenever the column is held at the edge.

**Fix:** Reserve the scrollbar gutter in the header (padding-right equal to scroller.offsetWidth minus clientWidth, or the same scrollbar-gutter on both containers) so both sticky containers share a right edge.

### P2-248. The busy progress bar keeps sweeping while queries run even when the user asks for reduced motion, and it animates `left`

*accessibility · styling & CSS* — `src/app.css:1924`, `src/app.css:1931`, `src/app.ts:1128`, `src/grid/grid.css:256`, `src/grid/grid.css:542`

`.dc-status-progress.dc-busy::after` runs `animation: dc-indeterminate 1.2s ease-in-out infinite` with `@keyframes dc-indeterminate { from { left: -40%; } to { left: 100%; } }`, and app.ts:1128 applies dc-busy whenever any task is running. The only prefers-reduced-motion rules (grid.css:256, :542) do not cover it. A user with Reduce Motion enabled still sees the sweep for the whole of every long warehouse query. Animating `left` costs layout each frame, though it stays confined to the small overflow-hidden box.

**Fix:** Animate `transform: translateX()` instead, and add a prefers-reduced-motion rule that replaces the sweep with a static or gently pulsing full-width bar.

### P2-249. Dead selectors, unread tokens, an undefined --dc-mono, duplicate rules, and palette redeclarations that stop a host from theming the component

*maintainability · styling & CSS* — `src/app.css:106`, `src/app.css:120`, `src/app.css:126`, `src/grid/grid.css:461`, `src/grid/grid.css:482`, `src/theme.css:35`, `src/theme.css:94`, `src/theme.css:98`, `src/theme.css:121`, `src/grid/grid.css:274`, `src/style.ts:253`, `src/app.css:159`, `src/app.css:219`, `src/app.css:767`, `src/app.css:819`, `src/app.css:2202`, `src/app.css:17`

No markup uses `.dc-tool`, `.dc-filter-remove` or `.dc-filter-actions`. Ten tokens are declared and never read, including --dc-pinned-separator (whose comment promises a doubled pinned-column rule) and --dc-selection-border. style.ts:253 writes --dc-font-size but no stylesheet reads it. `--dc-mono` is never defined, so `.dc-jsonfields-name { font-family: var(--dc-mono); }` (app.css:2202) has no fallback and the JSON field names are not monospaced. `.dc-pivot-panel.dc-pivot-panel-list > .dc-zone` is declared twice (:159, :219), and the second rule cancels the first. theme.css:35-38 redeclares the whole palette on .dc-grid, .dc-menu and .dc-filters. A host setting `.dc-app { --tw-white: #111 }`, as app.css:17-19 invites, therefore sees no change in the grid, menu or filter editor.

**Fix:** Delete the dead rules and tokens, or wire up --dc-pinned-separator and --dc-selection-border. Switch --dc-mono to --dc-font-mono, merge the duplicate rules, and declare the palette once on a single shared scope that the body-mounted menu also inherits.

### P2-250. Many click targets are far below 24x24px, some sit flush against each other, and some labels are 8-9px

*accessibility · styling & CSS* — `src/grid/grid.css:387`, `src/grid/grid.css:862`, `src/app.css:205`, `src/app.css:506`, `src/app.css:714`, `src/app.css:1028`, `src/app.css:1093`, `src/app.css:1304`, `src/app.css:1561`, `src/app.css:1584`, `src/app.css:1626`, `src/app.css:1869`, `src/ui/filter-editor.ts:1349`, `src/ui/pivot-panel.ts:228`

`.dc-filter-ctl { min-width: 16px; height: 16px; ... border-left-width: 0 }` places the filter +, -, ( ) and ! buttons flush with no gap (filter-editor.ts:1349-1381). A user with a tremor, or on touch, aiming at '+' can hit '-' and delete the condition. The group-by chip's remove button `.dc-chip-remove` is 14x14 inside a draggable chip. Other small targets: `.dc-doc-hint` 14x14, `.dc-tool-panel-show` 12x12, `.dc-color-clear` 14px wide, `.dc-col-resize` 7px, window grips 6px. The text in `.dc-badge`, `.dc-selector-row-hint` and `.dc-tool-panel-badge` is 8px. No coarse-pointer media query enlarges any of these, so they fail WCAG 2.2 2.5.8. The impact is limited because a mis-tap in the filter editor changes only a draft.

**Fix:** Enlarge hit areas with padding or pseudo-element hit slop while keeping the visual density, add spacing between adjacent controls, and raise the minimum text size to about 10px.

### P2-251. Nothing pins left-to-right layout, so in a dir=rtl host the sticky row-label column scrolls away and tree indents and submenus open on the wrong side

*browser-compat · styling & CSS* — `src/grid/grid.css:191`, `src/grid/grid.css:224`, `src/grid/grid.css:694`, `src/app.css:977`

The layout uses physical properties throughout: `.dc-cell.dc-dim { position: sticky; left: 0 }`, tree `padding-left: calc(8px + var(--dc-indent) * 14px)`, submenu `left: 100%`. No element under .dc-app or .dc-menu sets `direction`. Under an RTL ancestor the grid mirrors, and `left: 0` no longer holds the right-hand label columns: at scrollLeft=-700 they land beyond the viewport. The shipped pages are lang=en with no dir, so this bites only an RTL embedding host.

**Fix:** Set `direction: ltr` on .dc-app and .dc-menu (the UI is English-only), or convert to logical properties (inset-inline-start, padding-inline-start) throughout.

### P2-252. The always-visible scrollbar styling is WebKit-only, so Gecko on macOS still auto-hides the grid scrollbars

*browser-compat · styling & CSS* — `src/theme.css:138`, `src/theme.css:142`

theme.css:138-162 styles only `::-webkit-scrollbar*`, and its comment says suppressing OS auto-hide is deliberate because 'a grid whose scrollbar vanishes hides how much is left to read'. Gecko ignores these pseudo-elements, and no `scrollbar-width` or `scrollbar-color` is set. On Gecko for macOS with the default automatic scrollbars, .dc-scroller shows no scrollbar until the user scrolls. The effect is cosmetic, and the row-count scroll hint partly compensates.

**Fix:** No CSS can force Gecko to keep overlay scrollbars visible, so document the limit or add a visible horizontal-extent cue. If Gecko styling is added, guard it (for example with `@supports (-moz-appearance: none)`): an unconditional `scrollbar-width` makes Chromium 121+ drop the existing ::-webkit-scrollbar styling.

### P2-253. There is no print stylesheet, so Ctrl+P prints the app chrome and only the few rows that are currently rendered

*ux · styling & CSS* — `src/app.css:22`, `src/grid/grid.ts:1133`, `demo/index.html:36`, `demo/index.html:79`

No file has an `@media print` rule or a beforeprint handler. The grid is virtualised (grid.ts:1133-1146 renders only the visible window of rows), and the host sets `body { overflow: hidden }` and `#app { height: 100vh }`. Pressing Ctrl+P on a 5,000-row cube prints one page: the title bar, zone bar, sidebar, status bar and about 40 clipped rows. Nothing points the user to the existing PDF export.

**Fix:** Add `@media print` rules that hide the chrome and show a note pointing to Export > PDF, or intercept beforeprint and send the user to the PDF export.

### P2-254. On iOS/iPadOS WebKit, `#app { height: 100vh }` inside a body with `overflow: hidden` pushes the cube's bottom status bar under the browser toolbar

*browser-compat · styling & CSS* — `demo/index.html:32`, `demo/index.html:36`, `demo/index.html:79`, `demo/index-server.html:74`, `demo/index-engine.html:74`

The pages set `html, body { height: 100%; } body { overflow: hidden; }` and `#app { height: 100vh; }`, and they declare a mobile viewport. On mobile WebKit 100vh is the large viewport, taller than the visible area while the toolbar is shown. #app therefore overflows by the toolbar height, and the page cannot scroll it back into view. The 20px status bar with the row count and host errors (app.ts:1018-1026) ends up hidden.

**Fix:** Use `height: 100%` (html and body are already 100%) or `100dvh` with a 100vh fallback.

### P2-267. Ad Hoc shape queries run one after another and are never cancelled when a newer step overtakes them

*performance-memory · ad hoc analysis* — `src/adhoc/session.ts:87`, `src/app.ts:2300`, `src/cube.ts:638`

refresh does `for (const q of queries) { results.set(q.key, await this.#run(q.pure, q.snapshot, q.scope)); if (seq !== this.#seq) return null; }`, and planQueries emits one query per combination of generations. The runner callback `(pure, snapshot, scope) => this.#controller.query(pure, snapshot, scope)` never passes the AbortSignal that controller.query accepts. Zoom In All Levels on 4-generation Time on rows and 4-generation Geography on columns gives 16 serial round trips, about 1.6 s at 100 ms each instead of about 0.1 s. A newer gesture stops the loop only after the in-flight statement finishes on the server's small pool, where it holds a slot or the serialised DuckDB connection.

**Fix:** Run the shape queries concurrently (Promise.all, or bounded concurrency on remote planes). Give each refresh and member lookup an AbortController, abort it when a newer one starts, and pass the signal through the run callback into controller.query.

### P2-268. The Navigate Without Data status is inverted: the intended warning never appears, and '(not refreshed)' is shown right after a real Refresh

*correctness · ad hoc analysis* — `src/adhoc/mode.ts:151`, `src/adhoc/mode.ts:175`

#run warns only when `this.session.grid.options.navigateWithoutData && view !== this.session.view`. But apply, setOptions and refresh all return exactly session.view, so the warning fires only when a refresh was overtaken (view null). #paint appends `' (not refreshed)'` whenever the option is on, whether or not the view was just queried. With the option on, a zoom shows no warning. Refresh runs the query and the status says 'N rows, M columns (not refreshed)'. A double-clicked Refresh shows 'Navigating without data -- Refresh to query' for the overtaken first refresh.

**Fix:** Have the session report whether the returned view answers the current grid (for example, return {view, fresh}), and derive both the warning and the suffix from that.

### P2-269. With Navigate Without Data on, the old view's headers are laid out with the new grid's column depth, so raw separator labels appear

*correctness · ad hoc analysis* — `src/adhoc/mode.ts:164`

#paint computes `const columnDims = this.session.grid.columns.length;` and passes `Math.max(0, columnDims - 1)` to buildColumnModel for `view.table`. When navigating without data, that view was assembled for the previous grid. With columns [Measures, Time, region], pivoting Time to rows passes pivot arity 1 instead of 2, and the top header reads 'notional__|__2021 | notional__|__2022' (the literal PIVOT_SEPARATOR) instead of 'notional' over '2021 | 2022'. #columnTarget likewise maps header levels through the new session.grid.columns.

**Fix:** Carry the column dimension count (or the grid it answers) on AdHocView, and use it in #paint and #columnTarget instead of session.grid.

### P2-270. Exiting Ad Hoc does not cancel an in-flight step, so its late answer overwrites the cube's status or opens an error window for a mode that is gone

*async-concurrency · ad hoc analysis* — `src/adhoc/mode.ts:129`, `src/app.ts:2325`

destroy() only closes the menu, destroys the grid and empties the root, and sets no disposed flag. #run continues after `await step()` with `this.#paint(view)`, which calls `this.#options.status(`${rows} rows, ...`)`, or with `reportFailure(error)`. On a slow warehouse source, a user who clicks Exit before the query returns sees 'Back to the cube' replaced by the ad hoc grid's '1 rows, 2 columns'. If the step fails, an execution-error window opens over the cube.

**Fix:** Set a destroyed flag in destroy() and have #run skip painting, status and reportFailure once it is set. Also abort the in-flight query once cancellation exists.

### P2-271. The POV bar, including its Refresh and Options buttons, is rebuilt after every step, so keyboard focus drops to the page body

*accessibility · ad hoc analysis* — `src/adhoc/mode.ts:150`, `src/adhoc/mode.ts:183`

#paintPov starts with `this.#pov.replaceChildren();` and recreates every chip and the Refresh/Options/Exit buttons. #run calls it after every step. A keyboard user who tabs to Refresh and presses Enter loses focus to <body> when the refresh completes, and must tab through the page again.

**Fix:** Update the chips and buttons in place, or remember the focused control (by data-dimension or role) and restore focus after repainting.

### P2-273. Group-level calculated columns (margins, ratios) silently vanish in Ad Hoc Analysis

*data-semantics · ad hoc analysis* — `src/adhoc/query.ts:174`, `src/adhoc/outline.ts:55`

planQueries sets `groupDerived: []` on every shape snapshot, and buildCube takes measures only from snapshot.measures or measure-kind row columns. A cube with a group-level column 'margin' = profit / revenue enters Ad Hoc Analysis, and 'margin' is not a Measures member and appears nowhere. No message says it was dropped, and docs/AD_HOC_ANALYSIS.md §5 does not list it as out of scope.

**Fix:** Offer group-derived columns as Measures members and extend each shape query with them (their expressions refer to measure names, which the shape query produces). Otherwise tell the user they are unavailable.

### P2-280. An open Member Selection window is re-raised in its old POV or axis mode after the dimension moves, and its OK then does nothing

*state-persistence · ad hoc analysis* — `src/adhoc/mode.ts:466`, `src/app.ts:2740`, `src/adhoc/state.ts:278`

openMemberSelection calls showWindow(`Member Selection: ${dimension}`, ...), and #showOverlay does `if (open && !options.replace) { this.#raise(open); return open; }`, which keeps the old build and the `place` its onOk captured. The user opens the window from the 'region' POV chip (radio mode), leaves it open, moves region to Rows, then chooses Member Selection on a region row. The old one-pick window is raised, and OK calls setPov, which returns the same grid because region is no longer in the POV: no change, no query, no message. The reverse (axis window, dimension moved to the POV) discards the picks the same way.

**Fix:** Key the window by dimension and place, or pass `replace: true` from openMemberSelection. Have onOk report when the dimension is no longer where the window was opened.

### P2-281. All Member Selection radios share one page-wide name, so two POV windows open at once uncheck each other's radios

*correctness · ad hoc analysis* — `src/adhoc/member-selection.ts:147`

`box.type = many ? 'checkbox' : 'radio'; box.name = 'dc-adhoc-member';`, and the windows are divs in the same document with no <form>, so all these radios form one group. With POV Member Selection open for both Region and Year, picking 2021 unchecks Region's radio, while Region's `picked` state is unchanged, so its OK still applies a member it no longer shows as checked. Arrow keys on a radio also move and check across both windows.

**Fix:** Use a unique name for each window (for example from the dimension plus a counter).

### P2-282. Ad Hoc Undo and Redo always query, even with Navigate Without Data on, and the status then says '(not refreshed)'

*correctness · ad hoc analysis* — `src/adhoc/session.ts:111`, `src/adhoc/session.ts:120`, `src/adhoc/mode.ts:175`

undo() ends `this.#grid = prev; return this.refresh();`, and redo() does the same, whereas apply() honours `next.options.navigateWithoutData`. A user who turns the option on, makes several zooms without queries and presses Undo runs a full refresh of every shape, which is exactly what the option defers on a slow warehouse. #paint then appends ' (not refreshed)' to numbers that were just queried.

**Fix:** In undo/redo, return this.#view without querying when the target grid has navigateWithoutData, and make #paint's suffix depend on whether the view answers the current grid rather than on the option.

### P2-283. Settings do not reach Ad Hoc: Max History Stack Size, Row Buffer and Debug Mode affect only the hidden cube

*correctness · ad hoc analysis* — `src/adhoc/session.ts:45`, `src/app.ts:2610`, `src/adhoc/mode.ts:83`, `src/app.ts:946`

AdHocSession uses `const HISTORY = 100;` in `this.#past = [...this.#past, this.#grid].slice(-HISTORY)`. #applySettings only calls `this.#controller.setHistoryLimit(...)` and `this.#grid.setOverscan(...)`, the Ad Hoc DataGrid is built without overscan, and `#debug('query', ...)` is called only from the cube's #onView. A user who sets Max History Stack Size to 10 and turns Debug Mode on still gets 100 Ad Hoc undo steps and the default row buffer, and none of the Ad Hoc queries are logged.

**Fix:** Pass the history limit, overscan and a debug hook into AdHocModeOptions and AdHocSession, and forward #applySettings to the mode while it is on.

### P2-284. In Ad Hoc mode the menu's Undo/Redo enabled state reflects the hidden cube, not the Ad Hoc session they act on

*correctness · ad hoc analysis* — `src/app.ts:2973`, `src/app.ts:3079`

The hamburger builds Undo with `...(this.#controller.canUndo ? {} : { disabled: true })`, while #undo() sends the action to `this.#adhoc.undo()` whenever Ad Hoc is on. On a fresh cube, after one Ad Hoc zoom, the menu shows Undo disabled although Ctrl-Z would undo the zoom. With cube history but none in Ad Hoc, Undo is enabled and choosing it says 'Nothing to undo'.

**Fix:** Read canUndo and canRedo from the active mode (this.#adhoc.session when Ad Hoc is on).

### P2-285. Leaving Ad Hoc Analysis leaves keyboard focus on the page body

*accessibility · ad hoc analysis* — `src/adhoc/mode.ts:132`, `src/app.ts:2326`

destroy() runs `this.#grid.destroy(); this.#root.replaceChildren();`, which removes the focused Exit button or grid cell. exitAdHoc then shows the cube grid without focusing anything, and the menu's return-focus target is the removed cell. A keyboard user who presses Exit lands on <body> and must tab from the top of the page to reach the grid.

**Fix:** After exiting, focus the cube grid (its focused cell or root).

### P2-291. Entering Ad Hoc while a cube filter is still being applied carries a filter that is later refused into the session as a pinned member, so every Ad Hoc query fails

*async-concurrency · ad hoc analysis · reproduced* — `src/app.ts:2296`, `src/app.ts:2472`, `src/adhoc/outline.ts:190`

#applyFilter assigns `this.#snapshot = {...filter}` before `await this.#refresh()` and restores the previous snapshot on failure (useDimension and #refreshOr use the same optimistic pattern). enterAdHoc synchronously takes `carryOver(this.#snapshot, ...)`, and carryOver turns an `equal` condition on a dimension column into that dimension's member. Reproduced: the planner refuses region == 'BAD' after 40 ms, and the user chooses Ad Hoc Analysis within that window. The cube rolls back, but the session has Geography pinned to ['BAD'], and the first and every later Ad Hoc refresh fails with "Can't find property 'BAD'". Only exiting and re-entering recovers.

**Fix:** Build the session from the last snapshot that landed (the controller's view snapshot), not the optimistic one, or refuse or queue enterAdHoc while a cube refresh is pending.

### P2-293. arrowChunks has no finally, so a statement whose read ends early (abort during chunk download, a chunk HTTP error, or a consumer that throws) is never DELETEd, and its full result stays held on the server for 10 minutes

*performance-memory · warehouse client · reproduced* — `datacube/src/warehouse.ts:165`, `datacube/src/warehouse.ts:170`, `datacube/src/warehouse.ts:174`, `datacube/src/warehouse.ts:175`, `datacube/src/warehouse.ts:130`, `datacube/src/duckdb.ts:389`, `datacube/src/snap.ts:257`, `warehouse/src/main/java/com/legend/warehouse/server/Statements.java:190`, `warehouse/src/main/java/com/legend/warehouse/server/Statements.java:407`, `warehouse/src/main/java/com/legend/warehouse/server/Statements.java:416`, `warehouse/src/main/java/com/legend/warehouse/server/WarehouseServer.java:494`, `warehouse/src/main/java/com/legend/warehouse/server/WarehouseServer.java:495`

The DELETE `/sql/v1/statements/${id}` (line 174) runs only after the last chunk has been yielded. The catch sends only `POST .../cancel`, and only `if (signal?.aborted)`. `Statements.cancel` just sets a flag and interrupts a running connection, so it frees nothing on a SUCCEEDED run; only `forget()` (reached by DELETE or by the `forgetOld` sweep after `retainMinutes = 10`) frees `run.stored`. When the consumer throws, as `DuckDbEngine.loadArrow` does when its insert fails inside `for await`, the loop calls the generator's `return()`, which runs neither the catch nor the DELETE. Snap also passes no signal (snap.ts:257), so a failed chunk GET there sends nothing at all. Scenario: a snap of several million rows fails in the tab when DuckDB-WASM runs out of memory. The whole stored result (up to maxRows = 10M rows, spilling to disk past the memory budget) stays on the shared server for 10 minutes. Node reproductions logged no catch and no DELETE. The cost is bounded in time and nothing the user sees is wrong, so LOW rather than the MEDIUM one member claimed.

**Fix:** Wrap the body of arrowChunks in try/finally and always send a best-effort, fire-and-forget DELETE (after the cancel when aborted). DELETE both cancels a running statement and frees a finished one.

### P2-294. A 401 on a chunk download skips the 'session expired, sign in again' message that every other warehouse call gives

*error-handling · warehouse client* — `datacube/src/warehouse.ts:170`, `datacube/src/warehouse.ts:201`

`#call` maps a 401 to `'the warehouse session has expired — sign in again'` (line 201), but the chunk fetch in arrowChunks uses a raw `fetch` followed by `if (!r.ok) throw new Error(await failure(r))`. Scenario: the token expires between chunk fetches of a long snap, and the user sees the server's `AUTH_INVALID: the token is invalid or expired` rather than the sign-in guidance. The server's JSON body is parsed, so the message is readable, just inconsistent (the original claim of a raw 'HTTP 401' was overstated).

**Fix:** Route the chunk GET through the same 401 mapping as `#call` (e.g. a shared response check), so an expired session reads the same everywhere.

### P2-295. Every Live query waits one extra round trip for the cleanup DELETE before its rows reach the grid, and a network error on that DELETE fails a query whose data is already downloaded

*performance · warehouse client* — `datacube/src/warehouse.ts:174`, `datacube/src/warehouse.ts:130`, `datacube/src/warehouse.ts:133`, `datacube/src/snap.ts:257`

The cleanup `await fetch(url(this.#session.baseUrl, `/sql/v1/statements/${id}`), { method: 'DELETE', headers: this.#auth() })` runs inside the generator after the last `yield`. `execute`'s `for await` resumes the generator once more, so `new Table(batches)` is only built after the DELETE round trip. A network-level rejection of the DELETE reaches the catch, which rethrows because the signal is not aborted, and `execute` wraps it as a QueryError. Snap has the same gap. Scenario: on a 100 ms RTT link every Live refresh is at least 100 ms slower than needed, and a brief drop after the last chunk shows 'Failed to fetch' for a result that was already fully read.

**Fix:** Fire the DELETE without awaiting it (`void fetch(...).catch(() => undefined)`), for example from the finally that the no-finally entry above adds, so cleanup can never delay or fail a completed read.

### P2-296. The warehouse URL is never validated before sign-in, so the password can go to the page's own origin (empty or scheme-less URL) or over plain http, and 'host:port' fails with a cryptic scheme error

*security · warehouse client · reproduced* — `datacube/src/warehouse.ts:63`, `datacube/src/warehouse.ts:85`, `datacube/src/warehouse.ts:86`, `datacube/src/warehouse.ts:191`, `datacube/demo/boot.ts:610`, `datacube/demo/index.html:194`

`signIn` does `fetch(url(baseUrl, '/sql/v1/login'), { method: 'POST', body: JSON.stringify({ user, password }) })`, and `url` is only `base.replace(/\/+$/, '') + path`. boot.ts passes `whUrl.value.trim()` unchecked, and the `<input type=url>` sits in no form, so the browser never validates it. Scenarios: (1) with the field empty or set to `wh.corp.com`, the credentials are POSTed to a relative path on the DataCube static host; (2) `localhost:9090` makes 'localhost' the URL scheme, and the user sees 'URL scheme "localhost" is not supported'; (3) `http://warehouse.corp:9000` on a page served over http (e.g. `serve.mjs --host 0.0.0.0`) sends the password and every later bearer token in clear text, and mixed-content blocking does not apply. The severity stays LOW: this is the documented development sign-in, the relative-path target is the deployer's own host, and an https page would block an http warehouse. Separately, `?warehouse=` pre-fills the field from a link, and a scheme check does not address that.

**Fix:** Parse the value with `new URL()` before sign-in. Require an absolute https: URL, allowing http: only for loopback hosts, and otherwise show 'enter the warehouse address, e.g. https://…'.

### P2-300. pureTypeName has no mapping for the engine's Float4 and unsigned integer types, so such columns count as non-numeric and lose number formatting

*data-semantics · engine plane · reproduced* — `src/engine-remote.ts:86`, `src/engine-remote.ts:116`

The switch has no arms for Float4, UTinyInt, USmallInt, UInt or UBigInt, so `default: return leaf;` passes the raw names through. Upstream maps every relational FLOAT column to `meta::pure::precisePrimitives::Float4` (RelationalCompilerExtension.java:1012). Reproduced with a copy of the function: the full precise-primitive paths come back as 'Float4', 'UInt' and so on. Scenario: an engine store has `price FLOAT`, and the user adds a calculated column `$x.price`. #learnCalcTypes copies 'Float4' onto the column, isNumericType rejects it, numberDefaults returns undefined (so the 2-decimal and negative-parentheses default is lost), and the type-based fallbacks treat it as text.

**Fix:** Add Float4 to the Float arm and UTinyInt, USmallInt, UInt and UBigInt to the Integer arm. Pin every precise primitive in test/engine-remote.test.ts.

### P2-301. The engine demo page offers column pivot on an H2 store, where legend-engine refuses every pivot, so each pivot attempt ends in an error alert

*browser-compat · engine plane* — `demo/main-engine.ts:35`, `demo/main-engine.ts:47`, `demo/main-engine.ts:114`

main-engine.ts runs `trades::h2::RT` against an H2 store (trades-h2.pure: `type: H2`) and passes `showColumnZone: true`. No host capability exists to declare that a plane cannot pivot. The repo's own demo/verify-engine-differential.mjs:35-39 records that a column pivot on the H2 engine fails ('Dialect translation for node of type PivotedRelation not implemented ... H2'), and verify-engine.mjs only runs unpivoted queries. Scenario: on index-engine.html the user drags year into the column-pivot zone, the engine rejects the query, the execution-error alert opens, and the change is rolled back. The failure is loud and confined to a demo configuration, so this is LOW.

**Fix:** Point the engine demo at a store the engine can pivot on (e.g. DuckDB), or add a host capability flag declaring no pivot support that disables the pivot zone and menu entries.

### P2-302. The engine page's status line keeps showing the last error in red after later queries succeed

*error-handling · engine plane* — `demo/main-engine.ts:127`, `demo/main-engine.ts:134`, `demo/boot.ts:491`

onView writes only #pure and #sql, and onStatus is `if (kind !== 'error') return; status.textContent = text; status.classList.add('bad');`. Nothing removes 'bad' or restores the 'engine' label. app.ts #adoptHostStatus re-appends the same node on every render, so the text persists. Scenario: a filter the engine refuses leaves 'Can't find a match for function ...' in red, and every later healthy view still shows it. boot.ts:491-494 already has the recovery for the other planes.

**Fix:** Mirror boot.ts: in onView, clear the 'bad' class and restore the plane label.

### P2-303. Engine query failures record the Pure without the '->from(runtime)' that was actually sent, so the downloaded debug info does not replay

*error-handling · engine plane* — `src/runner.ts:166`, `src/engine-remote.ts:181`, `src/app.ts:2583`

LegendEngineExecutor.execute sends `${pureGrammar}->from(${this.#options.runtime})` and stores it on RemoteExecutionError.pure. RemoteRun.run then does `throw new QueryFailure(error, pureGrammar)` with the runtime-less text, and #reportFailure passes `error.pure` into the alert's Query Code panel and the DEBUG__Query__*.json download. Scenario: an execution fails on the engine page and the user downloads the debug info. Pasting that query into the engine's endpoints fails with a missing-runtime error, which hides the real cause. The effect is on diagnostics only.

**Fix:** When the cause is a RemoteExecutionError, use its `.pure` (the text actually sent) for the QueryFailure's pure.

### P2-304. The demo pages' model fetch does not check response.ok, so a missing model file shows up later as an engine grammar error instead of 'model not found'

*error-handling · engine plane* — `demo/main-engine.ts:86`, `demo/boot.ts:202`

`const model = await (await fetch(MODEL)).text();` (main-engine.ts) and `return (await fetch('./trades.pure')).text();` (boot.ts loadModel, used by main.ts and main-server.ts) never check `response.ok`, and fetch does not throw on a 404. Scenario: trades-h2.pure is not deployed, so the 404 body becomes the model. Startup succeeds, and the first query's grammarToJson/model call fails with a parser error reported as a query failure. The page's 'failed to start: ...' handler is never reached.

**Fix:** Check response.ok after each model fetch and throw a named error (e.g. 'model file not found: <url> (<status>)') so the page's startup catch reports it.

### P2-316. If the DuckDB worker errors, the query queue hangs forever: pending requests are dropped unresolved and there is no timeout

*error-handling · DuckDB & file ingest* — `src/duckdb.ts:415`, `src/duckdb.ts:422`, `src/duckdb.ts:476`

#serialised makes every query wait on the one ahead: `await previous.catch(() => {}); try { return await run(); } finally { release(); }`. The vendored duckdb-wasm's worker onError does `this._pendingRequests.clear()` without rejecting any promise. The query in flight then never settles, release() never runs, and every later execute() waits forever. The grid keeps its 'Fetching data…' overlay, and only a reload recovers. The AbortSignal is never raced against the pending promise, and there is no timeout anywhere. LOW because an uncaught worker error is an unlikely trigger.

**Fix:** Listen for the worker's error event in boot and fail the engine: reject in-flight and future queries with a plain 'the local database stopped; reload' message. And/or race each query against its signal or a timeout.

### P2-317. Uploading a file whose name matches the mounted remote view (e.g. trades.csv under ?remote=) fails with a catalog error

*correctness · DuckDB & file ingest · reproduced* — `src/upload.ts:120`, `src/remote.ts:104`, `demo/boot.ts:276`

ingestFile runs `CREATE OR REPLACE TABLE ${qt} AS SELECT * FROM ${reader}` with qt taken from the file name. In ?remote= mode, boot.ts mounts the source as `CREATE OR REPLACE VIEW "trades"`, and the upload control stays available. Reproduced with real duckdb-wasm: picking trades.csv fails with 'could not open trades.csv: Catalog Error: Existing object trades is of type View, trying to replace with type Table'.

**Fix:** DROP VIEW IF EXISTS before creating the table, or give uploads their own namespace (e.g. an `upload` schema).

### P2-318. A remote URL ending in '/metadata' is detected as Iceberg but passed to iceberg_scan unchanged, so DuckDB looks in '<table>/metadata/metadata/' and the mount fails

*correctness · DuckDB & file ingest* — `src/remote.ts:78`, `src/remote.ts:84`, `src/remote.ts:89`, `test/remote.test.ts:65`

inferFormat returns 'iceberg' for `/\/metadata\/?$/i.test(path)`, but scanExpression strips only '#iceberg' and emits `iceberg_scan('s3://bucket/table/metadata')`. DuckDB's iceberg extension treats a non-.json argument as the table root and appends 'metadata/version-hint.text', so the one URL shape the detection recognises is the one that cannot work. This was confirmed by reading the code and DuckDB's documented path resolution, not executed, because the extension needs a network download.

**Fix:** When the URL ends in /metadata, strip that segment before calling iceberg_scan, or recognise a *.metadata.json file path instead.

### P2-319. The S3 secret has a fixed name and no SCOPE, so a second remote mount silently replaces the first mount's credentials

*state-persistence · DuckDB & file ingest* — `src/remote.ts:111`, `src/remote.ts:134`

credentialStatements always emits `CREATE OR REPLACE SECRET datacube_s3 (...)` with no SCOPE clause, although the doc comment says 'a secret is scoped and replaceable, where the globals ... leak between sources when a cube reads two buckets'. DuckDB resolves the secret when a view is scanned, not when it is created. Scenario: an embedder mounts cube A over bucket-a with keys A, then cube B over bucket-b with keys B. Cube A's views now read with keys B and fail with 403, or read as the wrong principal. The only shipped caller mounts once, hence LOW.

**Fix:** Emit `SCOPE '<bucket prefix>'` derived from each source URL and use a secret name unique to each mount, or document that a tab supports only one credential set.

### P2-322. The WasmPlanner and LegendLitePlanner plan caches are unbounded Maps keyed by full Pure grammar text, so memory grows for the life of the tab

*performance-memory · planner & browser support* — `src/wasm-planner.ts:103`, `src/wasm-planner.ts:347`, `src/wasm-planner.ts:383`, `src/planner.ts:57`, `src/planner.ts:113`

Both planners keep `readonly #cache = new Map<string, string>()` and store every successful plan (`if (useCache) this.#cache.set(pureGrammar, rest);` and `this.#cache.set(pureGrammar, body.sql)`). The only eviction is `this.#cache.clear()` in WasmPlanner.useModel; LegendLitePlanner never evicts at all. Caching is on by default in both demo/main.ts and demo/main-server.ts. Every distinct parent path, filter value, sort or level makes a new key. CubeController.compile plans (depth+1)x2 queries per debounced keystroke in the calc editor. A 2-level cube pivoted on a 500-value key produced 46,940-char grammar per level query (measured). Scenario: a long session that opens hundreds of groups, re-sorts and edits calculated columns keeps every grammar and SQL string, tens of MB or more, in the main-thread heap until the tab closes.

**Fix:** Bound both caches as a small LRU (a few hundred entries); re-issued scroll queries need only recent entries.

### P2-323. When the planner worker script fails to load (404, CSP, MIME), the error reads 'the planner worker died: undefined'

*error-handling · planner & browser support* — `src/wasm-planner.ts:137`, `src/wasm-planner.ts:141`

`w.onerror = (e: ErrorEvent) => { const dead = new PlannerUnavailableError(`the planner worker died: ${e.message}`); ...`. Only the TypeScript annotation claims this is an ErrorEvent. Per the HTML "run a worker" algorithm, a failed script fetch or parse fires a plain Event named error, which has no `message`. Scenario: a deployment misroutes planner-worker.js, or a CSP blocks it. warmUp rejects with "the planner worker died: undefined", which names neither the URL nor the fix. The #load path, by contrast, names both.

**Fix:** Build the message from `this.#options.workerUrl`, using `e instanceof ErrorEvent ? e.message : 'could not load the worker script'`, and route it through the same classified, user-facing failure message as the exnref/GC check.

### P2-324. End users see developer build instructions ('run `bazel build //datacube:site`') and raw proxy HTML as error text

*error-handling · planner & browser support* — `src/wasm-planner.ts:228`, `src/wasm-planner.ts:260`, `src/warehouse.ts:76`, `src/engine-remote.ts:259`, `src/engine-remote.ts:281`

wasm-planner.ts throws `could not load the planner runtime from ${runtimeUrl} — run \`bazel build //datacube:site\``, and line 260 appends the same hint when a load looks like a 404. The worker path forwards cause.message unchanged, so the hint survives. warehouse.ts:76 returns `HTTP ${r.status}${text ? `: ${text.slice(0, 200)}` : ''}`, and engine-remote.ts:281 does `raw.replace(/\s+/g, ' ').slice(0, 200)`. app.ts puts error.message straight into the status line. Scenario: a reverse proxy returns 502, and the analyst's status bar shows "HTTP 502: <html><head><title>502 Bad Gateway</title>…". A production deploy missing a vendor asset tells the analyst to run a bazel command.

**Fix:** Keep build hints and raw bodies in the debug log only. Show a plain message such as "the service is unavailable (HTTP 502)", and strip markup from non-JSON bodies before display.

### P2-325. `signDisplay: 'negative'` throws RangeError on pre-NumberFormat-v3 browsers (Gecko <116 incl. 115 ESR, Chromium <106, WebKit <15.4), so no numeric cell renders

*browser-compat · planner & browser support* — `src/format.ts:228`, `src/format.ts:236`, `src/format.ts:246`, `src/grid/grid.ts:1189`

The currency, percent and number cases all construct `new Intl.NumberFormat(locale, { ..., signDisplay: 'negative', ... })` with no feature test. DEFAULT_FORMAT is `{ kind: 'auto' }`, which routes numbers to 'number', so every numeric cell reaches this through grid.ts:1189 with no guard. The text and PDF exports reach it the same way. Before Intl.NumberFormat v3, GetOption throws RangeError for any value outside auto/never/always/exceptZero. Scenario: a Gecko 115 ESR user opens index-engine.html or index-server.html. Those pages do not need the WASM planner, and nothing else rules that browser out. The first numeric cell throws and the grid never shows figures. The affected browsers are 3-4 years old, so this is LOW.

**Fix:** Feature-test 'negative' once, fall back to 'auto', and normalise a rounded '-0' by hand. Alternatively, declare a browser floor and check it at boot.

### P2-326. On WebKit 15.4-15.6, AbortSignal.timeout throws inside the health-check try, so a running engine or legend-lite server is reported as absent

*browser-compat · planner & browser support* — `demo/main-engine.ts:76`, `demo/main-server.ts:55`

main-engine.ts runs `fetch(`${legendEngine}/api/server/v1/info`, { signal: AbortSignal.timeout(2500) })` inside a try whose bare catch shows the 'enginemissing' banner and "no engine on ...". main-server.ts:55 does the same with a 1500 ms timeout inside `try { … } catch { reachable = false; }`. AbortSignal.timeout ships in WebKit 16, while the pages' other requirements are met by WebKit 15.4. The TypeError is swallowed as "unreachable". Scenario: on macOS Catalina, whose newest WebKit is 15.6, the server page says legend-lite is not running and to start it with `bazel run //core:server`, even though the server is up.

**Fix:** Use an AbortController with setTimeout, or catch the TypeError separately and report the real cause.

### P2-327. The <link rel=preload> for the 4.2 MB classes.wasm is never used because the worker fetches the file again, so startup pays a second request

*performance-memory · planner & browser support* — `demo/index.html:16`, `src/planner-worker.ts:51`

index.html preloads `<link rel="preload" as="fetch" type="application/wasm" href="./vendor/classes.wasm" crossorigin>`. demo/main.ts passes workerUrl, so the module loads only inside the worker (`runtime.load(`${base}classes.wasm`)` → TeaVM's `fetch` + `compileStreaming`), and a document's preload cache is not visible to a worker. Every Chromium load measured recorded 2 requests for classes.wasm, along with Chromium's "preloaded ... but not used within a few seconds" warning. On a host that sends no validators or Cache-Control, the module downloads twice, about 1.46 MB gzip extra. With serve.mjs's no-cache plus Last-Modified, the second request is a revalidation round trip.

**Fix:** Drop the preload, or serve the file under an immutable hashed name so the worker's fetch hits the HTTP cache. Alternatively, fetch or compile on the main thread and transfer the bytes or Module to the worker.

### P2-330. Concurrent file opens have no ordering guard, so a slower file picked earlier can replace the one the user picked last

*async-concurrency · demo host & boot* — `demo/boot.ts:673`, `demo/boot.ts:754`, `demo/boot.ts:785`

`async function openFile(file) { const opened = await ingestFile(engine, db, file); useModel(opened.model, opened.runtime); app.dispose(); app = makeApp(...); await app.open(); ... }` has no generation token. The file input (785-788) and the sample Open button (754) call it with `void`, and neither control is disabled while a load is running. Scenario: the user picks a large CSV by mistake, then picks the right small file straight away. The small file opens first. Then the large ingest resolves, useModel repoints the planner under the small cube (whose open may then fail with `unknown table`), and the large file's cube replaces it. The note then names the large file, so the user can see what happened, but the last pick does not win.

**Fix:** Take an incrementing sequence number at the start of openFile, and after each await return early if a newer open has started, before useModel, dispose or makeApp. Optionally disable the picker and Open while a load is in flight.

### P2-332. On the engine page, 'Generated Pure & SQL…' opens its window below the viewport, where it cannot be seen or scrolled to

*correctness · demo host & boot* — `demo/main-engine.ts:121`, `demo/index-engine.html:78`, `demo/index-engine.html:27`

The engine page's handler only toggles the flag: `const win = must('querywin'); win.hidden = !win.hidden;`. Unlike boot.ts toggleHostWindow, it never calls makeWindow, so no left/top/width/height are set. `.hostwin { position: absolute }` has no insets, and the body is `overflow: hidden`, so the window sits at its static position after the 100vh #app. Measured at 1280x800, the rect was `{top: 800, left: 0, w: 160, h: 139}`, entirely below the fold, so the menu item seems to do nothing and the engine's SQL cannot be reached.

**Fix:** Export toggleHostWindow from boot.ts and use it here, so the window goes through makeWindow like the other host windows. Alternatively, give .hostwin default insets.

### P2-333. Status line names the wrong data source after switching sources ('live on the warehouse' over a local file, 'local' over a warehouse cube)

*correctness · demo host & boot* — `demo/boot.ts:664`, `demo/boot.ts:673`, `demo/boot.ts:491`

Opening a warehouse table sets `status.textContent = `live on the warehouse as ...``, but openFile never rewrites `status`, and makeApp re-adopts the node with its old text. The recovery branch in onView, `if (status.classList.contains('bad')) { status.classList.remove('bad'); status.textContent = label; }`, restores the boot planner's word 'local' whatever the current source is. Scenario: sign in and open main.sales, then open trades.csv. The grid shows the local file while the bar still says 'live on the warehouse as alice'. Or a warehouse query errors and then recovers, and the bar says 'local' while every query still runs on the warehouse.

**Fix:** Keep one per-app 'source text' variable, set when makeApp is called (the planner label, the warehouse principal, or the file name). Write it on each rebuild, including openFile, and restore it on recovery.

### P2-334. A failed warehouse re-sign-in keeps the previous user's table list, which Open then pairs with the new session

*async-concurrency · demo host & boot* — `demo/boot.ts:610`, `demo/boot.ts:617`, `demo/boot.ts:634`

Connect assigns `session = await signIn(...)` before `objects = await listObjects(session)`. If listObjects throws, the catch only calls `say(...)`, so `objects`, whTable and whOpen keep the earlier listing. whOpen then does `objects[Number(whTable.value)]` with the new `session`. Scenario: alice is signed in with her tables listed, bob signs in successfully, and the catalog call then fails with a 5xx. The picker still offers alice's tables, and Open builds a live cube on one of them as bob. It fails at the first query or shows bob's view of the table. Connect and Open are not disabled while either await is in flight.

**Fix:** On Connect, clear `objects` and hide whTable/whOpen first, and assign `session` only after the catalog loads (use a local variable until then). Disable Connect/Open while a request is in flight.

### P2-335. A planner failure is logged as two extra unhandled rejections, and a missing model file is compiled as Pure text

*error-handling · demo host & boot* — `demo/boot.ts:224`, `demo/main.ts:67`, `demo/boot.ts:202`, `demo/main-engine.ts:86`

`void engineReady.then(() => performance.mark('dc:planner-ready'));` creates a derived promise with no handler. The later `engineReady.catch(() => {})` covers only the original promise, so a planner failure surfaces as 'Uncaught (in promise)'. main.ts's catch then does `throw e;`, which produces a second one. `return (await fetch('./trades.pure')).text();` and `await (await fetch(MODEL)).text()` never check `r.ok`. When trades-h2.pure is missing (for example on the engine page served from dist), the 404 body goes to the planner or engine as the model, and the user sees a Pure parse error instead of 'model file missing'.

**Fix:** Write `engineReady.then(mark, () => {})` and drop the rethrow in main.ts. Check `r.ok` in both model fetches and throw an error that names the missing file.

### P2-336. Each reopen of a host window stacks another header drag listener and eight more resize grips

*performance-memory · demo host & boot* — `demo/boot.ts:811`, `src/ui/window.ts:156`, `src/ui/window.ts:194`

toggleHostWindow calls `makeWindow(el, head, document.body, {...})` every time the window is shown. Each call adds a new 'pointerdown' listener to the header and appends one grip div per EDGES entry (n, s, e, w, ne, nw, se, sw), and nothing removes the earlier ones. After opening and closing the Data window 20 times, it holds 160 grips and 20 header handlers, and every drag runs all 20 handlers, each with its own stale `spec`. Position stays correct only because the last handler wins. DOM nodes and listeners grow without bound over a session.

**Fix:** Call makeWindow once per host window, on first show, and afterwards only toggle `hidden`. Alternatively, have makeWindow return a disposer and call it before rebuilding.

### P2-337. Choosing a plane from the menu navigates away at once, losing an opened file, the warehouse session and unsaved layout

*state-persistence · demo host & boot* — `demo/boot.ts:102`, `demo/boot.ts:443`

goToPlane does `location.href = found.page; return true;`, called from onHostMenu with no confirmation. There is no beforeunload handler in src or demo, and the query string (`?remote=`, `?legendLite=`, `?engine=`) is not carried over. Scenario: a user opens a 200k-row file, builds a pivot, and picks 'Plan remote' expecting to re-plan the same cube. The page is replaced, and the uploaded data (held only in this tab's DuckDB), the warehouse token and the layout are gone.

**Fix:** Ask for confirmation before navigating when the cube holds user work (an opened file, a warehouse session, or changes since the last Save View), and carry the current query string over to the target page.

### P2-338. Duplicated DEMO_DIMENSIONS, a stale entry-point comment, and HTML shells that claim to be generated but are hand-copied

*maintainability · demo host & boot* — `demo/boot.ts:136`, `demo/boot.ts:366`, `demo/boot.ts:185`, `demo/index-server.html:147`, `demo/index-engine.html:146`

boot.ts:366-369 declares a local `const DEMO_DIMENSIONS` that shadows the exported one at 136-142 with the same contents. An edit to the export changes the engine page but not the local and server pages. The MakePlanner doc says '`main.ts` the server, and `main-wasm.ts` the in-browser build', but main-wasm.ts does not exist and main.ts is the in-browser entry point. index-server.html and index-engine.html say they are generated from index.html 'so the three shells cannot drift', yet no generator or diff test exists, so a shell fix (like the #offstage problem above) can miss two of the three pages. The plane labels also hard-code ':8080' and ':6300' while the real addresses come from config.json or the URL.

**Fix:** Delete the local copy and use the export. Correct the comment. Generate the variant shells from index.html in the Bazel build, or add a test that diffs them. Build the plane labels from pageConfig.

### P2-344. Dev server Range handling is wrong at the edges: suffix ranges return the start of the file, and ranges past EOF are NUL-padded as 206 instead of 416

*correctness · security & dev server · reproduced* — `demo/serve.mjs:78`, `demo/serve.mjs:89-99`

`const start = m[1] ? Number(m[1]) : 0; const end = m[2] ? Number(m[2]) : size - 1; const len = Math.max(0, end - start + 1); ... Buffer.alloc(len)` has no suffix-range handling, never clamps end to size-1, and never answers 416. Reproduced on a 106-byte file: `bytes=-10` returned the first 11 bytes labelled `bytes 0-10/106`, `bytes=100-200` returned 101 bytes of which 95 are NUL, and `bytes=106-` returned `Content-Range: bytes 106-105/106`. Because end is unbounded, `Range: bytes=0-3000000000` on /demo/index.html allocates about 3 GB of zeros and sends it as a 206. A client reading a Parquet footer by suffix would get the header bytes instead.

**Fix:** Parse `bytes=-N` as size-N..size-1, clamp end to size-1, and return 416 with `Content-Range: bytes */size` when start >= size or start > end.

### P2-345. The shipped pages log every SQL statement to the browser console, including filter values and any CREATE SECRET carrying an S3 key

*security · security & dev server* — `demo/boot.ts:254`, `demo/remote-harness.ts:37`, `src/remote.ts:134`, `src/remote.ts:146`

boot.ts:254 builds `new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(), worker)`. In the bundled duckdb-wasm, ConsoleLogger defaults to INFO (`constructor(e=2){this.level=e}log(e){e.level>=this.level&&console.log(e)}`), and both query() and send() log `{level:2, ..., value: <sql text>}` before running. Every grid query, with the user's filter literals, is kept in DevTools and in any console-capturing telemetry. If an embedder follows README-realdata.md:84 and passes `s3` credentials to mountRemote, the `CREATE OR REPLACE SECRET datacube_s3 (... SECRET '...')` built at remote.ts:134 is printed in clear before it runs. redactSecrets (remote.ts:146) only covers thrown errors. boot.ts itself passes no s3 today, so the key leak needs an embedder.

**Fix:** Use `new duckdb.VoidLogger()` in the shipped boot, as stress.ts and the verify harnesses already do, or a ConsoleLogger at WARNING level. Keep the verbose logger behind a debug flag.

### P2-346. `serve --data` works only for files named exactly *.csv or *.parquet; .json, .jsonl, .CSV and .csv.gz are read as Parquet and the page stays blank

*correctness · security & dev server* — `demo/serve.mjs:109`, `demo/serve.mjs:144-146`, `demo/boot.ts:280`, `src/remote.ts:73-80`

serve.mjs:144-145 `const fmt = extname(dataPath) === '.csv' ? 'csv' : extname(dataPath) === '.json' ? 'json' : 'parquet'` compares case-sensitively and sends an explicit format. boot.ts:280 passes on only parquet, csv or iceberg, so `json` is dropped and inferFormat falls through to `return 'parquet'`. For `TRADES.CSV` the explicit `format=parquet` overrides inferFormat's case-insensitive `/\.csv(\.gz)?$/i`. `x.csv.gz` is routed as `/data.gz` with format=parquet. Scenario: `bazel run //datacube:serve -- --data ~/trades.json` makes the page run `read_parquet('http://localhost:8000/data.json')`, DuckDB rejects the file, and the page stays blank, although the in-page upload accepts the same file.

**Fix:** Derive the format with the same case-insensitive rule as remote.ts inferFormat, keep the full compound extension in the route, and either add a JSON RemoteFormat (read_json_auto) or reject unsupported extensions at the command line with a clear message.

### P2-347. The chaos, shots and verify-remote harnesses serve the whole datacube/ tree on every network interface at fixed ports, and verify-remote adds ACAO *

*security · security & dev server* — `demo/chaos.mjs:87`, `demo/shots.mjs:52`, `demo/verify-remote.mjs:148`, `demo/verify-remote.mjs:100`

Each harness calls `server.listen(PORT, r)` with no host, which binds all interfaces: chaos on 8734, shots on 8732, verify-remote on 8741. servedPath only blocks paths that climb out of the root, so all of datacube/ is readable. verify-remote.mjs:100 also sets `'Access-Control-Allow-Origin': '*'` on every response. serve.mjs:40-52 moved to loopback for exactly this reason. Scenario: while `bazel run //datacube:verify_remote` runs on shared Wi-Fi, any host can fetch http://<laptop>:8741/src/..., and any page open in the developer's browser can read the same files cross-origin. A second concurrent run fails with EADDRINUSE.

**Fix:** Use `listen(0, '127.0.0.1')` and build URLs from `server.address().port`, as the other harnesses do. Drop ACAO * or restrict it to the harness origin.

### P2-348. `serve --open` never opens a browser on Windows, and says nothing about it, because `start` is a cmd builtin, not an executable

*build-deploy · security & dev server* — `demo/serve.mjs:161-165`

`const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open'; try { execFileSync(opener, [url]); } catch { /* not fatal */ }`. execFileSync does not spawn a shell, and there is no start.exe, so on Windows the spawn fails with ENOENT. The empty catch swallows the error, so `bazel run //datacube:serve -- --open` opens nothing and prints no reason. This was found by reading the code; it was not run on Windows.

**Fix:** On win32 call `execFileSync('cmd', ['/c', 'start', '', url])`, and print the URL with a note when opening fails.

### P2-351. dist/index.html links fonts.css, but make-dist ships neither fonts.css nor vendor/fonts, so a deployed page 404s its font and falls back to system fonts

*build-deploy · build & deploy · reproduced* — `datacube/demo/make-dist.mjs:29`, `datacube/demo/make-dist.mjs:41`, `datacube/demo/index.html:11`, `datacube/demo/fonts.css:10`, `datacube/BUILD.bazel:298`

make-dist copies a fixed list (`['bundle.js', 'planner-worker.js', 'trades.pure']` plus six vendor runtimes) and inlines only links that match `/<link rel="stylesheet" href="\.\.\/([^"]+)">/g`. So `<link rel="stylesheet" href="fonts.css">` (index.html:11) survives into dist, which contains no fonts.css and no vendor/fonts. The woff2 files are staged only into the site tree by the :vendor rule. Measured by serving dist in Chromium: `[http 404] /fonts.css` and `document.fonts.size === 0`. The grid renders in ui-sans-serif/system-ui, which index.html:7-9 says changes how things line up. The effect is visual only: no wrong data and no broken flow.

**Fix:** Copy fonts.css and vendor/fonts/* into dist, or inline fonts.css with its url()s rewritten. Better, derive the copy list from what index.html references and fail the build when a reference is missing.

### P2-352. The shipped page's plane menu offers 'Plan remote' and 'Run on the engine', which navigate to pages dist does not contain (404, losing the open cube)

*build-deploy · build & deploy · reproduced* — `datacube/demo/boot.ts:89`, `datacube/demo/boot.ts:102`, `datacube/demo/boot.ts:431`, `datacube/demo/make-dist.mjs:29`

boot() puts `...planeMenu()` into the hamburger menu (boot.ts:431). planeMenu lists every PLANES entry and disables only the current one, so on index.html the index-server.html and index-engine.html entries are enabled. goToPlane runs `location.href = found.page` (boot.ts:102). make-dist ships neither page nor bundle-server.js/bundle-engine.js. Scenario: a user of a deployed dist picks 'Plan remote' and lands on a 404, losing the cube they built. Impact is limited because both planes also need a local server (:8080 or :6300) that a static deployment would not have anyway.

**Fix:** Either ship the other plane pages and bundles in dist, or leave plane entries out of the menu when their page is not deployed (for example, driven by a build-time or config.json list).

### P2-353. dist redistributes Apache-2.0 Arrow/flatbuffers and MIT DuckDB-WASM with no licence or NOTICE text, and package.json says ISC while the README says Apache 2.0

*licensing · build & deploy · reproduced* — `datacube/demo/make-dist.mjs:29`, `datacube/BUILD.bazel:357`, `datacube/package.json:11`, `README.md:449`

The built bundle.js inlines 120 apache-arrow@17.0.0 modules and 5 flatbuffers modules. A grep of bundle.js, planner-worker.js and vendor/wasm-gc-module-runtime.js for Copyright/@license/SPDX finds 0 hits. make-dist copies no LICENSE, NOTICE or third-party notices file, although apache-arrow ships NOTICE.txt and LICENSE.txt. package.json:11 has `"license": "ISC"`, README.md:449-451 says Apache 2.0, and the repo has no LICENSE file. Scenario: an organisation deploys dist as the README describes and so redistributes Arrow without the Apache-2.0 §4(a)/(d) licence and NOTICE, and a licence scan reports ISC. (The Roboto/OFL part of the original claim does not apply, because dist does not ship the font files.) Nothing goes wrong at runtime.

**Fix:** Generate a THIRD_PARTY_NOTICES file at build time from the resolved packages (Arrow LICENSE and NOTICE, flatbuffers, tslib, the DuckDB-WASM MIT notice, TeaVM) and copy it into dist, or use esbuild `--legal-comments=linked`. Set package.json's license to match the project, and add a LICENSE file.

### P2-354. The esbuild bundles embed Bazel output-tree paths, including the configuration name, in per-module comments, so bundle bytes differ by platform and -c mode

*build-reproducibility · build & deploy · reproduced* — `datacube/BUILD.bazel:281`

The esbuild action passes only `--bundle --format=esm --target=es2022 --log-level=warning --outfile`, with no minify, `--legal-comments` or sourcemap flag. The output carries comments such as `// ../../../../../../../../../execroot/_main/bazel-out/darwin_arm64-fastbuild/bin/datacube/src/wasm-planner.ts`: 193 in bundle.js, 192 in bundle-server.js, 57 in bundle-engine.js and 1 in planner-worker.js. Scenario: the same commit built as k8-fastbuild or darwin_arm64-opt produces a different bundle.js, so a shipped artifact cannot be checked byte for byte by rebuilding it elsewhere. The paths are relative and reveal no username. Cross-platform cache hits are not lost because of this, since those configurations already have different action keys.

**Fix:** Minify with an external sourcemap, or at least pass `--legal-comments=none` and minify whitespace, so the output does not depend on the output-base layout or configuration.

### P2-355. The in-tab query engine is a DuckDB-WASM -dev prerelease declared with a caret range, unlike every other runtime dependency

*dependencies · build & deploy* — `datacube/package.json:16`, `datacube/pnpm-lock.yaml:11`, `datacube/BUILD.bazel:26`

package.json declares `"@duckdb/duckdb-wasm": "^1.33.1-dev57.0"`, while `"@fontsource/roboto": "5.3.0"` and `"apache-arrow": "17.0.0"` are exact. BUILD.bazel:26-27 relies on duckdb-wasm and the app sharing Arrow 17.0.0 so the bundle holds one copy. Scenario: a `pnpm update` or re-resolve moves the caret to a later 1.x release that depends on a different apache-arrow, and the bundle then carries two Arrow copies. Exposure is small today: rules_js installs strictly from the lock, and `pnpm install --lockfile-only` keeps a satisfying entry. Nothing records why a -dev build is used.

**Fix:** Pin the exact version (`"1.33.1-dev57.0"`, no caret), and either move to a stable release or record why this dev build is required.

### P2-356. The vendored DuckDB workers reference source maps that are never shipped, so DevTools and log monitors see 404s

*build-deploy · build & deploy · reproduced* — `datacube/BUILD.bazel:311`, `datacube/BUILD.bazel:312`

include_srcs_patterns copies `**/dist/duckdb-browser-mvp.worker.js` and `**/dist/duckdb-browser-eh.worker.js` but no .map files. Both workers end with `//# sourceMappingURL=duckdb-browser-{eh,mvp}.worker.js.map`, and the npm package contains only the eh map. Scenario: anyone who opens DevTools on the site or dist gets failed requests for vendor/duckdb-browser-*.worker.js.map, which is noise when diagnosing a real worker failure.

**Fix:** Copy duckdb-browser-eh.worker.js.map alongside the worker, or strip the sourceMappingURL line when vendoring (it has to be stripped for mvp, which has no map).

### P2-357. The production dist page is the demo: it is titled 'DataCube demo' and generates 200,000 synthetic trades rows on every load

*product · build & deploy* — `datacube/demo/index.html:6`, `datacube/demo/boot.ts:42`, `datacube/demo/boot.ts:292`, `datacube/demo/make-dist.mjs:29`

make-dist writes demo/index.html unchanged apart from the CSS, so dist keeps `<title>DataCube demo</title>`. It also ships trades.pure as the model. Without `?remote=`, boot() always runs `status.textContent = `generating ${ROWS.toLocaleString()} rows…`` with `const ROWS = 200_000;`, and no config switch skips this. Scenario: a real user opens the deployed dist, sees a tab called 'DataCube demo', and waits while DuckDB builds a synthetic table before they can load their own data. This costs startup time and looks unfinished, but it produces no wrong results.

**Fix:** Give dist a product entry page, or a config switch, that starts empty (or on the configured warehouse) and has a real title. Keep the generated-data page for the demo site only.

### P2-358. The bench README says to run `npm install` and plain node, which bypasses the pnpm lock and Bazel and can benchmark a different DuckDB-WASM build

*build-deploy · build & deploy* — `datacube/bench/README.md:104`

The README's Running section says `npm install`, then `node bench/wasm-penalty.mjs [rows]`, snap-ceiling.mjs and cell-budget.mjs. The package is locked by pnpm-lock.yaml (`'@duckdb/duckdb-wasm@1.33.1-dev57.0'`), there is no bench target in BUILD.bazel, and bench/model/*.py import a Python `duckdb` module the repo does not provide. Scenario: npm ignores the pnpm lock and resolves the caret range `^1.33.1-dev57.0` to a newer duckdb-wasm, and it writes a package-lock.json into the tree. The penalty numbers are then measured against a different engine than the one the product ships.

**Fix:** Add js_binary targets for the three bench scripts that depend on `:node_modules/@duckdb/duckdb-wasm`, and document `bazel run //datacube:bench_*` in place of npm.

### P2-362. Every browser harness drives Chromium only, so nothing exercises Gecko or WebKit

*test-gap · browser harnesses · reproduced* — `demo/verify-wasm-browser.mjs:19`, `demo/verify-wasm-browser.mjs:59`, `demo/verify-smoke.mjs:25`, `demo/verify-smoke.mjs:82`, `BUILD.bazel:366`

All 11 Playwright harnesses import only `chromium` (`import { chromium } from 'playwright'`), and grepping demo/, test/, BUILD.bazel and package.json for firefox or webkit finds nothing. Engine-specific failures therefore pass every existing check. Scenario: the exnref floor, the `signDisplay:'negative'` RangeError, the JSC 65,536-argument cap and the missing iOS contextmenu each break the app in one browser engine and are invisible to a Chromium-only suite.

**Fix:** Run at least verify-smoke under Playwright's firefox and webkit projects, pinned at the minimum supported versions, as a CI target (together with the gate lane above).

### P2-363. If an export check fails before its download arrives, the unawaited download wait later crashes the whole feature sweep

*error-handling · browser harnesses · reproduced* — `demo/verify-features.mjs:1592`, `demo/verify-features.mjs:1633`

`const wait = page.waitForEvent('download', { timeout: 15_000 }); await menu(['Export', label], { requery: false }); if (ext !== 'json') await answerExport('Accept'); const dl = await wait;` The Email check at 1633-1636 uses the same pattern. When `menu()` or `answerExport()` throws, check() records BAD, but nothing awaits `wait` or attaches a handler to it, and there is no unhandledRejection handler. Scenario: an export entry is renamed, so menu() throws. 15 s later the orphaned wait rejects, Node exits with code 1 mid-sweep, the ~150 remaining checks never run and the BROKEN summary is never printed (reproduced with the same Playwright build).

**Fix:** Attach a handler when creating the waiter (`wait.catch(() => {})`), or use `Promise.all([page.waitForEvent('download'), action()])` so both settle together.

### P2-364. 'every editor tab shows a panel' always passes, because check() closes the Properties window before the body runs and it iterates zero tabs

*test-gap · browser harnesses* — `demo/verify-features.mjs:1681`, `demo/verify-features.mjs:182`, `demo/verify-features.mjs:125`, `src/app.ts:2807`

The check counts `.dc-app-overlay [role=tab], .dc-tab` and relies on the window left open by the previous check. But check() calls `reset()` first, which clicks every `.dc-app-overlay:not([hidden]) .dc-overlay-close`, and `#closeWindow` does `win.remove()`. No element has class `dc-tab` in src. Scenario: every run reaches the check with no overlay open, `n === 0`, the loop never runs, and it records 'ok — 0 tabs, all populated', even if every Properties tab rendered blank. The fallback `panel?.querySelector('[role=tabpanel], .dc-tab-body') ?? panel` would also measure the whole overlay, tab labels included.

**Fix:** Open the editor inside the check (`menu(['Properties...'])`), assert `n >= 3`, and measure only the `[role=tabpanel]` of the visible Properties window.

### P2-365. 'a calculated column survives a PIVOTED, grouped cube' never groups or pivots, so the combination it names is untested

*test-gap · browser harnesses* — `demo/verify-features.mjs:2695`, `demo/verify-features.mjs:2437`, `demo/verify-features.mjs:2844`

The body is only `addCalc(0, 'uplift', '$x.notional * 1.1'); settle(); closeCalc();` followed by a Binder Error check and a column check. There is no Vertical or Horizontal Pivot call, and the preceding calc checks end in `clearCalcs()`, which calls `flatten()`. So the cube is flat when the check starts. Scenario: a regression that brings back the Binder Error for a calculated column in a grouped, pivoted cube (the defect named in the check's own comment) passes. 'a column pivot carries calculated measures' (2844) pivots but does not group, so grouped plus pivoted plus calc is covered nowhere.

**Fix:** Group by region and pivot on year through the menu before adding `uplift`, then assert no error status and that the pivoted `…__|__uplift` columns are in the grid.

### P2-366. The long-run panel reorder check passes when the drag does nothing

*test-gap · browser harnesses* — `demo/verify-features.mjs:3296`, `demo/verify-features.mjs:3325`, `demo/verify-features.mjs:3858`

After the drag, the only assertion is `if (panel.join(',') !== shown.join(',')) throw ...` (panel order equals grid order). `before` is used only to pick `last` and the drop target, yet the check returns `${last} moved and the grid followed`. The fresh-cube twin at 3858 does assert `after[0] !== last`. Scenario: the long-run anomaly this check exists for makes the drop handler ignore the drop, or the config write never lands. Panel and grid keep the same old order, and the check passes and prints that the column moved.

**Fix:** Before comparing panel and grid, assert `(await listed())[0] === last`, as the fresh-cube check does.

### P2-367. The ad hoc POV check accepts an unchanged figure, so a POV that never reaches the query passes

*test-gap · browser harnesses* — `demo/verify-features.mjs:4744`, `demo/verify-features.mjs:4629`, `src/adhoc/session.ts:107`

The assertion is `if (!(Number(b.first[0]) <= Number(a.first[0]) || b.first[0] === null)) throw ...`, and `changed(was)` resolves as soon as `session.grid` changes; `session.apply` sets the new grid, carrying the POV, before it queries. Scenario: Member Selection updates `session.grid.pov` and the chip, but the query generator drops the POV filter. Then `b.first[0] === a.first[0]`, `<=` holds, and the check passes as 'a POV member … narrows every cell' while every cell shows the unfiltered total. It also inspects only one cell.

**Fix:** Require a strict change for a proper child member (`!close(b.first[0], a.first[0])`), or better, compare against an independent query filtered to that member.

### P2-368. burger(), flatten() and many bare settle() calls are fixed 150 ms sleeps after actions that re-query, so slow machines read the old grid

*async-concurrency · browser harnesses* — `demo/verify-features.mjs:455`, `demo/verify-features.mjs:281`, `demo/verify-features.mjs:1791`, `demo/verify-features.mjs:1019`, `demo/verify-features.mjs:1579`, `demo/verify-features.mjs:1961`, `demo/verify-features.mjs:3913`, `demo/verify-features.mjs:4028`, `demo/verify-features.mjs:4043`, `demo/verify-features.mjs:4069`, `demo/verify-features.mjs:4105`, `demo/verify-features.mjs:4137`

`burger()` ends with a bare `await settle()`, and settle() without a `before` baseline is just `page.waitForTimeout(150)`. flatten() passes `{ requery: false }` for Clear All pivots, although the menu() doc says requery:false is 'only ever a speed hint … never correctness'. Scenario: on a loaded CI machine, Undo, Redo, Load View, a pivot-column untick or a header drag takes longer than 150 ms through the planner worker and DuckDB, so 'undo restores everything after …' (1961) or 'unticking one pivot column …' (4029/4044) reads the pre-query DOM and reports a working feature broken. The file records this failure mode itself at 250-264 and 3847-3850.

**Fix:** Capture `statusNow()` before every action that can re-query (in burger(), flatten() and the tick/drag sites) and pass it to settle(), or wait on a per-view counter such as `window.__dataCubeViews`.

### P2-369. The pnl comparisons drop the sign of negatives shown in parentheses, so a sign flip goes undetected

*test-gap · browser harnesses* — `demo/verify-features.mjs:1366`, `demo/verify-features.mjs:1306`, `demo/verify-features.mjs:2500`, `demo/verify-features.mjs:2559`, `src/config.ts:529`, `src/format.ts:308`

Cells are parsed with `Number((c.textContent ?? '').replace(/[^0-9.-]/g, ''))`, and negatives render as `($1,142,310)` (MONEY and numberDefaults both use `negativeParens: true`). The strip removes the parentheses and keeps the digits. Scenario: EMEA's grouped pnl is −1,142,309.83. If 'Exclude Column pnl from Horizontal Pivot' showed +1,142,309.83, both `got` and `want` parse to 1142309.83 and 'a measure kept out of the pivot shows its real figure' passes. The file already has `isNegativeText` for this.

**Fix:** Use one shared `parseShown(text)` helper that treats `^\(.*\)$` as negative before stripping, for every numeric read.

### P2-370. Export and clipboard checks assert only a non-empty body and the file extension, not the contents

*test-gap · browser harnesses* — `demo/verify-features.mjs:1599`, `demo/verify-features.mjs:1665`

For CSV, spreadsheet, HTML, Text, PDF and JSON the checks are `if (!body.length) throw` and `name.endsWith(`.${ext}`)`; the clipboard check is `if (!text || !text.trim()) throw`. The file header says a check asserts 'the file that came down'. Scenario: a CSV export containing only the header row, only the ~30 rendered (virtualised) rows of a 5,000-row result, or the `Smith, "Big" Fund` book value unquoted passes 'export CSV (Grid)'. A column copy that yields only the header name passes 'copy a column to the clipboard'.

**Fix:** Parse the CSV and JSON bodies and assert the header list and row count match the cube and that the quoted book value round-trips; assert the clipboard's line count equals the result row count plus one.

### P2-371. freshCube() looks for load errors in #status, but file-open failures go to #uploadnote, so a bad DATA file hangs 90 s with no reason given

*error-handling · browser harnesses* — `demo/verify-features.mjs:489`, `demo/boot.ts:711`

The wait's error branch is `/could not|error/i.test(document.getElementById('status')?.textContent ?? '')`, but boot.ts openFile's catch does `note.classList.add('bad'); note.textContent = `could not open ${file.name}: …`` with `note = must('uploadnote')`. Scenario: running with `DATA=/abs/bad.csv` that DuckDB cannot ingest, the error branch never matches, freshCube waits the full 90 s, and the run ends with 'page.waitForFunction: Timeout 90000ms exceeded' without saying why the file failed. Inside checks, the 30 s deadline fires first and the failure is reported as a hang.

**Fix:** Watch #uploadnote (or its `bad` class) and, when it fires, throw an error carrying its text.

### P2-372. A check that hits the 30 s deadline keeps running and drives the page during later checks

*async-concurrency · browser harnesses · reproduced* — `demo/verify-features.mjs:186`

check() does `await Promise.race([fn(), new Promise((_, reject) => setTimeout(() => reject(...), CHECK_DEADLINE_MS))])`; the losing `fn()` is never cancelled and the timer is never cleared. Helpers wait longer than the deadline: freshCube waits up to 90 s and then calls `page.goto` and `setInputFiles`, and compiledCheck waits 15 s. Scenario: a check blocked in freshCube is declared a hang at 30 s. The next check runs reset() and starts clicking while the orphan later reloads the page, so failures and page errors are attributed to checks that did nothing wrong.

**Fix:** Pass an AbortSignal or generation token into each check and have the helpers bail out when it is stale, or after a deadline reload the page and let the orphan settle before continuing.

### P2-373. The 'Decimals' and 'Display commas' control checks pass when the pnl cells are missing

*test-gap · browser harnesses · reproduced* — `demo/verify-features.mjs:4566`, `demo/verify-features.mjs:4573`, `demo/verify-features.mjs:4409`

The expectations are `a.texts.every((t) => !/\.\d/.test(t ?? ''))` and `a.texts.every((t) => !/,/.test(t ?? ''))`. `look()` returns null for a row with no pnl cell and an empty array for no rows, and both predicates return true for all-null and for empty input (confirmed in Node). Neither checks `b.texts`. Scenario: pressing OK in Column Properties drops the pnl column, or leaves the grid empty, and both controls report 'effect seen'.

**Fix:** Require `a.texts.some((t) => t !== null)` and that the before texts showed the feature (`b.texts.some((t) => /\.\d/.test(t))`, and likewise for commas).

### P2-374. The 'sort ascending' row assertion cannot fail on the sample data, because column 0 is already ascending

*test-gap · browser harnesses* — `demo/verify-features.mjs:519`, `src/samples.ts:136`

The check sorts column 0 and asserts `col.join('|') === sorted.join('|')`. Column 0 is `trade_id`, which `sampleCsv` writes as `String(100000 + i)` in loop order, and the flat cube's scan returns that order. Scenario: the sort emits `sort(`/`ORDER BY` text but is lost on the way (an ORDER BY in a subquery that the outer SELECT drops, or a result that never re-renders). The grid stays in insertion order, which is ascending, and 'sort ascending' passes; only the separate descending check would notice.

**Fix:** Sort a column whose natural order is not ascending (e.g. notional or booked_at), or assert the first rendered value equals the column minimum from an independent query.

### P2-375. 'add filter from a cell' passes when the filter matches zero rows

*test-gap · browser harnesses* — `demo/verify-features.mjs:705`

The check asserts `const off = s.rows.filter((r) => r[0] !== wanted); if (off.length) throw ...` and returns `${label} -> ${s.rows.length} rows`; nothing asserts that any row remains. Scenario: the generated literal does not match the stored value (a formatted '100,000' compared against 100000, or a type mismatch). The grid shows zero rows, `off` is empty, and the check records 'ok — = 100000 -> 0 rows'.

**Fix:** Add `if (!s.rows.length) throw new Error('the filter kept no rows')`, or assert exactly one result row for the unique trade_id.

### P2-376. 'hide a column' checks only that the header count dropped, not that the chosen column was hidden

*test-gap · browser harnesses* — `demo/verify-features.mjs:1429`

The check runs `menu([/^Hide /])` and fails only when `after.length >= before.length`. The menu label names the column (`Hide <name>`), but names are never compared, and the grid invariants check positions and sizes, not identity. Scenario: the header-identity bug this file describes elsewhere ('sorting one column sorted its neighbour') hits Hide, so 'Hide trade_id' hides trade_date. The count drops by one and the check passes.

**Fix:** Read the column name from the matched label (or the clicked cell's `data-column`) and assert that name is absent from `gridColumns()` while every other column remains.

### P2-377. The ad hoc 'opens on the cube as it stands' check claims, but never asserts, that the zoomed members are the cube's groups

*test-gap · browser harnesses* — `demo/verify-features.mjs:4683`

The comment says 'Zoomed once, the members are the groups the cube showed', but after `const b = await changed(was)` the value is only interpolated into the return string: `zoomed: ${b.labels.length - 1} members (cube showed ${cubeRows} rows)`. `changed()` resolves on any change. Scenario: zooming on region returns desks, or an empty child list, and the check still passes, printing the two mismatched counts side by side.

**Fix:** Assert `b.labels.slice(1)` equals the cube's level-1 group labels captured before entering the mode, or at least that the counts match.

### P2-378. '… and Edit brings its own forward' never tests that Edit raises an already-open window

*test-gap · browser harnesses* — `demo/verify-features.mjs:3177`, `demo/verify-features.mjs:3203`, `demo/verify-features.mjs:3211`

After the two-new-windows part, the check calls `edit()` once, fills the field, clicks Reset and compares the expression. It never chooses Edit a second time, counts windows or compares z-order, and the return string quietly changes the claim to 'Edit opens the column, Reset restores it'. Scenario: choosing 'Edit Column uplift...' while that editor is already open creates a duplicate window, or fails to raise the existing one, and the check still passes.

**Fix:** Open the Edit window, open another window over it, choose Edit again, then assert exactly one `[data-window=…uplift…]` exists and that it has the highest z-index.

### P2-379. The known-gap mechanism is dead code, and a comment says the long-run anomaly is a declared gap when it is not

*maintainability · browser harnesses · reproduced* — `demo/verify-features.mjs:158`, `demo/verify-features.mjs:108`, `demo/verify-features.mjs:3833`, `demo/verify-features.mjs:4787`

`async function gap(name, why, fn)` has no callers (grep finds only the definition), so `gaps` is always empty and the 'KNOWN GAPS' / 'now WORKS — promote it to a check' reports at 4787-4794 can never print. The comment at 3833-3838 says the long-run reorder failure 'is the gap declared below', but that check (3258) is an ordinary `check` that appears earlier. Scenario: the next session trusts the comment that the anomaly is tracked, while the actual check cannot detect a reorder that never happens (see the long-run reorder entry).

**Fix:** Delete `gap()` and its reporting, or use it for the declared anomaly, and correct the comment at 3833-3838.

### P2-380. Cube-wide settings changed by a check are not restored when it fails, so they leak into the rest of the sweep

*maintainability · browser harnesses* — `demo/verify-features.mjs:3524`, `demo/verify-features.mjs:1997`, `demo/verify-features.mjs:2038`, `demo/verify-features.mjs:3254`

'KEEPING the grouped columns …' calls `await setKeepGrouped(false)` only at 3524, after assertions at 3485-3522 that can throw, with no try/finally; check()'s reset() closes windows but does not restore settings. 'changing a column's KIND' (1997) makes quantity a measure and never reverts it, and 'a display name changes the label' (2038) renames a column permanently (the comment at 3254 records one fault this caused). Scenario: if the both-axes assertion at 3517 fails, 'Keep grouped columns in the grid' stays on, and later grouping checks such as 'the GRAND TOTAL renders' see an extra grouped column, the cascade reset() claims to prevent.

**Fix:** Put restores in `finally` blocks, as 'learns its TYPE' already does, or start such checks from `freshCube()`.

### P2-381. torture claims to run a real DuckDB but only asks the planner for SQL and checks the SQL is non-empty

*test-gap · browser harnesses* — `demo/torture.mjs:236`, `demo/torture.mjs:3`, `demo/torture.mjs:63`, `demo/torture.mjs:251`, `demo/torture.mjs:261`, `demo/torture.mjs:320`

The header says it 'Runs against the REAL planner and a REAL DuckDB', but `plan()` only POSTs to `${ENGINE}/engine/plan`, whose handler (LegendHttpServer.java:232-235) calls `Compiler.plan` and returns `plan.sql()` without executing. Every engine assertion is `check(name, Boolean(sql), ...)`. Scenario: the planner emits a wrong escape for `filter on an apostrophe value`, or a pivot on a date that DuckDB rejects at bind time. A string still comes back, the case prints `ok`, and the suite reports 'all clear', while run-stress would see the same Conversion/Binder errors on execution.

**Fix:** Execute each planned SQL (POST /engine/sql, or DuckDB-WASM in-process as verify-engine-differential does) and assert a result shape; otherwise reword the header to say this is compile-only.

### P2-382. The chaos 'epoch discipline' check never compares the rows on screen with the status count, so a stale overwrite passes

*test-gap · browser harnesses* — `demo/chaos.mjs:461`, `demo/chaos.mjs:456`, `demo/chaos.mjs:186`

The comment says a stale response 'shows up here as a mismatch nothing else would catch', but the check is `check('the rows on screen agree with the row count reported', visible > 0 && status > 0, ...)`; `visible` and `status` are never compared. Scenario: a late response overwrites a newer one, so the status bar says 12 rows from the new view while the grid paints 5 rows from an old epoch. Both are above 0, the check prints ok and the run ends 'survived'.

**Fix:** Record `__dataCubeViews` or the view epoch and its row keys, and assert the painted row keys equal the latest view's rows; or compare the status row count with a data-row count taken from the same view rather than the virtualised DOM.

### P2-383. In the engine differential, a failure on the local plane (the product's default) is filed as 'not comparable' and the run still exits 0

*error-handling · browser harnesses* — `demo/verify-engine-differential.mjs:275`, `demo/verify-engine-differential.mjs:327`, `demo/verify-engine-differential.mjs:331`

`} catch (e) { skipped.push({ name, where: 'the local plane', ... }); continue; }`, and the exit is `process.exit(differed.length === 0 ? 0 : 1)`; the banner also looks only at `differed`. Scenario: a planner regression makes `aggregate: median` fail in the WASM planner or DuckDB-WASM. Every such case lands in COULD NOT BE COMPARED, the engine is never asked, and the run prints '*** legend-engine is a drop-in replacement for these operations ***' and exits 0. The stale pivot-cast case in engine-cases.mjs:102 already lands in this bucket.

**Fix:** Treat a local-plane failure as a failure (non-zero exit), or require an explicit allow-list entry with a reason for each skipped case.

### P2-384. Uncaught page errors during the stress run are printed but never fail it

*error-handling · browser harnesses* — `demo/run-stress.mjs:31`, `demo/run-stress.mjs:91`, `demo/run-stress.mjs:169`

`page.on('pageerror', (e) => pageErrs.push(e.message))` collects errors, lines 91-94 only print them, and the exit is `process.exit(unexplained.length > 0 || badIngest.length > 0 ? 1 : 0)`, which never reads `pageErrs`. Other browser harnesses here (verify-upload, verify-picker, verify-real-data, verify-wasm-browser) fail on page errors. Scenario: a product change leaves an unhandled rejection in DuckDbEngine during one CSV (e.g. a worker message after dispose); stress.ts still records outcomes, and the run prints 'uncaught page errors (1)' and exits 0.

**Fix:** Include `pageErrs.length > 0` in the exit condition, or classify each page error against KNOWN the way breakages are.

### P2-385. run-stress uses an undefined `offered`, so any refused ingest crashes the run with a ReferenceError instead of reporting it

*correctness · browser harnesses · reproduced* — `demo/run-stress.mjs:163`, `demo/run-stress.mjs:38`, `demo/stress.ts:158`

Line 38 defines `const offeredNames = await page.evaluate(() => window.__stressOffered ?? [])`, but line 163 filters with `&& r.verdict !== 'ok' && offered.has(r.csv)`, and no `offered` binding exists in the module. stress.ts:158 records a failed ingest as `op: 'ingest', verdict: 'refused'`, which reaches that operand. Scenario: any CSV whose ingest is refused, including a knownBroken corpus entry refused as intended, makes the filter throw `ReferenceError: offered is not defined`; the process dies with a stack trace instead of printing 'offered sample X does not even ingest', and exits non-zero for the wrong reason (reproduced on a standalone copy of the filter).

**Fix:** Add `const offered = new Set(offeredNames);` before line 162.

### P2-386. The 'pivot AND group by, through the cast' case casts to years the seed does not contain, so the two-stage pivot is never compared

*test-gap · browser harnesses · reproduced* — `demo/engine-cases.mjs:102`, `demo/trades-h2.pure:44`, `src/serialize.ts:813`, `src/serialize.ts:819`

The case uses `pivotCast: [{ name: '2021__|__notional', ... }, { name: '2022__|__notional', ... }]`, but the seed both planes load has only 2023 and 2024. `castFits()` compares measure names only, so the cast is used, and serialize.ts:813-816 itself says such a cast 'is a binder error'. Scenario: verify-engine-differential plans the case locally, DuckDB cannot bind `2021__|__notional`, the case goes to `skipped` and the run exits 0 without asking the engine (reproduced). verify-engine only plans, so it compiles regardless, and the cast path that real user cubes take has no comparison.

**Fix:** Use the seed's real values (`2023__|__notional`, `2024__|__notional`), or derive pivotCast from a first-stage run as the app does.

### P2-387. The chaos 'a normal sort still works after the abuse' check does not check that anything was sorted

*test-gap · browser harnesses* — `demo/chaos.mjs:481`, `demo/chaos.mjs:127`

The header click is wrapped in `tolerant(...)`, which catches any error and only logs '(tolerated: ...)'. The assertion is `afterSort > 0 && Math.abs(afterSort - beforeSort) <= beforeSort`, true for any count from 1 to twice the original, including no change; sorting never changes the row count anyway. Scenario: after the storm, header clicks stop changing the sort (a wedged controller or a stale listener on a re-rendered header); the row count is unchanged and the responsiveness check the header calls 'the real question' passes.

**Fix:** Assert a sort effect: the header's aria-sort or indicator changes, or the first column's values are ordered after the click; do not tolerate a failed click here.

### P2-388. chaos refuses to run without a legend-lite server that the page it drives never uses

*maintainability · browser harnesses* — `demo/chaos.mjs:57`, `demo/chaos.mjs:97`, `demo/chaos.mjs:149`, `demo/main.ts:26`

Lines 57-69 exit 1 unless `${ENGINE}/engine/plan` answers ('A chaos run against fake data proves nothing'), but line 149 loads `/demo/index.html`, whose bundle (main.ts) boots a `WasmPlanner` with `label: 'local'`; ENGINE is never passed to the page. Scenario: a developer without `bazel run //core:server` gets 'legend-lite is not answering' and exit 1 although nothing is needed from it; one with the server up believes the storm exercised the HTTP planner's out-of-order latencies when every query was planned in the tab.

**Fix:** Drop the precondition and the ENGINE console filter, or load index-server.html if the remote plane is what should be abused.

### P2-389. verify-picker's 'choosing did nothing' check can never fail, because the note is never empty

*test-gap · browser harnesses* — `demo/verify-picker.mjs:79`, `demo/boot.ts:548`, `demo/index.html:187`

The check is `if (rows1 === rows0 && note1 === '') bad('choosing did nothing');`. #uploadnote starts with text, and `showPick()` runs at boot and writes the first sample's non-empty `about` into it. Scenario: the picker's 'change' listener is lost (the stale-bundle fault the file header describes). Choosing 'wide' changes neither rows nor note, `note1` is still the first sample's text rather than '', and no failure is raised.

**Fix:** Capture `note0` before selecting and fail when `rows1 === rows0 || note1 === note0` (both should change for 'wide').

### P2-390. verify-upload silently skips every grouping check for a file without a 'region' column, and assumes at least 8 columns

*test-gap · browser harnesses* — `demo/verify-upload.mjs:266`

`const region = page.locator('.dc-th.dc-draggable', { hasText: 'region' }); if (await region.count()) { ... }` has no else branch or message, and inside it `if (grouped.labels.length < 8) bad(...)`. Scenario: `DATA=/data/orders.csv` (no region column) skips every 'GROUPING MUST ACTUALLY GROUP' assertion without a word and reports 'schema inferred, cube rebuilt'. A correct product with a 5-column file that has region fails the `< 8` check.

**Fix:** Group by the first non-measure panel column (as verify-smoke does) and fail when none exists; compare the retained column count with the file's own column count instead of the constant 8.

### P2-391. verify-calc-vocabulary drops an explicitly requested engine that is down and passes on the local plane, which only plans

*error-handling · browser harnesses* — `demo/verify-calc-vocabulary.mjs:77`, `demo/verify-calc-vocabulary.mjs:87`, `demo/verify-calc-vocabulary.mjs:136`

The engine probe is caught with `console.log(`no engine at ${ENGINE} — checking the local plane only.`)`, and the run exits `bad === 0 ? 0 : 1`; verify-engine-differential exits 2 in the same situation. The local plane only calls `planner.plan` and never executes, while the engine side executes because 'planning alone is not the question'. Scenario: `ENGINE=http://127.0.0.1:6300 bazel run //datacube:verify_calc_vocabulary` with the engine down prints 'N/N offered functions lower locally' and exits 0, so a check meant to cover both planes goes green; a CALC_FUNCTIONS example whose SQL DuckDB rejects at bind time is still reported as working locally.

**Fix:** Exit non-zero when ENGINE is set explicitly and unreachable, and execute the local plan on DuckDB-WASM as verify-engine-differential's localPlane does.

### P2-392. The quote-escaping differential case filters on a value absent from the seed, so both planes return 0 rows whatever the escaping does

*test-gap · browser harnesses* — `demo/engine-cases.mjs:121`, `demo/trades-h2.pure:44`

The filter is `{ kind: 'condition', column: 'desk', operator: 'equal', value: "O'Brien's desk" }`, but the seed's desks are only Rates, Credit, FX and Equity, and verify-engine-differential loads that same seed into DuckDB. compare() then matches 0 rows against 0 rows. Scenario: the serializer starts double-escaping (`O\\'Brien`) or dropping the second quote; both planes still return nothing, the differential prints `ok a string value with a quote in it`, and a quoting bug that would change which rows a user's filter matches goes unnoticed.

**Fix:** Add a seeded row with an apostrophe in desk (the seed is shared by both planes) so the case must return exactly that row.

### P2-393. snap-ceiling's 'build ms' times a copy of an already-built table, and the README reports it as the snap build time

*correctness · browser harnesses* — `bench/snap-ceiling.mjs:80`, `bench/snap-ceiling.mjs:70`, `bench/README.md:34`, `bench/README.md:19`

`const tBuild = best(() => conn.query(`CREATE OR REPLACE TABLE snap2 AS SELECT * FROM snap`), 1);` runs after `snap` was built, untimed, at lines 70-78, and snap2 is never used or dropped. bench/README.md:34-38 lists 665 ms as the 10M-row build, while wasm-penalty.mjs, which times the real build from `range()`, measures 1638 ms (README.md:19). Scenario: someone planning snap latency reads 665 ms when the real build is about 2.5 times that; holding snap, snap2 and r at 10M rows also inflates memory for the pivot and sort timings that follow.

**Fix:** Time the `CREATE OR REPLACE TABLE snap AS <range source>` statement itself, as wasm-penalty does, and drop snap2; or rename the column 'copy ms'.

### P2-394. engine-cases.mjs keeps two copies of the column list it exists to share, so they can drift

*maintainability · browser harnesses* — `demo/engine-cases.mjs:16`, `demo/engine-cases.mjs:207`, `demo/engine-cases.mjs:6`

`casesFor` defines a local `const COLUMNS = [ region, desk, book, year(kind: dimension), qtr, notional, pnl, qty ]` (lines 16-25), and the file exports an identical `ENGINE_COLUMNS` (lines 207-216); the header says 'Copying the list would let the two drift'. Scenario: `year` loses `kind: 'dimension'` in ENGINE_COLUMNS. verify-calc-vocabulary and verify-engine's server-mode block then test one shape, while every casesFor case (the differential and verify-engine's compile loop) keeps the old one.

**Fix:** Use `columns: ENGINE_COLUMNS` inside casesFor and delete the local copy.

### P2-399. Tests of the two-stage pivot check only the query text and use only sum, so wrong average and count totals and dropped measures pass

*test-gap · unit tests* — `test/serialize.test.ts:259`, `test/serialize.test.ts:199`, `src/serialize.ts:1084`, `src/serialize.ts:1041`, `test/wasm-differential/cases.ts:98`

The two-stage block in serialize.test.ts (lines 199-289) uses only a sum measure and asserts the text shape, for example `assert.match(outer, /->sum\(\)/);`. The underlying defect is real. serialize.ts:1084-1098 re-applies each measure's own function in the outer groupBy (`fn: base.fn`), so count counts intermediate rows and average averages the per-group averages. byMeasure is keyed by column (line 1041), so two measures on one column collapse into one. Example: carry `desk`, with desk A holding trades 10, 20 and 30 and desk B one trade of 100. The grid then shows average 60 (true value 40) and count 2 (true value 4), and every suite stays green. No two-stage case anywhere checks row values for average, count or median.

**Fix:** Add row-level assertions, run through DuckDB as the wasm-differential lane already can, for average, count and median in a grouped pivot with a carried dimension, and for several measures on one column.

### P2-400. WarehouseEngine has no unit tests, so abort/cancel, the 401 message, failed statements, chunk errors and DELETE cleanup are all unchecked

*test-gap · unit tests* — `src/warehouse.ts:126`, `src/warehouse.ts:146`, `src/warehouse.ts:195`, `test/live-snap/live-snap.ts`

Outside demo/boot.ts, WarehouseEngine is used only by the live-snap integration harness. That harness passes no AbortSignal, and a grep of it for signal, abort, DELETE and cancel finds nothing. No node:test suite stubs fetch for warehouse.ts. The untested paths hide concrete gaps. The POST happens before the try, so an abort during it never reaches the cancel branch. An early return() from the consumer sends no DELETE, because there is no finally. A non-abort error after success sends neither DELETE nor cancel. The doc comment says abort 'cancels the statement on the server', and nothing verifies it.

**Fix:** Add a node:test suite with a stubbed fetch. Cover an abort during the POST, during a poll and between chunks (asserting which requests are sent), a 401 producing the friendly message, a failed state producing its error text, and DELETE sent exactly once, including when the consumer stops early.

### P2-401. Navigate Without Data, a failing Ad Hoc query and an overtaken refresh have no tests

*test-gap · unit tests* — `test/adhoc-session.test.ts:65`, `test/adhoc-fixture.ts:49`, `test/adhoc-mode.test.ts:288`, `src/adhoc/session.ts:86`, `src/adhoc/session.ts:108`, `src/adhoc/mode.ts:151`, `src/adhoc/mode.ts:154`

`navigateWithoutData` appears only in src/adhoc and never in test/ or demo/, although it branches real code (`session.ts:108: return next.options.navigateWithoutData ? this.#view : this.refresh();`, mode.ts:151-153 and 175). The only fake run (adhoc-fixture.ts:49-70) answers at once and in call order. So the reportFailure catch in mode.ts:154 is never reached: the one use of `failures` asserts `deepEqual(failures, [])`. The `seq !== this.#seq` overtaken-refresh guard (session.ts:86/89) is also never reached. As a result, a stale answer shown after a failed step, or old values kept after turning navigation back on, would pass the suite.

**Fix:** Add session and mode tests with a run that rejects, a run that is delayed and released out of order, and a navigate-off, change, navigate-on sequence that asserts a query runs and the values match a fresh session.

### P2-402. The configuration-reader guard counts any property with the same name as a read, so a setting can stop being read and the guard stays green

*test-gap · unit tests* — `test/config-readers.test.ts:68`, `src/app.ts:2343`, `src/app.ts:2296`

A field counts as read when `new RegExp(`\\.${f}\\b`)` matches anywhere in the text of all non-UI source files joined together. The receiver's type is never checked. CubeConfiguration `dimensions` is matched by `cube.outline.dimensions` (app.ts:2296, src/adhoc/*), and ColumnConfiguration `format` by `source.format` (remote.ts:85, samples.ts:54). So if the only real read, `this.#config.dimensions` at app.ts:2343, is deleted, the Dimensions tab's hierarchies stop being used and the test still passes. That is exactly the 'written by the editor, read by nothing' regression this test exists to catch.

**Fix:** Match only reads on configuration-typed receivers (such as `#config.f`, `config.columns[...].f` or `columnConfig(...).f`). Better, use the TypeScript compiler API to find property accesses whose receiver type is CubeConfiguration or ColumnConfiguration.

### P2-403. The guardrails against a fallback planner or runner in a catch block stop at the first '}', so a catch body containing any nested block gets past them

*test-gap · unit tests · reproduced* — `test/guardrails.test.ts:173`, `test/guardrails.test.ts:211`, `test/guardrails.test.ts:147`

The check is `/catch\s*(\([^)]*\))?\s*\{[^}]*\bnew\s+\w*Planner\b/s`, and line 211 is the same for RemoteRun/PlanThenRun. `[^}]*` cannot cross a nested block. The verifier ran both regexes: `catch (e) { if (verbose) { log(e); } return new WasmPlanner(opts); }` returns false. That is the probe-catch-substitute shape the guardrail exists to ban. The runtime-choice guardrail (lines 147-161) likewise splits only on `function` declarations, so a planner built in a class method or an arrow function escapes it.

**Fix:** Scan with the TypeScript parser for NewExpression nodes inside CatchClause blocks, or at minimum balance braces when extracting a catch body.

### P2-404. The 'covers all 31 operators' test gives array values to scalar operators and checks only that the output is non-empty, which hides that literal() writes an array into Pure unquoted

*test-gap · unit tests* — `test/serialize.test.ts:686`, `test/serialize.test.ts:730`, `src/serialize.ts:120`, `src/persist.ts:215`

The loop uses `value: operator.toLowerCase().includes('in') ? ['A'] : 'A'`, which also sends ['A'] to contains, notContains, equalCaseInsensitive, containsCaseInsensitive and the startsWith/endsWith CaseInsensitive operators. Its only check is `assert.ok(out.length > 0, operator)`. literal() ends with `return String(v);`, so 'contains' with ['A'] renders `$x.region->contains(A)`, a bare identifier, and equalCaseInsensitive renders `... == A`. persist.ts:215 casts a loaded filter with no shape check, so a hand-edited saved view produces Pure that fails with an unrelated error. Lines 590, 624 and 636 do pin exact output for some of these operators with scalar values, so the gap is this loop plus literal() quietly accepting non-scalars.

**Fix:** Give each operator a value of the right kind and assert the exact rendering. Make literal() throw on a non-scalar value, and validate the filter shape in persist.load.

### P2-405. Three app tests do not check what their names claim: the configuration test never looks at the query, one test is vacuous, and one clicks Load with no assertion

*test-gap · unit tests* — `test/app.test.ts:925`, `test/app.test.ts:905`, `test/app.test.ts:607`, `test/app.test.ts:80`

(1) 'folds the configuration into the query on every refresh' (925-948) ends with only `assert.equal(app.snapshot.maxRows, 42)`. StubPlanner.pure is recorded at line 80 but never read anywhere in the file, so if the scope limit stopped reaching the Pure the test would still pass. (2) At 905-909 the selector is `.dc-th[data-column]`, so `typeof header.dataset['column'] === 'string'` is always true once the element exists. (3) 'saves a view and loads it back' (607-613) clicks Load View and asserts nothing. The comment at 616-619 admits it passed while loading restored nothing.

**Fix:** In (1), assert that planner.pure.at(-1) contains the limit (for example `limit(43)`, as apply-refusal.test does). In (2), check a concrete column name or delete the test. Fold (3) into the restore test, or assert the restored rows.

### P2-406. The test 'Sorts keeps a direction across a remove and re-add' never re-adds or checks a direction, and hides that a re-added sort comes back as 'asc'

*test-gap · unit tests* — `test/editor.test.ts:218`, `src/ui/editor.ts:375`

The test removes the only sort and asserts `editor.draft.snapshot.sorts` is []. There is no re-add step and no direction assertion. The product code shows why this matters. editor.ts:375-382 rebuilds `was` from the live draft on every change (`const was = new Map(s.sorts.map((x) => [x.column, x.direction]))`) and uses `direction: was.get(column) ?? 'asc'`. Once the remove has committed, a column that was 'desc' comes back as 'asc', which contradicts both the test name and the code comment ('A column dragged out and back keeps the direction it had'). Traced by reading the code, not run.

**Fix:** After the removal, double-click the column back from the available pane and assert `sorts` equals [{column:'total', direction:'desc'}]. Expect that to fail until the panel remembers directions across commits.

### P2-407. The 'gives every leaf a unique name' fuzz test compares leaf indices, which are unique by construction, so duplicate column names go unchecked

*test-gap · unit tests · reproduced* — `test/fuzz.test.ts:331`, `src/grid/columns.ts:320`, `src/snapshot.ts:652`

The test does `const seen = new Set(model.leaves.map((l) => l.index))`, but columns.ts:320 assigns `index` from `table.columns.map((c, index) => ...)`. Later steps only filter, sort or reseat the leaves, so indices can never repeat. The test's own comment names duplicate names as the hazard (the grid would 'render one twice and lose the other'), but names are never compared. tableFor also never generates duplicate names, because referencedColumns (snapshot.ts:652) drops repeats. The verifier confirmed with a repro that the test cannot fail.

**Fix:** Assert uniqueness of `leaf.name` (or of name plus path), and have tableFor generate duplicate column names on some seeds.

### P2-408. A group-derived test asserts a comparison between two constants and never checks engine output

*test-gap · unit tests* — `test/group-derived.test.ts:94`

`assert.ok(Math.abs(0.5 - 0.108) > 0.39);` compares two literals, so it cannot fail. The file header claims it 'proves the difference against a real engine', but its serialize tests only compare indexOf positions and never run the serialized query. If group-stage extend placement broke and the engine returned 0.5, the test would still pass.

**Fix:** Run the serialized group-stage cube through the planner and engine and assert the computed value, or delete the constant assertion and correct the header.

### P2-409. The menu 'flips rather than clamping' test cannot see the flip, because jsdom reports a zero-size rect

*test-gap · unit tests* — `test/menu-view.test.ts:125`, `src/ui/menu-view.ts:232`

The test's own comment says 'jsdom reports a zero-size rect, so the flip is a no-op here'. It asserts only that left and top are >= 0, which holds for any x, y >= 0. With x=190, y=190 in a 200x200 viewport, `x + rect.width > vw` is false, so the position is just x and y. Changing the flip branch in menu-view.ts #place (for example using `x + rect.width`) would still pass.

**Fix:** Stub getBoundingClientRect on the menu element (as grid-dom.test.ts does for headers) and assert the exact flipped coordinates.

### P2-410. The test 'the setting still works when asked for' only checks an object literal it just built

*test-gap · unit tests* — `test/config.test.ts:152`, `src/app.ts:603`

The test is `const on = { ...DEFAULT_CONFIGURATION, showRootAggregation: true }; assert.equal(on.showRootAggregation, true);`. It calls no product code and can fail only if spread syntax breaks. The only reader of the setting is app.ts (line 603 `TreeState.empty(this.#config.showRootAggregation)` and 2516-2551 `withTotals(...)`), and no test drives that config-to-grid path. If showRootAggregation stopped reaching the grid, this test would still pass.

**Fix:** Open a CubeApp with showRootAggregation set to true and assert that the grand-total row is rendered, or delete the test.

### P2-411. The 'types' stress sample is not what it says: n_big values round into duplicates, and it produces no DECIMAL or INTEGER column

*test-gap · unit tests · reproduced* — `src/samples.ts:172`, `src/upload.ts:104`

n_big is built as `${9007199254740000 + i}` using JS doubles. For 2000 rows this yields 1497 distinct values, and no odd value above 2^53 (i=993, 994 and 995 print ...992, ...994 and ...996); this was reproduced in Node. The about text promises 'integer, bigint, double, decimal', but n_dec is written as `(i / 100).toFixed(2)`. Loaded with read_csv AUTO_DETECT (upload.ts:104), that sniffs as DOUBLE, and n_int sniffs as BIGINT. So the stress run's 'every column type' coverage never reaches the Decimal Pure kind that lite-facts.ts exists to get right, and never an odd BIGINT above 2^53.

**Fix:** Build n_big with BigInt arithmetic. Add a corpus entry that yields real DECIMAL and INTEGER columns (for example with explicit column types or a typed load), or correct the about text.

### P2-412. The lite-facts generator's 'Sources' header omits DatabaseProtocolParser.java, one export's doc is wrong, and two generated exports have no reader

*maintainability · unit tests* — `tools/gen-lite-facts.mjs:206`, `src/generated/lite-facts.ts:8`, `src/generated/lite-facts.ts:31`, `BUILD.bazel:130`

The header template lists only Type.java, RelationalDataType.java and RelationalKinds.java. grammarKeywordToRecord reads `source('parser/DatabaseProtocolParser.java', ...)`, and BUILD.bazel:130 copies that file into lite_facts_sources. SQL_NAME_TO_RECORD is documented as 'as lite's grammar spells it', but it includes `"DISTINCT": "Distinct"` from fromName, and the grammar rejects that name with 'unsupported column datatype'. No file under src, demo, test or tools imports SQL_NAME_TO_RECORD or RECORD_TO_PURE_KIND. The diff test still catches drift, so this is provenance and documentation only.

**Fix:** Add `parser/DatabaseProtocolParser.java  GRAMMAR_TYPE_KEYWORDS` to the header template. Correct the SQL_NAME_TO_RECORD doc. Drop the two unused exports or mark them test-only.

### P2-413. An assertion message says the opposite of what the assertion checks, so a failure would point the fixer the wrong way

*maintainability · unit tests* — `test/column-editor.test.ts:207`, `src/ui/column-editor.ts:454`

The assertion is `assert.equal($<HTMLElement>('.dc-calc-exprbox').hidden, true, 'the expression box stays shown');`. Window mode hides the box (`exprBox.hidden = this.#draft.mode !== 'expression'`), so the assertion is right and only the message is wrong. If a regression kept the box visible in window mode, the failure would read 'the expression box stays shown', which describes the wrong behaviour as if it were expected.

**Fix:** Change the message to 'window mode hides the expression box'.

### P2-414. Filter editor offers <, <=, >, >= (and ordering column comparisons) for StrictTime columns, but no Pure lessThan overload takes StrictTime

*correctness · late verification* — `src/ui/filter-editor.ts:124`

`const ORDERING = new Set<DataType>(['number', 'date', 'time']);` and parseTyped `case 'time': return t === '' ? null : t;`, so literal() renders the value as a String. StrictTime reaches the editor only through engine-remote.ts pureTypeName, which passes the leaf 'StrictTime' through. The lite planner refuses both `$x.tt < '11:00:00'` (lessThan(STRICT_TIME, STRING)) and `$x.tt < %11:00:00` (lessThan(STRICT_TIME, STRICT_TIME)). Upstream legend-pure lessThan.pure declares only Number/Date/String/Boolean overloads, and m3.pure makes StrictTime a subtype of Any, not of Date. So an ordering filter on a time column from a legend-engine source is offered but cannot compile. I did not run legend-engine itself.

**Fix:** Drop 'time' from ORDERING (and from the ordering column comparisons) until a StrictTime comparison exists, and render time values as `%HH:MM:SS` literals for equality.

### P2-415. compile() does not check the pivot-total query: a Properties draft that compiles can still fail every refresh

*correctness · late verification* — `src/cube.ts:254`

compile() collects only `serialize(s, scope)` and `childAggregateQuery(...)`; pivotTotalQuery is never planned. pivotTotalQuery's carriedMeasures (serialize.ts:1332-1335) sums every measure-kind column that is excluded from the pivot: `.map((c) => defaultMeasure(c.name, specOf.get(c.name), 'sum'))`. In Advanced Properties, set a String column s to Kind = Measure, leave its aggregation unset, tick 'Exclude from horizontal pivot', and turn on the pivot total, with rows [i] and pivotOn [b]. compile plans `select(~[i, b, f])->pivot(...)` OK, so Apply is allowed. The refresh then runs the total query `groupBy(~[i], ~[s:x|$x.s:y|$y->sum(), ...])`, which is refused (`no overload of ... sum ... STRING`), and fetchTree fails the whole refresh. A randomized sweep of 688 generated pivot configurations found only this family (24 cases).

**Fix:** Plan pivotTotalQuery for each scope inside compile(), and give non-numeric carried measures 'unique' rather than 'sum'.

### P2-416. A column named `milestoning` (lower case) breaks the generated model, so the upload fails with a parser error

*robustness · late verification* — `src/infer.ts:141`

quoteIdent leaves any /^[A-Za-z_][A-Za-z0-9_]*$/ name bare: `if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return name;`. `milestoning` is a keyword in the Database grammar. Upload a CSV with header `milestoning,v`. Every plan fails with `[6:21] expected PAREN_OPEN but found VALID_STRING ('VARCHAR')`. Observed with the WASM planner. The other keyword-like names I tried all planned, as column names and as upload table names: Join, Filter, let, import, native, Table, Schema, View, include, primaryKey, PRIMARY, business, processing, a leading digit, spaces, quotes, backslash, newline, `}#`. `true` also fails and was already reported.

**Fix:** Quote every generated identifier (quoting is always legal), or quote the Database grammar's reserved words too.

## Appendix A: reports the verifiers refuted

13 of 687 auditor reports were refuted and are not in the catalogue:

- `src/format.ts:226` (export, reported MEDIUM): A currency typed as a symbol or name ('$', '€', 'US$', 'EURO') makes Intl throw on every render, so the grid stops painting rows and every refresh raises an 'execution' error — *refuted:* The throw is real: `new Intl.NumberFormat(undefined,{style:'currency',currency:'$'})` raises "Invalid currency code : $", and the same happens for '€', 'US$' and 'EURO'. There is no validation at format.ts:224-230, and the free-text box at src/ui/panel-column.ts:416-421 feeds it directly. But the fa
- `src/calc.ts:116` (calc, reported LOW): The calc vocabulary is proven only by planning on the local plane, so a function whose DuckDB lowering fails at run time is still offered as working (`log` → `ln`) — *refuted:* The facts in the finding check out. `log` is at src/calc.ts:116 and its example is `$x.qty->toOne()->log()`. demo/verify-calc-vocabulary.mjs only runs `planner.plan(...)` on the local plane and executes only on the engine. pnl in demo/boot.ts:302 runs from -1000 to 1000. DuckDB 1.4.4 raises "Out of 
- `demo/verify-features.mjs:4474` (harness-features, reported MEDIUM): Neither root-aggregation check verifies the total's figure, so the 'first trade in the Total row' regression it cites would pass — *refuted:* The finding's central claim is wrong: the regression it cites would not pass the control check. That bug is described at src/serialize.ts:725-730 and test/serialize.test.ts:1014-1016. The level-0 query was `t->limit(1001)`, which returned raw rows, so the Total row showed the first trade AND the 1,0
- `demo/verify-features.mjs:898` (harness-features, reported LOW): The TYPED filter check never verifies that the date and boolean values reach the query — *refuted:* The quote is accurate. In demo/verify-features.mjs around lines 896-909, the date and `settled` branches only call `apply()`, and `apply()` only checks that `.dc-filter-problem` is empty. But the finding's scenarios would not slip through. Both named regressions are pinned by the unit suite, test/fi
- `demo/verify-features.mjs:4351` (harness-features, reported LOW): The keyboard check accepts focus moving in any direction on ArrowDown — *refuted:* The quoted check at demo/verify-features.mjs:4351 is real: it only requires that the focused cell's row or column changed. But the scenario given, that a wrong-direction arrow key would pass unnoticed, is not a real gap, because direction is asserted exactly somewhere else. In test/grid-dom.test.ts:
- `demo/run-stress.mjs:115` (harness-rest, reported LOW): The KNOWN 'cross-type-comparison' class matches every DuckDB 'Conversion Error', hiding a regression in the literal path that its own note says works — *refuted:* The finding's failure path does not exist. The stress matrix never sends a literal to an INTEGER, date or numeric column. demo/stress.ts:216 picks `const target = strs[0] ?? all[0]!` and uses it for every VALUE_OP and LIST_OP. The corpus is every sample in src/samples.ts plus the known-broken entrie
- `demo/shots.mjs:253` (harness-rest, reported LOW): The filter-clearing loop has no bound and hangs if the delete control stops removing rows — *refuted:* This does not fail with the code as it stands. In src/ui/filter-editor.ts:1350-1382, #controller appends the per-row controls in a fixed order: '+' (insertAfter), '−' (remove), '( )' (layer), then '!' (NOT). So `.dc-filter-ctl` nth(1) in demo/shots.mjs:254 is the '−' button. It calls `remove(node.id
- `test/duckdb.test.ts:159` (tests-1, reported LOW): 'discards a superseded query against the live engine' cannot fail because of the engine — *refuted:* The finding's main claim is false. It is true that `slow === STALE` holds whatever the engine does: `issue` advances the epoch synchronously and `run` rechecks it afterwards. It is also true that the test passes no signal, so no cancellation is exercised. But the claims that the test "cannot fail be
- `test/treeview.test.ts:389` (tests-3, reported LOW): 'Against a real engine' tests run hand-written SQL, not the product's queries, so they prove DuckDB's arithmetic rather than the cube's — *refuted:* The description is accurate: treeview.test.ts:350-456 and sorting.test.ts:84-103 run SQL typed by hand, so on their own they only test DuckDB. The failure scenario is wrong, though. The two regressions it names would turn the suite red:
- `test/scale.test.ts:127` (tests-3, reported LOW): The scroll-to-bottom virtualisation test cannot tell a grid that ignores the scroll from one that follows it — *refuted:* The finding is accurate about this one test and wrong about the gap. Lines 127-139 of test/scale.test.ts check only `rendered > 0` and `rendered <= ceil(400/20)+8`. The top-of-grid window already meets both, so on its own that test cannot tell whether the grid followed the scroll.
- `src/warehouse.ts:203` (lens-api, reported LOW): Warehouse client parses any 2xx body as JSON or Arrow without checking Content-Type, so a gateway or SSO HTML page surfaces as a raw SyntaxError or Arrow decode error — *refuted:* The quoted code is real: warehouse.ts:203 `return await r.json() as T;` and :171 `yield new Uint8Array(await r.arrayBuffer());` do not check Content-Type. The failure scenario, though, rests on a misreading. The header (warehouse.ts:79-84) does not put an SSO gateway in front of the warehouse. It sa
- `src/serialize.ts:154` (gap-aggregate-matrix, reported HIGH): Weighted average counts the weight of rows whose value is NULL, so wavg comes out too low at every level — *refuted:* The code does what the finding says. serialize.ts:154 emits `x|$x.col->wavgRowMapper($x.w)` / `y|$y->wavg()`, and the planner lowers that to SUM(v*w)/SUM(w). But that lowering is the reference behaviour, not a DataCube or planner bug. legend-engine does exactly the same thing in legend-engine-xt-rel / The code path is reachable: serialize.ts:154 emits `x|$x.col->wavgRowMapper($x.w)` / `y|$y->wavg()`. The finding still does not hold up as a DataCube defect, because its "expected 10" is the auditor's own definition of weighted average, not the platform's. Upstream legend-engine lowers this exact ex / The SQL lowering in the finding is accurate, but it is the reference behaviour, not a DataCube defect. The "expected" number the auditor gives comes from no spec.
- `src/app.ts:2654` (gap-engine-plane-parity, reported MEDIUM): Calc-column type learning records the aggregate's type in grouped views, so a String calc column aggregated with Count becomes 'Integer' for filters and kind — *refuted:* The mechanism is real: #learnCalcTypes (app.ts:2653-2667) copies whatever type the grouped result reports, and in a grouped cube that is the aggregate's type (serialize.ts:924 `aggregateSpec(configured ?? defaultMeasure(name, spec, ...))`, where defaultMeasure uses `spec?.aggregate`). But the findin

