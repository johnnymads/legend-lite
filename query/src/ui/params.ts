// Parameters (census §5.5): named, typed inputs a query takes -- primitives or enumerations, [1],
// [0..1] or [*]. A filter can compare with one; each run asks for their values (kept per query,
// and settable from the URL with `?p:name=value`). A parameter still in use cannot be deleted.

import type { Session } from '../app/session.ts';
import { referencedParameters } from '../builder/build.ts';
import type { Parameter } from '../builder/state.ts';
import type { Multiplicity } from '../../../pure-protocol/src/index.ts';
import { simpleName } from '../model/graph.ts';
import { dialog, h, mount, panelAction, panelHeader, type Child } from './dom.ts';
import { valueEditor, valueLabel } from './values.ts';

const PRIMITIVES = ['String', 'Integer', 'Float', 'Decimal', 'Boolean', 'StrictDate', 'DateTime'];
const MULTIPLICITIES: readonly { label: string; m: Multiplicity }[] = [
  { label: '[1] exactly one', m: { lowerBound: 1, upperBound: 1 } },
  { label: '[0..1] optional', m: { lowerBound: 0, upperBound: 1 } },
  { label: '[*] a list', m: { lowerBound: 0 } },
];

const multLabel = (p: Parameter): string => (p.multiplicity.upperBound === undefined ? '[*]' : p.multiplicity.lowerBound === 0 ? '[0..1]' : '[1]');

export function renderParameters(container: HTMLElement, session: Session): void {
  const q = session.query;
  const used = referencedParameters(q);
  mount(container,
    panelHeader('parameters', [], [panelAction('plus', 'Add a parameter', () => parameterDialog(session))]),
    h('div', { class: 'q-panel__content', style: 'padding:6px 10px; display:flex; flex-direction:column; gap:6px' },
      q.parameters.length === 0 ? h('div', { class: 'q-faint', style: 'font-size:12px' }, 'None. Add one to make the query take an input.') : null,
      q.parameters.map((p): Child => h('div', { style: 'display:flex; flex-direction:column; gap:3px; border:1px solid var(--border); border-radius:6px; padding:5px 7px' },
        h('div', { style: 'display:flex; align-items:center; gap:6px' },
          h('b', { class: 'mono' }, `$${p.name}`),
          h('span', { class: 'q-faint mono' }, `${simpleName(p.type)}${multLabel(p)}`),
          h('span', { class: 'q-spacer' }),
          h('button', { class: 'q-icon-btn', title: 'Edit', onclick: () => parameterDialog(session, p) }, '✎'),
          h('button', {
            class: 'q-icon-btn', disabled: used.has(p.name), title: used.has(p.name) ? 'Used in the query: remove its uses first' : 'Delete',
            onclick: () => session.update((s) => ({ ...s, parameters: s.parameters.filter((x) => x.name !== p.name) })),
          }, '✕')),
        valueEditor({
          graph: session.project.graph, type: p.type, many: p.multiplicity.upperBound === undefined,
          value: session.paramValues.get(p.name), parameters: [],
          onChange: (v) => { session.setParam(p.name, v); renderParameters(container, session); },
        })))));
}

/** Create or edit a parameter: a name (an identifier, lower-case first, unique), a type, a multiplicity. */
export function parameterDialog(session: Session, existing?: Parameter): void {
  const graph = session.project.graph;
  const name = h('input', { class: 'q-input', value: existing?.name ?? '', placeholder: 'e.g. businessDate' });
  const type = h('select', { class: 'q-select' },
    h('optgroup', { label: 'Primitive' }, PRIMITIVES.map((t) => h('option', { value: t, selected: t === existing?.type }, t))),
    graph.enumerations.size > 0
      ? h('optgroup', { label: 'Enumeration' }, [...graph.enumerations.keys()].map((t) => h('option', { value: t, selected: t === existing?.type }, simpleName(t))))
      : null);
  const mult = h('select', { class: 'q-select' }, MULTIPLICITIES.map((m, i) => h('option', {
    value: String(i),
    selected: existing ? (m.m.upperBound === existing.multiplicity.upperBound && m.m.lowerBound === existing.multiplicity.lowerBound) : i === 0,
  }, m.label)));
  const error = h('div', { class: 'q-error' });
  dialog(existing ? `Edit $${existing.name}` : 'New parameter', (d) => ({
    body: [
      h('div', { class: 'q-field' }, h('label', null, 'Name'), name),
      h('div', { class: 'q-field' }, h('label', null, 'Type'), type),
      h('div', { class: 'q-field' }, h('label', null, 'Values'), mult),
      error,
    ],
    foot: [
      h('button', { class: 'q-btn', onclick: () => d.close() }, 'Cancel'),
      h('button', {
        class: 'q-btn primary',
        onclick: () => {
          const n = name.value.trim();
          const others = session.query.parameters.filter((p) => p.name !== existing?.name);
          if (!/^[a-z_][A-Za-z0-9_]*$/.test(n)) { error.textContent = 'A name starts with a lower-case letter or _, then letters, digits or _.'; return; }
          if (others.some((p) => p.name === n)) { error.textContent = `There is already a parameter $${n}.`; return; }
          const p: Parameter = { name: n, type: type.value, multiplicity: MULTIPLICITIES[Number(mult.value)]!.m };
          session.update((s) => ({
            ...s,
            parameters: existing ? s.parameters.map((x) => (x.name === existing.name ? p : x)) : [...s.parameters, p],
          }));
          if (existing && existing.name !== n) {
            const v = session.paramValues.get(existing.name);
            session.setParam(existing.name, undefined);
            if (v) session.setParam(n, v);
          }
          d.close();
        },
      }, existing ? 'Save' : 'Create'),
    ],
  }));
}

/** Parameters with no value yet, and a readable summary of those that have one. */
export function missingValues(session: Session): Parameter[] {
  return session.query.parameters.filter((p) => !session.paramValues.has(p.name) && p.multiplicity.lowerBound > 0);
}

export function parameterSummary(session: Session): string {
  return session.query.parameters.map((p) => `$${p.name} = ${valueLabel(session.paramValues.get(p.name))}`).join(', ');
}
