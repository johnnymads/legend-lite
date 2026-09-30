// The columns (upstream's "fetch structure", TDS side, census §5.3): drop properties here, rename
// them in place, drag to reorder, pick an aggregate (the others become group keys), remove. The
// header's options chips open sort / distinct / limit / slice.

import { addColumn, PROPERTY_DRAG, propertyAt } from '../app/actions.ts';
import type { Session } from '../app/session.ts';
import type { AggregateOp, ProjectionColumn, PropertyPath, QueryState, SortSpec } from '../builder/state.ts';
import { isNumericFamily, primitiveFamily, simpleName } from '../model/graph.ts';
import { dialog, h, mount, showMenu, type Child } from './dom.ts';

const AGGREGATES: readonly { op: AggregateOp; label: string; fits: (family: string, isEnum: boolean) => boolean }[] = [
  { op: 'count', label: 'count', fits: () => true },
  { op: 'distinctCount', label: 'distinct count', fits: () => true },
  { op: 'sum', label: 'sum', fits: (f) => isNumericFamily(f as never) },
  { op: 'average', label: 'average', fits: (f) => isNumericFamily(f as never) },
  { op: 'min', label: 'min', fits: (f) => isNumericFamily(f as never) || f === 'date' },
  { op: 'max', label: 'max', fits: (f) => isNumericFamily(f as never) || f === 'date' },
  { op: 'stdDevPopulation', label: 'std dev (population)', fits: (f) => isNumericFamily(f as never) },
  { op: 'stdDevSample', label: 'std dev (sample)', fits: (f) => isNumericFamily(f as never) },
  { op: 'joinStrings', label: 'join', fits: (f, e) => f === 'string' && !e },
];

export function aggregateLabel(op: AggregateOp): string {
  return AGGREGATES.find((a) => a.op === op)!.label;
}

/** Accept a property drop on an element: highlight while over, call `onPath` on drop. */
export function propertyDropZone(el: HTMLElement, onPath: (path: PropertyPath) => void): void {
  el.addEventListener('dragover', (e) => {
    if (e.dataTransfer?.types.includes(PROPERTY_DRAG)) { e.preventDefault(); el.classList.add('over'); }
  });
  el.addEventListener('dragleave', (e) => {
    if (!el.contains(e.relatedTarget as Node)) el.classList.remove('over');
  });
  el.addEventListener('drop', (e) => {
    el.classList.remove('over');
    const raw = e.dataTransfer?.getData(PROPERTY_DRAG);
    if (!raw) return;
    e.preventDefault();
    e.stopPropagation();
    onPath(JSON.parse(raw) as PropertyPath);
  });
}

