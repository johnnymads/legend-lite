// Snapshot -> the cube's queries as PROTOCOL JSON (docs/DATACUBE_TYPES_TO_SERVER_2026_09_27.md,
// T4b): every query DataCube sends, built as a tree with pure-protocol's Relation API. Pure text
// exists only where a person reads or writes it, and the compiler owns both edges: it parses what
// was typed (the snapshot holds the result: its source and each calculated column's lambda) and
// prints a query for a person to read. A tree cannot misplace an operator the way text can (the
// grammar applies < <= > >= left to right with && and ||), and no literal is ever spelled here.
//
// Literals keep the types the queries' text gave them before T4b -- an integer an integer, a
// fraction a float, exact digits exact; typing a literal by its column (T4c) is a change of
// meaning, made and proven there.

import {
  agg, and, asc, collection, derive, desc, fn, from, lambda, lit, not, or, property, variable,
  type AppliedFunction, type ColSpec, type Lambda, type Relation, type ValueSpecification,
} from '../../pure-protocol/src/index.ts';
import {
  CubeRefusal,
  columnType,
  LEAF_COUNT_COLUMN,
  PIVOT_TOTAL_KEY,
  isJsonValue,
  isRelativeDate,
  referencedColumns,
  rowColumns,
  totalOrderSorts,
  WINDOW_FUNCTIONS,
  type AggregateFn,
  type ColumnKind,
  type CubeSnapshot,
  type DerivedColumn,
  type FilterNode,
  type FilterOperator,
  type FilterValue,
  type Measure,
  type SortSpec,
  type WindowSpec,
} from './snapshot.ts';
import type { GroupKey, RowPath } from './tree.ts';
import { ROOT_COLUMN } from './grid/columns.ts';
import { PIVOT_SEPARATOR } from './generated/lite-facts.ts';
import { isBoolean, isNumeric, isVariant, plainType } from './types.ts';
import { columnRef } from './calc.ts';

// ---- literals: typed by the column's COMPILER type, never by the value ----

/**
 * A filter value as a literal node. `type` is its column's compiler type, and it alone decides
 * the literal (its plain primitive, from the generated type facts): a key or a filter value is
 * the cell's EXACT text (a day, a timestamp to the microsecond, a decimal's digits, an integer
 * past 2^53), written as the column's type writes it. A value whose column the compiler has not
 * typed is refused: the text's look (a `.`, a `-`) or JavaScript's type of it is a guess.
 */
export function literalNode(v: FilterValue, type?: string): ValueSpecification {
  if (isRelativeDate(v)) return fn(v.relative === 'today' ? 'today' : 'now');
  if (isJsonValue(v)) return fn('fromJson', lit.string(v.json));
  if (type === undefined) {
    throw new CubeRefusal(`the compiler has not typed the column this value ${JSON.stringify(v)} is compared with`);
  }
  if (isBoolean(type)) return lit.boolean(v === true || v === 'true');
  return lit.of(plainType(type), typeof v === 'boolean' ? String(v) : v);
}

// ---- filters ----

/** `$param.column`. */
function ref(param: string, column: string): ValueSpecification {
  return property(variable(param), column);
}

/** A nullable column as `toLower` takes it: `$x.c->toOne()->toLower()`. */
function lowered(r: ValueSpecification): AppliedFunction {
  return fn('toLower', fn('toOne', r));
}

const EQUAL = 'meta::pure::functions::boolean::equal';
const LESS = 'meta::pure::functions::boolean::lessThan';
const LESS_EQUAL = 'meta::pure::functions::boolean::lessThanEqual';
const GREATER = 'meta::pure::functions::boolean::greaterThan';
const GREATER_EQUAL = 'meta::pure::functions::boolean::greaterThanEqual';
const CONTAINS = 'meta::pure::functions::string::contains';
const STARTS_WITH = 'meta::pure::functions::string::startsWith';
const ENDS_WITH = 'meta::pure::functions::string::endsWith';
const IN = 'meta::pure::functions::collection::in';

/**
 * The Pure function each filter operator applies to the column, by path -- what the operator
 * MEANS (upstream DataCube defines its operators the same way, DataCubeFunction). The query
 * spells it by its short name, as a person writes it and as upstream sends it; the build
 * checks that the compiler resolves that name to this function wherever the operator is
 * offered (T5, tools/offer-facts). So "contains" -- text containment -- is not offered on a
 * number column, where the same name resolves to collection membership.
 */
export const OPERATOR_FUNCTION: Readonly<Record<FilterOperator, string>> = {
  equal: EQUAL, notEqual: EQUAL,
  lessThan: LESS, lessThanEqual: LESS_EQUAL, greaterThan: GREATER, greaterThanEqual: GREATER_EQUAL,
  isEmpty: 'meta::pure::functions::collection::isEmpty',
  isNotEmpty: 'meta::pure::functions::collection::isNotEmpty',
  contains: CONTAINS, notContains: CONTAINS, containsCaseInsensitive: CONTAINS,
  startsWith: STARTS_WITH, notStartsWith: STARTS_WITH, startsWithCaseInsensitive: STARTS_WITH,
  endsWith: ENDS_WITH, notEndsWith: ENDS_WITH, endsWithCaseInsensitive: ENDS_WITH,
  in: IN, notIn: IN, inCaseInsensitive: IN, notInCaseInsensitive: IN,
  equalCaseInsensitive: EQUAL, notEqualCaseInsensitive: EQUAL,
  equalColumn: EQUAL, notEqualColumn: EQUAL, equalCaseInsensitiveColumn: EQUAL, notEqualCaseInsensitiveColumn: EQUAL,
  lessThanColumn: LESS, lessThanEqualColumn: LESS_EQUAL, greaterThanColumn: GREATER, greaterThanEqualColumn: GREATER_EQUAL,
};

