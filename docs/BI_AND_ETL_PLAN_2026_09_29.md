# The best BI tool and the best visual ETL tool: the plan (2026-09-29)

**The goal (the user, 2026-09-29).** Make DataCube a complete BI, dashboard and visualization tool, with
every export and email format actually correct. Then build a visual ETL tool on the same platform, with a
canvas, drag and drop, and a DAG builder. Both should be the best of their kind.

**How this plan was made.** Three read-throughs of the code on 2026-09-29, the same day: the exports and
email (actual output parsed with pypdf, Python's `email` package and an XML parser); charts and dashboards
against `docs/DATACUBE_DASHBOARDS_DESIGN_2026_09_28.md`; and the platform's ETL foundations in `core/` and
`warehouse/`. §1's facts come from that reading, with file references, and they replace anything older.

**What this plan is not.** It is not a schedule. Sizes are relative (S, M, L, XL: roughly days, a week, a
few weeks, a month or more). And it does not override `docs/IN_FLIGHT.md`: the DataCube programs are
paused while the compiler rebuild runs. §8 says what can go ahead alongside the rebuild, and what needs the
rebuild's areas.

---

## 0. What "best" means here

Other tools have more features. We aim to beat them on six things.

1. **Governed meaning.** A metric is defined once, in the Pure model, and every cube, chart, export and
   pipeline uses that one definition. Other BI tools add a semantic layer on top afterwards (LookML, DAX,
   dbt metrics). For us the model is the semantic layer.
2. **One compiler everywhere.** The browser planner (WebAssembly) and the server run the same
   `Compiler.plan`, held equal by differential tests. A preview, a dashboard tile and a scheduled pipeline
   therefore get the same SQL and the same answer.
3. **The database does the work.** Our standing rule is "Java orchestrates, the database executes". A
   chart only draws rows the database has already aggregated, and an ETL step is SQL run where the data
   lives (ELT). Nothing is copied into a middle tier.
4. **Proof of every number.** Receipts show what ran, where, and as whom (the server's statement id,
   checkable against its history). Snaps give a fixed point in time ("reconciled against the 09:00 snap").
   No other tool offers this.
5. **Correct before clever.** An export shows what the grid shows, in a real file of the format it claims
   to be. A failure is stated, never papered over. The browser harnesses assert what the output *is*, not
   only that a file appeared.
6. **Code is the source of truth, and the canvas is a view of it.** A pipeline or dashboard is a document
   that can be reviewed in a diff (Pure plus JSON). The canvas edits that document in both directions.
   That is how we avoid the spaghetti that every visual ETL tool ends up with.

---

## 1. Where we are (read on 2026-09-29)

### 1.1 Exports and email: wrong today, and wrong data first

Upstream DataCube enables only Excel (a real `.xlsx`) and CSV (for the grid, plus the full result through
the engine), and it emails only Excel and CSV. We offer more formats, and none of them is fully right.

| Format | What it produces today | Verdict |
|---|---|---|
| CSV (Grid) | Correct RFC 4180 quoting, BOM, CRLF and formula guard | **Wrong columns and headers** (below) |
| Excel (Grid) | SpreadsheetML 2003 XML, named `.xls` | **Not a real Excel file.** It can be malformed: the 31-character sheet-name cut can split an `&amp;` in half, and NaN is written as a number. It shows dates without times and applies no number formats |
| HTML, Plain Text | Formatted, with display names | Wrong columns; flat headers; no hierarchy |
| PDF | A hand-written PDF 1.4 | **Corrupt on any non-ASCII character** (é, ü, £): `/Length` and the xref offsets are counted in JS characters, not bytes. `€`, `—` and `…` become `?`. Text overlaps on wide cubes. Always A4 portrait |
| Cube File (JSON) | The page document | Fine |
| Email (.eml draft) | MIME with a base64 attachment | No `MIME-Version`; bare LF line endings; empty `Subject`; filename not RFC 2231 encoded; `<body></html>`; the PDF attachment inherits the corruption |

What every format gets wrong:

- **It exports `view.rows`, every column the query returned, not what the grid shows** (`app.ts` ~2652-2672).
  - Hidden columns are exported.
  - **Blurred columns are exported in the clear: a sensitive-data leak.**
  - The grouping columns the grid hides are exported.
  - The user's column order is ignored.
- Headers are internal names (`__tree`, `A__|__total`), with no multi-level pivot headers.
- Tree depth and subtotal rows cannot be told apart.
- Truncation at the row limit is never mentioned.
- There is no export of the full result (upstream's "CSV" runs the whole query through the engine).

The harness checks only that a file was downloaded with the right extension, which locks in `.xls`.

### 1.2 Charts and dashboards: further along than the design doc says

The design doc still says "nothing built". Seven commits since then built:

- **Charts on ECharts 6:** bar (vertical or horizontal; stacked, grouped or 100%), line, area, scatter,
  donut and heatmap.
  - An options panel with top-N (and a note when it cuts).
  - Charts follow the cube until frozen.
  - Click-to-filter works.
  - 22 node SVG tests.
- **A tile board:** a 12-column grid with drag, resize, keyboard moves and announcements. Tests:
  `tile-layout.test.ts` 76, `board.test.ts` 13.
- **Save and share:** a page document in IndexedDB, and a `#p1.` share link.

Missing:

- **Charts:**
  - treemap is still the old SVG overlay;
  - no histogram, box plot, combo/dual axis, small multiples, KPI tile or map;
  - several measures in the options UI;
  - dark theme;
  - keyboard access to marks;
  - large series (sampling, zoom);
  - lazy-loading (every grid pays about 218 KB gzipped for ECharts);
  - a browser harness for charts and the board.
- **Pages:**
  - It is **one cube's board**. The grid is a fixed anchor tile, and a chart can only come from its "+ Chart".
  - No page of several cubes, standalone chart tiles, page-level query scheduler, split or tab layouts, or
    view and edit modes.
  - Chart selections are **written into the cube's saved filter** (undoable, saved). They should be a
    context filter composed when the query is built.
  - No page filters, parameters or links across sources.
- **The design's blockers to several cubes on one page (§1.2):**
  - Open: #1 (keyboard shortcuts listen on the whole document); #3 (`dispose()` leaves the grid, charts
    and board alive); #4 (dialogs clip inside tiles); #5 (single callbacks, no event emitter); #8
    (module-level drag state); #9 (the demo host has one `#app`).
  - Resolved: #2.
- **Storage:** browser-only. Only file sources; no server store.

### 1.3 ETL foundations: good at planning, nearly absent at writing and running

- **Planning is strong.** The compiler supports:
  - filter, select, rename and extend;
  - joins (inner, left, right, full) and as-of joins;
  - union (concatenate), groupBy and aggregate, distinct;
  - sort, limit, drop and slice;
  - window functions (`over`: rank, lag/lead, running frames);
  - pivot (dynamic pivot as two queries where the engine lacks it), casts, flatten and project.
- **Unpivot is missing.**
- **The browser planner** already gives every node's output type and SQL, with no server (`plan`,
  `relationType`, `parse`, `print`).
