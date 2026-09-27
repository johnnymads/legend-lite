import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  PlanError,
  UpstreamPlanner,
} from '../src/planner.ts';
import type { CubeSnapshot } from '../src/snapshot.ts';

const SNAPSHOT = {
  source: { expression: '$trades' },
  columns: [],
  derived: [],
  rows: [],
  pivotOn: [],
  measures: [],
  sorts: [],
  epoch: 1,
} satisfies CubeSnapshot;

/** A plan as legend-engine's generatePlan shapes it: the SQL in a nested sql node. */
const PLAN = {
  _type: 'simple',
  rootExecutionNode: {
    _type: 'relationalTdsInstantiation',
    executionNodes: [{ _type: 'sql', sqlQuery: 'SELECT 1', executionNodes: [] }],
  },
};

interface Seen { readonly url: string; readonly body: string; readonly type: string }

/** Answers each upstream call; records what was sent. */
function fakeServer(seen: Seen[], answer: (path: string) => { status?: number; json: unknown }): typeof fetch {
  return (async (url: string, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    seen.push({ url, body: String(init?.body ?? ''), type: headers['Content-Type'] ?? '' });
    const { status = 200, json } = answer(new URL(url).pathname);
    return new Response(JSON.stringify(json), { status });
  }) as unknown as typeof fetch;
}

const ok = (path: string) => ({ json: path.endsWith('/lambda') ? { _type: 'lambda' } : PLAN });

describe('UpstreamPlanner: legend-engine\'s own API, the same client for lite and the engine', () => {
  it('asks grammarToJson/lambda for the query, then generatePlan, and returns the plan\'s SQL', async () => {
    const seen: Seen[] = [];
    const p = new UpstreamPlanner({
      baseUrl: 'http://localhost:9999/',
      model: 'Class demo::Person {}',
      runtime: 'demo::RT',
      fetch: fakeServer(seen, ok),
    });
    assert.equal(await p.plan('$trades->select(~[a])', SNAPSHOT), 'SELECT 1');
    assert.equal(seen[0]!.url, 'http://localhost:9999/api/pure/v1/grammar/grammarToJson/lambda');
    assert.equal(seen[0]!.type, 'text/plain');
    assert.equal(seen[0]!.body, '$trades->select(~[a])->from(demo::RT)');
    assert.equal(seen[1]!.url, 'http://localhost:9999/api/pure/v1/execution/generatePlan');
    const input = JSON.parse(seen[1]!.body);
    assert.deepEqual(input.model, { _type: 'text', code: 'Class demo::Person {}' });
    assert.deepEqual(input.function, { _type: 'lambda' });
  });

  it('caches, because planning the same grammar is pure', async () => {
    const seen: Seen[] = [];
    const p = new UpstreamPlanner({ baseUrl: 'http://x', model: 'm', runtime: 'r', fetch: fakeServer(seen, ok) });
    await p.plan('g', SNAPSHOT);
    await p.plan('g', SNAPSHOT);
    await p.plan('other', SNAPSHOT);
    assert.equal(seen.length, 4, 'two calls per new grammar; the repeat was served from cache');
    assert.equal(p.cacheSize, 2);
  });

  it('surfaces the compiler message verbatim, from the engine\'s error JSON', async () => {
    const p = new UpstreamPlanner({
      baseUrl: 'http://x',
      model: 'm',
      runtime: 'r',
      fetch: fakeServer([], (path) => (path.endsWith('/generatePlan')
        ? { status: 400, json: { code: -1, errorType: 'COMPILATION', message: "Column 'nope' not found", status: 'error' } }
        : { json: {} })),
    });
    await assert.rejects(
      () => p.plan('bad grammar', SNAPSHOT),
      (e: unknown) => {
        assert.ok(e instanceof PlanError);
        assert.match((e as Error).message, /Column 'nope' not found/);
        assert.equal((e as PlanError).grammar, 'bad grammar');
        return true;
      },
    );
  });

  it('reports an unreachable planner distinctly from a rejected plan', async () => {
    const p = new UpstreamPlanner({
      baseUrl: 'http://x',
      model: 'm',
      runtime: 'r',
      fetch: (() => Promise.reject(new Error('ECONNREFUSED'))) as never,
    });
    await assert.rejects(() => p.plan('g', SNAPSHOT), /could not reach the server at http:\/\/x/);
  });
});
