// Snapshot -> the cube's queries as PROTOCOL JSON (docs/DATACUBE_TYPES_TO_SERVER_2026_09_27.md,
// T4b): the same queries serialize.ts writes as Pure text, built as trees with pure-protocol's
// Relation API. A tree cannot misplace an operator the way text can (the grammar applies
// < <= > >= left to right with && and ||), and no literal is ever spelled here.
//
// STEP 1 OF T4b: built BESIDE serialize.ts, and proven byte-identical to lite's own parse of the
// text serialize.ts writes, for every cube case (test/query-twins.test.ts). Literals keep exactly
// the types the text gave them in this step -- an integer an integer, a fraction a float, exact
// digits exact -- so that proof can be byte for byte; typing a literal by its column (T4c) is a
// change of meaning, made and proven there.
//
// Until step 3 the snapshot still holds TEXT for its source and calculated columns; the caller
// hands their parsed forms in (`Parsed`), parsed by the compiler.

import {
  agg, and, asc, collection, derive, desc, fn, from, lambda, lit, not, or, property, variable,
  type AppliedFunction, type ColSpec, type Lambda, type Relation, type ValueSpecification,
} from '../../pure-protocol/src/index.ts';
import {
  CubeRefusal,
  columnType,
  LEAF_COUNT_COLUMN,
  isJsonValue,
  isRelativeDate,
  referencedColumns,
  totalOrderSorts,
  type CubeSnapshot,
  type DerivedColumn,
  type FilterNode,
  type FilterValue,
  type Measure,
  type SortSpec,
  type WindowSpec,
} from './snapshot.ts';
import { ROOT_COLUMN } from './grid/columns.ts';
import { DEFAULT_DRILL_LIMIT, drillConditions, type DrillRequest } from './drill.ts';
import { isNumeric, isTemporal } from './types.ts';
import {
  MAX_PIVOT_VALUES,
  ROOT_VALUE,
  WINDOW_META,
  carriedMeasures,
  columnSpecs,
  defaultMeasure,
  detailColumns,
  effectivePivotOn,
  isDetail,
  isSingleRow,
  memberConditions,
  parentConditions,
  pivotColumns,
  refuseUnpivotable,
  type LevelScope,
  type PivotFacts,
  type TypeOf,
} from './serialize.ts';

/** The snapshot's text, parsed by the compiler (until step 3 makes the snapshot hold these). */
export interface Parsed {
  /** The source relation, `source.expression` parsed. */
  readonly source: ValueSpecification;
  /** A calculated column's expression (a body over `$x`), parsed as the lambda `x|<expression>`. */
  expression(text: string): Lambda;
}

// ---- literals: the types serialize.ts's text gave them (see the header) ----

const TEMPORAL_TEXT = /^(-?\d{4,}-\d{2}-\d{2}([T ]\d{2}:\d{2}:\d{2}(\.\d+)?)?|\d{2}:\d{2}:\d{2}(\.\d+)?)$/;
const EXACT_NUMBER = /^-?\d+(\.\d+)?$/;

/** A number's literal as its text is lexed: digits alone an integer, with a fraction a float. */
function numberText(text: string): ValueSpecification {
  return text.includes('.') ? lit.float(text) : lit.integer(text);
}

/**
 * The ONE place this step does not reproduce serialize.ts's meaning: a Decimal column's exact
 * value is a DECIMAL literal. serialize.ts writes it bare, the grammar lexes that as a Float, and a
 * Float is read through a double -- `12345678901234567.89` compared as `12345678901234568`. The
 * text should have been `12345678901234567.89D`; its twin in test/query-twins.test.ts is that.
 */
function exactNumber(text: string, type: string | undefined): ValueSpecification {
  return type !== undefined && /(^|::)(Decimal|Numeric)$/.test(type) ? lit.decimal(text) : numberText(text);
}

/** A temporal text's literal: a time of day, a day, or a timestamp. */
function temporalText(text: string): ValueSpecification {
  const t = text.replace(' ', 'T');
  if (!t.includes('-')) return lit.strictTime(t);
  return t.includes('T') ? lit.dateTime(t) : lit.strictDate(t);
}

