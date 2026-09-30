# Legend Query and Query Builder: feature census for parity

This census comes from reading the source of upstream `finos/legend-studio` master at commit `8dc8e4ce`, dated 2026-09-29. There was no usable local checkout: `/Users/neema/CascadeProjects/windsurf-project/_reference/legend-studio` contains only `legend-data-cube`. I sparse-cloned the relevant packages into the scratchpad instead: `/private/tmp/claude-501/-Users-neema/ecffd318-7b87-4199-9a55-e63e2854159c/scratchpad/ls/packages/`. No local project files were modified.

The docs at legend.finos.org (`finos/legend/docs/tutorials/query-*.md`) are mostly "coming soon" stubs, so the source is the authority throughout.

**Path prefixes used below:**
- **LQ** = `legend-application-query/src`
- **QB** = `legend-query-builder/src`
- **DS** = `legend-extension-dsl-data-space/src`
- **DP** = `legend-extension-dsl-data-product/src`
- **SVC** = `legend-extension-dsl-service/src`
- **LG** = `legend-graph/src/graph-manager`

**Importance:** **C** = core, **I** = important, **N** = niche.

---

## 1. Entry points, routes and deep links

The route table is in `LQ/components/LegendQueryWebApplication.tsx`, and the URL generators are in `LQ/__lib__/LegendQueryNavigation.ts` and `LQ/__lib__/DSL_DataSpace_LegendQueryNavigation.ts`. GAV in a URL is written `groupId:artifactId:versionId`. The version can be `latest` (resolved through depot `/versions/{g}/{a}/latest`) or `HEAD` / `master-SNAPSHOT`. "Extension" routes are prefixed by `generateExtensionUrlPattern`, which gives `/extensions/...`.

| Route | Component / store | What it does | Imp |
|---|---|---|---|
| `/` | `QueryCreator` → `DataProductQueryCreatorStore` (`LQ/components/data-space/DataProductQueryCreator.tsx`) | **This is the default landing, and it is the query editor itself** with a data space / data product selector. It restores the most recently visited data space or product from user data; if there is none, it shows the bare selector. Every data-product and data-space route renders this same component, and the URL is then rewritten to `/`. | C |
| `/extensions/dataspace/:gav/:dataSpacePath/:executionContext?` plus `?runtimePath=&class=` | QueryCreator (legacy data space) | Creates a query from a data space, execution context, optional runtime and optional class. | C |
| `/extensions/dataspace` | QueryCreator | Data space setup (bare selector). | I |
| `/extensions/dataspace/:gav/:dataSpacePath/template/:templateQueryId` | `DataSpaceTemplateQueryCreator` (`LQ/stores/data-space/DataSpaceTemplateQueryCreatorStore.ts`, `BaseTemplateQueryCreatorStore.ts`) | Opens a data space executable or template query. The id is resolved by `executables[].id`, then by service/function path, then by analytics `info.id`. URL query params become parameter defaults. | I |
| `/data-product/:accessType/:gav/:dataProductPath/:accessId` | QueryCreator | `accessType` is `native`, `model` or `lakehouse`. `accessId` is an execution-context key, an access point group id, or an access point id respectively. | I |
| `/data-product/native/sample-query/:gav/:dataProductPath/:sampleQueryId` | `DataProductSampleQueryCreator` | Loads `nativeModelAccess.sampleQueries[id]`. | N |
| `/ingest/:gav/:ingestDefinitionPath/:dataSet` | `IngestQueryCreator` (`LQ/stores/ingest/*`) | Accessor query over a Lakehouse ingest dataset, using an ad-hoc Lakehouse runtime. | N |
| `/create/manual/:gav/:mappingPath/:runtimePath` | `MappingQueryCreator` (`MappingQueryCreatorStore` in `LQ/stores/QueryEditorStore.ts`) | Query on a class, mapping and runtime. | C |
| `/create-from-service/:gav/:servicePath` plus `?executionKey=` | `ServiceQueryCreator` (`ServiceQueryCreatorStore`) | Starts from a service's query. The execution key selects the context of a multi-execution service. | I |
| `/edit/:queryId` plus `?revisionId=` plus `?p:<paramName>=<value>` | `ExistingQueryEditor` (`ExistingQueryEditorStore`) | Opens a saved query. `revisionId` loads a historical revision. `p:`-prefixed params override parameter values (see below). After load, the URL is rewritten to keep only `revisionId`. | C |
| `/edit/:queryId/cube` | `ExistingQueryDataCubeViewer` (`LQ/stores/data-cube/ExistingQueryDataCubeViewer.ts`) | Opens a saved query in an embedded DataCube (`QueryBuilderDataCubeEngine`). | I |
| `/setup` plus `?showAllGroups=&showAdvancedActions=&tag=` | `QuerySetupLandingPage` (`LQ/components/QuerySetup.tsx`, `LQ/stores/QuerySetupStore.ts`) | Legacy action-card landing page (listed below). | I |
| `/setup/existing-query` | `EditExistingQuerySetup` | Query loader page: recent queries plus search. | C |
| `/setup/manual` | `CreateMappingQuerySetup` | Wizard: pick project (depot), version, mapping, runtime. Uses `surveyMappingRuntimeCompatibility`. | I |
| `/extensions/setup/clone-service-query` | `CloneQueryServiceSetup` | Wizard: pick project, version, service and execution key, then go to create-from-service. | N |
| `/extensions/setup/productionize-query` | `QueryProductionizerSetup` | Pick a saved query, then open Studio `/extensions/productionize-query/{queryId}`. | N |
| `/extensions/setup/update-existing-service-query` | `UpdateExistingServiceQuerySetup` | Search services (depot `entitiesByClassifierPath`), then open Studio `/extensions/update-service-query/{servicePath}@{g:a}`. | N |
| `/extensions/setup/load-project-service-query` | `LoadProjectServiceQuerySetup` | Pick a project, then open Studio `/extensions/update-project-service-query/{projectId}`. | N |
| `/dev/dataspace-inspector` | `DataSpaceArtifactInspector` | Developer tool that shows the sizes of the data space analytics artifacts in depot. | N |
| Plugin pages | `getExtraApplicationPageEntries` | Extension routes contributed by plugins. | N |

**URL parameter overrides.** Source: `LQ/components/utils/QueryParameterUtils.ts`.
- `?p:name=value` overrides the saved default parameter values.
- Values are coerced by the compiled parameter type: String values are wrapped as `'v'`, Date / StrictDate / DateTime values become `%v`, and anything else is passed through raw.
- The overrides are preserved when navigating between revisions.
- Importance: I.

**Landing page action cards.** Sources: `LQ/components/Core_LegendQueryApplicationPlugin.tsx` and `LQ/stores/LegendQueryApplicationPlugin.tsx` (`QuerySetupActionConfiguration {key, isCreateAction, isAdvanced, tag, label, icon, action}`).
- Open an existing query
- Create query from data space
- Create new query on a mapping (advanced)
- Clone an existing service query (advanced)
- Productionization-tagged actions:
  - Update an existing service query
  - Open service query from a project
  - Productionize an existing query
- A Studio card
- Toggles: "Show all action groups" and "Show advanced actions"
- A virtual assistant toggle
- Importance: I.