/** The operator's function applied, spelled by its short name. */
function apply(op: FilterOperator, ...args: ValueSpecification[]): AppliedFunction {
  const path = OPERATOR_FUNCTION[op];
  return fn(path.slice(path.lastIndexOf(':') + 1), ...args);
}

const COMPARISONS: ReadonlySet<FilterOperator> = new Set<FilterOperator>(
  ['equal', 'notEqual', 'lessThan', 'lessThanEqual', 'greaterThan', 'greaterThanEqual']);

const COLUMN_COMPARISONS: ReadonlySet<FilterOperator> = new Set<FilterOperator>(
  ['equalColumn', 'equalCaseInsensitiveColumn', 'notEqualColumn', 'notEqualCaseInsensitiveColumn',
    'lessThanColumn', 'lessThanEqualColumn', 'greaterThanColumn', 'greaterThanEqualColumn']);

/** `c`, or `!c` for a negated operator (`!=` is `!(a == b)`). */
function negated(c: ValueSpecification, negate: boolean): ValueSpecification {
  return negate ? not(c) : c;
}

/** A filter condition tree as a boolean expression over `$param`. */
export function filterNode(node: FilterNode, param = 'x', typeOf: TypeOf = () => undefined): ValueSpecification {
  switch (node.kind) {
    case 'and':
    case 'or': {
      // an empty group is a no-op while the user is still building it
      if (node.children.length === 0) return lit.boolean(node.kind === 'and');
      const parts = node.children.map((c) => filterNode(c, param, typeOf));
      return node.kind === 'and' ? and(...parts) : or(...parts);
    }
    case 'not':
      return not(filterNode(node.child, param, typeOf));
    case 'condition': {
      const r = ref(param, node.column);
      const type = typeOf(node.column);
      const one = (): ValueSpecification => literalNode(node.value as FilterValue, type);
      const many = (): readonly FilterValue[] => (node.value as readonly FilterValue[]) ?? [];
      // a text operator's operand is text, whatever the column: lowered here for the case-insensitive ones
      const preLowered = (v: FilterValue): ValueSpecification => lit.string(String(v).toLowerCase());

      const op = node.operator;
      if (COMPARISONS.has(op)) return negated(apply(op, r, one()), op === 'notEqual');

      if (COLUMN_COMPARISONS.has(op)) {
        if (!node.rightColumn) {
          throw new CubeRefusal(`operator '${op}' on '${node.column}' needs a rightColumn`);
        }
        const right = ref(param, node.rightColumn);
        const insensitive = op.includes('CaseInsensitive');
        return negated(insensitive ? apply(op, lowered(r), lowered(right)) : apply(op, r, right),
          op.startsWith('notEqual'));
      }

      switch (op) {
        case 'isEmpty':
        case 'isNotEmpty':
          return apply(op, r);
        case 'contains':
        case 'startsWith':
        case 'endsWith':
          return apply(op, r, one());
        case 'notContains':
        case 'notStartsWith':
        case 'notEndsWith':
          return not(apply(op, r, one()));
        case 'in': return apply(op, r, collection(many().map((v) => literalNode(v, type))));
        case 'notIn': return not(apply(op, r, collection(many().map((v) => literalNode(v, type)))));
        case 'equalCaseInsensitive':
        case 'notEqualCaseInsensitive': {
          const value = fn('toLower', lit.string(String(node.value as FilterValue)));
          return negated(apply(op, lowered(r), value), op === 'notEqualCaseInsensitive');
        }
        case 'containsCaseInsensitive':
        case 'startsWithCaseInsensitive':
        case 'endsWithCaseInsensitive':
          return apply(op, lowered(r), preLowered(node.value as FilterValue));
        case 'inCaseInsensitive': return apply(op, lowered(r), collection(many().map(preLowered)));
        case 'notInCaseInsensitive': return not(apply(op, lowered(r), collection(many().map(preLowered))));
        default: {
          const never: never = op as never;
          throw new Error(`unhandled filter operator: ${String(never)}`);
        }
      }
    }
  }
}

// ---- aggregates ----

/** The map and reduce of a measure; `when`, a pivot cell's condition: its rows only. */
function aggregateSpec(m: Measure, when?: ValueSpecification): ColSpec {
  const only = (value: ValueSpecification): ValueSpecification =>
    when === undefined ? value : fn('if', when, lambda([], value), lambda([], collection([])));
  const y = variable('y');
  switch (m.fn) {
    case 'count':
      return agg(m.name, lambda(['x'], only(lit.integer(1))), lambda(['y'], fn('count', y)));
    case 'wavg': {
      if (!m.weight) throw new CubeRefusal(`measure '${m.name}' uses wavg but has no weight column`);
      return agg(m.name, lambda(['x'], fn('wavgRowMapper', only(ref('x', m.column)), only(ref('x', m.weight)))),
        lambda(['y'], fn('wavg', y)));
    }
    case 'joinStrings':
      return agg(m.name, lambda(['x'], only(ref('x', m.column))), lambda(['y'], fn('joinStrings', y, lit.string(', '))));
    case 'unique':
      return agg(m.name, lambda(['x'], only(ref('x', m.column))), lambda(['y'], fn('uniqueValueOnly', y)));
    default:
      return agg(m.name, lambda(['x'], only(ref('x', m.column))), lambda(['y'], fn(m.fn, y)));
  }
}

/** "Show leaf count": the rows under each group. */
const LEAF_COUNT_SPEC = (): ColSpec =>
  agg(LEAF_COUNT_COLUMN, lambda(['x'], lit.integer(1)), lambda(['y'], fn('count', variable('y'))));

// ---- calculated columns and windows ----

