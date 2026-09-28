// Leg B through the APP (docs/DATACUBE_LEG_B_STATE_OWNER_2026_09_28.md, B1b): a change is one
// transaction on the cube's one state owner. Each test is an audit entry reproduced the way a person
// meets it -- a menu entry, a chevron, a setting -- over an engine the test can refuse or hold.

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { JSDOM } from 'jsdom';

import { CubeApp } from '../src/app.ts';
import type { Planner } from '../src/cube.ts';
import type { Plan, PlanColumn } from '../src/relation-type.ts';
import type { ResultTable } from '../src/result.ts';
import type { CubeSnapshot } from '../src/snapshot.ts';
import { FakeEngine } from './fake-engine.ts';
import { fakeParse, fakePrint } from './fake-planner.ts';
import { element } from '../../pure-protocol/src/index.ts';

const SNAPSHOT: CubeSnapshot = {
  source: { query: element('trades') },
  columns: [
    { name: 'region', type: 'String' },
    { name: 'desk', type: 'String' },
    { name: 'notional', type: 'Float' },
  ],
  derived: [],
  rows: ['region', 'desk'],
  pivotOn: [],
  measures: [{ name: 'total', column: 'notional', fn: 'sum' }],
  sorts: [],
  epoch: 1,
};

/** An engine the test refuses or holds: every query answers the same small table. */
class GateEngine extends FakeEngine {
  readonly name = 'gate';
  queries = 0;
  refuse: string | null = null;
  hold = false;
  readonly held: (() => void)[] = [];
  async answer(_sql: string, epoch: number): Promise<ResultTable> {
    this.queries += 1;
    if (this.hold) await new Promise<void>((r) => this.held.push(r));
    if (this.refuse !== null) throw new Error(this.refuse);
    return {
      columns: [
        { name: 'region', type: 'String', values: ['EMEA', 'AMER'] },
        { name: 'desk', type: 'String', values: ['A', 'B'] },
        { name: 'total', type: 'Float', values: [600, 400] },
      ],
      rowCount: 2,
      epoch,
      elapsedMs: 1,
    };
  }
  /** Let held query `i` (in the order they arrived) answer. */
  release(i: number): void {
    (this.held[i] ?? assert.fail(`no held query ${i}`))();
  }
  releaseAll(): void {
    for (const r of this.held.splice(0)) r();
  }
}

class StubPlanner implements Planner {
  async plan(): Promise<Plan> {
    return { sql: 'SELECT 1', columns: [] };
  }
  async relationType(): Promise<PlanColumn[]> {
    return [];
  }
  parse = fakeParse;
  print = fakePrint;
}

let dom: JSDOM;
let root: HTMLElement;
let engine: GateEngine;
let app: CubeApp;
let unhandled: unknown[];

/** Let every promise the app started settle (menus and chevrons do not return theirs). */
async function settle(): Promise<void> {
  for (let i = 0; i < 20; i += 1) await new Promise((r) => setTimeout(r, 0));
}

beforeEach(async () => {
  dom = new JSDOM('<!doctype html><div id="r"></div>');
  const g = globalThis as unknown as Record<string, unknown>;
  g['window'] = dom.window;
  g['document'] = dom.window.document;
  g['requestAnimationFrame'] = (cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  };
  g['cancelAnimationFrame'] = () => {};
  root = dom.window.document.getElementById('r') as unknown as HTMLElement;
  engine = new GateEngine();
  unhandled = [];
  process.removeAllListeners('unhandledRejection');
  process.on('unhandledRejection', (e) => unhandled.push(e));
  app = new CubeApp(root, SNAPSHOT, { engine, planner: new StubPlanner() });
  await app.open();
});

const menuItems = (): HTMLElement[] =>
  [...dom.window.document.querySelectorAll('.dc-menu [role="menuitem"], .dc-menu [role="menuitemcheckbox"]')] as HTMLElement[];

/** Right-click a cell showing `text`, then click the entry a person reads as `label`. */
function menu(text: string, label: string): void {
  const cell = [...root.querySelectorAll<HTMLElement>('.dc-cell')]
    .find((c) => c.textContent?.trim().replace(/^[▸▾]/, '').startsWith(text));
  assert.ok(cell, `no cell '${text}'`);
  cell.dispatchEvent(new dom.window.MouseEvent('contextmenu', { bubbles: true }));
  const item = menuItems().find((i) => (i.querySelector('.dc-menu-label')?.textContent ?? i.textContent) === label);
  assert.ok(item, `no entry '${label}': ${menuItems().map((i) => i.textContent).join(' | ')}`);
  item.click();
}

/** The chevron of the group row labelled `label`. */
function chevron(label: string): HTMLElement {
  const row = [...root.querySelectorAll<HTMLElement>('.dc-row')]
    .find((r) => r.querySelector('.dc-tree-label')?.textContent === label);
  assert.ok(row, `no group row '${label}'`);
  return row.querySelector('.dc-chevron') as HTMLElement;
}