**External deep links the app generates:**
- Studio project view: `{studio}/view/{projectId}[/version/{v}][/entity/{path}]`. The studio instance is chosen by `studioInstances[].sdlcProjectIDPrefix`.
- Marketplace data space: `{marketplace}/dataProduct/legacy/{gav}/{dsPath}`.
- Marketplace data product: `{marketplace}/dataProduct/deployed/{id}/{did}#apg-{id}`.
- DataCube app: `{dataCube}?sourceData=base64(JSON{_type:'legendQuery', queryId})`.

---

## 2. Finding what to query

| Feature | Description | Source | Imp |
|---|---|---|---|
| Unified data space / data product selector | Data spaces come from depot `GET /classifiers/meta::pure::metamodel::dataSpace::DataSpace/entities?scope=RELEASES`. Data products come from Lakehouse `/dataproducts/lite/paginated` (production, SDLC-origin only), falling back to depot `getEntitiesSummaryByClassifier(DataProduct)`. Data products appear only when `NonProductionFeatureFlag` is set. Options are merged and sorted, with a GAV tooltip and a Lakehouse badge. | `LQ/stores/data-space/DataProductSelectorState.ts`, `LQ/components/shared/LegendQueryDataProductOptionLabel.tsx` | C |
| Bare setup panel | Before a source is chosen: "Search for data space..." selector, an advanced-search button, and a disabled class selector. | `LQ/components/data-space/DataSpaceQuerySetup.tsx`, `LQ/stores/data-space/LegendQueryBareQueryBuilderState.ts` | C |
| Advanced data space search | Modal that lists data spaces, with a snapshot toggle and name search. Selecting one shows a full **DataSpaceViewer** preview; "Proceed to create query" continues. | `DS/components/query-builder/DataSpaceAdvancedSearchModal.tsx`, `DS/stores/query/DataSpaceAdvancedSearchState.ts` | I |
| Recently viewed (no favourites anywhere) | Stored in the user-data service (localStorage) under these keys, each with a limit: `query-editor.recent-queries` (10 ids), `query-editor.recent-dataSpaces` (10 entries of `{id, g, a, path, versionId, execContext, lastViewedAt}`), `query-editor.recent-dataProducts` (50), and `query-editor.lakehouse-info` (`{env, snowflakeWarehouse}`). Visited data spaces are sorted to the top of the selector. | `LQ/__lib__/LegendQueryUserDataHelper.ts`, `LegendQueryUserDataSpaceHelper.ts` | I |
| Project / version (GAV) pickers | Depot `getProjects` → `getVersions(g, a, snapshots=true)`. The version list is `latest`, `HEAD`/snapshot, then semver sorted descending. | `LQ/components/QuerySetup.tsx` (`buildProjectOption`, `buildVersionOption`), `CreateMappingQuerySetupStore.ts` | I |
| Featured / curated | There is no featured list. Curated content consists of data space **executables / template queries** and data product **sample queries**, plus the plugin "Curated Template Query" filter in the query loader. | see §3 and §9 | I |
| Marketplace search | The Query app does **not** call marketplace search. It only deep-links to marketplace. | – | N |

---

## 3. Data space viewer and data space inside Query

### 3.1 Metamodel

Source: `DS/graph/metamodel/pure/model/packageableElements/dataSpace/DSL_DataSpace_DataSpace.ts`. The protocol `_type` is `dataSpace`.

| Field | Shape and notes |
|---|---|
| Annotations | `stereotypes`, `taggedValues`. The stereotype `DataSpaceInfo.Verified` gives the verified badge. |
| Title and description | `title?`, `description?` (markdown). |
| `executionContexts[]` | `{name, title?, description?, mapping?, defaultRuntime?, mappingProvider?{element: DataProduct, keys[]}, testData?}`. |
| `defaultExecutionContext` | The name of one of the execution contexts. |
| `elements[]` | `{element: Package, Class, Enum or Association, exclude?}`. This is the include/exclude filter for usable classes. |
| `executables[]` | `{id?, executionContextKey?, title, description?}` plus either `DataSpacePackageableElementExecutable{executable: Service or Function}` or `DataSpaceExecutableTemplate{query: lambda}`. |
| `diagrams[]` | `{title, description?, diagram}`. The legacy `featuredDiagrams` is still accepted. |
| `supportInfo` | One of `email{address}`, `combined{emails, website, faqUrl, supportUrl}`, or `full{documentation, website, faqUrl, supportUrl{label, url}, emails[{title, address}], expertise[]}`. All variants carry `documentationUrl`. |

### 3.2 Analytics

Sources: `DS/graph-manager/action/analytics/DataSpaceAnalysis.ts` and `V1_DSL_DataSpace_PureGraphManagerExtension.ts`.

| Feature | Description | Imp |
|---|---|---|
| Cached analytics | Depot `GET /generationFileContent/{g}/{a}/versions/{v}/file/{pkgPath}/dataSpace-analytics/AnalyticsResult.json`. This is tried first. | C |
| Engine analytics | `POST /pure/v1/analytics/dataSpace/render` with `{clientVersion, dataSpace: path, model: PMCD}`. Used as the fallback. | C |
| Minimal graph | Depot `GET /generations/{g}/{a}/{v}/types/dataSpace-analytics?elementPath=`. Returns `AnalyticsResult.json` plus per-mapping `MappingModelCoveragePartition{mapping, model PMCD}` and `MappingAnalysisCoveragePartition`. This lets the app avoid loading the whole project. It is gated by config `TEMPORARY__enableMinimalGraph` and a user dev toggle. | I |
| Analysis result contents | Execution contexts, each with `compatibleRuntimes`, `datasets`, `runtimeMetadata` and mapping coverage. Also `elementDocs` (class, enum and association documentation with properties), `executables` (query text, TDS/relation result columns with documentation and sample values, service info), diagrams, `info` (verified, in-development, external, deprecation), and support info. | C |

### 3.3 Viewer panels

Sources: `DS/components/*` and `DS/stores/DataSpaceViewerState.ts`. The viewer is a scrolling wiki with an activity bar, and every section has a deep-linkable anchor (`#activity/chunk`).

| Panel | Contents | Imp |
|---|---|---|
| Header | Title, verified badge, quality emote, and a **Run Query** button (default execution context, with a dropdown for other contexts). "View Project" goes to Studio. | C |
| Description | Markdown, plus badges for Verified, In Development and External. | C |
| Diagrams | Diagram viewer with prev/next navigation, a description toggle, and tools for recenter, zoom, pan and view (keys R/Z/M/V and arrow keys). Clicking a class offers "Query class" or "View documentation". | C |
| Models documentation | Searchable grid of class, property, enum and association documentation, with type and package filters (Ctrl+Shift+F focuses search). Built from `elementDocs`. | C |
| Quick Start | One card per executable, with these tabs: Column Specs (name, type, documentation, sample values — samples are generated by running `query->take(5)`), Query ("Open in Query"), Query Text (read-only Pure with copy), Data Access, Usage Statistics (placeholder), and plugin tabs. | C |
| Data Access | Dataset entitlements: `surveyDatasets` then `checkDatasetEntitlements`, shown as a doughnut chart and table (Granted, Approved, Requested, Not Granted, Unsupported). When an execution context uses a data product mapping provider, the data product access-request panel is shown instead. | I |
| Execution Context | Context selector (marking the default), the mapping (or the data product provider), and a runtime selector over `compatibleRuntimes`. | C |
| Info | GAV, path, tagged values and stereotypes. View/Edit in Studio. | I |
| Support | Renders every `supportInfo` variant: links, emails, expertise. | I |
| Placeholders | Data Stores, Availability, Readiness, Cost, Governance (not implemented upstream). | N |
| Quality emote | Diamond through Bronze tiers from marketplace `GET /v1/doc-quality/dataspace/{env}`. | N |
| Legend AI chat | Side panel whose LLM context is built from the analysis. | N |

