// The saved page (src/page-document.ts): a cube's own document wrapped, with its charts
// and their layout -- written whole, read whole, versioned, unknown fields kept, a bad
// page refused by name; and a cube alone still read as a cube.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { cubeToJson, writeCube, type FileSource } from '../src/cube-document.ts';
import { DEFAULT_CONFIGURATION } from '../src/config.ts';
import {
  PAGE_KIND,
  PageDocumentError,
  pageDefinitionText,
  pageToJson,
  readPage,
  readSaved,
  writePage,
  type PageViews,
} from '../src/page-document.ts';
import type { ChartSpec } from '../src/chart-spec.ts';
import type { CubeSnapshot } from '../src/snapshot.ts';
import { TreeState } from '../src/tree.ts';
import { accessor, col, lambda, lit, times } from '../../pure-protocol/src/index.ts';

const SOURCE: FileSource = {
  _type: 'file', name: 'trades.csv', format: 'csv', size: 120, sha256: 'ab'.repeat(32),
  columns: [{ name: 'region', type: 'String' }, { name: 'desk', type: 'String' }, { name: 'notional', type: 'Float' }],
};

const SNAPSHOT: CubeSnapshot = {
  source: { query: accessor('local::DB', 'trades') },
  columns: [{ name: 'region', type: 'String' }, { name: 'desk', type: 'String' }, { name: 'notional', type: 'Float' }],
  // an exact decimal, which only the protocol's JSON writes right
  derived: [{ name: 'scaled', type: 'Decimal', lambda: lambda(['x'], times(col('x', 'notional'), lit.decimal('12.30'))) }],
  rows: ['region', 'desk'],
  pivotOn: [],
  measures: [],
  sorts: [],
  filter: {
    kind: 'and',
    children: [
      { kind: 'condition', column: 'desk', operator: 'equal', value: 'FX' },
      { kind: 'condition', column: 'region', operator: 'equal', value: 'EMEA' },
    ],
  },
  epoch: 3,
};

const CUBE = writeCube({
  name: 'draft', source: SOURCE, snapshot: SNAPSHOT,
  configuration: { ...DEFAULT_CONFIGURATION, reportTitle: 'Trades' },
  tree: TreeState.fromPaths([['EMEA']], false),
});

const SPEC: ChartSpec = {
  version: 1,
  mark: 'bar',
  x: 'region',
  y: [{ column: 'notional', fn: 'sum' }],
  split: 'desk',
  options: { orientation: 'vertical', stack: 'none', sort: { by: 'y', direction: 'desc' }, limit: 50, labels: false, legend: 'top' },
  frozen: true,
};

const { frozen: _frozen, ...LIVE } = SPEC;

const VIEWS: PageViews = {
  views: [
    { id: 'grid', kind: 'grid', cube: 'cube' },
    {
      id: 'chart-1', kind: 'chart', cube: 'cube', title: 'Notional by region', spec: SPEC,
      selection: [{ kind: 'condition', column: 'region', operator: 'equal', value: 'EMEA' }],
    },
    { id: 'chart-2', kind: 'chart', cube: 'cube', title: 'Chart 2', spec: { ...LIVE, mark: 'line' } },
  ],
  layout: {
    kind: 'grid',
    cols: 12,
    tiles: [
      { id: 'grid', x: 0, y: 0, w: 8, h: 14 },
      { id: 'chart-1', x: 8, y: 0, w: 4, h: 14 },
      { id: 'chart-2', x: 0, y: 14, w: 12, h: 10 },
    ],
    arranged: true,
  },
};

const page = () => writePage({ name: 'Q3 page', cube: CUBE, views: VIEWS });

