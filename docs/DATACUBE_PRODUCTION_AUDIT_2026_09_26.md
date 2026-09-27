# DataCube TypeScript: production-readiness audit (2026-09-26)

Pass 1 (grep-based, targeted reads) is directly below; **pass 2** (every line read by many auditors, adversarially verified: 417 defects) follows it and supersedes pass 1's proposed order.

## Pass 1

Scope: `datacube/src` (27,150 lines, the product), `datacube/demo` (1,718 lines of pages and
harness), the page bundle and what it downloads. Read-only: nothing was fixed during the audit;
fixes are decided from this document. Every finding carries its evidence; "solid" items were
checked, not assumed.

## Findings

### HIGH

**H1. Timestamps show the wrong wall-clock time outside UTC, and filters on them miss.**
A TIMESTAMP reaches the grid as epoch milliseconds (Arrow; `duckdb.ts` `converterFor`, the same
path for local, live and snapped), becomes a JavaScript `Date` (an instant), is displayed in the
browser's zone (no `timeZone` anywhere in `format.ts`), and is written back into a filter or drill
as LOCAL wall-clock time (`serialize.ts` `temporalLiteral`). Measured, for a stored
`2024-01-02 03:04:05`:

| browser zone | grid shows | filter on that cell asks for |
|---|---|---|
| UTC | Jan 2, 3:04:05 AM | `%2024-01-02T03:04:05` (right) |
| America/New_York | Jan 1, 10:04:05 PM | `%2024-01-01T22:04:05` (no such row) |
| Asia/Tokyo | Jan 2, 12:04:05 PM | `%2024-01-02T12:04:05` (no such row) |

`temporalLiteral` also drops milliseconds, so a timestamp with fractional seconds cannot match
itself even in UTC. DATE columns are right (built and written at local midnight, consistently).
Needs a decision: a TIMESTAMP without zone is a wall-clock value (display and write it in UTC
components); a TIMESTAMP WITH TIME ZONE is an instant (display local, write with its offset).

**H2. The production build is a development build.**
- `bundle.js` is built `--bundle --format=esm --target=es2022` only: not minified (1.03 MB), no
  source maps, no content hash in the name, so it cannot be cached long.
- The page downloads `duckdb-eh.wasm` 35.9 MB (or `duckdb-mvp.wasm` 41.3 MB) and the planner
  `classes.wasm` 4.5 MB; our server (`demo/serve.mjs`) sends them uncompressed. WASM compresses
  well; a production host must serve pre-compressed (Brotli) files with long-lived caching.
- There is no production serving story at all yet: the only server is the development one.

### MEDIUM

**M1. A failed drill-through is silent.** `app.ts:545` calls `void this.#drillThrough(row)`;
`#drillThrough` (`app.ts:2006`) has no error handling. Any failure (a live warehouse refusal, a
dropped network, an expired token) is an unhandled promise rejection: no message to the user, an
"Uncaught (in promise)" in the console. It is the only one of the 47 fire-and-forget calls in `src`
without handling: every other target catches, or goes through `CubeController.refresh` / Ad Hoc
`#run`, which catch and report.

**M2. A warehouse session ends mid-analysis with no way back but reloading.** Tokens live 1 hour;
`warehouse.ts` turns a 401 into "the warehouse session has expired — sign in again", but nothing
offers a sign-in: the Live plane just fails from then on. Needs re-authentication in place (and,
with single sign-on, silent renewal before expiry).

**M3. No Content Security Policy, and two things a strict one would block.** The pages carry no
CSP. Ready: no inline scripts, no inline event handlers, no `style=` attributes. Blocking: two
inline `<style>` blocks per page (move to CSS files or hash them). A shipped policy also needs
`wasm-unsafe-eval` (DuckDB, the planner), `worker-src 'self'`, and `connect-src` naming the
configured warehouse origins.

### LOW

**L1. The e-mail export trusts the report title in a MIME header.** `toEml` writes
`name="${attachment.name}"` where the name is `exportFileName(title, …)` (`export.ts:149`), and the
title is user- or source-supplied (a file name, `schema.table`): a `"` or a line break corrupts the
header. Also its HTML part is `<html><body><p></p><body></html>` (the second `<body>` should close).

**L2. Typing debt worth a review pass:** 4 `as unknown as` casts and 24 non-null assertions in
`src` (no `any`, no `@ts-ignore`, no TODOs anywhere).

## Checked and solid

- **Markup injection:** one `innerHTML` in the product (`app.ts:2064`, the chart), and every
  data-derived string in `chart.ts` goes through `esc` (which escapes quotes, for attributes);
  colours come from a fixed palette. No `eval`, no `new Function`, no `document.write`.
