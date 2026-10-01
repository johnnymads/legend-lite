// The query being built, as plain data: a source, columns, a filter tree, parameters and result
// options. build.ts turns it into the lambda (protocol JSON, never text -- design D5); load.ts
// reads a lambda back into it, or says why it cannot (the query then stays in text mode).

import type { Lambda, Multiplicity, ValueSpecification } from '../../../pure-protocol/src/index.ts';

/** Where rows come from: a class, through a mapping, on a runtime -- optionally chosen via a data space. */
export interface ClassSource {
  readonly kind: 'class';
  readonly class: string;
  readonly mapping: string;
  readonly runtime: string;
  /** The data space and execution context this source was chosen through, if any. */
  readonly dataSpace?: { readonly path: string; readonly context: string };
}

export type Source = ClassSource;

/** One step of a property path from the source class: `$x.firm`, `$x.fullName()`, `$x->subType(@C)`. */
export interface PropertyStep {
  readonly property: string;
  /** A derived property's arguments, as values (literal or parameter). */
  readonly args?: readonly Value[];
}

/** A path of property steps from the source class: `firm.legalName`. */
export type PropertyPath = readonly PropertyStep[];

export interface ProjectionColumn {
  readonly id: string;
  readonly name: string;
  /** The property the column reads (empty for a calculated column). */
  readonly path: PropertyPath;
  /** A calculated column: its own lambda, `x|$x.quantity * $x.price` (census §5.3 "derivation"). */
  readonly derivation?: Lambda;
  /** An aggregate over the column: the query then groups by every other column. */
  readonly aggregate?: AggregateOp;
  /** `percentile`'s settings (upstream's operator: a value 0-100, ascending, continuous). */
  readonly percentile?: PercentileOptions;
  /** `wavg`'s weight: another projected column, which the average consumes (it is neither a key nor
   *  in the result -- `wavgRowMapper($x.column, $x.weight)`, upstream's spelling). */
  readonly weight?: string;
}

export interface PercentileOptions {
  /** 0-100, as the person writes it; the query carries it over 100. */
  readonly value: number;
  readonly ascending: boolean;
  readonly continuous: boolean;
}

/** Window (OLAP) functions: a rank over the window, or an aggregate of a column over it. */
export type WindowOp = 'rank' | 'denseRank' | 'rowNumber' | 'percentRank' | 'sum' | 'count' | 'min' | 'max' | 'average';

export const RANKING: ReadonlySet<WindowOp> = new Set(['rank', 'denseRank', 'rowNumber', 'percentRank']);

/** A column computed over a window of rows: partitioned by columns, ordered by one (census §5.3). */
export interface WindowColumn {
  readonly id: string;
  readonly name: string;
  readonly op: WindowOp;
  /** The column an aggregate reads (a ranking reads none). */
  readonly column?: string;
  readonly partition: readonly string[];
  readonly sort?: SortSpec;
}

/** A graph fetch: the properties to fetch as a tree, the result JSON objects (census §5.3). */
export interface GraphNode {
  readonly property: string;
  readonly children: readonly GraphNode[];
}

export interface GraphFetch {
  readonly tree: readonly GraphNode[];
  /** graphFetchChecked: constraint violations reported with each object rather than failing. */
  readonly checked: boolean;
}

export type AggregateOp =
  | 'count' | 'distinctCount' | 'sum' | 'average' | 'min' | 'max' | 'stdDevPopulation' | 'stdDevSample'
  | 'joinStrings' | 'percentile' | 'wavg';

/** A value on the right of a condition, or a parameter's value. */
export type Value =
  | { readonly kind: 'string'; readonly value: string }
  | { readonly kind: 'boolean'; readonly value: boolean }
  | { readonly kind: 'integer'; readonly value: string }
  | { readonly kind: 'float'; readonly value: string }
  | { readonly kind: 'decimal'; readonly value: string }
  | { readonly kind: 'strictDate'; readonly value: string }
  | { readonly kind: 'dateTime'; readonly value: string }
  | { readonly kind: 'enum'; readonly enumeration: string; readonly value: string }
  | { readonly kind: 'dateFunction'; readonly function: DateFunction }
  | { readonly kind: 'list'; readonly values: readonly Value[] }
  /** `$name`: a parameter or a constant (upstream's VariableExpression either way). */
  | { readonly kind: 'variable'; readonly name: string };