/** Each zone of the zone bar and the chips in it, as a person reads them. */
const zoneChips = (): string[] => {
  const zones = [...root.querySelectorAll<HTMLElement>('.dc-zone-bar .dc-zone')];
  assert.ok(zones.length > 0, 'no zones on screen');
  return zones.map((z) => [...z.querySelectorAll('.dc-chip-label')].map((c) => c.textContent?.trim() ?? '').join(','));
};

const busy = (): boolean => root.querySelector('.dc-status-progress')?.classList.contains('dc-busy') ?? false;

describe('a refused change is not a change (B1b)', () => {
  it('leaves no undo step and nothing of itself behind (P2-100)', async () => {
    engine.refuse = 'the engine said no';
    menu('EMEA', 'Ascending');
    await settle();
    assert.deepEqual(app.snapshot.sorts, [], 'the refused sort is gone');
    assert.equal(app.canUndo, false, 'a change that never landed is no step');
    engine.refuse = null;
    menu('EMEA', 'Descending');
    await settle();
    await app.undo();
    await settle();
    assert.deepEqual(app.snapshot.sorts, [], 'undo returns to what was on screen, never to the refused sort');
  });

  it('a refused expand leaves the group closed (P2-101)', async () => {
    engine.refuse = 'the engine said no';
    chevron('EMEA').dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true }));
    chevron('EMEA').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    await settle();
    assert.equal(app.tree.isOpen(['EMEA']), false, 'the tree is as the screen shows it');
  });

  it('a refused zone change puts the zones back (P2-102)', async () => {
    const before = zoneChips();
    engine.refuse = 'the engine said no';
    menu('EMEA', 'Remove Vertical Pivot on region');
    await settle();
    assert.deepEqual(app.snapshot.rows, ['region', 'desk']);
    assert.deepEqual(zoneChips(), before, 'the zones show the cube, not the refused layout');
  });

  it('a presentation change runs no query, so nothing can refuse it (P2-114)', async () => {
    const ran = engine.queries;
    engine.refuse = 'the engine said no';
    await app.applyConfiguration({ columns: { desk: { pinned: 'left' } } });
    await settle();
    assert.equal(engine.queries, ran, 'no query');
    assert.equal(app.configuration.columns['desk']?.pinned, 'left');
    assert.deepEqual(unhandled, [], 'nothing thrown into the void');
  });
});

describe('a group is SET open or closed, never toggled (B1b)', () => {
  it('two quick clicks on a closed group, while the first is still running, leave it open (P2-127)', async () => {
    engine.hold = true;
    const click = (): void => {
      chevron('EMEA').dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true }));
      chevron('EMEA').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    };
    click();
    await settle();
    click(); // the screen still shows EMEA closed: the person asks to OPEN it, again
    await settle();
    engine.hold = false;
    engine.releaseAll();
    await settle();
    assert.equal(app.tree.isOpen(['EMEA']), true);
  });
});

describe('machine re-runs are not steps (B1b)', () => {
  it('opening again (a host re-running the cube) records nothing (P2-99)', async () => {
    await app.open();
    await settle();
    assert.equal(app.canUndo, false);
  });
});

describe('busy is the owner\'s (B1b)', () => {
  it('a superseded run ending does not turn busy off while the newer one runs (P2-104)', async () => {
    engine.hold = true;
    menu('EMEA', 'Ascending');
    await settle();
    const first = engine.held.length;
    assert.ok(first > 0, 'the first change is running');
    menu('EMEA', 'Descending');
    await settle();
    assert.ok(busy());
    for (let i = 0; i < first; i += 1) engine.release(i);
    await settle();
    assert.equal(busy(), true, 'the newer change is still running');
    engine.hold = false;
    engine.releaseAll();
    await settle();
    assert.equal(busy(), false);
  });
});

describe('undo puts back everything it covers (B1b)', () => {
  it('the zones and the title bar come back with the state (P2-108)', async () => {
    const zones = zoneChips();
    menu('EMEA', 'Remove Vertical Pivot on region');
    await settle();
    assert.notDeepEqual(zoneChips(), zones);
    await app.applyConfiguration({ showTitleBar: false });
    await settle();
    assert.equal(root.querySelector('.dc-titlebar')?.classList.contains('dc-collapsed'), true, 'the title bar folds');
    await app.undo();
    await settle();
    assert.equal(root.querySelector('.dc-titlebar')?.classList.contains('dc-collapsed'), false, 'the title bar is back');
    await app.undo();
    await settle();
    assert.deepEqual(app.snapshot.rows, ['region', 'desk']);
    assert.deepEqual(zoneChips(), zones, 'the zones show the state undo went back to');
  });
});

describe('the shortcuts are registered once (B1b)', () => {
  it('after the title bar is rebuilt, one Ctrl-Z is ONE undo step (P2-220)', async () => {
    menu('EMEA', 'Ascending');
    await settle();
    menu('EMEA', 'Descending');
    await settle();
    // each fold rebuilds the title bar
    for (const hidden of [true, false, true, false]) {
      await app.applyConfiguration({ showDragZones: !hidden });
      await settle();
    }
    dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
    await settle();
    assert.deepEqual(app.snapshot.sorts, [{ column: 'region', direction: 'desc' }], 'the sorts were not undone');
    assert.equal(app.configuration.showDragZones, false, 'the last fold was');
  });
});

