// The app: the header, and the screen the address names -- landing, a data space, or the editor
// on a new, curated, service or saved query. Leaving a query with unsaved changes asks first.

import { loadLambda, parametersOf } from '../builder/load.ts';
import { emptyQuery, type ClassSource } from '../builder/state.ts';
import { renderDataSpace } from '../ui/dataspace.ts';
import { h, mount, confirmDialog } from '../ui/dom.ts';
import { renderEditor, type EditorHandle } from '../ui/editor.ts';
import { renderLanding } from '../ui/landing.ts';
import { openQueryDialog } from '../ui/queries.ts';
import { recent, type AppContext, type LoadedProject } from './context.ts';
import { openQuery } from './persist.ts';
import { formatRoute, parseRoute, type Route } from './routes.ts';
import { Session } from './session.ts';
import { findAll, isFunction, type Lambda } from '../../../pure-protocol/src/index.ts';

export class App {
  readonly #ctx: AppContext;
  readonly #header = h('div', { class: 'q-header' });
  readonly #main = h('div', { class: 'q-main' });
  #editor: EditorHandle | undefined;
  #session: Session | undefined;
  #hash = '';

  constructor(ctx: AppContext, root: HTMLElement) {
    this.#ctx = ctx;
    mount(root, h('div', { class: 'q-app' }, this.#header, this.#main));
    window.addEventListener('hashchange', () => void this.#navigate());
    window.addEventListener('beforeunload', (e) => {
      if (this.#session?.changed) { e.preventDefault(); e.returnValue = ''; }
    });
  }

  start(): void {
    void this.#navigate();
  }

  async #navigate(): Promise<void> {
    const hash = location.hash || '#/';
    if (hash === this.#hash) return;
    if (this.#session?.changed && !this.#savedJustNow(hash)) {
      if (!await confirmDialog('Unsaved changes', 'Leave this query? Its unsaved changes will be lost.', 'Leave')) {
        history.replaceState(null, '', this.#hash);
        return;
      }
    }
    this.#hash = hash;
    this.#editor?.dispose();
    this.#editor = undefined;
    this.#session = undefined;
    const route = parseRoute(hash);
    this.#drawHeader(undefined);
    try {
      await this.#render(route);
    } catch (e) {
      mount(this.#main, h('div', { class: 'q-landing' }, h('h1', null, 'Could not open this'), h('div', { class: 'q-error-box' }, (e as Error).message),
        h('p', null, h('a', { href: '#/' }, 'Back to the start'))));
    }
  }

  /** Save As moved us to the saved query's own address: not a navigation away. */
  #savedJustNow(hash: string): boolean {
    const r = parseRoute(hash);
    return r.kind === 'edit' && this.#session?.saved?.id === r.id;
  }

  #drawHeader(editor: EditorHandle | undefined): void {
    mount(this.#header,
      h('div', { class: 'q-brand', onclick: () => { location.hash = '#/'; } }, 'Legend ', h('span', null, 'Query')),
      editor ? editor.header : h('span', { class: 'q-spacer' }),
      editor ? null : h('button', { class: 'q-btn', onclick: () => openQueryDialog(this.#ctx) }, 'Open a query'),
      h('button', {
        class: 'q-icon-btn', title: 'Light / dark',
        onclick: () => {
          const el = document.documentElement;
          const dark = el.dataset.theme === 'dark' || (!el.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
          el.dataset.theme = dark ? 'light' : 'dark';
        },
      }, '◐'));
  }

  #edit(session: Session): void {
    this.#session = session;
    this.#editor = renderEditor(this.#main, this.#ctx, session);
    this.#drawHeader(this.#editor);
    this.#editor.header.style.flex = '1';
  }

  async #render(r: Route): Promise<void> {
    const app = this.#ctx;
    switch (r.kind) {
      case 'home': renderLanding(this.#main, app); return;
      case 'notFound': mount(this.#main, h('div', { class: 'q-landing' }, h('h1', null, 'Nothing here'), h('a', { href: '#/' }, 'Back to the start'))); return;
      case 'dataSpaceViewer': renderDataSpace(this.#main, app, app.project(r.gav), r.path); return;
      case 'dataSpace': {
        const p = app.project(r.gav);
        const ds = p.graph.dataSpaces.get(r.path);
        if (!ds) throw new Error(`no data space ${r.path} in ${r.gav}`);
        const ctxName = r.context ?? ds.defaultExecutionContext;
        const ec = ds.executionContexts.find((c) => c.name === ctxName);
        if (!ec?.mapping || !ec.defaultRuntime) throw new Error(`the data space has no execution context '${ctxName}' with a mapping and runtime`);
        recent.dataSpace(p.gav, r.path, ctxName);
        const coverage = await app.coverage(p, ec.mapping.path);
        const cls = r.class ?? coverage.rootClasses()[0];
        if (!cls) throw new Error(`the mapping ${ec.mapping.path} maps no class`);
        const source: ClassSource = {
          kind: 'class', class: cls, mapping: ec.mapping.path, runtime: r.runtime ?? ec.defaultRuntime.path,
          dataSpace: { path: r.path, context: ctxName },
        };
        this.#edit(new Session(p, emptyQuery(source)));
        return;
      }
      case 'dataSpaceTemplate': {
        const p = app.project(r.gav);
        const ds = p.graph.dataSpaces.get(r.path);
        const execs = ds?.executables ?? [];
        const e = execs.find((x) => x.id === r.template) ?? execs[Number(r.template)];
        if (!ds || !e || e._type !== 'dataSpaceTemplateExecutable') throw new Error(`no curated query '${r.template}' in ${r.path}`);
        const ctxName = e.executionContextKey ?? ds.defaultExecutionContext;
        const ec = ds.executionContexts.find((c) => c.name === ctxName)!;
        this.#edit(this.#sessionFrom(p, e.query, { mapping: ec.mapping!.path, runtime: ec.defaultRuntime!.path, dataSpace: { path: r.path, context: ctxName } }));
        return;
      }
      case 'manual': {
        const p = app.project(r.gav);
        const cls = r.class ?? (await app.coverage(p, r.mapping)).rootClasses()[0];
        if (!cls) throw new Error(`the mapping ${r.mapping} maps no class`);
        this.#edit(new Session(p, emptyQuery({ kind: 'class', class: cls, mapping: r.mapping, runtime: r.runtime })));
        return;
      }
      case 'service': {
        const p = app.project(r.gav);
        const svc = p.graph.services.get(r.service);
        const ex = svc?.execution;
        if (!svc || !ex?.func || !ex.mapping || !ex.runtime?.runtime) throw new Error(`the service ${r.service} has no single execution with a mapping and runtime`);
        this.#edit(this.#sessionFrom(p, ex.func, { mapping: ex.mapping, runtime: ex.runtime.runtime }));
        return;
      }
      case 'edit': {
        const q = await app.store.get(r.id);
        recent.query(q.id);
        this.#edit(await openQuery(app, q, r.parameters));
        return;
      }
    }
  }

  /** A curated or service query opened in the form, or as text when the form cannot show it. */
  #sessionFrom(p: LoadedProject, lambda: Lambda, ctx: { mapping: string; runtime: string; dataSpace?: ClassSource['dataSpace'] }): Session {
    const loaded = loadLambda(p.graph, lambda, ctx);
    if (loaded.ok) return new Session(p, loaded.query);
    const getAll = findAll(lambda, isFunction).find((f) => f.function === 'getAll' || f.function.endsWith('::getAll'));
    const target = getAll?.parameters[0];
    const cls = target?._type === 'packageableElementPtr' ? target.fullPath : '';
    const source: ClassSource = { kind: 'class', class: cls, mapping: ctx.mapping, runtime: ctx.runtime, ...(ctx.dataSpace ? { dataSpace: ctx.dataSpace } : {}) };
    return new Session(p, { ...emptyQuery(source), parameters: parametersOf(lambda) }, undefined, { lambda, reason: loaded.reason });
  }
}

export { formatRoute };
