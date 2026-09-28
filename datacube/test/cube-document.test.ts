// The saved cube (src/cube-document.ts): written whole, read whole, versioned, unknown
// fields kept, defaults not written down, and reconciled with its file on open.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CUBE_KIND,
  CUBE_VERSION,
  CubeDocumentError,
  cubeToJson,
  derivedReads,
  difference,
  fileSource,
  merge,
  openCube,
  readCube,
  sha256,
  writeCube,
  type FileSource,
} from '../src/cube-document.ts';
import { DEFAULT_CONFIGURATION, type CubeConfiguration } from '../src/config.ts';
import type { ColumnSpec, CubeSnapshot } from '../src/snapshot.ts';
import { TreeState } from '../src/tree.ts';
import { accessor, col, lambda, lit, times } from '../../pure-protocol/src/index.ts';

const SOURCE: FileSource = {
  _type: 'file', name: 'trades.csv', format: 'csv', size: 120, sha256: 'ab'.repeat(32),
  columns: [
    { name: 'region', type: 'String' }, { name: 'desk', type: 'String' },
    { name: 'notional', type: 'Float' }, { name: 'qty', type: 'Integer' },
  ],
};
const RELATION = { query: accessor('local::DB', 'trades') };

/**
 * EVERY field a snapshot has, set: `Required<>` makes the compiler refuse this fixture the
 * day a field is added, so a new field cannot be forgotten by the reader (the old saved
 * view's allow-list dropped five, P2-71).
 */
const EVERY: Required<CubeSnapshot> = {
  source: RELATION,
  columns: [
    { name: 'region', type: 'String', kind: 'dimension' },
    { name: 'desk', type: 'String' },
    { name: 'notional', type: 'Float', aggregate: 'average' },
    { name: 'qty', type: 'Integer', excludedFromPivot: true },
  ],
  derived: [{
    name: 'scaled', type: 'Decimal',
    lambda: lambda(['x'], times(col('x', 'notional'), lit.decimal('12.30'))),
  }],
  groupDerived: [{ name: 'doubled', lambda: lambda(['x'], times(col('x', 'notional'), lit.integer(2))) }],
  filter: {
    kind: 'and',
    children: [
      { kind: 'condition', column: 'region', operator: 'equal', value: 'EMEA' },
      { kind: 'not', child: { kind: 'condition', column: 'qty', operator: 'greaterThan', value: 3 } },
    ],
  },
  rows: ['region'],
  pivotOn: ['desk'],
  pivotValues: ['Rates', 'Credit'],
  pivotSort: { desk: 'desc' },
  pivotTotal: { placement: 'left', functions: { notional: 'max' } },
  keepGroupedColumns: true,
  leafCount: true,
  childCount: true,
  measures: [{ name: 'notional', column: 'notional', fn: 'sum' }, { name: 'w', column: 'notional', fn: 'wavg', weight: 'qty' }],
  sorts: [{ column: 'region', direction: 'desc' }],
  window: { offset: 50, limit: 100 },
  treeColumnSort: 'desc',
  maxRows: 777,
  epoch: 42,
};

const { pivotStatisticColumnPlacement: _total, ...WITHOUT_TOTAL } = DEFAULT_CONFIGURATION;
const CONFIG: CubeConfiguration = {
  ...WITHOUT_TOTAL,
  reportTitle: 'Q3 review',
  maxRows: 777,
  columns: { notional: { format: { kind: 'number', decimals: 3 } }, desk: { hidden: true } },
};

const doc = () => writeCube({
  name: 'Q3 review', source: SOURCE, snapshot: EVERY, configuration: CONFIG,
  tree: TreeState.fromPaths([['EMEA'], [null]], true),
});

describe('writing and reading a cube', () => {
  it('reads back every field of the cube, exactly, through JSON text', () => {
    const back = readCube(cubeToJson(doc()));
    const { source: _s, epoch: _e, window: _w, ...query } = EVERY;
    assert.deepEqual(JSON.parse(cubeToJson(back)).query, JSON.parse(cubeToJson(doc())).query);
    assert.deepEqual(Object.keys(back.query).sort(), Object.keys(query).sort());
    // the decimal literal keeps its digits
    assert.match(cubeToJson(back), /"12\.30"|12\.30/);
    assert.equal(back.name, 'Q3 review');
    assert.deepEqual(back.source, SOURCE);
    assert.deepEqual(back.tree, { open: [['EMEA'], [null]], showTotals: true });
  });

  it('writes no data, no relation, and no runtime state', () => {
    const d = doc();
    assert.equal('source' in d.query, false);
    assert.equal('epoch' in d.query, false);
    assert.equal('window' in d.query, false, 'where the grid was scrolled is not the cube');
  });

  it('writes only what differs from the product defaults', () => {
    const c = doc().configuration;
    assert.equal(c['reportTitle'], 'Q3 review');
    assert.equal(c['maxRows'], 777);
    assert.equal(c['showTitleBar'], undefined, 'a default is not written down');
    assert.equal(c['pivotStatisticColumnPlacement'], null, 'an unset default is written as null');
    assert.deepEqual(merge(DEFAULT_CONFIGURATION, c), JSON.parse(JSON.stringify(CONFIG)));
  });

  it('keeps fields it does not know, and writes them back', () => {
    const text = cubeToJson(doc()).replace('{', '{"futureSetting":{"a":1},');
    const back = readCube(text);
    assert.deepEqual(back.unknown, { futureSetting: { a: 1 } });
    assert.match(cubeToJson(back), /"futureSetting":\{"a":1\}/);
  });

  it('refuses what it cannot read, saying why', () => {
    assert.throws(() => readCube('{ not json'), /not valid JSON/);
    assert.throws(() => readCube('{"kind":"other"}'), /not a saved cube/);
    assert.throws(() => readCube('{"query":"select(~[a])","source":{}}'), /legacy DataCube specification/);
    assert.throws(() => readCube(cubeToJson({ ...doc(), version: CUBE_VERSION + 1 })), /newer version/);
    const noSource = JSON.parse(cubeToJson(doc()));
    noSource.source = { _type: 'pointer' };
    assert.throws(() => readCube(noSource), CubeDocumentError);
    assert.equal(doc().kind, CUBE_KIND);
  });
});