/** The relative dates upstream's date picker offers (census §5.4). */
export type DateFunction =
  | { readonly kind: 'today' }
  | { readonly kind: 'now' }
  | { readonly kind: 'firstDayOfThis'; readonly unit: 'Week' | 'Month' | 'Quarter' | 'Year' }
  | { readonly kind: 'adjust'; readonly from: 'today' | 'now'; readonly amount: number; readonly unit: 'DAYS' | 'WEEKS' | 'MONTHS' | 'YEARS' };

export type Operator =
  | 'equal' | 'notEqual' | 'lessThan' | 'lessThanEqual' | 'greaterThan' | 'greaterThanEqual'
  | 'startsWith' | 'notStartsWith' | 'contains' | 'notContains' | 'endsWith' | 'notEndsWith'
  | 'in' | 'notIn' | 'isEmpty' | 'isNotEmpty';

export interface Condition {
  readonly kind: 'condition';
  readonly id: string;
  readonly path: PropertyPath;
  readonly operator: Operator;
  /** Absent for isEmpty / isNotEmpty. */
  readonly value?: Value;
}

export interface Group {
  readonly kind: 'group';
  readonly id: string;
  readonly op: 'and' | 'or';
  readonly children: readonly FilterNode[];
}

export type FilterNode = Condition | Group;

export type ParameterType = string;

export interface Parameter {
  readonly name: string;
  /** A primitive (`String`, `StrictDate`, ...) or an enumeration's path. */
  readonly type: ParameterType;
  readonly multiplicity: Multiplicity;
}

/**
 * A constant (upstream's constants panel): `let name = value;` ahead of the query, used as `$name`.
 * A simple one is a typed value the form edits; a calculated one is any Pure expression, kept as
 * its protocol (edited as text, typed by the compiler when the query runs).
 */
export type Constant =
  | { readonly name: string; readonly type: ParameterType; readonly value: Value }
  | { readonly name: string; readonly calculated: ValueSpecification };

/** A name a value may use as `$name`: a parameter, or a constant (a calculated one's type is the compiler's). */
export interface QueryVariable {
  readonly name: string;
  readonly kind: 'parameter' | 'constant';
  readonly type?: ParameterType;
}

export function queryVariables(q: QueryState): QueryVariable[] {
  return [
    ...q.parameters.map((p): QueryVariable => ({ name: p.name, kind: 'parameter', type: p.type })),
    ...(q.constants ?? []).map((c): QueryVariable => ({ name: c.name, kind: 'constant', ...('type' in c ? { type: c.type } : {}) })),
  ];
}

export interface SortSpec {
  readonly column: string;
  readonly direction: 'asc' | 'desc';
}

export interface ResultOptions {
  readonly sort: readonly SortSpec[];
  readonly distinct: boolean;
  readonly limit?: number;
  readonly slice?: { readonly start: number; readonly end: number };
}

/**
 * A query: rows of the columns the person picked (a table), or, when `graph` is set, objects of
 * the source class as JSON (a graph fetch; columns, windows and post-filter then do not apply).
 */
export interface QueryState {
  readonly source: Source;
  readonly columns: readonly ProjectionColumn[];
  readonly filter?: Group;
  /** Window columns, computed after grouping. */
  readonly windows?: readonly WindowColumn[];
  /** A filter on the result's columns (after grouping and windows): conditions name a column as a one-step path. */
  readonly postFilter?: Group;
  readonly graph?: GraphFetch;
  readonly parameters: readonly Parameter[];
  readonly constants?: readonly Constant[];
  /** A temporal source class's dates (upstream's milestoning options); absent for any other class. */
  readonly milestoning?: Milestoning;
  readonly options: ResultOptions;
}

/**
 * A temporal class's `all()`: as of its dates -- `all($businessDate)`, `all($processingDate)`,
 * `all($processingDate, $businessDate)` -- or every version, `allVersions()`.
 */
export type Milestoning =
  | { readonly kind: 'asOf'; readonly dates: { readonly processingDate?: Value; readonly businessDate?: Value } }
  | { readonly kind: 'allVersions' };

export function emptyQuery(source: Source): QueryState {
  return { source, columns: [], parameters: [], options: { sort: [], distinct: false } };
}

let counter = 0;
/** A fresh id for a column or filter node (unique in this tab). */
export function freshId(prefix: string): string {
  counter += 1;
  return `${prefix}${counter}`;
}

/** `firm.legalName` for a path; derived steps get their parentheses. */
export function pathText(path: PropertyPath): string {
  return path.map((s) => (s.args !== undefined ? `${s.property}()` : s.property)).join('.');
}