### 3.4 Data space query builder (setup panel inside the editor)

Sources: `DS/components/query-builder/DataSpaceQueryBuilder.tsx`, `DS/stores/query-builder/DataSpaceQueryBuilderState.ts`, `LQ/stores/data-space/query-builder/LegendQueryDataSpaceQueryBuilderState.ts`.

| Feature | Description | Imp |
|---|---|---|
| Selection cascade | Data space → execution context (shown only if there is more than one) → runtime (shown only when the context has no default runtime, or the "Show Runtime Selector" setting is on) → class ("Choose an entity..."). | C |
| Usable classes | Classes mapped by the mapping. If the coverage result has `mappedEntities[].info`, only root entities are kept. Then the `elements` include/exclude rules apply, with the longest matching path winning. **There is no "show all classes" option in the current version.** | C |
| Execution context change | `propagateExecutionContextChange`. A mapping-provider context emits `->from(dataProduct, runtime)`. A Lakehouse runtime switches the builder to typed (Relation) mode. | C |
| Lakehouse fallback runtime | For a provider context with no runtime, a synthetic `LakehouseRuntime(env, warehouse)` is created. The env comes from Lakehouse `orgResolver`. It is editable in the "Lakehouse Runtime Configuration" modal. | I |
| Template query panel | Popover listing the data space executables and templates. "Load" parses the query into the builder, switching context if needed. "Visit..." opens the template route. | I |
| Copy link | Copies the data space creator route (with context, runtime and class) or the editor route. | I |
| Switching data spaces from a saved query | Not supported: the user is warned to open a new query. If a saved data space query has unsaved changes, the user is offered "Save query and Proceed". | N |
| About Data Space modal | Shows GAV, data space, execution context, mapping or data product, runtime, store, connection, support email, and "Open Data Space" (marketplace). | I |

---

## 4. Data products, ingest and Lakehouse

Sources: `LQ/components/data-product/*`, `LQ/stores/data-product/*`, `QB/stores/workflows/dataProduct/DataProductQueryBuilderState.ts`, and `DP/*`. All of this is newer and mostly Lakehouse-specific.

| Feature | Description | Imp |
|---|---|---|
| Data product artifact | Depot `GET /generations/{g}/{a}/{v}/types/dataProduct`. Analysed client-side (`buildDataProductAnalysis`), building a minimal graph from the model access point group and native-model-access PMCDs. | I |
| Three execution modes | **Native:** an execution key selects mapping and runtime. **Model:** an access point group, executed with `from(dataProduct, runtime)`. **Lakehouse:** an access point, using a `DataProductAccessor` and a relation type from the artifact. Execution-id options are tagged MODEL, LAKEHOUSE or NATIVE. | I |
| Default access resolution | Use the first model access point group, otherwise the native default execution context. | I |
| Access errors | "You don't have access to X in Y" panel with a "Request Access in Marketplace" link (built by `getDataProductAccessRequestLinkBuilders`), a warehouse FAQ, and a note that an empty result may be a row-level access policy. | I |
| About Data Product modal | Shows access point group, mapping, env, warehouse, access point, and support. Opens the data product in marketplace. | N |
| Data product viewer (DP extension) | Access point groups and access points with columns, grammar, and a cURL for `/lakehouse/v1/execute`. Also a SQL playground (`SELECT * FROM p('dp.ap')`), Power BI and DataCube tabs, and a contract / access-request workflow with timelines, escalate and approve. This is a marketplace UI more than a Query UI. | N (for Query) |
| Ingest queries | Accessor builder: ingest definition → dataset → runtime. There is an "About Ingestion Data Set" modal. | N |
| Accessor / Relation source (`#>{db.schema.table}#`) | `AccessorQueryBuilderState`: source (ingest or database) → accessor → runtime. No mapping is needed, and execution always uses `from()`. | I (see §6) |

---

## 5. Query builder editing

### 5.1 Layout and workflows

The workflow states live in `QB/stores/workflows/*`, and the setup side bar is `QB/components/QueryBuilderSideBar.tsx`.

| Workflow | What the user picks | Imp |
|---|---|---|
| Class | Class, then a compatible mapping, then a compatible runtime (all auto-cascaded). | C |
| Mapping | Mapping, then runtime, then a class from the mapped classes. | C |
| Service | Service, then an execution key; mapping and runtime come from the service and are read-only. | I |
| DataSpace | See §3.4. | C |
| DataProduct | See §4. | I |
| Accessor | See §6. | I |
| Function | Edits a function body (used from Studio). | N |

Other shared pieces:
- **Selector behaviour.** Selectors are searchable, sorted, and style deprecated classes differently. The Lakehouse runtime label is `env / warehouse`.
- **Workflow flavours.** "Advanced" shows the status bar; "DataBrowser" hides it (`QB/stores/query-workflow/QueryBuilderWorkFlowState.ts`).

### 5.2 Explorer

Sources: `QB/stores/explorer/*` and `QB/components/explorer/*`.

**Tree behaviour**

