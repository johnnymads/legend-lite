# DataCube: charts, and a page of linked grids and charts (design + homework, 2026-09-28)

**Status: design, nothing built.** Written so a fresh session can start from here with no other
context. Everything below comes from a session with the user on 2026-09-26..28: their rulings
are marked **(ruled)**, the rest is recommendation or evidence. The homework (prototype, measurement
scripts) is committed beside this file in
[`datacube-dashboards-homework-2026-09-28/`](datacube-dashboards-homework-2026-09-28/).

Line numbers into `datacube/src` were read on `main` around `d00acdf24` (2026-09-28). Other
sessions change DataCube daily (T1-T8: types from the compiler, the protocol-tree snapshot,
pivots as conditional aggregates), so **re-verify a reference before acting on it**.

---

## 0. The goal (user, 2026-09-26)

> "more fully featured charting and visualizations on the datacube -- with user configurable
> options -- the north star would be to have 'multi layout' where on the page i could have
> potentially multiple grids and multiple charts all together -- and potentially even 'talking to
> each other' so that when [I] do a new filter the visuals would automatically change."

Further rulings and preferences from the discussion:

1. **Multi-source up front (ruled).** A page can hold grids over different sources.
2. **Charts can be "pinned" to a grid (ruled).** A pinned chart follows that grid.
3. **Build our own layout, now (ruled, after the homework in §4).** No gridstack.
4. **Grid AND docking, in one model (user's direction).** Owning the layout means we can have
   the dashboard grid *and* dockview-style splits and tabs. Design for both now, build in stages
   (§5.2, §8).
5. **Charts: Apache ECharts (recommended, user agreed "echarts as the winner").** Evidence in §3.

---

## 1. Where things are today

### 1.1 Charts

`datacube/src/chart.ts`: two hand-written SVG charts, **Plot** (bar) and **Treemap**, from the
grid menu. They draw the grid's *current result* (`chartData(table)` picks a label column and a
value column). There are no options. The file's design note says it was deliberate: *"renders in
node and the browser alike, and is inspectable, so the tests can assert geometry"*. Keep that
property (§3.4).

### 1.2 Can several cubes live on one page? Almost.

`CubeApp(root, snapshot, options)` is instance-oriented:
- everything comes from `root.ownerDocument`;
- the engine, planner, storage, clipboard and download are injected, so one DuckDB and one planner
  worker can be shared;
- CSS is scoped under `.dc-app`;
- the grid has its own `ResizeObserver`;
- floating windows are appended to and clamped inside the app's root.

What blocks N instances (from reading the code; `app.ts` numbers approximate):

| # | Blocker | Where | Fix |
|---|---|---|---|
| 1 | Undo/redo/editor shortcuts (Ctrl/Cmd-Z, Y, E) listen on `document`: every cube reacts to one keystroke | `app.ts` ~2993 | Listen on `root`, or check `root.contains(document.activeElement)`; the page routes keys to the focused tile |
| 2 | One save slot, `VIEW_KEY = 'datacube.savedView'`: every cube overwrites it | `app.ts` ~243, ~2160 | The page document owns persistence (`getSpec`/`setSpec`), or per-tile keys |
| 3 | `dispose()` does not destroy the grid (its `ResizeObserver`), abort in-flight queries, or close windows | `app.ts` ~2214; `grid/grid.ts` ~539 | A real `destroy()` |
| 4 | Dialogs are sized for a full page (800x600 default, min 300x300) and clamped inside the app root, so they are clipped in a small tile | `ui/window.ts` | A `windowHost` option (page-level overlay), plus a compact chrome mode for tiles |
| 5 | Single callbacks (`onView`, `onStatus`, `hostStatus`); a pinned chart AND the page need to listen | `app.ts` | An emitter: `on('view' \| 'query' \| 'status' \| 'select', fn)` |
| 6 | No way to AND a page or linked filter into the query without touching `snapshot.filter`, undo or save | `cube.ts` (`update(next)` takes a whole snapshot) | `setContextFilter(FilterNode \| null)`, composed at plan time, never saved, shown as a read-only chip |
| 7 | No click-to-filter output. The context menu already turns a cell into (column, value) (`app.ts` ~1338ff) but emits nothing | `app.ts` | An `onSelect({column, values})` event, plus row-group paths |
| 8 | Module-level `let dragging` in the columns selector: a drag from cube A can drop on cube B | `ui/columns-selector.ts` ~37 | Per-instance state |
| 9 | The demo host has one `#app`, one `SETTINGS_KEY`, document click delegation | `demo/boot.ts`, `main-engine.ts` | A new page host (§8) |

### 1.3 Dependency posture

There is no written npm dependency policy. `docs/TEAM_DEPENDENCY_PROPOSAL.md` is superseded, and
`BAZEL_DEPENDENCY_PROPOSAL.md` is about Pure projects. In practice:
- DataCube has 3 runtime dependencies (duckdb-wasm, apache-arrow, @fontsource/roboto).
- The repo hand-writes where reasonable (SVG charts, windows).
- **Adding an npm dep:** add it to `datacube/package.json` and the pnpm lock, then list
  `":node_modules/<pkg>"` in the `js_library(name = "src")` deps in `datacube/BUILD.bazel`. esbuild
  bundles and tree-shakes it.

Guardrails that bind any new module (`datacube/test/guardrails.test.ts`):
- **No `instanceof HTMLElement`** and similar DOM checks (they fail across iframes and test DOMs).
  Use `doc.defaultView!.HTMLElement`, as `window.ts` ~162 does.
