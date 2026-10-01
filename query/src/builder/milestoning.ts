// Milestoning, as upstream's query builder does it (stores/milestoning): a temporal source class
// takes its dates in `all(...)`, by default the parameters $businessDate / $processingDate (Date[1],
// made when the class is chosen); a property into a temporal class either takes the dates from the
// class it leaves (propagation: `$x.rating`) or writes them (`$x.rating($businessDate)`).

import { milestoningDates, type ModelGraph, type PropertyInfo } from '../model/graph.ts';
import { emptyQuery, type ClassSource, type Parameter, type PropertyPath, type QueryState, type Value } from './state.ts';

const DATE_PARAMETER = (name: string): Parameter => ({ name, type: 'Date', multiplicity: { lowerBound: 1, upperBound: 1 } });

/** A new query on a class: a temporal class as of its date parameters, which the query then has. */
export function queryOn(graph: ModelGraph, source: ClassSource, parameters: readonly Parameter[] = []): QueryState {
  return withSource(graph, { ...emptyQuery(source), parameters }, source);
}

/** The query on another source: its milestoning follows the class (kept when the class keeps the same dates). */
export function withSource(graph: ModelGraph, q: QueryState, source: ClassSource): QueryState {
  const { milestoning, ...rest } = q;
  const t = graph.temporalOf(source.class);
  if (t === undefined) return { ...rest, source };
  if (milestoning && graph.temporalOf(q.source.class) === t) return { ...rest, source, milestoning };
  const dates = Object.fromEntries(milestoningDates(t).map((d): [string, Value] => [d, { kind: 'variable', name: d }]));
  return withDateParameters({ ...rest, source, milestoning: { kind: 'asOf', dates } });
}

/**
 * Does a property into a temporal class take its dates from the class it leaves? (upstream's
 * isDefaultDatePropagationSupported): not from a class without dates, nor on the first step when
 * the source is every version, nor after a derived property; from a bitemporal class always;
 * otherwise when both have the same milestoning.
 */
export function propagates(graph: ModelGraph, q: QueryState, owner: string, prefix: PropertyPath, target: string): boolean {
  const from = graph.temporalOf(owner);
  if (from === undefined) return false;
  if (prefix.length === 0 && q.milestoning?.kind === 'allVersions') return false;
  if (prefix.length > 0) {
    const last = prefix[prefix.length - 1]!;
    if (graph.property(prefixOwner(graph, q.source.class, prefix.slice(0, -1)), last.property)?.derived) return false;
  }
  return from === 'bitemporal' || from === graph.temporalOf(target);
}

function prefixOwner(graph: ModelGraph, root: string, path: PropertyPath): string {
  return path.reduce((owner, s) => graph.property(owner, s.property)?.type ?? owner, root);
}

/**
 * A property as a path step: a derived property with parameters carries default arguments; a
 * property into a temporal class whose dates do not propagate carries the date parameters.
 */
export function stepFor(graph: ModelGraph, q: QueryState, owner: string, prefix: PropertyPath, p: PropertyInfo,
  defaultOf: (type: string, many: boolean) => Value): PropertyPath[number] {
  const params = graph.parametersOf(p);
  if (params.length === 0 || (!p.derived && propagates(graph, q, owner, prefix, p.type))) return { property: p.name };
  return {
    property: p.name,
    args: p.derived ? params.map((x) => defaultOf(x.type, x.multiplicity.upperBound === undefined)) : params.map((x): Value => ({ kind: 'variable', name: x.name })),
  };
}

/** The query with a Date[1] parameter for each milestoning date it uses that is not yet a parameter or constant. */
export function withDateParameters(q: QueryState): QueryState {
  const known = new Set([...q.parameters.map((p) => p.name), ...(q.constants ?? []).map((c) => c.name)]);
  const used = new Set<string>();
  const visit = (v: Value | undefined): void => {
    if (v?.kind === 'variable' && (v.name === 'businessDate' || v.name === 'processingDate')) used.add(v.name);
  };
  if (q.milestoning?.kind === 'asOf') Object.values(q.milestoning.dates).forEach(visit);
  const steps = (path: PropertyPath): void => path.forEach((s) => s.args?.forEach(visit));
  q.columns.forEach((c) => steps(c.path));
  const conditions = (n: QueryState['filter']): void => n?.children.forEach((c) => (c.kind === 'group' ? conditions(c) : steps(c.path)));
  conditions(q.filter);
  const missing = ['processingDate', 'businessDate'].filter((d) => used.has(d) && !known.has(d));
  return missing.length === 0 ? q : { ...q, parameters: [...q.parameters, ...missing.map(DATE_PARAMETER)] };
}