export function renderColumns(container: HTMLElement, session: Session, humanized: () => boolean): void {
  const q = session.query;
  const graph = session.project.graph;
  const update = (f: (q: QueryState) => QueryState): void => session.update(f);
  let dragging: string | undefined;

  const row = (c: ProjectionColumn): HTMLElement => {
    let family = 'other';
    let isEnum = false;
    let typeText = '';
    try {
      const { prop } = propertyAt(graph, q.source.class, c.path);
      family = primitiveFamily(prop.type);
      isEnum = graph.enumerations.has(prop.type);
      typeText = simpleName(prop.type);
    } catch (e) {
      typeText = (e as Error).message;
    }
    const name = h('input', {
      class: 'q-input', value: c.name, 'aria-label': 'Column name',
      onchange: () => {
        const v = name.value.trim();
        const dup = q.columns.some((o) => o.id !== c.id && o.name === v);
        if (!v || dup) { name.classList.add('q-error'); name.title = v ? 'Another column has this name' : 'A column needs a name'; return; }
        update((s) => ({
          ...s,
          columns: s.columns.map((o) => (o.id === c.id ? { ...o, name: v } : o)),
          options: { ...s.options, sort: s.options.sort.map((x) => (x.column === c.name ? { ...x, column: v } : x)) },
        }));
      },
    });
    const aggButton = h('button', {
      class: `q-btn small${c.aggregate ? ' primary' : ''}`, title: 'Aggregate',
      onclick: (e: MouseEvent) => showMenu(e.clientX, e.clientY, [
        { label: '(none) — group by this column', action: () => setAggregate(undefined) },
        'separator',
        ...AGGREGATES.filter((a) => a.fits(family, isEnum)).map((a) => ({ label: a.label, action: () => setAggregate(a.op) })),
      ]),
    }, c.aggregate ? aggregateLabel(c.aggregate) : 'Σ');
    const setAggregate = (op: AggregateOp | undefined): void => update((s) => ({
      ...s,
      columns: s.columns.map((o) => {
        if (o.id !== c.id) return o;
        const base = o.name.replace(/ \([^)]*\)$/, '');
        const { aggregate: _drop, ...rest } = o;
        void _drop;
        return op ? { ...rest, aggregate: op, name: `${base} (${aggregateLabel(op)})` } : { ...rest, name: base };
      }),
    }));
    const el = h('div', {
      class: 'q-col', draggable: 'true',
      ondragstart: (e: DragEvent) => { dragging = c.id; e.dataTransfer?.setData('text/plain', c.name); },
      ondragover: (e: DragEvent) => { if (dragging) e.preventDefault(); },
      ondrop: (e: DragEvent) => {
        if (!dragging || dragging === c.id) return;
        e.preventDefault();
        const from = dragging;
        update((s) => {
          const cols = [...s.columns];
          const moving = cols.findIndex((x) => x.id === from);
          const [m] = cols.splice(moving, 1);
          cols.splice(cols.findIndex((x) => x.id === c.id), 0, m!);
          return { ...s, columns: cols };
        });
      },
    },
    h('span', { class: 'grip', title: 'Drag to reorder' }, '⋮⋮'),
    h('div', { style: 'min-width:0' }, name,
      h('div', { class: 'path', title: typeText }, `$x.${c.path.map((s) => s.property).join('.')} · ${typeText}`)),
    aggButton,
    h('button', {
      class: 'q-icon-btn', title: 'Remove column',
      onclick: () => update((s) => ({
        ...s,
        columns: s.columns.filter((o) => o.id !== c.id),
        options: { ...s.options, sort: s.options.sort.filter((x) => x.column !== c.name) },
      })),
    }, '✕'));
    return el;
  };

  const body = h('div', { class: 'q-drop' },
    q.columns.length === 0
      ? h('div', { class: 'q-hint' }, 'Drag properties here, or double-click them in the explorer.')
      : q.columns.map(row));
  propertyDropZone(body, (path) => update((s) => addColumn(s, path, humanized())));

  mount(container,
    h('div', { class: 'q-panel-title' }, 'Columns', h('span', { class: 'q-chip' }, String(q.columns.length)),
      h('span', { class: 'q-spacer' }), optionChips(session),
      q.columns.length > 0 ? h('button', { class: 'q-icon-btn', title: 'Remove every column', onclick: () => update((s) => ({ ...s, columns: [], options: { ...s.options, sort: [] } })) }, 'Clear') : null),
    body);
}

/** The result options as chips; clicking opens their dialog. */
function optionChips(session: Session): Child {
  const o = session.query.options;
  const chips: Child[] = [];
  if (o.distinct) chips.push(h('span', { class: 'q-chip accent' }, 'distinct'));
  for (const s of o.sort) chips.push(h('span', { class: 'q-chip accent' }, `${s.column} ${s.direction === 'asc' ? '↑' : '↓'}`));
  if (o.limit !== undefined) chips.push(h('span', { class: 'q-chip accent' }, `limit ${o.limit}`));
  if (o.slice) chips.push(h('span', { class: 'q-chip accent' }, `rows ${o.slice.start}–${o.slice.end}`));
  return h('span', { style: 'display:inline-flex; gap:4px; text-transform:none; letter-spacing:0; font-weight:400' },
    chips, h('button', { class: 'q-btn small', onclick: () => optionsDialog(session) }, 'Options…'));
}