- **Writing is absent.** `write` type-checks, but to a store table it throws "not yet implemented"
  (`Lowerer.java` ~3040); otherwise it only counts rows.
  - No `INSERT … SELECT`, `CREATE TABLE AS`, `MERGE`/upsert, `TRUNCATE` or incremental mode.
  - `dropAndCreateTableInDb` needs a model table and cannot create a table from a relation's type.
  - Inserts exist only for loading test data.
- **Core cannot reach the warehouse.**
  - There is no warehouse connection type.
  - A DuckDB `StaticDatasource` silently becomes an in-memory database.
  - `UsernamePassword` authentication throws.
  - No identity is passed through (server-program leg E1, paused).
  - Warehouse readers may run one `SELECT`; writing means running as an owner, and there are no
    `INSERT`/`CREATE` grants.
- **Nothing orchestrates:** no run model, scheduler, run history, retries or dependency ordering.
- **Lineage exists only for tests.** `ScanColumns`, `ScanRelations` and `PkInference` match the engine's
  test outputs; there is no output-column-to-source-column map and no graph across pipelines.
- **The API has gaps.**
  - Execute takes no parameter values.
  - No `jsonToGrammar/model`, no model-compile endpoint, no authentication.
  - `Service` elements are parsed but don't run (hosted services were deleted).
  - LSP gives diagnostics only.

---

## 2. Foundations both products need (track F)

Both products need these, and most of them are platform work in `core/` and `warehouse/`.

