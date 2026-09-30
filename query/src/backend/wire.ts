// legend-engine's wire shapes the Query app reads and writes, beyond the model (model/pmcd.ts)
// and the lambda (pure-protocol): execution input and results, relation types, the query
// store's records. Types only; each named after the engine's own class.

import type { GenericType, Lambda, Multiplicity, ValueSpecification } from '../../../pure-protocol/src/index.ts';

/** `PureModelContextText`: the model as its grammar (what legend-lite reads; the engine too). */
export interface PureModelContextText {
  readonly _type: 'text';
  readonly code: string;
}

export type PureModelContext = PureModelContextText;

export interface ParameterValue {
  readonly name: string;
  readonly value: ValueSpecification;
}

/** `ExecuteInput`. */
export interface ExecuteInput {
  readonly clientVersion?: string;
  readonly function: Lambda;
  readonly model: PureModelContext;
  readonly mapping?: string;
  readonly runtime?: unknown;
  readonly context?: { readonly _type: 'BaseExecutionContext' };
  readonly parameterValues?: readonly ParameterValue[];
}

export interface RelationTypeColumn {
  readonly name: string;
  readonly genericType: GenericType;
  readonly multiplicity: Multiplicity;
}

/** `lambdaRelationType`'s answer. */
export interface RelationTypeAnswer {
  readonly _type: 'relationType';
  readonly columns: readonly RelationTypeColumn[];
}

/** `execute`'s answer for a relation or TDS: builder, activities (with the SQL), columns and rows. */
export interface TdsResult {
  readonly builder: {
    readonly _type: 'tdsBuilder';
    readonly columns: readonly { readonly name: string; readonly type?: string; readonly relationalType?: string }[];
  };
  readonly activities?: readonly { readonly _type: string; readonly sql?: string }[];
  readonly result: {
    readonly columns: readonly string[];
    readonly rows: readonly { readonly values: readonly unknown[] }[];
  };
}

/** `execute`'s answer for a graph fetch: the objects, or the one object bare. */
export interface JsonResult {
  readonly builder: { readonly _type: 'json' };
  readonly values: unknown;
}

export type ExecutionResult = TdsResult | JsonResult;

export function isTds(r: ExecutionResult): r is TdsResult {
  return r.builder._type === 'tdsBuilder';
}

/** `compilation/compile`'s answer. */
export interface CompileResult {
  readonly message: string;
  readonly defects: readonly { readonly message: string; readonly defectSeverityLevel?: string }[];
}

// ---------------------------------------------------------------- the query store

export interface QueryTaggedValue {
  readonly tag: { readonly profile: string; readonly value: string };
  readonly value: string;
}

export interface QueryStereotype {
  readonly profile: string;
  readonly value: string;
}

export type QueryExecutionContext =
  | { readonly _type: 'explicitExecutionContext'; readonly mapping: string; readonly runtime: string }
  | { readonly _type: 'dataSpaceExecutionContext'; readonly dataSpacePath: string; readonly executionKey?: string };

/** `Query`: a saved query, as the store keeps it. */
export interface Query {
  readonly id: string;
  readonly name: string;
  readonly description?: string | null;
  readonly groupId: string;
  readonly artifactId: string;
  readonly versionId: string;
  readonly originalVersionId?: string | null;
  readonly executionContext?: QueryExecutionContext | null;
  /** The query as Pure text. */
  readonly content: string;
  readonly lastUpdatedAt?: number | null;
  readonly createdAt?: number | null;
  readonly lastOpenAt?: number | null;
  readonly version?: number | null;
  readonly taggedValues?: readonly QueryTaggedValue[] | null;
  readonly stereotypes?: readonly QueryStereotype[] | null;
  readonly defaultParameterValues?: readonly { readonly name: string; readonly content: string }[] | null;
  readonly owner?: string | null;
  readonly gridConfig?: Record<string, unknown> | null;
}

export type QuerySearchSortBy = 'SORT_BY_CREATE' | 'SORT_BY_VIEW' | 'SORT_BY_UPDATE';

export interface QuerySearchSpecification {
  readonly searchTermSpecification?: { readonly searchTerm: string; readonly exactMatchName?: boolean; readonly includeOwner?: boolean };
  readonly projectCoordinates?: readonly { readonly groupId: string; readonly artifactId: string; readonly version?: string }[];
  readonly taggedValues?: readonly QueryTaggedValue[];
  readonly stereotypes?: readonly QueryStereotype[];
  readonly limit?: number;
  readonly showCurrentUserQueriesOnly?: boolean;
  readonly combineTaggedValuesCondition?: boolean;
  readonly sortByOption?: QuerySearchSortBy;
}

/** The profile upstream Query tags a saved query with (its data space, its class). */
export const QUERY_PROFILE = 'meta::pure::profiles::query';
