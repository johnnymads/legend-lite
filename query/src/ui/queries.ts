// Saving and opening queries (census §8): Save (the owner overwrites, a new version), Save As
// (a copy you own), rename; the query browser searches by name or id, mine only, sorted by last
// viewed / created / updated, with rename and delete on your own.

import type { AppContext } from '../app/context.ts';
import { recent } from '../app/context.ts';
import { newQueryId, toQuery } from '../app/persist.ts';
import { formatRoute } from '../app/routes.ts';
import type { Session } from '../app/session.ts';
import type { Query, QuerySearchSortBy } from '../backend/wire.ts';
import { simpleName } from '../model/graph.ts';
import { confirmDialog, dialog, h, mount, toast } from './dom.ts';
import { timeAgo } from './format.ts';

/** Save: overwrite the saved query when it is the caller's, else ask for a name (Save As). */
export async function save(app: AppContext, session: Session): Promise<void> {
  const saved = session.saved;
  if (!saved || (saved.owner && saved.owner !== app.user)) {
    saveAs(app, session);
    return;
  }
  try {
    const q = await app.store.update(await toQuery(app, session, { id: saved.id, name: saved.name }));
    session.markSaved(q);
    toast(`Saved “${q.name}” (version ${q.version ?? '?'})`);
  } catch (e) {
    toast(`Save failed: ${(e as Error).message}`, 6000);
  }
}

export function saveAs(app: AppContext, session: Session): void {
  const src = session.query.source;
  const suggested = session.saved ? `Copy of ${session.saved.name}`
    : session.sharedAs ? session.sharedAs
    : src.dataSpace ? `New query for ${simpleName(src.dataSpace.path)}[${src.dataSpace.context}]` : `New query on ${simpleName(src.class)}`;
  const name = h('input', { class: 'q-input', value: suggested, style: 'width:100%' });
  const description = h('textarea', { class: 'q-textarea', rows: 3, placeholder: 'What does this query answer? (optional)' });
  const error = h('div', { class: 'q-error' });
  dialog(session.saved ? 'Save as a new query' : 'Save query', (d) => ({
    body: [h('label', null, 'Name', name), h('label', null, 'Description', description), error],
    foot: [
      h('button', { class: 'q-btn', onclick: () => d.close() }, 'Cancel'),
      h('button', {
        class: 'q-btn primary',
        onclick: async () => {
          const n = name.value.trim();
          if (!n) { error.textContent = 'A query needs a name.'; return; }
          try {
            const desc = description.value.trim();
            const q = await app.store.create(await toQuery(app, session, { id: newQueryId(), name: n, ...(desc ? { description: desc } : {}) }));
            session.markSaved(q);
            recent.query(q.id);
            d.close();
            toast(`Saved “${q.name}”`);
            history.replaceState(null, '', formatRoute({ kind: 'edit', id: q.id, parameters: new Map() }));
          } catch (e) {
            error.textContent = (e as Error).message;
          }
        },
      }, 'Save'),
    ],
  }));
}

export function rename(app: AppContext, q: Query, onDone: (q: Query) => void): void {
  const name = h('input', { class: 'q-input', value: q.name, style: 'width:100%' });
  const error = h('div', { class: 'q-error' });
  dialog('Rename query', (d) => ({
    body: [name, error],
    foot: [
      h('button', { class: 'q-btn', onclick: () => d.close() }, 'Cancel'),
      h('button', {
        class: 'q-btn primary',
        onclick: async () => {
          const n = name.value.trim();
          if (!n) { error.textContent = 'A query needs a name.'; return; }
          try {
            onDone(await app.store.patch(q.id, { name: n }));
            d.close();
          } catch (e) {
            error.textContent = (e as Error).message;
          }
        },
      }, 'Rename'),
    ],
  }));
}

/** The query browser: search, filter, open. */
export function openQueryDialog(app: AppContext): void {
  const list = h('div', { class: 'q-list', style: 'max-height:55vh; overflow:auto' });
  const term = h('input', { class: 'q-input', type: 'search', placeholder: 'Search for queries by name or ID', style: 'flex:1' });
  const mine = h('input', { type: 'checkbox' });
  const sort = h('select', { class: 'q-select' },
    h('option', { value: 'SORT_BY_VIEW' }, 'Last viewed'), h('option', { value: 'SORT_BY_CREATE' }, 'Last created'),
    h('option', { value: 'SORT_BY_UPDATE' }, 'Last updated'));
  let timer: ReturnType<typeof setTimeout> | undefined;
  let handle: { close(): void } | undefined;
  const load = async (): Promise<void> => {
    mount(list, h('div', { class: 'q-empty' }, h('span', { class: 'q-spinner' }), ' Searching…'));
    try {
      const t = term.value.trim();
      const found = await app.store.search({
        ...(t ? { searchTermSpecification: { searchTerm: t } } : {}),
        showCurrentUserQueriesOnly: mine.checked,
        sortByOption: sort.value as QuerySearchSortBy,
        limit: 51,
      });
      mount(list,
        found.length === 0 ? h('div', { class: 'q-empty' }, 'No queries found.') : null,
        found.slice(0, 50).map((q) => h('div', {
          class: 'q-list-row',
          onclick: () => { handle?.close(); location.hash = formatRoute({ kind: 'edit', id: q.id, parameters: new Map() }); },
        },
        h('b', null, q.name),
        h('span', { class: 'q-faint' }, q.owner === app.user ? 'me' : q.owner ?? ''),
        h('span', { class: 'q-spacer' }),
        h('span', { class: 'q-faint' }, q.lastUpdatedAt ? timeAgo(q.lastUpdatedAt) : ''),
        q.owner === app.user ? [
          h('button', { class: 'q-icon-btn', title: 'Rename', onclick: (e: Event) => { e.stopPropagation(); rename(app, q, () => void load()); } }, '✎'),
          h('button', {
            class: 'q-icon-btn', title: 'Delete',
            onclick: async (e: Event) => {
              e.stopPropagation();
              if (await confirmDialog('Delete query', `Delete “${q.name}”? Its history is kept by the store.`, 'Delete')) {
                await app.store.delete(q.id);
                recent.forgetQuery(q.id);
                void load();
              }
            },
          }, '🗑')] : null)),
        found.length > 50 ? h('div', { class: 'q-empty' }, 'Found 50+ — refine the search.') : null);
    } catch (e) {
      mount(list, h('div', { class: 'q-empty q-error' }, (e as Error).message));
    }
  };
  term.addEventListener('input', () => { if (timer) clearTimeout(timer); timer = setTimeout(() => void load(), 300); });
  mine.addEventListener('change', () => void load());
  sort.addEventListener('change', () => void load());
  handle = dialog('Open a query', () => ({
    body: [h('div', { style: 'display:flex; gap:8px; align-items:center' }, term, h('label', { style: 'display:flex; gap:4px; align-items:center' }, mine, 'Mine only'), sort), list],
  }), { wide: true });
  void load();
}
