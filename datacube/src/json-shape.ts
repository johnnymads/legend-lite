// What is inside a JSON column, and the calculated columns that reach it.
//
// A Variant column is declared SEMISTRUCTURED and nothing in the model
// says what its documents hold, so the shape is INFERRED from a sample
// of them -- fetched through the ordinary query path, which is why it
// works on every plane (in the tab, the warehouse, the engine) with no
// API of its own. The inferred type only chooses which `to(@T)` a
// generated column writes; the compiler then types the column, as it
// types any calculated column, so a wrong guess is a refusal or a
// visibly wrong column -- never a silently wrong one.
//
// Numbers are classified from their TEXT. `JSON.parse` makes `1` and
// `1.0` the same value and rounds integers past 2^53, so a sample read
// through it would call a float column an integer, or an id column a
// float. The reader below keeps each number's own spelling.

import {
  col, collection, fn, lambda, lit, to, toMany, type, variable, type Lambda, type ValueSpecification,
} from '../../pure-protocol/src/index.ts';

// ---- reading -------------------------------------------------------

/** A JSON value, numbers kept as written. */
export type JsonNode =
  | { readonly t: 'object'; readonly entries: readonly [string, JsonNode][] }
  | { readonly t: 'array'; readonly items: readonly JsonNode[] }
  | { readonly t: 'number'; readonly text: string }
  | { readonly t: 'string'; readonly value: string }
  | { readonly t: 'boolean'; readonly value: boolean }
  | { readonly t: 'null' };

/** Parse one JSON document; throws on malformed text. */
export function parseJson(text: string): JsonNode {
  let i = 0;
  const ws = (): void => {
    while (i < text.length && ' \t\n\r'.includes(text[i]!)) i += 1;
  };
  const fail = (what: string): never => {
    throw new SyntaxError(`${what} at ${i} in JSON`);
  };
  const str = (): string => {
    // Delegate escapes to JSON.parse on the exact string token: strings
    // lose nothing through it, only numbers do.
    const start = i;
    i += 1;
    while (i < text.length && text[i] !== '"') i += text[i] === '\\' ? 2 : 1;
    if (i >= text.length) fail('unterminated string');
    i += 1;
    return JSON.parse(text.slice(start, i)) as string;
  };
  const value = (): JsonNode => {
    ws();
    const c = text[i];
    if (c === '{') {
      i += 1;
      const entries: [string, JsonNode][] = [];
      ws();
      if (text[i] === '}') { i += 1; return { t: 'object', entries }; }
      for (;;) {
        ws();
        if (text[i] !== '"') fail('expected a key');
        const k = str();
        ws();
        if (text[i] !== ':') fail('expected :');
        i += 1;
        entries.push([k, value()]);
        ws();
        if (text[i] === ',') { i += 1; continue; }
        if (text[i] === '}') { i += 1; return { t: 'object', entries }; }
        fail('expected , or }');
      }
    }
    if (c === '[') {
      i += 1;
      const items: JsonNode[] = [];
      ws();
      if (text[i] === ']') { i += 1; return { t: 'array', items }; }
      for (;;) {
        items.push(value());
        ws();
        if (text[i] === ',') { i += 1; continue; }
        if (text[i] === ']') { i += 1; return { t: 'array', items }; }
        fail('expected , or ]');
      }
    }
    if (c === '"') return { t: 'string', value: str() };
    const m = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(i));
    if (m) { i += m[0].length; return { t: 'number', text: m[0] }; }
    for (const [word, node] of [['true', { t: 'boolean', value: true }],
      ['false', { t: 'boolean', value: false }], ['null', { t: 'null' }]] as const) {
      if (text.startsWith(word, i)) { i += word.length; return node; }
    }
    return fail('unexpected character');
  };
  const out = value();
  ws();
  if (i !== text.length) fail('trailing text');
  return out;
}

// ---- inferring -----------------------------------------------------

/** What a scalar looked like: the choice of `to(@T)`. */
export type ScalarKind =
  | 'integer' | 'float' | 'boolean' | 'date' | 'datetime' | 'text';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME =
  /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/;

