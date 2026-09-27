// legend-engine's `pure/v1` API: the ONE client every server call goes
// through (docs/UPSTREAM_ENDPOINTS_DESIGN_2026_09_27.md, U4).
//
// legend-lite serves these calls exactly and nothing of its own, so the
// same requests go to either server and only the base URL differs. Two
// callers, one transport:
//
//   - `UpstreamPlanner` (planner.ts): E1 then E9, `generatePlan`, and the
//     tab runs the plan's SQL -- upstream's cached path;
//   - `LegendEngineExecutor` (engine-remote.ts): E1 then E8, `execute`,
//     and the server runs it.
//
// The model travels as `PureModelContextText` ({_type: text, code}), which
// both servers accept on every call (measured against legend-engine
// 4.145.0), so no model JSON is parsed, cached or sent. The runtime rides
// the query (`->from(runtime)`), as it does in every relation query
// upstream has.

export interface PureV1Options {
  /** e.g. `http://127.0.0.1:6300` (legend-engine) or `http://localhost:8080` (legend-lite). */
  readonly baseUrl: string;
  /** The model, as Pure grammar. */
  readonly model: string;
  /** The runtime the query reads through, e.g. `trades::h2::RT`. */
  readonly runtime: string;
  /** Defaults to the global fetch; injectable for tests. */
  readonly fetch?: typeof fetch;
}

/** How a caller names a failure: its own error class, carrying the query. */
export type Failure = (message: string, pure: string) => Error;

export class PureV1Client {
  readonly #options: PureV1Options;
  readonly #fetch: typeof fetch;
  readonly #fail: Failure;

  constructor(options: PureV1Options, fail: Failure) {
    this.#options = options;
    this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.#fail = fail;
  }

  get baseUrl(): string {
    return this.#options.baseUrl.replace(/\/$/, '');
  }

  /** The query as the server reads it: the cube's grammar from the runtime. */
  query(pureGrammar: string): string {
    return `${pureGrammar}->from(${this.#options.runtime})`;
  }

  /** E1 `grammar/grammarToJson/lambda`: the query's text to its lambda JSON. */
  lambda(pure: string, signal?: AbortSignal): Promise<unknown> {
    return this.#post('/grammar/grammarToJson/lambda', pure, pure, signal, true);
  }

  /** E9 `execution/generatePlan`: the execution plan for a lambda. */
  generatePlan(lambda: unknown, pure: string, signal?: AbortSignal): Promise<unknown> {
    return this.#post('/execution/generatePlan', this.#input(lambda, {}), pure, signal);
  }

  /** E8 `execution/execute`: the rows for a lambda, run by the server. */
  execute(lambda: unknown, pure: string, signal?: AbortSignal): Promise<unknown> {
    return this.#post('/execution/execute', this.#input(lambda, {
      queryTimeOutInSeconds: 60,
      enableConstraints: true,
    }), pure, signal);
  }

  #input(lambda: unknown, context: object): object {
    return {
      // vX_X_X carries the protocol models production versions lack
      // -- DuckDB's among them, which is upstream's reason too.
      clientVersion: 'vX_X_X',
      function: lambda,
      model: { _type: 'text', code: this.#options.model },
      // REQUIRED. Without it legend-engine answers 500 with a
      // NullPointerException out of `processExecutionContext` rather
      // than naming the field it wanted.
      context: { _type: 'BaseExecutionContext', ...context },
    };
  }

  async #post(
    path: string,
    body: unknown,
    pure: string,
    signal: AbortSignal | undefined,
    text = false,
  ): Promise<unknown> {
    const url = `${this.baseUrl}/api/pure/v1${path}`;
    let response: Response;
    try {
      response = await this.#fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': text ? 'text/plain' : 'application/json' },
        body: text ? (body as string) : JSON.stringify(body),
        ...(signal ? { signal } : {}),
      });
    } catch (cause) {
      // An ABORT is this client hanging up because the answer stopped
      // mattering, not the server failing. Report it as what it is, or
      // telemetry reads a responsive grid as an outage.
      if (signal?.aborted) throw signal.reason ?? cause;
      throw this.#fail(`could not reach the server at ${url}: ${String(cause)}`, pure);
    }
    const raw = await response.text();
    if (!response.ok) {
      throw this.#fail(serverMessage(raw) ?? `the server returned ${response.status}`, pure);
    }
    try {
      return JSON.parse(raw);
    } catch {
      throw this.#fail(`the server's answer was not JSON: ${raw.slice(0, 200)}`, pure);
    }
  }
}

/**
 * The server's own words for what went wrong.
 *
 * Errors arrive as `{code, message, status, trace}`, and legend-engine's
 * trace is a Java stack hundreds of lines long. The message is the part a
 * person can act on -- "Can't find a match for function
 * 'toLower(Varchar(32)[0..1])'" told us exactly what to change.
 */
function serverMessage(raw: string): string | null {
  try {
    const body = JSON.parse(raw) as { message?: unknown };
    return typeof body.message === 'string'
      ? body.message.replace(/\s+/g, ' ').slice(0, 400)
      : null;
  } catch {
    return raw ? raw.replace(/\s+/g, ' ').slice(0, 200) : null;
  }
}
