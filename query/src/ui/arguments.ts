// A path step's arguments: a derived property's (upstream's derived property editor) and a
// property into a temporal class whose dates do not propagate (upstream's milestoned property
// dates) -- each a literal, a relative date, or a parameter or constant of the query.

import { propertyAt } from '../app/actions.ts';
import type { Session } from '../app/session.ts';
import { queryVariables, type PropertyPath, type Value } from '../builder/state.ts';
import { stepFor } from '../builder/milestoning.ts';
import { humanize, isToMany, simpleName, type PropertyInfo } from '../model/graph.ts';
import { dialog, h, mount } from './dom.ts';
import { defaultValue, valueEditor, valueLabel } from './values.ts';

/** A property as a path step from `owner` after `prefix`: with default arguments, or milestoning dates, when it takes any. */
export function stepOf(session: Session, owner: string, prefix: PropertyPath, p: PropertyInfo): PropertyPath[number] {
  const graph = session.project.graph;
  return stepFor(graph, session.query, owner, prefix, p, (type, many) => defaultValue(graph, type, many));
}

/** The button that edits a path's arguments; null when no step takes any. */
export function argumentsButton(session: Session, path: PropertyPath, apply: (path: PropertyPath) => void): HTMLElement | null {
  const steps = path.filter((s) => s.args !== undefined && s.args.length > 0);
  if (steps.length === 0) return null;
  const summary = steps.map((s) => `${s.property}(${s.args!.map(valueLabel).join(', ')})`).join(', ');
  return h('button', { class: 'q-btn small q-args', title: `Arguments: ${summary}`, onclick: () => argumentsDialog(session, path, apply) }, '(…)');
}

/** One editor per parameter of each derived property on the path. */
export function argumentsDialog(session: Session, path: PropertyPath, apply: (path: PropertyPath) => void): void {
  const graph = session.project.graph;
  const root = session.query.source.class;
  const variables = queryVariables(session.query);
  let draft: PropertyPath = path;
  const body = h('div');
  const draw = (): void => {
    mount(body, draft.flatMap((s, i) => {
      if (s.args === undefined || s.args.length === 0) return [];
      const { prop } = propertyAt(graph, root, draft.slice(0, i + 1));
      const params = graph.parametersOf(prop);
      return [
        h('div', { class: 'q-args__title mono' }, `${humanize(prop.name)}  ${prop.name}(${params.map((p) => p.name).join(', ')})`),
        params.map((p, j) => h('div', { class: 'q-field', style: 'grid-template-columns:150px 1fr' },
          h('label', { title: `${p.name}: ${p.type}` }, `${p.name}: ${simpleName(p.type)}`),
          valueEditor({
            graph, type: p.type, many: isToMany(p.multiplicity), value: s.args![j], variables,
            onChange: (v: Value) => {
              draft = draft.map((x, k) => (k === i ? { ...x, args: x.args!.map((a, m) => (m === j ? v : a)) } : x));
              draw();
            },
          }))),
      ];
    }));
  };
  draw();
  dialog('Derived property arguments', (d) => ({
    body,
    foot: [
      h('button', { class: 'q-btn', onclick: () => d.close() }, 'Cancel'),
      h('button', { class: 'q-btn primary', onclick: () => { d.close(); apply(draft); } }, 'Apply'),
    ],
  }), { wide: true });
}