/** A level's shape for a window: the rows grouped at this level, and those present. */
interface LevelWindow {
  readonly rows: readonly string[];
  readonly present: readonly string[];
  readonly order: readonly SortSpec[];
}

/** A calculated column appended to `rel`: an expression over the row, or a window. */
function extendDerived(rel: Relation, d: DerivedColumn, level?: LevelWindow): Relation {
  if (!d.window) {
    if (!d.lambda) throw new CubeRefusal(`the calculated column '${d.name}' has no expression`);
    return rel.extend([derive(d.name, d.lambda)]);
  }
  let w: WindowSpec = d.window;
  if (level) {
    const here = new Set(level.present);
    const has = (c: string): boolean => here.has(c) || !level.rows.includes(c);
    const order = w.order.filter((o) => has(o.column));
    w = {
      ...w,
      partition: w.partition.filter(has),
      order: order.length > 0 ? order : level.order.filter((o) => has(o.column)),
    };
  }
  return extendWindow(rel, d.name, w);
}

const sortKey = (s: SortSpec): AppliedFunction => (s.direction === 'asc' ? asc(s.column) : desc(s.column));

/** `extend(over(...), ~[name: {p,w,r|...}])` in the forms Pure's `over` overloads take. */
export function extendWindow(rel: Relation, name: string, w: WindowSpec): Relation {
  const sorts = w.order.map(sortKey);
  const meta = WINDOW_META.get(w.fn);
  if (!meta) throw new CubeRefusal(`unknown window function '${String(w.fn)}'`);
  const unbounded = (): AppliedFunction => fn('unbounded');
  const frameOf = (): AppliedFunction | undefined => {
    if (!meta.framed) return undefined;
    const f = w.frame ?? (w.fn === 'last' ? 'partition' : undefined);
    if (f === undefined) return undefined;
    if (f === 'partition') return fn('rows', unbounded(), unbounded());
    if (sorts.length === 0) return undefined;
    if (f === 'running') return fn('rows', unbounded(), lit.integer(0));
    const n = Math.max(1, Math.floor(f.lastRows));
    return fn('rows', lit.integer(-(n - 1) || 0), lit.integer(0));
  };
  const frame = frameOf();
  let over: AppliedFunction;
  if (w.partition.length > 0) {
    const args: ValueSpecification[] = [{ _type: 'classInstance', type: 'colSpecArray', value: { colSpecs: w.partition.map((p) => ({ name: p })) } }];
    if (sorts.length > 0) args.push(collection(sorts));
    if (frame) args.push(frame);
    over = fn('over', ...args);
  } else if (sorts.length > 0) {
    over = frame ? fn('over', collection([]), collection(sorts), frame) : fn('over', collection(sorts));
  } else {
    const key = w.column;
    if (!key) throw new CubeRefusal(`'${name}' needs an order or a partition`);
    over = fn('over', collection([]), collection([asc(key)]), fn('rows', unbounded(), unbounded()));
  }
  if (meta.column && !w.column) throw new CubeRefusal(`'${name}' needs a column to read`);
  if (meta.ordered && sorts.length === 0) throw new CubeRefusal(`'${name}' needs an order`);
  const p = variable('p');
  const wv = variable('w');
  const r = variable('r');
  const read = (v: ValueSpecification): ValueSpecification => (w.column !== undefined ? property(v, w.column) : v);
  const at = (n: number | undefined): ValueSpecification[] => (n !== undefined && n !== 1 ? [lit.integer(Math.floor(n))] : []);
  const pwr = (body: ValueSpecification): Lambda => lambda(['p', 'w', 'r'], body);
  const reduce = (f: string): Lambda => lambda(['y'], fn(f, variable('y')));
  let spec: ColSpec;
  switch (w.fn) {
    case 'sum': spec = agg(name, pwr(read(r)), reduce('plus')); break;
    case 'average': spec = agg(name, pwr(read(r)), reduce('average')); break;
    case 'min': spec = agg(name, pwr(read(r)), reduce('min')); break;
    case 'max': spec = agg(name, pwr(read(r)), reduce('max')); break;
    case 'count': spec = agg(name, pwr(read(r)), reduce('count')); break;
    case 'rank': spec = derive(name, pwr(fn('rank', p, wv, r))); break;
    case 'denseRank': spec = derive(name, pwr(fn('denseRank', p, wv, r))); break;
    case 'rowNumber': spec = derive(name, pwr(fn('rowNumber', p, r))); break;
    case 'percentRank': spec = derive(name, pwr(fn('percentRank', p, wv, r))); break;
    case 'cumeDist': spec = derive(name, pwr(fn('cumulativeDistribution', p, wv, r))); break;
    case 'ntile': spec = derive(name, pwr(fn('ntile', p, r, lit.integer(Math.max(1, Math.floor(w.buckets ?? 4)))))); break;
    case 'lag': spec = derive(name, pwr(read(fn('lag', p, r, ...at(w.offset))))); break;
    case 'lead': spec = derive(name, pwr(read(fn('lead', p, r, ...at(w.offset))))); break;
    case 'first': spec = derive(name, pwr(read(fn('first', p, wv, r)))); break;
    case 'last': spec = derive(name, pwr(read(fn('last', p, wv, r)))); break;
  }
  return rel.extend([spec], over);
}

// ---- the cube's queries ----

/** The source with the cube's row-stage calculated columns: what step 0 types. */
export function sourceWithDerived(s: CubeSnapshot): Relation {
  let rel = from(s.source.query);
  for (const d of s.derived) rel = extendDerived(rel, d);
  return rel;
}

