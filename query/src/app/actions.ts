// Edits a person makes, as functions of the query state: add a column or a condition from a
// property path, rename, move, remove. Every panel calls these through Session.update.

import { humanize, isToMany, type ModelGraph, type PropertyInfo } from '../model/graph.ts';
import { freshId, type Condition, type FilterNode, type Group, type Operator, type PropertyPath, type QueryState } from '../builder/state.ts';
import { withDateParameters } from '../builder/milestoning.ts';
import { defaultValue } from '../ui/values.ts';

/** What the explorer drags: a property path from the source class. */
export const PROPERTY_DRAG = 'application/x-legend-property';

/** A column's default name: each step humanized, joined with `/` (upstream's `Firm/Legal Name`). */
export function columnName(path: PropertyPath, humanized: boolean): string {
  return path.map((s) => (humanized ? humanize(s.property) : s.property)).join(humanized ? '/' : '_');
}

function unique(name: string, taken: ReadonlySet<string>): string {
  if (!taken.has(name)) return name;
  for (let i = 2; ; i++) if (!taken.has(`${name} ${i}`)) return `${name} ${i}`;
}

/** The property at the end of a path, and whether any step before it is to-many. */
export function propertyAt(graph: ModelGraph, root: string, path: PropertyPath): { prop: PropertyInfo; owner: string; explodes: boolean } {
  let owner = root;
  let explodes = false;
  let prop: PropertyInfo | undefined;
  path.forEach((step, i) => {
    prop = graph.property(owner, step.property);
    if (!prop) throw new Error(`${owner} has no property '${step.property}'`);
    if (isToMany(prop.multiplicity) && i < path.length - 1) explodes = true;
    if (i < path.length - 1) owner = prop.type;
  });
  if (!prop) throw new Error('an empty property path');
  return { prop, owner, explodes };
}

export function addColumn(q: QueryState, path: PropertyPath, humanized: boolean): QueryState {
  const taken = new Set(q.columns.map((c) => c.name));
  return withDateParameters({ ...q, columns: [...q.columns, { id: freshId('col'), name: unique(columnName(path, humanized), taken), path }] });
}

/** A condition on a path, typed by its property: its default operator and value. */
export function newCondition(graph: ModelGraph, root: string, path: PropertyPath): Condition {
  const { prop } = propertyAt(graph, root, path);
  const many = isToMany(prop.multiplicity);
  const operator: Operator = many ? 'in' : 'equal';
  return { kind: 'condition', id: freshId('c'), path, operator, value: defaultValue(graph, prop.type, operator === 'in') };
}

/** Add a condition to a group (the root AND group when none is named). */
export function addCondition(graph: ModelGraph, q: QueryState, path: PropertyPath, groupId?: string): QueryState {
  const c = newCondition(graph, q.source.class, path);
  const root: Group = q.filter ?? { kind: 'group', id: freshId('g'), op: 'and', children: [] };
  const target = groupId ?? root.id;
  return withDateParameters({ ...q, filter: mapGroup(root, target, (g) => ({ ...g, children: [...g.children, c] })) });
}

export function mapGroup(g: Group, id: string, f: (g: Group) => Group): Group {
  if (g.id === id) return f(g);
  return { ...g, children: g.children.map((c) => (c.kind === 'group' ? mapGroup(c, id, f) : c)) };
}

export function mapNode(g: Group, id: string, f: (n: FilterNode) => FilterNode | undefined): Group {
  const children: FilterNode[] = [];
  for (const c of g.children) {
    const next = c.id === id ? f(c) : c.kind === 'group' ? mapNode(c, id, f) : c;
    if (next !== undefined) children.push(next);
  }
  return { ...g, children };
}

/** Remove empty groups (but keep the root). */
export function prune(g: Group): Group {
  return {
    ...g,
    children: g.children
      .map((c) => (c.kind === 'group' ? prune(c) : c))
      .filter((c) => c.kind === 'condition' || c.children.length > 0),
  };
}

/** Which property paths the query uses (the explorer highlights them). */
export function usedPaths(q: QueryState): Set<string> {
  const out = new Set<string>();
  const key = (p: PropertyPath): string => p.map((s) => s.property).join('.');
  q.columns.forEach((c) => out.add(key(c.path)));
  const visit = (n: FilterNode): void => {
    if (n.kind === 'condition') out.add(key(n.path));
    else n.children.forEach(visit);
  };
  if (q.filter) visit(q.filter);
  return out;
}
