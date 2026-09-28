# pure-protocol

Pure queries as legend-engine's V1 lambda JSON, for every UI that talks to legend-lite or
legend-engine (DataCube, a query tool, a studio). Plain TypeScript, no dependencies.

- **Build with the Relation API** (`relation.ts`): `from(accessor(...)).filter(...).groupBy(...).lambda()`.
  There is deliberately no builder for the older TDS API; old TDS JSON is still *read*
  (`validate.ts` keeps it verbatim) and printed by the compiler, for compatibility.
- **Literals are typed and validated where they are made** (`literal.ts`): a calendar day that is
  not one, a decimal with an exponent, an integer JavaScript cannot hold exactly -- refused, named.
  `lit.of(type, value)` turns a column's compiler type and an exact cell value into its literal.
- **Exact JSON** (`json.ts`): a decimal's `12.30` and an integer past 2^53 are written and read as
  their digits. `toJson` writes `_type` first and every other key alphabetically -- the bytes
  legend-lite's own grammar-to-JSON writes, so the same query is the same bytes wherever built.
- **Send the JSON** to `pure/v1/compilation/lambdaRelationType`, `.../execution/generatePlan`,
  `.../execution/execute` (legend-lite or legend-engine), or the tab's WASM planner
  (`planJsonOrError`). **Ask the compiler to print it** (`pure/v1/grammar/jsonToGrammar/lambda`)
  when a person needs to read it; parse what a person types with `grammarToJson/lambda`.

The proof (`test/twins.test.ts`, `bazel test //pure-protocol:all`): every builder's JSON is
byte-identical to what legend-lite's parser -- itself byte-exact with legend-engine's -- gives the
same query as text, and the compiler's print of it parses back to the same bytes.

Note what the tests pin about text: Pure applies `&&`/`||` left to right with the comparisons, so
`$x.a <= 2 && $x.b >= 3` is `(($x.a <= 2) && $x.b) >= 3`. A tree cannot get that wrong.