- **Every feature module must be reachable:** imported and called from `src/app.ts`, which has a
  REACHABLE list. A module that is "built and left unreachable" fails.
- **Portability:** `portability.test.ts` bans POSIX-only spellings in scripts.
- **Tests are automatic:** every `test/*.test.ts` becomes its own Bazel `js_test`.

No CSP is set anywhere today (a demo even runs with `bypassCSP: true`), but a bank deployment will
want one, so **stay CSP-clean** (no `eval` / `new Function` reachable).

### 1.4 Upstream

Upstream `legend-data-cube` (legend-studio `c5b2f2c78`) has **no charts**; only `enableCharts` on
its ag-grid. Elsewhere in legend-studio:
- `legend-query-builder` uses chart.js 4.4.8 for one doughnut;
- `legend-lego` uses ag-grid-enterprise integrated charts (needs the enterprise licence).

Dashboards and charts are therefore a **legend-lite extension**. Each grid's saved
`DataCubeSpecification` must stay upstream-compatible (§5.4).

---

## 2. What we want (requirements distilled)

**Charts:**
- bar (stacked, grouped, horizontal), line, area, scatter, pie/donut, heatmap, treemap, histogram,
  box plot, combo/dual axis, small multiples;
- user-configurable options;
- theming, including dark mode;
- accessible;
- up to ~100k points for time series;
- charts only **draw** rows the database already aggregated.

**Page:**
- several grids and charts on one page, over several sources;
- resizable and draggable tiles;
- charts pinned to a grid, or standalone;
- page filters;
- click-to-filter between tiles, and across sources through declared links;
- saved as one JSON document.

**Engineering:**
- vanilla TypeScript, esbuild and Bazel;
- tests assert output in node;
- CSP-clean;
- small bundle, with charts lazy-loaded so a grid-only page does not pay for them;
- a permissive licence (a bank will deploy it).

---

## 3. Chart library: Apache ECharts 6

### 3.1 Survey (measured 2026-09-28)

**How it was measured:**
- Downloads from the npm API, week of 2026-09-21..27.
- Sizes from **our own esbuild bundles** (`--bundle --minify`, gzip -9) of realistic imports
  (entry files in [`homework/charts/entries/`](datacube-dashboards-homework-2026-09-28/charts/entries/)).
  They are not bundlephobia's figures and can differ by about 10%.
- CSP: the built bundles were searched for `eval(` / `new Function` / `Function("`.
- Node rendering: verified by running
  [`render-check-*.mjs`](datacube-dashboards-homework-2026-09-28/charts/).

| Library | Licence | Weekly dl | min+gz (full / smallest practical) | Renderer | ~100k pts | Saveable spec | Cross-filter primitives | Node render for tests | CSP-clean | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| **ECharts 6.1.0** | Apache-2.0 | 5.9M | 383 KB / **184 KB** (bar+line+grid+tooltip+canvas); **218 KB** (bar/line/scatter/pie/heatmap + dataset/legend/visualMap/aria, SVG); **279 KB** (+treemap, boxplot, dataZoom, brush, toolbox, both renderers) | Canvas + SVG | good (canvas, `large`/progressive, `sampling:'lttb'`, dataZoom) | option object is plain JSON | click events, `brush`/`brushSelected`, `dispatchAction`, `echarts.connect` | **yes, no DOM**: `init(null,null,{ssr:true,renderer:'svg'})` then `renderToSVGString()` | yes (the only `new Function` is a geo-JSON fallback, absent when tree-shaken) | 67k stars, very active |
| Vega-Lite 6.4.3 (+vega, vega-interpreter) | BSD-3 | 1.06M | 295 KB (vega-embed) / 273 KB | SVG/Canvas | moderate | **best**: a real grammar | first-class selection params | yes (`view.toSVG()`) | **only** with `parse(spec,null,{ast:true})` + the expression interpreter (~10% slower); vega-embed has eval | treemap needs raw Vega |
| Observable Plot 0.6.17 | ISC | 793k | **133 KB** | SVG only | poor for per-point marks | no (JS calls; we would define our own JSON anyway) | hover tips only; no released brush | yes (jsdom), emits aria-label | yes | great defaults, first-class facets; last release Feb 2025 |
| Chart.js 4.5.1 | MIT | 14.3M | 70 KB / 67 KB | Canvas | good with decimation | config JSON (callbacks in JS) | onClick; brush via zoom plugin | needs node-canvas (native addon; awkward in Bazel) | yes | treemap/box via plugins |
| uPlot 1.6.32 | MIT | 628k | **23 KB** | Canvas | **best** | own options | cursor sync, range select | needs canvas | yes | time series only; one maintainer |
| Plotly.js 4.1.1 | MIT | 816k | 1.46 MB / 397 KB (basic), 496 KB (cartesian) | SVG + WebGL | good (scattergl) | figure JSON | click, selected, lasso | needs a real DOM | **no**: `eval`/`new Function` in dist; partial bundles still contain `Function(` (runtime use not confirmed) | widest chart set (3D, scientific) |
| Highcharts 13.1.1 | **commercial** | 3.0M | 105 KB core | SVG (+WebGL boost) | good | options JSON | rich | needs DOM | yes | best accessibility module; licence rules it out |
| ApexCharts 7.6.1 | **dual: community licence only under $2M revenue, no OEM** | 2.3M | 282 KB | SVG | poor | options JSON | events | needs DOM | yes | licence rules it out |
| AG Charts Community 14.2.0 | MIT (Enterprise paid) | 2.1M | 406 KB | Canvas | good | options JSON | zoom/navigator are Enterprise | needs canvas | yes | treemap/heatmap/box are **Enterprise** |
| AntV G2 5.4.8 | MIT | 396k | 405 KB | Canvas/SVG | ok | spec JSON | brush/elementSelect | needs DOM | `new Function` via d3-dsv (probably unreachable) | docs mostly Chinese |
| billboard.js 4.1.0 | MIT | 48k | 116 KB | SVG (d3) | poor | options | events | needs DOM | `Function("return this")` fallback | small user base |
| Frappe Charts 1.6.2 | MIT | 85k | 19 KB | SVG | poor | - | minimal | - | yes | abandoned (2021) |
| D3 7.9.0 | ISC | 23.7M | 95 KB / ~32 KB | ours | ours | ours | d3-brush | yes | yes if d3-dsv not imported | low-level: everything is ours to build |
| Perspective 5.5.1 | Apache-2.0 | ~18k | multi-MB WASM | WebGL | excellent | viewer config | linked views **only over its own tables** | no | - | brings its own engine and grid: duplicates DuckDB and ours |

