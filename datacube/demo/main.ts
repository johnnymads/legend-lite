// THE DEMO: one page, three planners (the user, 2026-09-30).
//
// The in-tab planner (legend-lite's compiler as WebAssembly), legend-lite on a server and
// legend-engine are three addresses of the SAME service -- pure/v1's generatePlan, the same
// request and the same answer -- so they are one page with one setting, `?planner=`, read in one
// place (`chosenPlane`, boot.ts) and named in the status bar. Each plans a query to SQL; the
// SQL runs where the DATA is: DuckDB in this tab for what the tab holds (the generated trades, an
// opened file, a snapped copy). So Snap, opening a file and the Generated Pure & SQL window are
// the same on every planner.
//
// There is no fallback. A planner that does not answer is SAID (`refusePlanner`) and the page
// stops: it never quietly plans somewhere else (test/guardrails.test.ts).
//
//   bazel build //datacube:site, then open demo/index.html[?planner=remote|engine]

import { boot, chosenPlane, loadModel, refusePlanner, RUNTIME, SNAP_TARGET, SOURCE } from './boot.ts';
import type { Engine } from './boot.ts';
import { pageConfig } from './page-config.ts';
import { UpstreamPlanner } from '../src/planner.ts';
import { WasmPlanner } from '../src/wasm-planner.ts';

const WORKER = (): string => new URL('./planner-worker.js', import.meta.url).href;

/** The planner in this tab: legend-lite's compiler as WebAssembly, off the main thread. */
async function inTab(model: string): Promise<Engine> {
  const planner = new WasmPlanner({
    model,
    runtime: RUNTIME,
    // Off the main thread: building the boot layer is ~600ms of synchronous WebAssembly, which on
    // the main thread froze the page and starved DuckDB's startup.
    workerUrl: WORKER(),
  });
  // Pay the cold cost (~1.3s, the boot layer) here rather than on the first interaction; `boot`
  // starts this concurrently with DuckDB, so most of it lands inside a wait the page was making.
  await planner.warmUp();
  return {
    planner,
    source: SOURCE,
    snapTarget: SNAP_TARGET,
    label: 'local',
    models: {
      fromCatalog: (table) => planner.databaseFromCatalog(table),
      use: (next, runtime) => planner.useModel(next, runtime),
    },
  };
}

/**
 * A planner on a server -- legend-lite, or legend-engine: the same API at another address. Asked
 * whether it is there first; not there, the page says so and stops.
 */
async function onServer(model: string, which: 'remote' | 'engine'): Promise<Engine> {
  const config = await pageConfig();
  const url = which === 'remote' ? config.legendLite : config.legendEngine;
  const name = which === 'remote' ? 'legend-lite' : 'legend-engine';
  const start = which === 'remote'
    ? 'start it with `bazel run //core:server`'
    : 'start it (the shaded jar needs no JDK, Maven or Docker install)';
  if (!url) refusePlanner(name, '', `set "${which === 'remote' ? 'legendLite' : 'legendEngine'}" in config.json, then ${start}`);
  const health = which === 'remote' ? `${url}/health` : `${url}/api/server/v1/info`;
  const answered = await fetch(health, { signal: AbortSignal.timeout(2500) }).then((r) => r.ok, () => false);
  if (!answered) refusePlanner(name, url, start);
  const planner = new UpstreamPlanner({ baseUrl: url, model, runtime: RUNTIME });
  // A FILE OPENED HERE: its Database is written by legend-lite's compiler in this tab (a model,
  // not a plan -- loaded only when a file is first opened), and the server plans against the model
  // that grows to hold it (each request carries the model).
  let catalog: WasmPlanner | undefined;
  return {
    planner,
    source: SOURCE,
    snapTarget: SNAP_TARGET,
    label: which,
    models: {
      fromCatalog: (table) => (catalog ??= new WasmPlanner({ model, runtime: RUNTIME, workerUrl: WORKER() }))
        .databaseFromCatalog(table),
      use: (next, runtime) => planner.useModel(next, runtime),
    },
  };
}

async function start(): Promise<void> {
  const plane = chosenPlane();
  await boot(async () => {
    const model = await loadModel();
    return plane === 'local' ? inTab(model) : onServer(model, plane);
  });
}

void start().catch((e) => {
  const s = document.getElementById('status');
  if (s) {
    s.textContent = `failed to start: ${e instanceof Error ? e.message : e}`;
    s.classList.add('bad');
  }
  throw e;
});
