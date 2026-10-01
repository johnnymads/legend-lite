// A lambda read back into the form: the shapes build.ts writes (and upstream's typed query builder
// writes the same), recognised exactly. Anything else is not guessed at -- the query stays in
// text mode with the reason, and still runs and saves (upstream's "unsupported query", census §5.6).

import type {
  AppliedFunction, AppliedProperty, ColSpec, Lambda, ValueSpecification, Variable,
} from '../../../pure-protocol/src/index.ts';
import type { ModelGraph } from '../model/graph.ts';
import {
  freshId, type AggregateOp, type ClassSource, type DateFunction, type FilterNode, type GraphFetch, type GraphNode, type Group, type Operator,
  type Parameter, type PercentileOptions, type ProjectionColumn, type PropertyPath, type PropertyStep, type QueryState, type SortSpec, type Value,
  type WindowColumn, type WindowOp,
} from './state.ts';

export type Loaded =
  | { readonly ok: true; readonly query: QueryState }
  | { readonly ok: false; readonly reason: string };

class Unsupported extends Error {}

const fail = (reason: string): never => { throw new Unsupported(reason); };

type Node = ValueSpecification & { readonly _type: string };

function isFunc(n: Node, name?: string): n is AppliedFunction {
  return n._type === 'func' && (name === undefined || (n as AppliedFunction).function === name);
}

function funcName(n: AppliedFunction): string {
  // the grammar may write a function by its full path (`meta::pure::functions::collection::filter`)
  const f = n.function;
  const i = f.lastIndexOf('::');
  return i < 0 ? f : f.slice(i + 2);
}

function colSpecs(n: Node): readonly ColSpec[] {
  const ci = n as unknown as { _type: string; type?: string; value?: { colSpecs?: ColSpec[] } & ColSpec };
  if (ci._type !== 'classInstance') return fail('expected a column list (~[...])');
  if (ci.type === 'colSpecArray') return ci.value?.colSpecs ?? [];
  if (ci.type === 'colSpec' && ci.value) return [ci.value];
  return fail(`a ${ci.type} where a column list was expected`);
}

/** `$x.a.b(...)` read back as a path from the lambda's variable. */
function chainOf(n: Node, varName: string): PropertyPath {
  const steps: PropertyStep[] = [];
  let cur: Node = n;
  while (cur._type === 'property') {
    const p = cur as AppliedProperty;
    const [owner, ...args] = p.parameters as Node[];
    if (!owner) fail('a property with no owner');
    steps.unshift(args.length > 0 ? { property: p.property, args: args.map(valueOf) } : { property: p.property });
    cur = owner!;
  }
  if (cur._type !== 'var' || (cur as Variable).name !== varName) fail(`a path that does not start at $${varName}`);
  if (steps.length === 0) fail(`$${varName} itself, where a property path was expected`);
  return steps;
}

function lambdaBody(n: Node): { param: string; body: Node } {
  if (n._type !== 'lambda') return fail('expected a lambda');
  const l = n as Lambda;
  if (l.parameters.length !== 1 || l.body.length !== 1) return fail('a lambda of other than one parameter and one expression');
  return { param: l.parameters[0]!.name, body: l.body[0] as Node };
}

function numberText(v: unknown): string {
  return typeof v === 'number' ? String(v) : String((v as { text?: string }).text ?? v);
}

