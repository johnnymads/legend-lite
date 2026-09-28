// legend-lite's own parser and printer -- the tab's WASM module, through pure-protocol's test
// helper -- for tests that check WHAT QUERY DataCube builds: parsed as the compiler parses what a
// person typed, and read back as the compiler prints it. A test using this runs in the WASM group
// (BUILD.bazel `_WASM_TESTS`).

import { readLambda, toJson, type Lambda } from '../../pure-protocol/src/index.ts';
import { compose, parse } from '../../pure-protocol/test/lite.ts';
import { parseSnapshot, type Parsed } from '../src/query.ts';
import type { CubeSnapshot } from '../src/snapshot.ts';

/** E1's twin: what a person typed, as its lambda. */
export async function liteParse(text: string): Promise<Lambda> {
  return readLambda(await parse(text));
}

/** E4's twin: a query as one line of Pure. */
export async function litePrint(query: Lambda): Promise<string> {
  return compose(toJson(query), 'STANDARD');
}

/** A snapshot's source and calculated columns, parsed by lite. */
export function liteParsed(snapshot: CubeSnapshot): Promise<Parsed> {
  return parseSnapshot(snapshot, liteParse);
}
