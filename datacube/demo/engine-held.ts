// THE ENGINE'S OWN DATA, which the engine RUNS (`index.html?planner=engine&data=engine`).
//
// The other two entry points plan and execute in two steps: Pure to
// SQL, then DuckDB-WASM runs the SQL in this tab, and the data is in
// the tab. This one asks the engine to run the query against a store
// the browser cannot reach -- upstream's uncached path -- and renders
// the rows it sends back. The SQL on screen is what the engine
// reports having run; nothing here runs it.
//
// So there is no DuckDB on this page, no upload (the data is not
// ours to replace) and no snap (freezing a cube means materialising
// into a local store, which this plane does not have). Each of those
// absences is the same fact stated once.
//
//   ~/legend/engine-dist: the shaded jar needs no JDK, Maven or
//   Docker install -- see the recipe in memory. Then:
//     java -cp legend-engine-server-*-shaded.jar \
//       org.finos.legend.engine.server.Server server userTestConfig.json
//   and open demo/index.html?planner=engine&data=engine.
//
// The engine is a PLANNER like any other on the one page (main.ts): there it plans and this tab
// runs. Here the DATA is the engine's (an H2 table this tab cannot reach), so the engine runs the
// query too -- where the data is decides where the query runs (the user, 2026-09-30). Until a
// page holds several sources (New > Source...), this is how the page reaches it.

import { CubeApp } from '../src/app.ts';
import { LegendEngineExecutor } from '../src/engine-remote.ts';
import { RemoteRun } from '../src/runner.ts';
import { pageConfig } from './page-config.ts';
import type { CubeSnapshot } from '../src/snapshot.ts';
import {
  DEMO_DIMENSIONS,
  demoConfiguration,
  goToPlane,
  must,
  planeMenu,
  refusePlanner,
} from './boot.ts';
import { sourceColumns } from '../src/source-columns.ts';
import { accessor } from '../../pure-protocol/src/index.ts';

/** The H2-backed model: its connection seeds its own table. */
const MODEL = './trades-h2.pure';
const RUNTIME = 'trades::h2::RT';
const SOURCE = accessor('trades::h2::DB', 'TRADES_SCHEMA', 'TRADES');

/**
 * What this page knows about the engine's table that the compiler does not: `year` is
 * an identifier, a dimension. Every column and its type come from the engine's own
 * `lambdaRelationType` of the source (`sourceColumns`), never from this page.
 */
const DECLARED = [{ name: 'year', kind: 'dimension' as const }];

/** The engine's own data, run BY the engine (`?planner=engine&data=engine`). */
export async function bootEngineHeld(): Promise<void> {
  // the close button on the query window, wired by delegation (boot wires its own)
  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const close = target.closest('.hostwin-close');
    if (!(close instanceof HTMLElement)) return;
    const id = close.dataset['win'];
    if (id) must(id).hidden = true;
  });
  const status = must('status');
  status.textContent = 'reaching the engine…';
  // where legend-engine runs: config.json, or ?engine= for one visit
  const legendEngine = (await pageConfig()).legendEngine;
  if (!legendEngine) {
    refusePlanner('legend-engine', '', 'set "legendEngine" in config.json, or add ?engine=URL');
  }

  // IS IT THERE? Asked before the cube is built, because a plane
  // whose engine is absent has nothing to show and should say which
  // engine it wanted -- not render an empty grid.
  try {
    const health = await fetch(`${legendEngine}/api/server/v1/info`, {
      signal: AbortSignal.timeout(2500),
    });
    if (!health.ok) throw new Error(`${health.status}`);
  } catch {
    refusePlanner('legend-engine', legendEngine, 'start it (the shaded jar needs no JDK, Maven or Docker install)');
  }

  const model = await (await fetch(MODEL)).text();
  const executor = new LegendEngineExecutor({
    baseUrl: legendEngine,
    model,
    runtime: RUNTIME,
  });

  const snapshot: CubeSnapshot = {
    source: { query: SOURCE },
    columns: await sourceColumns(executor, SOURCE, DECLARED),
    derived: [],
    rows: ['region', 'desk'],
    pivotOn: [],
    measures: [{ name: 'notional', column: 'notional', fn: 'sum' }],
    sorts: [],
    epoch: 1,
  };

  let printed = 0;
  const app = new CubeApp(must('app'), snapshot, {
    // ONE ARRANGEMENT, chosen by which page you opened. The cube
    // cannot change it while it runs.
    runner: new RemoteRun(executor),
    configuration: demoConfiguration('Trades (engine)'),
    dimensions: DEMO_DIMENSIONS.map((d) => ({
      name: d.name,
      columns: [...d.columns],
    })),
    showColumnZone: true,
    hostStatus: (slot) => slot.append(status),
    hostMenu: () => [
      { id: 'host.query', label: 'Generated Pure & SQL…', section: 'view' as const },
      ...planeMenu(),
    ],
    onHostMenu: (item) => {
      if (item.id === 'host.query') {
        const win = must('querywin');
        win.hidden = !win.hidden;
      }
      goToPlane(item.id);
    },
    onView: (view) => {
      // The query as the compiler prints it; a later view's print wins.
      const printing = (printed += 1);
      void app.controller.print(view.query, 'STANDARD').then(
        (text) => { if (printing === printed) must('pure').textContent = text; },
        (error: unknown) => { if (printing === printed) must('pure').textContent = String(error); },
      );
      // The engine's own report of the SQL it ran, which is the only
      // SQL this page ever sees.
      must('sql').textContent = view.sql
        || '-- the engine reported no SQL for this query';
    },
    onStatus: (text, kind) => {
      if (kind !== 'error') return;
      status.textContent = text;
      status.classList.add('bad');
    },
    writeClipboard: (text) => navigator.clipboard?.writeText(text),
    download: (name, mime, text) => {
      const url = URL.createObjectURL(new Blob([typeof text === 'string' ? text : text.slice()], { type: mime }));
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    },
  });

  status.textContent = 'engine';
  await app.open();
}
