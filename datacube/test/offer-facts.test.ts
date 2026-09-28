// T5 (docs/DATACUBE_TYPES_TO_SERVER_2026_09_27.md): what a column is offered comes from the
// COMPILER -- src/generated/offer-facts.ts, DataCube's own level queries compiled per type --
// and one rule naming no type: an aggregate the compiler accepts whose result stays in the
// column's family.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { OFFER_FACTS } from '../src/generated/offer-facts.ts';
import { typeColumns } from '../src/plan.ts';
import type { QueryRunner } from '../src/runner.ts';
import { AGGREGATE_FNS, type AggregateFn, type CubeSnapshot } from '../src/snapshot.ts';
import { aggregatesFor } from '../src/ui/panel-column.ts';
import { accessor } from '../../pure-protocol/src/index.ts';
import { plannerFor } from './catalog-builder.ts';
import { liteParse, litePrint, row } from './lite-compiler.ts';

const offered = (type: string | undefined): AggregateFn[] => aggregatesFor(type).map((a) => a.value);

describe('aggregates offered by the compiler\'s answers', () => {
  it('a number takes every numeric aggregate, whatever numeric type the result is', () => {
    // an Integer's average is a Float and its deviation a Number: the same family
    const numeric: AggregateFn[] = ['sum', 'average', 'count', 'min', 'max', 'median', 'stdDevPopulation',
      'stdDevSample', 'variancePopulation', 'varianceSample', 'wavg', 'unique'];
    for (const type of ['Integer', 'Float', 'Decimal', 'Number']) assert.deepEqual(offered(type), numeric, type);
  });

  it('text: what keeps it text -- no count, whose result is a number', () => {
    assert.deepEqual(offered('String'), ['min', 'max', 'joinStrings', 'unique']);
  });

  it('dates, times, booleans and JSON: the ordered and the single value', () => {
    for (const type of ['StrictDate', 'DateTime', 'Date', 'StrictTime', 'Boolean', 'Variant']) {
      assert.deepEqual(offered(type), ['min', 'max', 'unique'], type);
    }
  });

  it('reads a type by its family, so a path or a precise primitive is the same column', () => {
    assert.deepEqual(offered('meta::pure::metamodel::variant::Variant'), offered('Variant'));
    assert.deepEqual(offered('meta::pure::precisePrimitives::BigInt'), offered('Integer'));
    assert.deepEqual(offered('meta::pure::precisePrimitives::Varchar'), offered('String'));
  });

  it('a type the compiler gave no facts for takes none; an untyped column all, until Apply', () => {
    assert.deepEqual(offered('Any'), []);
    assert.deepEqual(offered(undefined), [...AGGREGATE_FNS]);
  });
});

// The user, 2026-09-28: "if i want to make a calculated column that converts values to
// string it does let me do joinStrings".
describe('a calculated column that turns values into text offers joinStrings', () => {
  const MODEL = `###Relational
Database t::DB ( Table T ( qty INTEGER, desk VARCHAR(32) ) )
`;
  const planner = plannerFor(MODEL, '');
  const compiler: QueryRunner = {
    name: 'lite',
    run: async () => { throw new Error('typing runs nothing'); },
    compile: async () => undefined,
    relationType: (query) => planner.relationType(query),
    parse: liteParse,
    print: litePrint,
  };
  const cube = (body: string): CubeSnapshot => ({
    source: { query: accessor('t::DB', 'T') },
    columns: [{ name: 'qty', type: 'Integer' }, { name: 'desk', type: 'String' }],
    derived: [{ name: 'qty_text', lambda: row(body) }],
    rows: [],
    pivotOn: [],
    measures: [],
    sorts: [],
    epoch: 1,
  });

  it('typed String by the compiler before anything is offered, then joinStrings', async () => {
    const typed = await typeColumns(cube('$x.qty->toOne()->toString()'), compiler);
    const type = typed.snapshot.derived[0]?.type;
    assert.equal(type, 'String');
    assert.ok(offered(type).includes('joinStrings'));
    assert.ok(!offered(type).includes('sum'));
  });

  it('the number it came from offers no joinStrings', () => {
    assert.ok(!offered('Integer').includes('joinStrings'));
  });

  it('toString takes ONE value: on a column that may be empty the compiler refuses it, as upstream', async () => {
    // Pure's toString(Any[1]); a table column is [0..1]. Upstream's engine refuses the
    // same way ("Can't find a match for function 'toLower(Varchar(32)[0..1])'").
    await assert.rejects(typeColumns(cube('$x.qty->toString()'), compiler), /toString/);
  });
});

