// Several cubes on one page (plan F6): one engine and one planner shared, and each cube its own --
// a keystroke, a drag, a dispose reach the cube they belong to and no other. These were the
// design's blockers #1 (shortcuts on the whole document), #3 (dispose left things alive) and
// #8 (a drag from one cube could land on another).

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { JSDOM } from 'jsdom';

import { CubeApp } from '../src/app.ts';
import { setHeaderDrag } from '../src/ui/pivot-panel.ts';
import { GateEngine, SNAPSHOT, StubPlanner, settle } from './cube-fixture.ts';

/** Grouped by region alone, so grouping by desk too is a change to undo. */
const BY_REGION = { ...SNAPSHOT, rows: ['region'] };

let dom: JSDOM;
let a: CubeApp;
let b: CubeApp;
let rootA: HTMLElement;
let rootB: HTMLElement;

beforeEach(async () => {
  dom = new JSDOM('<!doctype html><p id="outside">text</p><div id="a"></div><div id="b"></div>');
  const g = globalThis as unknown as Record<string, unknown>;
  g['window'] = dom.window;
  g['document'] = dom.window.document;
  g['requestAnimationFrame'] = (cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  };
  g['cancelAnimationFrame'] = () => {};
  const engine = new GateEngine();
  const planner = new StubPlanner();
  rootA = dom.window.document.getElementById('a') as unknown as HTMLElement;
  rootB = dom.window.document.getElementById('b') as unknown as HTMLElement;
  a = new CubeApp(rootA, BY_REGION, { engine, planner });
  b = new CubeApp(rootB, BY_REGION, { engine, planner });
  await a.open();
  await b.open();
  await settle();
});

/** Group `root`'s cube by desk as well, the way a person does: a column dropped in its Row Groups. */
async function groupByDesk(root: HTMLElement): Promise<void> {
  const zone = root.querySelector('.dc-zone-rows') as HTMLElement;
  setHeaderDrag({ column: 'desk' }, zone);
  zone.dispatchEvent(new dom.window.Event('drop', { bubbles: true }));
  await settle();
}

function ctrlZ(from: Element): void {
  from.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
}

describe('several cubes on one page', () => {
  it('each cube is marked as its own', () => {
    assert.ok(rootA.dataset['dcCube']);
    assert.notEqual(rootA.dataset['dcCube'], rootB.dataset['dcCube']);
  });

  it('Ctrl-Z inside one cube undoes that cube, not the other', async () => {
    await groupByDesk(rootA);
    await groupByDesk(rootB);
    assert.deepEqual([a.snapshot.rows, b.snapshot.rows], [['region', 'desk'], ['region', 'desk']]);
    ctrlZ(rootB.querySelector('.dc-grid') ?? rootB);
    await settle();
    assert.deepEqual([a.snapshot.rows, b.snapshot.rows], [['region', 'desk'], ['region']]);
  });

  it('Ctrl-Z from outside every cube undoes the one last touched', async () => {
    await groupByDesk(rootA);
    await groupByDesk(rootB);
    rootA.dispatchEvent(new dom.window.Event('pointerdown', { bubbles: true }));
    ctrlZ(dom.window.document.getElementById('outside')!);
    await settle();
    assert.deepEqual([a.snapshot.rows, b.snapshot.rows], [['region'], ['region', 'desk']]);
  });

  it('a drag from one cube does not land on another', async () => {
    setHeaderDrag({ column: 'desk' }, rootA.querySelector('.dc-zone-rows'));
    (rootB.querySelector('.dc-zone-rows') as HTMLElement)
      .dispatchEvent(new dom.window.Event('drop', { bubbles: true }));
    await settle();
    assert.deepEqual([a.snapshot.rows, b.snapshot.rows], [['region'], ['region']]);
  });

  it('disposing one cube tears it down and leaves the other working', async () => {
    a.dispose();
    assert.equal(rootA.querySelector('.dc-row'), null, 'its grid is gone');
    await groupByDesk(rootB);
    rootB.dispatchEvent(new dom.window.Event('pointerdown', { bubbles: true }));
    ctrlZ(dom.window.document.getElementById('outside')!);
    await settle();
    assert.deepEqual(b.snapshot.rows, ['region'], 'the other still undoes');
  });
});
