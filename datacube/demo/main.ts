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

import { boot, chosenPlane, loadModel } from './boot.ts';
import { plannerFor } from './planners.ts';

async function start(): Promise<void> {
  const plane = chosenPlane();
  await boot(async () => plannerFor(plane, await loadModel()));
}

void start().catch((e) => {
  const s = document.getElementById('status');
  if (s) {
    s.textContent = `failed to start: ${e instanceof Error ? e.message : e}`;
    s.classList.add('bad');
  }
  throw e;
});
