// T4b step 1's proof: the queries query.ts BUILDS as protocol trees are, byte for byte, what
// legend-lite's own parser gives the Pure text serialize.ts WRITES -- for every cube case the
// WASM differential plans (its corpus: levels, pivots, filters, windows, calculated columns).
// Deleted with serialize.ts at step 4, when the text is gone.

import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import { readLambda, toJson, type Lambda } from '../../pure-protocol/src/index.ts';
import { parse } from '../../pure-protocol/test/lite.ts';
import { levelLambda, pivotValuesLambda, childAggregateLambda, type Parsed } from '../src/query.ts';
import { childAggregateQuery, pivotValuesQuery, serialize } from '../src/serialize.ts';
import type { CubeSnapshot } from '../src/snapshot.ts';
import { CASES } from './wasm-differential/cases.ts';

/** The snapshot's text parsed by the compiler, as step 2's planner will parse it. */
async function parsedOf(s: CubeSnapshot): Promise<Parsed> {
  const source = readLambda(await parse(`|${s.source.expression}`)).body[0]!;
  const texts = [...s.derived, ...(s.groupDerived ?? [])].filter((d) => !d.window && !d.childAggregate)
    .map((d) => d.expression);
  const lambdas = new Map<string, Lambda>();
  for (const t of texts) lambdas.set(t, readLambda(await parse(`x|${t}`)));
  return {
    source,
    expression: (t) => {
      const l = lambdas.get(t);
      if (!l) throw new Error(`not parsed: ${t}`);
      return l;
    },
  };
}

const cases = CASES.filter((c) => c.pure === undefined);

describe('each cube query built as a tree is the text serialize.ts writes, parsed', () => {
  before(async () => {
    await parse('|1'); // the module loads once, outside the first case's timing
  });

  for (const c of cases) {
    it(c.name, async () => {
      const parsed = await parsedOf(c.snapshot);
      const text = serialize(c.snapshot, c.scope, c.pivot);
      assert.equal(toJson(levelLambda(c.snapshot, parsed, c.scope, c.pivot)), await parse(`|${text}`), text);

      const values = pivotValuesQuery(c.snapshot);
      const valuesTree = pivotValuesLambda(c.snapshot, parsed);
      assert.equal(valuesTree === null, values === null, 'a pivot values query on one side only');
      if (values !== null) assert.equal(toJson(valuesTree), await parse(`|${values}`), values);

      if (c.scope) {
        const child = childAggregateQuery(c.snapshot, c.scope);
        const childTree = childAggregateLambda(c.snapshot, parsed, c.scope);
        assert.equal(childTree === null, child === null, 'a child aggregate query on one side only');
        if (child !== null) {
          assert.equal(toJson(childTree!.query), await parse(`|${child.pure}`), child.pure);
          assert.deepEqual(childTree!.columns, child.columns);
        }
      }
    });
  }
});

// ---- every filter operator, window function and aggregate: the whole vocabulary, not a sample ----

import { lambda } from '../../pure-protocol/src/index.ts';
import { filterNode } from '../src/query.ts';
import { filterExpression } from '../src/serialize.ts';
import {
  CubeRefusal, WINDOW_FUNCTIONS,
  type AggregateFn, type FilterNode, type FilterOperator, type FilterValue, type WindowFrame, type WindowSpec,
} from '../src/snapshot.ts';

const TYPES: Record<string, string> = {
  s: 'String', n: 'Integer', f: 'Float', d: 'Decimal', day: 'StrictDate', ts: 'DateTime',
  tm: 'StrictTime', b: 'Boolean', v: 'meta::pure::metamodel::variant::Variant',
};
const typeOf = (c: string): string | undefined => TYPES[c];

const VALUES: readonly (readonly [string, FilterValue])[] = [
  ['s', 'EMEA'], ['s', "it's a \\ path"], ['s', ''], ['n', 42], ['n', -7], ['n', '9007199254740993'],
  ['f', 1.5], ['f', -0.25], ['d', '12345678901234567.89'], ['d', '12.30'], ['day', '2024-02-29'],
  ['ts', '2024-01-02 03:04:05.123456'], ['ts', '2024-01-02T03:04:05'], ['tm', '10:11:12'], ['b', true],
  ['day', new Date(2024, 0, 2)], ['ts', new Date(2024, 0, 2, 3, 4, 5)], ['day', { relative: 'today' }],
  ['ts', { relative: 'now' }], ['v', { json: '{"a": [1, "x"]}' }],
];