/** Step 1 of a pivot: its value combinations, in the pivot's order, one past the cap. */
export function pivotValuesLambda(s: CubeSnapshot): Lambda | null {
  const on = effectivePivotOn(s);
  if (on.length === 0 || (s.pivotValues !== undefined && s.pivotValues.length > 0)) return null;
  refuseUnpivotable(s);
  let rel = sourceWithDerived(s);
  if (s.filter) rel = rel.filter(lambda(['x'], filterNode(s.filter, 'x', (c) => columnType(s, c))));
  return rel
    .select(on)
    .distinct()
    .sort(on.map((column) => sortKey({
      column, direction: s.pivotSort?.[column] === 'desc' ? 'desc' : 'asc',
    })))
    .limit(MAX_PIVOT_VALUES + 1)
    .lambda();
}

/** The condition a pivot cell's rows meet. */
function tupleCondition(s: CubeSnapshot, tuple: readonly GroupKey[]): ValueSpecification {
  const conditions = memberConditions(s, effectivePivotOn(s), tuple);
  return filterNode(conditions.length === 1 ? conditions[0]! : { kind: 'and', children: conditions },
    'x', (c) => columnType(s, c));
}

/** One level's query: the source, calculated columns, filter, grouping, pivot, sorts and cap. */
export function levelLambda(snapshot: CubeSnapshot, scope?: LevelScope, pivot?: PivotFacts): Lambda {
  return levelRelation(snapshot, scope, pivot).lambda();
}

function levelRelation(snapshot: CubeSnapshot, scope?: LevelScope, pivot?: PivotFacts): Relation {
  let rel = from(snapshot.source.query);
  const groupCols = scope ? snapshot.rows.slice(0, Math.max(0, scope.level)) : snapshot.rows;
  const grandTotal = scope !== undefined && scope.level === 0 && snapshot.rows.length > 0;

  for (const d of snapshot.derived) rel = extendDerived(rel, d);

  const conditions: FilterNode[] = [];
  if (snapshot.filter) conditions.push(snapshot.filter);
  if (scope) conditions.push(...parentConditions(snapshot, scope.parent));
  const typeOf: TypeOf = (c) => columnType(snapshot, c);
  if (conditions.length === 1) {
    rel = rel.filter(lambda(['x'], filterNode(conditions[0]!, 'x', typeOf)));
  } else if (conditions.length > 1) {
    rel = rel.filter(lambda(['x'], filterNode({ kind: 'and', children: conditions }, 'x', typeOf)));
  }

  const on = effectivePivotOn(snapshot);
  const pivoting = on.length > 0;
  const grouping = !pivoting && (groupCols.length > 0 || snapshot.measures.length > 0 || grandTotal);

  const groupedAggs = (keys: readonly string[], projected: readonly string[]): ColSpec[] => {
    const isKey = new Set(keys);
    const byMeasure = new Map(snapshot.measures.map((m) => [m.column, m]));
    const specOf = columnSpecs(snapshot);
    const specs: ColSpec[] = [];
    for (const name of projected) {
      if (isKey.has(name)) continue;
      const configured = byMeasure.get(name);
      const spec = specOf.get(name);
      const measures = spec?.kind === 'measure' || (isNumeric(spec?.type) && spec?.kind === undefined);
      specs.push(aggregateSpec(configured ?? defaultMeasure(name, spec, measures ? 'sum' : 'unique')));
    }
    if (snapshot.leafCount === true && keys.length > 0) specs.push(LEAF_COUNT_SPEC());
    if (specs.length > 0) return specs;
    // upstream's filler: a groupBy has to aggregate something (serialize.ts writes `$x.''`
    // when there is no key at all; mirrored as the node that text parses to)
    const read: ValueSpecification = { _type: 'property', property: keys[0] ?? '', parameters: [variable('x')] };
    return [agg('count', lambda(['x'], read), lambda(['y'], fn('count', variable('y'))))];
  };

  const groupByLevel = (aggs: readonly ColSpec[]): void => {
    if (groupCols.length === 0) {
      rel = rel.extend([derive(ROOT_COLUMN, lambda(['x'], lit.string(ROOT_VALUE)))])
        .groupBy([ROOT_COLUMN], aggs);
    } else {
      rel = rel.groupBy(groupCols, aggs);
    }
  };

  let produced: Set<string> | null = null;

  if (pivoting) {
    refuseUnpivotable(snapshot);
    if (!pivot) throw new Error('a pivoted cube is written with its pivot values: run pivotValuesLambda first');
    const columns = pivotColumns(snapshot, pivot);
    const carried = snapshot.rows.length > 0 ? carriedMeasures(snapshot, groupCols) : [];
    const reads: string[] = [];
    const read = (name: string | undefined): void => {
      if (name !== undefined && name !== '' && !reads.includes(name)) reads.push(name);
    };
    groupCols.forEach(read);
    on.forEach(read);
    for (const m of [...columns.map((c) => c.measure), ...carried]) {
      if (m.fn !== 'count') read(m.column);
      read(m.weight);
    }
    rel = rel.select(reads);
    groupByLevel([
      ...columns.map((c) => aggregateSpec({ ...c.measure, name: c.name },
        c.tuple === null ? undefined : tupleCondition(snapshot, c.tuple))),
      ...carried.map((m) => aggregateSpec(m)),
      ...(snapshot.leafCount === true && groupCols.length > 0 ? [LEAF_COUNT_SPEC()] : []),
    ]);
    produced = new Set([
      ...groupCols,
      ...(groupCols.length === 0 ? [ROOT_COLUMN] : []),
      ...columns.map((c) => c.name),
      ...carried.map((m) => m.name),
      ...(snapshot.groupDerived ?? []).map((d) => d.name),
      LEAF_COUNT_COLUMN,
    ]);
  } else {
    const needed = grouping ? detailColumns(snapshot) : referencedColumns(snapshot, groupCols);
    if (needed.length > 0) {
      rel = rel.select(needed);
    } else if (isDetail(snapshot)) {
      const all = detailColumns(snapshot);
      if (all.length > 0) rel = rel.select(all);
    }
    if (snapshot.measures.length > 0 || groupCols.length > 0 || grandTotal) {
      groupByLevel(groupedAggs(groupCols, needed));
    }
  }

  const shown = totalOrderSorts(snapshot, groupCols);
  const rooted = (grouping || pivoting) && groupCols.length === 0;
  const keys: SortSpec[] = groupCols.length > 0
    ? groupCols.map((column) => ({ column, direction: 'asc' as const }))
    : rooted ? [{ column: ROOT_COLUMN, direction: 'asc' as const }] : [];
  const levelWindow: LevelWindow = {
    rows: snapshot.rows,
    present: rooted ? [ROOT_COLUMN] : groupCols,
    order: shown.length > 0 ? shown : keys,
  };
  for (const d of snapshot.groupDerived ?? []) {
    if (!d.childAggregate) rel = extendDerived(rel, d, levelWindow);
  }

  if (!isSingleRow(snapshot, groupCols, grandTotal)) {
    const sorts = totalOrderSorts(snapshot, groupCols).filter((x) => produced === null || produced.has(x.column));
    if (sorts.length > 0) rel = rel.sort(sorts.map(sortKey));
    if (scope?.limit !== undefined) {
      rel = rel.limit(scope.limit);
    } else if (snapshot.window) {
      const { offset, limit } = snapshot.window;
      rel = rel.slice(offset, offset + limit);
    }
  }
  return rel;
}

