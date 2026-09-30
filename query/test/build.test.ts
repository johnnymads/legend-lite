// The builder's lambdas, checked by legend-lite's own compiler (the WASM planner): each prints
// as the Pure a person would write, and types against the demo model.

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { buildLambda, BuildError } from '../src/builder/build.ts';
import { emptyQuery, type QueryState } from '../src/builder/state.ts';
import { demoModel, grammar } from './lite.ts';

const { context, graph } = await demoModel();

const SOURCE = {
  kind: 'class', class: 'demo::trading::Trade', mapping: 'demo::trading::TradingMapping', runtime: 'demo::trading::H2Runtime',
} as const;

function trades(overrides: Partial<QueryState>): QueryState {
  return { ...emptyQuery(SOURCE), ...overrides };
}

const col = (name: string, ...path: string[]) => ({ id: name, name, path: path.map((property) => ({ property })) });

async function text(q: QueryState, withFrom = false): Promise<string> {
  return grammar.lambdaText(buildLambda(graph, q, { withFrom }), 'STANDARD');
}

async function columns(q: QueryState): Promise<string[]> {
  const t = await grammar.relationType(context, buildLambda(graph, q, { withFrom: true }));
  return t.columns.map((c) => `${c.name}:${c.genericType.rawType._type === 'packageableType' ? c.genericType.rawType.fullPath : '?'}`);
}

describe('build', () => {
  it('projects columns across to-one navigation and a derived property', async () => {
    const q = trades({ columns: [col('id', 'tradeId'), col('ticker', 'product', 'ticker'), col('trader', 'trader', 'fullName')] });
    assert.equal(await text(q),
      '|demo::trading::Trade.all()->project(~[id:x|$x.tradeId, ticker:x|$x.product.ticker, trader:x|$x.trader.fullName])');
    assert.deepEqual(await columns(q), ['id:Integer', 'ticker:String', 'trader:String']);
  });

  it('filters with an enum, a to-many exists and a parameter; appends from() for execution', async () => {
    const q = trades({
      columns: [col('id', 'tradeId')],
      parameters: [{ name: 'minQty', type: 'Integer', multiplicity: { lowerBound: 1, upperBound: 1 } }],
      filter: {
        kind: 'group', id: 'g', op: 'and', children: [
          { kind: 'condition', id: 'c1', path: [{ property: 'side' }], operator: 'equal', value: { kind: 'enum', enumeration: 'demo::trading::Side', value: 'BUY' } },
          { kind: 'condition', id: 'c2', path: [{ property: 'quantity' }], operator: 'greaterThan', value: { kind: 'parameter', name: 'minQty' } },
          { kind: 'condition', id: 'c3', path: [{ property: 'trader' }, { property: 'trades' }, { property: 'status' }], operator: 'in', value: { kind: 'list', values: [{ kind: 'string', value: 'EXECUTED' }, { kind: 'string', value: 'SETTLED' }] } },
        ],
      },
    });
    assert.equal(await text(q, true),
      "minQty: Integer[1]|demo::trading::Trade.all()->filter(x|(($x.side == demo::trading::Side.BUY) && ($x.quantity > $minQty)) && $x.trader.trades->exists(x_1|$x_1.status->in(['EXECUTED', 'SETTLED'])))->project(~[id:x|$x.tradeId])->from(demo::trading::TradingMapping, demo::trading::H2Runtime)");
    // typed without its parameter: legend-lite types a PARAMETERIZED lambda as the lambda itself
    // (a function type) where legend-engine types its result -- recorded in docs/IN_FLIGHT.md for
    // the compiler's owners; the query app does not depend on it
    assert.deepEqual(await columns({ source: q.source, columns: q.columns, parameters: [], options: q.options }), ['id:Integer']);
  });

  it('groups by the columns with no aggregate, then distinct, sort, limit and slice', async () => {
    const q = trades({
      columns: [col('ticker', 'product', 'ticker'), { ...col('qty', 'quantity'), aggregate: 'sum' }],
      options: { distinct: true, sort: [{ column: 'qty', direction: 'desc' }], limit: 10, slice: { start: 0, end: 5 } },
    });
    assert.equal(await text(q),
      '|demo::trading::Trade.all()->project(~[ticker:x|$x.product.ticker, qty:x|$x.quantity])->groupBy(~[ticker], ~[qty:x|$x.qty:y|$y->sum()])->distinct()->sort([~qty->descending()])->limit(10)->slice(0, 5)');
    assert.deepEqual(await columns(q), ['ticker:String', 'qty:Integer']);
  });

  it('types window columns, a calculated column and a post-filter with lite', async () => {
    const q = trades({
      columns: [col('ticker', 'product', 'ticker'), col('qty', 'quantity'), { id: 'd', name: 'double', path: [], derivation: await grammar.lambdaJson('x|$x.quantity * 2') }],
      windows: [{ id: 'w', name: 'rk', op: 'denseRank', partition: ['ticker'], sort: { column: 'qty', direction: 'desc' } },
        { id: 'w2', name: 'n', op: 'count', column: 'qty', partition: ['ticker'] }],
      postFilter: { kind: 'group', id: 'p', op: 'and', children: [{ kind: 'condition', id: 'c', path: [{ property: 'rk' }], operator: 'equal', value: { kind: 'integer', value: '1' } }] },
    });
    assert.equal(await text(q),
      '|demo::trading::Trade.all()->project(~[ticker:x|$x.product.ticker, qty:x|$x.quantity, double:x|$x.quantity * 2])->extend(over(~[ticker], [~qty->descending()]), ~rk:{p, w, r|$p->denseRank($w, $r)})->extend(over(~[ticker]), ~n:{p, w, r|$r.qty}:y|$y->count())->filter(r|$r.rk == 1)');
    assert.deepEqual(await columns(q), ['ticker:String', 'qty:Integer', 'double:Integer', 'rk:Integer', 'n:Integer']);
  });

  it('builds a graph fetch, a preview taking its rows first', async () => {
    const q = trades({ graph: { checked: false, tree: [{ property: 'tradeId', children: [] }, { property: 'trader', children: [{ property: 'lastName', children: [] }] }] } });
    assert.equal(await grammar.lambdaText(buildLambda(graph, q, { withFrom: true, previewLimit: 5 }), 'STANDARD'),
      '|demo::trading::Trade.all()->take(5)->graphFetch(#{demo::trading::Trade{tradeId,trader{lastName}}}#)->serialize(#{demo::trading::Trade{tradeId,trader{lastName}}}#)->from(demo::trading::TradingMapping, demo::trading::H2Runtime)');
  });

  it('refuses a query with no columns, and a path the model does not have', () => {
    assert.throws(() => buildLambda(graph, trades({}), { withFrom: false }), BuildError);
    assert.throws(() => buildLambda(graph, trades({
      columns: [col('x', 'tradeId')],
      filter: { kind: 'group', id: 'g', op: 'and', children: [{ kind: 'condition', id: 'c', path: [{ property: 'nope' }, { property: 'x' }], operator: 'isEmpty' }] },
    }), { withFrom: false }), /no property 'nope'/);
  });
});
