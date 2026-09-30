// A PAGE OF SEVERAL CUBES (plan F6): the host the dashboards will grow from.
//
// One DuckDB and one planner, shared; each tile its own CubeApp. Each cube's shortcuts, drags
// and windows are its own (the design's blockers #1, #4, #8), removing a tile disposes its cube
// (#3), and the page listens to every cube at once (#5). The windows float over the whole page
// (`windowHost`), not inside a tile.
//
//   bazel build //datacube:site, then open demo/page.html
//   bazel run //datacube:verify_page checks it in a real browser.

import { CubeApp } from '../src/app.ts';
import type { CubeSnapshot } from '../src/snapshot.ts';
import { sourceColumns } from '../src/source-columns.ts';
import { WasmPlanner } from '../src/wasm-planner.ts';
import { demoConfiguration, generateTrades, loadModel, must, RUNTIME, SNAP_TARGET, SOURCE, startDuckDb } from './boot.ts';

/** What the browser harness reads: the cubes by tile, and every change each has told the page. */
interface PageSignal {
  ready: boolean;
  cubes: Record<string, CubeApp>;
  changes: Record<string, number>;
}

async function main(): Promise<void> {
  const status = must('status');
  const page = must('page');
  const signal: PageSignal = { ready: false, cubes: {}, changes: {} };
  (window as unknown as { __page?: PageSignal }).__page = signal;

  status.textContent = 'starting DuckDB and the planner…';
  const planner = new WasmPlanner({
    model: await loadModel(),
    runtime: RUNTIME,
    workerUrl: new URL('./planner-worker.js', import.meta.url).href,
  });
  const [{ engine }] = await Promise.all([startDuckDb(), planner.warmUp()]);
  await generateTrades(engine);

  const columns = await sourceColumns(planner, SOURCE, [{ name: 'year', kind: 'dimension' }]);
  const base: CubeSnapshot = {
    source: { query: SOURCE },
    columns,
    derived: [],
    rows: [],
    pivotOn: [],
    measures: [],
    sorts: [],
    epoch: 1,
  };
  const tiles: { id: string; title: string; snapshot: CubeSnapshot }[] = [
    { id: 'by-region', title: 'Notional by region', snapshot: {
      ...base, rows: ['region', 'desk'], measures: [{ name: 'notional', column: 'notional', fn: 'sum' }],
    } },
    { id: 'by-desk', title: 'P&L by desk and year', snapshot: {
      ...base, rows: ['desk'], pivotOn: ['year'], measures: [{ name: 'pnl', column: 'pnl', fn: 'sum' }],
    } },
  ];

  for (const t of tiles) {
    const tile = document.createElement('section');
    tile.className = 'tile';
    tile.dataset['tile'] = t.id;
    const head = document.createElement('div');
    head.className = 'tile-head';
    const title = document.createElement('span');
    title.textContent = t.title;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'tile-remove';
    remove.textContent = 'Remove';
    const body = document.createElement('div');
    body.className = 'tile-body';
    head.append(title, remove);
    tile.append(head, body);
    page.append(tile);

    const cube = new CubeApp(body, t.snapshot, {
      engine,
      planner,
      snapTarget: SNAP_TARGET,
      configuration: demoConfiguration(t.title),
      windowHost: page,
    });
    signal.cubes[t.id] = cube;
    signal.changes[t.id] = 0;
    // the page is one listener among any number (blocker #5)
    cube.on('change', () => { signal.changes[t.id] = (signal.changes[t.id] ?? 0) + 1; });
    remove.addEventListener('click', () => {
      cube.dispose();
      tile.remove();
      delete signal.cubes[t.id];
    });
    await cube.open();
  }
  status.textContent = `${tiles.length} cubes, one DuckDB, one planner`;
  signal.ready = true;
}

void main().catch((e) => {
  must('status').textContent = `failed to start: ${e instanceof Error ? e.message : String(e)}`;
  throw e;
});
