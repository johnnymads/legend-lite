// Where the page's own store keeps its queries: every version of each, as legend-lite's
// `SavedQueries.java` keeps them in a file per query -- the current version the one whose
// `validUntil` is null. IndexedDB in a browser, a Map in a test.

import type { Query } from './wire.ts';

/** The versions of each query, by id. */
export interface Records {
  versions(id: string): Promise<Query[]>;
  put(id: string, versions: readonly Query[]): Promise<void>;
  all(): Promise<Query[][]>;
}

export class MemoryRecords implements Records {
  readonly #data = new Map<string, Query[]>();
  async versions(id: string): Promise<Query[]> { return [...(this.#data.get(id) ?? [])]; }
  async put(id: string, versions: readonly Query[]): Promise<void> { this.#data.set(id, [...versions]); }
  async all(): Promise<Query[][]> { return [...this.#data.values()].map((v) => [...v]); }
}

/** The database every app on this origin shares: one name, one layout, defined here only. */
export const DATABASE = 'legend-query';
const STORE = 'queries';
/**
 * 2: each version is the record itself (`validUntil`, `deletedAt` on it), as legend-lite keeps
 * them. 1 (the Query app's first layout) wrapped it: `{query, validUntil, deletedAt}` -- moved
 * over on upgrade, never dropped.
 */
const LAYOUT = 2;

export class BrowserRecords implements Records {
  readonly #db: Promise<IDBDatabase>;

  constructor(factory: IDBFactory = globalThis.indexedDB) {
    this.#db = new Promise((resolve, reject) => {
      const open = factory.open(DATABASE, LAYOUT);
      open.onupgradeneeded = (e) => {
        const db = open.result;
        if (e.oldVersion < 1) {
          db.createObjectStore(STORE);
          return;
        }
        if (e.oldVersion < 2) {
          const store = open.transaction!.objectStore(STORE);
          const cursor = store.openCursor();
          cursor.onsuccess = () => {
            const c = cursor.result;
            if (!c) return;
            const old = c.value as readonly { query: Query; validUntil: number | null; deletedAt: number | null }[];
            c.update(old.map((v) => ({ ...v.query, validUntil: v.validUntil, deletedAt: v.deletedAt })));
            c.continue();
          };
        }
      };
      // ANOTHER APP on this origin opening a newer layout: let it, rather than block it until
      // this tab closes; this tab's next call says the store must be reloaded
      open.onsuccess = () => {
        const db = open.result;
        db.onversionchange = () => db.close();
        resolve(db);
      };
      open.onblocked = () => reject(new Error('the saved queries are open in another tab of an older version: close it and reload'));
      open.onerror = () => reject(open.error ?? new Error('IndexedDB could not open'));
    });
  }

  async #request<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.#db;
    return new Promise((resolve, reject) => {
      let r: IDBRequest<T>;
      try {
        r = f(db.transaction(STORE, mode).objectStore(STORE));
      } catch (e) {
        // closed by a newer layout elsewhere (onversionchange)
        reject(new Error(`the saved queries were upgraded by another tab: reload this page (${e instanceof Error ? e.message : String(e)})`));
        return;
      }
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error ?? new Error('IndexedDB request failed'));
    });
  }

  async versions(id: string): Promise<Query[]> {
    return ((await this.#request('readonly', (s) => s.get(id))) as Query[] | undefined) ?? [];
  }

  async put(id: string, versions: readonly Query[]): Promise<void> {
    await this.#request('readwrite', (s) => s.put(versions, id));
  }

  async all(): Promise<Query[][]> {
    return (await this.#request('readonly', (s) => s.getAll())) as Query[][];
  }
}
