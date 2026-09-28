// The two bugs the first real end-to-end run found.
//
// Both were invisible to the whole unit suite, and both were
// invisible to the demo, because the demo's shim planner made the
// broken thing accidentally work: its source was the bare SQL
// identifier `trades`, so hand-built SQL parsed and a redirect that
// never happened changed nothing anyone could see.
//
// Against the real planner the source is `#>{trades::DB.TRADES}#`
// and both failures are immediate.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CubeController, type Planner } from '../src/cube.ts';
import type { Plan, PlanColumn } from '../src/relation-type.ts';
import type { ResultTable } from '../src/result.ts';
import type { CubeSnapshot } from '../src/snapshot.ts';
import { TreeState } from '../src/tree.ts';
import { FakeEngine } from './fake-engine.ts';
import { fakeParse, fakePrint } from './fake-planner.ts';
import { toJson, type ColSpecArrayInstance, type Lambda } from '../../pure-protocol/src/index.ts';
import { accessor } from '../../pure-protocol/src/index.ts';

const SNAPSHOT: CubeSnapshot = {
  source: { query: accessor('trades::DB', 'TRADES') },
  columns: [
    { name: 'region', type: 'String' },
    { name: 'notional', type: 'Float' },
  ],
  derived: [],
  rows: [],
  pivotOn: [],
  measures: [{ name: 'notional', column: 'notional', fn: 'sum' }],
  sorts: [],
  epoch: 1,
};

function result(epoch: number, n = 2): ResultTable {
  return {
    columns: [
      { name: 'region', type: 'String', values: ['EMEA', 'AMER'].slice(0, n) },
      { name: 'notional', type: 'Float', values: [600, 400].slice(0, n) },
    ],
    rowCount: n,
    epoch,
    elapsedMs: 1,
  };
}

/** Records every query it is asked to plan (as its JSON), and every SQL it emits. */
class RecordingPlanner implements Planner {
  readonly pure: string[] = [];
  readonly queries: Lambda[] = [];
  async plan(query: Lambda): Promise<Plan> {
    this.queries.push(query);
    this.pure.push(toJson(query));
    // Deliberately does NOT echo the query: a test here asserts that
    // no Pure reaches the engine, and a stub that pasted the
    // query into its own output would fail that for the wrong
    // reason.
    return { sql: `SELECT * FROM planned_${this.pure.length}`, columns: [] };
  }
  async relationType(): Promise<PlanColumn[]> {
    return [];
  }
  parse = fakeParse;
  print = fakePrint;
}

/** A `source->select(~[...])` query's source (as the stand-in parse holds it) and columns. */
function selectOf(q: Lambda): { readonly source: unknown; readonly columns: readonly string[] } | undefined {
  const f = q.body[0];
  if (f?._type !== 'func' || f.function !== 'select') return undefined;
  const [source, columns] = f.parameters;
  return {
    source: source === undefined ? undefined : toJson(source),
    columns: (columns as ColSpecArrayInstance).value.colSpecs.map((c) => c.name),
  };
}

/** Where these cubes snap: a table the model would declare. */
const SNAP_TARGET = { table: 'TRADES_SNAP', source: accessor('trades::DB', 'TRADES_SNAP') };

class RecordingEngine extends FakeEngine {
  readonly name = 'recording';
  readonly sql: string[] = [];
  async answer(sql: string, epoch: number): Promise<ResultTable> {
    this.sql.push(sql);
    // `SELECT count(*)` is the snap preflight; it wants one number.
    if (/count\(\*\)/i.test(sql)) {
      return {
        columns: [{ name: 'n', type: 'Integer', values: [2] }],
        rowCount: 1,
        epoch,
        elapsedMs: 0,
      };
    }
    return result(epoch);
  }
}

/** A state to run: the snapshot, no groups open. */
const at = (snapshot: CubeSnapshot) => ({ snapshot, tree: TreeState.empty() });

