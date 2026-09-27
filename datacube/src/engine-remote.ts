// Server mode: the ENGINE runs the query.
//
// The other two planes plan and execute in two steps -- Pure in, SQL
// out, then DuckDB-WASM runs the SQL in the tab. That is what
// `Planner` is for, and it is what upstream does for a CACHED source:
// `generatePlan`, take the SQL out of the plan, run it locally.
//
// An engine-backed source is the other shape entirely. Upstream posts
// the query to `/api/pure/v1/execution/execute` and renders the rows
// the engine sends back (`_runQuery`); the SQL it shows comes back as
// an execution ACTIVITY and is never run by the browser. The data
// lives wherever the engine's store points, which is the whole point
// of the mode: a cube over a database the tab cannot reach.
//
// So this is not a planner. Pure in, ROWS out.

import type { CubeSnapshot } from './snapshot.ts';
import type { LevelScope } from './serialize.ts';
import type { ResultColumn, ResultTable, Scalar } from './result.ts';
import { PureV1Client, type PureV1Options } from './pure-v1.ts';
import { pureType, relationColumns, type PlanColumn } from './relation-type.ts';

/** What a remote engine answers with. */
export interface RemoteResult {
  readonly rows: ResultTable;
  /**
   * The SQL the engine REPORTS having run, for display only.
   *
   * It arrives as an execution activity, after the fact. Running it
   * here would need the engine's own connection, which is the thing
   * this mode exists to avoid.
   */
  readonly sql: string;
}

export interface RemoteExecutor {
  execute(
    pureGrammar: string,
    snapshot: CubeSnapshot,
    scope?: LevelScope,
    signal?: AbortSignal,
  ): Promise<RemoteResult>;
  /** The compiler's type of a query's result: the engine's `lambdaRelationType`. */
  relationType(pureGrammar: string, signal?: AbortSignal): Promise<PlanColumn[]>;
}

export class RemoteExecutionError extends Error {
  readonly pure: string;
  constructor(message: string, pure: string) {
    super(message);
    this.name = 'RemoteExecutionError';
    this.pure = pure;
  }
}

export type LegendEngineOptions = PureV1Options;

/** The protocol shapes this client touches, and only those. */
interface TdsResponse {
  readonly builder?: {
    readonly columns?: readonly {
      readonly name: string;
      readonly type?: string;
    }[];
  };
  readonly activities?: readonly { readonly sql?: string }[];
  readonly result?: {
    readonly columns?: readonly string[];
    readonly rows?: readonly { readonly values?: readonly Scalar[] }[];
  };
}

/** A TDS as the engine sends it, as a ResultTable. */
export function toResultTable(
  body: TdsResponse,
  epoch: number,
  elapsedMs: number,
): ResultTable {
  // THE BUILDER NAMES THE COLUMNS AND THEIR TYPES; `result.columns`
  // repeats the names alone. Read the builder, and fall back to the
  // names when a response carries no builder at all.
  const declared = body.builder?.columns;
  const names = declared?.map((c) => c.name)
    ?? body.result?.columns
    ?? [];
  const rows = body.result?.rows ?? [];
  const columns: ResultColumn[] = names.map((name, i) => {
    const values: Scalar[] = new Array(rows.length);
    for (let r = 0; r < rows.length; r++) {
      values[r] = (rows[r]?.values?.[i] ?? null) as Scalar;
    }
    // the builder's type is the compiler's (the engine's plan), read by the one
    // reader of both vocabularies; a response with no builder types nothing
    const declaredType = declared?.[i]?.type;
    return {
      name,
      type: declaredType === undefined ? 'Unknown' : pureType(declaredType),
      values,
    };
  });
  return { columns, rowCount: rows.length, epoch, elapsedMs };
}

/**
 * Pure in, rows out, through a running server's `pure/v1` API: the query
 * parsed (`grammarToJson/lambda`), then `execution/execute`.
 */
export class LegendEngineExecutor implements RemoteExecutor {
  readonly #client: PureV1Client;

  constructor(options: LegendEngineOptions) {
    this.#client = new PureV1Client(options, (m, p) => new RemoteExecutionError(m, p));
  }

  get baseUrl(): string {
    return this.#client.baseUrl;
  }

  async execute(
    pureGrammar: string,
    snapshot: CubeSnapshot,
    _scope?: LevelScope,
    signal?: AbortSignal,
  ): Promise<RemoteResult> {
    const pure = this.#client.query(pureGrammar);
    const started = Date.now();
    const lambda = await this.#client.lambda(pure, signal);
    const body = (await this.#client.execute(lambda, pure, signal)) as TdsResponse;
    return {
      rows: toResultTable(body, snapshot.epoch, Date.now() - started),
      sql: body.activities?.at(-1)?.sql ?? '',
    };
  }

  async relationType(pureGrammar: string, signal?: AbortSignal): Promise<PlanColumn[]> {
    const lambda = await this.#client.lambda(pureGrammar, signal);
    return relationColumns(await this.#client.lambdaRelationType(lambda, pureGrammar, signal));
  }
}
