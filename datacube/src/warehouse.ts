// The warehouse as a QueryEngine: SQL runs on the server, as the signed-in
// user, and comes back as the same ResultTable the local plane produces.
//
// The LIVE plane of a warehouse source (docs/WAREHOUSE_D1_DESIGN_2026_09_26.md).
// Snapping copies what the user may read into DuckDB-WASM and runs there, so
// Live and Snap are one cube on two engines, one planner above both.
//
// The client below speaks the warehouse's HTTP SQL API. Its reference is the
// Java binding every JVM client uses (warehouse/.../sqlapi/NativeBinding.java):
// the same requests, the same states, the same close-after-reading. The API is
// ours and two clients speak it; both are held to the real server in the chain
// (the warehouse suite; the Live-versus-Snap test), and a spec replaces this
// hand spelling the day a third client or an outside user appears.
//
// Results are Arrow IPC streams, one per chunk, read by Arrow JS -- the
// library DuckDB-WASM's own results come from -- and handed to the same
// `toRawTable` the local plane uses. Measured: for every type the warehouse
// returns, the cells are identical to DuckDB-WASM's (the D1 homework, H2).

import { Table, tableFromIPC, type RecordBatch } from 'apache-arrow';

import { QueryError, typedByPlan, type QueryEngine, type RawTable } from './engine.ts';
import type { Plan } from './relation-type.ts';
import { toRawTable, type ArrowishTable } from './duckdb.ts';
import type { ResultTable } from './result.ts';

/** A signed-in session: where the warehouse is, and the bearer token. */
export interface WarehouseSession {
  /** e.g. `https://warehouse.example.com` (no trailing slash needed). */
  readonly baseUrl: string;
  readonly token: string;
  /** Who the server says the token is. */
  readonly principal: string;
  readonly expiresAt: string;
}

/** One table or view the user may read (the catalog call; W2 filters it). */
export interface CatalogObject {
  readonly schema: string;
  readonly name: string;
  readonly kind: string;
  /** DuckDB's names for the column types, which `inferModel` reads. */
  readonly columns: readonly { readonly name: string; readonly type: string }[];
}

interface ApiError {
  readonly code: string;
  readonly message: string;
}

interface StatementStatus {
  readonly statementId: string;
  readonly state: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  readonly result?: { readonly rowCount: number; readonly chunkCount: number };
  readonly error?: ApiError;
}

/** How long one poll may wait on the server (NativeBinding's pollWaitMs). */
const POLL_WAIT_MS = 10_000;
/** Rows per Arrow chunk: whole DuckDB batches of 2,048 each. */
const ROWS_PER_CHUNK = 100_000;
const TIMEOUT_MS = 300_000;

function url(base: string, path: string): string {
  return base.replace(/\/+$/, '') + path;
}

/** The API's own error, when a failed reply carries one; else the status line. */
async function failure(r: Response): Promise<string> {
  const text = await r.text();
  try {
    const e = (JSON.parse(text) as { error?: ApiError }).error;
    if (e) return `${e.code}: ${e.message}`;
  } catch {
    // not one of ours (a proxy's page, say): fall through
  }
  return `HTTP ${r.status}${text ? `: ${text.slice(0, 200)}` : ''}`;
}

/**
 * Sign in and get a token. The DEVELOPMENT sign-in: the warehouse's own
 * user list (`--user name:password`). The password is sent once and not kept;
 * only the token is. Production replaces this with the company's single
 * sign-on, whose token the warehouse verifies -- nothing else here changes.
 */
export async function signIn(baseUrl: string, user: string, password: string): Promise<WarehouseSession> {
  const r = await fetch(url(baseUrl, '/sql/v1/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user, password }),
  });
  if (!r.ok) throw new Error(`sign-in failed — ${await failure(r)}`);
  const t = await r.json() as { token: string; expiresAt: string; principal: string };
  return { baseUrl, token: t.token, principal: t.principal, expiresAt: t.expiresAt };
}

/** What the user may read in `catalog`: tables and views, with their columns. */
export async function listObjects(session: WarehouseSession, catalog = 'main'): Promise<CatalogObject[]> {
  const r = await fetch(url(session.baseUrl, `/sql/v1/catalogs/${catalog}/objects`), {
    headers: { Authorization: `Bearer ${session.token}` },
  });
  if (!r.ok) throw new Error(`could not list the catalog — ${await failure(r)}`);
  return await r.json() as CatalogObject[];
}

/**
 * Sign in AND list what the user may read, as one step: the session comes back only with its
 * own tables. Signing in, then listing separately, left one user's table list beside another
 * user's session when the listing failed (P2-334).
 */
export async function connect(baseUrl: string, user: string, password: string, catalog = 'main'):
Promise<{ readonly session: WarehouseSession; readonly objects: CatalogObject[] }> {
  const session = await signIn(baseUrl, user, password);
  const objects = await listObjects(session, catalog);
  return { session, objects };
}

export class WarehouseEngine implements QueryEngine {
  readonly name = 'warehouse';
  /** Renewed in place when the same user signs in again (`renew`). */
  #session: WarehouseSession;
  readonly #catalog: string;

  constructor(session: WarehouseSession, catalog = 'main') {
    this.#session = session;
    this.#catalog = catalog;
  }

