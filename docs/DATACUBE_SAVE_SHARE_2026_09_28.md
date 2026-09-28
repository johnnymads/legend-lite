# DataCube: save, load and share (#21) — plan, 2026-09-28

A saved cube is upstream's `DataCubeSpecification`, and one spec moves unchanged between every
place it can live: the browser's own store, a share link, a single file, and legend-lite's
server. The spec writer and reader are the core; everything else is a place to put a spec.

Standing rulings that bind: upstream APIs only, exact shapes; types come from the compiler;
Relation API only in what we build; users over upstream parity, never lose functionality; user
identity always, no service accounts; everything through Bazel; no Java dependencies; no
trademarks in names.

## Where we were (before milestone 1)

- Save View / Load View: one `localStorage` slot, our own `SavedView` format (version 3).
- Only the snapshot, the open paths, the column order and formats are saved, and order and
  formats are not restored on load (audit P2-70). The rest of the configuration (titles,
  colours, fonts, widths, hidden columns, display names, heatmaps, grid lines, pins) is never
  saved. Tree sort, pivot-total aggregates, leaf counts and kept grouped columns revert (P2-71).
- Export › "DataCube Specification" writes that `SavedView` JSON under upstream's name, and
  nothing can open it again (P2-90).
- No reader from Pure query text to a cube; no store endpoints; no Load / Save / Delete
  dialogs; no `/:id` route; lite does not serve `grammarToJson/valueSpecification` (E3).

## Step 0 — upstream, as read (DONE 2026-09-28)

Read at legend-studio `c5b2f2c78` (the census pin; `/Users/neemsandv/legend/legend-studio`) and
legend-engine 4.145.0 (`~/legend/legend-engine`). Paths below are under
`packages/legend-data-cube/src/stores/core/` unless named.

### The spec (`model/DataCubeSpecification.ts`)

```
DataCubeSpecification {
  query: string                       // the PARTIAL query: see below
  configuration?: DataCubeConfiguration
  source: PlainObject                 // raw source JSON, tagged by `_type`
  options?: { autoEnableCache?: boolean }
  dimensionalTree?: DataCubeDimensionalTree
}
```

- `query` is the cube's composition WITHOUT its source: upstream builds the full query over a
  dummy `''` source, prints it, and strips the leading `''->` (`DataCubeEngine.getPartialQueryCode`).
  So a saved query reads `select(~[a, b])->groupBy(...)->sort(...)->limit(500)`.
- The spec a view saves = source (unchanged from open) + configuration (from the snapshot) +
  partial query code + dimensional tree (`view/DataCubeViewState.generateSpecification`).
- Serialization is serializr: on READ, fields it does not know are DROPPED silently; on write,
  only schema fields go out. Our extras survive our own round trip, not upstream's.

### The configuration (`model/DataCubeConfiguration.ts`)

- Cube level: `name`, `description`, `columns[]`, grid lines and colour, `gridMode`, fonts
  (family, size, bold, italic, underline, strikethrough, case), `textAlign`, the four
  foreground and four background colours, alternate rows (on, standard mode, colour, count),
  `showSelectionStats`, `showWarningForTruncatedResult`, `initialExpandLevel`,
  `showRootAggregation`, `showLeafCount`, `treeColumnSortDirection`, `pivotStatisticColumnName`,
  `pivotStatisticColumnPlacement`, `pivotLayout {expandedPaths[]}`, `dimensions {dimensions[{name,
  columns[]}]}`.
- Per column: `name`, `type` (precise primitives converted to plain), `kind`, `displayName`,
  number format (`decimals`, `displayCommas`, `negativeNumberInParens`, `numberScale`,
  `missingValueDisplayText`, `unit`), fonts, alignment, the eight colours, `isSelected`,
  `hideFromView`, `blur`, widths (`fixedWidth`, `minWidth`, `maxWidth`), `pinned`,
  `displayAsLink`, `linkLabelParameter`, `aggregateOperator`, `aggregationParameters`,
  `excludedFromPivot`, `pivotSortDirection`, `pivotStatisticColumnFunction`.
- The open tree already has a home: `pivotLayout.expandedPaths`.

### The reader (`DataCubeSnapshotBuilder.ts`)

- Accepts exactly one composition, in this order (anything else is refused, naming the
  supported composition):
  `extend()* → filter() → select() → [sort()→pivot()→cast()] → [groupBy()→sort()] → extend()* →
  sort() → limit()`. `extend(over(...))` (window columns) is accepted.
