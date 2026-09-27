// TYPES COME FROM THE COMPILER (docs/DATACUBE_TYPED_VALUES_DESIGN_2026_09_27.md).
//
// The real app (jsdom) over the real WASM planner and DuckDB-WASM. A column's
// type is what the compiler says the query returns -- never what an engine's
// wire format happens to carry, and never learned by running a query and
// looking at the answer.

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
import { inferModel } from '../../src/infer.ts';
import { sourceColumns } from '../../src/source-columns.ts';
import { familyOf } from '../../src/types.ts';

const MODULE_DIR = new URL('../../../wasm/planner/', import.meta.url).href;

const MODEL = `###Relational
Database typed::DB
(
    Table T
    (
        region VARCHAR(32), qty INTEGER, big BIGINT, amount DECIMAL(10,2),
        price DOUBLE, day DATE, ts TIMESTAMP, flag BIT
    )
)

###Connection
RelationalDatabaseConnection typed::Conn
{
    type: DuckDB;
    specification: DuckDB { };
    auth: Test;
}

###Runtime
Runtime typed::RT
{
    mappings: [];
    connections:
    [
        typed::DB: [ c1: typed::Conn ]
    ];
}
`;

let conn: ArrowishConnection;
let planner: WasmPlanner;

/** The engine, recording what it ran and counting what is in flight. */
class Watched implements QueryEngine {
  readonly name = 'duckdb';
  inFlight = 0;
  readonly sql: string[] = [];
  readonly #inner: DuckDbEngine;
  constructor(inner: DuckDbEngine) {
    this.#inner = inner;
  }
  async execute(plan: Plan, epoch: number, signal?: AbortSignal): Promise<ResultTable> {
    return this.#watch(plan.sql, () => this.#inner.execute(plan, epoch, signal));
  }
  async run(sql: string, epoch: number, signal?: AbortSignal): Promise<RawTable> {
    return this.#watch(sql, () => this.#inner.run(sql, epoch, signal));
  }
  async #watch<T>(sql: string, go: () => Promise<T>): Promise<T> {
    this.inFlight += 1;
    this.sql.push(sql);
    try {
      return await go();
    } finally {
      this.inFlight -= 1;
    }
  }
  async close(): Promise<void> {}
}

async function quiet(engine: Watched): Promise<void> {
  let calm = 0;
  for (let i = 0; i < 2000 && calm < 10; i++) {
    await new Promise((r) => setTimeout(r, 10));
    calm = engine.inFlight === 0 ? calm + 1 : 0;
  }
}

async function openCube(snapshot: CubeSnapshot): Promise<{ app: CubeApp; engine: Watched; errors: string[] }> {
  const dom = new JSDOM('<!doctype html><body><div id="r"></div></body>');
  (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame =
    (fn: () => void) => { fn(); return 0; };
  const root = dom.window.document.getElementById('r') as HTMLElement;
  const engine = new Watched(new DuckDbEngine(conn));
  const errors: string[] = [];
  const app = new CubeApp(root, snapshot, {
    engine,
    planner,
    configuration: DEFAULT_CONFIGURATION,
    onStatus: (text, kind) => { if (kind === 'error') errors.push(text); },
  });
  await app.open().catch(() => undefined);
  await quiet(engine);
  return { app, engine, errors };
}

const SOURCE = '#>{typed::DB.T}#';
const COLUMNS: CubeSnapshot['columns'] = [
  { name: 'region', type: 'String', kind: 'dimension' },
  { name: 'qty', type: 'Integer', kind: 'measure' },
  { name: 'big', type: 'Integer', kind: 'measure' },
  { name: 'amount', type: 'Decimal', kind: 'measure' },
  { name: 'price', type: 'Float', kind: 'measure' },
  { name: 'day', type: 'StrictDate', kind: 'dimension' },
  { name: 'ts', type: 'DateTime', kind: 'dimension' },
  { name: 'flag', type: 'Boolean', kind: 'dimension' },
];

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
  await local.run(`CREATE TABLE T (region VARCHAR(32), qty INTEGER, big BIGINT, amount DECIMAL(10,2),
    price DOUBLE, day DATE, ts TIMESTAMP, flag BOOLEAN)`, 0);
  await local.run(`INSERT INTO T VALUES
    ('EMEA', 1, 9007199254740993, 10.25, 1.5, DATE '2024-01-02', TIMESTAMP '2024-01-02 03:04:05.123456', true),
    ('EMEA', 2, 1, 20.50, 2.5, DATE '2024-01-03', TIMESTAMP '2024-01-03 00:00:00', false),
    ('AMER', 3, 2, 30.75, 3.5, DATE '2024-02-01', TIMESTAMP '2024-02-01 12:00:00', true)`, 0);
  planner = new WasmPlanner({ model: MODEL, runtime: 'typed::RT', assetBaseUrl: MODULE_DIR, cache: false });
});

