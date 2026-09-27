// A JSON file, loaded the way the picker loads it, against a real
// DuckDB. What is under test is the promise the model makes: a column
// declared SEMISTRUCTURED holds JSON, whatever shape it arrived in --
// the planner navigates it with JSON operators, which a STRUCT or a
// LIST does not take.

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import { DuckDbEngine, type ArrowishConnection } from '../src/duckdb.ts';
import { sampleById, sampleFileName } from '../src/samples.ts';
import { ingestFile, type DuckDbFiles } from '../src/upload.ts';
import { build } from './catalog-builder.ts';

let engine: DuckDbEngine;
let files: DuckDbFiles;
let copyOut: (name: string) => Uint8Array;

before(async () => {
  const require = createRequire(import.meta.url);
  const duckdb = require('@duckdb/duckdb-wasm/blocking');
  const dist = path.dirname(require.resolve('@duckdb/duckdb-wasm/blocking'));
  const db = await duckdb.createDuckDB(
    {
      mvp: {
        mainModule: path.join(dist, 'duckdb-mvp.wasm'),
        mainWorker: path.join(dist, 'duckdb-node-mvp.worker.cjs'),
      },
      eh: {
        mainModule: path.join(dist, 'duckdb-eh.wasm'),
        mainWorker: path.join(dist, 'duckdb-node-eh.worker.cjs'),
      },
    },
    new duckdb.VoidLogger(),
    duckdb.NODE_RUNTIME,
  );
  await db.instantiate();
  engine = new DuckDbEngine(db.connect() as ArrowishConnection);
  // The blocking bindings register synchronously; the picker's handle
  // is the async one.
  copyOut = (name) => db.copyFileToBuffer(name);
  files = {
    async registerFileText(name, text) { db.registerFileText(name, text); },
    async registerFileBuffer(name, buffer) { db.registerFileBuffer(name, buffer); },
  };
});

after(async () => {
  await engine?.close();
});

/** A picked file, as `ingestFile` reads one. */
function picked(name: string, text: string) {
  return {
    name,
    text: async () => text,
    arrayBuffer: async () => new TextEncoder().encode(text).buffer,
  };
}

const ORDERS = [
  { id: 1, customer: 'acme',
    items: [{ sku: 'ABC', qty: 2 }, { sku: 'XYZ', qty: 1 }],
    shipping: { city: 'Leeds', express: true } },
  { id: 2, customer: 'globex',
    items: [{ sku: 'DEF', qty: 3 }],
    shipping: { city: 'Paris', express: false } },
];

describe('ingestFile with JSON', () => {
  for (const [label, name, text] of [
    ['an array of records', 'orders.json', JSON.stringify(ORDERS)],
    ['newline-delimited records', 'orders.jsonl',
      ORDERS.map((o) => JSON.stringify(o)).join('\n')],
  ] as const) {
    it(`reads ${label}, nested fields as Variant`, async () => {
      const r = await ingestFile(engine, files, picked(name, text), build);

      assert.equal(r.rowCount, 2);
      // the model's declarations; the compiler types them (Variant for SEMISTRUCTURED)
      assert.match(r.model, /customer VARCHAR/);
      assert.match(r.model, /items SEMISTRUCTURED/);
      assert.match(r.model, /shipping SEMISTRUCTURED/);

      // The table holds what the model declares: JSON, not a STRUCT.
      const described = await engine.run(`DESCRIBE "${r.table}"`, 0);
      const names = described.columns.find((c) => c.name === 'column_name')!;
      const types = described.columns.find((c) => c.name === 'column_type')!;
      const duck = new Map(names.values.map((n, i) => [n, types.values[i]]));
      assert.equal(duck.get('items'), 'JSON');
      assert.equal(duck.get('shipping'), 'JSON');

      // ... and the JSON operators the planner emits work on it.
      const skus = await engine.run(
        `SELECT u ->> 'sku' AS sku FROM "${r.table}",
           UNNEST(CAST(items AS JSON[])) t(u) ORDER BY sku`, 0);
      assert.deepEqual(skus.columns[0]!.values, ['ABC', 'DEF', 'XYZ']);
    });
  }

  it('converts a nested Parquet-style column too, not only JSON input', async () => {
    // A CSV cannot carry a LIST, so build the nested column the way
    // Parquet delivers one: typed, not text.
    await engine.run(
      `COPY (SELECT 1 AS id, [1, 2, 3] AS xs, {'a': 1} AS s)
         TO 'nested.json' (FORMAT JSON)`, 0);
    const text = String((await engine.run(
      `SELECT content FROM read_text('nested.json')`, 0)).columns[0]!.values[0]);
    const r = await ingestFile(engine, files, picked('nested.json', text), build);
    assert.match(r.model, /id BIGINT/);
    assert.match(r.model, /xs SEMISTRUCTURED/);
    assert.match(r.model, /s SEMISTRUCTURED/);
  });

  it('converts what the compiler says to, as it loads: exact, never truncated (S3b)', async () => {
    // (No file carries a HUGEINT: Parquet has no 128-bit integer and DuckDB writes one as a
    // DOUBLE. Its declaration, DECIMAL(38,0), is pinned by core's CatalogModelTest.)
    await engine.run(
      `COPY (SELECT TIMESTAMPTZ '2024-01-02 03:04:05.123456+02' AS stamp,
                    18446744073709551615::UBIGINT AS big,
                    '4ac7a9e2-5b8f-4c1e-9a3d-2f6b8c0d1e7f'::UUID AS id,
                    TIME '13:14:15.678901' AS tod)
         TO 'zoned.parquet' (FORMAT PARQUET)`, 0);
    const bytes = copyOut('zoned.parquet');
    const r = await ingestFile(engine, files, {
      name: 'zoned.parquet',
      text: async () => '',
      arrayBuffer: async () => bytes.slice().buffer,
    }, build);
    for (const [column, sql] of [['stamp', 'TIMESTAMP'], ['big', 'DECIMAL\\(20,0\\)'],
      ['id', 'VARCHAR\\(4096\\)'], ['tod', 'VARCHAR\\(4096\\)']] as const) {
      assert.match(r.model, new RegExp(`${column} ${sql}`), column);
    }
    const row = await engine.run(`SELECT CAST(stamp AS VARCHAR), CAST(big AS VARCHAR),
        id, tod, typeof(stamp), typeof(big), typeof(id) FROM "${r.table}"`, 0);
    assert.deepEqual(row.columns.map((c) => c.values[0]),
      ['2024-01-02 01:04:05.123456', '18446744073709551615',
        '4ac7a9e2-5b8f-4c1e-9a3d-2f6b8c0d1e7f', '13:14:15.678901', 'TIMESTAMP', 'DECIMAL(20,0)', 'VARCHAR']);
  });

  it('opens the offered orders sample with its nested fields as Variant', async () => {
    const sample = sampleById('orders-json')!;
    const r = await ingestFile(engine, files,
      picked(sampleFileName(sample), sample.build(200)), build);
    assert.equal(r.rowCount, 200);
    for (const [column, sql] of [['order_id', 'BIGINT'], ['region', 'VARCHAR'], ['placed_on', 'DATE'],
      ['customer', 'SEMISTRUCTURED'], ['items', 'SEMISTRUCTURED'], ['tags', 'SEMISTRUCTURED'],
      ['total', 'DOUBLE']] as const) {
      assert.match(r.model, new RegExp(`${column} ${sql}`), column);
    }
  });
});