### 3.2 Why ECharts

- **Coverage.** One library covers every chart type we listed, including treemap, box plot,
  heatmap, dual axis, and v6's matrix layout for small multiples.
- **Scale.** Canvas handles 100k points (LTTB sampling); SVG is there for export and tests.
- **Cross-filtering.** The click, brush and `dispatchAction` primitives it needs are built in.
- **Tests keep their current form.** It renders to an SVG string in node **with no DOM**, so they
  can keep asserting geometry, as `chart.ts` tests do today.
- **Clean to ship.** Tree-shaken builds are CSP-clean, it is Apache-2.0, and it is the most active
  project in the survey.

**Its costs:**
- **Size:** ~220 KB gz for the core set and ~280 KB with everything (about the size of
  apache-arrow). Mitigated by lazy loading (§3.3).
- **Accessibility is middling:** the `aria` component describes the chart and adds decal patterns
  for colour-blind users, but keyboard navigation is weak.
- **Theming:** canvas cannot read CSS variables, so read the computed values and pass them through
  `registerTheme` / v6 runtime `setTheme`. v6 has built-in dark switching.
- **Facets are manual.**

**Runner-up and alternatives** (the user asked about Plot and Plotly specifically):

| Library | Verdict |
|---|---|
| Vega-Lite | Runner-up. Best grammar; first-class selections and facets. Loses on CSP (interpreter mode, slower), 100k points, and a grammar is harder to put behind a simple "configure chart" panel. |
| Observable Plot | The close call. Smallest (133 KB), SVG, clean grammar, facets, node tests. Loses because selection and brush would be ours to build, SVG struggles at 100k marks, no treemap, releases have slowed. Choose it only if small size and SVG matter more than built-in interaction. |
| Plotly | Widest chart set and WebGL, but ~400 KB+, not proven CSP-clean, and it needs a real DOM to render, so node tests are impractical. Its strengths (3D, scientific) are not DataCube's needs. |
| uPlot | 23 KB, fastest. A later add-on only if ECharts is too slow for huge time series. |

**Optional spike before committing (offered, not yet ruled):** the same three charts (bar with a
region x tier pivot, a time-series line, a heatmap) in ECharts and in Plot, inside DataCube.
Compare bundle size, look, click-to-filter effort and test output.

### 3.3 How ECharts would be used

- **Never import the root `'echarts'`** (383 KB). Import `echarts/core` and register only what is
  used:
  - charts: `BarChart, LineChart, ScatterChart, PieChart, HeatmapChart`, plus `TreemapChart,
    BoxplotChart` when those land;
  - components: `Grid, Tooltip, Legend, Title, Dataset, VisualMap, Aria`, plus `DataZoom, Brush` for
    cross-filtering;
  - renderers: `CanvasRenderer` for the browser and `SVGRenderer` for tests and export.
  - See [`entries/echarts-min.js`](datacube-dashboards-homework-2026-09-28/charts/entries/echarts-min.js)
    and [`echarts-dash.js`](datacube-dashboards-homework-2026-09-28/charts/entries/echarts-dash.js).
- **Lazy-load** the chart module (esbuild `splitting`, dynamic `import()`), so a grid-only page
  does not pay for it.
- **A thin adapter** (`src/chart-render.ts` or similar) is the only file that imports ECharts. It
  takes **our ChartSpec** (§6) plus the query's rows and builds an ECharts option with
  `dataset.source`.
- **Our own spec is saved, never raw ECharts options.** Saved dashboards then don't depend on the
  ECharts version, and no formatter functions end up in stored data, which keeps it CSP-safe. The
  library stays swappable.
- **Cross-filtering:** ECharts `click` / `brushSelected` become **our** filter model and a new
  database query. ECharts' own data filtering is never used.
- **Tests:** in node, `init(null, null, {ssr: true, renderer: 'svg', width, height})` with
  `animation: false`, then `renderToSVGString()`. Assert geometry and aria text. Verified with no
  DOM ([`render-check-echarts.mjs`](datacube-dashboards-homework-2026-09-28/charts/render-check-echarts.mjs)).
- **Bazel:** add `echarts` to `datacube/package.json` and the pnpm lock, and
  `":node_modules/echarts"` to the `:src` deps.

**Unverified in the survey:**
- keyboard accessibility depth, per library;
- 100k-point performance, which comes from docs and design, not our benchmarks;
- where Plotly's `Function(` runs;
- whether AG Charts module registration shrinks it;
- Perspective's FINOS status (the repo moved to `perspective-dev`).

---

## 4. Layout: build our own (ruled), after homework

