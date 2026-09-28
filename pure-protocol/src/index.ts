// legend-lite's protocol library: Pure queries as legend-engine's V1 lambda JSON, built typed and
// written exactly. For every UI that talks to legend-lite or legend-engine (DataCube, a query tool,
// a studio): build with the Relation API, send the JSON to pure/v1 (or the tab's planner), and ask
// the compiler to print it (jsonToGrammar) when a person needs to read it.
//
//   wire.ts      the node shapes          literal.ts   typed, validated literals
//   build.ts     expressions and types    relation.ts  the Relation API (and only it)
//   json.ts      exact JSON in and out    validate.ts  JSON read into the typed model
//   walk.ts      visit and rewrite

export * from './wire.ts';
export { ExactNumber, ProtocolError } from './exact.ts';
export { lit } from './literal.ts';
export * from './build.ts';
export * from './relation.ts';
export { toJson, fromJson } from './json.ts';
export { readLambda, readValueSpecification } from './validate.ts';
export * from './walk.ts';