describe('step 1: types from the compiler', () => {
  it('S1a: a calculated column is typed BEFORE its first query -- one level query, not a learned re-run', async () => {
    // A numeric calculated column with no declared kind: the default
    // aggregate reads its type (a number sums). The type used to be learned
    // from the first result and the query run again.
    const o = await openCube({
      source: { expression: SOURCE },
      columns: COLUMNS,
      derived: [{ name: 'double_qty', expression: '$x.qty * 2' }],
      rows: ['region'],
      pivotOn: [],
      measures: [],
      sorts: [],
      epoch: 1,
    });
    assert.deepEqual(o.errors, []);
    const levels = o.engine.sql.filter((s) => /GROUP BY/.test(s));
    assert.equal(levels.length, 1, `level queries sent:\n${levels.join('\n---\n')}`);
    assert.match(levels[0]!, /SUM\([^)]*qty \* 2/i, 'the calculated column is summed on the first query');
  });

  it('S1b: every result column carries the type the COMPILER gives it, not the engine\'s wire type', async () => {
    const o = await openCube({
      source: { expression: SOURCE },
      columns: COLUMNS,
      derived: [],
      rows: ['region'],
      pivotOn: [],
      // One measure per column (several on one column is audit P2-9, a
      // different leg).
      measures: [
        { name: 'sum_qty', column: 'qty', fn: 'sum' },
        { name: 'sum_amount', column: 'amount', fn: 'sum' },
        { name: 'avg_price', column: 'price', fn: 'average' },
        { name: 'n', column: 'flag', fn: 'count' },
        { name: 'last_day', column: 'day', fn: 'max' },
      ],
      sorts: [],
      epoch: 1,
    });
    assert.deepEqual(o.errors, []);
    const view = o.app.controller.view;
    assert.ok(view);
    const typeOf = (name: string): string | undefined =>
      view.rows.columns.find((c) => c.name === name)?.type;
    // DuckDB answers SUM of an integer as a 128-bit integer, which reaches the
    // wire as a decimal; the compiler says Integer.
    const shown = view.rows.columns.map((c) => `${c.name}:${c.type}`).join(', ');
    assert.equal(typeOf('sum_qty'), 'Integer', shown);
    assert.equal(typeOf('big'), 'Integer', `the carried BIGINT sum: ${shown}`);
    assert.equal(typeOf('sum_amount'), 'Decimal', shown);
    assert.equal(typeOf('avg_price'), 'Float', shown);
    assert.equal(typeOf('n'), 'Integer', shown);
    assert.equal(typeOf('last_day'), 'StrictDate', shown);
  });
});

describe('a source\'s columns come from the compiler', () => {
  it('an inferred model of every DuckDB type compiles, and the compiler types each column', async () => {
    // inferModel only writes the model; this compiles it for real (the check the regex-read
    // keyword list used to approximate) and reads the types the compiler gives back.
    const described = [
      ['s', 'VARCHAR'], ['big', 'BIGINT'], ['huge', 'HUGEINT'], ['ubig', 'UBIGINT'], ['i', 'INTEGER'],
      ['ti', 'TINYINT'], ['si', 'SMALLINT'], ['d', 'DOUBLE'], ['f', 'FLOAT'], ['r', 'REAL'],
      ['b', 'BOOLEAN'], ['day', 'DATE'], ['ts', 'TIMESTAMP'], ['tstz', 'TIMESTAMPTZ'],
      ['dec', 'DECIMAL(9,2)'], ['num', 'NUMERIC(18,4)'], ['blob', 'BLOB'], ['uuid', 'UUID'],
      ['iv', 'INTERVAL'], ['nested', 'STRUCT(a INTEGER)'], ['j', 'JSON'],
    ].map(([name, type]) => ({ name: name as string, type: type as string }));
    const m = inferModel(described, { table: 'every_type' });
    const own = new WasmPlanner({ model: m.model, runtime: m.runtime, assetBaseUrl: MODULE_DIR, cache: false });
    const columns = await sourceColumns(own, m.source, [{ name: 'big', kind: 'dimension' }]);
    const family = Object.fromEntries(columns.map((c) => [c.name, familyOf(c.type)]));
    assert.deepEqual(columns.map((c) => c.name), described.map((c) => c.name), 'every column, in order');
    for (const n of ['big', 'huge', 'ubig', 'i', 'ti', 'si', 'd', 'f', 'r', 'dec', 'num']) {
      assert.equal(family[n], 'numeric', n);
    }
    assert.equal(family.b, 'boolean');
    assert.equal(family.day, 'temporal');
    assert.equal(family.ts, 'temporal');
    assert.equal(family.nested, 'variant');
    assert.equal(family.j, 'variant');
    assert.equal(family.s, 'text');
    assert.equal(columns.find((c) => c.name === 'big')?.kind, 'dimension', 'the declared kind is kept');
  });

  it('refuses a declared column the source does not have', async () => {
    await assert.rejects(() => sourceColumns(planner, SOURCE, [{ name: 'nope', kind: 'dimension' }]),
      /the source has no column 'nope'/);
  });
});