- No `select()` means no column is selected.
- A pivot is `sort → pivot(~[keys], ~[aggregates]) → cast(@Relation<(the pivoted columns)>)`:
  the cast lists the pivot's result columns, i.e. the values found when it was saved.
- Aggregates and filters are matched against upstream's own operation lists:
  - aggregates `sum avg count min max uniq first last var var_sample std std_sample strjoin`
    (median and wavg are commented out upstream);
  - filters: `= != < <= > >= in, not in, is null, is not null, contains / starts / ends (and
    not), case-insensitive = != contains starts ends`, and the column-to-column forms.
- Then the configuration is VALIDATED against the query, strictly: the same column set, in the
  same order (select, group-extended, then the rest), the same `type` and `isSelected` per
  column, the same `kind` for pivot and group columns, the same `aggregateOperator` (and
  compatible parameters) when aggregated, the same `excludedFromPivot` and
  `pivotSortDirection` when pivoted, the tree sort direction when grouped, and no dimension
  left un-excluded from a pivot. No configuration: one is generated from the query.
- Conformance suite, ready made: `__tests__/DataCubeQueryRoundtrip.data-cube-test.ts`, 290 cases
  (163 refusals, each with upstream's exact message).

### Sources

- `localFile` (`legend-application-data-cube/src/stores/model/LocalFileDataCubeSource.ts`):
  `{_type:'localFile', fileName, fileFormat:'csv', _ref, columnNames}`. Reopening a saved one
  ASKS THE USER FOR THE FILE again, checks its columns match `columnNames`, and re-ingests it
  (`LocalFileDataCubeSourceLoaderState`). Only CSV upstream (Parquet etc. are a TODO there).
- `freeformTDSExpression`: `{query (Pure text), runtime, mapping?, model}`.
- `userDefinedFunction`: `{functionPath, runtime?, model}`.
- Also `legendQuery`, two lakehouse kinds, the REPL's, and a cached source (`db, schema, table,
  count, model, runtime`) behind `options.autoEnableCache`.
- Upstream's app reopens only `localFile` through a loader; others are processed directly.

### The store (legend-engine `legend-engine-application-query`)

- Record `DataCubeQuery {id, name, description, content (the spec), owner, createdAt,
  lastUpdatedAt, lastOpenAt}`; `PersistentDataCube` is the client's twin.
- `POST query/dataCube/search` with `QuerySearchSpecification {searchTermSpecification
  {searchTerm, exactMatchName, includeOwner}, limit, showCurrentUserQueriesOnly,
  sortByOption: SORT_BY_CREATE | SORT_BY_VIEW | SORT_BY_UPDATE, …}`: returns a LIGHT projection
  (`id name owner createdAt lastUpdatedAt lastOpenAt`, no content); the current user's first,
  then the sort, then the limit (capped). Search term matches id, name, or owner.
- `GET dataCube/batch?queryIds=` (at most 50), `GET dataCube/{id}` (stamps `lastOpenAt`),
  `POST dataCube` (the CLIENT supplies the id; a taken id is refused; owner forced to the
  current user), `PUT dataCube/{id}` (id change refused; owner-only, an unowned one is claimed),
  `DELETE dataCube/{id}` (owner-only). Also `dataCube/events` and `dataCube/stats`.
- Upstream stores it in MongoDB.

### Routes and dialogs (`legend-application-data-cube`)

- Route `/:dataCubeId?`: with an id, the cube is fetched from the store and its source loaded.
- `?sourceData=<url-safe base64 of the raw SOURCE JSON>`: builds a NEW cube on that source (the
  launch point other apps use). It does not carry a whole cube.
- Delete confirmation: type `<user>_<yyyyMMdd>` (anonymous: `_<yyyyMMdd>`).

### Ours, checked

- lite parses and types `pivot(...)->cast(@Relation<(...)>)` (`TypeInferenceIntegrationTest`).
- lite does not yet serve E3 (`grammarToJson/valueSpecification`), which reading a partial
  query needs; E4 prints lambdas byte for byte with upstream.

## Decisions (the user, 2026-09-28) — these REPLACE the upstream-format plan that followed step 0

1. **Our own clean format.** A saved cube is OUR versioned document, designed the way we think is
   right; a legacy `DataCubeSpecification` is read by a one-way TRANSLATOR (milestone 2). Opening
   our cubes in upstream DataCube does not matter. Step 0 becomes the translator's specification
   and the superset checklist (gap found: first/last aggregates).
2. **What matters:** opening EXISTING saved cubes in ours, and running ours against legend-engine
   proper — both milestone 2, designed with T9 (sources).
3. **Milestone 1** works in legend-lite's closed ecosystem so people save NOW, built on the step-0
   homework so milestone 2 needs no rework. Then 1b (sharing), then 2.
4. **A pivot is saved as intent** (`pivot(~[keys], ~[aggs])` where query text is written; never the
   values found); a legacy `sort → pivot → cast` is rewritten to ours, never run as is.
5. **The store is upstream's API and record** (`DataCubeQuery`); `content` is our document.
6. **Read access**: the database enforces data access under the reader's identity; the store does
   not gatekeep reads.
7. **Model versions are pinned**, with an easy upgrade path. **Schema drift** reconciles and reports,
   never refuses: a new column is available but hidden; a part that uses a column that is gone is
   left out and named (no auto-save); a changed type is the compiler's, reported.
8. **A saved cube never stores data.** A file is named by identity (name, format, size, SHA-256,
   columns). Reopening: a sample is rebuilt from its seed; a kept file handle (File System Access,
   Chrome/Edge) is read from where it was picked, after one click if the browser asks; otherwise the
   user is asked for the file. The handle stays in this browser, never in a document or a share.
9. **Local files first** (no model home needed: the model is derived from the file); model-backed
   cubes follow the model home (`docs/MODEL_HOME_2026_09_28.md`).

## The cube document, version 1 (`datacube/src/cube-document.ts`)

```
{
  kind: "datacube.cube", version: 1, name,
  source: { _type: "file", name, format: "csv"|"parquet"|"json", size, sha256, columns[{name,type}],
            sample?: { id, rows } },
  query:  the cube's definition: columns (with the settings the cube set on each), derived and
          groupDerived (lambdas as exact protocol JSON), filter, rows, pivotOn, pivotValues,
          pivotSort, pivotTotal, keepGroupedColumns, leafCount, childCount, measures, sorts,
          treeColumnSort, maxRows — read WHOLE (no allow-list; unknown fields carried);
          never the relation (derived from the source on open), the epoch or the row window
  configuration: differences from the product defaults only (null = a default unset)
  tree: { open: typed row paths, showTotals }
  ...fields a newer writer added, kept verbatim
}
```

Refused with a message: not JSON, not a saved cube, a legacy specification ("not built yet"), a newer
version, an unknown source kind or file format.

## Milestone 1, step 1 — local-file cubes end to end: DONE 2026-09-28

- `src/cube-document.ts` (write, read, reconcile on open), `src/cube-store.ts` (upstream's store rules
  once, over memory or IndexedDB records; content kept as exact JSON text), `src/file-handles.ts`,
  `src/ui/cube-library.ts` (the Cubes window: save, save as new, search, sort, open, delete,
  open a cube file), the page's flow in `demo/boot.ts` (host menu "Cubes…").
- The one-slot Save View / Load View and `src/persist.ts` are deleted; Export › "Cube File (JSON)"
  writes the document (offered only when the cube knows its source).
- Proof: `test/cube-document.test.ts` (every snapshot field round-trips — a `Required<CubeSnapshot>`
  fixture, so a new field cannot be forgotten), `test/cube-store.test.ts` (upstream's rules),
  `test/cube-open/cube-open.ts` (the real app over DuckDB-WASM and the planner: save, re-read the
  file, a FRESH app shows the same typed values; a lost column and a new one reconcile as ruled),
  `bazel run //datacube:verify_cubes` (a real browser: save, reload, open asking for the file, the
  same values; a sample cube reopens with no question; delete) 5/5; `verify_features` 170/170.
- Not yet: the file handle path cannot be driven by the harness (Playwright hands files to an
  `<input>`, which keeps no handle) — covered by reading only; Ad Hoc Analysis state and named
  dimensions are not saved yet; the Save dialog names but does not yet warn on "changed since saved".

## Next

- Milestone 1 step 2: model-backed cubes on the model home's first slice (pointer, `demo:trades:1.0.0`).
- Milestone 1b: sharing (link, single-file Parquet, share sheet).
- Milestone 2 (with T9): the legacy translator, upstream sources, legend-engine proper.

## What this closes

Census §1, §F "open a cube from Pure query text", §H (routes, dialogs, what a save holds, delete,
owner); audit P2-70, P2-71, P2-90; contract C3, E3, Q2, S1, P6.
