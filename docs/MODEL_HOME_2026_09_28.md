# Model home — survey and design options, 2026-09-28

Where Pure models (classes, mappings, stores, connections, runtimes, functions) LIVE, how they are
versioned, and how a query, a saved cube or a function names one. legend-lite has no such place
today; production needs one. This is the survey (what upstream does, what we have) and the design
options. No product code yet.

Rulings that bind (the user, 2026-09-28): a saved cube PINS its model version, with an easy upgrade
path; sources point to models, never copy them; upstream APIs and shapes exactly; everything through
Bazel; no Java dependencies; identity always, the database enforces data access.

## 1. What legend-lite does today (read in code)

- **The tab (WASM planner):** only the PLATFORM is compiled in — the system metamodel and the Pure
  prelude, the boot layer, content-addressed and cached once per process (`Compiler.boot()`). A user
  model arrives at run time as TEXT (`new WasmPlanner({model, runtime})`; the demo fetches
  `trades.pure`; an upload's model is generated from DuckDB's catalog). It is compiled again on
  every plan: `warmModel` warms only the boot layer.
- **The server (`pure/v1`, `PureV1Api`):** every request carries the WHOLE model inline, and only as
  `{"_type":"text","code":...}` (`modelText`); model JSON (`data`), `pointer` and `combination`
  are refused ("the PMCD reader is not built"). The model is recompiled on every request
  (`Compiler.compileModel`: parse + resolve + normalize, no cache for user models).
- **No registry:** no projects, no versions, no publishing, nothing a pointer could name. Every client
  carries its model. The warehouse holds data and entitlements, not models.

## 2. What upstream does (read at legend-engine 4.145.0 and legend-studio c5b2f2c78)

### The pointer (`protocol/pure/v1/model/context/`)

```
PureModelContextPointer {
  _type: "pointer",
  serializer: { name: "pure", version: "vX_X_X" },
  sdlcInfo:                                   // SDLC, tagged by _type
    { _type: "alloy",  groupId, artifactId, version, packageableElementPointers[] }  // a published version (depot)
  | { _type: "workspace", project, version /* = the workspace */, isGroupWorkspace } // unpublished work (SDLC)
  | { _type: "pure", overrideUrl, version, baseVersion, packageableElementPointers[] } // legacy PURE IDE
}
```

- The four model-context kinds: `data` (model JSON inline), `text` (grammar inline), `pointer`,
  `combination` (several contexts merged, e.g. a published project PLUS extra inline elements).
- `packageableElementPointers` narrow what is needed; the loader checks they exist.
- `version` absent or `"none"` means `master-SNAPSHOT`.

### Resolving a pointer (`legend-engine-language-pure-modelManager[-sdlc]`)

- `ModelManager.loadModel(context, …)` dispatches by kind to a `ModelLoader`; `SDLCLoader` handles
  pointers, one sub-loader per SDLC kind.
- A published version (`alloy`) is ONE HTTP call to depot, under the CALLER's identity:
  `GET {depot}/projects/{groupId}/{artifactId}/versions/{version}/pureModelContextData?convertToNewProtocol=false&clientVersion=…`
  answering the version's model JSON (`PureModelContextData`).
- A workspace pointer goes to the SDLC server instead (unpublished work).
- CACHING: two caches keyed by the pointer, the fetched model JSON and the COMPILED model
  (`Cache<PureModelContext, PureModel>`), soft values, expired 30 minutes after last access. Only
  RELEASE versions are cached: a version that is absent, `none`, or contains `SNAPSHOT` is refetched
  and recompiled every time (`AlloySDLCLoader.isLatestRevision`).
- A combination resolves each pointer (cached) and merges the inline data into it.

### Depot, as clients see it (`legend-server-depot/src/DepotServerClient.ts`)

