# A11 — Driver, executor and plan layer, read whole 2026-09-28

Reader's report, preserved. Tree `6ab32198d`. 71 files, 23,525 lines (all present). Paths relative to
`core/src/main/java/com/legend/`. Re-checked by hand: the default judge mode (confirmed, ExecuteOptions.java:35).

## 1. What it is
Inputs: Pure source or a parsed `ValueSpecification`, a runtime FQN, a `java.sql.Connection`, `ExecuteOptions`. Outputs:
`ModelContext`/`BuiltModule` (compileModel, buildModule); `TypedSpec` (compileQuery); `plan.QueryPlan(String sql,
ExprType, ResultShape)` (plan); `sql.SqlQuery` (lowerResolved); `exec.ExecutionResult` (sealed, 5 variants; execute,
executeResolved); JSON/CSV bytes (executeWire, executeStreaming). `Compiler` has 35 public static methods (4 `execute`,
4 `executeResolved`, 3 `parseSources`, 2 each of compileModel/compileQuery/plan/resultType/lowerResolved/executeWire).
It hands statement bodies to `StatementExecutor` (3,326 lines, 88 methods); `BodyCompiler` walks body segments.
`StatementExecutor` re-runs G, G½, native staging, H, the cross-store guard, I, post-processors, J and K for every
statement, every assert side and every frame. Dependencies: root package → compiler.spec 643, exec 299, and element,
plan, lowering, sql, builtin, protocol.spec, resolver, parser, lineage, testdatagen, validation, normalizer; exec → sql,
sql.dialect, element, model, lowering (5), plan, compiler.spec; plan → compiler.spec 44, element 44, sql, model,
builtin, lineage.

## 2. Verdict
**Where the lines go:** assert-verdict and test-oracle machinery 8,107 (35%: AssertVerdicts, SqlTextVerdicts,
HostJudge, DatabaseJudge, VerdictArm, KindClass, AssertErrorNative, exec/{VerdictBatch, PureAsserts, Equality,
TdsCompare, CanonicalForm, CanonRider, SqlReplayOracle, AssertListener, InstanceIds}); driver + statement executor 5,295
(23%); engine plan-text printing 3,391 (15%); seeding/DDL/CSV 2,161 (9%); census instrumentation 2,151 (9%); the JDBC
executor proper 2,126 (9%); other 294. The "executor" is mostly a test harness shipped in the product.

**Compiler is an orchestrator with hidden state, not a phase driver.** No phase is IR→IR at the API: `compileModel`
returns a lazily-compiling ModelContext; the executor re-types (StatementExecutor.java:68). The model is re-parsed and
rebuilt from source on every plan/execute/compileQuery/resultType/target (6 `compileModel(model)` sites, e.g.
Compiler.java:539,558,587,594,946,1264). Hidden process state: static `BOOT` ContentStore (:269); global
`PlatformRegistrations.current()` (:239,305,430); static per-connection `ESTABLISHED` synchronized WeakHashMap with a
mutable `dirty` flag (StatementExecutor.java:2096,2050-2058). `dialectOf(ctx,rt,conn)` runs `sessionSetup()` SQL on the
caller's connection every call (Compiler.java:754-757,788-791), and `executeResolved` calls it every execution
(:972,:1145). Strict and tolerant builds share one path, switched by passing null vs a `Map<String,String>` into three
phases (Compiler.java:236-239 vs :427-430); `parseSources` switches with a nullable BiConsumer (:151-183);
`compileAllBodies` catches RuntimeException twice (:1228,1238). Duplicated phase sequences: G→G½→H→I in `lowerParsed`
(:591-614) and `lowerResolved` (:1173-1194), and twice more in StatementExecutor (`engineSql` :559-605;
`lowerAndPrepare` :2162-2215); 4 differently-configured Lowerer constructions, 14 UserCallInliner, 10 StoreResolver
sites, 9 `new SpecCompiler`. The executor DOES decide pipeline order: BodyCompiler interleaves seeding (:70), effects
(:236), eager frame runs (StatementExecutor.java:1499-1511) and flushes, producing no artifact despite its header
(BodyCompiler.java:17-27).

