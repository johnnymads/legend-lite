// Leg B through the APP (docs/DATACUBE_LEG_B_STATE_OWNER_2026_09_28.md, B1b): a change is one
// transaction on the cube's one state owner. Each test is an audit entry reproduced the way a person
// meets it -- a menu entry, a chevron, a setting -- over an engine the test can refuse or hold.

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { JSDOM } from 'jsdom';

import { CubeApp } from '../src/app.ts';
import { CubeController } from '../src/cube.ts';
import { TreeState } from '../src/tree.ts';
import type { Planner } from '../src/cube.ts';
import type { Plan, PlanColumn } from '../src/relation-type.ts';
import type { ResultTable } from '../src/result.ts';
import type { CubeSnapshot } from '../src/snapshot.ts';
import { DEFAULT_CONFIGURATION } from '../src/config.ts';
import { setHeaderDrag } from '../src/ui/pivot-panel.ts';
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
  /** Answer with an extra column `n`: which query this was, so two answers can be told apart. */
  tag = false;
  readonly held: (() => void)[] = [];
  async answer(_sql: string, epoch: number): Promise<ResultTable> {
    this.queries += 1;
    const n = this.queries;
    const tagged = this.tag;
    if (this.hold) await new Promise<void>((r) => this.held.push(r));
    if (this.refuse !== null) throw new Error(this.refuse);
    return {
      columns: [
        { name: 'region', type: 'String', values: ['EMEA', 'AMER'] },
        { name: 'desk', type: 'String', values: ['A', 'B'] },
        { name: 'total', type: 'Float', values: [600, 400] },
        ...(tagged ? [{ name: 'n', type: 'Integer', values: [n, n] }] : []),
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
let statuses: [string, string][];

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
  statuses = [];
  app = new CubeApp(root, SNAPSHOT, { engine, planner: new StubPlanner(),
    onStatus: (text, kind) => statuses.push([text, kind]) });
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
/** A group's label is its value, with its child count when the tree shows one: `EMEA (2)`. */
const groupRow = (label: string): HTMLElement | undefined => [...root.querySelectorAll<HTMLElement>('.dc-row')]
  .find((r) => (r.querySelector('.dc-tree-label')?.textContent ?? '').replace(/ \(\d+\)$/, '') === label);

function chevron(label: string): HTMLElement {
  const row = groupRow(label);
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

describe('a whole gesture is one change (B1c)', () => {
  it('a chip dragged from Row Groups to Column Labels is ONE change: refused, it names one (P2-103)', async () => {
    const zones = zoneChips();
    engine.refuse = 'the engine said no';
    setHeaderDrag({ column: 'desk', from: 'rows' });
    (root.querySelector('.dc-app-side .dc-zone-columns') as HTMLElement)
      .dispatchEvent(new dom.window.MouseEvent('drop', { bubbles: true, cancelable: true }));
    await settle();
    assert.deepEqual([app.snapshot.rows, app.snapshot.pivotOn], [['region', 'desk'], []], 'the cube as it was');
    assert.deepEqual(zoneChips(), zones);
    assert.equal(statuses.some(([t]) => /changes were undone/.test(t)), false,
      `one gesture, one change: ${statuses.map(([t]) => t).join(' | ')}`);
    engine.refuse = null;
    setHeaderDrag({ column: 'desk', from: 'rows' });
    (root.querySelector('.dc-app-side .dc-zone-columns') as HTMLElement)
      .dispatchEvent(new dom.window.MouseEvent('drop', { bubbles: true, cancelable: true }));
    await settle();
    assert.deepEqual([app.snapshot.rows, app.snapshot.pivotOn], [['region'], ['desk']]);
    await app.undo();
    await settle();
    assert.deepEqual([app.snapshot.rows, app.snapshot.pivotOn], [['region', 'desk'], []], 'one undo takes the whole move back');
  });
});

describe('what is read off the rows on screen reads the state ON SCREEN (B1c)', () => {
  it('a right-click while a regroup runs names the column the clicked row belongs to (P2-110)', async () => {
    engine.hold = true;
    menu('EMEA', 'Remove Vertical Pivot on region');
    await settle();
    assert.deepEqual(app.snapshot.rows, ['desk'], 'the regroup is pending');
    const cell = [...root.querySelectorAll<HTMLElement>('.dc-cell')]
      .find((c) => c.textContent?.trim().replace(/^[▸▾]/, '') === 'EMEA');
    assert.ok(cell, 'EMEA is still on screen');
    cell.dispatchEvent(new dom.window.MouseEvent('contextmenu', { bubbles: true }));
    const labels = menuItems().map((i) => i.querySelector('.dc-menu-label')?.textContent ?? '');
    assert.ok(labels.includes("Add Filter: region = 'EMEA'"), labels.filter((l) => l.startsWith('Add Filter')).join(' | '));
    engine.hold = false;
    engine.releaseAll();
    await settle();
  });
});

describe('a Properties Apply is ONE transaction, the tree included (P2-169)', () => {
  const overlay = (): HTMLElement => root.querySelector('.dc-app-overlay') as HTMLElement;
  const tab = (name: string): void => {
    ([...overlay().querySelectorAll<HTMLElement>('.dc-editor-tab')].find((b) => b.textContent === name)
      ?? assert.fail(`no tab ${name}`)).dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  };
  const apply = (): void => {
    ([...overlay().querySelectorAll<HTMLButtonElement>('.dc-editor-footer button')]
      .find((b) => b.textContent === 'Apply') ?? assert.fail('no Apply')).click();
  };
  /** Sort by desk, and flip "Show root aggregation", in ONE Apply. */
  const edit = (): boolean => {
    app.openEditor();
    tab('Sorts');
    const desk = [...overlay().querySelectorAll<HTMLElement>('.dc-pane-available .dc-selector-row')]
      .find((r) => r.dataset['column'] === 'desk') ?? assert.fail('no desk to sort by');
    desk.dispatchEvent(new dom.window.MouseEvent('dblclick', { bubbles: true }));
    tab('General Properties');
    const root$ = [...overlay().querySelectorAll<HTMLElement>('.dc-check')]
      .find((l) => l.textContent === 'Show root aggregation')?.querySelector('input') ?? assert.fail('no root toggle');
    root$.checked = !root$.checked;
    root$.dispatchEvent(new dom.window.Event('change'));
    apply();
    return root$.checked;
  };

  it('lands with every edit: the sort AND the root total (the tree\'s own refresh used to land the old snapshot over the draft)', async () => {
    const showTotals = edit();
    await settle();
    assert.deepEqual(app.snapshot.sorts.map((x) => x.column), ['desk'], 'the draft\'s sort survived');
    assert.equal(app.tree.showTotals, showTotals, 'and the root total changed with it');
    await app.undo();
    await settle();
    assert.deepEqual(app.snapshot.sorts, [], 'one undo takes the whole Apply back');
    assert.equal(app.tree.showTotals, !showTotals);
  });

  it('refused, nothing of it stays: not the sort, not the root total', async () => {
    const before = app.tree.showTotals;
    engine.refuse = 'the engine said no';
    edit();
    await settle();
    assert.deepEqual(app.snapshot.sorts, []);
    assert.equal(app.tree.showTotals, before);
    assert.equal(app.configuration.showRootAggregation, before);
  });
});

describe('history through the app (B2)', () => {
  const sort = async (label: 'Ascending' | 'Descending'): Promise<void> => {
    menu('EMEA', label);
    await settle();
  };
  const ctrlZ = (): void => {
    dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
  };

  it('a change made while an Undo runs: no mixed state, and undo goes back to where it was made (P2-106)', async () => {
    await sort('Ascending');
    engine.hold = true;
    void app.undo();
    await settle();
    assert.deepEqual(app.snapshot.sorts, [], 'the undo is on screen, pending');
    menu('EMEA', 'Remove Vertical Pivot on region');
    await settle();
    engine.hold = false;
    engine.releaseAll();
    await settle();
    assert.deepEqual([app.snapshot.rows, app.snapshot.sorts], [['desk'], []], 'the undo AND the change landed');
    assert.equal(app.canRedo, false, 'a new change ends the redo branch, as always');
    await app.undo();
    await settle();
    assert.deepEqual([app.snapshot.rows, app.snapshot.sorts], [['region', 'desk'], []],
      'undo returns to the state the change was made on, never to the undone sort');
  });

  it('two quick Ctrl-Z while the first runs are two steps, each to a state that was on screen (P2-107)', async () => {
    await sort('Ascending');
    await sort('Descending');
    engine.hold = true;
    ctrlZ();
    await settle();
    ctrlZ();
    await settle();
    engine.hold = false;
    engine.releaseAll();
    await settle();
    assert.deepEqual(app.snapshot.sorts, [], 'two presses, two steps');
    await app.redo();
    await settle();
    assert.deepEqual(app.snapshot.sorts, [{ column: 'region', direction: 'asc' }], 'redo walks them back in order');
  });

  it('collapsing a group opened by the expand level is a step, and undo opens it again (P2-109)', async () => {
    app.dispose();
    root.replaceChildren();
    app = new CubeApp(root, SNAPSHOT, { engine, planner: new StubPlanner(),
      configuration: { ...DEFAULT_CONFIGURATION, initialExpandToLevel: 1 } });
    await app.open();
    await settle();
    assert.equal(groupRow('EMEA')?.getAttribute('aria-expanded'), 'true', 'opened by the expand level');
    chevron('EMEA').dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true }));
    chevron('EMEA').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    await settle();
    assert.equal(app.tree.isOpen(['EMEA']), false);
    assert.equal(app.canUndo, true, 'a collapse from the expand level is a change');
    await app.undo();
    await settle();
    assert.equal(app.tree.isOpen(['EMEA']), true, 'undone');
  });

  it('Settings > Max History Stack Size takes effect at once', async () => {
    app.openSettings();
    const input = root.querySelector('[data-setting="dataCube.editor.maxHistoryStackSize"] input') as HTMLInputElement;
    input.value = '10';
    input.dispatchEvent(new dom.window.Event('change'));
    ([...root.querySelectorAll('button')].find((b) => b.textContent === 'OK') ?? assert.fail('no OK')).click();
    for (let i = 0; i < 12; i += 1) {
      await app.applyConfiguration({ reportTitle: `title ${i}` });
    }
    assert.equal(app.state.historyDepth.past, 10);
  });

  it('the menu offers Redo only when there is one to take', async () => {
    const redo = (): HTMLElement | undefined => {
      (root.querySelector('.dc-titlebar-menu') as HTMLElement).dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
      const item = [...dom.window.document.querySelectorAll<HTMLElement>('.dc-menu .dc-menu-item')]
        .find((el) => el.querySelector('.dc-menu-label')?.textContent === 'Redo');
      (root.querySelector('.dc-titlebar-menu') as HTMLElement).dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
      return item;
    };
    await sort('Ascending');
    assert.equal(redo()?.getAttribute('aria-disabled'), 'true', 'nothing to redo');
    await app.undo();
    await settle();
    assert.notEqual(redo()?.getAttribute('aria-disabled'), 'true', 'one to redo');
    await sort('Descending');
    assert.equal(redo()?.getAttribute('aria-disabled'), 'true', 'a new change ended it');
  });
});

describe('lifecycle (B3)', () => {
  it('a disposed cube stops: its query is cancelled and nothing reaches the host after (P2-105)', async () => {
    const heard: string[] = [];
    app.dispose();
    root.replaceChildren();
    app = new CubeApp(root, SNAPSHOT, { engine, planner: new StubPlanner(),
      onView: () => heard.push('view'), onChange: () => heard.push('change'),
      onStatus: (text) => heard.push(`status ${text}`) });
    await app.open();
    await settle();
    engine.hold = true;
    menu('EMEA', 'Ascending');
    await settle();
    heard.length = 0;
    app.dispose();
    engine.hold = false;
    engine.releaseAll();
    await settle();
    assert.deepEqual(heard, [], 'a late answer reached the host of a cube it no longer has');
    assert.equal(app.state.busy, false, 'the change in flight was cancelled');
    dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
    await settle();
    assert.deepEqual(heard, [], 'and its shortcuts are gone');
  });

  it('two drill-throughs: the LATER one is shown, however the answers arrive (P2-131)', async () => {
    const cell = (text: string): HTMLElement => [...root.querySelectorAll<HTMLElement>('.dc-cell')]
      .find((c) => c.textContent?.trim().replace(/^[▸▾]/, '').startsWith(text)) ?? assert.fail(`no cell ${text}`);
    // a cell is focused by a click and ACTIVATED by Enter: that is the drill
    const drill = (text: string): void => {
      cell(text).dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, detail: 1 }));
      (root.querySelector('.dc-app-grid .dc-grid') ?? root.querySelector('.dc-app-grid') as Element)
        .dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    };
    engine.hold = true;
    engine.tag = true;
    const before = engine.queries;
    drill('EMEA');
    await settle();
    drill('AMER');
    await settle();
    assert.equal(engine.held.length, 2, `two drills asked (${engine.queries - before} queries)`);
    const second = engine.queries;
    engine.release(1);
    await settle();
    engine.release(0);
    await settle();
    engine.hold = false;
    engine.tag = false;
    const shown = root.querySelector('.dc-drill')?.textContent ?? '';
    assert.match(shown, new RegExp(`\\b${second}\\b`), `the later drill's rows: ${shown}`);
  });

  it('Escape in a text field stays in the field: the window and its draft stay (P2-221)', async () => {
    app.openEditor();
    const win = root.querySelector('[data-window="Properties"]') as HTMLElement;
    assert.ok(win, 'the Properties window');
    ([...win.querySelectorAll<HTMLElement>('.dc-editor-tab')].find((t) => t.textContent === 'General Properties')
      ?? assert.fail('no General tab')).dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    const field = win.querySelector<HTMLInputElement>('input[type="text"], input:not([type])')
      ?? assert.fail('no text field in the Properties window');
    field.value = 'a draft';
    field.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.ok(root.querySelector('[data-window="Properties"]:not([hidden])'), 'the window is still open');
    assert.equal(field.value, 'a draft', 'and the draft with it');
    win.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(root.querySelector('[data-window="Properties"]:not([hidden])'), null, 'Escape on the window itself closes it');
  });
});