describe('snapping goes through the planner', () => {
  it('plans a select rather than building SQL by hand', async () => {
    // It used to emit `SELECT "region", "notional" FROM <source>`,
    // which is only SQL when the source is a table name. With a
    // Pure accessor it produced `... FROM #>{trades::DB.TRADES}#`
    // and DuckDB rejected it.
    const planner = new RecordingPlanner();
    const engine = new RecordingEngine();
    const c = new CubeController(engine, planner, { snapTarget: SNAP_TARGET });
    const ran: CubeSnapshot = SNAPSHOT;
    await c.run(at(ran));
    planner.pure.length = 0;
    planner.queries.length = 0;

    await c.snap(ran, 'test');

    // A select over the LIVE source, as a query -- the columns being
    // whatever the snapshot actually references.
    assert.ok(
      planner.queries.some((q) => {
        const s = selectOf(q);
        return s?.source === toJson(accessor('trades::DB', 'TRADES')) && s.columns.length > 0;
      }),
      `planner saw: ${planner.pure.join(' ;; ')}`,
    );
    assert.equal(
      engine.sql.some((q) => q.includes('#>{')),
      false,
      'no Pure may reach the engine as SQL',
    );
  });

  it('snaps EVERY source column, so any later view answers from the snap', async () => {
    const planner = new RecordingPlanner();
    const c = new CubeController(new RecordingEngine(), planner, { snapTarget: SNAP_TARGET });
    // a measure over one column: the other is still copied
    const ran: CubeSnapshot = SNAPSHOT;
    await c.run(at(ran));
    planner.queries.length = 0;
    await c.snap(ran, 'test');
    assert.ok(planner.queries.some((q) => JSON.stringify(selectOf(q)) === JSON.stringify(
      { source: toJson(accessor('trades::DB', 'TRADES')), columns: ['region', 'notional'] })),
    `planner saw: ${planner.pure.join(' ;; ')}`);
  });

  it('snaps a FRESH cube, one that groups and measures nothing', async () => {
    // It used to select only the columns the view referenced -- none, for a
    // freshly opened table -- and the planner refused `select(~[])`.
    const planner = new RecordingPlanner();
    const c = new CubeController(new RecordingEngine(), planner, { snapTarget: SNAP_TARGET });
    const ran: CubeSnapshot = { ...SNAPSHOT, measures: [], columns: [...SNAPSHOT.columns, { name: 'trade date', type: 'StrictDate' }] };
    await c.run(at(ran));
    planner.queries.length = 0;
    await c.snap(ran, 'test');
    assert.ok(planner.queries.some((q) => JSON.stringify(selectOf(q)) === JSON.stringify(
      { source: toJson(accessor('trades::DB', 'TRADES')), columns: ['region', 'notional', 'trade date'] })),
    `planner saw: ${planner.pure.join(' ;; ')}`);
    assert.equal(c.snaps.isSnapped, true);
  });

  it('materialises what the planner returned', async () => {
    const planner = new RecordingPlanner();
    const engine = new RecordingEngine();
    const c = new CubeController(engine, planner, { snapTarget: SNAP_TARGET });
    const ran: CubeSnapshot = SNAPSHOT;
    await c.run(at(ran));
    await c.snap(ran, 'test');

    assert.ok(
      engine.sql.some(
        (q) => /CREATE OR REPLACE TABLE/i.test(q) && q.includes('planned_'),
      ),
      engine.sql.join(' ;; '),
    );
  });
});

describe('the snapped plane actually redirects', () => {
  it('reads the SNAP after snapping, not the live source', async () => {
    // `sourceFor` existed and nothing called it, so the snap was
    // cosmetic: a table was materialised and every later query
    // still went to the live source.
    const planner = new RecordingPlanner();
    const engine = new RecordingEngine();
    const c = new CubeController(engine, planner, {
      snapTarget: {
        table: 'TRADES_SNAP',
        source: accessor('trades::DB', 'TRADES_SNAP'),
      },
    });
    const ran: CubeSnapshot = SNAPSHOT;
    await c.run(at(ran));
    await c.snap(ran, 'test');
    planner.pure.length = 0;

    await c.run(at(ran));
    assert.ok(
      planner.pure.every((p) => p.includes('TRADES_SNAP')),
      `still reading live: ${planner.pure.join(' ;; ')}`,
    );
  });

  it('goes back to the live source on release', async () => {
    const planner = new RecordingPlanner();
    const engine = new RecordingEngine();
    const c = new CubeController(engine, planner, {
      snapTarget: {
        table: 'TRADES_SNAP',
        source: accessor('trades::DB', 'TRADES_SNAP'),
      },
    });
    const ran: CubeSnapshot = SNAPSHOT;
    await c.run(at(ran));
    await c.snap(ran, 'test');
    await c.release();
    planner.pure.length = 0;

    await c.run(at(ran));
    assert.ok(
      planner.pure.every(
        (p) => p.includes('"TRADES"') && !p.includes('TRADES_SNAP'),
      ),
      planner.pure.join(' ;; '),
    );
  });

  it('refuses to snap when the host names no table to snap into', async () => {
    // A generated table name was a bare SQL identifier: no compiler can
    // read it as a relation, so the snapped cube could not be planned.
    const c = new CubeController(new RecordingEngine(), new RecordingPlanner());
    const ran: CubeSnapshot = SNAPSHOT;
    await c.run(at(ran));
    await assert.rejects(() => c.snap(ran, 'test'), /names no table to freeze a snapshot into/);
    assert.equal(c.snaps.isSnapped, false);
  });
});
