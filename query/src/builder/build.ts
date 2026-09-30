// The query state as a lambda: V1 protocol JSON built with pure-protocol, the Relation API for
// tables (design D4, D5). The shape follows upstream's typed query builder, in its order:
//
//   {params | Class.all()->filter(x|...)->project(~[...])[->groupBy(~[...], ~[...])]
//             [->distinct()][->sort([...])][->limit(n)][->slice(a, b)]}
//
// and for execution `->from(mapping, runtime)` is appended, as upstream does in typed mode.

import {
  and, collection, element, enumValue, fn, lambda, lit, not, or, parameter, property, type, variable,
  type AppliedFunction, type ColSpec, type Lambda, type ValueSpecification,
} from '../../../pure-protocol/src/index.ts';
import { agg, asc, colSpecs, derive, desc, from } from '../../../pure-protocol/src/index.ts';
import { isToMany, type ModelGraph } from '../model/graph.ts';
import type {
  AggregateOp, Condition, DateFunction, FilterNode, Group, PropertyPath, QueryState, Value,
} from './state.ts';

/** A path's property chain from `$root`, and where it first crosses a to-many property. */
interface ResolvedPath {
  /** Indices of steps whose property is to-many (the chain splits there into `exists`). */
  readonly toManyAt: readonly number[];
  /** Each step's owning class, in order. */
  readonly owners: readonly string[];
}

export class BuildError extends Error {}

export function resolvePath(graph: ModelGraph, root: string, path: PropertyPath): ResolvedPath {
  const toManyAt: number[] = [];
  const owners: string[] = [];
  let owner = root;
  path.forEach((step, i) => {
    const p = graph.property(owner, step.property);
    if (p === undefined) throw new BuildError(`${owner} has no property '${step.property}'`);
    owners.push(owner);
    if (isToMany(p.multiplicity) && i < path.length - 1) toManyAt.push(i);
    owner = p.type;
  });
  return { toManyAt, owners };
}

/** `$v.a.b(...)` for steps [from, to). */
function chain(start: ValueSpecification, path: PropertyPath, fromStep: number, toStep: number): ValueSpecification {
  let node = start;
  for (let i = fromStep; i < toStep; i++) {
    const step = path[i]!;
    node = step.args !== undefined && step.args.length > 0
      ? { _type: 'property', property: step.property, parameters: [node, ...step.args.map(valueSpec)] }
      : property(node, step.property);
  }
  return node;
}

/** A value as protocol JSON. */
export function valueSpec(v: Value): ValueSpecification {
  switch (v.kind) {
    case 'string': return lit.string(v.value);
    case 'boolean': return lit.boolean(v.value);
    case 'integer': return lit.integer(v.value);
    case 'float': return lit.float(v.value);
    case 'decimal': return lit.decimal(v.value);
    case 'strictDate': return lit.strictDate(v.value);
    case 'dateTime': return lit.dateTime(v.value);
    case 'enum': return enumValue(v.enumeration, v.value);
    case 'dateFunction': return dateFunction(v.function);
    case 'list': return collection(v.values.map(valueSpec));
    case 'parameter': return variable(v.name);
  }
}

function dateFunction(d: DateFunction): ValueSpecification {
  switch (d.kind) {
    case 'today': return fn('today');
    case 'now': return fn('now');
    case 'firstDayOfThis': return fn(`firstDayOfThis${d.unit}`);
    case 'adjust': return fn('adjust', fn(d.from), lit.integer(d.amount) as ValueSpecification,
      enumValue('meta::pure::functions::date::DurationUnit', d.unit));
  }
}

/** The predicate a condition asserts about `value`, the chain's end. */
function predicate(c: Condition, value: ValueSpecification): ValueSpecification {
  const rhs = (): ValueSpecification => {
    if (c.value === undefined) throw new BuildError(`the condition on '${c.path.map((s) => s.property).join('.')}' has no value`);
    return valueSpec(c.value);
  };
  switch (c.operator) {
    case 'equal': return fn('equal', value, rhs());
    case 'notEqual': return not(fn('equal', value, rhs()));
    case 'lessThan': return fn('lessThan', value, rhs());
    case 'lessThanEqual': return fn('lessThanEqual', value, rhs());
    case 'greaterThan': return fn('greaterThan', value, rhs());
    case 'greaterThanEqual': return fn('greaterThanEqual', value, rhs());
    case 'startsWith': return fn('startsWith', value, rhs());
    case 'notStartsWith': return not(fn('startsWith', value, rhs()));
    case 'contains': return fn('contains', value, rhs());
    case 'notContains': return not(fn('contains', value, rhs()));
    case 'endsWith': return fn('endsWith', value, rhs());
    case 'notEndsWith': return not(fn('endsWith', value, rhs()));
    case 'in': return fn('in', value, rhs());
    case 'notIn': return not(fn('in', value, rhs()));
    case 'isEmpty': return fn('isEmpty', value);
    case 'isNotEmpty': return fn('isNotEmpty', value);
  }
}

