// The page: read config.json, start legend-lite's planner in a worker (grammar and typing in the
// tab), load each project's model, and hand the app its context. Execution and the query store
// are the engine's (config.engine: legend-lite's server, or legend-engine).

import { AppContext, gavOf, type AppConfig, type LoadedProject } from '../src/app/context.ts';
import { App } from '../src/app/app.ts';
import { HttpEngine, RoutedEngine, type Engine, type Grammar } from '../src/backend/engine.ts';
import { WasmGrammar, WorkerPort } from '../src/backend/wasm-grammar.ts';
import { ModelGraph } from '../src/model/graph.ts';
import { h, mount } from '../src/ui/dom.ts';

async function boot(): Promise<void> {
  const root = document.getElementById('app')!;
  mount(root, h('div', { style: 'padding:40px; color:var(--text-2)' }, h('span', { class: 'q-spinner' }), ' Starting Legend Query…'));
  const config = await (await fetch('./config.json', { cache: 'no-cache' })).json() as AppConfig;
  const http = new HttpEngine(config.engine);
  const planner = config.planner
    ? new WasmGrammar(new WorkerPort(new URL(config.planner.worker, location.href), config.planner.vendor))
    : undefined;
  const grammar: Grammar = planner ?? http;
  const engine: Engine = planner ? new RoutedEngine(planner, http) : http;

  const projects: LoadedProject[] = await Promise.all(config.projects.map(async (p) => {
    const texts = await Promise.all(p.models.map(async (m) => {
      const res = await fetch(m, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`could not load the model ${m}: ${res.status}`);
      return res.text();
    }));
    const code = texts.join('\n');
    return { config: p, gav: gavOf(p), context: { _type: 'text', code }, graph: new ModelGraph(await grammar.modelJson(code)) };
  }));
  const user = await http.currentUser().catch(() => 'anonymous');
  const ctx = new AppContext(config, engine, http, planner, projects, user);
  // warm the planner on the first model while the person looks at the landing page
  if (planner && projects[0]) void planner.warm(projects[0].context).catch(() => undefined);
  new App(ctx, root).start();
}

boot().catch((e: unknown) => {
  const root = document.getElementById('app')!;
  mount(root, h('div', { style: 'padding:40px' },
    h('h2', null, 'Legend Query could not start'),
    h('div', { class: 'q-error-box' }, e instanceof Error ? e.message : String(e)),
    h('p', { class: 'q-muted' }, 'Is the engine in demo/config.json running? (legend-lite: bazel run //core:server, with LEGEND_QUERY_STORE set)')));
});