  /** The signed-in user, for the plane badge. */
  get principal(): string {
    return this.#session.principal;
  }

  /**
   * A fresh token for the SAME user at the same warehouse: the open cube goes on with it. The
   * engine kept the token it was built with for its whole life, so signing in again after
   * expiry -- as the error asked -- never reached the cube (P2-297). Anyone else's session is
   * refused: what a cube reads is its user's, and it never changes hands quietly.
   */
  renew(session: WarehouseSession): void {
    if (session.principal !== this.#session.principal
      || session.baseUrl.replace(/\/+$/, '') !== this.#session.baseUrl.replace(/\/+$/, '')) {
      throw new Error(`this cube reads the warehouse as ${this.#session.principal}; `
        + `signed in as ${session.principal}, open a table to work as ${session.principal}`);
    }
    this.#session = session;
  }

  /**
   * Run `sql` on the warehouse and return its rows as the local plane would.
   *
   * `signal` aborts at once: the in-flight request stops and the statement is
   * cancelled on the server.
   */
  async execute(plan: Plan, epoch: number, signal?: AbortSignal): Promise<ResultTable> {
    return typedByPlan(await this.run(plan.sql, epoch, signal), plan);
  }

  /** A planned query's rows chunk by chunk, as the server wrote them (its Arrow chunks). */
  async stream(
    plan: Plan,
    epoch: number,
    onChunk: (chunk: ResultTable) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const started = performance.now();
    try {
      for await (const bytes of this.arrowChunks(plan.sql, signal)) {
        const table = tableFromIPC(bytes) as unknown as ArrowishTable;
        onChunk(typedByPlan(toRawTable(table, epoch, performance.now() - started), plan));
      }
    } catch (error: unknown) {
      if (signal?.aborted || error instanceof QueryError) throw error;
      throw new QueryError(error instanceof Error ? error.message : String(error), plan.sql, { cause: error });
    }
  }

  async run(sql: string, epoch: number, signal?: AbortSignal): Promise<RawTable> {
    const started = performance.now();
    const batches: RecordBatch[] = [];
    try {
      for await (const bytes of this.arrowChunks(sql, signal)) {
        batches.push(...tableFromIPC(bytes).batches);
      }
    } catch (error: unknown) {
      if (signal?.aborted) throw error;
      throw new QueryError(error instanceof Error ? error.message : String(error), sql, { cause: error });
    }
    const table = new Table(batches) as unknown as ArrowishTable;
    return toRawTable(table, epoch, performance.now() - started);
  }

  /**
   * The result of `sql` as the server wrote it: one Arrow IPC stream per chunk,
   * in order. What a snap loads into DuckDB-WASM as it is, unconverted.
   * The statement is closed once every chunk is read, so the server frees it.
   */
  async *arrowChunks(sql: string, signal?: AbortSignal): AsyncGenerator<Uint8Array> {
    let status = await this.#call<StatementStatus>('POST', '/sql/v1/statements', signal, {
      sql,
      catalog: this.#catalog,
      timeoutMs: TIMEOUT_MS,
      waitMs: POLL_WAIT_MS,
      rowsPerChunk: ROWS_PER_CHUNK,
      resultFormat: 'arrow',
    });
    const id = status.statementId;
    try {
      while (status.state === 'queued' || status.state === 'running') {
        status = await this.#call<StatementStatus>('GET', `/sql/v1/statements/${id}?waitMs=${POLL_WAIT_MS}`, signal);
      }
      if (status.state !== 'succeeded') {
        const e = status.error;
        throw new Error(e ? `${e.code}: ${e.message}` : `the statement ended ${status.state}`);
      }
      const chunks = status.result?.chunkCount ?? 0;
      for (let i = 0; i < chunks; i++) {
        const r = await fetch(url(this.#session.baseUrl, `/sql/v1/statements/${id}/chunks/${i}`), {
          headers: this.#auth(),
          ...(signal ? { signal } : {}),
        });
        if (!r.ok) throw new Error(await failure(r));
        yield new Uint8Array(await r.arrayBuffer());
      }
      // every chunk read: the server may free the result now, not at expiry
      await fetch(url(this.#session.baseUrl, `/sql/v1/statements/${id}`), { method: 'DELETE', headers: this.#auth() });
    } catch (error: unknown) {
      if (signal?.aborted) {
        // stop the server's work too; the page has already moved on
        void fetch(url(this.#session.baseUrl, `/sql/v1/statements/${id}/cancel`), {
          method: 'POST', headers: this.#auth(),
        }).catch(() => undefined);
      }
      throw error;
    }
  }

  async close(): Promise<void> {
    // nothing held open: every statement is closed as it finishes
  }

  #auth(): Record<string, string> {
    return { Authorization: `Bearer ${this.#session.token}` };
  }

  async #call<T>(method: string, path: string, signal?: AbortSignal, body?: unknown): Promise<T> {
    const r = await fetch(url(this.#session.baseUrl, path), {
      method,
      headers: body === undefined ? this.#auth() : { ...this.#auth(), 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      ...(signal ? { signal } : {}),
    });
    if (r.status === 401) throw new Error('the warehouse session has expired — sign in again');
    if (!r.ok && r.status !== 202) throw new Error(await failure(r));
    return await r.json() as T;
  }
}