/** A value: a literal, an enum value, a list, a parameter, a relative date. */
export function valueOf(n: Node): Value {
  switch (n._type) {
    case 'string': return { kind: 'string', value: (n as unknown as { value: string }).value };
    case 'boolean': return { kind: 'boolean', value: (n as unknown as { value: boolean }).value };
    case 'integer': return { kind: 'integer', value: numberText((n as unknown as { value: unknown }).value) };
    case 'float': return { kind: 'float', value: numberText((n as unknown as { value: unknown }).value) };
    case 'decimal': return { kind: 'decimal', value: numberText((n as unknown as { value: unknown }).value) };
    case 'strictDate': return { kind: 'strictDate', value: (n as unknown as { value: string }).value };
    case 'dateTime': return { kind: 'dateTime', value: (n as unknown as { value: string }).value };
    case 'var': return { kind: 'parameter', name: (n as Variable).name };
    case 'collection': return { kind: 'list', values: (n as unknown as { values: Node[] }).values.map(valueOf) };
    case 'enumValue': {
      const e = n as unknown as { fullPath: string; value: string };
      return { kind: 'enum', enumeration: e.fullPath, value: e.value };
    }
    case 'property': {
      const p = n as AppliedProperty;
      const owner = p.parameters[0] as Node | undefined;
      if (p.parameters.length === 1 && owner?._type === 'packageableElementPtr') {
        return { kind: 'enum', enumeration: (owner as unknown as { fullPath: string }).fullPath, value: p.property };
      }
      return fail('a property where a value was expected');
    }
    case 'func': {
      const f = n as AppliedFunction;
      const name = funcName(f);
      const args = f.parameters as Node[];
      if (name === 'minus' && args.length === 1) {
        const inner = valueOf(args[0]!);
        if (inner.kind === 'integer' || inner.kind === 'float' || inner.kind === 'decimal') return { ...inner, value: `-${inner.value}` };
      }
      const d = dateFunctionOf(name, args);
      if (d) return { kind: 'dateFunction', function: d };
      return fail(`the function ${name}() as a value`);
    }
    default: return fail(`a ${n._type} as a value`);
  }
}

function dateFunctionOf(name: string, args: readonly Node[]): DateFunction | undefined {
  if (args.length === 0) {
    if (name === 'today') return { kind: 'today' };
    if (name === 'now') return { kind: 'now' };
    const m = /^firstDayOfThis(Week|Month|Quarter|Year)$/.exec(name);
    if (m) return { kind: 'firstDayOfThis', unit: m[1] as 'Week' };
  }
  if (name === 'adjust' && args.length === 3) {
    const [from, amount, unit] = args as [Node, Node, Node];
    const fromName = isFunc(from) ? funcName(from) : '';
    const u = valueOf(unit);
    const a = valueOf(amount);
    if ((fromName === 'today' || fromName === 'now') && u.kind === 'enum' && a.kind === 'integer'
      && ['DAYS', 'WEEKS', 'MONTHS', 'YEARS'].includes(u.value)) {
      return { kind: 'adjust', from: fromName, amount: Number(a.value), unit: u.value as 'DAYS' };
    }
  }
  return undefined;
}

const COMPARE: Readonly<Record<string, Operator>> = {
  equal: 'equal', lessThan: 'lessThan', lessThanEqual: 'lessThanEqual', greaterThan: 'greaterThan',
  greaterThanEqual: 'greaterThanEqual', startsWith: 'startsWith', contains: 'contains', endsWith: 'endsWith', in: 'in',
};
const NEGATED: Readonly<Record<string, Operator>> = {
  equal: 'notEqual', startsWith: 'notStartsWith', contains: 'notContains', endsWith: 'notEndsWith', in: 'notIn',
};

/** A condition on `$v`, with `prefix` the path already walked through enclosing exists. */
function conditionOf(n: Node, v: string, prefix: PropertyPath): FilterNode {
  if (isFunc(n)) {
    const name = funcName(n);
    const args = n.parameters as Node[];
    if (name === 'not' && args.length === 1 && isFunc(args[0]!) && NEGATED[funcName(args[0] as AppliedFunction)]) {
      const inner = args[0] as AppliedFunction;
      const [lhs, rhs] = inner.parameters as Node[];
      return { kind: 'condition', id: freshId('c'), path: [...prefix, ...chainOf(lhs!, v)], operator: NEGATED[funcName(inner)]!, value: valueOf(rhs!) };
    }
    if (COMPARE[name] && args.length === 2) {
      return { kind: 'condition', id: freshId('c'), path: [...prefix, ...chainOf(args[0]!, v)], operator: COMPARE[name]!, value: valueOf(args[1]!) };
    }
    if ((name === 'isEmpty' || name === 'isNotEmpty') && args.length === 1) {
      return { kind: 'condition', id: freshId('c'), path: [...prefix, ...chainOf(args[0]!, v)], operator: name };
    }
    if (name === 'exists' && args.length === 2) {
      const through = chainOf(args[0]!, v);
      const { param, body } = lambdaBody(args[1]!);
      const inner = conditionOf(body, param, [...prefix, ...through]);
      if (inner.kind !== 'condition') fail('a group inside exists()');
      return inner;
    }
    if ((name === 'and' || name === 'or') && args.length === 2) return groupOf(n, v, prefix);
  }
  return fail(`a filter the form cannot show (${isFunc(n) ? `${funcName(n)}()` : n._type})`);
}

