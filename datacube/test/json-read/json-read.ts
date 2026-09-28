// READING A JSON COLUMN: a sample, then every row (the user, 2026-09-28: "sample mode OR read
// EVERYTHING mode to get full 100% confidence", in "a single STREAMING pass"); and T10, a part of
// a document pulled out as a JSON column of its own, read and extracted from again.
//
// The real app (jsdom) over the real WASM planner and DuckDB-WASM. 2,500 documents, and only the
// LAST holds the field `late`: the sample (the first 1,000 rows) cannot see it; reading every row
// must, in one query whose rows arrive as more than one chunk -- streamed, not accumulated.

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { before, describe, it } from 'node:test';
import { JSDOM } from 'jsdom';

import { CubeApp } from '../../src/app.ts';
import { DEFAULT_CONFIGURATION } from '../../src/config.ts';
import { DuckDbEngine, type ArrowishConnection } from '../../src/duckdb.ts';
import type { QueryEngine, RawTable } from '../../src/engine.ts';
import type { Plan } from '../../src/relation-type.ts';
import type { ResultTable } from '../../src/result.ts';
import type { CubeSnapshot } from '../../src/snapshot.ts';
import { WasmPlanner } from '../../src/wasm-planner.ts';
import { accessor } from '../../../pure-protocol/src/index.ts';

const MODULE_DIR = new URL('../../../wasm/planner/', import.meta.url).href;

const MODEL = `###Relational
Database j::DB ( Table T ( id INTEGER, doc SEMISTRUCTURED ) Table O ( id INTEGER, doc SEMISTRUCTURED ) )

###Connection
RelationalDatabaseConnection j::Conn
{
    type: DuckDB;
    specification: DuckDB { };
    auth: Test;
}

###Runtime
Runtime j::RT
{
    mappings: [];
    connections:
    [
        j::DB: [ c1: j::Conn ]
    ];
}
`;

const ROWS = 2500;

const CUBE: CubeSnapshot = {
  source: { query: accessor('j::DB', 'T') },
  columns: [
    { name: 'id', type: 'Integer', kind: 'dimension' },
    { name: 'doc', type: 'Variant' },
  ],
  derived: [],
  rows: [],
  pivotOn: [],
  measures: [],
  sorts: [],
  epoch: 1,
};

let conn: ArrowishConnection;
let planner: WasmPlanner;

/** The engine, counting the chunks a stream hands over and what is in flight. */
class Counted implements QueryEngine {
  readonly name = 'duckdb';
  inFlight = 0;
  chunks = 0;
  readonly #inner: DuckDbEngine;
  constructor(inner: DuckDbEngine) {
    this.#inner = inner;
  }
  async execute(plan: Plan, epoch: number, signal?: AbortSignal): Promise<ResultTable> {
    return this.#watch(() => this.#inner.execute(plan, epoch, signal));
  }
  async run(sql: string, epoch: number, signal?: AbortSignal): Promise<RawTable> {
    return this.#watch(() => this.#inner.run(sql, epoch, signal));
  }
  async stream(plan: Plan, epoch: number, onChunk: (chunk: ResultTable) => void, signal?: AbortSignal): Promise<void> {
    return this.#watch(() => this.#inner.stream(plan, epoch, (chunk) => {
      this.chunks += 1;
      onChunk(chunk);
    }, signal));
  }
  async #watch<T>(go: () => Promise<T>): Promise<T> {
    this.inFlight += 1;
    try {
      return await go();
    } finally {
      this.inFlight -= 1;
    }
  }
  async close(): Promise<void> {}
}

before(async () => {
  const require = createRequire(import.meta.url);
  const duckdb = require('@duckdb/duckdb-wasm/blocking');
  const dist = path.dirname(require.resolve('@duckdb/duckdb-wasm/blocking'));
  const db = await duckdb.createDuckDB({
    mvp: { mainModule: path.join(dist, 'duckdb-mvp.wasm'), mainWorker: path.join(dist, 'duckdb-node-mvp.worker.cjs') },
    eh: { mainModule: path.join(dist, 'duckdb-eh.wasm'), mainWorker: path.join(dist, 'duckdb-node-eh.worker.cjs') },
  }, new duckdb.VoidLogger(), duckdb.NODE_RUNTIME);
  await db.instantiate();
  conn = db.connect() as ArrowishConnection;
  const local = new DuckDbEngine(conn);
  await local.run('CREATE TABLE T (id INTEGER, doc JSON)', 0);
  await local.run(`INSERT INTO T SELECT i, CASE WHEN i = ${ROWS}
      THEN json_object('n', i, 'kind', 'x', 'late', true) ELSE json_object('n', i, 'kind', 'x') END
    FROM range(1, ${ROWS + 1}) t(i)`, 0);
  // T10's documents: a nested object and an array of objects
  await local.run('CREATE TABLE O (id INTEGER, doc JSON)', 0);
  await local.run(`INSERT INTO O VALUES
    (1, '{"customer":{"tier":"gold","contact":{"email":"a@x"},"addresses":[{"kind":"billing","city":"Paris"},{"kind":"shipping","city":"Tokyo"}]},"items":[{"sku":"A","q":2},{"sku":"B","q":1}]}'),
    (2, '{"customer":{"tier":"silver","contact":{"email":"b@x"},"addresses":[{"kind":"billing","city":"Paris"}]},"items":[{"sku":"C","q":5}]}'),
    (3, '{"customer":{"tier":"gold","contact":{"email":"c@x"},"addresses":[{"kind":"billing","city":"London"}]},"items":[{"sku":"A","q":1}]}')`, 0);
  planner = new WasmPlanner({ model: MODEL, runtime: 'j::RT', assetBaseUrl: MODULE_DIR, cache: false });
});