### 4.1 Libraries considered

| Library | Model | min / gz | Licence | Weekly dl | Last publish | Verdict |
|---|---|---|---|---|---|---|
| gridstack 14.0.0 | snap grid, compaction, breakpoints | 89.9 kB / ~25 kB (+1.5 kB CSS) | MIT, 0 deps | 623k | 2026-09 | the best off-the-shelf grid, but see §4.2 |
| dockview-core 8.3.1 | IDE docking: tabs, splits, floating, popouts | 361 kB / 83 kB | MIT (enterprise add-on commercial; which features is unchecked) | 492k (+465k `dockview`) | 2026-09 | docking, not a dashboard grid |
| Golden Layout 2.6.0 | docking | 125 kB / 29 kB | MIT | 22k | **2022-09** (v3 never shipped) | stale; dockview replaced it |
| @lumino/widgets 2.9.0 | JupyterLab docking | ~48.6 kB gz (DockPanel) | BSD-3, 11 deps | 154k | 2026-07 | a whole widget framework |
| FlexLayout, react-grid-layout | docking / grid | - | MIT | - | - | **React only** |
| Muuri, Packery | masonry / packing | - | MIT | - | stale | no resize, no serialization |

**Dashboard grid vs docking** (user asked about dockview and Golden Layout). The downsides of
docking *for a dashboard that many people view*:
1. **It doesn't reflow.** Proportional splits squeeze on small screens and are unusable on phones.
2. **Tabs hide linked tiles.** A cross-filter changes a chart in a background tab unseen. We would
   also need a rule for whether hidden tiles query now or when shown.
3. **The layout is a tree of splits, not `{x, y, w, h}`.** It is harder to auto-place a new tile
   and to keep our own format.
4. **Every panel carries tab chrome,** which is heavy for small tiles like KPIs and mini charts.
5. **Pop-out windows are expensive:** a separate document, styles and focus, and the shared DuckDB
   and filter state across windows.

Docking's strengths are keyboard support, maximise, tabs and second-monitor pop-outs: right for a
power user's workspace. **Resolution:** we own a layout *tree* that has a grid node AND split and
tabs nodes (§5.2), so we get both.

### 4.2 Homework: what gridstack would actually save us

gridstack 14.0.0's TypeScript source was extracted from its sourcemaps: **7,944 lines, 4,693 of
them code**. The per-concern table is in
[`gridstack/gridstack-loc.md`](datacube-dashboards-homework-2026-09-28/gridstack/gridstack-loc.md)
(script: `measure-gridstack.mjs`). Summary:
- **Layout engine (collision, compaction, move, column change):** about 520 code lines.
- **Widget DOM and options:** 720.
- **Drag layer (draggable with auto-scroll, resizable, droppable, touch shim):** about 1,380.
- **Glue between the grid and the drag layer:** 367.
- **Nested grids:** 94.
- **Drag-in from outside:** 199.