/** A level's child-group aggregates: each group row's aggregate of its child groups' figures. */
export function childAggregateLambda(
  snapshot: CubeSnapshot,
  scope: LevelScope,
): { readonly query: Lambda; readonly columns: readonly string[] } | null {
  const wanted = (snapshot.groupDerived ?? []).filter((d) => d.childAggregate);
  if (wanted.length === 0 || snapshot.rows.length === 0 || snapshot.pivotOn.length > 0) return null;
  const level = Math.max(0, scope.level);
  const depth = snapshot.rows.length;
  if (level > depth) return null;
  const specOf = columnSpecs(snapshot);
  const measureOf = (of: string): Measure => {
    const configured = snapshot.measures.find((m) => m.name === of);
    if (configured) return configured;
    const spec = specOf.get(of);
    const numeric = spec?.kind === 'measure' || (isNumeric(spec?.type) && spec?.kind === undefined);
    return defaultMeasure(of, spec, numeric ? 'sum' : 'unique');
  };
  const { pivotValues: _v, pivotTotal: _t, window: _w, ...rest } = snapshot;
  void _v; void _t; void _w;
  const reads = new Set([...snapshot.rows.slice(0, level + 1),
    ...wanted.map((d) => measureOf(d.childAggregate!.of).column)]);
  const derivedNeeded = snapshot.derived.some((d) => reads.has(d.name));
  const base: CubeSnapshot = {
    ...rest,
    columns: derivedNeeded ? snapshot.columns : snapshot.columns.filter((c) => reads.has(c.name)),
    derived: derivedNeeded ? snapshot.derived : [],
    pivotOn: [],
    sorts: [],
    groupDerived: [],
    leafCount: false,
    childCount: false,
  };
  const keys = snapshot.rows.slice(0, level);
  if (level === depth) {
    // each child aggregate reads its own copy of the column, `$x.<column>`
    const copies = wanted.map((d) => ({
      name: `__child_${d.name}`,
      lambda: lambda(['x'], ref('x', measureOf(d.childAggregate!.of).column)),
      kind: 'measure' as const,
    }));
    const measures = wanted.map((d, i) => ({ name: d.name, column: copies[i]!.name, fn: d.childAggregate!.fn }));
    return {
      query: levelLambda({ ...base, derived: [...base.derived, ...copies], measures },
        { level, parent: scope.parent }),
      columns: wanted.map((d) => d.name),
    };
  }
  const inner = [...new Map(wanted.map((d) => {
    const m = measureOf(d.childAggregate!.of);
    return [m.name, m] as const;
  })).values()];
  let rel = levelRelation({ ...base, measures: inner }, { level: level + 1, parent: scope.parent });
  const aggs = wanted.map((d) => aggregateSpec({
    name: d.name,
    column: measureOf(d.childAggregate!.of).name,
    fn: d.childAggregate!.fn,
  }));
  rel = keys.length === 0
    ? rel.extend([derive(ROOT_COLUMN, lambda(['x'], lit.string(ROOT_VALUE)))]).groupBy([ROOT_COLUMN], aggs)
    : rel.groupBy(keys, aggs);
  return { query: rel.lambda(), columns: wanted.map((d) => d.name) };
}

/** The rows behind a cell: the population, not its aggregate, capped. */
export function drillLambda(snapshot: CubeSnapshot, request: DrillRequest): Lambda {
  let rel = sourceWithDerived(snapshot);
  const conditions = drillConditions(snapshot, request);
  const typeOf: TypeOf = (c) => columnType(snapshot, c);
  if (conditions.length === 1) {
    rel = rel.filter(lambda(['x'], filterNode(conditions[0]!, 'x', typeOf)));
  } else if (conditions.length > 1) {
    rel = rel.filter(lambda(['x'], filterNode({ kind: 'and', children: conditions }, 'x', typeOf)));
  }
  return rel.limit(request.limit ?? DEFAULT_DRILL_LIMIT).lambda();
}

// ---- the cube's structure: what each query is built from ----

/** What the grand total's synthetic key holds. Upstream's value. */
export const ROOT_VALUE = '[ROOT]';

/** A column's compiler type, by name: how a value's literal is spelled (T3). */
export type TypeOf = (column: string) => string | undefined;

/** Each window function's facts, by name. */
export const WINDOW_META = new Map(WINDOW_FUNCTIONS.map((f) => [f.fn, f]));

