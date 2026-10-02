// THE STORE IN THIS PAGE: upstream's `/api/pure/v1/query` answered without a server, from the
// page's own records (records.ts: IndexedDB, so every app on this origin shares them). A port of
// legend-lite's `core/.../server/SavedQueries.java` -- itself ported from legend-engine's
// ApplicationQuery + QueryStoreManager -- endpoint for endpoint, rule for rule, word for word: the
// same paths, the same JSON in the engine's field order, the same statuses and refusals. It is
// handed to the one client (client.ts) in place of the network, and the one wire-level suite
// (test/conformance.ts) runs against it and against legend-lite's server alike.
//
// What it cannot be is a server: its queries live in this browser only, and its user is the name
// the page was configured with, not someone signed in.

import type { Records } from './records.ts';
import { QUERY_PROFILE, type Query } from './wire.ts';

/** The API root the page's store answers at: never on the network (`fetch` below answers it). */
export const LOCAL_API = 'http://this-browser.invalid/api';

const VALID_ARTIFACT_ID = /^[a-z][a-z0-9_]*(-[a-z][a-z0-9_]*)*$/;
const JAVA_NAME = /^[A-Za-z_$][A-Za-z0-9_$]*(\.[A-Za-z_$][A-Za-z0-9_$]*)*$/;
const MAX_NUMBER_OF_QUERIES = 100;
const GET_QUERIES_LIMIT = 50;

/** The `Query` fields, in the engine's class order (its JSON's key order). */
const FIELDS = ['id', 'name', 'description', 'groupId', 'artifactId', 'versionId', 'originalVersionId',
  'executionContext', 'content', 'lastUpdatedAt', 'createdAt', 'lastOpenAt', 'deletedAt', 'validUntil', 'version',
  'taggedValues', 'stereotypes', 'defaultParameterValues', 'owner', 'gridConfig'] as const;
/** What a search answers without (the engine's EXCLUDED_PROJECTION_FIELDS). */
const NOT_IN_A_SEARCH: readonly string[] = ['validUntil', 'version', 'content', 'executionContext', 'taggedValues',
  'stereotypes', 'defaultParameterValues', 'gridConfig'];
/** The fields a client sets; the rest are the store's (audit). */
const CLIENT_FIELDS = ['id', 'name', 'description', 'groupId', 'artifactId', 'versionId', 'originalVersionId',
  'executionContext', 'content', 'taggedValues', 'stereotypes', 'defaultParameterValues', 'gridConfig'] as const;

/** The execution contexts served, each with its required fields and the engine's message for one missing. */
const CONTEXT_FIELDS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  explicitExecutionContext: {
    mapping: 'Query mapping is missing or empty',
    runtime: 'Query runtime is missing or empty',
  },
  dataSpaceExecutionContext: {
    dataSpacePath: 'Query data Space execution context dataSpace path is missing or empty',
  },
};

/** An `ApplicationQueryException`: its status and the engine's `{"message"}` body. */
class Refusal extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type Json = Record<string, unknown>;

export interface LocalServerOptions {
  readonly records: Records;
  /** Who this page's caller is: the page's configured user (there is no sign-in here). */
  readonly user: string;
  readonly clock?: () => number;
}

export interface LocalServer {
  /** One request to `LOCAL_API/pure/v1/query...`, answered as the server answers it. */
  handle(request: Request): Promise<Response>;
  /** The same, shaped as `fetch`: what the client is handed. */
  readonly fetch: typeof fetch;
}

const str = (o: Json, field: string): string | null => (typeof o[field] === 'string' ? o[field] as string : null);
const num = (o: Json, field: string, otherwise: number): number => (typeof o[field] === 'number' ? o[field] as number : otherwise);
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const nonNull = (o: Json, field: string): boolean => field in o && o[field] !== null && o[field] !== undefined;

const answer = (status: number, body: string): Response =>
  new Response(status === 204 ? null : body, { status, headers: { 'Content-Type': 'application/json' } });
const notFound = (rest: string): Response =>
  answer(404, JSON.stringify({ code: -1, message: `no such legend-engine API in legend-lite: /api/pure/v1/query${rest}`, status: 'error' }));

/** A query as the API writes it: every field in the engine's order, null when absent. */
function view(q: Json, blank: readonly string[]): Json {
  const out: Json = {};
  for (const f of FIELDS) out[f] = blank.includes(f) || !(f in q) || q[f] === undefined ? null : q[f];
  return out;
}

function clientFields(q: Json): Json {
  const out: Json = {};
  for (const f of CLIENT_FIELDS) out[f] = f in q && q[f] !== undefined ? q[f] : null;
  return out;
}

function ordered(fields: Json): Json {
  const out: Json = {};
  for (const f of FIELDS) out[f] = f in fields && fields[f] !== undefined ? fields[f] : null;
  return out;
}