Problems that would affect us (file refs are into gridstack's source):
- **No keyboard or ARIA at all.** The source has no `aria`, `role` or `tabindex` (re-checked on
  2026-09-28: 0 matches). The only keys are Esc and R mid-drag (`dd-draggable.ts` ~355-362). Issue
  #830 was closed by the maintainer in 2020 as "very unlikely to get fixed". **We would write the
  keyboard layer anyway.**
- **The default drag handle is the whole tile content** (`types.ts` ~21-22). On mousedown it calls
  `preventDefault` and blurs the focused element (`dd-draggable.ts` ~234-236). That would kill our
  grid's native header drags and steal focus from editors inside tiles.
- **It re-orders the DOM on every layout change** (`_sortDom`, `gridstack.ts` ~1886, ~1895-1916). It
  uses `moveBefore` only where the browser supports it, otherwise `appendChild`, which detaches and
  reattaches each tile. Issue #3374 describes iframes reloading because of this. For us it risks
  losing the scroll position of the virtualised grids inside tiles.
- **It relies on global `document` (27 places) and has 3 `instanceof` DOM checks,** the bug class
  our guardrail bans.
- **Open issues:** #3356 (auto-scroll cannot be tuned), #3355 (nested scrolling "unusable"), #2236
  and #2235 (nested-grid bugs), #1820 (breaks under a `transform` parent).

For comparison, react-grid-layout's proven core (`collides`, `compact`, `moveElement` plus helpers)
is about **293 code lines** (v1.5.2 `lib/utils.js`).

### 4.3 Homework: our own layout model, prototyped

The prototype is in
[`layout-prototype/tile-layout.ts`](datacube-dashboards-homework-2026-09-28/layout-prototype/tile-layout.ts).
It is 388 lines, **236 of them code**. It is pure: no DOM, no pixels, no state; every function
takes a layout and returns a new one.

**API** (all on a `cols`-column grid; `Tile = {id, x, y, w, h, minW?, minH?, maxW?, maxH?,
static?}`):

| Function | What it does |
|---|---|
| `collides(a, b)` | Do two rectangles share a cell (touching edges don't count). |
| `bottom(layout)` | The first row below every tile. |
| `byReadingOrder(a, b)` | Row, then column, then id. |
| `normalize(tile, cols)` | Clamp a tile into the grid and its min/max sizes. |
| `compact(layout, pinned)` | Gravity: tiles float up but never pass through another. Static and "held" tiles stay put. |
| `place(...)` | **The one core.** Static tiles never move; a tile dropped on a static lands below it; moving down onto a tile swaps with it; anything still in the way is pushed down in a cascade; then gravity. |
| `moveTile`, `resizeTile`, `resizeRect` | Built on `place`. |
| `edgeRect(tile, edge, dCols, dRows)` | Resize from any of the eight edges or corners (the same arithmetic as `window.ts`'s `resize`, in cells). |
| `moveBy`, `resizeBy` | Keyboard steps. They return `KeyResult`, which says when a step was blocked, so it can be announced. |
| `fitToColumns(layout, from, to)` | The responsive re-pack, **derived and never stored**: 12 → 1 → 12 gives back exactly the saved page. |
| `problems(layout, cols)` | Is the layout legal (in bounds, min sizes, no overlap). |
| `describe(tile, cols)` | The text for screen-reader announcements. |

**Tests:** [`tile-layout.test.ts`](datacube-dashboards-homework-2026-09-28/layout-prototype/tile-layout.test.ts),
**50 passing** (`node --experimental-strip-types --test tile-layout.test.ts`). Groups: collides,
compact, moveTile, resizeTile, keyboard, fitToColumns, a seeded fuzz (8 seeds x 400 gestures) and
scale. They cover:
- cascading pushes, straight down and via sideways overlaps;
- static tiles holding, landing below, and routing a cascade around them;
- moving up into a gap;
- resizing into neighbours below and beside, min/max sizes and the page edge, resizing from the
  north-west;
- keyboard swap, block and edges;
- collapsing to 1 column in reading order, uneven ratios (12 → 5), and the round trip back to 12.

**Deep fuzz** ([`fuzz-deep.ts`](datacube-dashboards-homework-2026-09-28/layout-prototype/fuzz-deep.ts)):
488,400 random gestures across ~1,600 layouts, on 12, 8 and 6 columns with ~15% static tiles. It
ran in 3.9 s with **0 failures**. One drag step with 200 tiles takes **0.2 ms**.
[`probe.ts`](datacube-dashboards-homework-2026-09-28/layout-prototype/probe.ts) prints layouts as
ASCII pictures. The files type-check under DataCube's strict flags with TS 5.9; the repo pins TS 7,
which was not checked.

**Edge cases the prototype surfaced:**
1. **A one-row keyboard step down does nothing under gravity:** the tile settles straight back. So
   `moveBy` means "the next different page in that direction", which in practice swaps with the
   neighbour. Neither gridstack nor react-grid-layout has an answer here, since neither has keyboard
   support.
2. **Rounding widths separately breaks side-by-side tiles.** Going 12 → 5 columns, two halves
   overlapped and turned into a staircase. **Scale edges, not widths.** There is a regression test.
3. **Mid-drag layouts are deliberately not settled.** A key press or `pointercancel` must drop or
   cancel the drag first (the first fuzz run caught this).
4. **Open (§9):** one sideways step into a wide neighbour pushes it down. That's honest but heavy
   for a single key press (gridstack swaps equal-sized tiles instead). Pinned by a test.
5. **Open (§9):** `fitToColumns` lets reading order win over gravity, which can leave a small gap.
   Editing at narrow widths also needs a policy.

### 4.4 What we already have to build the interaction on

**`datacube/src/ui/window.ts` (261 lines): the pattern to copy.**
- Pointer events with `setPointerCapture` (~156-191); main button only (~160).
- Presses on a button inside the title bar are ignored via `closest('button')` (~162-163); a tile's
  title bar needs exactly this.
- `pointercancel` is handled like pointer-up (~190, ~220).
- **Eight edge/corner grips** (~194-223) with the CSS already written (`app.css` ~695-721).
- Pure `resize(from, edge, dx, dy, min)` arithmetic (~236-261).
- Clamping, and saving through `onChange` when a gesture ends (~152).
- `test/window.test.ts` (14 tests): arithmetic in node with no DOM, wiring in jsdom.

**Drag-and-drop inside tile contents** is all native HTML5 drag-and-drop:
- `grid/grid.ts` ~739-797 (header reorder);
- `ui/pivot-panel.ts` ~182-249, ~361-363;
- `ui/columns-selector.ts` ~355-369, ~484;
- `app.ts` ~594-615, a `dragstart` listener on the app root that shows the drop zones.

The column-resize grip (`grid.ts` ~884-911) shows how to stop a native drag from starting:
`draggable=false`, `preventDefault` on `dragstart`, `stopPropagation` on `pointerdown`.

**Consequence:** tile dragging uses **pointer events on the title bar and grips only**, so it never
meets the HTML5 drag-and-drop inside a tile. Keyboard conventions exist (Delete, Enter/Space on
chips, tab keys), and `role=status`/`alert` are used, but there is **no `aria-live` helper yet**.

### 4.5 Estimates (one engineer, production quality)

| Part | Days | Notes |
|---|---:|---|
| Layout model | 1-2 | mostly done; policies, loading and validating our JSON |
| Pointer drag + placeholder + auto-scroll + touch | 3-4 | `window.ts` pattern; `touch-action:none` on the handle only; requestAnimationFrame edge scroll |
| Resize handles | 1-2 | the grips and CSS exist; pixel-to-cell snapping |
| Animation | 0.5-1 | CSS transitions + reduced motion |
| Edit vs view mode | 0.5 | |
| Keyboard + ARIA | 3-4 | Space/Enter to grab, arrows to move, Shift+arrows to resize, Esc restores; live region; roles; DOM order = reading order |
| Responsive | 1-2 | ResizeObserver + `fitToColumns`; CSS grid does the pixel layout |
| Not stealing inner drags | 1-2 | handle-only pointer events; keep clear of the grid's column-resize grips |
| Tests | 2-3 | model tests done; jsdom wiring; Playwright e2e |
| **Total, build our own** | **~14-21** | |
| gridstack instead | ~8-12 | includes the 3-4 day keyboard layer we'd write anyway, fighting its swap rules; +27 KB gz; a 4th runtime dep |
| gridstack now, replace later | ~18-26 total | the adapter is thrown away; keyboard reworked; collision behaviour changes under users |

A **hybrid** (our model + gridstack's drag layer) does not work: its drag layer is tied to its
engine (`_dragOrResize`, its drag manager) and brings the focus-stealing and global state with it.

**Risks:**
- **Pointer and touch polish takes longer than planned.** Mitigation: handle-only drag, no
  long-press, Playwright tests.
- **Keeping DOM order matching reading order** (for tab order) without detaching tiles, which would
  lose grid scroll. Mitigation: re-order only on drop, using `moveBefore` where available.
- **Scope creep** (nested grids, cross-page drag): explicitly out of scope.

---

## 5. The page model

### 5.1 Prior art (how BI tools link views)

| Tool | How it works | What we borrow |
|---|---|---|
| Superset | Native filters in `json_metadata.native_filter_configuration`, each with `scope: {rootPath, excluded: [chartIds]}`; cross-filters are global with per-chart overrides (PR #24020) | Scope as "all, minus excluded" |
| Metabase | A dashboard filter is **mapped per card to a field**; auto-connect for cards with matching fields; linked (dependent) filters; click can update a dashboard filter | Explicit per-tile field mapping |
| Grafana | Dashboard variables (`templating.list`), `$var` in panels, synced to the URL (`var-x=`); ad hoc "filter for value" works on the same data source | URL sync of filter values |
| Tableau | Filter actions: a source sheet sends field values to target sheets; "Selected fields" maps **source field → target data source.field**; "related data sources" matches by name or declared relationships | Cross-source links as declared field mappings |
| Power BI | Per source→target visual pair, "Edit interactions": **Filter, Highlight or None** | Per-pair interaction override |
| Looker Studio | Cross-filtering is a per-chart toggle and behaves like a filter control | Selection = transient filter |
| Perspective workspace | "Master" row selection filters "detail" viewers on its group-by path, same table only; layout JSON `{sizes, master, detail, viewers: {...}}` (schema undocumented, issue #2093) | Selection on a grouped row = filter on its path |

Sources: Superset PR #24020 and issue #18109; metabase.com docs on dashboard filters; grafana.com
variables and ad hoc filters; help.tableau.com `actions_filter` and `filter_across_datasources`;
learn.microsoft.com Power BI visual interactions; Looker Studio answer 9173401; github.com/finos
/perspective issue #2093.

**Common primitives:**
1. A filter = field + operator + values, at page level or as a transient selection.
2. A scope: "all tiles except excluded", with a per-tile opt-out.
3. Field mapping per target, explicit and auto-suggested by name and type.
4. Interaction mode per source→target: filter, highlight or none.
5. Selections are transient state (can go in the URL), separate from saved filters.
6. Saved as one JSON document.

### 5.2 Tiles are *what*, the layout tree is *where* (the key design idea)

- **Tiles** are a flat registry: `id` → content (a grid, a pinned chart, or a standalone chart),
  plus interaction settings. **Tiles know nothing about layout.** Filters, links and selections
  work on tiles.
- **The layout is a tree** that refers to tile ids. Node types:
  - `grid`: the dashboard grid, tiles at `{x, y, w, h}` on N columns (the §4.3 model);
  - `split`: horizontal or vertical, children with proportions;
  - `tabs`: children shown one at a time, one active;
  - `tile`: a leaf in a split or tab (a tile id).

For example, "a docking workspace whose right-hand panel is a dashboard grid" is
`split[tabs[tile A, tile B], grid[...]]`. The same tiles can be moved between a dashboard and a
docked workspace without touching their content, filters or links. **Day one implements only
`grid`, but the JSON has the tree**, so there is no migration later.

### 5.3 The page document (sketch; names to be settled in implementation)

```ts
interface PageDoc {
  version: 1;
  title?: string;

  sources: Record<SourceId, {
    ref: SourceRef;        // how the cube's source is identified today (model + relation / query)
    label?: string;
  }>;

  /** Cross-source links (Tableau "relationships"): these columns mean the same thing. */
  links: {
    id: string;
    fields: { source: SourceId; column: string }[];   // e.g. orders.customer_id <-> customers.id
  }[];

  /** WHAT: the tiles, layout-free. */
  tiles: Record<TileId, {
    title?: string;
    content:
      | { type: 'grid'; source: SourceId; spec: DataCubeSpecification }  // UNTOUCHED, upstream-compatible
      | { type: 'chart'; pinnedTo: TileId; chart: ChartSpec }            // follows that grid's query
      | { type: 'chart'; source: SourceId; query: ChartQuery; chart: ChartSpec };  // standalone
    interactions?: {
      emits?: boolean;                               // clicks here publish selections (default true)
      receives?: 'filter' | 'highlight' | 'none';    // default 'filter'
    };
  }>;

  /** WHERE: the layout tree over tile ids. */
  layout: LayoutNode;

  /** Page-level filters (the filter bar). */
  filters: {
    id: string;
    label: string;
    field: { link: string } | { source: SourceId; column: string };
    operator: FilterOperator;
    default?: FilterValue[];
    scope: { excluded: TileId[] };                   // Superset style
    mapping?: Record<TileId, string>;                // Metabase-style per-tile column override
  }[];

  /** Power BI style per-pair override of the default interaction. */
  interactionOverrides?: { from: TileId; to: TileId; mode: 'filter' | 'highlight' | 'none' }[];
}

type LayoutNode =
  | { type: 'grid'; cols: number; rowHeight?: number;
      items: { tile: TileId; x: number; y: number; w: number; h: number;
               minW?: number; minH?: number; static?: boolean }[] }
  | { type: 'split'; direction: 'row' | 'column'; children: { node: LayoutNode; size: number }[] }
  | { type: 'tabs'; active: number; children: LayoutNode[] }
  | { type: 'tile'; tile: TileId };
```

Selections are **not** saved in the document; they can round-trip through the URL.

### 5.4 Runtime rules

**The effective query of a tile** is its own spec, AND the page filters in scope, AND the other
tiles' active selections. Each filter or selection is resolved to the tile's column through
`mapping`, then `links`, then same name and type.
- It is composed as an extra `FilterNode` **at plan time** (blocker 6, `setContextFilter`).
- It is never written into the tile's `DataCubeSpecification`, its undo history or its save.
- Each grid's `DataCubeSpecification` stays upstream-compatible; page semantics live only in
  `PageDoc`. A grid tile can be exported and opened alone in upstream DataCube.

**A pinned chart** follows the grid's **query** (source, filters, calculated columns), not its
**display** (expanded groups, scroll, pivot layout):
- It chooses its own grouping from its encoding (x = `tier`, color = `region`), so one grid can have
  a bar by tier *and* a trend line pinned at once.
- An optional "follow grid grouping" follows the grid's row and column groupings (never expand or
  collapse state).
- It inherits the grid's scope.
- It queries rather than rendering the grid's `CubeView`, so the grid's pivot shape does not
  constrain it.
- Deleting the grid deletes or asks about its pinned charts.

**A selection emitted by a grid or chart** is `{tile, filter: FilterNode}`, built from the clicked
column(s) and value(s): a group row's path, or a chart mark's category.
- Ctrl/Shift-click adds to it; Esc or clicking again clears it.
- The emitting tile **highlights** rather than filtering itself.

**Highlight** is a render-time predicate on marks or rows, not a query change. It is cheap for
charts; defer it for grids.

**Links:** a filter or selection on a linked field reaches every tile whose source has a mapped
column. Tiles with no mapping are unaffected and show a **"not linked"** badge; nothing is inferred
silently. The UI can *suggest* links (same name and type); the user confirms them.

**Every tile shows what is filtering it and where from** ("region = EMEA, from Orders grid").

**Tabs:** a linked tile in a background tab shows a "changed" cue. The query policy for hidden tiles
is an open decision (§9).

**Performance:** one filter change means N tiles re-query. Share one engine and planner worker,
debounce, cap concurrency, and use per-tile epochs so stale answers are dropped (the cube already
has an `EpochGuard`).

---

## 6. The chart spec (ours)

A small, versioned JSON the chart options panel edits. It compiles to (a) a query and (b) an ECharts
option.

```ts
interface ChartSpec {
  version: 1;
  mark: 'bar' | 'line' | 'area' | 'scatter' | 'pie' | 'heatmap' | 'treemap' | 'boxplot' | 'histogram';
  x?: Encoding;              // a dimension → a group-by (or a binned measure for histogram)
  y?: Encoding[];            // measures → aggregates (several = several series; dualAxis per series)
  color?: Encoding;          // series split → a group-by (or a pivot)
  size?: Encoding;
  facet?: { row?: Encoding; column?: Encoding };
  options?: {
    orientation?: 'vertical' | 'horizontal';
    stack?: 'none' | 'stacked' | 'percent';
    sort?: { by: 'x' | 'y'; direction: 'asc' | 'desc' };
    limit?: number;                   // top N (the query's sort + limit)
    labels?: boolean;
    legend?: 'top' | 'right' | 'bottom' | 'none';
    axis?: { x?: AxisOptions; y?: AxisOptions };
    palette?: string;
  };
}
interface Encoding { column: string; aggregate?: AggregateFn; label?: string; format?: ColumnFormat; axis?: 'left' | 'right' }
```

**Mapping to a query:**
- `x`, `color` and facets become the group-bys; each `y` becomes a measure (an aggregate); `limit`
  and `sort` become the query's sort and limit.
- **Pinned:** it becomes an extra query built from the grid's snapshot with its rows, pivots and
  measures replaced by these.
- **Standalone:** built over its own source.
- **Aggregation is always in the database.**

The chart library only receives rows (`dataset.source`).

The **options panel** should feel like the rest of DataCube's editor (the `ui/` panel kit): mark
picker, drop targets or selects for x/y/color/facet, then options.

---

## 7. Parallel work on main to be aware of

Other sessions are moving DataCube fast. As of 2026-09-28 on main:
- **The snapshot holds protocol trees;** `serialize.ts` is gone and `query.ts` builds queries (T4b).
- **Pivots are two plain queries** (the values, then one `groupBy` with conditional aggregates),
  and the **Total is a column of the same query** (`00fa4ae4a`).
- **Types come from the compiler** (T1-T5): `relation-type.ts`, `types.ts`; aggregates and
  calculated-column functions come from compiler facts.
- **legend-lite serves legend-engine's `pure/v1` API** (`29abed4f9`, `e92a8678f`); `/engine/plan`
  and `/engine/execute` are deleted.
- **Warehouse Live/Snap modes** (`e2753f950`).
- **A production-readiness audit** (`docs/DATACUBE_PRODUCTION_AUDIT_2026_09_26.md`, pass 2 findings)
  with a fix order in legs. Check it before touching areas it covers.

Chart queries and context filters must be built with the **protocol-tree** query builder on main,
not text.

**Small DataCube fixes handed to another session on 2026-09-28** (not part of this design):
- no value filters on group-row aggregates (commit `e952a1854` on branch `fix/total-cell-filters`);
- the measure → dimension → measure pivot-exclusion bug (`92f7d46b0` on `fix/kind-roundtrip`);
- allow sorting by pivot Total columns;
- an optional core join-resolution fix in `Fold.java` (WIP `f0ebc5c7c`).

---

## 8. Milestones

Each milestone ends with `bazel test //...` green. Guard files move only with a dated justification
(AGENTS.md).

**M0: a chart view on one grid (ECharts).** Useful on its own, and settles the library in practice.
- Add ECharts (package.json, lock, BUILD) and the lazy-loaded adapter (§3.3).
- The ChartSpec (§6) with an options panel.
- A chart **pinned to the current grid**, as a panel beside or under it: the grid's query, the
  chart's own grouping.
- Replace today's Plot and Treemap menu entries.
- Dark and light theming from our CSS tokens.
- Node SVG-string geometry tests; a Playwright check.
- Optional first: the ECharts vs Plot spike (§3.2).

**M1: the dashboard grid (our layout), about 1 week.**
- Move `layout-prototype/tile-layout.ts` into `datacube/src/` and its tests into `test/`.
- Render a page from `PageDoc` (grid node only) with CSS grid
  (`grid-column: x+1 / span w; grid-row: y+1 / span h`).
- A locked **view mode**; responsive columns via ResizeObserver + `fitToColumns`.
- An **edit mode** with keyboard move/resize and live announcements.
- Title-bar pointer drag with a held placeholder.
- The page module on the guardrail's REACHABLE list.
- **Done when:** model tests + a jsdom wiring test pass, and **a Playwright check shows a tile drag
  and a DataCube header drag inside that tile both still work**.
- **Needs the N-instance fixes from §1.2** (blockers 1-5, 8) and a page host (a new demo page, like
  `demo/boot.ts`).

**M2: layout polish and docking basics.**
- Auto-scroll, touch polish, animation (reduced-motion aware), resize grips (reuse `window.ts`'s).
- `split` and `tabs` layout nodes, plus **maximise a tile**. This already gives a workspace mode.

**M3: linking within a source.**
- Page filters with scope; `setContextFilter` (blocker 6); selection output (blocker 7).
- Click-to-filter from grids and charts; highlight on the emitter.
- "Filtered by ..." badges; per-pair interaction overrides.

**M4: multi-source.**
- Several sources on one page; declared links with suggestions; "not linked" badges.

**M5: persistence.**
- Save and load `PageDoc`; URL state for selections.
- Export a grid tile as a plain upstream `DataCubeSpecification`.

**Later, if wanted:** drag-to-dock with drop zones; pop-out windows (expensive, §4.1); an aggregate
("HAVING") filter feature (discussed 2026-09-28, deferred).

---

## 9. Open decisions (for the user)

1. **Order:** charts first (M0) or the layout page first (M1)? Recommendation: **M0 first**. It
   stands alone and validates ECharts before the page is built on it.
2. **ECharts vs Observable Plot spike** before committing? (Recommended if in any doubt.)
3. **Keyboard sideways step into a wide neighbour:** push it down (current prototype) or swap?
4. **Editing at narrow widths:** lock the layout below a width (recommended), or keep per-breakpoint
   overrides?
5. **Tiles in background tabs:** do they query immediately on a filter change, or when shown (with a
   "changed" cue)?
6. **Where the page lives:** a new route or page in the demo host first? The production host is
   another session's "servers from configuration" work (`9f67c939d`).
7. **Chart data volume:** should a pinned chart cap its query (top N and "other"), and how does the
   UI say so?

---

## Appendix: the homework folder

Everything is in [`datacube-dashboards-homework-2026-09-28/`](datacube-dashboards-homework-2026-09-28/):

| Path | What | Reproduce |
|---|---|---|
| `layout-prototype/tile-layout.ts` | the pure layout model (§4.3) | - |
| `layout-prototype/tile-layout.test.ts` | 50 tests | `cd layout-prototype && node --experimental-strip-types --test tile-layout.test.ts` |
| `layout-prototype/fuzz-deep.ts` | 488k-gesture fuzz | `node --experimental-strip-types fuzz-deep.ts` |
| `layout-prototype/probe.ts` | ASCII layout pictures | `node --experimental-strip-types probe.ts` |
| `layout-prototype/tsconfig.json` | DataCube's strict flags | `npx tsc -p layout-prototype` |
| `gridstack/gridstack-loc.md`, `measure-gridstack.mjs` | gridstack line counts by concern (§4.2) | `npm pack gridstack@14.0.0`, unpack, extract sources from sourcemaps, run the script |
| `charts/entries/*.js` | the esbuild entry per library used for sizes | `npm i` the libraries in `charts/survey-package.json`, then `esbuild entries/<x>.js --bundle --minify \| gzip -9 \| wc -c` |
| `charts/render-check-echarts.mjs` | ECharts renders SVG in node with no DOM | `node render-check-echarts.mjs` (with echarts installed) |
| `charts/render-check-vega-csp.mjs` | Vega renders with `Function` stubbed out (CSP) | as above, with vega, vega-lite, vega-interpreter |
| `charts/render-check-plot.mjs` | Observable Plot renders in jsdom | as above, with @observablehq/plot, jsdom |

These files are reference material, outside every Bazel glob and tsconfig. They are not built or
tested by `bazel test //...`.
