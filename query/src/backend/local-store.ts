// The query store with no server: upstream's `/pure/v1/query` rules (legend-lite's SavedQueries
// ports them from the engine's QueryStoreManager), kept in this browser's IndexedDB. Same `Query`
// records, same refusals, so a page moves between it and a server's store without a change above.
//
// Every version of a query is kept: an update is a new version and the old one its history; a
// delete keeps the history; only the owner updates, patches or deletes.

import { EngineError, type QueryStore } from './engine.ts';
import { QUERY_PROFILE, type Query, type QuerySearchSpecification } from './wire.ts';

/** A stored version: the query and, once replaced or deleted, when it stopped being current. */
interface Version {
  readonly query: Query;
  readonly validUntil: number | null;
  readonly deletedAt: number | null;
}

/** Where versions live: IndexedDB in a browser, a Map in a test. */
export interface Records {
  versions(id: string): Promise<Version[]>;
  put(id: string, versions: readonly Version[]): Promise<void>;
  all(): Promise<Version[][]>;
}

export class MemoryRecords implements Records {
  readonly #data = new Map<string, Version[]>();
  async versions(id: string): Promise<Version[]> { return [...(this.#data.get(id) ?? [])]; }
  async put(id: string, versions: readonly Version[]): Promise<void> { this.#data.set(id, [...versions]); }
  async all(): Promise<Version[][]> { return [...this.#data.values()].map((v) => [...v]); }
}

const DB = 'legend-query';
const STORE = 'queries';

export class BrowserRecords implements Records {
  readonly #db: Promise<IDBDatabase>;

  constructor(factory: IDBFactory = globalThis.indexedDB) {
    this.#db = new Promise((resolve, reject) => {
      const open = factory.open(DB, 1);
      open.onupgradeneeded = () => open.result.createObjectStore(STORE);
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error ?? new Error('IndexedDB could not open'));
    });
  }

  async #request<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.#db;
    return new Promise((resolve, reject) => {
      const r = f(db.transaction(STORE, mode).objectStore(STORE));
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error ?? new Error('IndexedDB request failed'));
    });
  }

  async versions(id: string): Promise<Version[]> {
    return ((await this.#request('readonly', (s) => s.get(id))) as Version[] | undefined) ?? [];
  }

  async put(id: string, versions: readonly Version[]): Promise<void> {
    await this.#request('readwrite', (s) => s.put(versions, id));
  }

  async all(): Promise<Version[][]> {
    return (await this.#request('readonly', (s) => s.getAll())) as Version[][];
  }
}

const MAX_NUMBER_OF_QUERIES = 100;
const GET_QUERIES_LIMIT = 50;
const VALID_ARTIFACT_ID = /^[a-z][a-z0-9_]*(-[a-z][a-z0-9_]*)*$/;
const JAVA_NAME = /^[A-Za-z_$][A-Za-z0-9_$]*(\.[A-Za-z_$][A-Za-z0-9_$]*)*$/;

/** The fields a search answers without (the engine's EXCLUDED_PROJECTION_FIELDS). */
const NOT_IN_A_SEARCH = ['version', 'content', 'executionContext', 'taggedValues', 'stereotypes', 'defaultParameterValues', 'gridConfig'] as const;

function refuse(message: string, status: number): never {
  throw new EngineError(message, status);
}

function current(versions: readonly Version[]): Version | undefined {
  return versions.find((v) => v.validUntil === null);
}

/** The engine's `validateQuery`. */
function validate(q: Query): void {
  const nonEmpty = (v: string | null | undefined, message: string): void => { if (!v) refuse(message, 400); };
  nonEmpty(q.id, 'Query ID is missing or empty');
  nonEmpty(q.name, 'Query name is missing or empty');
  nonEmpty(q.groupId, 'Query project group ID is missing or empty');
  nonEmpty(q.artifactId, 'Query project artifact ID is missing or empty');
  nonEmpty(q.versionId, 'Query project version is missing or empty');
  const ctx = q.executionContext;
  if (ctx?._type === 'explicitExecutionContext') {
    nonEmpty(ctx.mapping, 'Query mapping is missing or empty');
    nonEmpty(ctx.runtime, 'Query runtime is missing or empty');
  } else if (ctx?._type === 'dataSpaceExecutionContext') {
    nonEmpty(ctx.dataSpacePath, 'Query data Space execution context dataSpace path is missing or empty');
  }
  nonEmpty(q.content, 'Query content is missing or empty');
  if (!JAVA_NAME.test(q.groupId)) refuse('Query project group ID is invalid', 400);
  if (!VALID_ARTIFACT_ID.test(q.artifactId)) refuse('Query project artifact ID is invalid', 400);
}

export class LocalQueryStore implements QueryStore {
  readonly #records: Records;
  readonly #user: string;
  readonly #clock: () => number;

  constructor(records: Records, user: string, clock: () => number = Date.now) {
    this.#records = records;
    this.#user = user;
    this.#clock = clock;
  }

  async search(spec: QuerySearchSpecification): Promise<Query[]> {
    if (spec.limit !== undefined && spec.limit <= 0) refuse('Limit should be greater than 0', 400);
    const term = spec.searchTermSpecification;
    let found = (await this.#records.all())
      .map(current)
      .filter((v): v is Version => v !== undefined)
      .map((v) => v.query)
      .filter((q) => {
        if (term) {
          const hit = term.exactMatchName
            ? q.name === term.searchTerm || (term.includeOwner === true && q.owner === term.searchTerm)
            : q.id === term.searchTerm || q.name.toLowerCase().includes(term.searchTerm.toLowerCase())
              || (term.includeOwner === true && (q.owner ?? '').toLowerCase().includes(term.searchTerm.toLowerCase()));
          if (!hit) return false;
        }
        if (spec.showCurrentUserQueriesOnly && q.owner && q.owner !== this.#user) return false;
        if (spec.projectCoordinates?.length && !spec.projectCoordinates.some((c) =>
          c.groupId === q.groupId && c.artifactId === q.artifactId && (c.version === undefined || c.version === q.versionId))) return false;
        if (spec.taggedValues?.length) {
          const has = (tv: { tag: { profile: string; value: string }; value: string }): boolean =>
            (q.taggedValues ?? []).some((x) => x.tag.profile === tv.tag.profile && x.tag.value === tv.tag.value && x.value === tv.value)
            || (tv.tag.profile === QUERY_PROFILE && tv.tag.value === 'dataSpace'
              && q.executionContext?._type === 'dataSpaceExecutionContext' && q.executionContext.dataSpacePath === tv.value);
          const ok = spec.combineTaggedValuesCondition ? spec.taggedValues.every(has) : spec.taggedValues.some(has);
          if (!ok) return false;
        }
        if (spec.stereotypes?.length && !spec.stereotypes.some((s) => (q.stereotypes ?? []).some((x) => x.profile === s.profile && x.value === s.value))) return false;
        return true;
      })
      .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
    const field = spec.sortByOption === 'SORT_BY_CREATE' ? 'createdAt' : spec.sortByOption === 'SORT_BY_VIEW' ? 'lastOpenAt'
      : spec.sortByOption === 'SORT_BY_UPDATE' ? 'lastUpdatedAt' : undefined;
    if (field) found.sort((a, b) => (b[field] ?? 0) - (a[field] ?? 0));
    found = found.slice(0, Math.min(MAX_NUMBER_OF_QUERIES, spec.limit ?? Infinity));
    found.sort((a, b) => (a.owner === this.#user ? 0 : 1) - (b.owner === this.#user ? 0 : 1));
    return found.map((q) => {
      const light: Record<string, unknown> = { ...q };
      for (const f of NOT_IN_A_SEARCH) light[f] = null;
      return light as unknown as Query;
    });
  }

  async batch(ids: readonly string[]): Promise<Query[]> {
    if (ids.length > GET_QUERIES_LIMIT) refuse(`Can't fetch more than ${GET_QUERIES_LIMIT} queries`, 400);
    const out: Query[] = [];
    const missing: string[] = [];
    for (const id of new Set(ids)) {
      const v = current(await this.#records.versions(id));
      if (v) out.push(v.query); else missing.push(id);
    }
    if (missing.length > 0) refuse(`Can't find queries for the following ID(s):\n${missing.sort().join('\n')}`, 500);
    return out;
  }

  async get(id: string): Promise<Query> {
    const versions = await this.#records.versions(id);
    const v = current(versions);
    if (!v) refuse(`Can't find query with ID '${id}'`, 404);
    const opened: Version = { ...v, query: { ...v.query, lastOpenAt: this.#clock() } };
    await this.#records.put(id, versions.map((x) => (x === v ? opened : x)));
    return opened.query;
  }

  async history(id: string): Promise<Query[]> {
    const versions = await this.#records.versions(id);
    if (versions.length === 0) refuse(`Can't find query with ID '${id}'`, 404);
    return versions.filter((v) => v.validUntil !== null).map((v) => v.query);
  }

  async create(query: Query): Promise<Query> {
    validate(query);
    const versions = await this.#records.versions(query.id);
    if (current(versions)) refuse(`Query with ID '${query.id}' already existed`, 400);
    const now = this.#clock();
    const created: Query = { ...query, createdAt: now, lastUpdatedAt: now, lastOpenAt: now, version: 1, owner: this.#user };
    await this.#records.put(query.id, [...versions, { query: created, validUntil: null, deletedAt: null }]);
    return created;
  }

  async update(query: Query): Promise<Query> {
    validate(query);
    return this.#newVersion(query.id, query);
  }

  async patch(id: string, fields: Partial<Query>): Promise<Query> {
    const cur = await this.get(id);
    // only the fields the patch sets (the engine copies every non-null field over)
    const set = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== null && v !== undefined));
    return this.#newVersion(id, { ...cur, ...set });
  }

  async delete(id: string): Promise<void> {
    const versions = await this.#records.versions(id);
    const v = current(versions);
    if (!v) refuse(`Can't find query with ID '${id}'`, 404);
    if (v.query.owner && v.query.owner !== this.#user) refuse('Only owner can delete the query', 403);
    const now = this.#clock();
    await this.#records.put(id, versions.map((x) => (x === v ? { ...x, validUntil: now, deletedAt: now } : x)));
  }

  async #newVersion(id: string, query: Query): Promise<Query> {
    const versions = await this.#records.versions(id);
    const prior = current(versions);
    if (!prior) refuse(`Can't find query with ID '${id}'`, 404);
    if (prior.query.owner && prior.query.owner !== this.#user) refuse('Only owner can update the query', 403);
    const now = this.#clock();
    const next: Query = {
      ...query, id, createdAt: prior.query.createdAt ?? now, lastUpdatedAt: now, lastOpenAt: now,
      version: (prior.query.version ?? 0) + 1, owner: prior.query.owner ?? this.#user,
    };
    await this.#records.put(id, [...versions.map((x) => (x === prior ? { ...x, validUntil: now } : x)),
      { query: next, validUntil: null, deletedAt: null }]);
    return next;
  }
}