/** The current version: the one with no `validUntil`. */
function current(versions: readonly Json[]): Json | undefined {
  return versions.find((v) => v['validUntil'] === null || v['validUntil'] === undefined);
}

/** The engine's `validateQuery`. */
function validate(q: Json): void {
  const nonEmpty = (o: Json, field: string, message: string): void => {
    const v = str(o, field);
    if (v === null || v === '') throw new Refusal(message, 400);
  };
  nonEmpty(q, 'id', 'Query ID is missing or empty');
  nonEmpty(q, 'name', 'Query name is missing or empty');
  nonEmpty(q, 'groupId', 'Query project group ID is missing or empty');
  nonEmpty(q, 'artifactId', 'Query project artifact ID is missing or empty');
  nonEmpty(q, 'versionId', 'Query project version is missing or empty');
  const ctx = q['executionContext'];
  if (isObject(ctx)) {
    const type = String(str(ctx, '_type'));
    const required = CONTEXT_FIELDS[type];
    if (!required) {
      throw new Refusal(`Query execution context of _type '${type}' is not served by legend-lite (${Object.keys(CONTEXT_FIELDS).join(', ')})`, 400);
    }
    for (const [field, message] of Object.entries(required)) nonEmpty(ctx, field, message);
  }
  nonEmpty(q, 'content', 'Query content is missing or empty');
  if (!JAVA_NAME.test(str(q, 'groupId')!)) throw new Refusal('Query project group ID is invalid', 400);
  if (!VALID_ARTIFACT_ID.test(str(q, 'artifactId')!)) throw new Refusal('Query project artifact ID is invalid', 400);
}

/** A tagged value's text: the wire writes it as a string (the engine's CString serializer). */
function taggedValueText(tv: Json): string | null {
  const v = tv['value'];
  if (typeof v === 'string') return v;
  if (isObject(v)) return str(v, 'value');
  return null;
}

function hasTaggedValue(q: Json, profile: string, tag: string, value: string | null): boolean {
  const tvs = q['taggedValues'];
  if (!Array.isArray(tvs)) return false;
  return tvs.some((tv: Json) => {
    const t = tv['tag'] as Json;
    return profile === str(t, 'profile') && tag === str(t, 'value') && value === taggedValueText(tv);
  });
}

function hasStereotype(q: Json, profile: string, value: string): boolean {
  const ss = q['stereotypes'];
  return Array.isArray(ss) && ss.some((s: Json) => profile === str(s, 'profile') && value === str(s, 'value'));
}

const containsIgnoreCase = (text: string | null, lowerNeedle: string): boolean => text !== null && text.toLowerCase().includes(lowerNeedle);

function matchesSearch(q: Json, spec: Json, user: string): boolean {
  const term = spec['searchTermSpecification'];
  if (isObject(term)) {
    const searchTerm = str(term, 'searchTerm');
    if (searchTerm === null) throw new Refusal('Query search spec expecting a search term', 500);
    const includeOwner = term['includeOwner'] === true;
    const owner = str(q, 'owner');
    if (term['exactMatchName'] === true) {
      if (!(searchTerm === str(q, 'name') || (includeOwner && searchTerm === owner))) return false;
    } else {
      const lower = searchTerm.toLowerCase();
      const hit = searchTerm === str(q, 'id') || containsIgnoreCase(str(q, 'name'), lower) || (includeOwner && containsIgnoreCase(owner, lower));
      if (!hit) return false;
    }
  }
  if (spec['showCurrentUserQueriesOnly'] === true) {
    const owner = str(q, 'owner');
    if (owner !== null && owner !== user) return false;
  }
  const coords = spec['projectCoordinates'];
  if (Array.isArray(coords) && coords.length > 0) {
    const any = coords.some((c: Json) => str(c, 'groupId') === str(q, 'groupId') && str(c, 'artifactId') === str(q, 'artifactId')
      && (str(c, 'version') === null || str(c, 'version') === str(q, 'versionId')));
    if (!any) return false;
  }
  const wanted = spec['taggedValues'];
  if (Array.isArray(wanted) && wanted.length > 0) {
    const all = spec['combineTaggedValuesCondition'] === true;
    let result = all;
    const dataSpaces: (string | null)[] = [];
    for (const tv of wanted as Json[]) {
      const tag = tv['tag'] as Json;
      const value = taggedValueText(tv);
      const has = hasTaggedValue(q, str(tag, 'profile')!, str(tag, 'value')!, value);
      result = all ? result && has : result || has;
      if (str(tag, 'profile') === QUERY_PROFILE && str(tag, 'value') === 'dataSpace') dataSpaces.push(value);
    }
    const ctx = q['executionContext'];
    if (dataSpaces.length > 0 && isObject(ctx) && str(ctx, '_type') === 'dataSpaceExecutionContext'
      && dataSpaces.includes(str(ctx, 'dataSpacePath'))) result = true;
    if (!result) return false;
  }
  const stereotypes = spec['stereotypes'];
  if (Array.isArray(stereotypes) && stereotypes.length > 0) {
    return stereotypes.some((s: Json) => hasStereotype(q, str(s, 'profile')!, str(s, 'value')!));
  }
  return true;
}

