# A12 — Periphery: lineage, validation, server, ide, cache, test, testdatagen, probe — read whole 2026-09-28

Reader's report, preserved. Tree `6ab32198d`. 33 files, 10,692 lines. Paths relative to `core/src/main/java/com/legend/`.
Re-checked by hand: finding 7 (confirmed: `LegendHttpServer.java:40` `HttpServer.create(new InetSocketAddress(port), 0)`
binds all interfaces; `/engine/sql` registered at :53; `Access-Control-Allow-Origin: *` at :248).

## 1. What it is
Nine packages beside the pipeline, reaching in at different depths.
- **lineage/** (3,381). `ScanRelations` (2,717) walks the UNTYPED protocol AST plus parsed mapping/store records into a
  relation tree (Node → Rel/Line); callers `PlanAllocations:478`, `plan/PlanText:70,188`, `StatementExecutor:896,926,1060,1862`,
  testdatagen. `PlanAllocations:434-446` recovers the raw protocol body mid-execution to feed it and swallows
  `NotImplementedException | IllegalStateException` at :482. `ScanColumns` walks MIR. `ColumnLineageRows`/`LineageRows`
  turn results into rows. `PkInference` walks protocol calls.
- **validation/ValidateDesugar** rewrites protocol AST to protocol AST inside `Compiler.resolveQuery` (Compiler.java:887),
  AFTER NameResolver (its javadoc :38 says before).
- **server/** (2,029): HTTP shell on `com.sun.net.httpserver` — PureV1Api (grammar↔JSON, relation type, generatePlan,
  execute), PureLspServer (JSON-RPC diagnostics), DiagramService, QueryService/ConnectionResolver (own JDBC connections),
  serial/ (format metadata).
- **test/** (1,350): runners in the product jar for `<<test.Test>>` functions and Service testSuites.
- **testdatagen/** (2,191): consumes `ScanRelations.Rel`, spells SQL itself, executes on a raw `java.sql.Statement`;
  `TestDataGenerationNatives.foldCensus` called from `BodyCompiler.java:67` during execution.
- **ide/** (461): shallow indexer + on-demand parser; no product caller.
- **cache/** (399): Hash, Sha256, ContentStore (one user), HandleStore (one user).
- **probe/Shadow**: the diagnostic DecisionProbe, bound via ServiceLoader, turned on by an env var.
Build: lineage depends on `:compiler`, `:plan` on `:lineage`; testdatagen on `:exec`, `:lineage`, `:resolver`, `:plan`;
the umbrella `:core` exports `:probe`, `:test`, `:ide`, `:testdatagen`, `:server_lib` (core/BUILD.bazel:205-217).

## 2. Verdict
**Names.** `ScanRelations`: 18 name cuts (`lastIndexOf(':')` 13, `contains("::")` 3, `lastIndexOf("::")` 2), 6
`simple()`, 11 literal-name compares (`"join".equals`, `equals("project")`, `startsWith("get")`), 6 `containsCall(n,
"<name>")`, `PRED_OPS` (22 names, :1993) and `OPERATORS` (14, :2614); its own class resolution (`typeMatches` :2454 on an
unambiguous name tail; `classDef` :2081 suffix search over `ctx.elementFqns()`). **`chainOf` (:2642-2665) guesses a
property from shape**: any 1-argument call is "transparent" (:2642); any multi-argument call not in OPERATORS becomes
`Seg.Prop(simple(af.function()))` (:2663) — so a user function `my::f($p.x, 1)` is read as a property hop named `f`;
when no mapping matches, `walk` silently returns (:1403-1410). Only 2 sites use resolved identity
(`ResolvedNames.names` :2517; `CoreFn.of` :704,708). `PkInference:46-95` switches on 17 simple-name labels (a user
`my::filter` is treated as relational filter). `ValidateDesugar` re-qualifies imports after resolution (`imp + "::" +
name` :294,:413), breaking ambiguity by "a CONSTRAINED candidate beats an unconstrained first match" (:420).
`DiagramService.resolve` (:240-263): exact, same package, then any class with the same simple name iterating a HashSet
(nondeterministic), else the name as written. `ConnectionResolver.resolve` (:106-134): FQN or simple name, last match
wins. `PureTests:77` recognises the test profile by `"test"`/`"meta::pure::profiles::test"`.
`TestDataGenerationNatives.classifyArg` (:294-332) switches on 6 simple names.

**IR.** The protocol AST is walked AFTER typing (lineage, testdatagen) — AGENTS.md invariant 1 violated.
`TypedTestDataGen` holds `List<protocol.spec.ValueSpecification> params` and a `String flavor`
(compiler/spec/typed/TypedTestDataGen.java:19-22), dispatched by `"plan".equals`/`"seedString".equals`
(TestDataGenerationNatives:52,57,218); `children()` returns `List.of()` so no typed pass sees it. Schema lost between
phases: `ScanRelations.Node` computes `schema`, `Rel` has no schema field (:216), `toRel` drops it (:992); testdatagen
re-derives it by first table with a matching name (TestDataGenerator.locate :832-880). `SqlSource.Table(String name,…)`
(sql/SqlSource.java:59) has no store identity, so `ColumnLineageRows.ownerOf` (:91-126) re-resolves the name over the
mapping's databases then every database (:43-47); `ScanColumns:201-203` records a CTE name as a physical table.
`rootImpl` returns a positional `String[]` of 4 or 5 elements, the 5th the magic `"m2m"` (:875-876). `default ->`:
ScanRelations 7, TestDataGenerator 5 (`collectTableCols` `default -> {}` :686 ignores node kinds silently),
TestDataGenerationNatives 3, ConnectionResolver 4.

**Types.** Outside PureV1Api, types are strings: tables split on `'.'` by `bare()`/`schemaOf()` (20 `bare(` calls);
relational types → DuckDB type names in `TestDataGenerator.duckType` (:1206); no multiplicity anywhere.

**Diagnostics.** Unchecked exceptions with concatenated messages; ScanRelations alone 38 `new NotImplementedException`.
The LSP guesses positions from message text: looks for `"line N:M"`, else the first quoted word in the source
(PureLspServer:177-208); range end a fixed `character + 20` (:219); it only parses, never compiles (:147) — no type
errors; javadoc cites a non-existent "ParseCache" (:136).

**Fallbacks.** ScanRelations.joinLabel returns the join name on any failure (:1163-1177); walk returns silently on no
mapping (:1403-1410); 9 catches as control flow (:1176,1434,1649,1897,1917,2402,2524,2533,2713). ColumnLineageRows:47
searches all databases. ServiceTestRunner picks "the only binding" when a connection id is unbound (:257-258); `cell`
`default -> String.valueOf(v)` (:451). ConnectionResolver takes the first binding (:121) and silently makes any non-LocalFile
DuckDB/SQLite spec in-memory (:183,190). TestDataGenerationNatives ignores unknown instances, runtime/extension args and
element pointers (:279-289,326-329,335-339). ValidateDesugar.rootClassFqn swallows RuntimeException (:436-447).
DiagramService.resolve:262 returns the unresolved name.

**Layering.** Lineage reads parse-space ASTs after typing, from inside the executor; the testdatagen fold imports
`resolver.Pipelines`, `exec.Ddl`, `compiler.spec.CsvCensusChecker` (TestDataGenerationNatives:97,117-118). SQL outside
the dialect (invariant 3): TestDataGenerator 15 statement-leading SQL literals and 42 fragments, DuckDB-only functions
(`sha256`, `repeat`, `//`, `chr`; :1004-1011) and a second engine-H2 dialect (`select top`, `DATE'…'`; :1540-1650); the
file says "no dialect, no boundary" (:1664); `planLit` (:1653) does not escape quotes. Env/console: `LL_LINEAGE_DEBUG` +
System.err (ScanRelations:1020,2586); `LEGEND_LITE_STACKS` (PureTestRunner:425,524; ServiceTestRunner:201); `LL_SHADOW`/
`TEST_UNDECLARED_OUTPUTS_DIR` (Shadow:88-89); `PORT` and 21 console/printStackTrace sites in LegendHttpServer. Static
mutable: ConnectionResolver.STORE (:34), SerializerRegistry.SERIALIZERS (:19), Shadow.SEEN/TABLES/ROWS plus ThreadLocal
CONTEXT (:59-68).

**Duplication.** ScanRelations is a second mapping resolver re-implementing what `resolver/StoreResolver` owns on typed
HIR: property-mapping lookup (pmsFor :2097), join-target choice (targetCm :2378), join chains (:2176), union/embedded/
association dispatch, view expansion, main-table inference (:2467). Two PK inferences (lineage/PkInference over protocol,
dead; resolver/PkInference typed) disagreeing on joins (lineage concatenates both sides for every join type :86-91;
typed only INNER/LEFT/asOf). Five milestoning-column walkers (ScanRelations.milestoningCols; TestDataGenerator censusCols,
fetchCols, milestoningFilter, planMilestone — the last two emit dimensions in opposite orders). Three join-condition
renderers (renderCondition, planCond, mangleCond), two findJoins. Two IDE surfaces (`ide/` uncalled; PureLspServer doesn't
use it). Dead (no product caller): `ide/`, `server/serial/*`, `lineage/PkInference`, ScanRelations `treeString` ×2,
`viewTree`, `viewDef`, `rootFor`; QueryService `execute*`/`stream` overloads (tests and pct only); `test/TestAssertions`;
`DATA_FQN`/`TABLE_FQN` (TestDataGenerationNatives:28,30); stacked javadocs (:175-184,210-214). `test/` has no product
entry point. Size: ScanRelations 2,717 (`dispatchPms` ~170, recursion 5–6 deep, up to 11 params); TestDataGenerator 1,693
(`fetchChild` 13 params).

## 3. Clean-sheet and delta
Tools read the compiler's typed, resolved output through a query API and never re-parse or re-resolve (Roslyn's
SemanticModel). Lineage over post-H typed IR: StoreResolver emits a binding map (each navigation's declared
(SetImplementation, Join, Table) identities); scanRelations a ~300-line fold over typed HIR plus that map; engine-text
label mangles (`unionAlias`, `SQLNull`, `equal_root…`) to a separate printer; ScanColumns stays on MIR but
`SqlSource.Table` carries `TableId(db, schema, name)`. validate as a typed desugar (a platform Form over typed HIR, or
minting by FunctionId); no import re-qualification. TDG fetches as MIR rendered through SqlDialect; engine-H2 plan text
from EngineStyleH2; `TypedTestDataGen` typed args and an enum flavor. The server a thin adapter: one `Workspace` (source
hash → compiled ModelContext, stored in ContentStore); PureV1Api, Diagram and LSP query it; runtimes/connections from the
compiled RuntimeDefinition; the LSP publishes the compiler's diagnostics with spans; `/engine/sql` deleted. Test runners to
their own target (depends on `:core`, not exported by it); the probe testonly.
Reuse: cache/*, ScanColumns, PureV1Api response shaping, PureTests.engineSuiteOrder, ConnectionResolver.Lease.

## 4. Top findings
1. STRUCTURAL: lineage is a second mapping resolver reading untyped call names; `chainOf` turns non-operator calls into property hops.
2. STRUCTURAL: TDG spells and executes SQL outside the dialect; `planLit` unescaped; `duckType` hard-codes DuckDB types.
3. STRUCTURAL: typed HIR carries an untyped payload (`TypedTestDataGen`); `foldCensus` queries the database during a typed rewrite (:65).
4. DEFECT: store identity lost then guessed (`Rel` drops schema; `locate` first match; `SqlSource.Table` name only; `PkInference.tablePk` strips schema :124-127). Change: `TableId(db, schema, name)` end to end.
5. DEFECT/SMELL: ValidateDesugar re-resolves names after resolution and mints bare-name calls (`"concatenate"`, `"execute"`, `"not"`, `"filter"`, `"project"` :193,207,343,344,387; ArchitectureTest pins 27 protocol constructions in this class).
6. STRUCTURAL: the server does more than HTTP (generatePlan compiles twice :162-164, re-parses to PMCD JSON and finds runtime/connection by matching `_type` and `package::name` strings :301-354; execute does target → executeUpstream → `ConnectionResolver.parseModel` :184-186; LegendHttpServer finds the runtime by regex :35-37; DiagramService and ConnectionResolver each carry a private name resolver).
7. SECURITY: `/engine/sql` runs arbitrary SQL with `Access-Control-Allow-Origin: *` on all interfaces (confirmed); answers errors with HTTP 200 (:230); logs request sizes to stdout (:189); contradicts the ruling quoted at :50-51 ("serves upstream's APIs and nothing of its own"), as do `/lsp` and `/engine/diagram`. Change: delete, or gate behind a localhost-only dev flag.
8. SMELL: the product jar ships the test harness, the probe and dead IDE code (`:core` exports `:test`, `:probe`, `:ide`); `test/` exposes corpus concepts (SqlReplayOracle, the referee, census bodyShapes — TestObserver:50; PureTestRunner:397-403).
9. DEFECT: ServiceTestRunner keys test data by a 32-bit hashCode (`t.values().hashCode()` :323; runtime name `key.hashCode()` :366): two colliding CSVs share a cached runtime and SHARED session; mints `letFunction` by bare name (:182); guesses "the only binding" (:257). Change: key on full content via `Hash.ofUtf8`.
10. SMELL: cache/ hides no algorithmic problem — ContentStore has one user (the boot layer, Compiler.java:269-310), its LRU unused generality; HandleStore never evicts (:26-28), so every edited store definition in a long-running server leaks an in-memory database (ConnectionResolver:169-192); `Hash`'s public constructor accepts any 64-char string (:30-41). The real waste is 2–3 compiles/parses per server request.
Minor: TestDataGenerator:1028-1029 counts one statement twice; BUILD.bazel:303 comment names `com.legend.platform.Shadow` (it is `com.legend.probe.Shadow`); `ModelIndexer.skipBalanced` returns EOF silently on an unclosed body (:286-299).
Not verified: how far ScanRelations' mapping walk diverges from StoreResolver; whether TDG's DuckDB-only SQL reaches an H2
session; whether lowering emits SqlWith/CTE for mapping queries (if so, ScanColumns:201-203 is reachable).
