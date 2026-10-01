// "/": the query builder with nothing chosen yet, as upstream Legend Query opens
// (DataProductQueryCreator): the properties panel asks for a data space, then its context and an
// entity; until then the explorer says what it needs and the other panels are empty. Choosing a
// data space opens the editor on it (its default context, its first class), where context and
// entity can be changed. Other starts (a mapping, a service, a saved query) are on /setup.

import type { AppContext } from '../app/context.ts';
import { formatRoute } from '../app/routes.ts';
import { blankPlaceholder, h, icon, menuButton, mount, panelHeader, select } from './dom.ts';
import { openQueryDialog } from './queries.ts';
import { workspace } from './split.ts';

export function renderStart(root: HTMLElement, app: AppContext): void {
  const spaces = app.projects.flatMap((p) => [...p.graph.dataSpaces].map(([path, ds]) => ({ gav: p.gav, path, title: ds.title ?? path })));
  const NONE = '';
  const choose = (value: string): void => {
    if (value === NONE) return;
    const [gav, path] = JSON.parse(value) as [string, string];
    location.hash = formatRoute({ kind: 'dataSpace', gav, path });
  };
  const disabled = (label: string, placeholder: string): HTMLElement =>
    h('div', { class: 'q-field' }, h('label', null, label), select(NONE, [{ value: NONE, label: placeholder }], () => undefined, { disabled: true, 'aria-label': label }));

  const properties = h('div', { class: 'q-panel q-panel--fit' },
    panelHeader('properties'),
    h('div', { class: 'q-panel__content' }, h('div', { class: 'q-setup' },
      h('div', { class: 'q-field' }, h('label', null, 'Data Space'),
        select(NONE, [{ value: NONE, label: 'Search for data space...' }, ...spaces.map((s) => ({ value: JSON.stringify([s.gav, s.path]), label: s.title }))],
          choose, { 'aria-label': 'Data Space' })),
      disabled('Context', 'Choose an execution context...'),
      disabled('Entity', 'Choose an entity...'))));
  const explorer = h('div', { class: 'q-panel q-panel--grow' },
    panelHeader('explorer'),
    h('div', { class: 'q-panel__content' }, h('div', { class: 'q-hint' }, 'Specify the class, mapping, and runtime to start building query')));
  const empty = (title: string, text?: string): HTMLElement => h('div', { class: 'q-panel' },
    panelHeader(title), h('div', { class: 'q-panel__content' }, text ? blankPlaceholder(text) : null));

  mount(root, h('div', { class: 'q-builder' },
    h('div', { class: 'q-builder__header' },
      h('div', { class: 'q-builder__status' }, h('span', { class: 'q-builder__title' }, 'Unsaved Query')),
      h('span', { class: 'q-spacer' }),
      h('button', { class: 'q-header-action', title: 'Load a saved query', onclick: () => openQueryDialog(app) }, icon('load'), h('span', null, 'Load Query')),
      menuButton(['Help...', icon('caretDown')], () => [
        { label: 'Other ways to start (a mapping, a service)', action: () => { location.hash = formatRoute({ kind: 'setup' }); } },
      ], { class: 'q-header-pill' })),
    h('div', { class: 'q-builder__main' },
      workspace(h('div', { class: 'q-side' }, properties, explorer),
        empty('fetch structure', 'Add a projection column'), empty('filter', 'Add a filter condition'),
        h('div', { class: 'q-panel q-panel--results' }, panelHeader('results'),
          h('div', { class: 'q-panel__content' }, h('div', { class: 'q-hint' }, 'Build or load a valid query first')))))));
}