| # | Foundation | Size | Done when |
|---|---|---|---|
| F1 | **Write a relation into a table.** `write` lowers to `INSERT … SELECT`. Plus create-from-relation-type (`CREATE TABLE AS`), truncate-then-insert, and merge by key (upsert). All in one transaction, with a dialect rule each for DuckDB, H2 and Postgres. | L | A Pure `…->write(#>{db.t}#)` inserts the compiled rows on every dialect; a failed write leaves the table unchanged; tests in rows, not in SQL text |
| F2 | **Core to the warehouse** (server-program leg E1). A warehouse connection type (or a DuckDB `StaticDatasource` resolving to `jdbc:warehouse:`, never silently in-memory), `UsernamePassword` authentication with vault references, and the user's identity passed through. Warehouse write grants (`INSERT`/`CREATE` on a schema) so ETL does not need owners. | L | A model's runtime reads and writes warehouse tables as the signed-in user; a reader's write is refused by the warehouse; `//spec:corpus_warehouse` still passes |
| F3 | **Runs and schedules.** A run record (what ran, inputs, outputs, receipts, rows, duration, status). A scheduler (cron, on data change, on demand) with retries and backoff, run history and alerts on failure. Lives next to the warehouse, which already has identity and history. | L | A scheduled job runs as its owner, appears in run history with the warehouse's statement receipts, retries a transient failure, and pages on a final one |
| F4 | **Column lineage.** Output column to source columns through every relation step (from the typed tree), and a graph across saved functions, pipelines and dashboards. | M | "Where does `revenue` in tile 3 come from" answers down to physical columns; a pipeline's graph is drawn from lineage, not declared by hand |
| F5 | **API completeness.** Execute with parameter values, `jsonToGrammar/model`, compile/validate a model, authentication on `/api/pure/v1`. Also the query store (leg E2): saved queries and pages kept server-side, per user and shared. | M | The canvas and the dashboards need no private endpoints; a page saved on one machine opens on another |
| F6 | **Several cubes on one page** (blockers #1, #3, #4, #5, #8, #9). Scoped keyboard handling, full `dispose`, a `windowHost` for dialogs, an event emitter, no module-level state, a page host. | M | Two cubes on one page drag, undo and dispose independently; a Playwright check proves it |
| F7 | **Bundle and performance budget.** Lazy-load ECharts and the ETL canvas; a size budget in CI; a startup and interaction benchmark lane. | S | A grid-only page doesn't download ECharts; CI fails when the bundle grows past its budget |
| F8 | **The testing standard.** Every user-visible feature has a browser harness that asserts its *output* (parse the file, compare with the grid). Run the browser lane's harnesses in parallel, and cache Chromium (12.5 minutes down to about 6-7). | S | CI's browser lane is under 8 minutes; no feature ships with only a download-happened check |

---

## 3. Track A: exports and email, correct (do this first)

This is small, the user asked for it by name, and it fixes a real data leak.

| # | Item | Size | Done when |
|---|---|---|---|
| A1 | **One export model.** Build a single "what is shown" table from `view.columns.leaves` and the header rows: visible leaves in grid order, display labels, **blurred columns masked or refused**, the pivot's multi-level headers, a depth and kind for each row (group, subtotal, detail, grand total), and a truncation note. Every format reads from it. | M | For flat, grouped and pivoted cubes, each format's headers and cells equal the grid's; hidden and blurred columns never appear; this is tested |
| A2 | **Real `.xlsx`** (OOXML through `fflate`, which is already a dependency). Shared strings, styles taken from the column formats (currency, decimals, negatives in brackets, dates with times), booleans as booleans, outline levels for the tree, frozen header rows, merged pivot headers, a clean and then escaped sheet name. | M | The file opens in Excel, LibreOffice and Google Sheets (checked by parsing it and by a LibreOffice round trip in CI); number formats survive |
| A3 | **PDF from bytes.** WinAnsi encoding with lengths and offsets in bytes, and an embedded font subset for text outside WinAnsi. Landscape when wide, a font that scales or columns that wrap onto more pages, the title on every page or on none, and a repeated header row. `download` and `email` take `Uint8Array`. | M | A strict pypdf parse passes; é, €, CJK and `…` round-trip as text; a 40-column cube is legible |
| A4 | **Correct `.eml`.** `MIME-Version`, CRLF line endings, `Subject` from the title (RFC 2047), RFC 2231 filenames, a text and HTML body with a summary ("Trades — 29 rows, as of …, receipt …"), the real bytes in base64. | S | Python's `email` parser in strict mode is clean; it opens in Apple Mail and Outlook (checked once by hand and recorded); every attachment format decodes byte for byte |
| A5 | **Full-result exports** through the engine: CSV and Parquet of the whole query, streamed (DuckDB `COPY`, or the warehouse's CSV and Arrow). A clear choice between "what you see" and "the whole result". | M | A 5-million-row cube exports in full without the tab holding it; the file's row count equals the query's |
| A6 | **Charts and dashboards export.** PNG and SVG of a chart; a PDF of a page; the page's data as one workbook with a sheet per tile. | M | Exported images match the rendered chart; the page PDF has every tile |
| A7 | **Harness assertions.** `verify-features` parses every export (xlsx unzipped, PDF strict, eml decoded) and compares it with the grid. | S | A regression in any format fails the browser lane |

---

## 4. Track B: BI and dashboards

In order: each step makes the tool usable for something more.

### B1. Charts, complete (M0 finished) — L

**One chart spec under every chart** (agreed 2026-09-30). A chart is a small declarative description,
not a hand-written type:

- A mark (bar, line, area, point, arc, cell, box, …), and fields on the channels x, y, colour, size,
  facet and tooltip.
  - Each field has its aggregate, bin or time unit.
  - Sort, top-N with an "Other" bucket, and reference lines.
- **The database computes it:** the spec lowers to the cube's query (bins, quantiles, top-N and "Other"
  through the query builder), then to ECharts options.
- **Adding a type is a mapping, not a subsystem.**
- **Two ways to build the same spec, and a user can switch between them freely:**
  1. **From the grid (the fast path, ours).** The page has one **live chart**, badged "Following the
     grid", that re-draws as the grid is pivoted, grouped and filtered: Excel's PivotChart, for people who
     think in pivots.
     - **Pin** freezes a copy onto the page as a standalone tile. It keeps the *query and the spec*, not
       the data, so it still refreshes and still answers page filters and cross-filters (B3). Pivoting the
       grid never changes a pinned chart.
     - **Open in grid** takes a pinned chart's query back into the grid to re-pivot, then **Pin** again
       (as a new chart, or replacing it). No other tool has this round trip.
  2. **On shelves (the standard path).** A pinned chart is edited directly: drag fields onto channels, with
     a suggested chart type for the fields chosen. This is what Tableau and Power BI users expect.
- **Naming:** "Pin", not "Freeze" or "Snap". **Snap** stays the word for a data snapshot (a tab table).
- **Migration:** today's "Freeze" becomes Pin. Today's several chart tiles that follow the grid become one
  live chart plus pinned ones.

**Chart types and features:**

- Treemap moved onto ECharts. New types: histogram and box plot (binning and quantiles computed by
  **the database** through the query builder), combo/dual axis, small multiples, KPI tile (value, change,
  trend line), sparklines and bars inside grid cells, and later maps (geographic, from a region or
  latitude/longitude column).
- An options UI for several measures; reference lines and bands (target, average); annotations; a dark
  theme from design tokens; keyboard access to marks; sampling and zoom for large series (LTTB,
  `dataZoom`); an "other" bucket in place of a silent top-N cut.
- More types from the spec: sunburst, sankey, funnel, gauge, radar, waterfall and candlestick.
- **Done when:**
  - each type has node SVG tests and a browser check;
  - a 100,000-point series stays interactive;
  - axe-core finds no violations on a chart page;
  - a browser harness pivots the grid and sees the live chart change and a pinned one not change, then
    opens the pinned one in the grid and pins it back.

### B2. Pages — L (needs F6 and F7)

- A page is a document of **tiles**: grids, charts, KPIs, text and controls, over **several sources**.
- Standalone chart tiles have their own query, not only charts pinned to a grid.
- A page-level query scheduler: debounce, a cap on concurrent queries, per-tile staleness, and background
  tabs query when shown.
- Split and tab layouts and maximise; locked view mode vs edit mode; phone and tablet layouts.
- **Done when:** a three-source page with eight tiles loads with bounded concurrency, and resizes and
  edits without re-querying unaffected tiles; Playwright covers dragging a tile and a DataCube header
  inside it.

### B3. Interaction — L

- **Context filters:** selections compose into a tile's query when it is built, and are no longer written
  into the saved filter. Existing saved selections are migrated.
- Cross-filtering (click, brush, highlight on the emitting tile); **page filters with a scope**;
  **parameters** (date range, a pick-list, what-if values) bound into queries as Pure parameters (F5);
  named drill paths (region, then desk, then book); drill-through to rows; "filtered by …" badges; links
  across sources, declared, with suggestions.
- **Done when:** every interaction is undoable at page level, visible in badges, carried in the share
  link, and reproduced exactly by a saved page.

### B4. The semantic layer from Pure — L (the differentiator)

- Metrics and dimensions are **declared in the model**: a measure with its aggregate, format, description
  and certification; a dimension with its hierarchy.
- The cube offers them by name; ad hoc edits stay possible but are labelled as local.
- Metric definitions can be versioned and reviewed like code; "certified" badges; impact analysis (which
  pages and pipelines use a metric, from F4).
- **Done when:** changing a metric's definition in the model changes every tile that uses it, and the
  impact report lists them before the change lands.

### B5. Share and govern — M (needs F5)

- Server-side store: folders, owners, permissions, versions and history. Embedding (an iframe and a JS
  component) with the embedder's sign-in. Permissions follow the data: a viewer sees only rows the
  warehouse lets them read (already true for live queries).
- **Done when:** a page shared with a reader shows that reader's rows and nobody else's; its history
  restores any version.

### B6. Operate — M (needs F3)

- Scheduled delivery (email a page as PDF or xlsx at 8am, with receipts), alerts on a metric crossing a
  threshold, result caching per user (keyed by query and data version), a usage log, per-user query cost
  and timeout policy.
- **Done when:** a scheduled delivery arrives with correct attachments (track A) and its run is in
  history; an alert fires exactly once per crossing.

### B7. Beyond — later

- Natural-language questions over the governed model (NLQ is a separate line of work in `nlq/`, not
  ours); explanations of a change ("why did P&L move"); reconciliation workflows built on snaps and
  receipts.

---

## 5. Track C: visual ETL

This is ELT: a pipeline is a Pure program, the canvas edits it, and the database runs it.

### C1. Materialize a cube — M (needs F1 and F2; the first usable ETL)

- "Save as table": a cube's query becomes a **named Pure function**, and its result is written into a
  warehouse table (F1) with grants. Refresh on demand, then on a schedule (F3), with the last run's
  receipt.
- A materialized table is a source for the next cube, which already makes a pipeline.
- **Done when:** an analyst turns a cube into a scheduled warehouse table without writing code, and a
  second cube reads it.

### C2. The canvas — XL

- **A pipeline is a document of Pure functions**, one per node, composed into one relation expression.
  The canvas is a **view** of it and edits in both directions: move a node and the Pure changes, edit the
  Pure and the canvas redraws.
- Node types, each a relation function the compiler already has:

  | Kind | Nodes |
  |---|---|
  | Source | a model class, a store table, a file (through the warehouse's `import/`), another pipeline's output |
  | Transform | filter, select/rename, derive (a calculated column), join (with a join-key helper and cardinality warnings), union, aggregate, pivot, **unpivot (new native)**, dedupe, sort/limit, window, as-of join, cast, flatten JSON |
  | Sink | write to a table: create, replace, append, merge by key (F1) |
  | Check | data-quality assertions (below) |

- **Types flow live:** every node's output columns and types come from the browser planner's
  `relationType` as you connect it, so a broken connection is flagged at once. Every node has a
  **preview, which is a DataCube on that node** (sampled or snapped, with its receipt).
- Drag and drop from a palette and from source catalogs. Auto-layout, grouping into sub-pipelines, a
  minimap, search, undo and redo, keyboard operation, accessible announcements (the board's patterns
  from B2 carry over).
- **Done when:** a five-node pipeline (two sources, a join, an aggregate, a sink) is built only by drag
  and drop, previews at each node, and round-trips exactly through its Pure text.

### C3. The DAG across pipelines — L (needs F4)

- Pipelines that feed each other form a graph, **drawn from lineage** rather than declared. Show upstream
  and downstream, column-level lineage on hover, impact analysis before a change, and ordering for runs.
- **Done when:** changing a column in one pipeline lists every downstream table, pipeline and dashboard
  it affects.

### C4. Running — L (needs F3)

- Incremental loads (append new rows by watermark; merge changed rows by key), backfills over a range,
  partitions, idempotent reruns, dry runs (plan and row counts, no write), run history with receipts per
  node, alerts.
- **Done when:** an incremental pipeline, rerun twice, writes each row once; a backfill over a range is
  resumable after a failure.

### C5. Trust — M

- Data-quality checks as nodes: not null, unique, in range, referential, row count against the previous
  run, freshness. They are Pure assertions compiled to SQL, and a failing check stops the write or
  quarantines the rows.
- Schema-change detection on sources, with a proposed fix. Tests for pipelines on fixture data (the same
  harness style as our corpus).
- **Done when:** a pipeline with a failing check writes nothing and says which rows and why.

### C6. Collaborate — M (needs F5)

- Pipelines stored as Pure text in the model store: diffable, reviewable, versioned.
- A visual diff of two versions of a canvas, comments on nodes, and promotion from dev to prod.

**Explicitly out of scope:** connectors that pull from hundreds of SaaS APIs, and change-data-capture from
source databases. That is a different product (Fivetran, Airbyte). We transform what Pure stores and
connections can already reach, plus files put into the warehouse.

---

## 6. Order and dependencies

```
Now (DataCube-only, no core):   A1 → A2, A3, A4 → A7      F7, F8      B1 (charts)
Needs core platform work:       F1 (write) ─┐
                                F2 (warehouse connection) ─┴─→ C1 (materialize) → C2 (canvas)
                                F3 (runs + schedules) → B6, C4
                                F4 (lineage) → B4 impact, C3
                                F5 (API + query store) → B3 parameters, B5, C6
DataCube structure:             F6 (several cubes) → B2 (pages) → B3 (interaction)
Differentiator:                 B4 (semantic layer), after F4 and F5
```

**First three milestones:**

1. **M-A: exports correct** (A1-A4, A7), with F8's parallel CI and charts lazy-loaded (F7). About two to
   three weeks. DataCube only.
2. **M-B1: charts complete** (B1), next to **F6** (the lifecycle for several cubes). About three weeks.
3. **M-C1: materialize a cube** (F1, F2, C1). The first real ETL, and it needs `core/`. See §8.

---

## 7. How we will know it is the best

- **Correctness:** every feature has a browser harness asserting its output, in the Linux browser lane.
  Every export parses under strict readers. Every number on a page carries a receipt.
- **Speed budgets:**
  - first grid under 2 seconds on a laptop;
  - interaction under 100 ms at the 95th percentile on 5,000-row results;
  - a dashboard of 8 tiles fully rendered under 3 seconds;
  - a canvas of 50 nodes stays at 60 fps.
  
  Each is measured by a benchmark lane, not claimed.
- **Accessibility:** axe-core clean on the grid, charts, pages and canvas; everything operable from the
  keyboard.
- **Feature bar:** a checklist against named incumbents (Tableau, Power BI, Looker, Superset for BI;
  Alteryx, Dataiku, KNIME, dbt for ETL). Each row is either met, beaten (with the reason) or deliberately
  refused (with the reason). This document's §0 is the "beaten" column.

---

## 8. Coordination with the compiler rebuild

- **Can go ahead now,** outside the rebuild's areas: track A, B1, F6, F7, F8 (all `datacube/` and CI), and
  the warehouse parts of F2 and F3 (write grants, a scheduler next to the warehouse).
- **Needs the rebuild's areas:**
  - F1 (`write` lowering: `lowering/`, `exec/`);
  - F2's connection resolution (`server/ConnectionResolver.java`, the connection model and grammar);
  - F4 (lineage over the typed tree);
  - F5 (the `/api/pure/v1` surface);
  - the unpivot native (`builtin/`).
  
  Each should be scheduled as a slice of `docs/EXECUTION_PLAN_2026_09_26.md`, or between waves, not
  edited alongside it.
- `docs/IN_FLIGHT.md` lists the DataCube programs as paused. Starting track A is a decision for the user
  (§9).

---

## 9. Decisions for the user

1. **Start track A now** (exports correct, DataCube only), beside the compiler rebuild? Recommended: yes.
   It fixes a data leak (blurred columns exported in the clear).
2. **Formats beyond upstream.** Upstream offers only Excel and CSV. Keep HTML, Plain Text and PDF and make
   them correct (recommended: PDF matters for scheduled delivery), or drop the ones nobody needs?
3. **Blurred columns in exports:** masked (`•••`), left out, or refused with a message? Recommended:
   masked, and named in the export's note.
4. **When core work starts** (F1, F2, F4, F5): between rebuild waves, or folded into the rebuild plan as
   slices? That depends on the rebuild's order.
5. **Where runs and schedules live** (F3): inside the warehouse process, or a separate service beside it?
   Recommended: beside it, sharing identity and history.
6. **Warehouse write grants:** add `INSERT`/`CREATE` on a schema to the grant model (recommended), or
   keep ETL to owners?
7. **Grants on `DROP`** (left open from the grant fix): should dropping a table remove its grants?
   Recommended: yes for `DROP`, while `CREATE OR REPLACE` keeps them.
8. **The ETL audience:** analysts building derived datasets (recommended, and what §5 describes), or data
   engineers moving data between systems?
