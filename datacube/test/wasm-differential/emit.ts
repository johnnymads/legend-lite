// A BUILD ACTION (datacube/BUILD.bazel, cube_queries): writes the model
// and DataCube's queries in the form //wasm:jvm_main reads in its `json`
// mode — the model file, and one `name<TAB>lambda JSON` line per case.
//
// Usage: node --experimental-strip-types emit.ts <model-out> <queries-out>

import { writeFileSync } from 'node:fs';

import { toJson } from '../../../pure-protocol/src/index.ts';
import { MODEL, queries } from './cases.ts';

const [modelOut, queriesOut] = process.argv.slice(2);
if (modelOut === undefined || queriesOut === undefined) {
  throw new Error('usage: emit.ts <model-out> <queries-out>');
}
const lines = queries().map(({ name, query }) => {
  // Compact JSON escapes every tab and newline inside a string, so a line is one query.
  return `${name}\t${toJson(query)}\n`;
});
writeFileSync(modelOut, MODEL);
writeFileSync(queriesOut, lines.join(''));