/**
 * One level of the row-group tree.
 *
 * `level` is how many row dimensions to group by: 0 is the grand
 * total, 1 the top level, and so on. `parent` pins the ancestors, so
 * expanding EMEA fetches only EMEA's children.
 *
 * A subtotal is therefore literally the same measure expression with
 * grouping columns dropped -- not a second aggregation pass that could
 * disagree with the detail underneath it.
 */
export interface LevelScope {
  readonly level: number;
  readonly parent: RowPath;
  /**
   * Cap on rows for this level. Callers pass maxRows + 1 so that the
   * presence of the extra row reports "there is more" without a
   * second counting query.
   */
  readonly limit?: number;
}

/**
 * Conditions pinning a branch: region == 'EMEA', and so on -- each key as the value it is, its
 * literal written by the column's compiler type (`literalNode`). A NULL key cannot be matched
 * with `==`, so it becomes an isEmpty test; without that, expanding a group whose key is null
 * silently returns no children. A Variant key is its document's JSON text, as the database
 * printed it, so it matches as a document.
 */
/**
 * The conditions pinning a member of a hierarchy -- `columns[i] ==
 * path[i]` down its path, typed as the tree's keys are. Ad Hoc Analysis mode's
 * members use the same rule the tree's branches do.
 */
export function memberConditions(
  snapshot: CubeSnapshot,
  columns: readonly string[],
  path: RowPath,
): FilterNode[] {
  return parentConditions({ ...snapshot, rows: columns }, path);
}

export function parentConditions(
  snapshot: CubeSnapshot,
  parent: RowPath,
): FilterNode[] {
  const out: FilterNode[] = [];
  // Calculated columns too: a group on one has keys of its own type.
  const typeOf = new Map(rowColumns(snapshot).map((c) => [c.name, c.type]));
  parent.forEach((value, i) => {
    const column = snapshot.rows[i];
    if (column === undefined) return;
    out.push(
      value === null
        ? { kind: 'condition', column, operator: 'isEmpty' }
        : {
            kind: 'condition',
            column,
            operator: 'equal',
            value: isVariant(typeOf.get(column)) ? { json: value } : value,
          },
    );
  });
  return out;
}

/**
 * The cube for ONE group's detail rows: upstream's last drilldown level,
 * where "no groupBy() is needed" -- the group's keys become a filter
 * and the rows come back as they are, sorted and capped as the cube
 * says. Group-level calculated columns still apply ("computed for each
 * row in the table, no matter whether it's a leaf-level row or an
 * aggregate"). Sorts on names only an aggregate has (a measure, a
 * pivot column) are dropped: a source row has no such column.
 *
 * A PIVOTED cube keeps its pivot, grouped by every dimension -- the
 * finest rows a pivot has, as upstream's pivot without its groupBy.
 */
export function detailSnapshot(s: CubeSnapshot, parent: RowPath): CubeSnapshot {
  const keys = parentConditions(s, parent);
  const all = [...(s.filter ? [s.filter] : []), ...keys];
  const filter: FilterNode | undefined = all.length === 0 ? undefined
    : all.length === 1 ? all[0] : { kind: 'and', children: all };
  const { filter: _old, ...rest } = s;
  void _old;
  const visible = new Set([
    ...detailColumns(s),
    ...(s.groupDerived ?? []).map((d) => d.name),
  ]);
  const base: CubeSnapshot = {
    ...rest,
    ...(filter ? { filter } : {}),
    sorts: s.sorts.filter((x) => visible.has(x.column)),
    leafCount: false,
  };
  if (s.pivotOn.length === 0) return { ...base, rows: [], measures: [] };
  const isOn = new Set(s.pivotOn);
  const dims = rowColumns(s)
    .filter((c) => c.kind === 'dimension' && !isOn.has(c.name))
    .map((c) => c.name);
  // The same pivot columns as every level above it: the cube's values,
  // not the group's, so a group with no EMEA rows shows an empty EMEA
  // column rather than a missing one.
  return { ...base, rows: dims };
}

// ---------------------------------------------------------------------------
// THE PIVOT, as two plain queries (docs/DATACUBE_CUBE_PLAN_DESIGN_2026_09_27.md).
//
// Step 1 finds the values (`pivotValuesQuery`); step 2 is one groupBy per
// level with a conditional aggregate per value and measure (`serialize`).
// Both are ordinary Pure, planned by legend-lite with static types, so a
// warehouse reader may run them and every engine answers the same SQL.
// ---------------------------------------------------------------------------

/** More value combinations than this is refused, not cut off. */
export const MAX_PIVOT_VALUES = 500;

/** The header text of a NULL pivot value's column. */
export const EMPTY_PIVOT_LABEL = '(empty)';

/**
 * Step 1's answer: the value combinations present, in header order.
 *
 * Each value is a group key -- a cell's exact text, or null -- so a pivot
 * value and a tree key become a literal by one rule (`parentConditions`).
 */
export interface PivotFacts {
  readonly tuples: readonly (readonly GroupKey[])[];
}

/**
 * A column the pivot makes: a CELL (one value combination crossed with
 * one measure) or a TOTAL (`tuple` null: the measure over every value).
 *
 * What a pivot column IS comes from here, never from parsing its name.
 */
export interface PivotColumn {
  readonly name: string;
  readonly measure: Measure;
  readonly tuple: readonly GroupKey[] | null;
}

/** The name of one measure's pivot total column. */
export function pivotTotalColumn(measure: string): string {
  return `${PIVOT_TOTAL_KEY}${PIVOT_SEPARATOR}${measure}`;
}

/** Whether a column is a pivot total (see `PivotTotal`). */
export function isPivotTotalColumn(name: string): boolean {
  return name.startsWith(`${PIVOT_TOTAL_KEY}${PIVOT_SEPARATOR}`);
}

