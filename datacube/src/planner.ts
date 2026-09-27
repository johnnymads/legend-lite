// The planner client: Pure grammar out, SQL back, over legend-engine's own
// API (docs/UPSTREAM_ENDPOINTS_DESIGN_2026_09_27.md).
//
// Upstream's cached path, through the one `pure/v1` client (pure-v1.ts):
// the query parsed (`grammarToJson/lambda`), then `execution/generatePlan`,
// whose SQL node carries the query the tab then runs. The SAME requests go to
// legend-lite and to legend-engine: lite serves those calls exactly and
// nothing of its own (the made-up `/engine/plan` this replaced was deleted,
// 2026-09-27).

import type { Planner } from './cube.ts';
import { PureV1Client, type PureV1Options } from './pure-v1.ts';
import { relationColumns, tdsColumns, type Plan, type PlanColumn } from './relation-type.ts';
import type { LevelScope } from './serialize.ts';
import type { CubeSnapshot } from './snapshot.ts';

export interface UpstreamPlannerOptions extends PureV1Options {
  /**
   * Cache plans by grammar text. Safe because planning is pure: the
   * same grammar and runtime always lower to the same SQL. Worth it
   * because scrolling re-issues structurally identical queries.
   */
  readonly cache?: boolean;
}

export class PlanError extends Error {
  readonly grammar: string;
  constructor(message: string, grammar: string) {
    super(message);
    this.name = 'PlanError';
    this.grammar = grammar;
  }
}

export class UpstreamPlanner implements Planner {
  readonly #client: PureV1Client;
  readonly #useCache: boolean;
  readonly #cache = new Map<string, Plan>();
  readonly #types = new Map<string, PlanColumn[]>();

  constructor(options: UpstreamPlannerOptions) {
    this.#useCache = options.cache !== false;
    // a failure names the cube's grammar, not the query with its runtime
    const grammarOf = (pure: string) => {
      const at = pure.lastIndexOf('->from(');
      return at < 0 ? pure : pure.slice(0, at);
    };
    this.#client = new PureV1Client(options, (m, pure) => new PlanError(m, grammarOf(pure)));
  }

  async plan(
    pureGrammar: string,
    _snapshot: CubeSnapshot,
    _scope?: LevelScope,
    signal?: AbortSignal,
  ): Promise<Plan> {
    const hit = this.#useCache ? this.#cache.get(pureGrammar) : undefined;
    if (hit !== undefined) return hit;
    const pure = this.#client.query(pureGrammar);
    const lambda = await this.#client.lambda(pure, signal);
    const body = await this.#client.generatePlan(lambda, pure, signal);
    const sql = sqlOf(body);
    if (sql === undefined) {
      throw new PlanError('the plan carries no SQL node', pureGrammar);
    }
    // the plan's own tdsColumns: the result's type, as the compiler gave it
    const plan: Plan = { sql, columns: tdsColumns(body) };
    if (this.#useCache) this.#cache.set(pureGrammar, plan);
    return plan;
  }

  /** E5 `lambdaRelationType` (through E1 for the lambda), cached by grammar. */
  async relationType(pureGrammar: string, signal?: AbortSignal): Promise<PlanColumn[]> {
    const hit = this.#useCache ? this.#types.get(pureGrammar) : undefined;
    if (hit !== undefined) return hit;
    const lambda = await this.#client.lambda(pureGrammar, signal);
    const columns = relationColumns(await this.#client.lambdaRelationType(lambda, pureGrammar, signal));
    if (this.#useCache) this.#types.set(pureGrammar, columns);
    return columns;
  }

  /** Cached plan count, for tests and diagnostics. */
  get cacheSize(): number {
    return this.#cache.size;
  }
}

/** The SQL of an execution plan: its first `sql` execution node's `sqlQuery`. */
function sqlOf(plan: unknown): string | undefined {
  const work: unknown[] = [(plan as { rootExecutionNode?: unknown }).rootExecutionNode];
  while (work.length > 0) {
    const node = work.shift() as { _type?: string; sqlQuery?: string; executionNodes?: unknown[] } | undefined;
    if (!node) continue;
    if (node._type === 'sql' && typeof node.sqlQuery === 'string') return node.sqlQuery;
    work.push(...(node.executionNodes ?? []));
  }
  return undefined;
}
