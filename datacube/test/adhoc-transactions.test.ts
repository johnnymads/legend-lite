// Leg B / B5a: Ad Hoc Analysis mode under the SAME transaction rules as the cube
// (docs/DATACUBE_LEG_B_STATE_OWNER_2026_09_28.md). The session committed a step before its query
// answered, re-placed answers of another grid, and ran queries Navigate Without Data defers.

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { JSDOM } from 'jsdom';

import { AdHocMode } from '../src/adhoc/mode.ts';
import { buildCube } from '../src/adhoc/outline.ts';
import { AdHocSession, type Run } from '../src/adhoc/session.ts';
import { FormatterCache } from '../src/format.ts';
import { fakeRun, SNAPSHOT } from './adhoc-fixture.ts';

/** The fixture's source, which the test can make FAIL or HOLD. */
class Source {
  calls: string[] = [];
  fail = false;
  hold = false;
  /** Hold every call after this many more (so a zoom's member lookup answers and its step waits). */
  holdAfter: number | null = null;
  #n = 0;
  readonly held: (() => void)[] = [];
  readonly #inner = fakeRun(this.calls);
  readonly run: Run = async (snapshot, scope) => {
    this.#n += 1;
    if (this.holdAfter !== null && this.#n > this.holdAfter) this.hold = true;
    if (this.hold) await new Promise<void>((r) => this.held.push(r));
    if (this.fail) throw new Error('the source said no');
    return this.#inner(snapshot, scope);
  };
  get count(): number {
    return this.#n;
  }
  release(): void {
    this.holdAfter = null;
    this.hold = false;
    for (const r of this.held.splice(0)) r();
  }
}

const cube = () => buildCube(SNAPSHOT, [{ name: 'Time', columns: ['year', 'quarter'] }]);
const labels = (s: AdHocSession): string[] | undefined =>
  s.view?.table.columns[0]?.values.map((v) => String(v).trim());
const values = (s: AdHocSession): readonly unknown[] | undefined => s.view?.table.columns[1]?.values;
const tick = async (n = 20): Promise<void> => {
  for (let i = 0; i < n; i += 1) await new Promise((r) => setTimeout(r, 0));
};

describe('an Ad Hoc step is one transaction (B5a)', () => {
  it('a failed step is not committed: the grid, the POV and the history are as they were (P2-259)', async () => {
    const src = new Source();
    const s = new AdHocSession(cube(), src.run);
    await s.zoomIn('Time', []);
    const depth = s.canUndo;
    src.fail = true;
    await assert.rejects(() => s.setPov('region', ['EMEA']));
    assert.deepEqual(s.grid.pov['region'], [], 'the POV did not move');
    assert.deepEqual(values(s), [75, 35, 40], 'the numbers on screen are the grid\'s');
    assert.equal(s.canUndo, depth);
    src.fail = false;
    await s.setPov('region', ['EMEA']);
    assert.deepEqual(values(s), [30, 30], 'a retry queries the new POV');
  });

  it('turning Navigate Without Data off re-queries a grid changed meanwhile, never re-places old answers (P2-260)', async () => {
    const src = new Source();
    const s = new AdHocSession(cube(), src.run);
    await s.zoomIn('Time', []);
    await s.setOptions({ navigateWithoutData: true });
    await s.setPov('region', ['EMEA']);
    await s.setOptions({ navigateWithoutData: false });
    assert.deepEqual([labels(s), values(s)], [['Time', '2021'], [30, 30]], 'EMEA\'s numbers under the EMEA POV');
  });

  it('an option changed while a step runs is not lost when it lands (P2-261)', async () => {
    const src = new Source();
    const s = new AdHocSession(cube(), src.run);
    await s.zoomIn('Time', []);
    await s.setPov('region', ['EMEA']);
    src.holdAfter = src.count + 1; // the member lookup answers; the step's queries wait
    const zoom = s.zoomIn('Time', ['2021']);
    await tick();
    assert.ok(src.held.length > 0, 'the step is running');
    await s.setOptions({ suppressMissingRows: false });
    src.release();
    await zoom;
    await tick();
    assert.equal(s.grid.options.suppressMissingRows, false);
    assert.ok(labels(s)?.includes('2022'), `the landed view honours the option: ${labels(s)?.join(',')}`);
  });

  it('Undo and Redo with Navigate Without Data on run no query (P2-282)', async () => {
    const src = new Source();
    const s = new AdHocSession(cube(), src.run);
    await s.refresh();
    await s.setOptions({ navigateWithoutData: true });
    await s.zoomIn('Time', []);
    const asked = src.calls.length;
    await s.undo();
    await s.redo();
    assert.equal(src.calls.length, asked, 'no query');
  });
});

describe('Ad Hoc on screen (B5a)', () => {
  let dom: JSDOM;
  let host: HTMLElement;
  let statuses: string[];
  let failures: unknown[];
  beforeEach(() => {
    dom = new JSDOM('<!doctype html><body><div id="m"></div></body>');
    const doc = dom.window.document as unknown as Document;
    host = doc.getElementById('m') as HTMLElement;
    const win = dom.window as unknown as { requestAnimationFrame: unknown };
    win.requestAnimationFrame = (cb: FrameRequestCallback) => { cb(0); return 1; };
    globalThis.requestAnimationFrame = win.requestAnimationFrame as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = () => {};
    statuses = [];
    failures = [];
  });
  const mount = (src: Source): AdHocMode => new AdHocMode(host, new AdHocSession(cube(), src.run), {
    formatters: new FormatterCache(),
    rowHeight: 20,
    showWindow: () => {},
    startTask: () => () => {},
    status: (text) => statuses.push(text),
    reportFailure: (e) => failures.push(e),
    onExit: () => {},
  });

  it('Navigate Without Data: a step says it was not queried, and a real Refresh is not "(not refreshed)" (P2-268)', async () => {
    const src = new Source();
    const mode = mount(src);
    await mode.refresh();
    await mode.session.setOptions({ navigateWithoutData: true });
    // a double-click as a browser reports it, on the cell found again (the first click re-renders it)
    for (const detail of [1, 2]) {
      ([...host.querySelectorAll<HTMLElement>('.dc-cell')].find((c) => c.textContent?.trim() === 'Time')
        ?? assert.fail('no Time cell')).dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, detail }));
    }
    await tick();
    assert.equal(mode.session.grid.rows.length > 0 && mode.session.stale, true,
      `the zoom was taken without data (stale=${mode.session.stale}, statuses: ${statuses.join(' | ')})`);
    assert.match(statuses.at(-1) ?? '', /Navigating without data/, `after a deferred zoom: ${statuses.at(-1)}`);
    await mode.refresh();
    assert.doesNotMatch(statuses.at(-1) ?? '', /not refreshed/, `after a real Refresh: ${statuses.at(-1)}`);
  });

  it('navigating without data, the headers read as the grid on screen: no raw separators (P2-269, pinned: no longer reproduces)', async () => {
    const src = new Source();
    const mode = mount(src);
    const doc = dom.window.document;
    const fire = (el: Element, type: string): void => {
      el.dispatchEvent(new dom.window.MouseEvent(type, { bubbles: true, cancelable: true }));
    };
    const item = (label: string): HTMLElement => [...doc.querySelectorAll<HTMLElement>('[role="menuitem"]')]
      .find((m) => m.querySelector('.dc-menu-label, span')?.textContent === label || m.textContent?.startsWith(label))
      ?? assert.fail(`no menu entry ${label}`);
    const heads = (): string[] => [...host.querySelectorAll<HTMLElement>('.dc-th')].map((h) => h.textContent ?? '');
    const cellOf = (text: string): HTMLElement => [...host.querySelectorAll<HTMLElement>('.dc-cell')]
      .find((c) => c.textContent?.trim() === text) ?? assert.fail(`no cell ${text}`);
    await mode.refresh();
    fire(host.querySelector('.dc-adhoc-pov-chip') as HTMLElement, 'contextmenu');
    item('Move to Rows').click();
    await tick();
    fire(cellOf('Time'), 'contextmenu');
    item('Pivot to Columns').click();
    await tick();
    const top = [...host.querySelectorAll<HTMLElement>('.dc-th')].find((h) => h.textContent === 'Time')
      ?? assert.fail('no Time header');
    fire(top, 'dblclick');
    await tick();
    assert.ok(heads().includes('2021'), `Time is across, zoomed: ${heads().join(' | ')}`);
    await mode.session.setOptions({ navigateWithoutData: true });
    const year = [...host.querySelectorAll<HTMLElement>('.dc-th')].find((h) => h.textContent === '2021')
      ?? assert.fail('no 2021 header');
    // Time off the grid to the POV, without data: the grid now has one column dimension, the
    // view on screen (not refreshed) still two
    fire(year, 'contextmenu');
    item('Pivot to POV').click();
    await tick();
    assert.equal(mode.session.stale, true, 'the step was taken without data');
    assert.equal(heads().some((h) => h.includes('__|__')), false, `raw separators: ${heads().join(' | ')}`);
  });

  it("exiting stops the step in flight: nothing reaches the cube's status or opens an error after (P2-270)", async () => {
    const src = new Source();
    const mode = mount(src);
    await mode.refresh();
    src.hold = true;
    src.fail = true;
    const step = mode.refresh();
    await tick();
    const said = statuses.length;
    mode.destroy();
    src.hold = false;
    src.release();
    await step;
    await tick();
    assert.equal(statuses.length, said, `nothing said after exit: ${statuses.slice(said).join(' | ')}`);
    assert.deepEqual(failures, [], 'no error window for a mode that is gone');
  });
});