const SCALAR_OPS: readonly FilterOperator[] = [
  'equal', 'notEqual', 'lessThan', 'lessThanEqual', 'greaterThan', 'greaterThanEqual', 'contains',
  'notContains', 'startsWith', 'notStartsWith', 'endsWith', 'notEndsWith', 'equalCaseInsensitive',
  'notEqualCaseInsensitive', 'containsCaseInsensitive', 'startsWithCaseInsensitive', 'endsWithCaseInsensitive',
];
const LIST_OPS: readonly FilterOperator[] = ['in', 'notIn', 'inCaseInsensitive', 'notInCaseInsensitive'];
const NULLARY_OPS: readonly FilterOperator[] = ['isEmpty', 'isNotEmpty'];
const COLUMN_OPS: readonly FilterOperator[] = [
  'equalColumn', 'equalCaseInsensitiveColumn', 'notEqualColumn', 'notEqualCaseInsensitiveColumn',
  'lessThanColumn', 'lessThanEqualColumn', 'greaterThanColumn', 'greaterThanEqualColumn',
];

/** Every filter the vocabulary makes, and a few trees of them. */
function filters(): FilterNode[] {
  const out: FilterNode[] = [];
  for (const op of SCALAR_OPS) {
    for (const [column, value] of VALUES) out.push({ kind: 'condition', column, operator: op, value });
  }
  for (const op of LIST_OPS) {
    for (const values of [[], ['EMEA'], ['EMEA', "O'Brien", 'x\\y']] as FilterValue[][]) {
      out.push({ kind: 'condition', column: 's', operator: op, value: values });
    }
    out.push({ kind: 'condition', column: 'n', operator: op, value: [1, -2, '9007199254740993'] });
    out.push({ kind: 'condition', column: 'day', operator: op, value: ['2024-01-02', { relative: 'today' }] });
  }
  for (const op of NULLARY_OPS) out.push({ kind: 'condition', column: 's', operator: op });
  for (const op of COLUMN_OPS) out.push({ kind: 'condition', column: 'n', operator: op, rightColumn: 'f' });
  const a: FilterNode = { kind: 'condition', column: 'n', operator: 'greaterThan', value: 1 };
  const b: FilterNode = { kind: 'condition', column: 'f', operator: 'lessThanEqual', value: 2.5 };
  const c: FilterNode = { kind: 'condition', column: 's', operator: 'contains', value: 'x' };
  out.push({ kind: 'and', children: [] }, { kind: 'or', children: [] }, { kind: 'and', children: [a] },
    { kind: 'and', children: [a, b, c] }, { kind: 'or', children: [a, { kind: 'and', children: [b, c] }] },
    { kind: 'not', child: { kind: 'or', children: [a, b] } });
  return out;
}

describe('every filter the vocabulary makes, built as a tree, is its text parsed', () => {
  it(`${filters().length} filters`, async () => {
    for (const f of filters()) {
      let text: string;
      try {
        text = filterExpression(f, 'x', typeOf);
      } catch (e) {
        assert.throws(() => filterNode(f, 'x', typeOf), `the text refused ${JSON.stringify(f)}: ${String(e)}`);
        continue;
      }
      // the one intended difference (query.ts `exactNumber`): a Decimal column's exact value is a
      // decimal literal; the text wrote it bare, a Float to the lexer, rounded through a double
      const twin = f.kind === 'condition' && typeOf(f.column) === 'Decimal' && typeof f.value === 'string'
        && /^-?\d+(\.\d+)?$/.test(f.value) && text.includes(f.value)
        ? text.replace(new RegExp(`(^|[^'\\d.])${f.value.replace(/\./g, '\\.')}(?![\\d.'])`), `$1${f.value}D`)
        : text;
      assert.equal(toJson(lambda(['x'], filterNode(f, 'x', typeOf))), await parse(`x|${twin}`), twin);
    }
  });
});

