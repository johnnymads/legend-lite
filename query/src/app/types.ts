// The result's columns and their types, as the compiler types them (`lambdaRelationType`, the
// tab's planner): what a post-filter condition or a window can refer to, and each one's type.
// Typed without filters or parameters -- they do not change the columns (and legend-lite does
// not type a parameterized lambda's result yet: docs/IN_FLIGHT.md).

import { buildLambda } from '../builder/build.ts';
import type { QueryState } from '../builder/state.ts';
import type { AppContext } from './context.ts';
import type { Session } from './session.ts';

export interface ResultColumn {
  readonly name: string;
  readonly type: string;
}

const cache = new Map<string, Promise<ResultColumn[]>>();

/** The columns a query's rows have, before its post-filter (upto `stage`: 'windows' includes window columns). */
export function resultColumns(app: AppContext, session: Session, q: QueryState = session.query): Promise<ResultColumn[]> {
  const typed: QueryState = {
    source: q.source, columns: q.columns, parameters: [], options: { sort: [], distinct: false },
    ...(q.windows ? { windows: q.windows } : {}),
  };
  if (typed.columns.length === 0) return Promise.resolve([]);
  const key = JSON.stringify(typed);
  let hit = cache.get(key);
  if (!hit) {
    hit = (async () => {
      const lambda = buildLambda(session.project.graph, typed, { withFrom: true });
      const t = await app.engine.relationType(session.project.context, lambda);
      return t.columns.map((c) => ({
        name: c.name,
        type: c.genericType.rawType._type === 'packageableType' ? c.genericType.rawType.fullPath : 'Relation',
      }));
    })();
    hit.catch(() => cache.delete(key));
    cache.set(key, hit);
  }
  return hit;
}