/**
 * A condition on `$var`: the property chain, split at each to-many step into
 * `->exists(x_n|...)`, as upstream's filter builds it (census §5.4).
 */
function condition(graph: ModelGraph, root: string, c: Condition, varName: string, depth: number): ValueSpecification {
  const { toManyAt } = resolvePath(graph, root, c.path);
  const build = (start: ValueSpecification, fromStep: number, splits: readonly number[], d: number): ValueSpecification => {
    const [split, ...rest] = splits;
    if (split === undefined) return predicate(c, chain(start, c.path, fromStep, c.path.length));
    const inner = `${varName}_${d}`;
    const collectionNode = chain(start, c.path, fromStep, split + 1);
    return fn('exists', collectionNode, lambda([inner], build(variable(inner), split + 1, rest, d + 1)));
  };
  return build(variable(varName), 0, toManyAt, depth + 1);
}

function filterNode(graph: ModelGraph, root: string, n: FilterNode, varName: string): ValueSpecification {
  if (n.kind === 'condition') return condition(graph, root, n, varName, 0);
  const terms = n.children.map((c) => filterNode(graph, root, c, varName));
  if (terms.length === 0) throw new BuildError('an empty filter group');
  return n.op === 'and' ? and(...terms) : or(...terms);
}

/** Does a filter group hold at least one condition? (An empty filter is no filter.) */
export function hasConditions(g: Group | undefined): boolean {
  return g !== undefined && g.children.some((c) => c.kind === 'condition' || hasConditions(c));
}

function reducer(op: AggregateOp): Lambda {
  const y = variable('y');
  switch (op) {
    case 'count': return lambda(['y'], fn('count', y));
    case 'distinctCount': return lambda(['y'], fn('count', fn('distinct', y)));
    case 'sum': return lambda(['y'], fn('sum', y));
    case 'average': return lambda(['y'], fn('average', y));
    case 'min': return lambda(['y'], fn('min', y));
    case 'max': return lambda(['y'], fn('max', y));
    case 'stdDevPopulation': return lambda(['y'], fn('stdDevPopulation', y));
    case 'stdDevSample': return lambda(['y'], fn('stdDevSample', y));
    case 'joinStrings': return lambda(['y'], fn('joinStrings', y, lit.string(',')));
  }
}

export interface BuildOptions {
  /** Append `->from(mapping, runtime)` (for execution; saved content leaves it out). */
  readonly withFrom: boolean;
  /** Cap the rows: a preview's `->limit(n)` after the query's own options. */
  readonly previewLimit?: number;
}

/** The query as its lambda. */
export function buildLambda(graph: ModelGraph, q: QueryState, options: BuildOptions): Lambda {
  if (q.columns.length === 0) throw new BuildError('add at least one column');
  const root = q.source.class;
  let rel: ValueSpecification = fn('getAll', element(root));
  if (hasConditions(q.filter)) {
    rel = fn('filter', rel, lambda(['x'], filterNode(graph, root, q.filter!, 'x')));
  }
  const cols: ColSpec[] = q.columns.map((c) => derive(c.name, lambda(['x'], chain(variable('x'), c.path, 0, c.path.length))));
  let r = from(rel).apply('project', colSpecs(cols));
  const aggregated = q.columns.filter((c) => c.aggregate !== undefined);
  if (aggregated.length > 0) {
    const keys = q.columns.filter((c) => c.aggregate === undefined).map((c) => c.name);
    // the aggregate replaces its column: map the row to the column, reduce the values
    r = r.groupBy(keys, aggregated.map((c) => agg(c.name, lambda(['x'], property(variable('x'), c.name)), reducer(c.aggregate!))));
  }
  if (q.options.distinct) r = r.distinct();
  if (q.options.sort.length > 0) {
    r = r.sort(q.options.sort.map((s): AppliedFunction => (s.direction === 'asc' ? asc(s.column) : desc(s.column))));
  }
  if (q.options.limit !== undefined) r = r.limit(q.options.limit);
  if (q.options.slice !== undefined) r = r.slice(q.options.slice.start, q.options.slice.end);
  if (options.previewLimit !== undefined) r = r.limit(options.previewLimit);
  let body: ValueSpecification = r.node;
  if (options.withFrom) body = fn('from', body, element(q.source.mapping), element(q.source.runtime));
  return lambda(q.parameters.map((p) => parameter(p.name, type(p.type), p.multiplicity)), body);
}

/** Every parameter a query references, by name. */
export function referencedParameters(q: QueryState): Set<string> {
  const out = new Set<string>();
  const visitValue = (v: Value | undefined): void => {
    if (v === undefined) return;
    if (v.kind === 'parameter') out.add(v.name);
    if (v.kind === 'list') v.values.forEach(visitValue);
  };
  const visit = (n: FilterNode): void => {
    if (n.kind === 'condition') {
      visitValue(n.value);
      n.path.forEach((s) => s.args?.forEach(visitValue));
    } else n.children.forEach(visit);
  };
  if (q.filter) visit(q.filter);
  q.columns.forEach((c) => c.path.forEach((s) => s.args?.forEach(visitValue)));
  return out;
}
