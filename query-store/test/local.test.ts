// The page's own store (local-server.ts), held to the one suite -- and what only it can be asked:
// another user's query, and records written by the Query app's first layout.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { localQueryServer, LOCAL_API } from '../src/local-server.ts';
import { MemoryRecords } from '../src/records.ts';
import { QueryStoreClient, QueryStoreError } from '../src/client.ts';
import { conformance } from './conformance.ts';

const records = new MemoryRecords();
const server = localQueryServer({ records, user: 'anonymous' });
conformance("the page's own store", () => ({ api: LOCAL_API, fetch: server.fetch, user: 'anonymous' }));

describe("the page's own store: what a server here cannot be asked", () => {
  it('only the owner updates or deletes', async () => {
    const shared = new MemoryRecords();
    const mine = new QueryStoreClient(LOCAL_API, localQueryServer({ records: shared, user: 'me' }).fetch);
    const theirs = new QueryStoreClient(LOCAL_API, localQueryServer({ records: shared, user: 'someone' }).fetch);
    const q = await mine.create({
      id: 'owned', name: 'Owned', groupId: 'demo', artifactId: 'trading', versionId: '0.0.0', content: '|1',
    });
    await assert.rejects(theirs.update({ ...q, name: 'Taken' }), (e: unknown) => e instanceof QueryStoreError && e.status === 403
      && e.message === 'Only owner can update the query');
    await assert.rejects(theirs.delete('owned'), (e: unknown) => e instanceof QueryStoreError && e.status === 403
      && e.message === 'Only owner can delete the query');
    // and "mine only" is the caller's
    assert.deepEqual((await theirs.search({ showCurrentUserQueriesOnly: true })).map((x) => x.id), []);
    assert.deepEqual((await mine.search({ showCurrentUserQueriesOnly: true })).map((x) => x.id), ['owned']);
  });

  it('a body that is not JSON: the engine 500, naming the error', async () => {
    const r = await server.fetch(`${LOCAL_API}/pure/v1/query`, { method: 'POST', body: '{not json' });
    assert.equal(r.status, 500);
    assert.match(((await r.json()) as { message: string }).message, /^SyntaxError: /);
  });
});
