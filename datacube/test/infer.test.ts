import assert from 'node:assert/strict';
import { PIVOT_SEPARATOR } from '../src/generated/lite-facts.ts';
import { describe, it } from 'node:test';

import {
  inferModel,
  isNestedType,
  quoteIdent,
  sqlTypeOf,
} from '../src/infer.ts';
import { formatOf, tableNameOf } from '../src/upload.ts';

describe('sqlTypeOf', () => {
  it('maps what DuckDB actually reports', () => {
    assert.equal(sqlTypeOf('VARCHAR'), 'VARCHAR(4096)');
    assert.equal(sqlTypeOf('BIGINT'), 'BIGINT');
    assert.equal(sqlTypeOf('INTEGER'), 'INTEGER');
    assert.equal(sqlTypeOf('DOUBLE'), 'DOUBLE');
    assert.equal(sqlTypeOf('BOOLEAN'), 'BIT');
    assert.equal(sqlTypeOf('DATE'), 'DATE');
    assert.equal(sqlTypeOf('TIMESTAMP'), 'TIMESTAMP');
  });

  it('keeps a DECIMAL\'s precision rather than flattening it', () => {
    // Rounding someone's money column to a default scale is the kind
    // of wrong that looks right.
    assert.equal(sqlTypeOf('DECIMAL(9,2)'), 'DECIMAL(9,2)');
    assert.equal(sqlTypeOf('NUMERIC(18,4)'), 'DECIMAL(18,4)');
  });

  it('falls back to VARCHAR for anything unrecognised', () => {
    // A column you can only group by is far less harmful than one
    // whose arithmetic silently means something else.
    for (const t of ['INTERVAL', 'UUID', 'BLOB', 'nonsense']) {
      assert.equal(sqlTypeOf(t), 'VARCHAR(4096)', t);
    }
  });

  it('is case- and space-insensitive', () => {
    assert.equal(sqlTypeOf('  double '), 'DOUBLE');
  });
  it('declares JSON and nested columns SEMISTRUCTURED, a Variant', () => {
    // Nested columns are converted to JSON as they are loaded, so the
    // declaration is true of the table by the time the planner reads it.
    for (const t of ['JSON', 'STRUCT(a INTEGER)', 'INTEGER[]',
      'STRUCT(sku VARCHAR, qty BIGINT)[]', 'VARCHAR[3]',
      'MAP(VARCHAR, INTEGER)', 'UNION(a INTEGER, b VARCHAR)']) {
      assert.equal(sqlTypeOf(t), 'SEMISTRUCTURED', t);
    }
  });
});

describe('isNestedType', () => {
  it('knows the nested shapes, and only those', () => {
    for (const t of ['STRUCT(a INTEGER)', 'INTEGER[]', 'integer[2]',
      'MAP(VARCHAR, INTEGER)', 'UNION(a INTEGER)']) {
      assert.ok(isNestedType(t), t);
    }
    // JSON is already what the planner navigates; nothing to convert.
    for (const t of ['JSON', 'VARCHAR', 'DECIMAL(9,2)', 'STRUCTURE']) {
      assert.ok(!isNestedType(t), t);
    }
  });
});

describe('quoteIdent', () => {
  it('leaves a plain identifier alone', () => {
    assert.equal(quoteIdent('region'), 'region');
    assert.equal(quoteIdent('_x9'), '_x9');
  });

  it('quotes anything that is not one', () => {
    assert.equal(quoteIdent('total pnl'), '"total pnl"');
    assert.equal(quoteIdent('2024'), '"2024"');
    assert.equal(quoteIdent('a-b'), '"a-b"');
  });

  it('leaves a SQL keyword bare, because the PURE grammar allows it', () => {
    // `select` is a valid Pure identifier; the lowerer is what quotes
    // it for SQL, emitting t0."select". Quoting it here as well would
    // make the wire name literally '"select"', since a quoted
    // relational identifier keeps its quotes. Measured: a file with
    // select/from headers planned 38 operations successfully.
    assert.equal(quoteIdent('select'), 'select');
    assert.equal(quoteIdent('from'), 'from');
  });

  it('quotes the headers that need it, which the grammar accepts', () => {
    assert.equal(quoteIdent('x,y'), '"x,y"');
    assert.equal(quoteIdent('  padded  '), '"  padded  "');
  });
});

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

describe('inferModel', () => {
  const described = [
    { name: 'region', type: 'VARCHAR' },
    { name: 'year', type: 'BIGINT' },
    { name: 'notional', type: 'DOUBLE' },
    { name: 'booked', type: 'DATE' },
  ];

  it('writes a model the planner can compile', () => {
    const m = inferModel(described, { table: 'trades' });
    assert.match(m.model, /###Relational/);
    assert.match(m.model, /Database local::DB/);
    assert.match(m.model, /Table trades/);
    assert.match(m.model, /region VARCHAR\(4096\)/);
    assert.match(m.model, /year BIGINT/);
    assert.match(m.model, /notional DOUBLE/);
    assert.match(m.model, /booked DATE/);
    // A dialect comes from the Connection element, so the Runtime and
    // Connection have to be there too or the planner cannot pick one.
    assert.match(m.model, /###Connection/);
    assert.match(m.model, /type: DuckDB;/);
    assert.match(m.model, /###Runtime/);
    assert.equal(m.runtime, 'local::RT');
    assert.equal(m.source, '#>{local::DB.trades}#');
  });

  it('quotes a table name that needs it', () => {
    const m = inferModel([{ name: 'a', type: 'VARCHAR' }],
      { table: 'my table' });
    assert.match(m.model, /Table "my table"/);
    assert.equal(m.source, '#>{local::DB."my table"}#');
  });

  it('refuses an empty schema with a message about the FILE', () => {
    // The planner's own error for a column-less Database is about a
    // malformed model, which is a baffling thing to show someone who
    // just picked a file.
    assert.throws(() => inferModel([], { table: 't' }),
      /no columns.*empty.*header/s);
  });

  it('refuses duplicate column names', () => {
    assert.throws(
      () => inferModel([
        { name: 'a', type: 'VARCHAR' },
        { name: 'A', type: 'VARCHAR' },
      ], { table: 't' }),
      /two columns named/,
    );
  });
});

describe('the facts that belong to legend-lite', () => {
  // The model's SQL types compile, and type as the compiler says: typed-values.ts
  // compiles a model of every DuckDB type through the real compiler.
  it('takes the pivot separator from lite, not from a literal', () => {
    // If this is ever not '__|__', it is because lite changed
    // Type.java and the generator picked it up -- which is the point.
    assert.equal(PIVOT_SEPARATOR, '__|__');
  });
});

describe('inferModel with a schema (a warehouse table)', () => {
  it('declares the table inside its schema and reads it by the qualified name', () => {
    const m = inferModel([{ name: 'id', type: 'INTEGER' }, { name: 'region', type: 'VARCHAR' }],
      { table: 'v_orders', schema: 'sales' });
    assert.match(m.model, /Schema sales\n {4}\(\n {8}Table v_orders\n {8}\(\n {12}id INTEGER,\n {12}region VARCHAR\(4096\)\n {8}\)\n {4}\)/);
    assert.equal(m.source, '#>{local::DB.sales.v_orders}#');
  });

  it('is byte-for-byte the unqualified model when there is none', () => {
    const cols = [{ name: 'id', type: 'INTEGER' }];
    assert.equal(inferModel(cols, { table: 't' }).model, inferModel(cols, { table: 't', schema: undefined as unknown as string }).model);
    assert.doesNotMatch(inferModel(cols, { table: 't' }).model, /Schema/);
  });
});