**Names.** 71 `qualifiedName()` (30 `.equals` FQN compares) vs 21 `callee().id()`; 19 `"meta::…"` literals
(StatementExecutor.java:1612,1841; :2579 `"meta::core::runtime::Runtime"` identifying a type by string;
AssertVerdicts.java:554,850,1377,1385; ConnectionLets.java:90; SeedSqlForms.java:76; SqlTextVerdicts.java:1072);
48 `case "…" ->` (type names AssertVerdicts.java:578-596; DB types StatementExecutor.java:473-481,1185-1190; table names
MetamodelSeeds.java:38-86; SQL type names Executor.java:1069-1080); 24 `"default"` schema compares; 54 startsWith/endsWith
(InProtocol.java:129 `connName.startsWith("TestDatabaseConnection")`; RelationalMapperRenames.java:263
`endsWith("::toOneMany")`; PlanText.java:624). Dedup key from `getClass().getSimpleName()` + `String.valueOf(type)`
(Compiler.java:193-198); prelude-shadow drop matches by FQN string (:342-362).

**IR.** `ExecEnv` 16 components, 13 constructors/`with…` (StatementExecutor.java:106-238), shallowly immutable
(`queryLets`, `planRows` mutated: :296,2322; PlanAllocations.java:198,290). K reads phase C's AST: `env.protocolBody()`
carries the raw ValueSpecification, and lineage handlers re-walk it by let name (PlanAllocations.java:370-401,435-468).
plan calls G (RelationalMapperRenames.java:106 `specs.compile`). exec reads lowering constants (TdsCompare.java:106,147).
Runtime metadata rewrites plan types (exec/WireTypes.java:97-151). 47 `default ->`; `OpSeeds.opOf` `default -> null` over
PropertyMapping variants silently skips unknown shapes (:196). Verdict switch exhaustive (AssertVerdicts.java:291-486,
good). One type spelled five ways: PlanText.spell (:1100), PlanText.pureDbSpelling (:885), PreciseTypes.defaultSpelling
(:49), UpstreamRelationType.relationalSpelling (:74), Ddl.dataTypeToSqlText (exec/Ddl.java:397 — whose doc claims "no
type text is spelled twice"). KindClass properly sealed (:17).

**Diagnostics.** Walls are `Map<String,String>` with three key domains: element FQN (buildModule), overload signature
`tf.id().qualified()` (Compiler.java:1239), source name → first error line (:181-182). Positions prefixed into message
strings (:102-104,451-455). User failures as ISE (StatementExecutor.java:2922,2495; BodyCompiler.java:227). SQL fallback
path parses driver error text (`dialect.failingStatement(message)` StatementExecutor.java:2996; VerdictBatch.attribute
exec/VerdictBatch.java:194-202).

**Fallbacks.** A runtime not found silently gets DuckDB (Compiler.java:809-812); an H2-declared connection renders as
DuckDB (:841); H2 version sniffed by `startsWith("2.1")` (:785); unresolved `toSQLString` db type → "H2"
(StatementExecutor.java:471); `planDialect` unknown → EngineStyleH2 (:1188); connection defaults to
`TestDatabaseConnection(type="H2")` (:759-760,1080-1096; PlanText.java:35,446); unresolved enum mapping → first declared
(PlanText.java:676-677); `streamStoreOf` returns the class FQN on NotImplemented (StatementExecutor.java:1864-1866);
`typedEnumTail` → `String.valueOf(v)` (:1880); `viewSqlRenderer` `getOrDefault(t,t)` (:2683); `CsvSeed.blockSqls` issues
`DELETE ALL` when the table is unknown (exec/CsvSeed.java:116-119), `setupSteps` drops an unknown database to null
(:232-233); unknown CSV table → untyped inserts (exec/Ddl.java:239-258,312); GridProbe unknown SQL type → trusted Any
(:54-56); PctProbe non-date → VARCHAR (:42-45), WireTypes.staticized likewise (:72); empty GRAPH → `"[]"`
(Executor.java:483-485); null wire text → `""` (:235). ~20 swallow sites: TypeInferenceException scored false
(StatementExecutor.java:1910-1920; Compiler.java:1076); `catch (RuntimeException) → null` (SqlTextVerdicts.java:918); a
decline tunnel catching RuntimeException twice and re-executing (StatementExecutor.java:2808-2880); PlanAllocations.java:200,
240,416,482; OpSeeds.java:245; NotImplemented as join-branch control flow (PlanText.java:971,1054).

**State.** Static mutable: 31 fields in SqlTypeCensus, 15 in CanonicalDivergence, plus Census, ESTABLISHED, BOOT,
SystemDatabase.IDS; 3 ThreadLocals (StatementOrigin.java:53; SqlTypeCensus.java:86,385); a `public static volatile
CONTEXT_SOURCE` (CanonicalDivergence.java:558 — escapes the static-state guard, see A13); global `CURRENT_FAMILY` (:360)
racy. Every execution runs the census walk `SqlTypeCensus.probe(plan)` and `probeWire(rs)` (Executor.java:169,344). 11
`System.getenv`, 10 `System.err`; PrepTrace appends to an env-named file (exec/PrepTrace.java:18,57-63). JDBC spread over 9
exec files; SystemDatabase opens its own DriverManager connections with hard-coded URLs (exec/SystemDatabase.java:110-117).

**Duplication/dead.** Three CSV parsers (Ddl.csvCells :263; CsvSeed.cells :165; `split(",")` CsvLoad :53); two literal
folders (LiteralFold pinned String/Boolean; `Literals.fold` used by evalValue/evalStringArg StatementExecutor.java:2287,3260);
firstMappingFqn/firstFromMapping (:959-972,1588-1600); containsEffect/callsVerdict (StatementExecutor.java:1889;
Compiler.java:1053). Dead: `PlanNode.allNodes()`; 3-arg `planToString` (:643); `SqlTypeCensus.classifyExternal` (:791);
unused AtomicLong import in Equality. Stale: package-info.java:13 "Compiler#compile drives 11 steps" (compile is
`plan().sql()`); Compiler doc says compile throws (:31-32); orphaned javadocs (Compiler.java:476-482,1149-1153;
StatementExecutor.java:90-92,1131-1136,1971-1985,2156-2161,2619-2620); PlanAllocations.java:276-277 says no rewritten
query is printed from Java but :292 calls `AggAwareActivities.rewrittenQuery`, printing Pure in Java;
CanonicalDivergence's header says it stays out of production, yet AssertVerdicts.tryAdjudicate (:67,81,105) and
Equality.same (:198) call it.

**Size.** StatementExecutor 3,326; AssertVerdicts 1,703; SqlTextVerdicts 1,701; Compiler 1,269; HostJudge 1,152; PlanText
1,136; `rowsLegAndVerdict` 3 overloads up to 19 parameters (SqlTextVerdicts.java:1308-1386). Overloads: evalValue 4,
planSide 4, executeTyped 3, engineSql 3.

**The execution tenet — what Java still computes.** Default judge HOST (ExecuteOptions.java:35): the verdict of record is
Java — `Equality.same` (kind rules, 2-ULP tolerance, scale-sensitive decimals, TDSNull sentinel; exec/Equality.java:155-220),
multisets and sorting (:294-351), JSON trees (:358-527), `PureAsserts.assertEqWithinTolerance` in BigDecimal (:127-142),
`TdsCompare.tdsEquivalent` numeric/temporal deltas (:267-300), HostJudge size/contains/condition (HostJudge.java:669-771).
An effectful `map` is looped in Java: source values fetched, body re-executed per element (StatementExecutor.java:2475-2506).
`planToStringWithoutFormatting` is `replace(" ", "")` over the whole plan text, string literals included (:636-637); plan
parameter holes filled by `String.replace` (SqlTextVerdicts.java:838-840). SQL by concatenation: `"Create schema if not
exists " + value` (StatementExecutor.java:3050); `"Drop schema if exists " + name + " cascade;"` (:3218-3219);
`Ddl.insertText` (exec/Ddl.java:289-320); `InProtocol.tempSelectSql` (plan/InProtocol.java:232-237). CSV parsed in Java 3×;
`Executor.decodeAny` tries Long, then Double, then String (:651-669); `structured` sniffs `{`/`[` (:601-609);
`isLiteralSelect` sniffs `startsWith("select")` (:3308-3317); PlanText re-parses its own output and the rendered SQL
(:84-86,148-159). Allowed by the decision rule: metamodel facts (include closures, set ancestry, PKs — MetamodelSeeds, OpSeeds).

**Result decoding.** Core sound: `unwrap` dispatches on SqlType labels LITERAL/DECIMAL_TEXT/TEMPORAL_TEXT/JSON/Struct
(Executor.java:729-847); temporals collapse to PureDateLiteral. Weak: the JSON-scalar sniff in decodeAny; driver class
matched by name `"org.duckdb.JsonNode"` (:638); pivot columns typed from JDBC type names (:1031-1081); plan output types
rewritten from ResultSetMetaData (WireTypes).

**plan/ has no plan IR.** `QueryPlan` is `(String sql, ExprType, ResultShape)` (plan/QueryPlan.java:17). `PlanNode` has a
`String kind` (:20), used only to emit rows. PlanText builds the engine's plan text by concatenating strings straight from
SqlQuery, TypedSpec and ModelContext, bypassing PlanNode — two plan forms that share no structure. The package also holds
result classification by column-name prefix (ResultShape :48-50), the JSON protocol shape (UpstreamRelationType),
compile-time config extraction (RelationalMapperRenames), SQL IR rewrites (PlanEnumForm, InProtocol).

## 3. Clean-sheet and delta
One `Session` holding the immutable boot layer (injected, not static) and a compiled `Module`. Explicit pure passes:
`check(Program) → TypedProgram` → inline → resolve → `plan(TypedProgram, Runtime) → PlanIR`. `PlanIR` a sealed tree with
typed fields: `SqlExec(SqlQuery, ResultType, Connection)`, `Sequence`, `Allocation`, `Constant`, `RelationalBlock`,
`TempTable`, `FreeMarkerCond`, `FnParamValidation`, `PureExp`, `Effect(SqlDdl|RawSql)`, `VerdictBatch(SqlQuery)`;
`ExecutionResult` as is. Consumers: a printer for planToString, a row serializer for plan-handle rows,
`render(PlanIR, Dialect)`, a thin `Runner(PlanIR, Connection, Observer)` that only sends, binds, decodes. A test body
planned whole before anything runs (a frame is an allocation; an effect a node; asserts one verdict statement, database
mode only). Strictness an option `STRICT | COLLECT(DiagnosticSink)` with `Diagnostic(code, severity, Span, SymbolId,
message)`. Instrumentation an injected `Observer`; connection establishment a per-connection session object.
Reuse: ExecutionResult, RowLoad/BulkLoad, RaisedErrors, DynamicPivot (as a pre-run plan step), Ddl.createTable/columnType,
CsvSeed.steps, EffectSink, ExecutionTrace, JdbcMetadata, Executor.fetch/unwrap, ResultShape.of(ExprType),
UpstreamRelationType, PlanSupportFunctions constants, the IR halves of InProtocol and PlanEnumForm. Restructure: Compiler →
one Session API; StatementExecutor + BodyCompiler + PlanAllocations + PlanEnvelope + AggAwareActivities → the planner,
runner separate; PlanText → printer over PlanIR; SqlTextVerdicts/AssertVerdicts/DatabaseJudge → lowering of assert
natives to verdict rows. Delete or move to a test module: the host judge (HostJudge, Equality, PureAsserts, TdsCompare,
CanonicalForm, CanonicalDivergence); SqlTypeCensus off the hot path; env debug code; dead code; four of five type spellers.

## 4. Top findings
1. STRUCTURAL: the executor is a second compiler driver (re-runs G, G½, H, I per statement, interleaved with JDBC and seeding).
2. STRUCTURAL: the test oracle lives in the product and Java is the default judge.
3. STRUCTURAL: `plan/` has no plan IR; two disjoint plan forms.
4. STRUCTURAL: global mutable state on the execution path; census walk on every execution.
5. DEFECT: dialect/connection defaults violate invariant 4; `dialectOf` runs session-setup SQL on every executeResolved.
6. DEFECT: ~20 swallow sites.
7. DEFECT: unescaped SQL concatenation (schema names in DDL; hand INSERT); `planToStringWithoutFormatting` strips spaces inside literals; `startsWith("select")` effect classification.
8. SMELL: entry-point sprawl (35 public statics), recompilation from text per call, tolerance by null, walls as maps with three key domains.
9. SMELL: phase back-edges and string identity (K reads C's AST; plan calls G; exec reads lowering; DB metadata rewrites plan types).
10. NIT: debug code, dead code, stale docs.

Counts: `instanceof` 607; `getSimpleName()` 34; catches 60 (7 `catch (RuntimeException)`, ~20 swallowing); JDBC-calling
files 9 (all in exec).
