// The filter (census §5.4): an AND/OR tree of conditions on properties. Drop a property on the
// panel (or on a group) to add a condition; each condition offers the operators its type allows,
// and a value editor of that type. A to-many step in the path becomes `exists` when built.

import { addCondition, mapGroup, mapNode, newCondition, propertyAt, prune } from '../app/actions.ts';
import type { Session } from '../app/session.ts';
import { freshId, type Condition, type FilterNode, type Group, type Operator, type PropertyPath, type QueryState } from '../builder/state.ts';
import { probeable } from '../app/probe.ts';
import type { AppContext } from '../app/context.ts';
import { renderPostFilter } from './advanced.ts';
import { humanize, isNumericFamily, isOptional, isToMany, primitiveFamily, type ModelGraph } from '../model/graph.ts';
import { h, mount, panelAction, panelHeader, showMenu, type Child } from './dom.ts';
import { propertyDropZone } from './columns.ts';
import { defaultValue, valueEditor } from './values.ts';

export const OPERATOR_LABELS: Readonly<Record<Operator, string>> = {
  equal: 'is', notEqual: 'is not', lessThan: '<', lessThanEqual: '≤', greaterThan: '>', greaterThanEqual: '≥',
  startsWith: 'starts with', notStartsWith: "doesn't start with", contains: 'contains', notContains: "doesn't contain",
  endsWith: 'ends with', notEndsWith: "doesn't end with", in: 'is in list of', notIn: 'is not in list of',
  isEmpty: 'is empty', isNotEmpty: 'is not empty',
};

/** The operators a property's type allows (upstream's operator loader, census §5.4). */
export function operatorsFor(graph: ModelGraph, type: string, optional: boolean): Operator[] {
  const empty: Operator[] = optional ? ['isEmpty', 'isNotEmpty'] : [];
  if (graph.enumerations.has(type)) return ['equal', 'notEqual', 'in', 'notIn', ...empty];
  const f = primitiveFamily(type);
  if (f === 'string') {
    return ['equal', 'notEqual', 'startsWith', 'notStartsWith', 'contains', 'notContains', 'endsWith', 'notEndsWith', 'in', 'notIn', ...empty];
  }
  if (f === 'boolean') return ['equal', 'notEqual', ...empty];
  if (isNumericFamily(f) || f === 'date') {
    return ['equal', 'notEqual', 'lessThan', 'lessThanEqual', 'greaterThan', 'greaterThanEqual', 'in', 'notIn', ...empty];
  }
  return [...empty];
}

/** Typeahead for a condition's path, when the editor offers it. */
export type Suggestions = (path: PropertyPath, prefix: string) => Promise<string[]>;

let showResults = false;

