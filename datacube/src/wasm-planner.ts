// The planner, in the browser: Pure grammar out, SQL back, no server.
//
// This is the SAME planner as `UpstreamPlanner`, not a second one.
// That client POSTs to legend-lite's `pure/v1/execution/generatePlan`, whose handler calls
// `Compiler.plan(model, query, runtime)`; this one calls that exact
// method inside a WebAssembly build of legend-lite. Only the transport
// differs, which is the whole point -- a TypeScript reimplementation
// would be a second thing that has to agree with the first about null
// ordering, type coercion and aggregate semantics.
//
// Verified: a 69-query differential (wasm/differential.mjs)
// runs the same corpus through the WASM module and through the JVM and
// compares every answer, refusals included. 69/69 byte-identical --
// same SQL, same exception class, same message, same source positions.
//
// What this buys: the cached-client plane stops needing a server at
// all. Snapshot -> Pure -> SQL -> DuckDB-WASM, entirely in the tab.
//
// What it costs: ~1.5 MB gzipped of module, and roughly 4x the JVM's
// planning time -- about 10ms per plan rather than 2.5ms. DataCube
// plans once per user action, not per keystroke, so 10ms sits far
// inside a frame budget. The cold cost is the one to design around:
// the first plan pays ~550ms for class initialisation and parsing the
// Pure prelude, which is why `warmUp()` exists and why the demo calls
// it while the user is still looking at an empty grid.

import type { Planner } from './cube.ts';
import type { CatalogDatabase, CatalogTable } from './infer.ts';
import { PlanError } from './planner.ts';
import { relationColumns, type Plan, type PlanColumn } from './relation-type.ts';
import type { LevelScope } from './serialize.ts';
import type { CubeSnapshot } from './snapshot.ts';

/** The subset of TeaVM's module surface this file uses. */
interface TeavmModule {
  readonly exports: {
    planOrError(model: string, query: string, runtime: string): string;
    relationTypeOrError(model: string, query: string): string;
    databaseFromCatalogOrError(catalog: string): string;
    planJsonOrError(model: string, lambdaJson: string, runtime: string): string;
    relationTypeJsonOrError(model: string, lambdaJson: string): string;
    composeLambdaOrError(lambdaJson: string, style: string): string;
    lambdaJsonOrError(text: string): string;
    warmModel(model: string): number;
  };
}

interface TeavmRuntime {
  load(
    src: string,
    options?: {
      stackDeobfuscator?: { enabled: boolean };
      installImports?(imports: Record<string, unknown>): void;
    },
  ): Promise<TeavmModule>;
}

export interface WasmPlannerOptions {
  /** Pure model source: database, connection, runtime. */
  readonly model: string;
  /** Runtime to plan against, e.g. 'trades::RT'. */
  readonly runtime: string;
  /**
   * Directory holding `classes.wasm` and `wasm-gc-module-runtime.js`,
   * as `bazel build //datacube:site` copies them. Trailing slash optional.
   */
  readonly assetBaseUrl?: string;
  /**
   * Cache plans by grammar text. Safe because planning is pure: the
   * same grammar and runtime always lower to the same SQL. Worth it
   * because scrolling re-issues structurally identical queries.
   */
  readonly cache?: boolean;
  /** Injectable for tests; defaults to a dynamic import of the URL. */
  readonly loadRuntime?: (url: string) => Promise<TeavmRuntime>;
  /**
   * Run the module on a WORKER, loaded from this URL.
   *
   * Strongly preferred in a browser. Building the boot layer is
   * ~600ms of synchronous WebAssembly with no yield point, so on the
   * main thread it is a visible freeze — and measurably worse than
   * that: starting it early to "overlap" DuckDB instead starved
   * DuckDB's own startup, pushing it from 409ms to 1038ms and making
   * the page slower. Two tasks do not overlap when one never yields.
   *
   * Omit it off the browser, where there is no UI to block: the Node
   * differential harnesses run the module in-thread.
   */
  readonly workerUrl?: string;
}