- `GET projects` (project configurations), `GET projects/{g}/{a}/versions` (all versions),
  `GET projects/{g}/{a}/versions/{v}` (the version's entities), `…/{v}/entities/{path}` (one entity),
  `…/{v}/dependencies` (dependency entities, transitive option), `…/{v}/projectDependencies`,
  `…/{v}/dependantProjects`, `…/{v}/pureModelContextData`, classifier-filtered entity search.
- Version aliases (`DepotVersionAliases.ts`): `latest` = the newest release (resolved by depot);
  `master-SNAPSHOT` = the head of the default branch (Studio's `HEAD`); anything ending `SNAPSHOT`
  is mutable. A release (`1.2.3`) is immutable.
- Publishing is NOT a depot HTTP API: projects are released through SDLC (git) and a build pipeline;
  depot ingests the artifacts.

### Who produces pointers (milestone 2's inputs)

- Legend Query: a saved query stores `groupId, artifactId, versionId` (a release, `latest`, or a
  SNAPSHOT) plus mapping/runtime or a data-space execution context; DataCube's Legend Query source
  builds an `alloy` pointer from them (`resolveVersion`: `HEAD` → `master-SNAPSHOT`).
- DataCube's function source REQUIRES a pointer (`userDefinedFunction`), fetching the function body
  from depot.
- Studio works on workspace pointers until release.

## 3. Findings that shape the design

1. Nothing about a user model is baked into the WASM build — the concern is not packaging, it is that
   **there is no model home and no pointer**. Every saved cube would otherwise have to embed its model
   (the stale-copy problem).
2. Upstream's pointer is the right shape to adopt EXACTLY (`alloy`: group, artifact, version): it is
   what milestone 2's sources carry, and what real Studio publishes to.
3. Pinning (the ruling) matches upstream's cache boundary: a release version is immutable, so its
   compiled model can be cached safely — the compile is a pure function of the version's content
   (memory: correct algorithm before memoizing). A SNAPSHOT cannot be pinned.
4. legend-lite compiles the user model per request, server and tab. Harmless for the demo model; not
   for real models. **Measurement owed before designing the cache:** parse+compile time of a
   realistically large model (hundreds to thousands of elements), JVM and WASM.
5. Upstream's model payload is model JSON (`PureModelContextData`); legend-lite reads grammar text and
   can WRITE model JSON (`grammarToJson/model`, E2) but not read it (contract P1, not built).

## 4. Design options (for the user)

### D-A. What legend-lite accepts on `pure/v1`

`pointer` (the `alloy` kind) and `combination`, beside `text`, resolved by a loader in legend-lite
exactly as `ModelManager` does — same JSON, so a client cannot tell legend-lite from engine proper.
`data` (model JSON) needs the P1 reader: required in milestone 2 (real depot answers model JSON), and
the right way to read a model anyway. Recommendation: pointer + combination now; the P1 reader as its
own leg, before milestone 2.

### D-B. What legend-lite's model home is

- **Option 1 — serve depot's API shape.** legend-lite implements the READ endpoints clients and the
  loader use (`versions`, `pureModelContextData`, entities, dependencies), stored in the warehouse
  (tables of projects, versions, sources) or on disk. A pointer resolves against it exactly as engine
  proper's does against real depot; pointing legend-lite at a real depot later is a URL change.
- **Option 2 — a legend-lite-only model registry.** Simpler to start, but a second API that milestone 2
  replaces: rework. Not recommended.
- Recommendation: Option 1, READ API exactly depot's; storage is ours.

### D-C. How a version gets INTO legend-lite's home (publishing)

Upstream has no publish API (SDLC + pipeline). Until real Studio and a pipeline exist, legend-lite needs
its own publish path: a Bazel-run tool and/or an owner-only HTTP endpoint that takes a project's Pure
sources and a version, compiles them (refusing a model that does not compile), and stores them
IMMUTABLY (a release cannot be overwritten; SNAPSHOT can). This is ours by necessity; name it so.

### D-D. What the home stores

- Grammar TEXT per version (legend-lite reads it today) and serve model JSON by converting through E2 —
  exact on the wire, no P1 reader needed for milestone 1; or
- model JSON (entities), as depot does — needs P1 first.
- Recommendation: store the text (the source of truth a person wrote), serve depot's JSON by
  conversion; revisit when P1 lands.

### D-E. Dependencies between projects

A project may depend on others (depot's `dependencies`). Needed as soon as there is more than one
project. Owed: read how depot's `pureModelContextData` treats dependencies (included or not) — the
depot SERVER source is not checked out; its clients and engine's loader are. Decide after reading it.

### D-F. Caching (after the measurement in finding 4)

- Server: compiled model per RELEASE pointer, content-addressed (a release is immutable); SNAPSHOT not
  cached, or keyed by its content hash.
- Tab: the model text fetched by pointer (HTTP-cacheable forever for a release) and compiled once per
  page; the WASM planner stays I/O-free — the page fetches, the planner compiles.

### D-G. Versions in DataCube (the ruling applied)

- A cube saved on `latest` is saved on the CONCRETE release `latest` meant at that moment.
- A cube on a SNAPSHOT is not pinned: saving says so (and either refuses or warns — decide).
- Upgrade path: the Load dialog and the open cube show "version X is available" (depot's `versions`
  list); one click moves the pin, opens the cube on the new version, and reports schema drift by the
  agreed rules (reconcile + report).

### D-H. Identity and access

Resolving a pointer runs under the caller's identity (as engine proper's loader does). Reading models is
metadata access — who may read which project is a decision (all signed-in users is the upstream norm);
DATA access stays with the database, never the model home.

## 5. Proposed first slice (after the user's decisions)

legend-lite accepts an `alloy` pointer on `pure/v1`; a model home serving depot's
`projects/{g}/{a}/versions` and `…/versions/{v}/pureModelContextData` from stored text; the trades
model published as `demo:trades:1.0.0` by the publish tool; the demo page and DataCube name the model by
pointer; a cube saved against it reopens in a fresh page. Proof: the same requests answered alike by
legend-lite and (for the JSON shapes) by engine proper's loader contract.

## 6. Owed before design is final

- The compile-time measurement (finding 4).
- Depot's dependency semantics (D-E), from the depot server source.
- Whether real depot's read API needs authentication in practice (affects D-H and milestone 2's client).