/** Wait until `test` holds, or fail after a while. */
async function until(test: () => boolean, what: string): Promise<void> {
  for (let i = 0; i < 1000; i++) {
    if (test()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  assert.fail(`timed out waiting: ${what}`);
}

/** The real app over a cube, in jsdom. */
async function openApp(cube: CubeSnapshot): Promise<{ app: CubeApp; doc: Document; engine: Counted; errors: string[] }> {
  const dom = new JSDOM('<!doctype html><body><div id="r"></div></body>');
  (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame =
    (fn: () => void) => { fn(); return 0; };
  const doc = dom.window.document;
  const root = doc.getElementById('r') as HTMLElement;
  const engine = new Counted(new DuckDbEngine(conn));
  const errors: string[] = [];
  const app = new CubeApp(root, cube, {
    engine,
    planner,
    configuration: DEFAULT_CONFIGURATION,
    onStatus: (text, kind) => { if (kind === 'error') errors.push(text); },
  });
  await app.open();
  return { app, doc, engine, errors };
}

describe('a JSON column, sampled and then read whole', () => {
  it('the sample misses the last row; reading every row, streamed, finds it', async () => {
    const { app, doc, engine, errors } = await openApp(CUBE);
    app.openColumnEditor({ json: 'doc', level: 'dimension' });
    const note = (): string => doc.querySelector('.dc-jsonfields-note')?.textContent ?? '';
    const fields = (): string => doc.querySelector('.dc-jsonfields-tree')?.textContent ?? '';
    await until(() => /rows sampled/.test(note()), 'the sample');
    assert.match(note(), /1,000 of 2,500 rows sampled/);
    assert.ok(fields().includes('kind'), fields());
    assert.ok(!fields().includes('late'), 'the first 1,000 rows have no late');

    const before = engine.chunks;
    (doc.querySelector('.dc-jsonfields-all') as HTMLButtonElement).click();
    await until(() => /All 2,500 rows read/.test(note()), `every row: ${note()}`);
    assert.ok(fields().includes('late'), 'every row finds the field only the last row has');
    assert.ok(engine.chunks - before > 1, `streamed in ${engine.chunks - before} chunk(s)`);
    assert.deepEqual(errors, []);
  });
});

// T10 (the user, 2026-09-27): a sub-object or an array becomes a JSON column of its own, typed by
// the compiler, and is read and extracted from again like any JSON column.
describe('a part of a document as a JSON column of its own', () => {
  const ORDERS: CubeSnapshot = { ...CUBE, source: { query: accessor('j::DB', 'O') } };

  /** Open the editor on a JSON column, pick the extraction `name`, and add it. */
  async function extract(app: CubeApp, doc: Document, column: string, name: string): Promise<void> {
    app.openColumnEditor({ json: column, level: 'dimension' });
    await until(() => /rows (sampled|read)/.test(doc.querySelector('.dc-jsonfields-note')?.textContent ?? ''),
      `the fields of ${column}`);
    const pick = [...doc.querySelectorAll<HTMLButtonElement>('.dc-jsonfields-add')]
      .find((b) => (b.title ?? '').startsWith(`${name}:`));
    assert.ok(pick, `no extraction ${name} among ${[...doc.querySelectorAll<HTMLButtonElement>('.dc-jsonfields-add')]
      .map((b) => b.title).join(', ')}`);
    pick.click();
    const ok = doc.querySelector<HTMLButtonElement>('.dc-calc-ok');
    await until(() => ok !== null && !ok.disabled, `OK for ${name}`);
    ok!.click();
    await until(() => app.snapshot.derived.some((d) => d.name === name && d.type !== undefined),
      `${name} added and typed`);
  }

  const valuesOf = (app: CubeApp, name: string): unknown[] => {
    const v = app.controller.view;
    const leaf = v?.columns.all.find((c) => c.name === name);
    return leaf ? [...(v?.rows.columns[leaf.index]?.values ?? [])] : [];
  };

  it('a nested object: pulled out as JSON, then a value from it', async () => {
    const { app, doc, errors } = await openApp(ORDERS);
    await extract(app, doc, 'doc', 'doc_customer');
    assert.equal(app.snapshot.derived.find((d) => d.name === 'doc_customer')?.type, 'Variant',
      'the compiler types the sub-object as JSON');
    // the new column is a JSON column like any: its own fields, extracted again
    await extract(app, doc, 'doc_customer', 'doc_customer_tier');
    assert.equal(app.snapshot.derived.find((d) => d.name === 'doc_customer_tier')?.type, 'String');
    await until(() => valuesOf(app, 'doc_customer_tier').length === 3, 'the tiers in the grid');
    assert.deepEqual(valuesOf(app, 'doc_customer_tier').sort(), ['gold', 'gold', 'silver']);
    assert.deepEqual(errors, []);
  });

  it('an array\'s first element: pulled out as JSON, then a value from it', async () => {
    const { app, doc, errors } = await openApp(ORDERS);
    await extract(app, doc, 'doc', 'doc_items_first');
    assert.equal(app.snapshot.derived.find((d) => d.name === 'doc_items_first')?.type, 'Variant');
    await extract(app, doc, 'doc_items_first', 'doc_items_first_sku');
    await until(() => valuesOf(app, 'doc_items_first_sku').length === 3, 'the first skus in the grid');
    assert.deepEqual(valuesOf(app, 'doc_items_first_sku').sort(), ['A', 'A', 'C']);
    assert.deepEqual(errors, []);
  });

  it('an array: pulled out as JSON, then counted', async () => {
    const { app, doc, errors } = await openApp(ORDERS);
    await extract(app, doc, 'doc', 'doc_items');
    assert.equal(app.snapshot.derived.find((d) => d.name === 'doc_items')?.type, 'Variant');
    await extract(app, doc, 'doc_items', 'doc_items_count');
    await until(() => valuesOf(app, 'doc_items_count').length === 3, 'the counts in the grid');
    assert.deepEqual(valuesOf(app, 'doc_items_count').map(Number).sort(), [1, 1, 2]);
    assert.deepEqual(errors, []);
  });

  it('explode: one row per address, its kind and city side by side, the id hidden, then the distinct pairs', async () => {
    const { app, doc, errors } = await openApp(ORDERS);
    await extract(app, doc, 'doc', 'doc_customer_addresses_element');
    const element = app.snapshot.derived.find((d) => d.name === 'doc_customer_addresses_element');
    assert.equal(element?.unnest, true, 'an explode');
    assert.equal(element?.type, 'Variant', 'each element a JSON column, typed by the compiler');
    await extract(app, doc, 'doc_customer_addresses_element', 'doc_customer_addresses_element_kind');
    await extract(app, doc, 'doc_customer_addresses_element', 'doc_customer_addresses_element_city');
    const KIND = 'doc_customer_addresses_element_kind';
    const CITY = 'doc_customer_addresses_element_city';

    // the database's own unnest is the truth
    const truth = await new DuckDbEngine(conn).run(`SELECT a->>'kind' AS kind, a->>'city' AS city
      FROM O, UNNEST(CAST(doc->'customer'->'addresses' AS JSON[])) AS u(a)`, 0);
    const pairs = (kinds: readonly unknown[], cities: readonly unknown[]): string[] =>
      kinds.map((k, i) => `${String(k)}/${String(cities[i])}`).sort();
    const expected = pairs(truth.columns[0]!.values, truth.columns[1]!.values);
    assert.deepEqual(expected, ['billing/London', 'billing/Paris', 'billing/Paris', 'shipping/Tokyo']);
    await until(() => valuesOf(app, KIND).length === 4, 'one row per address');
    assert.deepEqual(pairs(valuesOf(app, KIND), valuesOf(app, CITY)), expected);

    // drop the id and the JSON: just (kind, city)
    await app.applyConfiguration({ columns: Object.fromEntries(
      ['id', 'doc', 'doc_customer_addresses_element'].map((c) => [c, { hidden: true }])) });
    // what the grid shows: its header cells
    const headers = (): string[] => [...doc.querySelectorAll<HTMLElement>('.dc-th[data-column]')]
      .map((th) => th.dataset['column'] ?? '').filter((c) => c !== '' && !c.startsWith('__'));
    await until(() => !headers().includes('id'), `the id hidden: ${headers().join(', ')}`);
    assert.deepEqual(headers(), [KIND, CITY]);

    // grouped: each pair once, and how many rows it covers
    await app.controller.update({ ...app.snapshot, rows: [KIND, CITY], leafCount: true });
    await app.controller.toggle(['billing']);
    await until(() => (app.controller.view?.treeRows ?? []).some((r) => r.path.length === 2), 'the pairs under billing');
    const leaves = (app.controller.view?.treeRows ?? []).filter((r) => r.path.length === 2).map((r) => r.path.join('/'));
    assert.deepEqual(leaves.sort(), ['billing/London', 'billing/Paris']);
    assert.deepEqual(errors, []);
  });
});