- **Links in cells:** `linkFor` (`grid/columns.ts`) accepts only `http:`/`https:`; opened with
  `target=_blank rel="noreferrer noopener"`.
- **Exports:** CSV and clipboard TSV guard formula injection (a leading `=`, `@`, tab, CR, or a
  `+`/`-` that is not a plain number gets an apostrophe); HTML and SpreadsheetML escape every
  value, header and title.
- **Secrets:** the warehouse token is held in memory only (the password is sent once, never
  kept); remote-file credentials are never read from the URL (`boot.ts`, deliberately); S3 secrets
  are quoted into DuckDB's `CREATE SECRET`, not stored.
- **External hosts:** after this change, the page contacts only its own origin (measured) and the
  servers its configuration names.
- **Lifecycle:** window/document listeners are removed on dispose; the planner worker is
  terminated; the only cross-context messaging is the page and its own planner worker.
- **Hygiene:** no `any`, no suppressions, no TODOs, no empty `catch` blocks; the one `console`
  call is behind the debug-mode setting.
- **Numbers:** integers and decimals beyond 2^53 stay exact as text; counts format in the viewer's
  locale.
- **Accessibility, at the attribute level:** grid roles, `aria-rowindex`/`colindex`/`rowcount`,
  labels, expanded and pressed states.

## Not yet covered (the next passes)

1. **Browser support of the planner module:** it is WebAssembly GC with exception references (the
   Node tests need `--experimental-wasm-exnref`); which WebKit and Gecko browser versions run it is
   unmeasured. Possibly a hard floor for who can use the page.
2. **Keyboard-only and screen-reader use** of the grid, the menus and the editors (attributes are
   present; behaviour is untested).
3. **Scale:** profile the main thread at the row caps; memory across repeated snap/release.
4. **A full logic read** of the largest files (`app.ts` 3,231, `filter-editor.ts` 1,453,
   `grid.ts` 1,432, `serialize.ts` 1,406 lines).
5. **Internationalisation:** every user-facing string is English, inline.

## Proposed order

H1 (a correctness bug users hit today) → M1 (small) → M2 → H2 and M3 together (the production
build and hosting leg) → L1, L2 → the next passes, starting with browser support.

---

# Pass 2: every line, many auditors, adversarially verified (2026-09-26)

Full catalogue: [`DATACUBE_AUDIT_PASS2_FINDINGS_2026_09_26.md`](DATACUBE_AUDIT_PASS2_FINDINGS_2026_09_26.md)
(417 defects with evidence, scenario and fix; entries `P2-n`; appendix of refuted reports).

## Method

- **Slice readers (32):** each read every line of one slice. Together they cover every file of `src/`, `demo/`, `test/`, the
  CSS, the build files and `bench/`; `app.ts` was split three ways.
