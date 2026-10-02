// Upstream's saved query, as `/api/pure/v1/query` writes it (legend-engine's `Query`,
// legend-engine-application-query; legend-lite's `SavedQueries.java` keeps the same records). The
// contract every store and every app here meets -- legend-engine defines it, nothing here owns it.

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
  | { readonly _type: 'dataSpaceExecutionContext'; readonly dataSpacePath: string; readonly executionKey?: string | null };

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
  /** The query as Pure text, without its `->from(...)`. */
  readonly content: string;
  readonly lastUpdatedAt?: number | null;
  readonly createdAt?: number | null;
  readonly lastOpenAt?: number | null;
  /** Set on a deleted query's last version (its history). */
  readonly deletedAt?: number | null;
  /** When a version stopped being current; null on the current one. */
  readonly validUntil?: number | null;
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