/** and/or trees flattened into groups: `(a && b) && c` is one AND group of three. */
function groupOf(n: Node, v: string, prefix: PropertyPath): Group {
  const op = funcName(n as AppliedFunction) as 'and' | 'or';
  const children: FilterNode[] = [];
  const collect = (m: Node): void => {
    if (isFunc(m, op) || (isFunc(m) && funcName(m) === op)) {
      for (const a of (m as AppliedFunction).parameters as Node[]) collect(a);
    } else children.push(conditionOf(m, v, prefix));
  };
  collect(n);
  return { kind: 'group', id: freshId('g'), op, children };
}

const REDUCERS: Readonly<Record<string, AggregateOp>> = {
  count: 'count', sum: 'sum', average: 'average', min: 'min', max: 'max',
  stdDevPopulation: 'stdDevPopulation', stdDevSample: 'stdDevSample', joinStrings: 'joinStrings',
};

function reducerOf(l: Node): AggregateOp {
  return aggregateOf(l).aggregate;
}

/** An aggregate's reduce lambda as the column's aggregate -- with `percentile`'s settings. */
function aggregateOf(l: Node): { aggregate: AggregateOp; percentile?: PercentileOptions } {
  const { param, body } = lambdaBody(l);
  if (!isFunc(body)) return fail('an aggregate that is not a function');
  const name = funcName(body);
  const [arg, ...rest] = body.parameters as Node[];
  if (name === 'count' && arg && isFunc(arg) && funcName(arg) === 'distinct') return { aggregate: 'distinctCount' };
  if (!arg || arg._type !== 'var' || (arg as Variable).name !== param) return fail(`the aggregate ${name}() over something other than its values`);
  if (name === 'wavg') return rest.length === 0 ? { aggregate: 'wavg' } : fail('a wavg() with arguments');
  if (name === 'percentile') {
    // upstream's two spellings: percentile(p), or percentile(p, ascending, continuous)
    const [p, ascending, continuous] = rest;
    const value = p && (p._type === 'float' || p._type === 'integer' || p._type === 'decimal') ? Number(String((p as { value: unknown }).value)) : NaN;
    const flag = (n: Node | undefined): boolean | undefined => (n?._type === 'boolean' ? (n as { value: boolean }).value : undefined);
    if (!Number.isFinite(value)) return fail('a percentile() whose value is not a number');
    if (rest.length === 1) return { aggregate: 'percentile', percentile: { value: Number((value * 100).toFixed(8)), ascending: true, continuous: true } };
    const a = flag(ascending), c = flag(continuous);
    if (rest.length !== 3 || a === undefined || c === undefined) return fail('a percentile() with other arguments');
    return { aggregate: 'percentile', percentile: { value: Number((value * 100).toFixed(8)), ascending: a, continuous: c } };
  }
  if (rest.length > 0 && name !== 'joinStrings') return fail(`the aggregate ${name}() with arguments`);
  const op = REDUCERS[name];
  return op ? { aggregate: op } : fail(`the aggregate ${name}()`);
}

function sortOf(n: Node): SortSpec {
  if (!isFunc(n)) return fail('a sort key that is not ascending()/descending()');
  const name = funcName(n);
  if (name !== 'ascending' && name !== 'descending') return fail(`the sort key ${name}()`);
  const [spec] = colSpecs(n.parameters[0] as Node);
  return { column: spec!.name, direction: name === 'ascending' ? 'asc' : 'desc' };
}

function intOf(n: Node | undefined): number {
  const v = n ? valueOf(n) : undefined;
  return v?.kind === 'integer' ? Number(v.value) : fail('a count that is not an integer');
}

/** A lambda's parameters, when they have simple types (a text-only query still takes them). */
export function parametersOf(lambda: Lambda): Parameter[] {
  return lambda.parameters.flatMap((p) => {
    const raw = p.genericType?.rawType;
    return raw && raw._type === 'packageableType' && p.multiplicity ? [{ name: p.name, type: raw.fullPath, multiplicity: p.multiplicity }] : [];
  });
}