describe('opening a cube over its file as it is now', () => {
  const now = (cols: [string, string][]): ColumnSpec[] => cols.map(([name, type]) => ({ name, type }));

  it('opens unchanged when the file holds what it held', () => {
    const opened = openCube(readCube(cubeToJson(doc())), RELATION,
      now([['region', 'String'], ['desk', 'String'], ['notional', 'Float'], ['qty', 'Integer']]));
    assert.deepEqual(opened.notes, []);
    assert.equal(opened.changed, false);
    assert.deepEqual(opened.snapshot.rows, ['region']);
    assert.equal(opened.snapshot.columns.find((c) => c.name === 'notional')?.aggregate, 'average',
      'what the cube set on a column is kept');
    assert.equal(opened.configuration.maxRows, 777);
    assert.equal(opened.tree.isOpen(['EMEA']), true);
  });

  it('hides a new column and says so', () => {
    const opened = openCube(doc(), RELATION,
      now([['region', 'String'], ['desk', 'String'], ['notional', 'Float'], ['qty', 'Integer'], ['book', 'String']]));
    assert.equal(opened.configuration.columns['book']?.hidden, true);
    assert.match(opened.notes.join('\n'), /1 new column .*book/);
    assert.equal(opened.changed, false);
  });

  it('leaves out every part that uses a column that is gone, naming each', () => {
    const opened = openCube(doc(), RELATION,
      now([['region', 'String'], ['desk', 'String'], ['qty', 'Integer']]));
    const text = opened.notes.join('\n');
    assert.match(text, /no longer in the file: notional/);
    assert.match(text, /left out calculated column scaled \(it uses notional\)/);
    assert.match(text, /left out calculated column doubled/);
    assert.match(text, /left out measure notional/);
    assert.match(text, /left out measure w/);
    assert.equal(opened.changed, true);
    assert.deepEqual(opened.snapshot.derived, []);
    assert.deepEqual(opened.snapshot.measures, []);
    assert.deepEqual(opened.snapshot.rows, ['region'], 'what does not use it stays');
    assert.ok(opened.snapshot.filter, 'the filter on region and qty stays');
  });

  it('drops a filter condition on a gone column and keeps the rest', () => {
    const opened = openCube(doc(), RELATION,
      now([['region', 'String'], ['desk', 'String'], ['notional', 'Float']]));
    assert.deepEqual(opened.snapshot.filter,
      { kind: 'condition', column: 'region', operator: 'equal', value: 'EMEA' });
    assert.match(opened.notes.join('\n'), /left out the filter on qty/);
  });

  it('reports a changed type and takes the compiler\'s', () => {
    const opened = openCube(doc(), RELATION,
      now([['region', 'String'], ['desk', 'String'], ['notional', 'Decimal'], ['qty', 'Integer']]));
    assert.match(opened.notes.join('\n'), /notional is now Decimal \(it was Float\)/);
    assert.equal(opened.snapshot.columns.find((c) => c.name === 'notional')?.type, 'Decimal');
  });

  it('closes the open rows when the grouping changed', () => {
    const opened = openCube(doc(), RELATION, now([['desk', 'String'], ['notional', 'Float'], ['qty', 'Integer']]));
    assert.deepEqual(opened.snapshot.rows, []);
    assert.equal(opened.tree.isOpen(['EMEA']), false);
  });
});

describe('the pieces', () => {
  it('knows which columns a calculated column reads', () => {
    assert.deepEqual([...derivedReads(EVERY.derived[0]!)], ['notional']);
    assert.deepEqual([...derivedReads({ name: 'r', window: { fn: 'sum', column: 'qty', partition: ['region'], order: [{ column: 'desk', direction: 'asc' }] } })].sort(),
      ['desk', 'qty', 'region']);
  });

  it('fingerprints a file by its bytes', async () => {
    assert.equal(await sha256(new TextEncoder().encode('abc').buffer as ArrayBuffer),
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    const src = await fileSource({ name: 'a.csv', size: 3, arrayBuffer: async () => new TextEncoder().encode('abc').buffer as ArrayBuffer },
      'csv', [{ name: 'a', type: 'String' }], { id: 'trades', rows: 10 });
    assert.equal(src.sha256.slice(0, 8), 'ba7816bf');
    assert.deepEqual(src.sample, { id: 'trades', rows: 10 });
  });

  it('differences and merges are inverses', () => {
    const base = { a: 1, b: { c: 2, d: 3 }, e: [1, 2], f: 'x' };
    const value = { a: 1, b: { c: 5, d: 3 }, e: [1, 2, 3] };
    const d = difference(value, base);
    assert.deepEqual(d, { b: { c: 5 }, e: [1, 2, 3], f: null });
    assert.deepEqual(merge(base, d), value);
  });
});