/**
 * Thrown when the module itself cannot be loaded.
 *
 * <p>Deliberately NOT a `PlanError`. A `PlanError` means the planner
 * answered and the answer was a refusal -- the user's query is wrong,
 * and the message is worth showing them. This means the planner never
 * ran, which is an operational fault: a missing asset, a browser
 * without WASM-GC. Collapsing the two would file every failed deploy
 * as a bad query.
 */
export class PlannerUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'PlannerUnavailableError';
  }
}

export class WasmPlanner implements Planner {
  #options: WasmPlannerOptions;
  readonly #cache = new Map<string, Plan>();
  readonly #types = new Map<string, PlanColumn[]>();
  #module: Promise<TeavmModule> | undefined;
  #worker: Worker | undefined;
  readonly #pending = new Map<number, {
    resolve(answer: string): void;
    reject(e: unknown): void;
  }>();
  #nextId = 1;

  constructor(options: WasmPlannerOptions) {
    this.#options = options;
  }

  /** True when the module should run off the main thread. */
  #useWorker(): boolean {
    return this.#options.workerUrl !== undefined
      && typeof Worker !== 'undefined';
  }

  #ensureWorker(): Worker {
    if (this.#worker) return this.#worker;
    const w = new Worker(this.#options.workerUrl!, { type: 'module' });
    w.onmessage = (e: MessageEvent<{
      id: number; ok: boolean; answer?: string; error?: string;
    }>) => {
      const waiting = this.#pending.get(e.data.id);
      if (!waiting) return;
      this.#pending.delete(e.data.id);
      if (e.data.ok) waiting.resolve(e.data.answer ?? '');
      else {
        waiting.reject(new PlannerUnavailableError(
          `the planner worker failed: ${e.data.error}`));
      }
    };
    w.onerror = (e: ErrorEvent) => {
      // A worker that dies takes every in-flight request with it, and
      // leaving them pending would hang the grid rather than fail it.
      const dead = new PlannerUnavailableError(
        `the planner worker died: ${e.message}`);
      for (const waiting of this.#pending.values()) waiting.reject(dead);
      this.#pending.clear();
      this.#worker = undefined;
    };
    this.#worker = w;
    return w;
  }

  #ask(request: Record<string, unknown>): Promise<string> {
    const w = this.#ensureWorker();
    const id = this.#nextId++;
    return new Promise<string>((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      w.postMessage({ ...request, id, base: this.#base() });
    });
  }

  /** Release the worker. The grid owns one planner for its lifetime,
   *  so this is for tests and for a host that tears a cube down. */
  dispose(): void {
    this.#worker?.terminate();
    this.#worker = undefined;
    this.#pending.clear();
  }

  /**
   * Where `classes.wasm` and the TeaVM runtime live, as an absolute URL.
   *
   * A relative specifier would be ambiguous and quietly wrong: dynamic
   * `import()` resolves one against the IMPORTING MODULE, while
   * `WebAssembly` fetches resolve against the document. Bundled into
   * `demo/bundle.js` those are the same place; in a source tree they
   * are not, and the two halves of the module would load from
   * different directories. Resolving against the document (or, off
   * the browser, the process's working directory) gives one answer
   * for both.
   */
  #base(): string {
    const raw = this.#options.assetBaseUrl ?? './vendor/';
    const withSlash = raw.endsWith('/') ? raw : `${raw}/`;
    const doc = (globalThis as { document?: { baseURI?: string } }).document;
    const cwd = (globalThis as { process?: { cwd(): string } }).process?.cwd();
    const against = doc?.baseURI
      ?? (globalThis as { location?: { href?: string } }).location?.href
      // A DIRECTORY URL for the working directory. Spelled by
      // `pathToFileUrl`, not `file://${cwd}`: on Windows that gives
      // `file://C:\x\y/`, a URL whose HOST is `c` -- the base every
      // asset then resolved against.
      ?? (cwd === undefined ? 'file:///' : pathToFileUrl(`${cwd}/`, onWindows()));
    try {
      return new URL(withSlash, against).href;
    } catch {
      return withSlash;
    }
  }

  /**
   * Load and instantiate the module, at most once.
   *
   * The promise is memoised rather than a `loaded` boolean, so that
   * concurrent first calls -- which is exactly what an initial render
   * produces -- share one 4 MB fetch instead of racing several.
   */
  #load(): Promise<TeavmModule> {
    if (this.#module) return this.#module;
    const base = this.#base();
    const runtimeUrl = `${base}wasm-gc-module-runtime.js`;
    // TeaVM's loader branches on the host: in a browser it fetches the
    // string, under Node it opens it as a FILESYSTEM PATH. A file: URL
    // therefore works for the `import()` above and fails for this,
    // with an ENOENT that surfaces as "could not instantiate" and
    // reads like a missing WASM-GC feature. Hand each the form it
    // actually takes.
    const wasmUrl = base.startsWith('file:')
      ? fileUrlToPath(`${base}classes.wasm`, onWindows())
      : `${base}classes.wasm`;
    const importRuntime = this.#options.loadRuntime
      ?? ((url: string) => import(/* @vite-ignore */ url) as Promise<TeavmRuntime>);

    this.#module = (async () => {
      let runtime: TeavmRuntime;
      try {
        runtime = await importRuntime(runtimeUrl);
      } catch (cause) {
        throw new PlannerUnavailableError(
          `could not load the planner runtime from ${runtimeUrl}`
            + ' — run `bazel build //datacube:site`',
          { cause },
        );
      }
      try {
        return await runtime.load(wasmUrl, {
          stackDeobfuscator: { enabled: false },
          installImports(imports: Record<string, unknown>) {
            // The module writes compiler diagnostics to stdout/stderr.
            // Left unbound they reach the host console one CHARACTER
            // at a time, which is unreadable; the messages that matter
            // come back through planOrError's return value anyway.
            imports.teavmConsole = { putcharStdout() {}, putcharStderr() {} };
          },
        });
      } catch (cause) {
        // Quote the underlying failure. Without it this message names
        // the likeliest cause (a runtime without WebAssembly GC) and
        // is confidently wrong whenever the real reason is anything
        // else — a missing file, a bad path — which sends the reader
        // hunting for a browser bug that is not there.
        // Name the likeliest FIX, not just the failure. The two
        // causes need different actions and the message has to point
        // at the right one: an un-vendored checkout 404s here, while
        // a browser without WebAssembly GC rejects a module that
        // downloaded perfectly.
        const detail = cause instanceof Error ? cause.message : String(cause);
        const looksMissing = /404|not ok|not found|ENOENT|status code/i
          .test(detail);
        throw new PlannerUnavailableError(
          `could not instantiate the planner module at ${wasmUrl}: ${detail}`
            + (looksMissing
              ? ' — run `bazel build //datacube:site` to put it there'
              : ' — this runtime may lack WebAssembly GC'),
          { cause },
        );
      }
    })();
    // A failed load must not be cached as a permanent verdict: a
    // retry after a transient network fault should be allowed to work.
    this.#module.catch(() => {
      this.#module = undefined;
    });
    return this.#module;
  }

  /**
   * Pay the cold cost before the user can feel it.
   *
   * Loading the module is NOT warming it -- a mistake this method
   * made in its first version, which browser timings caught.
   * Instantiate costs ~45ms and resolved almost at once, while the
   * ~1.1s that actually makes a first plan slow sat in static
   * initialisers and a content-addressed cache, still on the
   * critical path and still after DuckDB. The marks read
   * `planner-ready` at 134ms and the first row at 1058ms, which is
   * the shape of a warm-up that warms nothing.
   *
   * So this also builds the boot layer -- the Pure prelude, the
   * system metamodel, and both resolved and normalized -- against
   * the real model, and throws the result away. `boot` calls it
   * concurrently with DuckDB's own startup, so the cost lands inside
   * a wait the page was making anyway.
   *
   * Safe to call repeatedly and safe never to call at all; `plan`
   * loads on demand either way.
   */
  async warmUp(): Promise<void> {
    if (this.#useWorker()) {
      await this.#ask({ kind: 'warm', model: this.#options.model });
      return;
    }
    const module = await this.#load();
    module.exports.warmModel(this.#options.model);
  }

  async plan(
    pureGrammar: string,
    _snapshot: CubeSnapshot,
    _scope?: LevelScope,
    signal?: AbortSignal,
  ): Promise<Plan> {
    const useCache = this.#options.cache !== false;
    if (useCache) {
      const hit = this.#cache.get(pureGrammar);
      if (hit !== undefined) return hit;
    }

    // Planning inside the module is synchronous and uninterruptible,
    // so an abort cannot stop it -- but it can stop a stale answer
    // reaching the grid. Check on both sides of the call: before, to
    // skip work already known to be pointless; after, because the
    // user may have moved on while it ran.
    if (signal?.aborted) throw signal.reason ?? new Error('aborted');

    const answer = this.#useWorker()
      ? await this.#ask({
        kind: 'plan',
        model: this.#options.model,
        query: pureGrammar,
        runtime: this.#options.runtime,
      })
      : (await this.#load()).exports.planOrError(
        this.#options.model,
        pureGrammar,
        this.#options.runtime,
      );

    if (signal?.aborted) throw signal.reason ?? new Error('aborted');

    // `{"sql", "type"}`: the SQL and the compiler's type of its result, in
    // upstream's RelationType shape -- the same renderer legend-lite's
    // pure/v1 answers use.
    const body = JSON.parse(decode(answer, pureGrammar)) as { sql: string; type: unknown };
    const plan: Plan = { sql: body.sql, columns: relationColumns(body.type) };
    if (useCache) this.#cache.set(pureGrammar, plan);
    return plan;
  }

  /**
   * The compiler's type of a query's result, compile-only: no runtime, no SQL.
   * How the cube types its source and calculated columns before any level
   * query runs (option B). Cached by grammar, like plans.
   */
  async relationType(pureGrammar: string, signal?: AbortSignal): Promise<PlanColumn[]> {
    const useCache = this.#options.cache !== false;
    const hit = useCache ? this.#types.get(pureGrammar) : undefined;
    if (hit !== undefined) return hit;
    if (signal?.aborted) throw signal.reason ?? new Error('aborted');
    const answer = this.#useWorker()
      ? await this.#ask({ kind: 'relationType', model: this.#options.model, query: pureGrammar })
      : (await this.#load()).exports.relationTypeOrError(this.#options.model, pureGrammar);
    if (signal?.aborted) throw signal.reason ?? new Error('aborted');
    const columns = relationColumns(JSON.parse(decode(answer, pureGrammar)));
    if (useCache) this.#types.set(pureGrammar, columns);
    return columns;
  }

  // ---- protocol JSON: each the in-tab twin of a pure/v1 endpoint (T4a) ----

  /** E9's twin: a lambda's protocol JSON planned: its SQL and the compiler's result type. */
  async planJson(lambda: unknown, signal?: AbortSignal): Promise<Plan> {
    const json = JSON.stringify(lambda);
    const useCache = this.#options.cache !== false;
    const key = `json:${json}`;
    const hit = useCache ? this.#cache.get(key) : undefined;
    if (hit !== undefined) return hit;
    if (signal?.aborted) throw signal.reason ?? new Error('aborted');
    const answer = this.#useWorker()
      ? await this.#ask({ kind: 'planJson', model: this.#options.model, lambda: json, runtime: this.#options.runtime })
      : (await this.#load()).exports.planJsonOrError(this.#options.model, json, this.#options.runtime);
    if (signal?.aborted) throw signal.reason ?? new Error('aborted');
    const body = JSON.parse(decode(answer, json)) as { sql: string; type: unknown };
    const plan: Plan = { sql: body.sql, columns: relationColumns(body.type) };
    if (useCache) this.#cache.set(key, plan);
    return plan;
  }

  /** E5's twin: a lambda's protocol JSON typed, compile-only. */
  async relationTypeJson(lambda: unknown, signal?: AbortSignal): Promise<PlanColumn[]> {
    const json = JSON.stringify(lambda);
    const useCache = this.#options.cache !== false;
    const hit = useCache ? this.#types.get(`json:${json}`) : undefined;
    if (hit !== undefined) return hit;
    if (signal?.aborted) throw signal.reason ?? new Error('aborted');
    const answer = this.#useWorker()
      ? await this.#ask({ kind: 'relationTypeJson', model: this.#options.model, lambda: json })
      : (await this.#load()).exports.relationTypeJsonOrError(this.#options.model, json);
    if (signal?.aborted) throw signal.reason ?? new Error('aborted');
    const columns = relationColumns(JSON.parse(decode(answer, json)));
    if (useCache) this.#types.set(`json:${json}`, columns);
    return columns;
  }

  /** E4's twin: a lambda's protocol JSON as Pure text, as upstream prints it. */
  async compose(lambda: unknown, style: 'PRETTY' | 'STANDARD' = 'PRETTY'): Promise<string> {
    const json = JSON.stringify(lambda);
    const answer = this.#useWorker()
      ? await this.#ask({ kind: 'compose', lambda: json, style })
      : (await this.#load()).exports.composeLambdaOrError(json, style);
    return decode(answer, json);
  }

  /** E1's twin: Pure text as its lambda's protocol JSON, without source information. */
  async lambdaJson(text: string): Promise<unknown> {
    const answer = this.#useWorker()
      ? await this.#ask({ kind: 'lambdaJson', text })
      : (await this.#load()).exports.lambdaJsonOrError(text);
    return JSON.parse(decode(answer, text));
  }

  /**
   * A Pure Database for a table, from the rows its CATALOG reports (`DESCRIBE`, a
   * warehouse's listing), read by legend-lite's DuckDB dialect
   * (docs/DATACUBE_TYPES_TO_SERVER_2026_09_27.md, T2): the declared types, the accessor that
   * reads it, and the conversions the source must apply -- or, for a source that cannot
   * convert, the columns left out. The compiler decides every column; nothing here does.
   */
  async databaseFromCatalog(table: CatalogTable): Promise<CatalogDatabase> {
    const catalog = JSON.stringify(table);
    const answer = this.#useWorker()
      ? await this.#ask({ kind: 'databaseFromCatalog', catalog })
      : (await this.#load()).exports.databaseFromCatalogOrError(catalog);
    return JSON.parse(decode(answer, `the columns of ${table.table}`)) as CatalogDatabase;
  }

  /**
   * Point the planner at a DIFFERENT model, e.g. one inferred from an
   * uploaded file.
   *
   * The plan cache is keyed by grammar text alone, which is only
   * sound while the model is fixed: the same
   * `#>{local::DB.t}#->select(~[a])` lowers to different SQL against
   * a different table. So the cache is dropped here -- a stale entry
   * would be wrong SQL, not merely a slow query.
   *
   * The module is NOT reloaded. Its boot layer is content-addressed
   * by the Pure prelude, which has not changed, so switching models
   * costs one graph build rather than another 4 MB download and
   * ~600ms of boot.
   */
  useModel(model: string, runtime: string): void {
    this.#options = { ...this.#options, model, runtime };
    this.#cache.clear();
    this.#types.clear();
  }

  /** Cached plan count, for tests and diagnostics. */
  get cacheSize(): number {
    return this.#cache.size;
  }
}

/**
 * A `file:` URL as the path Node's filesystem opens -- Node's own
 * `url.fileURLToPath`, which this file cannot import: it is bundled for
 * the browser too, where `node:url` does not resolve. It only runs
 * under Node (a browser never hands the loader a `file:` URL).
 *
 * The URL's pathname alone is NOT the path on Windows: `/C:/x/y`
 * opened there is `C:\C:\x\y` (CI, 2026-09-23 — every case of the
 * WASM differential refused with that ENOENT). Pinned against
 * `fileURLToPath(url, { windows })` in both modes by
 * test/wasm-planner.test.ts, on every platform.
 */
export function fileUrlToPath(url: string, windows: boolean): string {
  const u = new URL(url);
  if (u.protocol !== 'file:') throw new TypeError(`not a file: URL: ${url}`);
  const path = decodeURIComponent(u.pathname);
  if (!windows) {
    if (u.hostname !== '') throw new TypeError(`a file: URL with a host has no POSIX path: ${url}`);
    return path;
  }
  // A host is a UNC share (\\server\share\...); otherwise the path
  // must start with a drive letter, and loses the URL's leading slash.
  if (u.hostname !== '') return `\\\\${u.hostname}${path.replace(/\//g, '\\')}`;
  if (!/^\/[A-Za-z]:\//.test(path)) throw new TypeError(`a Windows file: URL needs a drive letter: ${url}`);
  return path.slice(1).replace(/\//g, '\\');
}

/**
 * A filesystem path as a `file:` URL -- Node's `url.pathToFileURL`, for
 * the same reason `fileUrlToPath` exists: this file cannot import
 * `node:url`. A trailing separator is kept, so a directory stays a
 * directory to resolve against. Pinned against Node's own in both
 * platform modes by test/wasm-planner.test.ts.
 */
export function pathToFileUrl(path: string, windows: boolean): string {
  // Node's own steps: escape what `pathname` would not, then let URL
  // encode the rest.
  const url = new URL('file://');
  let p = path;
  if (windows) {
    p = p.replace(/\\/g, '/');
    if (p.startsWith('//')) {
      // A UNC path (\\server\share\...) is a URL with a host.
      const [host = '', ...rest] = p.slice(2).split('/');
      url.hostname = host;
      p = `/${rest.join('/')}`;
    } else {
      p = `/${p}`;
    }
  }
  p = p.replace(/%/g, '%25');
  if (!windows) p = p.replace(/\\/g, '%5C');
  url.pathname = p.replace(/\n/g, '%0A').replace(/\r/g, '%0D')
    .replace(/\t/g, '%09').replace(/#/g, '%23').replace(/\?/g, '%3F');
  return url.href;
}

/** Whether this is Node on Windows; false in a browser, which has no `process`. */
function onWindows(): boolean {
  const proc = (globalThis as { process?: { platform?: string } }).process;
  return proc?.platform === 'win32';
}

/**
 * A module answer: "OK\n<json>" or "ERR\n<exception class>\n<message>". Failure
 * travels in the return value rather than as a thrown Java exception so that the
 * answer does not depend on how TeaVM bridges throwables into JS -- see
 * wasm/README.md. A refusal keeps the compiler's own message: the same text the
 * HTTP planner surfaces, so the two transports are indistinguishable.
 */
function decode(answer: string, pureGrammar: string): string {
  const nl = answer.indexOf('\n');
  const tag = nl < 0 ? answer : answer.slice(0, nl);
  const rest = nl < 0 ? '' : answer.slice(nl + 1);
  if (tag === 'OK') return rest;
  if (tag === 'ERR') {
    const split = rest.indexOf('\n');
    const message = split < 0 ? rest : rest.slice(split + 1);
    throw new PlanError(message || 'the planner refused the query', pureGrammar);
  }
  throw new PlannerUnavailableError(
    `the planner module returned an unrecognised answer: ${JSON.stringify(answer.slice(0, 120))}`,
  );
}
