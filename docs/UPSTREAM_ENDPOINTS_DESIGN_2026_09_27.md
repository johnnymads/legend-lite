# legend-lite serves upstream's APIs, and only those (2026-09-27)

**The user's ruling (2026-09-27):**
- legend-lite's HTTP surface for clients is exactly legend-engine's `pure/v1/...` APIs, same
  requests and same responses.
- Our made-up `/engine/plan` and `/engine/execute` are deleted, not extended.
- studio-lite, their other client, is being retired; a real legend-studio of our own comes later.
- This is the first step of leg C (`DATACUBE_TYPED_VALUES_DESIGN_2026_09_27.md`): types from the
  compiler reach clients over upstream's API, never over one of ours.

## Facts (measured)

**What a DataCube client needs, and the upstream API that carries it.** Answers were captured
from legend-engine 4.145.0 at `127.0.0.1:6300` for a cube query over `demo/trades-h2.pure`.

| need | upstream API | answer shape |
|---|---|---|
| Pure text to lambda JSON | E1 `POST pure/v1/grammar/grammarToJson/lambda` (text body) | the lambda protocol JSON (3 KB for a groupBy + sort) |
| a query's columns and types | E5 `POST pure/v1/compilation/lambdaRelationType` `{model, lambda}` | `{_type: relationType, columns: [{name, genericType: {rawType: {_type: packageableType, fullPath}, typeArguments, multiplicityArguments, typeVariableValues}, multiplicity: {lowerBound, upperBound}}]}` |
| plan: the SQL and the result's types (upstream's cached path: plan on the server, run in DuckDB-WASM) | E9 `POST pure/v1/execution/generatePlan` `ExecuteInput` | `{_type: simple, authDependent, rootExecutionNode: {_type: relationalTdsInstantiation, resultType: {_type: tds, tdsColumns: [{name, type, relationalType, enumMapping}]}, executionNodes: [{_type: sql, sqlQuery, resultColumns, resultType, connection, …}]}, serializer, templateFunctions}` |
| run on the server | E8 `POST pure/v1/execution/execute` `ExecuteInput` | `{builder: {_type: tdsBuilder, columns: [{name, type, relationalType}]}, activities: [{_type: relational, comment, sql}], result: {columns, rows: [{values}]}}` |

**The model can travel as text.** `ExecuteInput.model` and `LambdaReturnTypeInput.model` accept
`PureModelContextText` (`{_type: text, code}`); legend-engine answered all four calls with
it. DataCube's engine page sends the model as PMCD JSON today (via E2), which legend-lite would
have to READ, a full model reader. Sending text instead is a valid upstream request, saves a
round trip, and needs no model reader. The PMCD reader is recorded for the legend-studio work.

**legend-lite already has most of it:**
- **The parser writes engine records.** It produces `com.legend.protocol.spec.*` records whose
  names and fields are the engine protocol's, verbatim.
- **The emitter writes engine JSON.** `ProtocolEmitter` writes them as engine JSON (PMCD parity
  on 5,259 sources).
- **The compiler has the typed result.** It gives every plan `QueryPlan.rootType`.

**What is missing:**
- the READER (lambda protocol JSON to those records, the emitter's mirror);
- an entry that compiles an already-parsed lambda;
- the four endpoints.

**The vocabulary gap is not closed here.** legend-lite's typer names types `Integer`,
`Decimal(p,s)` and `DateTime`, where legend-engine says `Int`, `Numeric`, `Timestamp` and
`Varchar(n)`. It also disagrees with the engine on BIT and on `sum` of a decimal (table in the
leg C design). That is the untangle's compiler work, recorded for them. Here, legend-lite answers
in upstream's SHAPES with its own type names, and clients read both vocabularies.

## The design

**U1. The lambda reader** (`protocol`, beside the emitter). Engine lambda JSON becomes
`LambdaFunction` and every `ValueSpecification` variant the emitter writes. An unknown `_type` is
an error naming it, never skipped.

**U2. Compiling a parsed lambda.** `Compiler` gains the entries the endpoints need, taking the
lambda as records instead of text. The pipeline is unchanged: the same phases the text path
runs, from name resolution on.

**U3. The endpoints,** under `/api/pure/v1/` in `LegendHttpServer`:
- **E1:** parse, then emit. Source information follows upstream's query parameters.
- **E5:** the root relation type in upstream's `RelationType` JSON. Its renderer is shared with
  the browser planner, so the tab reads the same shape.
- **E9:** a `SingleExecutionPlan` with the fields legend-engine fills for a relational TDS:
  - `rootExecutionNode` of `relationalTdsInstantiation`, carrying the result's `tdsColumns`;
  - one `sql` execution node with `sqlQuery`, `resultColumns`, `resultType` and the connection;
  - `serializer`.
- **E8:** the `tdsBuilder` columns, the `relational` activity with the SQL, and the rows.

Errors follow upstream's error JSON. A model that is not `PureModelContextText` is refused with
upstream's error shape, naming the missing reader.

**U4. Clients move; the made-up API dies:**
- DataCube's legend-lite server page and its engine page use ONE client (`pure-v1.ts`, landed
  2026-09-27: `UpstreamPlanner` and `LegendEngineExecutor` both call through it):
  - E9 when the tab runs the SQL (upstream's cached path);
  - E8 when the server does.
- The model travels as text (the engine page's separate `grammarToJson/model` call went with it).
- Deleted: `/engine/plan`, `/engine/execute`, `LegendLitePlanner`, and the core tests of the two
  endpoints (rewritten against `/api/pure/v1`).
- The demo harnesses that planned through `/engine/plan` move too.

## The proof, named before the code

- **U1 round trip:** every lambda the corpus parses goes parse, emit, read and comes back EQUAL
  to its parsed records. So do legend-engine's own E1 answers for every DataCube cube case: the
  reader reads what the real engine writes.
- **U3 parity:** answers captured from legend-engine 4.145.0 are committed as goldens. A Bazel
  target captures them by hand against a running engine; tests never need one.
  - E1 is byte-exact.
  - E5, E9 and E8 are compared field by field.
  - The only allowed differences are the type names in the vocabulary table, listed by name in
    the test. A new difference fails it.
- **U4:** DataCube's server page runs the cube corpus over `/api/pure/v1` with the same client as
  the engine page. `/engine/plan` and `/engine/execute` answer 404.

## Recorded, not in this step

- The PMCD model READER (E2's mirror): the legend-studio work.
- E4 (`jsonToGrammar`, the grammar composer) and E6 (`lambdaReturnType`).
- lite's typer adopting the engine's precise primitives (the untangle).
