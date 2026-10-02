// SAVED QUERIES as a cube's source (the user, 2026-10-01: "load from a saved Query"): read from
// upstream's query store, `/api/pure/v1/query` (legend-lite's `--query-store`, or legend-engine's),
// never from Query's own browser storage. The record is upstream's `Query`, and the reading rules
// are the ones Query writes by (fixtures/saved-queries/README.md, tested against those records):
//
//   1. the execution context names the mapping and runtime: `explicitExecutionContext` directly;
//      `dataSpaceExecutionContext` through the data space's execution context named
//      `executionKey` (else its default) -- read from the project's model as the compiler gives
//      it (`grammarToJson/model`), never from its text;
//   2. `content` is the lambda as Pure text without `->from(...)`: parsed by the compiler, its one
//      expression is the cube's source, and the planner reads every query of the cube through
//      `->from(mapping, runtime)` (planner.ts `ModelOptions.mapping`) -- outermost, as Query runs it;
//   3. a parameter takes its `defaultParameterValues` entry, parsed as `|<content>`; a parameter
//      with none cannot be a source (the cube has nowhere to ask for it).
//
// And one of DataCube's own: 4. a column the compiler types with an ENUMERATION is read as its
// value's name -- `->toString()` in the projection that makes it (`enumsAsStrings`). legend-lite
// cannot plan an enumeration column on DuckDB at all, and DataCube's types are the primitives; the
// name is what both engines' SQL yields once the mapping's EnumerationMapping is applied (probed
// 2026-10-01: `CASE WHEN SIDE = 'BUY' THEN 'BUY' ...`).
//
// A query whose answer is objects (graphFetch, serialize) is not a cube's source: it is listed,
// and says why.

import {
  findAll, fn, isLambda, transform, type ColSpec, type Lambda, type ValueSpecification,
} from '../../pure-protocol/src/index.ts';

/** Upstream's saved `Query`, the fields a cube reads. */
export interface SavedQuery {
  readonly id: string;
  readonly name: string;
  readonly owner?: string | null;
  readonly groupId: string;
  readonly artifactId: string;
  readonly versionId: string;
  readonly content: string;
  readonly executionContext?: SavedExecutionContext | null;
  readonly defaultParameterValues?: readonly { readonly name: string; readonly content: string }[] | null;
  readonly lastUpdatedAt?: number | null;
}

/** `explicitExecutionContext` (mapping, runtime) or `dataSpaceExecutionContext` (dataSpacePath, executionKey); others are refused. */
export interface SavedExecutionContext {
  readonly _type: string;
  readonly mapping?: string;
  readonly runtime?: string;
  readonly dataSpacePath?: string;
  readonly executionKey?: string | null;
}

/** The store: get and search, as upstream serves them. */
export class QueryStore {
  readonly #base: string;
  readonly #fetch: typeof fetch;

  constructor(baseUrl: string, fetcher: typeof fetch = globalThis.fetch.bind(globalThis)) {
    this.#base = baseUrl.replace(/\/$/, '');
    this.#fetch = fetcher;
  }

  /** `POST /api/pure/v1/query/search`: by name (and owner), newest first. */
  search(text: string, mineOnly: boolean, limit = 50): Promise<SavedQuery[]> {
    return this.#json('POST', '/api/pure/v1/query/search', {
      ...(text ? { searchTermSpecification: { searchTerm: text, includeOwner: true } } : {}),
      showCurrentUserQueriesOnly: mineOnly,
      sortByOption: 'SORT_BY_UPDATE',
      limit,
    });
  }

  /** `GET /api/pure/v1/query/{id}`. */
  get(id: string): Promise<SavedQuery> {
    return this.#json('GET', `/api/pure/v1/query/${encodeURIComponent(id)}`);
  }

  async #json<T>(method: string, path: string, body?: unknown): Promise<T> {
    const r = await this.#fetch(`${this.#base}${path}`, {
      method,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await r.text();
    if (!r.ok) {
      let message = text;
      try {
        message = (JSON.parse(text) as { message?: string }).message ?? text;
      } catch {
        // not JSON: the text is the message
      }
      throw new Error(`the query store answered ${r.status}: ${message.slice(0, 300)}`);
    }
    return JSON.parse(text) as T;
  }
}

/** A project's model as the compiler gives it (PureModelContextData elements): what is read here. */
export interface ModelElement {
  readonly _type: string;
  readonly package?: string;
  readonly name?: string;
  readonly defaultExecutionContext?: string;
  readonly executionContexts?: readonly {
    readonly name: string;
    readonly mapping?: { readonly path: string };
    readonly defaultRuntime?: { readonly path: string };
  }[];
}

const pathOf = (e: ModelElement): string => (e.package ? `${e.package}::${e.name ?? ''}` : (e.name ?? ''));

/** The enumerations of a project's model: their columns are read as String (the engines carry names). */
export function enumerationsOf(elements: readonly ModelElement[]): ReadonlySet<string> {
  return new Set(elements.filter((e) => e._type === 'Enumeration').map(pathOf));
}

