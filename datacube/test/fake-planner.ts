// The protocol side of a PLANNER test double. A double plans nothing, so what a person typed
// (a source, a calculated column) is held as a string literal in a lambda of the parameters
// typed -- enough to build a query around -- and a query "printed" is its JSON, which the
// doubles' engines read. The real parse and print are the compiler's (E1 and E4, or the tab's
// WASM planner), exercised by the WASM tests.

import { findAll, isFunction, lambda, lit, toJson, type Lambda } from '../../pure-protocol/src/index.ts';
import { parseSnapshot, type Parsed } from '../src/query.ts';
import type { CubeSnapshot } from '../src/snapshot.ts';

/** A stand-in for the compiler's parse: `x|expr` as a lambda of `x` whose body holds `expr`. */
export async function fakeParse(text: string): Promise<Lambda> {
  const bar = text.indexOf('|');
  const parameters = text.slice(0, bar).split(',').map((p) => p.trim()).filter((p) => p !== '');
  return lambda(parameters, lit.string(text.slice(bar + 1)));
}

/** A stand-in for the compiler's print: the query's JSON. */
export async function fakePrint(query: Lambda): Promise<string> {
  return toJson(query);
}

/** The row caps a query asks for: each `limit`'s count, as its literal holds it. */
export function limitsOf(query: Lambda): unknown[] {
  return findAll(query, isFunction)
    .filter((f) => f.function === 'limit')
    .map((f) => (f.parameters[1] as { readonly value?: unknown } | undefined)?.value);
}

/** A snapshot's text through the stand-in parse, for a test that builds a cube's queries itself. */
export function fakeParsed(snapshot: CubeSnapshot): Promise<Parsed> {
  return parseSnapshot(snapshot, fakeParse);
}

/** A query for a test that needs one and never looks inside it. */
export function someQuery(name = 'q'): Lambda {
  return lambda([], lit.string(name));
}
