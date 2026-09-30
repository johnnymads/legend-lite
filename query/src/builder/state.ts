// The query being built, as plain data: a source, columns, a filter tree, parameters and result
// options. build.ts turns it into the lambda (protocol JSON, never text -- design D5); load.ts
// reads a lambda back into it, or says why it cannot (the query then stays in text mode).

import type { Multiplicity } from '../../../pure-protocol/src/index.ts';

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
  readonly path: PropertyPath;
  /** An aggregate over the column: the query then groups by every other column. */
  readonly aggregate?: AggregateOp;
}

export type AggregateOp =
  | 'count' | 'distinctCount' | 'sum' | 'average' | 'min' | 'max' | 'stdDevPopulation' | 'stdDevSample'
  | 'joinStrings';

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
  | { readonly kind: 'parameter'; readonly name: string };

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

/** A tabular query: rows of the columns the person picked. */
export interface QueryState {
  readonly source: Source;
  readonly columns: readonly ProjectionColumn[];
  readonly filter?: Group;
  readonly parameters: readonly Parameter[];
  readonly options: ResultOptions;
}

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