export function optionsDialog(session: Session): void {
  const q = session.query;
  let sort: SortSpec[] = [...q.options.sort];
  const distinct = h('input', { type: 'checkbox', checked: q.options.distinct, id: 'q-opt-distinct' });
  const limit = h('input', { class: 'q-input', type: 'number', min: '1', value: q.options.limit === undefined ? '' : String(q.options.limit), placeholder: 'no limit', style: 'width:120px' });
  const sliceStart = h('input', { class: 'q-input', type: 'number', min: '0', value: q.options.slice ? String(q.options.slice.start) : '', style: 'width:90px', placeholder: 'from' });
  const sliceEnd = h('input', { class: 'q-input', type: 'number', min: '0', value: q.options.slice ? String(q.options.slice.end) : '', style: 'width:90px', placeholder: 'to' });
  const sortList = h('div');
  const error = h('div', { class: 'q-error' });
  const drawSort = (): void => {
    mount(sortList,
      sort.map((s, i) => h('div', { style: 'display:flex; gap:6px; align-items:center; margin-bottom:4px' },
        h('select', { class: 'q-select', onchange: (e: Event) => { sort[i] = { ...s, column: (e.target as HTMLSelectElement).value }; } },
          q.columns.map((c) => h('option', { value: c.name, selected: c.name === s.column }, c.name))),
        h('button', { class: 'q-btn small', onclick: () => { sort[i] = { ...s, direction: s.direction === 'asc' ? 'desc' : 'asc' }; drawSort(); } }, s.direction === 'asc' ? 'Ascending ↑' : 'Descending ↓'),
        h('button', { class: 'q-icon-btn', onclick: () => { sort = sort.filter((_, j) => j !== i); drawSort(); } }, '✕'))),
      q.columns.length > 0
        ? h('button', { class: 'q-btn small', onclick: () => { sort.push({ column: q.columns[0]!.name, direction: 'asc' }); drawSort(); } }, '+ Sort by')
        : h('span', { class: 'q-faint' }, 'Add columns to sort by them.'));
  };
  drawSort();
  dialog('Query options', (d) => ({
    body: [
      h('div', null, h('b', null, 'Sort'), sortList),
      h('label', { style: 'display:flex; gap:6px; align-items:center' }, distinct, 'Eliminate duplicate rows (distinct)'),
      h('div', { class: 'q-field', style: 'grid-template-columns:120px 1fr' }, h('label', null, 'Limit results'), limit),
      h('div', { class: 'q-field', style: 'grid-template-columns:120px 1fr' }, h('label', null, 'Slice rows'), h('span', null, sliceStart, ' – ', sliceEnd)),
      error,
    ],
    foot: [
      h('button', { class: 'q-btn', onclick: () => d.close() }, 'Cancel'),
      h('button', {
        class: 'q-btn primary',
        onclick: () => {
          const lim = limit.value === '' ? undefined : Number(limit.value);
          const hasSlice = sliceStart.value !== '' || sliceEnd.value !== '';
          const start = Number(sliceStart.value || 0), end = Number(sliceEnd.value || 0);
          if (lim !== undefined && (!Number.isInteger(lim) || lim < 1)) { error.textContent = 'The limit is a whole number of rows, at least 1.'; return; }
          if (hasSlice && !(Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end > start)) { error.textContent = 'A slice runs from a row to a later row.'; return; }
          session.update((s) => ({
            ...s,
            options: {
              sort, distinct: distinct.checked,
              ...(lim !== undefined ? { limit: lim } : {}),
              ...(hasSlice ? { slice: { start, end } } : {}),
            },
          }));
          d.close();
        },
      }, 'Apply'),
    ],
  }));
}