- **Lens sweeps (9):** each followed one concern across all files: security; dates and numbers; async and cancellation;
  failure handling; accessibility; performance and memory; saved state; browser support; API contracts (the warehouse
  client was checked against the server's Java).
- **Gap round (8 audits):** a completeness critic read every coverage statement and named 8 under-examined cross-file flows:
  - aggregate matrix;
  - planner verdicts;
  - upload to grid names;
  - Ad Hoc and host interplay;
  - Live-versus-Snap fidelity;
  - snap lifecycle races;
  - engine plane parity;
  - sort, limit and order semantics.

  Each got its own auditor.
- **Verification:** each of the 687 reports went to a verifier told to refute it. HIGH and CRITICAL reports got three
  (re-read the code; trace reachability from the shipped page; run it), and at least two had to uphold. 671 were upheld, 13
  refuted (Appendix A of the catalogue); 3 were verified late.
- **Merge:** reports of the same defect from different angles were merged into **417 distinct defects: 2 CRITICAL, 36 HIGH,
  182 MEDIUM, 197 LOW**. 204 were reproduced by running the real product code (jsdom, the real WASM planner, DuckDB), not
  only by reading.
- **Read-only:** nothing was fixed. Repro scripts live in the job's scratch directory, not the repository.

**Checked by me, not only by the agents:** I re-ran both CRITICAL repros on the real product code.

- P2-36: a grid whose leaves are `[pnl, notional, desk]`. Selecting `notional` copies `desk`.
- P2-4: `serialize()` emits
  `…->pivot(~[year], ~[notional:…->average()])->cast(…)->groupBy(~[region], ~['2021__|__notional':…->average(), …])`:
  an average of per-(region, desk) averages.

**Caveats, stated plainly:**
- MEDIUM and LOW reports had one verifier, and the refute rate was low (13 of 684). Expect some of the LOWs to be judgement
  calls rather than defects.
- Whether the upstream DataCube re-aggregates a grouped pivot the same way (P2-4) is **not checked**: no upstream checkout
  is on this machine. Ours is wrong either way.

## Relation to pass 1

Pass 2 absorbs pass 1:

| pass 1 | where it went in pass 2 |
|---|---|
| H1 (timestamps) | leg 4, together with DATE shown as the previous day east of UTC (P2-50) and time-zone-aware timestamps (P2-52) |
| H2 (the build) | leg 15, which adds that `//datacube:dist` is absolute symlinks into the builder's cache (P2-349) |
| M1 (drill errors) | leg 3 |
| M2 (re-sign-in) | leg 10 |
| M3 (security policy) | leg 2 |
| L1, L2 | legs 8 and 16 |

## Status of the legs

- **Leg 1 (re-aggregation) and the pivot parts of legs 3, 7, 11, 12, 14: LANDED 2026-09-27**
  (`DATACUBE_CUBE_PLAN_DESIGN_2026_09_27.md`). A pivot is two plain queries: its values, then
  one `groupBy` with a conditional aggregate per value; the Total is a column of the same
  query. Entries closed, each proven by a row check or the named test:
  - P2-0, P2-1, P2-2, P2-3, P2-4 (CRITICAL), P2-5, P2-6, P2-7, P2-8;
  - P2-16, P2-20, P2-81, P2-82, P2-91, P2-99;
  - P2-128, P2-134, P2-211, P2-216, P2-217;
  - P2-386, P2-397, P2-399, P2-415.

## CRITICAL and HIGH

| entry | severity | reproduced | defect |
|---|---|---|---|
| P2-0 | HIGH | yes | A learned pivot cast survives filter changes: a filter that removes a pivot value fails with a binder error and is rolled back, and clearing a filter silently drops pivot columns |
| P2-1 | HIGH | yes | Sorting a pivot column in a grouped and pivoted cube makes every group expansion fail, and the cube stays stuck until the sort is cleared |
| P2-4 | CRITICAL | yes | A cube that is both grouped and pivoted shows wrong average, count, median, stdDev and variance cells, because the outer groupBy aggregates the pivot's partial results a second time |
| P2-5 | HIGH | yes | Rows whose pivot key is NULL silently drop out of every pivot cell but still count in the pivot Total, so the cells never add up |
| P2-6 | HIGH | yes | Sorts that name a column the pivot consumes or never selects are still emitted after the pivot, so the planner refuses a pivot or unpivot on any sorted cube |
| P2-7 | HIGH | yes | Setting count on a column in Column Properties, then pivoting a measureless cube, splits each group into one row per distinct value of that column |
| P2-8 | HIGH | yes | A weighted-average or unique-value aggregate anywhere on the cube makes the whole cube impossible to pivot, and the planner's error message is misleading |
| P2-36 | CRITICAL | yes | Copy (Ctrl+C and the menu) and the selection sum/avg/min/max read a different column from the one highlighted whenever columns are hidden, reordered, pivoted or folded into the tree |
| P2-50 | HIGH | yes | DATE values are written out as UTC instants, so CSV, spreadsheet, clipboard copies, the drill overlay and the cell tooltip show the previous day for users east of UTC |
| P2-51 | HIGH | yes | A date filter does not survive Save View/Load View or the JSON export: it comes back as a UTC ISO string, so the reopened view either fails to plan or filters the previous day |
| P2-52 | HIGH | yes | TIMESTAMP WITH TIME ZONE columns are modelled as zone-less TIMESTAMP, so filters, drills and date parts depend on the server's zone on Live and on DuckDB-WASM's fixed offset and ICU load state on Snap |
| P2-59 | HIGH | yes | Large DECIMAL values arrive as strings, so the chart, spreadsheet export, selection sum, heatmap and default formatting silently skip them |
| P2-70 | HIGH | yes | A saved view keeps only the query shape: Load View never reads the saved column formats and order, and hidden columns, display names, widths, appearance and title are never saved at all |
| P2-71 | HIGH | yes | persist.load rebuilds the snapshot from an allow-list, so tree sort, pivot-total aggregates, leaf/child counts and kept grouped columns silently revert on load (the Total column can show SUM where AVERAGE was saved) |
| P2-72 | HIGH | yes | Load View merges the saved snapshot onto the CURRENT session's configuration, so the session's aggregates, column kinds and row limit override what the view saved |
| P2-80 | HIGH | yes | The snap table's source leaks into the app's own snapshot, so after Snap, any edit, then Live, every query reads the dropped snap table and the cube stays broken until reload. Saved views also record the snap table. |
| P2-81 | HIGH | yes | Nothing limits how many columns a pivot makes, so dragging a high-cardinality dimension to Columns freezes the tab for many seconds |
| P2-82 | HIGH | no | Live mode on the warehouse refuses every column pivot with FORBIDDEN, and the user sees a raw execution error |
| P2-99 | HIGH | yes | Undo gets stuck on a grouped and pivoted cube: the automatic cast re-run records its own undo step, so Undo lands on it and re-runs forward |
| P2-128 | HIGH | yes | Drill-through ignores the clicked column: on a pivoted cube, a cell's drill lists the rows for every pivot value, not the rows behind that cell |
| P2-144 | HIGH | yes | The Filters window stays open with an old copy of the filter, and its Apply/OK overwrites any filter change made elsewhere since it opened |
| P2-145 | HIGH | yes | Every edit rebuilds the whole filter editor, so the first click on OK/Apply after typing a value is lost and keyboard focus jumps to <body> |
| P2-187 | HIGH | yes | Dimensions editor: renaming a dimension or clicking Add after editing its hierarchy discards the hierarchy edits |
| P2-204 | HIGH | yes | After a cell is clicked, wheel or trackpad scrolling keeps snapping back to that cell |
| P2-220 | HIGH | yes | Every title-bar rebuild adds another document keydown listener, so one Ctrl-Z/Ctrl-Y undoes or redoes several steps, and dispose() leaves the extra listeners driving a dead cube |
| P2-237 | HIGH | yes | All pinned and row-label columns stick at left:0 (or right:0) with no offsets, so after a horizontal scroll they stack on top of each other and a pinned column covers the row labels |
| P2-255 | HIGH | yes | Plot and Treemap chart every displayed tree row, so subtotals (and the grand total) are drawn beside their own children and treemap areas are double-counted |
| P2-256 | HIGH | yes | Plot and Treemap plot the first numeric column in raw result order, which can be a hidden column, a year/key column or one pivot slice, and never say which measure they drew |
| P2-259 | HIGH | yes | A failed Ad Hoc step is still committed to the session, so the screen and the session disagree, and retrying the step paints the old numbers under the new POV |
| P2-260 | HIGH | yes | Changing an Ad Hoc option re-places old answers on a grid whose POV or members have changed, so stale numbers appear under the new POV with no query and no marker |
| P2-274 | HIGH | yes | Ad Hoc Analysis sums every measure and ignores the aggregation set in Column Properties (avg, wavg, max...), so its figures differ from the cube's |
| P2-286 | HIGH | yes | Ad Hoc queries skip the Snap source rewrite, so Ad Hoc reads live rows under a 'Snapped' badge, or fails on a dropped snap table after Live |
| P2-287 | HIGH | yes | The cube's Filter button stays on screen under the Ad Hoc grid and shows 'Filter (on)', but the Ad Hoc numbers ignore the filter, even after Refresh |
| P2-298 | HIGH | yes | Engine plane passes date cells through as strings, so outside UTC, expanding or drilling into a date group queries the wrong day, and the 'Date' format shows the previous day |
| P2-305 | HIGH | yes | Opening a warehouse table or uploaded file runs an unlimited flat query that pulls the whole source into the tab |
| P2-306 | HIGH | yes | TIME columns are declared String and show raw microsecond counts (09:30:00 becomes 34,200,000,000); expanding a group and text filters then fail. BLOB and INTERVAL values also show internals |
| P2-339 | HIGH | yes | A ?warehouse= link picks where the warehouse password is sent, overriding config.json, and the attacker's host is then remembered for later visits |
| P2-349 | HIGH | yes | The //datacube:dist deploy folder is 9 absolute symlinks into the builder's Bazel cache plus one real file, so a copied deployment is dead links |

### Systemic themes

**T1. The product does not know how each measure combines, so some totals are wrong.**
Totals come out wrong in several places. Average, count, median and the spread measures are summed a second time in grouped and pivoted cubes. Rows with a missing pivot key count in the total but in no cell. A second measure on the same column disappears. A running window with no order quietly becomes a whole-group total. Drill-through lists rows for every pivot value instead of the clicked cell. Ad Hoc Analysis sums everything, whatever the configured aggregate. A filter taken from a subtotal row filters source rows by the subtotal.
*Root cause:* a measure is stored as a function name. Nothing says whether its partial results can be combined again, and if so how (sum of sums; count as a sum of counts; average as sum over count; median not at all). Each consumer (second pivot stage, child groups, Ad Hoc, drill, context menu) makes its own guess. Nothing checks the results against a reference, so the guesses were never caught.
*Entries:* P2-4, P2-5, P2-9, P2-11, P2-13, P2-128, P2-135, P2-158, P2-273, P2-274, P2-309, P2-315

**T2. Query stages are joined by column-name lookups, with no record of which columns exist at each stage.**
The query builder chains filter, group, pivot, second-stage cast, sort and limit by name. It never records which columns each stage consumes, produces or removes. The result is a long run of refusals and silent drops:
- a sort on a column the pivot consumed;
- a filter on a calculated column that the child query dropped;
- a learned pivot cast that outlives the filter it came from;
- a measure looked up under the wrong key;
- menu entries that offer filters, sorts or axes on columns that do not exist at that stage.

*Root cause:* no stage-by-stage column list exists that both the query builder and the UI can ask "is this column available here?". Checks happen only when the planner refuses the query, after the user has acted.
*Entries:* P2-0, P2-1, P2-2, P2-3, P2-6, P2-7, P2-8, P2-10, P2-14, P2-15, P2-16, P2-17, P2-18, P2-19, P2-20, P2-21, P2-22, P2-23, P2-24, P2-117, P2-124, P2-132, P2-133, P2-134, P2-136, P2-153, P2-155, P2-156, P2-160, P2-161, P2-272

**T3. Values and names lose their type or escaping when they move between layers.**
Dates become instants at local midnight, so users east of UTC see the previous day. Years 0-99 turn into 1900s, and days in a daylight-saving gap become 01:00. Time-zone-aware timestamps are treated as zone-less. Large decimals and big integers become strings in one path and doubles in another, so sums skip them or drop digits. Time, interval and some timestamp and unsigned types are declared as text. Column and table names are not quoted consistently: reserved words, `true`, `milestoning`, `__proto__`, line breaks, and names that collide with internal markers. The NULL-group marker and the pivot separator are ordinary strings that real data can contain.
*Root cause:* there is no single typed cell value and no single quoting function. Each layer (reader, tree keys, filters, formatter, saved views, remote engine) converts values itself, through the browser's date object, floating-point numbers or plain text. Internal markers share a namespace with user data.
*Entries:* P2-12, P2-25, P2-26, P2-27, P2-28, P2-29, P2-31, P2-32, P2-33, P2-34, P2-35, P2-40, P2-50–69, P2-118, P2-119, P2-120, P2-125, P2-130, P2-148, P2-149, P2-154, P2-196, P2-212, P2-216, P2-217, P2-258, P2-298, P2-300, P2-306, P2-307, P2-308, P2-314, P2-317, P2-318

**T4. Copy, export, chart and drill rebuild from the raw result, not from what is on screen.**
Copy reads a different column from the one highlighted. Exports include hidden and internal columns and ignore labels and formats. Charts draw subtotals next to their own children and plot whichever numeric column comes first. Blur, rename and hide settings are dropped for pivoted columns, so blurred figures show in the clear. Row caps (500 in drill, 50 in charts, the row limit in exports) are never mentioned in the output.
*Root cause:* no single "displayed grid" model exists (visible columns in order, labels, formats, row kinds, masking, truncation) for every output to read. Each output re-derives these from result column indexes, and column settings are keyed by raw names that pivoting renames.
*Entries:* P2-36, P2-37, P2-38, P2-39, P2-41, P2-42, P2-43, P2-44, P2-45, P2-46, P2-47, P2-48, P2-49, P2-129, P2-211, P2-253, P2-255, P2-256, P2-257

**T5. Cube state has many owners and no single commit or rollback.**
Copies of the query snapshot and configuration live in the app, the controller, each open panel, the history stack, saved views and the Ad Hoc session. A refused change rolls back one copy but not the others. Undo records machine-generated re-runs as steps. Saved views keep only part of the state and are merged onto the current session. Overlapping async work (undo, refresh, drill, the Ad Hoc steps, sign-in) has no "latest wins" guard. Ad Hoc keeps the hidden cube's menus, filter, status and save.
*Root cause:* no single immutable state is replaced atomically on success and restored whole on refusal. Each component holds its own snapshot captured when it was built.
*Entries:* P2-70–79, P2-99–110, P2-127, P2-131, P2-144, P2-150, P2-152, P2-169, P2-170, P2-171, P2-187, P2-210, P2-220, P2-221, P2-259, P2-260, P2-261, P2-268, P2-269, P2-270, P2-280, P2-282, P2-283, P2-284, P2-287, P2-288, P2-289, P2-290, P2-291, P2-297, P2-299, P2-330, P2-334, P2-337

**T6. Snap is a source rewrite inside the query state, and each data source's capabilities are never declared.**
Snap writes the snap table's name into the shared snapshot, so after Snap, then an edit, then Live, the cube keeps reading a dropped table. Ad Hoc skips the rewrite and reads live rows under a "Snapped" badge. Snap copies go through a different type path, so enum order, UUID filters and collation change after a snap. Going Live drops the frozen copy before checking that Live works. The warehouse and the remote engine refuse pivots that the UI offers anyway.
*Root cause:* which data a cube is reading (the source, and whether it is live or a frozen copy), and what that source can do, is not a first-class, typed part of the cube. It is threaded through query text and host globals.
*Entries:* P2-80, P2-82–95, P2-97, P2-98, P2-286, P2-301

**T7. Nothing bounds work, memory or server resources.**
Examples:
- Opening a table runs an unlimited query that pulls the whole source into the tab.
- Pivot columns are uncapped.
- Tree refresh re-runs every open level, one after another.
- Grid assembly is quadratic, the Ad Hoc grid builds a full cross product, and member lists are spread into function arguments.
- Uploads stay resident for the life of the tab.
- Cancelling a query in the tab's database does not stop it.
- Abandoned warehouse statements hold server workers and results.
- Plan caches grow without limit.

*Root cause:* no budget exists (rows, cells, columns, queries per action, bytes held) that is enforced at the boundary and shown to the user. Cancellation is signalled but never reaches the component doing the work.
*Entries:* P2-81, P2-96, P2-111, P2-112, P2-122, P2-123, P2-202, P2-206, P2-213, P2-214, P2-265, P2-266, P2-267, P2-275, P2-276, P2-277, P2-278, P2-292, P2-293, P2-295, P2-305, P2-310, P2-312, P2-313, P2-316, P2-322, P2-343

**T8. Panels rebuild their controls instead of updating them, and keyboard, focus and contrast were never designed in.**
Every change rebuilds whole panels from values captured when they were first built. As a result, focus drops to the page, the first OK after typing is lost, dropdowns read stale maps, colour pickers revert their partner, and listeners pile up. Menus, windows, the column selector, the dimensions list and Ad Hoc headers are unusable or partly usable from the keyboard. Controls lack accessible names. Selection and focus colours are near-invisible, there is no forced-colors support, and pinned columns stack on top of each other.
*Root cause:* no component model with persistent controls and focus ownership exists, and there is no accessibility or contrast baseline in the design tokens or tests.
*Entries:* P2-113, P2-114, P2-115, P2-116, P2-121, P2-137–143, P2-145, P2-146, P2-147, P2-151, P2-157, P2-159, P2-162–168, P2-172–186, P2-188–195, P2-197–201, P2-203, P2-204, P2-205, P2-207, P2-208, P2-209, P2-215, P2-218, P2-222–252, P2-254, P2-262, P2-263, P2-264, P2-271, P2-279, P2-281, P2-285, P2-332

**T9. The trust boundary and the shipped artifact are demo-grade.**
- Query-string parameters choose where the warehouse password goes, and that host is then remembered. Other parameters choose which server or data file the trusted page shows.
- Every SQL statement is logged to the console, including secret keys.
- The dev server skips Host checks and crashes on ordinary requests.
- The deploy folder is absolute symlinks into one builder's cache, and it ships without fonts or licence text.
- The page needs runtime extension downloads.
- Browser feature floors are unstated, and boot failures leave a blank page.

*Root cause:* the demo host is the product host. Configuration trust, the deployment packaging and the start-up error path were never designed as product surfaces.
*Entries:* P2-30, P2-294, P2-296, P2-302, P2-303, P2-304, P2-311, P2-319, P2-320, P2-321, P2-323–329, P2-331, P2-333, P2-335, P2-336, P2-338–342, P2-344–349, P2-351–358

**T10. Tests check query text and non-emptiness, not rows. The browser never runs in a gate.**
The two-stage pivot is tested only on its text and only with sum. The Live-versus-Snap and planner differentials skip exactly the queries and types that break. Every test runs in the UTC time zone. Browser harnesses are not in CI, use one browser engine, and many checks cannot fail: fixed sleeps, vacuous assertions, known-gap code that does nothing, and wrong row sums.
*Root cause:* verification checks shapes (text produced, file non-empty) instead of expected rows. The gate runs only in the conditions where these bugs are invisible.
*Entries:* P2-126, P2-219, P2-350, P2-359–413

### Proposed fix order (legs)

1. **Correct re-aggregation in the pivot-and-group query.** Give each aggregate a declared way to combine partial results. Build the second stage from it, and refuse a combination that cannot be computed. Add row-level tests with average, count and median.
   Entries: P2-2, P2-3, P2-4, P2-5, P2-9, P2-13, P2-309, P2-386, P2-397, P2-399
2. **Stop leaking credentials and masked figures.** Server addresses come only from page configuration. Validate the warehouse address (https, not the page's own origin). No SQL or secret logging. Blur and other column settings follow pivoted children. The dev server checks the Host header and binds to localhost only. Scope the storage credential per mount. Stop `literal()` from splicing unrecognised values into the query.
   Entries: P2-30, P2-211, P2-296, P2-319, P2-339, P2-340, P2-341, P2-345, P2-347
3. **Selection, copy and drill act on the cell the user sees.** Map selections through visible column order. Clear or clamp the selection when a result arrives. Treat big-number strings as exact values. Confirm clipboard writes. Paste tab-separated text with no byte-order mark. Drill pins the clicked pivot value and the single detail row. Fix sticky offsets so pinned columns stop covering row labels.
   Entries: P2-36, P2-37, P2-38, P2-39, P2-40, P2-41, P2-128, P2-132, P2-133, P2-237
4. **Dates and times as calendar values.** Build DATE values from their parts, not from local midnight. Keep the time zone on time-zone-aware timestamps. Type time, interval and timestamp-precision columns correctly. Add a test lane that runs east of UTC.
   Entries: P2-50, P2-51, P2-52, P2-53, P2-54, P2-55, P2-56, P2-57, P2-58, P2-298, P2-306, P2-307, P2-395
5. **Exact numbers and honest formatting.** One exact decimal or big-integer path through reading, stats, formatting, export and filters. Parse the remote engine's JSON losslessly. Fix the formatter defects: negative zero, integer averages rounded, scale boundaries, double percent, currency codes, the Text and Capitalize formats, tree labels and pivot sort order.
   Entries: P2-12, P2-59, P2-60, P2-61, P2-62, P2-63, P2-64, P2-65, P2-66, P2-67, P2-68, P2-69, P2-120, P2-148, P2-149, P2-216, P2-217, P2-300
6. **Ad Hoc answers the question on screen.** Commit a step only when its query succeeds, and never re-place old answers after the point of view changes. Honour the configured aggregates, calculated columns, the cube filter and Snap. Save, Load, status and menus act on the Ad Hoc session or are hidden.
   Entries: P2-259, P2-260, P2-261, P2-268, P2-269, P2-270, P2-272, P2-273, P2-274, P2-280, P2-282, P2-283, P2-284, P2-286, P2-287, P2-288, P2-289, P2-290, P2-291, P2-401
7. **Silent meaning changes.** An unordered running window is refused, not widened to the whole group. The last-value frame is fixed. No value filters from subtotal rows or pivot result cells. NULL groups filter as NULL and are labelled. Replace the in-band NUL markers. Give row limits a total order. Refuse calculated-column names that differ only by letter case.
   Entries: P2-11, P2-117, P2-118, P2-119, P2-125, P2-130, P2-134, P2-135, P2-136, P2-154, P2-158, P2-315
8. **Exports and charts match the grid and say when they are cut.** Every output reads one displayed-grid model: visible columns in order, labels, formats, leaf rows only. Every output states when it was capped. Fix text encoding and column widths in document export, entity-safe sheet names, tab and newline escaping in text export, and export error reporting.
   Entries: P2-42, P2-43, P2-44, P2-45, P2-46, P2-47, P2-48, P2-49, P2-129, P2-253, P2-255, P2-256, P2-257, P2-258, P2-370
9. **Saved views round-trip.** Save the full state (formats, order, hidden columns, labels, widths, tree state), with a version and a record of which source it belongs to. Load it as a whole replacement, not a merge. Keep unknown fields. Guard storage writes.
   Entries: P2-22, P2-70, P2-71, P2-72, P2-73, P2-74, P2-75, P2-76, P2-77, P2-78, P2-79, P2-150
10. **One state owner with transactional apply and supersession.** Apply succeeds or rolls back as a whole across app, controller and panels. Machine re-runs are not undo steps. A latest-wins guard covers undo, refresh, drill and sign-in. Every host listener is removed on dispose. Editors apply against live state.
    Entries: P2-99–110, P2-114, P2-127, P2-131, P2-144, P2-152, P2-169, P2-170, P2-171, P2-187, P2-210, P2-220, P2-221, P2-297, P2-299, P2-330, P2-334, P2-337
11. **Snap and data sources as first-class.** Keep the source rewrite out of the shared snapshot. Check Live before dropping the frozen copy. Give each snap its own target, and drop failed or superseded snaps. The snap copy keeps enum order, UUID and collation. Each data source declares its capabilities and the UI hides pivots a source cannot run. Test the full host lifecycle.
    Entries: P2-80, P2-82–95, P2-97, P2-98, P2-301, P2-396, P2-398
12. **A column list for each query stage.** Record which columns each stage consumes and produces. Use it in the query builder and in every menu and editor that offers a column. Remove dead snapshot fields and exports.
    Entries: P2-0, P2-1, P2-6, P2-7, P2-8, P2-10, P2-14–21, P2-23, P2-24, P2-124, P2-153, P2-155, P2-156, P2-160, P2-161
13. **Names, escaping and ingest.** One quoting function for every name and literal. Reserve a separate namespace for internal columns. Report header renames. Offer a header option on upload, sample the whole file or report the failing row, and handle upload names that collide with a mounted view.
    Entries: P2-25, P2-26, P2-27, P2-28, P2-29, P2-31, P2-32, P2-33, P2-34, P2-35, P2-196, P2-212, P2-308, P2-314, P2-317, P2-318
14. **Bounds on work and memory.** A default row cap on open. Caps on pivot cells. One query per tree refresh, not one per open level. Linear grid assembly. Real cancellation in the tab's database and on the server. Release uploads and snaps. Bounded caches and member lookups. Presentation-only changes do not re-query.
    Entries: P2-81, P2-96, P2-111, P2-112, P2-122, P2-123, P2-202, P2-206, P2-213, P2-214, P2-265, P2-266, P2-267, P2-275, P2-276, P2-277, P2-278, P2-292, P2-293, P2-295, P2-305, P2-310, P2-312, P2-313, P2-316, P2-322, P2-343
15. **A real artifact that boots honestly.** Build a self-contained deploy folder in CI, with fonts, licence text and a pinned in-tab database version. Bundle extensions or declare them. State and check the browser feature floor. Show visible boot and worker errors, and write errors for end users rather than developers. Make the dev server robust. Remove demo-only menus and synthetic data from the shipped page.
    Entries: P2-294, P2-302, P2-303, P2-304, P2-311, P2-320, P2-321, P2-323–329, P2-331, P2-333, P2-335, P2-336, P2-338, P2-342, P2-344, P2-346, P2-348–358
16. **Panels and forms that update in place.** Persistent controls that read live state. Validate and reject bad numbers instead of clamping them silently. Show status inside the page. Fix the individual panel, selector and column-editor defects.
    Entries: P2-113, P2-115, P2-116, P2-121, P2-145, P2-146, P2-147, P2-151, P2-157, P2-159, P2-162–168, P2-172–183, P2-185, P2-186, P2-188, P2-189, P2-190, P2-192, P2-193, P2-194, P2-197–201, P2-203, P2-207, P2-215, P2-218, P2-222, P2-223, P2-262, P2-263, P2-332
17. **Keyboard, screen reader, contrast and layout.** Labelled dialogs with focus management. Menu and tree keyboard models. Accessible names on controls. AA-contrast tokens and forced-colors support. Touch access to the context menu. Left-to-right pinning, reduced motion, and the zoom and mobile layouts.
    Entries: P2-137–141, P2-143, P2-184, P2-191, P2-195, P2-204, P2-205, P2-208, P2-209, P2-224–236, P2-238–252, P2-254, P2-264, P2-271, P2-279, P2-281, P2-285
18. **Tests that can fail.** Browser harnesses run in the gate on more than one browser engine. Replace sleeps with waits on the result epoch. Assert rows and contents, not text or non-emptiness. Fix or delete vacuous checks.
    Entries: P2-126, P2-142, P2-219, P2-350, P2-359–369, P2-371–385, P2-387–394, P2-400, P2-402–413

### Verdict

This should not ship to real users until the following are true:
- **Pivot-and-group totals:** they are correct for every offered aggregate, or the combination is refused. A row-level test with average, count and median proves it.
- **Copy, selection and drill:** they act on the cells highlighted, including after hide, reorder and pivot.
- **Blur:** it survives pivoting.
- **Credentials:** the warehouse address cannot be set from a link, and neither credentials nor SQL are logged.
- **Dates and decimals:** they are exact and on the right day for users outside UTC, proven by a test lane that does not run in UTC.
- **Ad Hoc:** its figures use the cube's aggregates, filter and data source, and it never shows stale answers under a new point of view.
- **Snap:** the source rewrite no longer leaks into shared state, and Live does not destroy the frozen copy on failure.
- **Row caps:** every capped view, export, chart and drill says so.
- **Saved views:** they round-trip, or Save/Load is hidden until they do.
- **Refused changes:** a refusal leaves one consistent state across screen, configuration and undo history.
- **Deployment:** CI builds and loads the deployable folder in a browser, with the default open capped, and states which browsers are supported.

Until then, the honest label is "internal preview on trusted data". The accessibility, performance and panel defects can follow, but the keyboard and contrast baseline must land before any user who depends on it is expected to use it.