const COLUMNS: CubeSnapshot['columns'] = [
  { name: 'p', type: 'String' }, { name: 'q', type: 'Integer' }, { name: 'r', type: 'Float' },
];
const base = (over: Partial<CubeSnapshot>): CubeSnapshot => ({
  source: { expression: '#>{t::DB.T}#' }, columns: COLUMNS, derived: [], rows: [], pivotOn: [],
  measures: [], sorts: [], epoch: 1, ...over,
});

describe('every window function and frame, built as a tree, is its text parsed', () => {
  it('each combination', async () => {
    const frames: (WindowFrame | undefined)[] = [undefined, 'partition', 'running', { lastRows: 1 }, { lastRows: 3 }];
    for (const meta of WINDOW_FUNCTIONS) {
      for (const frame of frames) {
        for (const partition of [[], ['p']]) {
          for (const order of [[], [{ column: 'q', direction: 'desc' as const }]]) {
            const w: WindowSpec = {
              fn: meta.fn, partition, order,
              ...(meta.column ? { column: 'r' } : {}),
              ...(frame === undefined ? {} : { frame }),
              ...(meta.fn === 'lag' || meta.fn === 'lead' ? { offset: 2 } : {}),
              ...(meta.fn === 'ntile' ? { buckets: 5 } : {}),
            };
            const s = base({ derived: [{ name: 'w', expression: '', window: w }] });
            const parsed = await parsedOf(s);
            let text: string;
            try {
              text = serialize(s);
            } catch (e) {
              assert.ok(e instanceof CubeRefusal, String(e));
              assert.throws(() => levelLambda(s, parsed), CubeRefusal);
              continue;
            }
            assert.equal(toJson(levelLambda(s, parsed)), await parse(`|${text}`), text);
          }
        }
      }
    }
  });
});

describe('every aggregate, built as a tree, is its text parsed', () => {
  it('each function, grouped and as a pivot cell', async () => {
    const fns: AggregateFn[] = ['sum', 'count', 'average', 'min', 'max', 'median', 'stdDevSample',
      'stdDevPopulation', 'varianceSample', 'variancePopulation', 'joinStrings', 'wavg', 'unique'];
    for (const fnName of fns) {
      const measure = { name: 'm', column: fnName === 'joinStrings' || fnName === 'unique' ? 'p' : 'r', fn: fnName,
        ...(fnName === 'wavg' ? { weight: 'q' } : {}) };
      for (const s of [
        base({ rows: ['p'], measures: [measure] }),
        base({ rows: [], pivotOn: ['p'], measures: [measure], pivotTotal: { placement: 'right' } }),
      ]) {
        const parsed = await parsedOf(s);
        const pivot = s.pivotOn.length > 0 ? { tuples: [['A'], ['B'], ['\u0000null']] } : undefined;
        const text = serialize(s, { level: s.rows.length, parent: [] }, pivot);
        assert.equal(toJson(levelLambda(s, parsed, { level: s.rows.length, parent: [] }, pivot)),
          await parse(`|${text}`), text);
      }
    }
  });
});

import { drillLambda } from '../src/query.ts';
import { drillQuery } from '../src/drill.ts';

describe('every drill, built as a tree, is its text parsed', () => {
  it('the grand total, a row path, a pivot path, a NULL key', async () => {
    for (const c of cases.filter((x) => x.snapshot.rows.length > 0 || x.snapshot.pivotOn.length > 0)) {
      const parsed = await parsedOf(c.snapshot);
      const rows = c.snapshot.rows;
      const pivotOn = c.snapshot.pivotOn;
      const requests = [
        { path: [] },
        { path: rows.map((_r, i) => (i === 1 ? '\u0000null' : `v${i}`)) },
        { path: rows.slice(0, 1).map(() => 'EMEA'), ...(pivotOn.length > 0 ? { pivotPath: ['2021'] } : {}), limit: 50 },
      ];
      for (const r of requests) {
        const text = drillQuery(c.snapshot, r);
        assert.equal(toJson(drillLambda(c.snapshot, parsed, r)), await parse(`|${text}`), text);
      }
    }
  });
});