describe('a compile refusal is RETURNED, never thrown (B4, P2-152)', () => {
  it('pivoting on a JSON column: compile answers with the refusal', async () => {
    const c = new CubeController(new GateEngine(), new StubPlanner());
    const snapshot: CubeSnapshot = { ...SNAPSHOT, columns: [...SNAPSHOT.columns, { name: 'meta', type: 'Variant' }],
      rows: ['region'], pivotOn: ['meta'] };
    const out = await c.compile({ snapshot, tree: TreeState.empty() }, null);
    assert.match(out?.refusal ?? '', /holds JSON/);
  });
});

describe('the Filters window works on the LIVE filter (B4, P2-144)', () => {
  const filtersWindow = (): HTMLElement | null => root.querySelector('[data-window="Filters"]:not([hidden])');
  const ok = (): void => {
    ([...(filtersWindow() ?? assert.fail('no Filters window')).querySelectorAll<HTMLButtonElement>('button')]
      .find((b) => b.textContent === 'OK') ?? assert.fail('no OK')).click();
  };

  it('unedited, it shows a filter added elsewhere', async () => {
    app.openFilters();
    menu('EMEA', "Add Filter: region = 'EMEA'");
    await settle();
    const shown = [...(filtersWindow() ?? assert.fail('closed')).querySelectorAll<HTMLInputElement>('input')].map((i) => i.value);
    assert.ok(shown.includes('EMEA'), `the window shows the cube's filter: ${shown.join(' | ')}`);
  });

  const valueInput = (v: string): HTMLInputElement =>
    [...(filtersWindow() ?? assert.fail('closed')).querySelectorAll<HTMLInputElement>('input')]
      .find((x) => x.value === v) ?? assert.fail(`no ${v} value in the window`);
  const values = (): string[] => {
    const f = app.snapshot.filter;
    const all = f === undefined ? [] : f.kind === 'condition' ? [f] : 'children' in f ? f.children : [f];
    return all.map((c) => ('value' in c ? String(c.value) : '?'));
  };

  it('the audit\'s case: a condition added elsewhere, THEN an edit here -- OK keeps both', async () => {
    menu('EMEA', "Add Filter: region = 'EMEA'");
    await settle();
    app.openFilters();
    menu('AMER', "Add Filter: region != 'AMER'");
    await settle();
    const value = valueInput('EMEA');
    value.value = 'APAC';
    value.dispatchEvent(new dom.window.Event('change'));
    ok();
    await settle();
    assert.deepEqual(values(), ['APAC', 'AMER'], 'the edit landed on the filter the cube had');
    assert.equal(filtersWindow(), null);
  });

  it('an edit here, THEN a condition added elsewhere: OK says so instead of dropping it; a second OK replaces it', async () => {
    menu('EMEA', "Add Filter: region = 'EMEA'");
    await settle();
    app.openFilters();
    const value = valueInput('EMEA');
    value.value = 'APAC';
    value.dispatchEvent(new dom.window.Event('change'));
    menu('AMER', "Add Filter: region != 'AMER'");
    await settle();
    ok();
    await settle();
    assert.deepEqual(values(), ['EMEA', 'AMER'], 'the condition added elsewhere is still there');
    assert.ok(filtersWindow(), 'the window stays open, the edit kept');
    assert.match(filtersWindow()?.textContent ?? '', /changed while this window was open/);
    ok();
    await settle();
    assert.deepEqual(values(), ['APAC'], 'the second OK replaces it, knowingly');
    assert.equal(filtersWindow(), null);
  });
});