/** A `Date` (the filter editor's, until T4c) as serialize.ts spelled it: local fields, seconds. */
function dateNode(v: Date): ValueSpecification {
  const p = (n: number): string => String(n).padStart(2, '0');
  const day = `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
  const midnight = v.getHours() === 0 && v.getMinutes() === 0 && v.getSeconds() === 0;
  return midnight
    ? lit.strictDate(day)
    : lit.dateTime(`${day}T${p(v.getHours())}:${p(v.getMinutes())}:${p(v.getSeconds())}`);
}

/** A filter value as a literal node; `type` is its column's compiler type. */
export function literalNode(v: FilterValue, type?: string): ValueSpecification {
  if (isRelativeDate(v)) return fn(v.relative === 'today' ? 'today' : 'now');
  if (isJsonValue(v)) return fn('fromJson', lit.string(v.json));
  if (typeof v === 'string' && isTemporal(type) && TEMPORAL_TEXT.test(v)) return temporalText(v);
  if (typeof v === 'string' && isNumeric(type) && EXACT_NUMBER.test(v)) return exactNumber(v, type);
  if (typeof v === 'string') return lit.string(v);
  if (typeof v === 'boolean') return lit.boolean(v);
  if (v instanceof Date) return dateNode(v);
  return numberText(String(v));
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

const COMPARISON: Partial<Record<string, string>> = {
  equal: 'equal', notEqual: 'equal', lessThan: 'lessThan', lessThanEqual: 'lessThanEqual',
  greaterThan: 'greaterThan', greaterThanEqual: 'greaterThanEqual',
};

const COLUMN_COMPARISON: Partial<Record<string, string>> = {
  equalColumn: 'equal', equalCaseInsensitiveColumn: 'equal', notEqualColumn: 'equal',
  notEqualCaseInsensitiveColumn: 'equal', lessThanColumn: 'lessThan', lessThanEqualColumn: 'lessThanEqual',
  greaterThanColumn: 'greaterThan', greaterThanEqualColumn: 'greaterThanEqual',
};

/** `a op b`, `!=` being `!(a == b)`. */
function compare(function_: string, negate: boolean, a: ValueSpecification, b: ValueSpecification): ValueSpecification {
  const c = fn(function_, a, b);
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
      const preLowered = (v: FilterValue): ValueSpecification =>
        typeof v === 'string' ? literalNode(v.toLowerCase()) : literalNode(v);

      const cmp = COMPARISON[node.operator];
      if (cmp) return compare(cmp, node.operator === 'notEqual', r, one());

      const colCmp = COLUMN_COMPARISON[node.operator];
      if (colCmp) {
        if (!node.rightColumn) {
          throw new CubeRefusal(`operator '${node.operator}' on '${node.column}' needs a rightColumn`);
        }
        const right = ref(param, node.rightColumn);
        const insensitive = node.operator.includes('CaseInsensitive');
        const negate = node.operator.startsWith('notEqual');
        return insensitive
          ? compare(colCmp, negate, lowered(r), lowered(right))
          : compare(colCmp, negate, r, right);
      }

      switch (node.operator) {
        case 'isEmpty': return fn('isEmpty', r);
        case 'isNotEmpty': return fn('isNotEmpty', r);
        case 'contains': return fn('contains', r, one());
        case 'notContains': return not(fn('contains', r, one()));
        case 'startsWith': return fn('startsWith', r, one());
        case 'notStartsWith': return not(fn('startsWith', r, one()));
        case 'endsWith': return fn('endsWith', r, one());
        case 'notEndsWith': return not(fn('endsWith', r, one()));
        case 'in': return fn('in', r, collection(many().map((v) => literalNode(v, type))));
        case 'notIn': return not(fn('in', r, collection(many().map((v) => literalNode(v, type)))));
        case 'equalCaseInsensitive':
        case 'notEqualCaseInsensitive': {
          const v = node.value as FilterValue;
          const value = typeof v === 'string' ? fn('toLower', literalNode(v)) : literalNode(v);
          return compare('equal', node.operator === 'notEqualCaseInsensitive', lowered(r), value);
        }
        case 'containsCaseInsensitive': return fn('contains', lowered(r), preLowered(node.value as FilterValue));
        case 'startsWithCaseInsensitive': return fn('startsWith', lowered(r), preLowered(node.value as FilterValue));
        case 'endsWithCaseInsensitive': return fn('endsWith', lowered(r), preLowered(node.value as FilterValue));
        case 'inCaseInsensitive': return fn('in', lowered(r), collection(many().map(preLowered)));
        case 'notInCaseInsensitive': return not(fn('in', lowered(r), collection(many().map(preLowered))));
        default: {
          const never: never = node.operator as never;
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

/** A level's shape for a window (see serialize.ts's `derivedExtend`). */
interface LevelWindow {
  readonly rows: readonly string[];
  readonly present: readonly string[];
  readonly order: readonly SortSpec[];
}

/** A calculated column appended to `rel`: an expression over the row, or a window. */
function extendDerived(rel: Relation, d: DerivedColumn, parsed: Parsed, level?: LevelWindow): Relation {
  if (!d.window) return rel.extend([derive(d.name, parsed.expression(d.expression))]);
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
function extendWindow(rel: Relation, name: string, w: WindowSpec): Relation {
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
export function sourceWithDerived(s: CubeSnapshot, parsed: Parsed): Relation {
  let rel = from(parsed.source);
  for (const d of s.derived) rel = extendDerived(rel, d, parsed);
  return rel;
}

/** Step 1 of a pivot: its value combinations (see serialize.ts's `pivotValuesQuery`). */
export function pivotValuesLambda(s: CubeSnapshot, parsed: Parsed): Lambda | null {
  const on = effectivePivotOn(s);
  if (on.length === 0 || (s.pivotValues !== undefined && s.pivotValues.length > 0)) return null;
  refuseUnpivotable(s);
  let rel = sourceWithDerived(s, parsed);
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
function tupleCondition(s: CubeSnapshot, tuple: readonly string[]): ValueSpecification {
  const conditions = memberConditions(s, effectivePivotOn(s), tuple);
  return filterNode(conditions.length === 1 ? conditions[0]! : { kind: 'and', children: conditions },
    'x', (c) => columnType(s, c));
}

/** One level's query (see serialize.ts's `serialize`, line for line). */
export function levelLambda(snapshot: CubeSnapshot, parsed: Parsed, scope?: LevelScope, pivot?: PivotFacts): Lambda {
  return levelRelation(snapshot, parsed, scope, pivot).lambda();
}

function levelRelation(snapshot: CubeSnapshot, parsed: Parsed, scope?: LevelScope, pivot?: PivotFacts): Relation {
  let rel = from(parsed.source);
  const groupCols = scope ? snapshot.rows.slice(0, Math.max(0, scope.level)) : snapshot.rows;
  const grandTotal = scope !== undefined && scope.level === 0 && snapshot.rows.length > 0;

  for (const d of snapshot.derived) rel = extendDerived(rel, d, parsed);

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
    if (!d.childAggregate) rel = extendDerived(rel, d, parsed, levelWindow);
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

/** A level's child-group aggregates (see serialize.ts's `childAggregateQuery`). */
export function childAggregateLambda(
  snapshot: CubeSnapshot,
  parsed: Parsed,
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
      expression: `$x.${measureOf(d.childAggregate!.of).column}`,
      kind: 'measure' as const,
    }));
    const byCopy = new Map(copies.map((c, i) => [c.expression, measureOf(wanted[i]!.childAggregate!.of).column]));
    const withCopies: Parsed = {
      source: parsed.source,
      expression: (text) => {
        const column = byCopy.get(text);
        return column === undefined ? parsed.expression(text) : lambda(['x'], ref('x', column));
      },
    };
    const measures = wanted.map((d, i) => ({ name: d.name, column: copies[i]!.name, fn: d.childAggregate!.fn }));
    return {
      query: levelLambda({ ...base, derived: [...base.derived, ...copies], measures }, withCopies,
        { level, parent: scope.parent }),
      columns: wanted.map((d) => d.name),
    };
  }
  const inner = [...new Map(wanted.map((d) => {
    const m = measureOf(d.childAggregate!.of);
    return [m.name, m] as const;
  })).values()];
  let rel = levelRelation({ ...base, measures: inner }, parsed, { level: level + 1, parent: scope.parent });
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

/** The rows behind a cell (see drill.ts's `drillQuery`): the population, not its aggregate. */
export function drillLambda(snapshot: CubeSnapshot, parsed: Parsed, request: DrillRequest): Lambda {
  let rel = sourceWithDerived(snapshot, parsed);
  const conditions = drillConditions(snapshot, request);
  const typeOf: TypeOf = (c) => columnType(snapshot, c);
  if (conditions.length === 1) {
    rel = rel.filter(lambda(['x'], filterNode(conditions[0]!, 'x', typeOf)));
  } else if (conditions.length > 1) {
    rel = rel.filter(lambda(['x'], filterNode({ kind: 'and', children: conditions }, 'x', typeOf)));
  }
  return rel.limit(request.limit ?? DEFAULT_DRILL_LIMIT).lambda();
}