| Feature | Description | Imp |
|---|---|---|
| Property tree | Root class, then properties, derived properties, generated milestoned properties, and **subtype nodes** (`@pkg::Sub`, whose children are only the subclass's own properties). Children are generated lazily. Sort order: primitive, derived, enum, class, subtypes. | C |
| Mapping coverage | Engine `POST /pure/v1/analytics/mapping/modelCoverage`, re-run when the mapping changes. Drives mapped/unmapped per node. Mapped properties can be auto-subtyped (`entityMappedProperty.subType`). | C |
| Toggles | Show Unmapped Properties (default off), Human Readable Property Name (default on; also drives column names), highlight used properties (on), Collapse Tree. | C / I |
| Association loop pruning | A property is skipped when its owner is the same association as its parent property's. | I |
| Row-explosion icon | Shown when the node or an ancestor has upper multiplicity greater than 1. | I |
| Derived / qualified property icon | Marks derived properties, which need arguments. | I |

**Node actions**

| Feature | Description | Imp |
|---|---|---|
| Info tooltip | Type, path, multiplicity, derived, mapped, tagged values, and `doc.doc` documentation. Includes "Show in tree", which scrolls to and highlights the node. | I |
| Context menu | "Add Property to Fetch Structure", or "Add Properties…" on a class node (adds every mapped primitive child). | I |
| Drag sources | Drag types `ROOT`, `CLASS_PROPERTY`, `ENUM_PROPERTY`, `PRIMITIVE_PROPERTY` and `RELATION_COLUMN`. The dragged text is the property path, e.g. `$x.a.b` or `$x->subType(@C)`. | C |
| Preview data | Runs from a primitive node. **Numeric:** `groupBy([], [count, distinct count, sum, min, max, average, stdDevPopulation, stdDevSample])`, transposed for display. **Other types:** `groupBy([x\|$x.p], [count])->sort(desc('Count'))->take(10)`. The query is abortable. | I |

**Search and side panels**

| Feature | Description | Imp |
|---|---|---|
| Property search | Fuse.js fuzzy search with a 2-character minimum and 100 ms debounce. Indexes up to depth 10 and 10,000 nodes; returns at most 100 results. Modes: standard, include, exact, inverse. Toggles: include documentation, subtypes, one-to-many rows. Type-filter chips (Class, Enum, String, Boolean, Number, Date) with an "Only" button. Results are draggable. | I |
| Functions explorer | User and dependency functions, as a tree or list, with a tooltip. Dragging a function onto the TDS panel creates a derivation column. | I |
| Relation explorer | The columns of an Accessor's relation type. "Add column" and "Add all columns". | I |

### 5.3 Fetch structure

Sources: `QB/stores/fetch-structure/**` and `QB/components/fetch-structure/**`.

**TDS columns and operations**

| Feature | Description | Imp |
|---|---|---|
| TDS vs graph fetch switch | Switching discards columns and post-filters after a confirm. Graph fetch disables calendar. | C |
| Projection column kinds | Simple (property chain; default name is the humanized path, e.g. `Firm/Legal Name`), relation column, and derivation. A derivation is a free-form lambda edited inline; its return type comes from `lambdaReturnType` or `lambdaRelationType`, and compilation errors are shown on the column. | C |
| Column operations | Add (drop, or double-click the context menu), remove (blocked while used by a post-filter or window), clear all (with confirm), inline rename (checked for duplicates), and drag reorder (aggregates stay last). Dropping a property onto a column replaces its property. "Convert To Derivation". | C |
| Validation | Empty column name, duplicate columns, projection/window name clash, calendar without a date column, invalid derived-property parameters. | I |

**Pure emission: legacy vs Relation.** The Relation API is used when the source is an Accessor, or when "Enable Typed TDS (BETA)" is on (`lambdaWriteMode = TYPED_FETCH_STRUCTURE`, `config.enableTypedTDS`). Loading a query that already uses `project(~[...])` also switches it on.

| Construct | Legacy TDS | Relation (typed) |
|---|---|---|
| Projection | `->project([x\|..], ['n'])`; `project([col(...)])` is preserved on round-trip | `->project(~[n:x\|$x.a])`; `->select(~[a,b])` for bare relation columns; execution adds `->from(mapping, runtime)` |
| Aggregation | `->groupBy([...], [agg(x\|..., y\|$y->op())], [names])` | `->groupBy(~[..], ~[n: x\|..: y\|$y->op()])` |
| Pipeline order | projection/groupBy → window → post-filter → distinct → sort → take/limit → slice | same |

C

**Aggregation**

- **Operators** (`tds/aggregation/operators/*`):

  | Operator | Allowed column types |
  |---|---|
  | count, distinct count, distinct (`uniqueValueOnly`) | all primitives and enums |
  | sum, average, std dev (population), std dev (sample) | numeric |
  | min, max | numeric and dates |
  | percentile (value 0–100, ascending, continuous) | numeric |
  | join (`joinStrings`) | String |
  | wavg (drop a weight column; uses `wavgRowMapper`) | numeric |

- **Behaviour.** The column is renamed `"name (op)"` and moved to the end. Importance: C (percentile, join and wavg are I or N).
- **Calendar aggregation.** Behind the "Enable Calendar" menu toggle. Per aggregate column, the user picks a calendar function, a calendar type (NY or LDN), an end date and a date column. The emitted form is `fn($x.date, 'NY', end, $x.val)`. There are 30 functions in `meta::pure::functions::date::calendar::*`: annualized, ytd, cme, cw, CYMinus2, CYMinus3, mtd, p12wa, p12wtd, p4wa, p4wtd, p52wa, p52wtd, pma, pmtd, pqtd, priorDay, priorYear, pw, pw_fm, pwa, pwtd, pymtd, pyqtd, pytd, pywa, pywtd, qtd, reportEndDay and wtd. Importance: N.

**Window / OLAP** (`tds/window/*`)

- **Operators:**
  - Aggregates: sum, count, max, min, avg.
  - Ranking: rank, dense rank, row number.
  - average rank (legacy mode only).
  - percent rank (typed mode only).
- **Each window column has:** partition columns, a single sort-by column with direction, and a name (default `"op of col"`).
- **Emission:**
  - Legacy: `olapGroupBy([...], asc('c'), func('c', y\|$y->sum()), 'name')`.
  - Relation: `extend(over(~[..], [~c->ascending()]), ~name:{p,w,r\|$r.c}:y\|$y->sum())`.
- **Rules:** a column cannot reference a column defined after it.
- **UI:** an editor modal, and rows can be reordered.
- Importance: I.

**Post-filter** (`tds/post-filter/*`)

- The same AND/OR tree as the main filter, applied to TDS, aggregate and window columns.
- The right-hand side can be a value, a variable or **another column**.
- Operators: is / is not, `<` `<=` `>` `>=`, starts with / contains / ends with (and their negations), in / not in (String, numeric, enum — **no dates**), and is empty / is not empty (optional columns only).
- Column access is `$row.getString('c')` in legacy mode and `$row.c` in relation mode.
- DateTime compared with a date uses `isOnDay` / `isBeforeDay` and similar.
- A typeahead is available.
- The panel's visibility is persisted as a setting.
- Importance: I.

**Query options modal** ("Set Query Options" / "Query Options - summary")

- Sort columns (ASC/DESC, any TDS column).
- Eliminate duplicate rows (`distinct`).
- Limit results (`take` in legacy mode, `limit` in relation mode).
- Slice (start/end).
- Watermark.
- Milestoning options: all versions, all versions in range, default business/processing dates.
- Importance: C.

**Graph fetch** (`graph-fetch/*`)

- Tree of properties with subtypes. Nodes can be removed.
- "Check graph fetch" (`graphFetchChecked`).
- Serialization:
  - `->serialize(#{..}#, config?)`. The config fields are typeKeyName (default `@type`), dateTimeFormat, includeType, includeEnumType, removePropertiesWithNullValues, removePropertiesWithEmptySets, fullyQualifiedTypePath and includeObjectReference.
  - **Or** `->externalize(binding, tree)` for an external format.
- Post-filter is not supported in graph fetch.
- Importance: C (external format and config are I).

### 5.4 Filter

Sources: `QB/stores/filter/**` and `QB/components/filter/QueryBuilderFilterPanel.tsx`.

**Tree structure and editing**

| Feature | Description | Imp |
|---|---|---|
| Tree | AND/OR groups ("Switch Operation"), conditions, blank placeholders, and **exists nodes**. There is **no NOT group**: negation exists only per operator. Operations: create condition, create group from condition, create logical group, cleanup (prune), simplify (merge nested groups with the same operator), collapse and expand. | C |
| Exists handling | Dropping a property chain that crosses a to-many link builds nested `->exists(x_1\|...)` lambdas. Conditions dropped under a matching exists node merge into it. Relation columns never use exists. | I |
| Drag and drop | Explorer property → condition. Filter condition onto a condition → new group. Filter condition onto a group → move. Projection column → filter (on by default). Variable or property onto the value slot. A filter condition can be dragged **out** to the TDS panel to become a column. | C |
| Right-hand side | A literal, a collection, a **variable** (parameter or constant), **another property**, or another relation column. Changing the operator coerces the value between single and list. | C |

**Operators and values**

| Feature | Description | Imp |
|---|---|---|
| Operators | Types are normalized, so Varchar counts as String, Int as Integer, and so on. **is / is not:** primitives and non-empty enums; DateTime compared with a date uses `isOnDay`. **`< <= > >=`:** numeric and dates. **starts with / contains / ends with** and their negations: String. **is in list of / is not in list of:** String, numeric, dates, enums. **is empty / is not empty:** optional chains only. | C |
| Value editors (`QB/components/shared/BasicValueSpecificationEditor.tsx`) | **String:** input, or a creatable select when typeahead is on. **Boolean:** toggle. **Number:** input that evaluates **mathjs expressions**. **Enum:** dropdown. **Date:** CustomDatePicker. **List:** chips; Enter or comma adds a value, **paste parses CSV**, plus copy to clipboard. **Variable:** a `$name` chip. Every editor has Reset. | C |
| CustomDatePicker (`QB/components/shared/CustomDatePicker.tsx`) | Absolute date or time, today(), now(), Yesterday / Week / Month / Year ago, custom `adjust(ref, ±N, DurationUnit)` (reference: today, now, start of year/quarter/month/week, or previous day of week), `previousDayOfWeek(DayOfWeek.X)`, `firstDayOfThis{Week,Month,Quarter,Year}`, and `%latest`. Existing function expressions are parsed back into a picker option. | C |
| Typeahead (`QB/stores/QueryBuilderTypeaheadHelper.ts`) | Applies to String values once 2 or more characters are typed, with a 1 s debounce; a mapping and runtime are required. It executes `\|Class.all(<defaults>)->project([x\|$x.p],['p'])->filter(row\|$row.getString('p')->startsWith('txt'))->distinct()->take(10)` through `/pure/v1/execution/execute` and uses the first column. Post-filter typeahead also supports aggregate and derivation columns. | I |
| Derived property parameters | "Set Derived Property Argument(s)..." modal on the condition badge. Values can be literals or dropped variables. Missing values block execution. | I |

### 5.5 Parameters, constants, milestoning and watermark

Sources:
- Parameters and constants: `QB/stores/QueryBuilderParametersState.ts`, `QB/stores/shared/LambdaParameterState.ts`, `QB/components/QueryBuilderParametersPanel.tsx`, `QB/stores/QueryBuilderConstantsState.ts`.
- Milestoning: `QB/stores/milestoning/*`.
- Watermark: `QB/stores/watermark/*`.

**Parameters**

| Feature | Description | Imp |
|---|---|---|
| Parameters panel | Add, edit and delete. Delete is blocked when the parameter is "Used in query". Name validation: non-empty, unique across parameters and constants, and an identifier with no spaces that does not start with an uppercase letter or digit. | C |
| Types and multiplicity | Types: every primitive and every enumeration (no classes). Multiplicity: `[1]`, `[0..1]` or `[*]`. | C |
| Mock defaults | Date and DateTime default to `now()`, StrictDate to `today()`, String to `''`, numbers to 0, Boolean to false, an enum to a random value, and `[*]` to an empty list. | C |
| Parameter prompt | The "Set Parameter Values" modal appears before Run, Export or DataCube whenever non-milestoning parameters exist. | C |
| Execution encoding | Values are sent as `parameterValues[]`. Function values such as `now()` are instead prepended as `let p = now();` statements. | C |
| Saved defaults | Stored with the query as `defaultParameterValues [{name, content: pure text}]`. | C |

**Constants**

| Feature | Description | Imp |
|---|---|---|
| Constants | **Simple:** `let c = literal`, typed as String, Boolean, a number type or a date type. **Calculated:** `let c = <any Pure>`, edited in a lambda editor. "Convert To Derivation" turns a simple constant into a calculated one. | I |

**Milestoning**

| Feature | Description | Imp |
|---|---|---|
| Implementations | Business, processing and bitemporal. Selecting a milestoned root class auto-creates hidden `businessDate` / `processingDate` Date parameters (defaulting to `now()`) and emits `getAll($businessDate)` and similar. | C |
| Version queries | `getAllVersions()`, and `getAllVersionsInRange(start, end)` (not supported for bitemporal classes). | I |
| Date propagation | Dates propagate through milestoned property chains according to a source×target stereotype table. When a user edits a propagated date, an alert asks whether to proceed or propagate the defaults. | C |

**Watermark**

| Feature | Description | Imp |
|---|---|---|
| Watermark | `->forWatermark(value)` placed after `getAll`. The value is a String literal or a String `[1]` parameter. | N |

### 5.6 Text mode, round-trip and unsupported queries

Sources: `QB/stores/QueryBuilderTextEditorState.ts`, `QB/components/QueryBuilderTextEditor.tsx`, `QB/components/shared/LambdaEditor.tsx`, `QB/stores/QueryBuilderUnsupportedQueryState.ts`.

| Feature | Description | Imp |
|---|---|---|
| Edit Pure | Monaco lambda editor with code-completion typeahead (`/codeCompletion/completeCode`). Buttons: Proceed, Cancel, Copy. A parse error blocks Proceed. | C |
| Show Pure / Show Protocol | Read-only Pure text, and read-only JSON protocol. JSON cannot be edited. | I |
| Round-trip | Text → `grammarToJson/lambda` → `rebuildWithQuery`, which is the full form parser (`QueryBuilderStateBuilder` and the per-feature state builders). Parameter values and results are preserved. Any exception drops the query into unsupported mode. | C |
| Unsupported mode | Shows "Can't display query in form mode due to: {error}" with an **Edit in text mode** button. Parameters are still extracted, so the user can still set parameter values, **run, export, save** and edit text. Undo, diff and the form panels are disabled. | C |
| Compile (F9) | Form mode compiles with `lambdaReturnType`. If the error can't be placed in the form, the query is redirected to text mode with the error location marked. | I |
| TDS → Relation autofix | Engine `/compilation/autofix/transformTdsToRelation/lambda` is available. | N |

### 5.7 State infrastructure and user experience

Sources: `QB/stores/QueryBuilderState.ts` and `QB/components/QueryBuilder.tsx`.

**State and history**

| Feature | Description | Imp |
|---|---|---|
| Change detection | A hash over every sub-state. The unsaved state is `hasChanged`. The navigation blocker shows Proceed/Abort. | C |
| Undo / redo | A ring buffer of the last 10 lambdas, recorded on hash change. Undo and redo rebuild state from the lambda. Buttons sit in the header. | I |
| Query diff | "Query Diff" modal with Grammar and JSON tabs, comparing the initial query with the current one. | I |
| Stale-result detection | Compares the hash at last run with the current hash and shows "Preview data might be stale". | I |

**Menus and shortcuts**

| Feature | Description | Imp |
|---|---|---|
| Advanced menu | Show Functions, Parameters, Constants, Filter, Post-Filter and Window Functions. Tabular Data Structure vs graph fetch. Enable Calendar. Enable Typed TDS (BETA). Check Entitlements. Edit / Show Pure. Show Protocol. Compile. Show Query Diff. Documentation, FAQ, Support Tickets, Virtual Assistant. | I |
| Status bar | Diff, Compile, `{ }` (protocol), Edit Pure. | I |
| Keyboard shortcuts | F9 compiles; it is the only registered command. Undo and redo use legend-art buttons (Ctrl/Cmd+Z / Y). The results grid supports Ctrl+A, Ctrl+Space, Shift+Space and Shift+PageUp/PageDown. Enter commits edits and Escape clears search. | I |
| Settings (localStorage) | `query-builder.showPostFilterPanel` and `query-builder.showQueryAgentChatPanel`. | N |

**Look, feel and extensibility**

| Feature | Description | Imp |
|---|---|---|
| Dark mode | Dark by default. There is a "Toggle light/dark mode" header button (`TEMPORARY__isLightColorThemeEnabled`). | I |
| Plugin extension points | Curated templates, load-query filters, export-menu items, help-menu items, header actions, query usage tabs, agent chat renderers, entitlement renderers, telemetry metadata providers. Declared in `QB/stores/QueryBuilder_LegendApplicationPlugin_Extension.ts` and `LQ/stores/LegendQueryApplicationPlugin.tsx`. | N |

---

## 6. Relation API, TDS and DataCube

| Feature | Description | Source | Imp |
|---|---|---|---|
| Typed TDS mode | Emits `meta::pure::functions::relation::*` functions (project, select, groupBy, extend/over, sort, limit, distinct, slice). Execution wraps the query in `from(mapping, runtime)`. | `QB/stores/QueryBuilderState.ts`, `QB/graph/QueryBuilderMetaModelConst.ts` | I |
| Accessor source `#>{...}#` | Relational store accessor (`db.schema.table`), Ingestion accessor, or DataProduct accessor. Column types come from `/compilation/lambdaRelationType`. The post-filter panel opens automatically. | `QB/stores/workflows/accessor/*` | I |
| Result handling | Relation and TDS results render through the same `TDSExecutionResult` grid. | `QB/components/result/*` | C |
| Hosted DataCube launch | Export menu → "Legend DataCube". Requires a saved query in typed TDS mode, and is not available for data product or ingest queries. Opens `{dataCube}?sourceData=...`. The Query Usage modal shows the URL. | `LQ/components/Core_LegendQueryApplicationPlugin.tsx` | I |
| `/edit/:id/cube` | Embedded DataCube over a saved query. `QueryBuilderDataCubeEngine` implements: source processing via `lambdaRelationType`; value-spec parse and render; typeahead via `completeCode`; `executeQuery` (prepends `let` statements, uses `from()`); and `from(mapping, runtime)` context building. | `QB/stores/data-cube/*`, `LQ/stores/data-cube/*` | I |
| In-builder embedded DataCube | `openDataCubeEngine` exists, but no UI calls it (`TEMPORARY__enableExportToCube` is unused). | `QB/components/data-cube/QueryBuilderDataCube.tsx` | N |

---

## 7. Results

Sources: `QB/stores/QueryBuilderResultState.ts` and `QB/components/result/**`.

**Running a query**

| Feature | Description | Imp |
|---|---|---|
| Run query | Execute with parameter values, `convertUnsafeNumbersToString` and trace tags. The response is parsed losslessly, so big numbers stay strings. | C |
| Preview limit | Default 1000, editable in a "preview row limit" input and persisted in `gridConfig.previewLimit`. The effective limit is `min(userLimit, preview)` plus 1, so overflow can be detected. When overflowing: "Data below is not complete". Export ignores the preview limit. | C |
| Stop / cancel | `DELETE /server/v1/executionManager/cancelUserExecution?userID=&broadcastToCluster=true`. | C |
| Status line | "N rows in X ms". Also a Zipkin trace link (`x-b3-traceid`, `zipkinTraceBaseURL`). | C / N |
| Executed SQL | Modal showing the SQL from the relational execution activities, formatted, with a copy button. | I |
| Errors | Error panel with message, trace and stack. Access errors link to "Check Entitlements". An empty result offers Check Entitlements. | C |

**Grids and cell interaction**

| Feature | Description | Imp |
|---|---|---|
| Simple grid (default) | Client-side sort over the preview rows, custom cell selection, numbers formatted to 4 decimal places with a rounding warning, URLs rendered as links. | C |
| Enterprise grid (`TEMPORARY__enableGridEnterpriseMode`) | Per-type column filters and cell selection. **Local mode** adds client-side pivot, row-group and aggregation (count, sum, max, min, avg, and **wavg** with a chosen weight column). Column state is persisted in `gridConfig` and saved with the query. | I |
| Context menu drill-through | **Filter By / Filter Out** a cell value. This adds a pre-filter `==`/`!=`, merging into `in` / `not in`, or a post-filter for derived, aggregate or relation columns. Also Copy, Copy with headers, Copy Row Value. | C |
| Selection stats bar | Count, unique count (top-10 frequency tooltip), empty count, min, max, sum, avg, date and length ranges, and a mini histogram. | I |
| Graph-fetch / raw results | Shown in a read-only JSON or text editor. | C |

**Export**

| Feature | Description | Imp |
|---|---|---|
| Export formats | **TDS: CSV only**, via execute `?serializationFormat=csv_transformed` streamed to `result.csv`. Graph fetch exports JSON or the binding's content type. There is **no Excel or JSON export for TDS**. | C |
| Export attestation | A sensitive-data attestation must be accepted before export. If the response has the `x-legend-delegated-export: true` header, the export is delegated server-side. | I |

**Diagnostics**

| Feature | Description | Imp |
|---|---|---|
| Execution plan | "Generate Plan" (`/execution/generatePlan`) and "Debug" (`/generatePlan/debug`, which returns `{plan, debug[]}`). Viewer: node tree with Form and JSON views; a SQL node shows formatted SQL and result columns; a global implementation-support tab. Node viewers exist for SQL, TDS instantiation, sequence, constant, allocation, parameter validation and the graph-fetch temp-table nodes. | I |
| Lineage | `POST /lineage/v1/function/fullAnalytics`. Viewer tabs: Database, Property, Class and Report lineage (ReactFlow). | N |
| Check entitlements | `surveyDatasets` then `checkDatasetEntitlements`. Chart and grid, with plugin "request access" actions. | I |

---

## 8. Saving and query management

Sources: `LQ/stores/QueryEditorStore.ts`, `LQ/components/QueryEditor.tsx`, `QB/stores/QueryLoaderState.ts`, `QB/components/QueryLoader.tsx`.

**Create, save and rename**

| Feature | Description | Imp |
|---|---|---|
| Create (new, or Save As) | "Create New Query" dialog with name (default `New Query for {ds}[{ec}]`, or `Copy of X` for a copy) and description. Sequence: `id = uuid()`; content = `lambdaToPureCode`; executionContext; defaultParameterValues; gridConfig; `originalVersionId` (resolves `latest` to a concrete version through depot). Stereotypes and tagged values are copied from the original. Then `POST /pure/v1/query`, and the page navigates to `/edit/{id}`. | C |
| Save (update) | "Save Existing Query" dialog: "Save (Will Overwrite Existing Query)", sent as `PUT /pure/v1/query/{id}`. Only the owner can update (`isCurrentUserQuery`); anyone else has to Save As. | C |
| Rename | Double-click the title to open "Rename Query" (name and description). Rename and delete are also available from the query loader. | I |
| AI title/description suggest | "Use AI to suggest..." sends `{content, executionContext, defaultParameterValues, name}` to a plugin suggester at `legendAI.url`. Not available in OSS. | N |

**What gets stored with a query**

| Feature | Description | Imp |
|---|---|---|
| Tagging on save | Tagged values under `meta::pure::profiles::query` (`dataSpace`, `dataProduct`, `class`). The execution context is stored as `_type`, one of: `explicitExecutionContext{mapping, runtime}`, `dataSpaceExecutionContext{dataSpacePath, executionKey}`, `dataProductNativeExecutionContext`, `dataProductModelAccessExecutionContext`, `dataProductLakehouseAccessExecutionContext` or `ingestExecutionContext`. | C |
| Saved grid config | `{columns, isPivotModeEnabled, isLocalModeEnabled, previewLimit, weightedColumnPairs}`. | I |

**Finding and loading queries**

| Feature | Description | Imp |
|---|---|---|
| Query loader (search) | "Search for queries by name or ID" with a 500 ms debounce, limit 50+1 ("Found 50+"). "Mine Only" filter, plugin filters ("Current Data Space", "Current Class", "Curated Template Query"). Sort by Last Viewed (default), Last Created or Last Updated. Rows show name, time ago and owner ("Me"). Row menu: preview (pretty Pure), history, rename, delete. From the editor, search is scoped to the current project and its dependencies. | C |
| Recent queries | With no search text: `GET /query/batch?queryIds=...` for the recently viewed ids, falling back to `search` with limit 10. | I |

**History and versions**

| Feature | Description | Imp |
|---|---|---|
| Version history / revisions | `GET /pure/v1/query/{id}/history`. Lists revisions; any revision can be loaded (`?revisionId=`), two can be diffed as grammar, and **Revert** writes a revision as the new version (with confirm). Reachable from Help → "Query History". | I |
| Query on an older version | Query Info modal → Version selector (`latest` plus depot versions) → "Update action will reload query". This sends `PUT /pure/v1/query/{id}/patchQuery {id, versionId}`. If the query fails to build against its version, a blocking **"Query is incompatible with version X"** modal offers a version picker to revert or upgrade (`QueryEdtiorExistingQueryVersionRevertModal.tsx`). | I |
| Query Info modal | Shows project, mapping, runtime, data space and execution key, version (editable) and owner. | I |

**Sharing and productionizing**

| Feature | Description | Imp |
|---|---|---|
| Sharing | Links only: `/edit/{id}`, `?p:` parameter overrides, and a copy-link button in the setup panel. There are no ACLs or sharing lists; the owner is the only editor. | C |
| Productionize and edit in Studio | "Go to Project" (Studio view). "Productionize query..." goes to Studio `/extensions/productionize-query/{id}`, which creates an SDLC workspace, adds a service and opens a review (`SVC/stores/studio/QueryProductionizerStore.ts`). "Curated Template Query" promotes the query into a data space executable (Studio `/promote-template-query/...`). | I |
| Register DEV service | Export menu "DEV Service" opens "Register Service Semi-interactively". Fields: pattern, owners, documentation, MCP server, environment, "activate". Calls engine service `register` and `activate`, then offers "Launch Service" (`SVC/components/query/ServiceRegisterModal.tsx`). Environments come from `TEMPORARY__serviceRegistrationConfig`. | N |
| New Query | Header "New query" button. Warns when there are unsaved changes. | C |

---

## 9. Everything else

**Application chrome and help**

| Feature | Description | Source | Imp |
|---|---|---|---|
| Help / About menus | About Query Info, Query History, Go to Project, About Legend Query (app version info), About Data Space, About Data Product, About Ingest. | `LQ/components/Core_LegendQueryApplicationPlugin.tsx` | I |
| Dev Settings modal | Engine base URL override, payload compression, payload debugging, and a minimal-graph toggle. | `LQ/components/QueryEditor.tsx` | N |
| Current user | `GET {engine}/server/v1/currentUser` at startup. Used for ownership and cancel. | `LQ/stores/LegendQueryBaseStore.ts` | C |
| Documentation links | Registry of doc and FAQ keys, contextual "?" links, and a virtual assistant panel. | `QB/__lib__/QueryBuilderDocumentation.ts` | N |

**Integrations**

| Feature | Description | Source | Imp |
|---|---|---|---|
| Query agent chat (NLQ) | Toggle "Toggle assistant". The renderer is plugin-provided, with **no OSS backend** (`legendAI.agentURL`). "Load query into builder" sets a trace id on later telemetry. Disabled by `TEMPORARY__disableQueryBuilderAgentChat`. | `QB/components/QueryAgentChat.tsx`, `QB/stores/QueryAgentChatState.ts` | N |
| SQL playground | Generic SQL editor with an accessor explorer, `p('dp.ap')` / `i('ingest.ds')` templates, and a local-mode grid. Used by the data product viewer, not by the main Query flow. | `QB/stores/sql-playground/*` | N |
| Lambda comparison | Only the Query Diff and the revision diff (grammar/JSON). There is no general lambda comparison tool. | – | N |
| Bootstrap presets | Assortment, Text, Diagram, DataSpace, Persistence, ServiceStore and DataQuality graph presets. Service and DataSpace application plugins. | `legend-application-query-bootstrap/src/index.tsx` | I (for model coverage) |

**Telemetry**

- **Query app events:** create, update, rename, delete and view (each success or failure), graph init, initialize-query-state, change data space or product, productionize launch, about-* launches, version history, hosted DataCube launch, and legendai suggest/chat.
- **Query builder events:** about 69 events covering run, export, plan and debug (launch/success/failure/cancel), panel toggles, every change type, and filter-tree actions.
- **Payload:** each event carries the `sourceInfo` plus `{class, mapping, runtime}` context.
- **Sources:** `LQ/__lib__/LegendQueryEvent.ts`, `QB/__lib__/QueryBuilderTelemetryHelper.ts`.
- **Importance:** N.

**App config** (`LQ/application/LegendQueryApplicationConfig.ts`)

- **Server URLs:**
  - `engine {url, queryUrl?, useCookieAuthOnly?, queryClientName?}` (the query store can use a separate URL)
  - `depot.url`
  - `studio.url` plus `studio.instances[{sdlcProjectIDPrefix, url}]`
  - `dataCube.url`
  - `marketplace {url, productionParallelUrl}`
  - `lakehouse.url`
  - `legendAI {url, agentURL}`
- **Options:**
  - `TEMPORARY__serviceRegistrationConfig[{env, executionUrl, managementUrl, modes}]`
  - `NonProductionFeatureFlag`
  - `TEMPORARY__enableMinimalGraph`
  - `oidcConfig`, `enableOauthFlow`
  - `queryBuilderConfig {TEMPORARY__enableExportToCube, TEMPORARY__disableQueryBuilderAgentChat, TEMPORARY__enableGridEnterpriseMode, legendMCPServiceURL, zipkinTraceBaseURL, enableTypedTDS, NonProductionFeatureFlag}`
- **Importance:** I.

---

## 10. Backend endpoints the Query app calls

### Engine (`LG/protocol/pure/v1/engine/V1_EngineServerClient.ts`)

Query store calls use `queryUrl ?? url`. Most POSTs are compressed and traced.

| Method + path | Request shape | Used for |
|---|---|---|
| GET `/server/v1/currentUser` | – | identity |
| POST `/pure/v1/grammar/grammarToJson/lambda` (and `/batch`) | text/plain Pure; `?returnSourceInformation`. Batch body is `{key: {value, returnSourceInformation}}`. | text mode, loading saved content, derivations |
| POST `/pure/v1/grammar/grammarToJson/valueSpecification` (and `/batch`) | text | parameter defaults, constants, DataCube |
| POST `/pure/v1/grammar/jsonToGrammar/lambda` (and `/batch`), `/valueSpecification` (and `/batch`) | protocol JSON; `?renderStyle=PRETTY` | saving content, show Pure, diff |
| POST `/pure/v1/grammar/grammarToJson/model` | text | occasional |
| POST `/pure/v1/compilation/compile` | PureModelContext | compile |
| POST `/pure/v1/compilation/lambdaReturnType` | `{model, lambda}` → `{returnType}` | F9, derivation types |
| POST `/pure/v1/compilation/lambdaRelationType` (and `/batch`) | `{model, lambda}` → relation type columns. Batch is `{model, lambdas{}}`. | typed TDS, accessors, DataCube, data products |
| POST `/pure/v1/compilation/autofix/transformTdsToRelation/lambda` | lambda | TDS → relation |
| POST `/pure/v1/codeCompletion/completeCode` | `{codeBlock, model, offset}` | editor typeahead |
| POST `/pure/v1/execution/execute` | `{clientVersion, function: lambda, mapping?, runtime?, model: PMCD or SDLC pointer, context, parameterValues[{name, value}]}`; `?serializationFormat=csv_transformed` for export | run, export, typeahead, preview, samples |
| POST `/pure/v1/execution/generatePlan` (and `/debug`) | same ExecuteInput | plan viewer |
| DELETE `/server/v1/executionManager/cancelUserExecution` | `?userID&broadcastToCluster=true` | Stop |
| POST `/lineage/v1/function/fullAnalytics` | `{clientVersion, function, mapping, model, runtime}` | lineage |
| POST `/pure/v1/analytics/mapping/modelCoverage` | `{clientVersion, mapping, model}` | explorer mapped/unmapped |
| POST `/pure/v1/analytics/dataSpace/render` | `{clientVersion, dataSpace, model}` | data space analytics (fallback) |
| POST `/pure/v1/analytics/store-entitlement/surveyDatasets` | `{clientVersion, mapping, runtime, query?, model}` | entitlements |
| POST `/pure/v1/analytics/store-entitlement/checkDatasetEntitlements` | `{storeEntitlementAnalyticsInput, reports[]}` | entitlements |
| POST `/pure/v1/query/search` | see the search specification below | loader |
| GET `/pure/v1/query/batch?queryIds=` | – | recent queries |
| GET `/pure/v1/query/{id}` | – | load, info, light query |
| GET `/pure/v1/query/{id}/history[?version=]` | – | revisions |
| POST `/pure/v1/query` | full query (fields below) | create / save as |
| PUT `/pure/v1/query/{id}` | full query | update, rename, revert |
| PUT `/pure/v1/query/{id}/patchQuery` | partial, e.g. `{id, versionId}` | version change |
| DELETE `/pure/v1/query/{id}` | – | delete |
| `/pure/v1/query/dataCube/{search, batch, id}` (POST, GET, PUT, DELETE) | `{id, name, description, content, owner, ...}` | DataCube store |
| `/service/v1/...` (register, activate) | service JSON plus GAV | DEV service registration |

**Search specification fields:**
- `searchTermSpecification {searchTerm, exactMatchName?, includeOwner?}`
- `projectCoordinates [{groupId, artifactId}]`
- `taggedValues[]`, `stereotypes[]`, `combineTaggedValuesCondition`
- `limit`
- `showCurrentUserQueriesOnly`
- `sortByOption`: `SORT_BY_CREATE`, `SORT_BY_VIEW` or `SORT_BY_UPDATE`

**Query fields:**
- identity and ownership: `id`, `name`, `description`, `owner` (set by the server)
- project: `groupId`, `artifactId`, `versionId`, `originalVersionId`
- `content` (Pure lambda text) and `executionContext{_type,...}`; legacy `mapping` / `runtime`
- `defaultParameterValues[{name, content}]`
- `taggedValues[{tag{profile, value}, value}]`, `stereotypes[{profile, value}]`
- `gridConfig` (raw JSON)
- `createdAt`, `lastUpdatedAt`, `lastOpenAt`
- `version` (revision)

**LightQuery** is the same without content.

### Depot (`legend-server-depot/src/DepotServerClient.ts`)

| Method + path | Used for |
|---|---|
| GET `/project-configurations[/{g}/{a}]` | project pickers, Studio links |
| GET `/projects/{g}/{a}/versions?snapshots=` | version pickers, version upgrade |
| GET `/versions/{g}/{a}/latest` | resolve `latest` |
| GET `/projects/{g}/{a}/versions/{v}[/classifiers/{c}]` | project entities (full graph, ingests) |
| GET `/projects/{g}/{a}/versions/{v}/dependencies?transitive&includeOrigin&versioned=false` | dependency entities |
| GET `/classifiers/{classifier}/entities?scope=RELEASES\|SNAPSHOT` | data space list |
| GET `/classifiers/{classifier}?scope&summary&latest` | data product summaries, inspector |
| GET `/entitiesByClassifierPath/{c}?search&scope&limit` | service search |
| GET `/generationFileContent/{g}/{a}/versions/{v}/file/{path}` | cached `AnalyticsResult.json` |
| GET `/generations/{g}/{a}/{v}/types/{dataSpace-analytics\|dataProduct}?elementPath=` | minimal graph and data product artifacts |
| POST `/projects/dependenciesFromArtifactDependencies`, `/projects/dependencies/pureModelContextData` | dependency collection |

**Response shapes:**
- `StoredEntity {groupId, artifactId, versionId, entity{path, classifierPath, content}}`
- `VersionedProjectData {groupId, artifactId, versionId}`
- `StoreProjectData {projectId, groupId, artifactId}`

### Lakehouse (`legend-server-lakehouse`), used only for data products and ingests

- `GET /dataproducts/lite/paginated?size=1000&environmentType&...` (selector)
- `GET /dataproducts/{id}/deployments/{did}`
- `GET /orgResolver/{user}/lakehouse/environment` (runtime env)
- Contract, data-request, task and subscription endpoints, used by the data product viewer's access-request flow
- Ingest catalog-state and discovery endpoints

### SDLC (Studio server)

The Query app itself makes no SDLC calls. The productionizer runs in Studio (`SVC/stores/studio/QueryProductionizerStore.ts`) and uses getProjects, getProject, getUsers, group workspaces, createWorkspace, updateConfiguration, performEntityChanges and review creation.

### Marketplace

Not called by Query, except that the data space quality emote uses `GET /v1/doc-quality/dataspace/{env}`. Otherwise Query only builds deep links to marketplace.

---

## Parity notes and surprises

1. **The home page `/` is the editor with a data space / data product picker**, restoring the most recent source. The `/setup` card page is legacy but still routed.
2. **There are no favourites.** There are only recently viewed queries, data spaces and data products, stored in localStorage.
3. **TDS export is CSV only.** Excel exists only through the enterprise grid's local mode (ag-grid), not the engine.
4. **Ownership is the only access control.** Non-owners can only Save As.
5. **Unsupported queries still run, export and save.** Parameters are extracted from the raw lambda.
6. **There is no "show all classes" option any more.** Data space classes are restricted to coverage root entities plus the include/exclude rules.
7. **Agent chat, AI suggest and MCP are plugin hooks with no OSS implementation.**
8. **Gaps in this census.** The clone did not include `legend-lego` (the models-documentation grid and DataGrid internals), `legend-art` (undo/redo key bindings) or all of `legend-graph`. Those details come from the call sites. The milestoning parameter names `businessDate` / `processingDate` / `startDate` / `endDate` come from legend-graph constants that I inferred rather than read.
