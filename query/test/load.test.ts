// The form's round trip: a query built, printed as Pure, parsed by legend-lite, and read back is
// the same query. And what the form cannot show is said, never guessed.

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { buildLambda } from '../src/builder/build.ts';
import { loadLambda } from '../src/builder/load.ts';
import { emptyQuery, type FilterNode, type QueryState } from '../src/builder/state.ts';
import { demoModel, grammar } from './lite.ts';

const { graph } = await demoModel();

const SOURCE = {
  kind: 'class', class: 'demo::trading::Trade', mapping: 'demo::trading::TradingMapping', runtime: 'demo::trading::H2Runtime',
} as const;

/** The query with its generated ids blanked, for comparison. */
function shape(q: QueryState): unknown {
  const node = (n: FilterNode): unknown => (n.kind === 'group' ? { ...n, id: '', children: n.children.map(node) } : { ...n, id: '' });
  return { ...q, columns: q.columns.map((c) => ({ ...c, id: '' })), ...(q.filter ? { filter: node(q.filter) } : {}) };
}

async function roundTrip(q: QueryState): Promise<void> {
  for (const withFrom of [true, false]) {
    const text = await grammar.lambdaText(buildLambda(graph, q, { withFrom }), 'PRETTY');
    const parsed = await grammar.lambdaJson(text);
    const back = loadLambda(graph, parsed, withFrom ? undefined : { mapping: q.source.mapping, runtime: q.source.runtime });
    assert.ok(back.ok, back.ok ? '' : `${back.reason}\n${text}`);
    assert.deepEqual(shape(back.query), shape(q), text);
  }
}

const col = (name: string, ...path: string[]) => ({ id: name, name, path: path.map((property) => ({ property })) });

describe('load', () => {
  it('reads back columns, a nested filter with exists, parameters, groupBy and every option', async () => {
    await roundTrip({
      ...emptyQuery(SOURCE),
      parameters: [{ name: 'minQty', type: 'Integer', multiplicity: { lowerBound: 1, upperBound: 1 } }],
      columns: [col('Ticker', 'product', 'ticker'), { ...col('Quantity (sum)', 'quantity'), aggregate: 'sum' }, { ...col('Trades', 'tradeId'), aggregate: 'distinctCount' }],
      filter: {
        kind: 'group', id: 'g', op: 'or', children: [
          { kind: 'condition', id: 'a', path: [{ property: 'side' }], operator: 'notEqual', value: { kind: 'enum', enumeration: 'demo::trading::Side', value: 'SELL' } },
          {
            kind: 'group', id: 'g2', op: 'and', children: [
              { kind: 'condition', id: 'b', path: [{ property: 'quantity' }], operator: 'greaterThanEqual', value: { kind: 'parameter', name: 'minQty' } },
              { kind: 'condition', id: 'c', path: [{ property: 'trader' }, { property: 'trades' }, { property: 'status' }], operator: 'notIn', value: { kind: 'list', values: [{ kind: 'string', value: 'REJECTED' }] } },
              { kind: 'condition', id: 'd', path: [{ property: 'tradeDate' }], operator: 'lessThan', value: { kind: 'dateFunction', function: { kind: 'adjust', from: 'today', amount: -7, unit: 'DAYS' } } },
              { kind: 'condition', id: 'e', path: [{ property: 'trader' }, { property: 'title' }], operator: 'isNotEmpty' },
              { kind: 'condition', id: 'f', path: [{ property: 'price' }], operator: 'lessThan', value: { kind: 'float', value: '-1.5' } },
            ],
          },
        ],
      },
      options: { distinct: true, sort: [{ column: 'Quantity (sum)', direction: 'desc' }, { column: 'Ticker', direction: 'asc' }], limit: 100, slice: { start: 2, end: 10 } },
    });
  });

  it('aggregates every column with aggregate(), which legend-engine runs (groupBy with no key it cannot)', async () => {
    await roundTrip({
      ...emptyQuery(SOURCE),
      columns: [{ ...col('Trades', 'tradeId'), aggregate: 'count' }, { ...col('Quantity', 'quantity'), aggregate: 'sum' }],
    });
  });

  it("opens the data space's curated queries in the form", async () => {
    const ds = graph.dataSpaces.get('demo::trading::TradingDataSpace')!;
    for (const e of ds.executables ?? []) {
      if (e._type !== 'dataSpaceTemplateExecutable') continue;
      const r = loadLambda(graph, e.query, { mapping: 'demo::trading::TradingMapping', runtime: 'demo::trading::H2Runtime' });
      assert.ok(r.ok, r.ok ? '' : `${e.title}: ${r.reason}`);
    }
  });

  it('keeps what it cannot show as text, saying why', async () => {
    for (const [text, why] of [
      ['|demo::trading::Trade.all()->project([x|$x.tradeId], [\'id\'])', /project\(~\[/],
      ['{|let a = 1; demo::trading::Trade.all()->project(~[id:x|$x.tradeId]);}', /several statements/],
      ['|demo::trading::Trade.all()->project(~[id:x|$x.tradeId])->extend(~b:x|$x.id + 1)', /extend\(\)/],
    ] as const) {
      const r = loadLambda(graph, await grammar.lambdaJson(text), { mapping: 'm', runtime: 'r' });
      assert.equal(r.ok, false, text);
      if (!r.ok) assert.match(r.reason, why, text);
    }
  });
});
