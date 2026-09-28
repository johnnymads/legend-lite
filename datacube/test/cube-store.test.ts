// The saved-cube store (src/cube-store.ts): upstream's query-store rules
// (legend-engine DataCubeQueryStoreManager, 4.145.0), over records in memory.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CubeStoreError, MemoryRecords, RuleStore, type DataCubeQuery } from '../src/cube-store.ts';
import { ExactNumber, fromJson } from '../../pure-protocol/src/index.ts';

function clock(start = 1_000): () => number {
  let t = start;
  return () => (t += 10);
}

const cube = (id: string, name: string, extra: Partial<DataCubeQuery> = {}): DataCubeQuery =>
  ({ id, name, content: { kind: 'datacube.cube', n: 1 }, ...extra });

describe('the store', () => {
  it('creates with the client\'s id, forces the owner, and refuses a taken id', async () => {
    const store = new RuleStore(new MemoryRecords(), 'me', clock());
    const made = await store.create(cube('a', 'Alpha', { owner: 'someone else' }));
    assert.equal(made.owner, 'me', 'the owner is the current user, whatever the request says');
    assert.ok(made.createdAt !== undefined && made.lastUpdatedAt === made.createdAt);
    await assert.rejects(store.create(cube('a', 'Again')), /already existed/);
    await assert.rejects(store.create(cube('', 'x')), /ID is missing/);
    await assert.rejects(store.create(cube('b', '')), /name is missing/);
  });

  it('stamps lastOpenAt when a cube is read', async () => {
    const store = new RuleStore(new MemoryRecords(), 'me', clock());
    const made = await store.create(cube('a', 'Alpha'));
    const opened = await store.get('a');
    assert.ok((opened.lastOpenAt ?? 0) > (made.lastOpenAt ?? 0));
    await assert.rejects(store.get('nope'), (e: unknown) => e instanceof CubeStoreError && e.status === 404);
  });

  it('lets only the owner update or delete, and never changes an id', async () => {
    const records = new MemoryRecords();
    const mine = new RuleStore(records, 'me', clock());
    const theirs = new RuleStore(records, 'you', clock(5_000));
    await mine.create(cube('a', 'Alpha'));
    await assert.rejects(theirs.update('a', cube('a', 'Mine now')), (e: unknown) => e instanceof CubeStoreError && e.status === 403);
    await assert.rejects(theirs.delete('a'), /Only owner/);
    await assert.rejects(mine.update('a', cube('b', 'Moved')), /Updating query ID is not supported/);
    const updated = await mine.update('a', cube('a', 'Alpha 2'));
    assert.equal(updated.name, 'Alpha 2');
    await mine.delete('a');
    await assert.rejects(mine.get('a'), /Can't find/);
  });

  it('searches upstream\'s way: light records, mine first, the chosen sort, the limit', async () => {
    const records = new MemoryRecords();
    const mine = new RuleStore(records, 'me', clock());
    const theirs = new RuleStore(records, 'you', clock(100_000));
    await mine.create(cube('1', 'Trades by desk'));
    await mine.create(cube('2', 'Risk'));
    await theirs.create(cube('3', 'Trades, theirs'));
    const all = await mine.search({ sortByOption: 'SORT_BY_CREATE' });
    assert.deepEqual(all.map((q) => q.id), ['2', '1', '3'], 'mine first, newest first');
    assert.equal('content' in (all[0] as object), false, 'no content in a search');
    assert.deepEqual((await mine.search({ searchTermSpecification: { searchTerm: 'trades' } })).map((q) => q.id).sort(), ['1', '3']);
    assert.deepEqual((await mine.search({ searchTermSpecification: { searchTerm: '2' } })).map((q) => q.id), ['2'], 'an id matches');
    assert.deepEqual((await mine.search({ showCurrentUserQueriesOnly: true })).map((q) => q.id).sort(), ['1', '2']);
    assert.equal((await mine.search({ limit: 1 })).length, 1);
  });

  it('keeps a content\'s exact numbers', async () => {
    const store = new RuleStore(new MemoryRecords(), 'me', clock());
    const content = fromJson('{"kind":"datacube.cube","big":123456789012345678901234,"dec":12.30}') as Record<string, unknown>;
    await store.create({ id: 'x', name: 'Exact', content });
    const back = (await store.get('x')).content;
    assert.ok(back['big'] instanceof ExactNumber && back['big'].text === '123456789012345678901234');
    assert.ok(back['dec'] instanceof ExactNumber && back['dec'].text === '12.30');
  });
});
