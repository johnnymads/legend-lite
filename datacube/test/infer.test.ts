import assert from 'node:assert/strict';
import { PIVOT_SEPARATOR } from '../src/generated/lite-facts.ts';
import { describe, it } from 'node:test';

import { inferModel } from '../src/infer.ts';
import { build } from './catalog-builder.ts';
import { formatOf, tableNameOf } from '../src/upload.ts';

describe('tableNameOf', () => {
  it('derives an identifier from a filename', () => {
    assert.equal(tableNameOf('trades.csv'), 'trades');
    assert.equal(tableNameOf('my trades (2024).parquet'), 'my_trades_2024');
  });

  it('never starts with a digit', () => {
    assert.equal(tableNameOf('2024.csv'), 't_2024');
  });

  it('always yields something', () => {
    assert.equal(tableNameOf('...'), 'data');
    assert.equal(tableNameOf('!!!.csv'), 'data');
  });
});

describe('formatOf', () => {
  it('reads the extension, defaulting to csv', () => {
    assert.equal(formatOf('a.parquet'), 'parquet');
    assert.equal(formatOf('A.PARQUET'), 'parquet');
    assert.equal(formatOf('a.csv'), 'csv');
    assert.equal(formatOf('a.txt'), 'csv');
    assert.equal(formatOf('a.json'), 'json');
    assert.equal(formatOf('events.JSONL'), 'json');
    assert.equal(formatOf('a.ndjson'), 'json');
  });
});

// Each column's declared type is the COMPILER's reading of DuckDB's (CatalogModelTest, every
// DuckDB type, and typed-values.ts through the real app); what is pinned here is the model
// around it.
describe('inferModel', () => {
  const described = [
    { name: 'region', type: 'VARCHAR' },
    { name: 'year', type: 'BIGINT' },
    { name: 'notional', type: 'DOUBLE' },
    { name: 'booked', type: 'DATE' },
  ];

  it('writes a model the planner can compile', async () => {
    const m = await inferModel(build, described, { table: 'trades', convertible: true });
    assert.match(m.model, /###Relational/);
    assert.match(m.model, /Database local::DB/);
    assert.match(m.model, /Table trades/);
    assert.match(m.model, /region VARCHAR\(4096\)/);
    assert.match(m.model, /year BIGINT/);
    // A dialect comes from the Connection element, so the Runtime and
    // Connection have to be there too or the planner cannot pick one.
    assert.match(m.model, /###Connection/);
    assert.match(m.model, /type: DuckDB;/);
    assert.match(m.model, /###Runtime/);
    assert.equal(m.runtime, 'local::RT');
    assert.equal(m.source, '#>{local::DB.trades}#');
    assert.deepEqual(m.conversions, []);
  });

  it('quotes a column name that needs it, and leaves a keyword bare', async () => {
    const m = await inferModel(build, [{ name: 'total pnl', type: 'DOUBLE' },
      { name: 'select', type: 'VARCHAR' }], { table: 't', convertible: true });
    assert.match(m.model, /"total pnl" DOUBLE/);
    assert.match(m.model, /\bselect VARCHAR/);
  });

  it('refuses a table name the accessor cannot carry (upstream splits it on dots)', async () => {
    await assert.rejects(inferModel(build, [{ name: 'a', type: 'VARCHAR' }],
      { table: 'my table', convertible: true }), /plain identifier/);
  });

  it('refuses an empty schema and duplicate column names', async () => {
    await assert.rejects(inferModel(build, [], { table: 't', convertible: true }), /no columns/);
    await assert.rejects(inferModel(build, [
      { name: 'a', type: 'VARCHAR' },
      { name: 'A', type: 'VARCHAR' },
    ], { table: 't', convertible: true }), /two columns named/);
  });

  it('names what the source must convert, or what a read-only source leaves out', async () => {
    const cols = [{ name: 'id', type: 'BIGINT' }, { name: 'items', type: 'STRUCT(sku VARCHAR)[]' }];
    const upload = await inferModel(build, cols, { table: 't', convertible: true });
    assert.deepEqual(upload.conversions, [{ column: 'items', sql: 'to_json("items")' }]);
    assert.match(upload.model, /items SEMISTRUCTURED/);
    const warehouse = await inferModel(build, cols, { table: 't', schema: 's', convertible: false });
    assert.deepEqual(warehouse.excluded, ['items']);
    assert.doesNotMatch(warehouse.model, /items/);
  });
});

describe('the facts that belong to legend-lite', () => {
  it('takes the pivot separator from lite, not from a literal', () => {
    // If this is ever not '__|__', it is because lite changed
    // Type.java and the generator picked it up -- which is the point.
    assert.equal(PIVOT_SEPARATOR, '__|__');
  });
});

describe('inferModel with a schema (a warehouse table)', () => {
  it('declares the table inside its schema and reads it by the qualified name', async () => {
    const m = await inferModel(build, [{ name: 'id', type: 'INTEGER' }, { name: 'region', type: 'VARCHAR' }],
      { table: 'v_orders', schema: 'sales', convertible: false });
    assert.match(m.model, /Schema sales\n {4}\(\n {8}Table v_orders\n {8}\(\n {12}id INTEGER,\n {12}region VARCHAR\(4096\)\n {8}\)\n {4}\)/);
    assert.equal(m.source, '#>{local::DB.sales.v_orders}#');
  });

  it('declares no schema when there is none', async () => {
    const m = await inferModel(build, [{ name: 'id', type: 'INTEGER' }], { table: 't', convertible: true });
    assert.doesNotMatch(m.model, /Schema/);
  });
});