export function renderFilter(container: HTMLElement, session: Session, suggestions?: Suggestions, app?: AppContext): void {
  const tableMode = session.query.graph === undefined;
  const tabs = tableMode && app ? h('span', { style: 'display:inline-flex; gap:2px; text-transform:none; letter-spacing:0' },
    h('button', { class: `q-tab${showResults ? '' : ' on'}`, style: 'padding:0 6px', onclick: () => { showResults = false; renderFilter(container, session, suggestions, app); } }, 'Rows'),
    h('button', { class: `q-tab${showResults ? ' on' : ''}`, style: 'padding:0 6px', title: 'Filter the result, after grouping and windows', onclick: () => { showResults = true; renderFilter(container, session, suggestions, app); } },
      'Results', session.query.postFilter ? ` (${session.query.postFilter.children.length})` : '')) : null;
  if (tableMode && app && showResults) {
    const body = h('div', { class: 'q-drop' });
    mount(container, panelHeader('filter', [tabs]), h('div', { class: 'q-panel__content' }, body));
    renderPostFilter(body, app, session);
    return;
  }
  const q = session.query;
  const graph = session.project.graph;
  const update = (f: (q: QueryState) => QueryState): void => session.update(f);
  const root: Group = q.filter ?? { kind: 'group', id: freshId('g'), op: 'and', children: [] };
  const setRoot = (f: (g: Group) => Group, tidy = true): void => update((s) => {
    const changed = f(s.filter ?? root);
    const next = tidy ? prune(changed) : changed;
    const { filter: _drop, ...rest } = s;
    void _drop;
    return next.children.length === 0 ? rest : { ...s, filter: next };
  });

  const conditionRow = (c: Condition): HTMLElement => {
    let type = 'String', optional = false, many = false, error: string | undefined;
    try {
      const { prop, explodes } = propertyAt(graph, q.source.class, c.path);
      type = prop.type;
      many = isToMany(prop.multiplicity);
      optional = isOptional(prop.multiplicity) || explodes;
    } catch (e) {
      error = (e as Error).message;
    }
    const ops = operatorsFor(graph, type, optional);
    const opSelect = h('select', {
      class: 'q-select', 'aria-label': 'Operator',
      onchange: () => {
        const op = opSelect.value as Operator;
        setRoot((g) => mapNode(g, c.id, (n) => {
          const cur = n as Condition;
          const list = op === 'in' || op === 'notIn';
          const wasList = cur.value?.kind === 'list';
          let value = cur.value;
          if (op === 'isEmpty' || op === 'isNotEmpty') value = undefined;
          else if (list && !wasList) value = { kind: 'list', values: cur.value && cur.value.kind !== 'parameter' && cur.value.kind !== 'dateFunction' ? [cur.value] : [] };
          else if (!list && cur.value?.kind === 'list') value = cur.value.values[0] ?? defaultValue(graph, type, false);
          else if (value === undefined) value = defaultValue(graph, type, false);
          const { value: _v, ...rest } = cur;
          void _v;
          return value === undefined ? { ...rest, operator: op } : { ...rest, operator: op, value };
        }));
      },
    }, ops.map((o) => h('option', { value: o, selected: o === c.operator }, OPERATOR_LABELS[o])));
    const needsValue = c.operator !== 'isEmpty' && c.operator !== 'isNotEmpty';
    return h('div', { class: 'q-cond' },
      h('span', { class: 'prop', title: `$x.${c.path.map((s) => s.property).join('.')}` },
        c.path.map((s) => humanize(s.property)).join(' / ')),
      many ? h('span', { class: 'q-chip', title: 'A to-many property: the condition holds when any value matches' }, 'any') : null,
      opSelect,
      needsValue ? valueEditor({
        graph, type, many: c.operator === 'in' || c.operator === 'notIn', value: c.value, parameters: q.parameters,
        onChange: (v) => setRoot((g) => mapNode(g, c.id, (n) => ({ ...(n as Condition), value: v }))),
        ...(suggestions && probeable(session, c.path) ? { suggest: (prefix: string) => suggestions(c.path, prefix) } : {}),
      }) : null,
      error ? h('span', { class: 'q-error' }, error) : null,
      h('span', { class: 'q-spacer' }),
      h('button', {
        class: 'q-icon-btn', title: 'More',
        onclick: (e: MouseEvent) => showMenu(e.clientX, e.clientY, [
          { label: 'Wrap in a new group', action: () => setRoot((g) => mapNode(g, c.id, (n) => ({ kind: 'group', id: freshId('g'), op: 'or', children: [n] }))) },
          { label: 'Duplicate', action: () => setRoot((g) => insertAfter(g, c.id, { ...c, id: freshId('c') })) },
          { label: 'Remove', action: () => setRoot((g) => mapNode(g, c.id, () => undefined)) },
        ]),
      }, '⋯'),
      h('button', { class: 'q-icon-btn', title: 'Remove condition', onclick: () => setRoot((g) => mapNode(g, c.id, () => undefined)) }, '✕'));
  };

  const groupBlock = (g: Group, isRoot: boolean): HTMLElement => {
    const block = h('div', { class: isRoot ? '' : 'q-group' },
      g.children.length > 1 || !isRoot
        ? h('div', { class: 'q-group-head' },
          h('button', {
            class: 'q-op-toggle', title: 'Switch between AND and OR',
            onclick: () => setRoot((r) => mapGroup(r, g.id, (x) => ({ ...x, op: x.op === 'and' ? 'or' : 'and' }))),
          }, g.op.toUpperCase()),
          h('span', { class: 'q-faint' }, g.op === 'and' ? 'all of these' : 'any of these'),
          !isRoot ? h('button', { class: 'q-icon-btn', title: 'Remove group', onclick: () => setRoot((r) => mapNode(r, g.id, () => undefined)) }, '✕') : null)
        : null,
      g.children.map((c): Child => (c.kind === 'condition' ? conditionRow(c) : groupBlock(c, false))),
      !isRoot && g.children.length === 0 ? h('div', { class: 'q-hint', style: 'padding:8px' }, 'Drop properties here') : null);
    if (!isRoot) {
      propertyDropZone(block, (path) => update((s) => addCondition(graph, s, path, g.id)));
    }
    return block;
  };

  const body = h('div', { class: 'q-drop' },
    root.children.length === 0
      ? h('div', { class: 'q-hint' }, 'Drag properties here to filter rows.')
      : groupBlock(root, true));
  propertyDropZone(body, (path) => update((s) => (s.filter
    ? { ...s, filter: mapGroup(s.filter, s.filter.id, (g) => ({ ...g, children: [...g.children, newCondition(graph, s.source.class, path)] })) }
    : addCondition(graph, s, path))));

  mount(container,
    panelHeader('filter', [tabs], [
      panelAction('plusCircle', 'Add a group', () => setRoot((r) => ({ ...r, children: [...r.children, { kind: 'group', id: freshId('g'), op: r.op === 'and' ? 'or' : 'and', children: [] }] }), false), root.children.length === 0),
      panelAction('trash', 'Remove every condition', () => setRoot(() => ({ ...root, children: [] })), root.children.length === 0)]),
    h('div', { class: 'q-panel__content' }, body));
}

function insertAfter(g: Group, id: string, node: FilterNode): Group {
  const children: FilterNode[] = [];
  for (const c of g.children) {
    children.push(c.kind === 'group' ? insertAfter(c, id, node) : c);
    if (c.id === id) children.push(node);
  }
  return { ...g, children };
}