describe('a saved page', () => {
  it('reads back its cube, views and layout, exactly, through JSON text', () => {
    const back = readPage(pageToJson(page()));
    assert.equal(back.kind, PAGE_KIND);
    assert.equal(back.name, 'Q3 page');
    assert.equal(back.cubes.length, 1);
    // the cube inside is the cube's own document, and takes the page's name
    assert.equal(back.cubes[0]!.cube.name, 'Q3 page');
    assert.equal(cubeToJson(back.cubes[0]!.cube), cubeToJson({ ...CUBE, name: 'Q3 page' }));
    assert.match(pageToJson(back), /12\.30/, 'the decimal keeps its digits');
    assert.deepEqual(back.layout, VIEWS.layout);
    const chart = back.views.find((v) => v.id === 'chart-1');
    assert.ok(chart && chart.kind === 'chart');
    assert.equal(chart.title, 'Notional by region');
    assert.deepEqual(chart.spec, SPEC);
    assert.deepEqual(chart.selection, [{ kind: 'condition', column: 'region', operator: 'equal', value: 'EMEA' }]);
    assert.equal(pageDefinitionText(back), pageDefinitionText(page()));
  });

  it('is read by its kind; a cube alone is still a cube', () => {
    assert.equal(readSaved(pageToJson(page())).kind, 'page');
    const cube = readSaved(cubeToJson(CUBE));
    assert.equal(cube.kind, 'cube');
    assert.equal(cube.kind === 'cube' && cube.cube.name, 'draft');
  });

  it('keeps fields a newer writer added, and refuses a newer version by name', () => {
    const raw = JSON.parse(pageToJson(page()));
    const withMore = { ...raw, variables: [{ name: 'asOf' }] };
    const back = readPage(JSON.stringify(withMore));
    assert.deepEqual(back.unknown, { variables: [{ name: 'asOf' }] });
    assert.deepEqual(JSON.parse(pageToJson(back)).variables, [{ name: 'asOf' }]);
    assert.throws(() => readPage(JSON.stringify({ ...raw, version: 2 })), /newer version \(2 > 1\)/);
  });

  it('says what is wrong with a page it cannot read', () => {
    const raw = JSON.parse(pageToJson(page()));
    const bad = (patch: Record<string, unknown>) => () => readPage(JSON.stringify({ ...raw, ...patch }));
    assert.throws(bad({ cubes: [] }), PageDocumentError);
    assert.throws(bad({ cubes: [] }), /no cube/);
    assert.throws(bad({ views: [{ id: 'x', kind: 'map', cube: 'cube' }] }), /unknown kind "map"/);
    assert.throws(bad({ views: [{ id: 'x', kind: 'grid', cube: 'elsewhere' }] }), /shows no cube of this page/);
    assert.throws(bad({ views: [{ id: 'c', kind: 'chart', cube: 'cube', title: 'c', spec: { version: 1, mark: 'radar', y: [], options: {} } }] }),
      /no chart it can draw/);
    assert.throws(bad({ layout: { ...raw.layout, tiles: [{ id: 'nowhere', x: 0, y: 0, w: 1, h: 1 }] } }), /shows no view/);
    assert.throws(bad({ layout: { ...raw.layout, tiles: [{ id: 'grid', x: -1, y: 0, w: 1, h: 1 }] } }), /not an id and a place/);
    assert.throws(() => readPage('{'), /not valid JSON/);
  });

  it('is changed by a chart, a title or the layout; not by its name', () => {
    const base = pageDefinitionText(page());
    const renamed = writePage({ name: 'other', cube: CUBE, views: VIEWS });
    assert.equal(pageDefinitionText(renamed), base);
    const moved = { ...VIEWS, layout: { ...VIEWS.layout, tiles: VIEWS.layout.tiles.map((t) => (t.id === 'chart-1' ? { ...t, w: 3 } : t)) } };
    assert.notEqual(pageDefinitionText(writePage({ name: 'Q3 page', cube: CUBE, views: moved })), base);
    const retitled = { ...VIEWS, views: VIEWS.views.map((v) => (v.id === 'chart-2' ? { ...v, title: 'Lines' } : v)) };
    assert.notEqual(pageDefinitionText(writePage({ name: 'Q3 page', cube: CUBE, views: retitled })), base);
  });

  it('holds a cube with no charts: its grid alone, the whole board', () => {
    const alone: PageViews = {
      views: [{ id: 'grid', kind: 'grid', cube: 'cube' }],
      layout: { kind: 'grid', cols: 12, tiles: [{ id: 'grid', x: 0, y: 0, w: 12, h: 24 }], arranged: false },
    };
    const back = readPage(pageToJson(writePage({ name: 'plain', cube: CUBE, views: alone })));
    assert.deepEqual(back.views, alone.views);
    assert.deepEqual(back.layout, alone.layout);
  });
});