function queryParams(search: string, name: string): string[] {
  return new URLSearchParams(search).getAll(name);
}

/** The page's own query store, answering the API from `records` as `user`. */
export function localQueryServer(options: LocalServerOptions): LocalServer {
  const { records, user } = options;
  const clock = options.clock ?? Date.now;
  const versions = async (id: string): Promise<Json[]> => (await records.versions(id)) as unknown as Json[];
  const write = (id: string, vs: readonly Json[]): Promise<void> => records.put(id, vs as unknown as Query[]);

  // ONE CALL AT A TIME, as the server's `synchronized` methods: a read-modify-write is never interleaved
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(f: () => Promise<T>): Promise<T> => {
    const next = queue.then(f, f);
    queue = next.catch(() => undefined);
    return next;
  };

  const latestOfAll = async (): Promise<Json[]> => {
    const out = (await records.all()).map((vs) => current(vs as unknown as Json[])).filter((q): q is Json => q !== undefined);
    // the engine's natural order is insertion order: by creation
    return out.sort((a, b) => num(a, 'createdAt', 0) - num(b, 'createdAt', 0));
  };

  const search = async (spec: Json): Promise<Json[]> => {
    const matches = (await latestOfAll()).filter((q) => matchesSearch(q, spec, user));
    const sortBy = nonNull(spec, 'sortByOption') ? str(spec, 'sortByOption') : null;
    if (sortBy !== null) {
      const field = sortBy === 'SORT_BY_CREATE' ? 'createdAt' : sortBy === 'SORT_BY_VIEW' ? 'lastOpenAt' : sortBy === 'SORT_BY_UPDATE' ? 'lastUpdatedAt' : undefined;
      if (field === undefined) throw new TypeError('Unknown sort-by value');
      matches.sort((a, b) => num(b, field, Number.MIN_SAFE_INTEGER) - num(a, field, Number.MIN_SAFE_INTEGER));
    }
    const limit = nonNull(spec, 'limit') ? Number(spec['limit']) : null;
    if (limit !== null && limit <= 0) throw new Refusal('Limit should be greater than 0', 400);
    const limited = matches.slice(0, Math.min(MAX_NUMBER_OF_QUERIES, limit ?? Infinity));
    // the engine's last step: the current user's queries first, otherwise in order (a stable sort)
    limited.sort((a, b) => (str(a, 'owner') === user ? 0 : 1) - (str(b, 'owner') === user ? 0 : 1));
    return limited.map((q) => view(q, NOT_IN_A_SEARCH));
  };

  const batch = async (ids: readonly string[]): Promise<Json[]> => {
    if (ids.length > GET_QUERIES_LIMIT) throw new Refusal(`Can't fetch more than ${GET_QUERIES_LIMIT} queries`, 400);
    const out: Json[] = [];
    const notFound: string[] = [];
    for (const id of new Set(ids)) {
      const q = current(await versions(id));
      if (q === undefined) notFound.push(id);
      else out.push(view(q, []));
    }
    if (notFound.length > 0) throw new Refusal(`Can't find queries for the following ID(s):\n${[...new Set(notFound)].sort().join('\n')}`, 500);
    return out;
  };

  const get = async (id: string): Promise<Json> => {
    const vs = await versions(id);
    const q = current(vs);
    if (q === undefined) throw new Refusal(`Can't find query with ID '${id}'`, 404);
    const opened = { ...q, lastOpenAt: clock() };
    await write(id, vs.map((v) => (v === q ? opened : v)));
    return view(opened, []);
  };

  const history = async (id: string, version: number | null): Promise<Json[]> => {
    const vs = await versions(id);
    if (version !== null) {
      const v = vs.find((x) => x['version'] === version);
      if (v) return [view(v, [])];
      if (vs.length === 0) throw new Refusal(`Can't find query with ID '${id}'`, 404);
      throw new Refusal(`Can't find version '${version}' for query with ID '${id}'`, 404);
    }
    const out = vs.filter((v) => v['validUntil'] !== null && v['validUntil'] !== undefined).map((v) => view(v, []));
    if (out.length === 0 && current(vs) === undefined) throw new Refusal(`Can't find query with ID '${id}'`, 404);
    return out;
  };

  const create = async (query: Json): Promise<Json> => {
    validate(query);
    const id = str(query, 'id')!;
    const vs = await versions(id);
    if (current(vs) !== undefined) throw new Refusal(`Query with ID '${id}' already existed`, 400);
    const now = clock();
    const created = ordered({ ...clientFields(query), createdAt: now, lastUpdatedAt: now, lastOpenAt: now, version: 1, owner: user });
    await write(id, [...vs, created]);
    return view(created, []);
  };

  const newVersion = async (id: string, fields: Json): Promise<Json> => {
    const vs = await versions(id);
    const prior = current(vs);
    if (prior === undefined) throw new Refusal(`Can't find query with ID '${id}'`, 404);
    const owner = prior['owner'];
    if (owner !== null && owner !== undefined && owner !== user) throw new Refusal('Only owner can update the query', 403);
    const now = clock();
    const next = ordered({
      ...fields,
      createdAt: prior['createdAt'] ?? null,
      lastUpdatedAt: now,
      lastOpenAt: now,
      version: num(prior, 'version', 0) + 1,
      owner: owner === null || owner === undefined ? user : owner,
    });
    await write(id, [...vs.map((v) => (v === prior ? { ...v, validUntil: now } : v)), next]);
    return next;
  };

  const update = async (id: string, query: Json): Promise<Json> => {
    validate(query);
    if (id !== str(query, 'id')) throw new Refusal('Updating query ID is not supported', 400);
    return view(await newVersion(id, clientFields(query)), []);
  };

  const patch = async (id: string, fields: Json): Promise<Json> => {
    await get(id); // the engine patches what getQuery answers, which marks it opened
    const cur = current(await versions(id))!;
    const set = clientFields(cur);
    for (const f of CLIENT_FIELDS) if (nonNull(fields, f)) set[f] = fields[f];
    return view(await newVersion(id, set), []);
  };

  const remove = async (id: string): Promise<void> => {
    const vs = await versions(id);
    const q = current(vs);
    if (q === undefined) throw new Refusal(`Can't find query with ID '${id}'`, 404);
    const owner = q['owner'];
    if (owner !== null && owner !== undefined && owner !== user) throw new Refusal('Only owner can delete the query', 403);
    const now = clock();
    await write(id, vs.map((v) => (v === q ? { ...v, deletedAt: now, validUntil: now } : v)));
  };

  const route = async (method: string, rest: string, params: string, body: string): Promise<Response> => {
    const parts = rest === '' ? [] : rest.slice(1).split('/');
    const id = parts.length > 0 ? decodeURIComponent(parts[0]!) : '';
    if (parts[0] === 'dataCube') return notFound(rest);
    const json = (): Json => JSON.parse(body) as Json;
    const ok = (v: unknown): Response => answer(200, JSON.stringify(v));
    switch (`${method} ${parts.length} ${parts.length > 1 ? parts[1] : ''}`) {
      case 'POST 0 ': return ok(await create(json()));
      case 'POST 1 ': return id === 'search' ? ok(await search(JSON.parse(body.trim() === '' ? '{}' : body) as Json)) : notFound(rest);
      case 'GET 1 ': return id === 'batch' ? ok(await batch(queryParams(params, 'queryIds'))) : ok(await get(id));
      case 'PUT 1 ': return ok(await update(id, json()));
      case 'DELETE 1 ':
        await remove(id);
        return answer(204, '');
      case 'GET 2 history': {
        const v = queryParams(params, 'version');
        return ok(await history(id, v.length === 0 ? null : Number.parseInt(v[0]!, 10)));
      }
      case 'PUT 2 patchQuery': return ok(await patch(id, json()));
      default: return notFound(rest);
    }
  };

  const handle = async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const at = url.pathname.indexOf('/pure/v1/query');
    if (at < 0) {
      return answer(404, JSON.stringify({ code: -1, message: `no such API in this page's query store: ${url.pathname}`, status: 'error' }));
    }
    const rest = url.pathname.slice(at + '/pure/v1/query'.length);
    const body = request.method === 'GET' || request.method === 'DELETE' ? '' : await request.text();
    return serial(async () => {
      try {
        return await route(request.method, rest, url.search, body);
      } catch (e) {
        if (e instanceof Refusal) return answer(e.status, JSON.stringify({ message: e.message }));
        // a body that is not the JSON the engine takes: the engine's 500, naming the error
        const name = e instanceof Error ? e.name : 'Error';
        return answer(500, JSON.stringify({ code: -1, message: `${name}: ${e instanceof Error ? e.message : String(e)}`, status: 'error' }));
      }
    });
  };

  return {
    handle,
    fetch: ((input: RequestInfo | URL, init?: RequestInit) => handle(new Request(input, init))) as typeof fetch,
  };
}