// PARITY with upstream DataCube (legend-studio packages/legend-data-cube, read 2026-09-28):
// each aggregate's `isCompatibleWithColumn`
// (src/stores/core/aggregation/DataCubeQueryAggregateOperation__*.tsx) over its column
// categories (DataCubeQueryEngine.ts `getDataType`). Copied here as the reference, never
// shipped; every difference below is named for a person to review.
describe('parity with upstream DataCube\'s aggregate offers', () => {
  type Category = 'Numeric' | 'Text' | 'Date' | 'Time' | 'Boolean';
  // getDataType: DateTime and StrictTime are its Time; anything unlisted, Variant too, is Text
  const UPSTREAM_CATEGORY: Readonly<Record<string, Category>> = {
    Integer: 'Numeric', Float: 'Numeric', Decimal: 'Numeric', Number: 'Numeric',
    StrictDate: 'Date', Date: 'Date', DateTime: 'Time', StrictTime: 'Time',
    Boolean: 'Boolean', String: 'Text', Variant: 'Text',
  };
  const NUMERIC: readonly Category[] = ['Numeric'];
  const UPSTREAM: Readonly<Partial<Record<AggregateFn, readonly Category[]>>> = {
    sum: NUMERIC, average: NUMERIC, count: NUMERIC, min: NUMERIC, max: NUMERIC,
    stdDevPopulation: NUMERIC, stdDevSample: NUMERIC, variancePopulation: NUMERIC, varianceSample: NUMERIC,
    joinStrings: ['Text'],
    unique: ['Text', 'Numeric', 'Date', 'Time'],
    // median and wavg: this DataCube's own; upstream has neither
  };

  it('differs only where named', () => {
    const differences: string[] = [];
    for (const type of Object.keys(OFFER_FACTS)) {
      const ours = new Set(offered(type));
      const category = UPSTREAM_CATEGORY[type];
      assert.ok(category, `no upstream category for ${type}`);
      for (const fn of AGGREGATE_FNS) {
        const theirs = UPSTREAM[fn]?.includes(category) ?? false;
        if (ours.has(fn) !== theirs) differences.push(`${type} ${fn}: ${ours.has(fn) ? 'ours only' : 'upstream only'}`);
      }
    }
    assert.deepEqual(differences.sort(), [
      // min/max keep any ordered value's type (Pure's collection::min<X>): "the latest trade
      // date", the first name alphabetically -- offered here since 2026-09-25 for text and dates
      'Date max: ours only', 'Date min: ours only',
      'DateTime max: ours only', 'DateTime min: ours only',
      'StrictDate max: ours only', 'StrictDate min: ours only',
      'StrictTime max: ours only', 'StrictTime min: ours only',
      'String max: ours only', 'String min: ours only',
      // new with T5, the compiler's answer: TO REVIEW (upstream offers a boolean nothing, and
      // JSON what text takes)
      'Boolean max: ours only', 'Boolean min: ours only', 'Boolean unique: ours only',
      'Variant max: ours only', 'Variant min: ours only',
      // the compiler refuses joinStrings of JSON (it takes String): upstream offers a query that fails
      'Variant joinStrings: upstream only',
      // this DataCube's own aggregates
      'Decimal median: ours only', 'Decimal wavg: ours only',
      'Float median: ours only', 'Float wavg: ours only',
      'Integer median: ours only', 'Integer wavg: ours only',
      'Number median: ours only', 'Number wavg: ours only',
    ].sort());
  });
});
