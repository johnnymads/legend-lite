// The rules a page hosting a cube keeps (src/host.ts, Leg B / B6).

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Latest, TabWork, mayLeave } from '../src/host.ts';

describe('the work a tab holds (P2-337)', () => {
  it('says the first thing leaving would lose, or nothing', () => {
    const work = new TabWork();
    let file: string | undefined;
    let session: string | undefined;
    work.add(() => (file ? `the file ${file}` : undefined));
    work.add(() => (session ? `the session of ${session}` : undefined));
    assert.equal(work.what(), undefined);
    session = 'alice';
    assert.equal(work.what(), 'the session of alice');
    file = 'trades.csv';
    assert.equal(work.what(), 'the file trades.csv', 'read now, not when added');
  });

  it('leaving asks only when there is work, and says what', () => {
    const work = new TabWork();
    let held: string | undefined;
    work.add(() => held);
    const asked: string[] = [];
    assert.equal(mayLeave(work, (q) => { asked.push(q); return false; }, 'Switching plane'), true, 'nothing to lose: go');
    assert.equal(asked.length, 0);
    held = 'unsaved changes';
    assert.equal(mayLeave(work, (q) => { asked.push(q); return false; }, 'Switching plane'), false, 'No: stay');
    assert.match(asked[0] ?? '', /Switching plane: unsaved changes will be lost/);
    assert.equal(mayLeave(work, () => true, 'Switching plane'), true, 'Yes: go');
  });
});

describe('latest wins (P2-330)', () => {
  it('an older start learns it was overtaken; the newest stays current', () => {
    const opens = new Latest();
    const first = opens.start();
    const second = opens.start();
    assert.equal(first(), false);
    assert.equal(second(), true);
  });
});
