// The query editor: setup and explorer on the left (with parameters), columns and filter above,
// results below; the header carries undo/redo, the Pure text, save / save as / open.

import type { AppContext, Coverage } from '../app/context.ts';
import { formatRoute } from '../app/routes.ts';
import type { Session } from '../app/session.ts';
import { emptyQuery, type ClassSource } from '../builder/state.ts';
import { simpleName } from '../model/graph.ts';
import { confirmDialog, h, mount, select, type Child } from './dom.ts';
import { renderColumns } from './columns.ts';
import { Explorer } from './explorer.ts';
import { renderFilter } from './filter.ts';
import { renderParameters } from './params.ts';
import { openQueryDialog, save, saveAs } from './queries.ts';
import { Results } from './results.ts';
import { textDialog } from './text.ts';

export interface EditorHandle {
  readonly header: HTMLElement;
  dispose(): void;
}

/** The classes a source offers: a data space's (its mapping's roots, narrowed by `elements`), or every mapped class. */
function offeredClasses(app: AppContext, session: Session, coverage: Coverage | undefined): string[] {
  const src = session.query.source;
  const graph = session.project.graph;
  if (src.dataSpace) {
    const ds = graph.dataSpaces.get(src.dataSpace.path);
    const roots = coverage?.rootClasses() ?? [];
    const rules = ds?.elements ?? [];
    if (rules.length === 0) return roots;
    return roots.filter((cls) => {
      let best: { len: number; exclude: boolean } | undefined;
      for (const r of rules) {
        if (cls === r.path || cls.startsWith(`${r.path}::`)) {
          if (!best || r.path.length > best.len) best = { len: r.path.length, exclude: r.exclude === true };
        }
      }
      return best !== undefined && !best.exclude;
    });
  }
  void app;
  return [...graph.classes.keys()].filter((c) => graph.mappingsFor(c).length > 0).sort();
}

