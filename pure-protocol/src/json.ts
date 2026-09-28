// Protocol JSON, written and read EXACTLY.
//
// Writing: `_type` first, then every other key in alphabetical order -- the order legend-lite's
// grammar-to-JSON (E1) writes, so the same query is the same bytes whichever side built it (a
// cache key, a diff, a saved view). An `ExactNumber` is written as its digits, as a bare number
// token; a JavaScript number as itself; a non-finite number is refused.
//
// Reading: every number keeps its source digits (`ExactNumber`), so a decimal's `12.30` and an
// integer past 2^53 survive; `validate.ts` then types each by its node.

import { ExactNumber, ProtocolError } from './exact.ts';

/** A node (or any JSON value holding nodes) as protocol JSON text. */
export function toJson(value: unknown): string {
  const out: string[] = [];
  write(value, out);
  return out.join('');
}

function write(v: unknown, out: string[]): void {
  if (v === null) {
    out.push('null');
  } else if (v instanceof ExactNumber) {
    out.push(v.text);
  } else if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new ProtocolError(`JSON cannot carry ${v}`);
    out.push(String(v));
  } else if (typeof v === 'string') {
    out.push(JSON.stringify(v));
  } else if (typeof v === 'boolean') {
    out.push(v ? 'true' : 'false');
  } else if (typeof v === 'bigint') {
    out.push(v.toString());
  } else if (Array.isArray(v)) {
    out.push('[');
    v.forEach((item, i) => {
      if (i > 0) out.push(',');
      write(item, out);
    });
    out.push(']');
  } else if (typeof v === 'object') {
    const entries = Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined);
    entries.sort(([a], [b]) => (a === '_type' ? -1 : b === '_type' ? 1 : a < b ? -1 : a > b ? 1 : 0));
    out.push('{');
    entries.forEach(([k, x], i) => {
      if (i > 0) out.push(',');
      out.push(JSON.stringify(k), ':');
      write(x, out);
    });
    out.push('}');
  } else {
    throw new ProtocolError(`not a JSON value: ${typeof v}`);
  }
}

/**
 * JSON text with every number as an `ExactNumber` of its source digits. `JSON.parse` hands its
 * reviver each number's source text (a current engine's feature); one that cannot is refused
 * rather than read lossily.
 */
export function fromJson(text: string): unknown {
  return JSON.parse(text, function reviver(_key: string, value: unknown, context?: { source?: string }) {
    if (typeof value !== 'number') return value;
    const source = context?.source;
    if (source === undefined) {
      throw new ProtocolError('this JavaScript engine cannot read JSON numbers exactly '
        + '(JSON.parse source text access); a current browser or Node can');
    }
    return ExactNumber.of(source);
  } as (this: unknown, key: string, value: unknown) => unknown);
}