/** A pivot value as its column's header shows it. */
export function pivotLabel(key: GroupKey): string {
  return key === null ? EMPTY_PIVOT_LABEL : key;
}

/** The pivot keys that pivot: those not excluded from the pivot. */
export function effectivePivotOn(s: CubeSnapshot): string[] {
  const excluded = excludedFromPivot(s);
  return s.pivotOn.filter((c) => !excluded.has(c));
}

function excludedFromPivot(s: CubeSnapshot): Set<string> {
  return new Set(rowColumns(s).filter((c) => c.excludedFromPivot).map((c) => c.name));
}

/**
 * The measures a pivot spreads across its values.
 *
 * The configured ones, minus any whose column is excluded from the
 * pivot (that setting did nothing on a cube with configured measures,
 * P2-16). None configured: every measure-kind column that is neither a
 * pivot key nor excluded, on its own aggregate -- upstream's
 * `_pivotAggCols`. Nothing at all: a filler count, as upstream's
 * `_fixEmptyAggCols`, because a pivot has to show something.
 */
export function spreadMeasures(s: CubeSnapshot): Measure[] {
  const excluded = excludedFromPivot(s);
  const on = effectivePivotOn(s);
  if (s.measures.length > 0) {
    const kept = s.measures.filter((m) => !excluded.has(m.column));
    if (kept.length > 0) return kept;
  } else {
    const isOn = new Set(on);
    const specOf = columnSpecs(s);
    const synthesised = rowColumns(s)
      .filter((c) => !isOn.has(c.name) && !excluded.has(c.name) && c.kind === 'measure')
      .map((c) => defaultMeasure(c.name, specOf.get(c.name), 'sum'));
    if (synthesised.length > 0) return synthesised;
  }
  return [{ name: 'count', column: on[0] ?? '', fn: 'count' }];
}

/**
 * The columns a pivoted cube's queries make, in header order: each value
 * combination's cells, measure by measure, then the Totals when the cube
 * shows them. A deterministic function of the cube and step 1's answer,
 * so the query and every reader of its result agree on it.
 *
 * A cell is named `value__|__measure` (upstream's spelling). A name that
 * is already taken -- by a source column, or by a real value that reads
 * like a NULL's "(empty)" -- gets a `~2` suffix: names are identifiers
 * here, and nothing reads meaning out of them.
 */
export function pivotColumns(s: CubeSnapshot, facts: PivotFacts): PivotColumn[] {
  const spread = spreadMeasures(s);
  const taken = new Set([
    ...detailColumns(s),
    ...(s.groupDerived ?? []).map((d) => d.name),
  ]);
  const out: PivotColumn[] = [];
  for (const tuple of facts.tuples) {
    for (const measure of spread) {
      const base = [...tuple.map(pivotLabel), measure.name].join(PIVOT_SEPARATOR);
      let name = base;
      for (let n = 2; taken.has(name); n++) name = `${base}~${n}`;
      taken.add(name);
      out.push({ name, measure, tuple });
    }
  }
  const total = s.pivotTotal;
  if (total) {
    for (const measure of spread) {
      const fn = total.functions?.[measure.column] ?? measure.fn;
      const { weight: _w, ...rest } = measure;
      const retargeted: Measure = fn === 'wavg' && measure.weight !== undefined
        ? { ...rest, fn, weight: measure.weight }
        : { ...rest, fn };
      out.push({ name: pivotTotalColumn(measure.name), measure: retargeted, tuple: null });
    }
  }
  return out;
}

/**
 * A pivot names a column after each distinct value, and a Variant's value
 * is a whole JSON document: every column would be called
 * `{"items": [...]}__|__qty`. The question is always about a value INSIDE
 * the document, so say how to get it -- before either step runs.
 */
export function refuseUnpivotable(s: CubeSnapshot): void {
  const specOf = columnSpecs(s);
  for (const name of effectivePivotOn(s)) {
    if (isVariant(specOf.get(name)?.type)) {
      throw new CubeRefusal(
        `cannot pivot on '${name}': it holds JSON. Pivot on a value `
        + `extracted from it instead -- a calculated column such as `
        + `x|${columnRef(name)}->get('key')->to(@String)`,
      );
    }
  }
}

/** Pinned values as step 1's answer (`pivotValues`, one key). */
export function pinnedPivotFacts(s: CubeSnapshot): PivotFacts | null {
  if (s.pivotValues === undefined || s.pivotValues.length === 0) return null;
  // A key as a tree key is: the value's exact text (a JSON value its document's text)
  const key = (v: FilterValue): GroupKey => (isJsonValue(v) ? v.json
    : isRelativeDate(v) ? v.relative : String(v));
  return { tuples: s.pivotValues.map((v) => [key(v)]) };
}

/**
 * The columns a grouped pivot carries BESIDE its cells, each on its own
 * aggregate in the same groupBy (upstream's `pivotGroupByColumns`): the
 * other dimensions take their unique value, the other measures their
 * own aggregate. A configured measure excluded from the pivot is one of
 * them, under its own name. Before, these came from a second query
 * joined in by key; now they are columns of the level's own.
 */
export function carriedMeasures(s: CubeSnapshot, groupCols: readonly string[]): Measure[] {
  const excluded = excludedFromPivot(s);
  const isKey = new Set([...groupCols, ...effectivePivotOn(s)]);
  const spread = spreadMeasures(s);
  const excludedConfigured = s.measures.filter((m) => excluded.has(m.column));
  const handled = new Set([
    ...spread.map((m) => m.column),
    ...excludedConfigured.map((m) => m.column),
  ]);
  const specOf = columnSpecs(s);
  const out: Measure[] = [...excludedConfigured];
  for (const name of detailColumns(s)) {
    if (isKey.has(name) || handled.has(name)) continue;
    const spec = specOf.get(name);
    const measure = spec?.kind === 'measure'
      || (isNumeric(spec?.type) && spec?.kind === undefined);
    out.push(defaultMeasure(name, spec, measure ? 'sum' : 'unique'));
  }
  return out;
}