function scalarKind(n: JsonNode): ScalarKind | undefined {
  switch (n.t) {
    case 'number': return /^-?\d+$/.test(n.text) ? 'integer' : 'float';
    case 'boolean': return 'boolean';
    case 'string':
      return DATE.test(n.value) ? 'date'
        : DATETIME.test(n.value) ? 'datetime' : 'text';
    default: return undefined;
  }
}

/** The text a scalar is shown and compared by. */
function scalarText(n: JsonNode): string {
  switch (n.t) {
    case 'number': return n.text;
    case 'string': return n.value;
    case 'boolean': return String(n.value);
    default: return '';
  }
}

/** Everything seen at ONE position across the sample. */
export interface Shape {
  /** Documents that had this position at all (null included). */
  present: number;
  nulls: number;
  readonly scalars: Map<ScalarKind, number>;
  /** Distinct scalar values and how often, capped (see MAX_VALUES). */
  readonly values: Map<string, number>;
  objects: number;
  readonly fields: Map<string, Shape>;
  arrays: number;
  /** The shape of every element of every array seen here. */
  element?: Shape;
  minLength: number;
  maxLength: number;
}

const MAX_VALUES = 50;

function emptyShape(): Shape {
  return { present: 0, nulls: 0, scalars: new Map(), values: new Map(),
    objects: 0, fields: new Map(), arrays: 0,
    minLength: Infinity, maxLength: 0 };
}

function observe(shape: Shape, n: JsonNode): void {
  shape.present += 1;
  if (n.t === 'null') { shape.nulls += 1; return; }
  if (n.t === 'object') {
    shape.objects += 1;
    for (const [k, v] of n.entries) {
      let f = shape.fields.get(k);
      if (!f) { f = emptyShape(); shape.fields.set(k, f); }
      observe(f, v);
    }
    return;
  }
  if (n.t === 'array') {
    shape.arrays += 1;
    shape.minLength = Math.min(shape.minLength, n.items.length);
    shape.maxLength = Math.max(shape.maxLength, n.items.length);
    shape.element ??= emptyShape();
    for (const item of n.items) observe(shape.element, item);
    return;
  }
  const kind = scalarKind(n)!;
  shape.scalars.set(kind, (shape.scalars.get(kind) ?? 0) + 1);
  const text = scalarText(n);
  if (shape.values.has(text) || shape.values.size < MAX_VALUES) {
    shape.values.set(text, (shape.values.get(text) ?? 0) + 1);
  }
}

export interface Sample {
  /** The inferred shape of the column's documents. */
  readonly shape: Shape;
  /** Rows read, empty ones included. */
  readonly rows: number;
  /** Documents that could not be read as JSON. */
  readonly unreadable: number;
  /** Every row of the column was read: the shape describes all of it, not a sample. */
  readonly complete: boolean;
}

/**
 * A column's shape, built as its cells arrive: a sample's, or -- reading every row --
 * each streamed chunk's, observed and let go, so a whole column passes in flat memory.
 */
export class ShapeReader {
  readonly #shape = emptyShape();
  #rows = 0;
  #unreadable = 0;