export function renderEditor(root: HTMLElement, app: AppContext, session: Session): EditorHandle {
  const graph = session.project.graph;
  const explorer = new Explorer(session, { humanized: true, showUnmapped: false });
  const results = new Results(app, session);
  const setup = h('div', { class: 'q-setup' });
  const params = h('div');
  const columns = h('div');
  const filter = h('div');
  const header = h('div', { style: 'display:flex; gap:6px; align-items:center' });
  let coverage: Coverage | undefined;

  const loadCoverage = (): void => {
    explorer.setCoverage(undefined);
    app.coverage(session.project, session.query.source.mapping).then(
      (c) => { coverage = c; explorer.setCoverage(c); drawSetup(); },
      (e: Error) => { coverage = undefined; explorer.setCoverage(e); });
  };

  const changeSource = async (next: ClassSource): Promise<void> => {
    const q = session.query;
    if ((q.columns.length > 0 || q.filter) && next.class !== q.source.class) {
      if (!await confirmDialog('Change the class?', 'The columns and filter are built on the current class and will be cleared.', 'Change')) {
        drawSetup();
        return;
      }
      session.update(() => ({ ...emptyQuery(next), parameters: q.parameters }));
    } else {
      session.update((s) => ({ ...s, source: next }));
    }
    if (next.mapping !== q.source.mapping) loadCoverage();
  };

  const drawSetup = (): void => {
    const src = session.query.source;
    const rows: Child[] = [];
    if (src.dataSpace) {
      const ds = graph.dataSpaces.get(src.dataSpace.path);
      rows.push(h('div', { class: 'q-field' }, h('label', null, 'Data space'),
        h('a', { href: formatRoute({ kind: 'dataSpaceViewer', gav: session.project.gav, path: src.dataSpace.path }), title: src.dataSpace.path }, ds?.title ?? simpleName(src.dataSpace.path))));
      if (ds && ds.executionContexts.length > 1) {
        rows.push(h('div', { class: 'q-field' }, h('label', null, 'Context'),
          select(src.dataSpace.context, ds.executionContexts.map((c) => ({ value: c.name, label: c.title ?? c.name })), (v) => {
            const ec = ds.executionContexts.find((c) => c.name === v)!;
            void changeSource({ ...src, mapping: ec.mapping!.path, runtime: ec.defaultRuntime!.path, dataSpace: { path: src.dataSpace!.path, context: v } });
          })));
      }
    }
    const classes = offeredClasses(app, session, coverage);
    rows.push(h('div', { class: 'q-field' }, h('label', null, 'Class'),
      select(src.class, (classes.includes(src.class) ? classes : [src.class, ...classes]).map((c) => ({ value: c, label: simpleName(c) })), (cls) => {
        if (src.dataSpace) { void changeSource({ ...src, class: cls }); return; }
        const mappings = graph.mappingsFor(cls);
        const mapping = mappings.includes(src.mapping) ? src.mapping : mappings[0]!;
        const runtimes = graph.runtimesFor(mapping);
        void changeSource({ kind: 'class', class: cls, mapping, runtime: runtimes.includes(src.runtime) ? src.runtime : runtimes[0]! });
      }, { 'aria-label': 'Class' })));
    if (!src.dataSpace) {
      rows.push(h('div', { class: 'q-field' }, h('label', null, 'Mapping'),
        select(src.mapping, graph.mappingsFor(src.class).map((m) => ({ value: m, label: simpleName(m) })), (mapping) => {
          void changeSource({ ...src, mapping, runtime: graph.runtimesFor(mapping)[0] ?? src.runtime });
        })));
    }
    rows.push(h('div', { class: 'q-field' }, h('label', null, 'Runtime'),
      select(src.runtime, graph.runtimesFor(src.mapping).map((r) => ({ value: r, label: simpleName(r) })), (runtime) => void changeSource({ ...src, runtime }))));
    mount(setup, rows);
  };

  const search = h('input', { class: 'q-input', type: 'search', placeholder: 'Search properties…', style: 'flex:1; min-width:0; padding:3px 7px', oninput: () => explorer.setSearch(search.value) });
  const explorerHead = h('div', { class: 'q-panel-title', style: 'gap:6px; text-transform:none; letter-spacing:0' },
    search,
    h('button', {
      class: 'q-icon-btn', title: 'Show unmapped properties', 'aria-pressed': 'false',
      onclick: (e: Event) => {
        explorer.options.showUnmapped = !explorer.options.showUnmapped;
        (e.currentTarget as HTMLElement).setAttribute('aria-pressed', String(explorer.options.showUnmapped));
        (e.currentTarget as HTMLElement).style.color = explorer.options.showUnmapped ? 'var(--accent)' : '';
        explorer.render();
      },
    }, '◌'),
    h('button', {
      class: 'q-icon-btn', title: 'Humanize names',
      onclick: () => { explorer.options.humanized = !explorer.options.humanized; explorer.render(); },
    }, 'Aa'),
    h('button', { class: 'q-icon-btn', title: 'Collapse all', onclick: () => explorer.collapseAll() }, '⊟'));

  const textOnly = h('div');
  const drawWork = (): void => {
    if (session.text) {
      mount(textOnly, h('div', { style: 'padding:14px; display:flex; flex-direction:column; gap:10px' },
        h('div', { class: 'q-chip', style: 'color:var(--warn); white-space:normal; align-self:flex-start' }, `The form cannot show this query (${session.text.reason}). It still runs and saves.`),
        h('div', null, h('button', { class: 'q-btn', onclick: () => void textDialog(app, session) }, 'Edit in text mode'))));
      buildArea.replaceChildren(textOnly);
    } else {
      buildArea.replaceChildren(columns, filter);
      renderColumns(columns, session, () => explorer.options.humanized);
      renderFilter(filter, session);
    }
  };
  const buildArea = h('div', { class: 'q-build' });

  const drawHeader = (): void => {
    const saved = session.saved;
    mount(header,
      h('span', { class: 'q-crumbs' },
        h('b', { title: saved?.id ?? '' }, saved?.name ?? 'New query'),
        session.changed ? h('span', { class: 'q-chip', title: 'Unsaved changes' }, '● unsaved') : null,
        saved && saved.owner && saved.owner !== app.user ? h('span', { class: 'q-chip' }, `owned by ${saved.owner}`) : null),
      h('button', { class: 'q-icon-btn', title: 'Undo (Ctrl+Z)', disabled: !session.canUndo, onclick: () => session.undo() }, '↶'),
      h('button', { class: 'q-icon-btn', title: 'Redo (Ctrl+Shift+Z)', disabled: !session.canRedo, onclick: () => session.redo() }, '↷'),
      h('button', { class: 'q-btn', onclick: () => void textDialog(app, session) }, 'Pure'),
      h('button', { class: 'q-btn', onclick: () => openQueryDialog(app) }, 'Open'),
      h('button', { class: 'q-btn', onclick: () => saveAs(app, session) }, 'Save as'),
      h('button', { class: 'q-btn primary', title: 'Save (Ctrl+S)', onclick: () => void save(app, session) }, 'Save'));
  };

  mount(root, h('div', { class: 'q-editor' },
    h('div', { class: 'q-side' },
      h('div', { class: 'q-panel-title' }, 'Source'), setup,
      explorerHead, explorer.element,
      h('div', { style: 'border-top:1px solid var(--border); max-height:34%; overflow:auto' }, params)),
    h('div', { class: 'q-work' }, buildArea, results.element)));

  drawSetup();
  drawWork();
  drawHeader();
  renderParameters(params, session);
  results.render();
  loadCoverage();

  const unsubscribe = session.subscribe((c) => {
    if (c === 'query') {
      drawWork();
      explorer.render();
      renderParameters(params, session);
      drawSetup();
      results.render();
    }
    if (c === 'params') renderParameters(params, session);
    if (c === 'run' || c === 'query') results.render();
    drawHeader();
  });

  const onKey = (e: KeyboardEvent): void => {
    const mod = e.metaKey || e.ctrlKey;
    const inField = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement;
    if (mod && e.key === 'Enter') { e.preventDefault(); results.run(); }
    else if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); void save(app, session); }
    else if (mod && !inField && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) session.redo(); else session.undo(); }
    else if (mod && !inField && e.key.toLowerCase() === 'y') { e.preventDefault(); session.redo(); }
  };
  document.addEventListener('keydown', onKey);

  return {
    header,
    dispose() {
      unsubscribe();
      document.removeEventListener('keydown', onKey);
      if (session.run.status === 'running') session.run.abort.abort();
    },
  };
}