/** Rule 1: the mapping and runtime a saved query runs on. */
export function contextOf(q: SavedQuery, elements: readonly ModelElement[]): { readonly mapping: string; readonly runtime: string } {
  const ctx = q.executionContext;
  if (ctx?._type === 'explicitExecutionContext' && ctx.mapping && ctx.runtime) {
    return { mapping: ctx.mapping, runtime: ctx.runtime };
  }
  if (ctx?._type === 'dataSpaceExecutionContext' && ctx.dataSpacePath) {
    const path = ctx.dataSpacePath;
    const ds = elements.find((e) => e._type === 'dataSpace' && pathOf(e) === path);
    if (!ds) throw new Error(`its data space ${path} is not in ${projectOf(q)}`);
    const key = ctx.executionKey ?? ds.defaultExecutionContext;
    const ec = ds.executionContexts?.find((c) => c.name === key);
    if (!ec?.mapping || !ec.defaultRuntime) {
      throw new Error(`its data space has no execution context '${key ?? ''}' with a mapping and a runtime`);
    }
    return { mapping: ec.mapping.path, runtime: ec.defaultRuntime.path };
  }
  throw new Error('it has no execution context a cube can read (explicit, or a data space)');
}

/** The project a saved query belongs to, as config.json's `projects[]` names one. */
export function projectOf(q: SavedQuery): string {
  return `${q.groupId}:${q.artifactId}:${q.versionId}`;
}

/** Functions whose answer is objects, not rows. */
const OBJECT_ANSWERS = new Set(['graphFetch', 'graphFetchChecked', 'serialize']);

/** Why a parsed saved query cannot be a cube's source, or undefined when it can. */
export function unusable(lambda: Lambda): string | undefined {
  const called = new Set<string>();
  for (const f of findAll(lambda, (n): n is ValueSpecification & { function: string } => n._type === 'func')) {
    called.add(f.function.slice(f.function.lastIndexOf(':') + 1));
  }
  if ([...called].some((f) => OBJECT_ANSWERS.has(f))) return 'its answer is objects, not rows: open it in Query';
  if (lambda.body.length !== 1) return 'it is several statements: a cube reads one expression';
  return undefined;
}

/**
 * Rules 2 and 3: the saved query as a cube's source -- its parameters bound to their saved values
 * (`values`, each already parsed), its one expression. The mapping and runtime are the planner's
 * (rule 1, `contextOf`).
 */
export function sourceOf(lambda: Lambda, values: ReadonlyMap<string, ValueSpecification>): ValueSpecification {
  const why = unusable(lambda);
  if (why) throw new Error(why);
  const names = new Set(lambda.parameters.map((p) => p.name));
  const missing = [...names].filter((n) => !values.has(n));
  if (missing.length > 0) throw new Error(`it needs a value for ${missing.map((m) => `'${m}'`).join(', ')}, and none is saved`);
  // a parameter's name reused by an inner lambda would be bound in the wrong place
  if (findAll(lambda.body[0]!, isLambda).some((inner) => inner.parameters.some((p) => names.has(p.name)))) {
    throw new Error('an inner lambda reuses a parameter’s name: open it in Query');
  }
  return transform(lambda.body[0]!, (n) => (n._type === 'var' && values.has(n.name) ? values.get(n.name)! : n));
}

/**
 * Rule 4: the columns `named` -- typed by an enumeration -- read as their values' names: the
 * column spec that MAKES each (a projection's `Side: x|$x.side`, no aggregate) gets
 * `->toString()` on its value. A column made where no such spec is refuses, by name.
 */
export function enumsAsStrings(source: ValueSpecification, named: ReadonlySet<string>): ValueSpecification {
  const left = new Set(named);
  const spec = (c: ColSpec): ColSpec => {
    if (!left.has(c.name) || !c.function1 || c.function2 || c.function1.body.length !== 1) return c;
    left.delete(c.name);
    return { ...c, function1: { ...c.function1, body: [fn('toString', c.function1.body[0]!)] } };
  };
  const out = transform(source, (n) => {
    if (n._type !== 'classInstance') return n;
    if (n.type === 'colSpec') return { ...n, value: spec(n.value as ColSpec) } as ValueSpecification;
    if (n.type === 'colSpecArray') {
      const v = n.value as { colSpecs: readonly ColSpec[] };
      return { ...n, value: { ...v, colSpecs: v.colSpecs.map(spec) } } as ValueSpecification;
    }
    return n;
  });
  if (left.size > 0) {
    throw new Error(`its column${left.size === 1 ? '' : 's'} ${[...left].map((c) => `'${c}'`).join(', ')} ${left.size === 1 ? 'is an enumeration' : 'are enumerations'} a cube cannot read here: project ${left.size === 1 ? 'it' : 'them'} in the query`);
  }
  return out;
}