  /** A cell as the grid receives it. */
  add(cell: unknown): void {
    this.#rows += 1;
    if (cell === null || cell === undefined) return;
    // A JSON column arrives as its text; an object is what a nested
    // column looks like when a driver has already decoded it.
    const text = typeof cell === 'string' ? cell : JSON.stringify(cell);
    try {
      observe(this.#shape, parseJson(text));
    } catch {
      this.#unreadable += 1;
    }
  }

  result(complete: boolean): Sample {
    return { shape: this.#shape, rows: this.#rows, unreadable: this.#unreadable, complete };
  }
}

/** Infer a shape from a sample of a column's cells, as the grid receives them. */
export function inferShape(cells: readonly unknown[]): Sample {
  const reader = new ShapeReader();
  for (const cell of cells) reader.add(cell);
  return reader.result(false);
}

/**
 * The one scalar type a position takes. Integers and floats together
 * are floats; dates and datetimes together are datetimes; anything
 * else mixed is text, which every value converts to.
 */
export function scalarTypeOf(shape: Shape): ScalarKind | undefined {
  const kinds = [...shape.scalars.keys()];
  if (kinds.length === 0) return undefined;
  if (kinds.length === 1) return kinds[0];
  const only = (...ks: ScalarKind[]) => kinds.every((k) => ks.includes(k));
  if (only('integer', 'float')) return 'float';
  if (only('date', 'datetime')) return 'datetime';
  return 'text';
}

// ---- showing ----------------------------------------------------------

/**
 * A JSON document for the eye: `{kind: billing, city: Paris}`, `[S, M]`. A key or a string is
 * bare when it cannot be mistaken for anything else -- not empty, no punctuation of the notation,
 * not a number, `true`, `false` or `null` -- and JSON-quoted otherwise; numbers as written. Display
 * only: the value itself stays JSON (it groups, filters and exports as JSON). Text that is not JSON
 * is shown as it is.
 */
export function prettyJson(text: string): string {
  let node: JsonNode;
  try {
    node = parseJson(text);
  } catch {
    return text;
  }
  const bare = (t: string): string =>
    t !== '' && !/[,:{}[\]"\s]/.test(t.trim()) && t === t.trim()
      && !/^(true|false|null|-?\d.*)$/.test(t) ? t : JSON.stringify(t);
  const show = (n: JsonNode): string => {
    switch (n.t) {
      case 'object': return `{${n.entries.map(([k, v]) => `${bare(k)}: ${show(v)}`).join(', ')}}`;
      case 'array': return `[${n.items.map(show).join(', ')}]`;
      case 'string': return bare(n.value);
      case 'number': return n.text;
      case 'boolean': return String(n.value);
      case 'null': return 'null';
    }
  };
  return show(node);
}

// ---- what can be extracted -----------------------------------------

const PURE_TYPE: Record<ScalarKind, string> = {
  integer: 'Integer', float: 'Float', boolean: 'Boolean',
  date: 'StrictDate', datetime: 'DateTime', text: 'String',
};

/** One calculated column the picker can create. */
export interface Extraction {
  /** A default column name, e.g. `customer_tier`. */
  readonly name: string;
  /** What the picker shows for it. */
  readonly label: string;
  /** The row-stage column, `x|...`, as protocol: the editor shows the compiler's print of it. */
  readonly lambda: Lambda;
  /** The Pure type it will have. */
  readonly type: string;
  readonly kind: 'dimension' | 'measure';
  /** Each row once per element of the collection `lambda` yields (`DerivedColumn.unnest`). */
  readonly unnest?: boolean;
  /**
   * An explode of objects: the array, and its elements' scalar fields -- the column the editor
   * builds from the ones ticked (`explodeLambda`): one field its value, several one tuple.
   */
  readonly explode?: { readonly array: ValueSpecification; readonly fields: readonly ElementField[]; readonly base: readonly string[] };
}

/** One scalar field of an array's elements, as the explode offers it. */
export interface ElementField {
  readonly key: string;
  /** The Pure type its `to(@T)` writes -- a suggestion; the compiler types the column. */
  readonly type: string;
  readonly kind: 'dimension' | 'measure';
}

/**
 * An explode's column, from the element fields ticked: none, the element itself as JSON; one,
 * that field's value, typed; several, ONE JSON object holding just them, `{"kind":"billing",
 * "city":"Paris"}` -- each element mapped before the flatten, so the exploded column IS the tuple;
 * a field an element lacks is `null` in it, its values keep their JSON types.
 */
export function explodeLambda(array: ValueSpecification, fields: readonly ElementField[]): Lambda {
  const many = toMany(array, type('Variant'));
  const field = (f: ElementField): ValueSpecification => fn('get', variable('e'), lit.string(f.key));
  const [only] = fields;
  if (only === undefined) return ofRow(many);
  if (fields.length === 1) return ofRow(fn('map', many, lambda(['e'], to(field(only), type(only.type)))));
  return ofRow(fn('map', many, lambda(['e'], fn('toVariant', fn('newMap', collection(
    fields.map((f) => fn('pair', lit.string(f.key), fn('toVariant', field(f))))))))));
}

/** The explode's column name: the array and the fields ticked, `addresses_kind_city`. */
export function explodeName(base: readonly string[], fields: readonly ElementField[]): string {
  return fields.length === 0 ? nameOf([...base, 'element']) : nameOf([base[base.length - 1] ?? 'value', ...fields.map((f) => f.key)]);
}

/** The explode's Pure type: JSON, or the one field's. */
export function explodeType(fields: readonly ElementField[]): string {
  return fields.length === 1 ? fields[0]!.type : 'Variant';
}

/** A position in the documents, with what can be made of it. */
export interface Field {
  /** Keys from the column, e.g. ['customer', 'contact', 'email']. */
  readonly path: readonly string[];
  /** What was seen: 'text', 'integer', 'object', 'array of object'... */
  readonly description: string;
  /** Share of sampled documents that had it, 0..1. */
  readonly presence: number;
  readonly extractions: readonly Extraction[];
  readonly children: readonly Field[];
}

/** A path from the row: `$x.col->get('a')->get('b')`. */
function reach(root: ValueSpecification, keys: readonly string[]): ValueSpecification {
  return keys.reduce((e, k) => fn('get', e, lit.string(k)), root);
}

/** A function of the row. */
function ofRow(body: ValueSpecification): Lambda {
  return lambda(['x'], body);
}

/** `$e->get(key)`, inside a `map` over elements. */
function element(key: string): ValueSpecification {
  return fn('get', variable('e'), lit.string(key));
}

function nameOf(parts: readonly string[]): string {
  return parts.join('_').replace(/[^A-Za-z0-9_]+/g, '_')
    .replace(/_+/g, '_').replace(/^_|_$/g, '') || 'value';
}

function describe(shape: Shape): string {
  const parts: string[] = [];
  const scalar = scalarTypeOf(shape);
  if (scalar) parts.push(scalar);
  if (shape.objects > 0) parts.push('object');
  if (shape.arrays > 0) {
    const el = shape.element;
    const inner = !el || el.present === el.nulls ? 'nothing'
      : describe(el);
    parts.push(`array of ${inner}`);
  }
  return parts.length > 0 ? parts.join(' or ') : 'always null';
}

/** The most frequent values of a scalar position, most frequent first. */
export function topValues(shape: Shape, n = 12): string[] {
  return [...shape.values.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n).map(([v]) => v);
}

/** A seen value as a literal of its scalar kind, for `contains`. */
function valueLiteral(kind: ScalarKind, text: string): ValueSpecification {
  return kind === 'integer' ? lit.integer(text)
    : kind === 'float' ? lit.float(text)
    : kind === 'boolean' ? lit.boolean(text === 'true')
    : lit.string(text);
}

/**
 * The fields of a column's documents, and what each can become.
 *
 * The top level is the column itself (`$x.<column>`): an object column
 * lists its keys, an array column offers its array extractions directly.
 */
export function fieldsOf(column: string, sample: Sample): Field[] {
  const total = Math.max(1, sample.rows);
  const build = (shape: Shape, path: readonly string[], parentPresent: number): Field => {
    const expr = reach(col('x', column), path);
    const names = [column, ...path];
    const extractions: Extraction[] = [];
    const scalar = scalarTypeOf(shape);
    if (scalar && shape.objects === 0 && shape.arrays === 0) {
      extractions.push({
        name: nameOf(names), label: `as ${PURE_TYPE[scalar]}`,
        lambda: ofRow(to(expr, type(PURE_TYPE[scalar]))), type: PURE_TYPE[scalar],
        kind: scalar === 'float' ? 'measure' : 'dimension',
      });
    }
    // A nested object or array, pulled out as a JSON column of its own:
    // it groups, drills and extracts again like any JSON column. Not
    // at the top -- that is the column itself.
    if (path.length > 0 && (shape.objects > 0 || shape.arrays > 0)) {
      extractions.push({ name: nameOf(names), label: 'as JSON',
        lambda: ofRow(expr), type: 'Variant', kind: 'dimension' });
    }
    if (shape.arrays > 0) extractions.push(...arrayExtractions(shape, expr, names));
    const children = shape.objects > 0
      ? [...shape.fields.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([k, f]) => build(f, [...path, k], shape.objects))
      : [];
    return {
      path, description: describe(shape),
      presence: Math.min(1, (shape.present - shape.nulls) / Math.max(1, parentPresent)),
      extractions, children,
    };
  };
  return [build(sample.shape, [], total)];
}

function arrayExtractions(shape: Shape, expr: ValueSpecification, names: readonly string[]): Extraction[] {
  const out: Extraction[] = [];
  const many = toMany(expr, type('Variant'));
  const el0 = shape.element;
  const elScalar0 = el0 ? scalarTypeOf(el0) : undefined;
  const key = names[names.length - 1] ?? 'value';
  if (el0 && elScalar0 && el0.objects === 0 && el0.arrays === 0) {
    // EXPLODE values: each row once per element, the element's value typed directly
    const t = PURE_TYPE[elScalar0];
    out.push({ name: nameOf([key, 'value']), label: 'one row per element (explode)',
      lambda: ofRow(toMany(expr, type(t))), type: t,
      kind: elScalar0 === 'float' ? 'measure' : 'dimension', unnest: true });
  } else {
    // EXPLODE objects: each row once per element; the element's scalar fields, in the order
    // the data has them, offered to tick -- every one ticked to start: one tuple column
    const fields: ElementField[] = el0 && el0.objects > 0
      ? [...el0.fields.entries()].flatMap(([k, f]) => {
        const s = scalarTypeOf(f);
        return s && f.objects === 0 && f.arrays === 0
          ? [{ key: k, type: PURE_TYPE[s], kind: s === 'float' ? 'measure' as const : 'dimension' as const }]
          : [];
      })
      : [];
    out.push({ name: explodeName(names, fields), label: 'one row per element (explode)',
      lambda: explodeLambda(expr, fields), type: explodeType(fields),
      kind: fields.length === 1 ? fields[0]!.kind : 'dimension', unnest: true,
      ...(fields.length > 0 ? { explode: { array: expr, fields, base: names } } : {}) });
  }
  out.push({ name: nameOf([...names, 'count']), label: 'number of elements',
    lambda: ofRow(fn('size', many)), type: 'Integer', kind: 'measure' });
  const el = shape.element;
  if (!el) return out;
  const elScalar = scalarTypeOf(el);
  if (elScalar && el.objects === 0 && el.arrays === 0) {
    const t = PURE_TYPE[elScalar];
    out.push({ name: nameOf([...names, 'list']), label: 'all values, as text',
      lambda: ofRow(fn('joinStrings', toMany(expr, type('String')), lit.string(', '))),
      type: 'String', kind: 'dimension' });
    // "contains" compares a typed-in literal: text, numbers, booleans.
    const comparable = elScalar !== 'date' && elScalar !== 'datetime';
    for (const v of comparable ? topValues(el, 8) : []) {
      out.push({ name: nameOf([...names, 'has', v]), label: `contains ${v}`,
        lambda: ofRow(fn('contains', toMany(expr, type(t)), valueLiteral(elScalar, v))),
        type: 'Boolean', kind: 'dimension' });
    }
  }
  if (el.objects > 0) {
    // One element, whole: a JSON column of its own (T10), extracted from again like any.
    out.push({ name: nameOf([...names, 'first']), label: 'first element, as JSON',
      lambda: ofRow(fn('get', expr, lit.integer(0))), type: 'Variant', kind: 'dimension' });
    for (const [k, f] of [...el.fields.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      // Every element's value -- a scalar, or an array or object of its
      // own -- as ONE JSON array: ["MS-01","HS-01"].
      out.push({ name: nameOf([...names, k]), label: `every ${k}, as JSON`,
        lambda: ofRow(fn('toVariant', fn('map', many, lambda(['e'], element(k))))),
        type: 'Variant', kind: 'dimension' });
      const s = scalarTypeOf(f);
      if (!s || f.objects > 0 || f.arrays > 0) continue;
      const t = PURE_TYPE[s];
      out.push({ name: nameOf([...names, k, 'list']), label: `every ${k}, as text`,
        lambda: ofRow(fn('joinStrings',
          fn('map', many, lambda(['e'], fn('toOne', to(element(k), type('String'))))), lit.string(', '))),
        type: 'String', kind: 'dimension' });
      out.push({ name: nameOf([...names, 'first', k]), label: `first element's ${k}`,
        lambda: ofRow(to(fn('get', fn('get', expr, lit.integer(0)), lit.string(k)), type(t))),
        type: t, kind: s === 'float' ? 'measure' : 'dimension' });
      if (s === 'integer' || s === 'float') {
        out.push({ name: nameOf([...names, k, 'total']), label: `total of ${k}`,
          lambda: ofRow(fn('sum', fn('map', many, lambda(['e'], fn('toOne', to(element(k), type(t))))))),
          type: t, kind: 'measure' });
      }
    }
  }
  return out;
}