/**
 * The lambda as form state. `context` supplies mapping and runtime when the lambda carries no
 * `->from()` (a saved query keeps them in its execution context).
 */
export function loadLambda(graph: ModelGraph, lambda: Lambda, context?: { mapping: string; runtime: string; dataSpace?: ClassSource['dataSpace'] }): Loaded {
  try {
    return { ok: true, query: load(graph, lambda, context) };
  } catch (e) {
    if (e instanceof Unsupported) return { ok: false, reason: e.message };
    throw e;
  }
}

function load(graph: ModelGraph, lambda: Lambda, context?: { mapping: string; runtime: string; dataSpace?: ClassSource['dataSpace'] }): QueryState {
  if (lambda.body.length !== 1) fail('a query of several statements (let)');
  const parameters: Parameter[] = lambda.parameters.map((p) => {
    const raw = p.genericType?.rawType;
    if (!raw || raw._type !== 'packageableType' || !p.multiplicity) return fail(`the parameter ${p.name} has no simple type`);
    return { name: p.name, type: raw.fullPath, multiplicity: p.multiplicity };
  });

  // walk the chain from the outside in: from, slice, limit, sort, distinct, groupBy, project, filter, getAll
  let n = lambda.body[0] as Node;
  let mapping = context?.mapping;
  let runtime = context?.runtime;
  if (isFunc(n, 'from') || (isFunc(n) && funcName(n) === 'from')) {
    const args = (n as AppliedFunction).parameters as Node[];
    const ptr = (x: Node | undefined): string => (x?._type === 'packageableElementPtr' ? (x as unknown as { fullPath: string }).fullPath : fail('from() with other than elements'));
    if (args.length === 3) { mapping = ptr(args[1]); runtime = ptr(args[2]); }
    else if (args.length === 2) { runtime = ptr(args[1]); }
    else fail('from() of other than a mapping and a runtime');
    n = args[0]!;
  }
  let slice: { start: number; end: number } | undefined;
  let limit: number | undefined;
  let sort: SortSpec[] = [];
  let distinct = false;
  let groupBy: { keys: string[]; aggs: readonly ColSpec[] } | undefined;
  let postFilter: Group | undefined;
  const windows: WindowColumn[] = [];
  let graphFetch: GraphFetch | undefined;
  const step = (name: string): Node[] | undefined => (isFunc(n) && funcName(n) === name ? (n as AppliedFunction).parameters as Node[] : undefined);
  let a: Node[] | undefined;
  let specs: readonly ColSpec[] = [];
  if ((a = step('serialize')) && a.length === 2) {
    // a graph fetch: serialize(graphFetch[Checked](source, tree), tree)
    const inner = a[0]!;
    const name = isFunc(inner) ? funcName(inner) : '';
    if (name !== 'graphFetch' && name !== 'graphFetchChecked') return fail('serialize() of other than a graph fetch');
    const [src, tree] = (inner as AppliedFunction).parameters as Node[];
    graphFetch = { tree: graphTreeOf(tree!), checked: name === 'graphFetchChecked' };
    n = src!;
  } else {
    if ((a = step('slice')) && a.length === 3) { slice = { start: intOf(a[1]), end: intOf(a[2]) }; n = a[0]!; }
    if ((a = step('limit')) && a.length === 2) { limit = intOf(a[1]); n = a[0]!; }
    if ((a = step('take')) && a.length === 2) fail('take() (a TDS query)');
    if ((a = step('sort')) && a.length === 2) {
      const keys = a[1]!._type === 'collection' ? (a[1] as unknown as { values: Node[] }).values : [a[1]!];
      sort = keys.map(sortOf);
      n = a[0]!;
    }
    if ((a = step('distinct')) && a.length === 1) { distinct = true; n = a[0]!; }
    if ((a = step('filter')) && a.length === 2) {
      // after project/groupBy/extend: a post-filter on the result's columns
      const { param, body } = lambdaBody(a[1]!);
      const f = conditionOf(body, param, []);
      postFilter = f.kind === 'group' ? f : { kind: 'group', id: freshId('g'), op: 'and', children: [f] };
      n = a[0]!;
    }
    while ((a = step('extend')) && a.length === 3) {
      windows.unshift(windowOf(a[1]!, a[2]!));
      n = a[0]!;
    }
    if ((a = step('extend'))) fail('extend() without a window (a calculated column belongs in project(~[...]))');
    if ((a = step('groupBy')) && a.length === 3) {
      groupBy = { keys: colSpecs(a[1]!).map((c) => c.name), aggs: colSpecs(a[2]!) };
      n = a[0]!;
    } else if ((a = step('aggregate')) && a.length === 2) {
      groupBy = { keys: [], aggs: colSpecs(a[1]!) };
      n = a[0]!;
    }
    a = step('project');
    if (!a || a.length !== 2) return fail(isFunc(n) ? `${funcName(n)}() where the form expects project(~[...])` : 'a query that does not project columns');
    specs = colSpecs(a[1]!);
    n = a[0]!;
  }
  let filter: Group | undefined;
  if ((a = step('filter')) && a.length === 2) {
    const { param, body } = lambdaBody(a[1]!);
    const f = conditionOf(body, param, []);
    filter = f.kind === 'group' ? f : { kind: 'group', id: freshId('g'), op: 'and', children: [f] };
    n = a[0]!;
  }
  a = step('getAll');
  if (!a || a.length !== 1 || a[0]!._type !== 'packageableElementPtr') return fail('a source other than Class.all()');
  const cls = (a[0] as unknown as { fullPath: string }).fullPath;
  if (!graph.classes.has(cls)) fail(`the class ${cls}, which the model does not have`);
  if (mapping === undefined || runtime === undefined) return fail('no mapping and runtime (neither from() nor an execution context)');

  const columns: ProjectionColumn[] = specs.map((s) => {
    if (!s.function1) return fail(`the column ${s.name} has no function`);
    const { param, body } = lambdaBody(s.function1 as Node);
    try {
      return { id: freshId('col'), name: s.name, path: chainOf(body, param) };
    } catch (e) {
      if (!(e instanceof Unsupported)) throw e;
      // not a property path: a calculated column, kept as its lambda
      return { id: freshId('col'), name: s.name, path: [], derivation: s.function1 };
    }
  });
  if (groupBy) {
    // each aggregate reads one projected column; an aggregate may rename it (`~[headcount:
    // x|$x.person: y|$y->count()]`), which the form keeps as the column's name
    // -- a wavg reads two: `x|wavgRowMapper($x.price, $x.quantity) : y|$y->wavg()`, its weight
    // column consumed (neither grouped nor shown)
    const keys = new Set(groupBy.keys);
    const readBy = new Map<string, string>();
    const weights = new Set<string>();
    const columnOf = (n: Node, param: string, g: string): string => {
      const read = chainOf(n, param);
      if (read.length !== 1) return fail(`the aggregate ${g} reads more than a column`);
      return read[0]!.property;
    };
    for (const g of groupBy.aggs) {
      if (!g.function1 || !g.function2) return fail(`the aggregate ${g.name} has no map and reduce`);
      const { param, body } = lambdaBody(g.function1 as Node);
      const { aggregate, percentile } = aggregateOf(g.function2 as Node);
      const mapper = isFunc(body) && funcName(body) === 'wavgRowMapper';
      if (mapper !== (aggregate === 'wavg')) return fail(`the aggregate ${g.name}: wavgRowMapper() and wavg() go together`);
      const [value, weight] = mapper ? (body as AppliedFunction).parameters as Node[] : [body];
      if (mapper && ((body as AppliedFunction).parameters.length !== 2 || !weight)) return fail(`the aggregate ${g.name}: wavgRowMapper() of other than a value and a weight`);
      const source = columnOf(value!, param, g.name);
      if (keys.has(source) || readBy.has(source)) fail(`the column ${source} is both grouped and aggregated`);
      readBy.set(source, g.name);
      const i = columns.findIndex((c) => c.name === source);
      if (i < 0) return fail(`the aggregate ${g.name} reads ${source}, which is not a column`);
      const w = weight ? columnOf(weight, param, g.name) : undefined;
      if (w !== undefined) {
        if (w === source || keys.has(w) || !columns.some((c) => c.name === w)) return fail(`the aggregate ${g.name} weighs by ${w}, which is not another column`);
        weights.add(w);
      }
      columns[i] = {
        ...columns[i]!, name: g.name, aggregate,
        ...(percentile ? { percentile } : {}),
        ...(w !== undefined ? { weight: w } : {}),
      };
    }
    for (const c of columns) {
      if (c.aggregate === undefined && !keys.has(c.name) && !weights.has(c.name)) fail(`the column ${c.name} is neither grouped nor aggregated`);
      if (weights.has(c.name) && readBy.has(c.name)) fail(`the column ${c.name} is both a weight and aggregated`);
    }
  }
  const source: ClassSource = {
    kind: 'class', class: cls, mapping, runtime,
    ...(context?.dataSpace ? { dataSpace: context.dataSpace } : {}),
  };
  return {
    source, columns, parameters,
    ...(filter ? { filter } : {}),
    ...(windows.length > 0 ? { windows } : {}),
    ...(postFilter ? { postFilter } : {}),
    ...(graphFetch ? { graph: graphFetch } : {}),
    options: { sort, distinct, ...(limit !== undefined ? { limit } : {}), ...(slice ? { slice } : {}) },
  };
}

