// Running a query: the lambda for execution (with `->from()`, a preview limit one past what is
// shown so an overflow is visible, parameter values), sent to the engine, abortable.

import { collection, element, fn, lambda as makeLambda, type Lambda, type ValueSpecification } from '../../../pure-protocol/src/index.ts';
import { buildLambda, valueSpec } from '../builder/build.ts';
import type { AppContext } from './context.ts';
import type { Session } from './session.ts';
import type { ExecuteInput, ParameterValue } from '../backend/wire.ts';

export const DEFAULT_PREVIEW = 1000;

/** The lambda a text-only query runs: its own `->from()`, or the session's mapping and runtime. */
function textLambdaForRun(session: Session, l: Lambda, previewLimit: number | undefined): Lambda {
  const last = l.body[l.body.length - 1] as ValueSpecification & { function?: string };
  let body = last;
  const hasFrom = last._type === 'func' && /(^|::)from$/.test(last.function ?? '');
  if (previewLimit !== undefined) {
    // a preview wraps the whole query: from() stays outermost
    if (hasFrom) {
      const f = last as unknown as { function: string; parameters: ValueSpecification[] };
      body = fn(f.function, fn('limit', f.parameters[0]!, { _type: 'integer', value: previewLimit }), ...f.parameters.slice(1));
    } else body = fn('limit', body, { _type: 'integer', value: previewLimit });
  }
  if (!hasFrom) {
    const src = session.query.source;
    body = fn('from', body, element(src.mapping), element(src.runtime));
  }
  return makeLambda(l.parameters, ...l.body.slice(0, -1), body);
}

/** The lambda to execute for the session's query. */
export function executionLambda(session: Session, previewLimit: number | undefined): Lambda {
  if (session.text) return textLambdaForRun(session, session.text.lambda, previewLimit);
  return buildLambda(session.project.graph, session.query, {
    withFrom: true,
    ...(previewLimit !== undefined ? { previewLimit } : {}),
  });
}

export function parameterValues(session: Session, l: Lambda): ParameterValue[] {
  const out: ParameterValue[] = [];
  for (const p of l.parameters) {
    const v = session.paramValues.get(p.name);
    if (v !== undefined) out.push({ name: p.name, value: v.kind === 'list' ? collection(v.values.map(valueSpec)) : valueSpec(v) });
  }
  return out;
}

export function executeInput(session: Session, l: Lambda): ExecuteInput {
  return { function: l, model: session.project.context, parameterValues: parameterValues(session, l) };
}

/** Run the query for the results panel: `limit` rows shown, one more asked for. */
export async function run(app: AppContext, session: Session, limit: number): Promise<void> {
  const abort = new AbortController();
  const started = performance.now();
  let l: Lambda;
  try {
    l = executionLambda(session, limit + 1);
  } catch (e) {
    session.setRun({ status: 'error', message: (e as Error).message });
    return;
  }
  session.setRun({ status: 'running', started, abort });
  const hash = session.hash();
  try {
    const result = await app.engine.execute(executeInput(session, l), abort.signal);
    session.setRun({ status: 'done', result, ms: Math.round(performance.now() - started), limit, queryHash: hash });
  } catch (e) {
    if ((e as Error).name === 'AbortError') session.setRun({ status: 'error', message: 'Stopped.' });
    else session.setRun({ status: 'error', message: (e as Error).message });
  }
}

/** The SQL the query runs: legend-lite's planner in the tab when there is one, else the engine's plan. */
export async function sqlOf(app: AppContext, session: Session): Promise<string> {
  const l = executionLambda(session, undefined);
  if (app.planner) return app.planner.sql(session.project.context, l, session.query.source.runtime);
  const plan = await app.engine.generatePlan(executeInput(session, l)) as { rootExecutionNode?: { executionNodes?: { sqlQuery?: string }[] } };
  const sql = plan.rootExecutionNode?.executionNodes?.find((n) => n.sqlQuery)?.sqlQuery;
  if (!sql) throw new Error('the plan carries no SQL');
  return sql;
}