/**
 * Serialize a snapshot to Pure relation grammar.
 *
 * The pipeline is emitted in the order legend-lite expects, and each
 * stage is omitted entirely when it would be a no-op, so a simple cube
 * produces simple text that a human can read in a bug report.
 */
/** No grouping, no pivot, no measures: rows straight through. */
export function isDetail(s: CubeSnapshot): boolean {
  return (
    s.rows.length === 0 && s.pivotOn.length === 0 && s.measures.length === 0
  );
}

/**
 * Every column an aggregate default may consult, derived included.
 *
 * A calculated column has a type once a result has landed (see
 * `DerivedColumn.type`), and the default has to see it: a numeric one
 * must sum like any other number rather than fall through to `unique`.
 * Source columns win a name collision, which cannot happen anyway --
 * `nameProblem` refuses it in the editor.
 */
export interface SpecLike {
  readonly name: string;
  readonly type?: string;
  readonly kind?: ColumnKind;
  readonly aggregate?: AggregateFn;
  readonly aggregateWeight?: string;
}

export function columnSpecs(s: CubeSnapshot): Map<string, SpecLike> {
  const out = new Map<string, SpecLike>();
  for (const d of [...s.derived, ...(s.groupDerived ?? [])]) {
    // The DECLARED kind wins over the type, exactly as it does for a
    // source column: `kindOf` reads an explicit kind first, and a
    // calculated column the user called a dimension must not sum
    // because its values happen to be numeric.
    out.set(d.name, {
      name: d.name,
      ...(d.type === undefined ? {} : { type: d.type }),
      ...(d.kind === undefined ? {} : { kind: d.kind }),
      ...(d.aggregate === undefined ? {} : { aggregate: d.aggregate }),
      ...(d.aggregateWeight === undefined
        ? {}
        : { aggregateWeight: d.aggregateWeight }),
    });
  }
  for (const c of s.columns) out.set(c.name, c);
  return out;
}

/**
 * The aggregate a column takes when nothing configured a MEASURE for
 * it: Column Properties > Aggregation when set (census §2 -- the
 * dropdown reached no query before), else the kind's default.
 */
export function defaultMeasure(
  name: string,
  spec: SpecLike | undefined,
  fallback: AggregateFn,
): Measure {
  return {
    name,
    column: name,
    fn: spec?.aggregate ?? fallback,
    ...(spec?.aggregateWeight !== undefined
      ? { weight: spec.aggregateWeight }
      : {}),
  };
}

/**
 * Every column available BEFORE aggregation: the source's, plus the
 * row-stage calculated ones.
 *
 * `groupDerived` is deliberately absent. Those are extended AFTER the
 * groupBy -- that is the whole point of the stage -- so naming one in
 * the projection asks the source for a column that does not exist
 * yet. It did, and the planner said so: "unknown column 'margin' in
 * (region:String[0..1], ...)". Every group-stage calculated column
 * was unusable for as long as that line was here.
 */
export function detailColumns(s: CubeSnapshot): string[] {
  return [
    ...s.columns.map((c) => c.name),
    ...s.derived.map((d) => d.name),
  ];
}

/**
 * Whether this query can only ever return ONE row.
 *
 * True for an aggregate with nothing to group by -- the grand total.
 * False for a detail query, which also has no grouping but returns
 * every row, and therefore very much wants a sort and a cap.
 */
export function isSingleRow(
  s: CubeSnapshot,
  groupCols: readonly string[],
  grandTotal = false,
): boolean {
  return (
    groupCols.length === 0
    && (grandTotal || s.measures.length > 0 || s.pivotOn.length > 0)
  );
}

// ---- drill-through: the rows behind a number ----
//
// It turns every subtotal from an assertion into an auditable claim: an analyst who can click a
// figure and see the records that produced it can defend it. The query (`drillLambda`) is the
// cube's own filter, plus the clicked row's group path, plus the clicked column's pivot value --
// and then NO aggregation, so the result is provably the population the aggregate was computed
// over. Against a snap it reads the frozen rows, the same data the aggregate came from.

export interface DrillRequest {
  /** The clicked row's group path; [] for the grand total. */
  readonly path: RowPath;
  /**
   * The clicked column's pivot values, outermost first. Absent for a
   * row-dimension cell or an unpivoted cube.
   */
  readonly pivotPath?: readonly GroupKey[];
  /** Safety valve: drill-through is a peek, not an export. */
  readonly limit?: number;
}

export const DEFAULT_DRILL_LIMIT = 500;

/**
 * Conditions pinning the clicked cell.
 *
 * Exported because the set of conditions is the auditable part: a
 * reviewer should be able to read exactly which rows were counted.
 */
export function drillConditions(
  snapshot: CubeSnapshot,
  request: DrillRequest,
): FilterNode[] {
  const out: FilterNode[] = [];
  if (snapshot.filter) out.push(snapshot.filter);
  // TYPED, by the rule a tree level and a pivot cell use (`parentConditions`): a
  // year is `== 2021`, not `== '2021'`, and a NULL key is `isEmpty`. So
  // the drill pins exactly the rows its cell aggregated.
  out.push(...memberConditions(snapshot, snapshot.rows.slice(0, request.path.length), request.path));
  const pivot = request.pivotPath ?? [];
  if (pivot.length > 0) {
    out.push(...memberConditions(snapshot, effectivePivotOn(snapshot).slice(0, pivot.length), pivot));
  }
  return out;
}