/** `over(~[partition], [~sort->ascending()])` and a window column spec, read back. */
function windowOf(window: Node, specNode: Node): WindowColumn {
  if (!isFunc(window) || funcName(window) !== 'over') return fail('extend() with a window other than over()');
  let partition: string[] = [];
  let sortSpec: SortSpec | undefined;
  for (const part of window.parameters as Node[]) {
    if (part._type === 'classInstance') partition = colSpecs(part).map((c) => c.name);
    else {
      const keys = part._type === 'collection' ? (part as unknown as { values: Node[] }).values : [part];
      if (keys.length > 1) fail('a window sorted by more than one column');
      if (keys[0]) sortSpec = sortOf(keys[0]);
    }
  }
  const [spec] = colSpecs(specNode);
  if (!spec?.function1) return fail('a window column with no function');
  const f = spec.function1 as unknown as Lambda;
  if (f.parameters.length !== 3 || f.body.length !== 1) return fail('a window function of other than {p,w,r|...}');
  const [pn, wn, rn] = f.parameters.map((p) => p.name);
  const body = f.body[0] as Node;
  const base = { id: freshId('w'), name: spec.name, partition, ...(sortSpec ? { sort: sortSpec } : {}) };
  if (!spec.function2) {
    if (!isFunc(body)) return fail('a window function that is not a ranking');
    const name = funcName(body);
    const args = (body.parameters as Node[]).map((x) => (x._type === 'var' ? (x as Variable).name : ''));
    if ((name === 'rank' || name === 'denseRank' || name === 'percentRank') && args.join() === [pn, wn, rn].join()) return { ...base, op: name };
    if (name === 'rowNumber' && args.join() === [pn, rn].join()) return { ...base, op: 'rowNumber' };
    return fail(`the window function ${name}()`);
  }
  const read = chainOf(body, rn!);
  if (read.length !== 1) return fail('a window aggregate reading more than a column');
  const op = reducerOf(spec.function2 as Node);
  if (!['sum', 'count', 'min', 'max', 'average'].includes(op)) return fail(`the window aggregate ${op}`);
  return { ...base, op: op as WindowOp, column: read[0]!.property };
}

/** A graph fetch tree's properties, read back (aliases, arguments and subtypes stay text). */
function graphTreeOf(n: Node): GraphNode[] {
  const ci = n as unknown as { _type: string; type?: string; value?: { subTrees?: unknown[]; subTypeTrees?: unknown[] } };
  if (ci._type !== 'classInstance' || ci.type !== 'rootGraphFetchTree' || !ci.value) return fail('a graph fetch tree that is not #{...}#');
  if ((ci.value.subTypeTrees ?? []).length > 0) fail('a graph fetch tree with subtypes');
  const node = (t: unknown): GraphNode => {
    const p = t as { _type: string; property: string; parameters?: unknown[]; alias?: string; subType?: string; subTrees?: unknown[]; subTypeTrees?: unknown[] };
    if (p._type !== 'propertyGraphFetchTree' || (p.parameters ?? []).length > 0 || p.alias || p.subType || (p.subTypeTrees ?? []).length > 0) {
      return fail(`the graph fetch property ${p.property} (arguments, alias or subtype)`);
    }
    return { property: p.property, children: (p.subTrees ?? []).map(node) };
  };
  return (ci.value.subTrees ?? []).map(node);
}
