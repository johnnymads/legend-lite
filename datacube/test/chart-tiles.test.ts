// The board's charts as a person meets them (plan B1, agreed 2026-09-30): ONE live chart that
// follows the grid, Pin to keep a copy that never follows, Open in grid to take a pinned chart's
// grouping back into the grid and Update it from the live chart.

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import type { ChartView } from '../src/page-document.ts';
import { app, dom, remount, root, settle, setUp } from './cube-fixture.ts';

// the fixture's cube is grouped by region, then desk: the live chart is region across, split by
// desk; taking desk out of the row groups is a pivot it follows
beforeEach(async () => {
  await setUp();
  // jsdom has no canvas: a 2D context that draws nothing, so ECharts can mount and these tests
  // read the tiles' state (drawing is chart-echarts.test.ts's, and the browser harness's)
  const inert: ProxyHandler<object> = {
    get: (_t, key) => (key === 'canvas' ? dom.window.document.createElement('canvas')
      : key === 'measureText' ? () => ({ width: 0 }) : () => undefined),
    set: () => true,
  };
  (dom.window.HTMLCanvasElement.prototype as unknown as { getContext: () => unknown }).getContext =
    () => new Proxy({}, inert);
});

const charts = (): ChartView[] => app.pageViews().views.filter((v): v is ChartView => v.kind === 'chart');
const tile = (id: string): HTMLElement => root.querySelector(`[data-tile="${id}"]`) as HTMLElement;
const shown = (id: string): string[] => [...tile(id).querySelectorAll<HTMLElement>('.dc-tile-actions > *')]
  .filter((el) => !el.hidden).map((el) => el.textContent ?? '');
const click = async (id: string, text: string): Promise<void> => {
  const el = [...tile(id).querySelectorAll<HTMLElement>('.dc-tile-actions > button')].find((b) => b.textContent === text);
  assert.ok(el && !el.hidden, `${id} has a "${text}" button: ${shown(id).join(', ')}`);
  el.click();
  await settle();
};
const live = (): ChartView[] => charts().filter((c) => !c.spec.frozen);

/** Take a column out of the grid's row groups, by its chip's ×. */
async function ungroup(column: string): Promise<void> {
  (root.querySelector(`.dc-zone-rows .dc-chip[data-column="${column}"] .dc-chip-remove`) as HTMLElement).click();
  await settle();
}

describe('one live chart, and pinned copies', () => {
  it('the first chart follows the grid, and says so', async () => {
    app.openChart();
    await settle();
    assert.equal(live().length, 1);
    const id = charts()[0]!.id;
    assert.ok(shown(id).includes('Following the grid'));
    assert.ok(shown(id).includes('Pin'));
    assert.ok(!shown(id).includes('Open in grid'));
  });

  it('Pin keeps a copy that never follows; the live chart still does', async () => {
    app.openChart();
    await settle();
    const liveId = charts()[0]!.id;
    await click(liveId, 'Pin');
    assert.equal(charts().length, 2);
    assert.equal(live().length, 1, 'still exactly one live chart');
    const pinned = charts().find((c) => c.id !== liveId)!;
    assert.equal(pinned.spec.frozen, true);
    assert.ok(shown(pinned.id).includes('Open in grid'));
    assert.ok(!shown(pinned.id).includes('Following the grid'));
    const before = JSON.stringify(pinned.spec);
    assert.equal(pinned.spec.split, 'desk');
    await ungroup('desk');
    assert.equal(JSON.stringify(charts().find((c) => c.id === pinned.id)!.spec), before, 'pivoting never changes a pinned chart');
    assert.equal(live()[0]!.spec.split, undefined, 'the live chart followed the pivot');
  });

  it('asking for another chart while the live one is there pins a copy of it', async () => {
    app.openChart();
    app.openChart();
    await settle();
    assert.deepEqual([charts().length, live().length], [2, 1]);
  });

  it('Open in grid groups the grid the way the chart is; Update puts the re-pivoted chart back', async () => {
    app.openChart();
    await settle();
    const liveId = charts()[0]!.id;
    await click(liveId, 'Pin');
    const pinnedId = charts().find((c) => c.id !== liveId)!.id;
    // the grid moves on
    await ungroup('desk');
    assert.deepEqual(app.snapshot.rows, ['region']);
    // back to the pinned chart's grouping
    await click(pinnedId, 'Open in grid');
    assert.deepEqual(app.snapshot.rows, ['region', 'desk'], 'the grid grouped as the pinned chart is');
    const title = app.pageViews().views.find((v) => v.id === pinnedId)?.title ?? '';
    assert.ok(shown(liveId).includes(`Update ${title}`), `the live chart offers to update it: ${shown(liveId).join(', ')}`);
    assert.ok(shown(liveId).includes('Pin new'));
    // re-pivot there, and update the pinned chart from the live one
    await ungroup('desk');
    await click(liveId, `Update ${title}`);
    const updated = charts().find((c) => c.id === pinnedId)!;
    assert.equal(updated.spec.frozen, true);
    assert.equal(updated.spec.split, undefined, 'the pinned chart took the re-pivoted grouping');
    assert.equal(charts().length, 2, 'updated, not added');
    assert.ok(shown(liveId).includes('Pin'), 'and the live chart is back to Pin');
  });

  it('undo puts the grid back after Open in grid', async () => {
    app.openChart();
    await settle();
    await click(charts()[0]!.id, 'Pin');
    const pinnedId = charts().find((c) => c.spec.frozen)!.id;
    await ungroup('desk');
    await click(pinnedId, 'Open in grid');
    assert.deepEqual(app.snapshot.rows, ['region', 'desk']);
    root.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
    await settle();
    assert.deepEqual(app.snapshot.rows, ['region'], 'undo takes Open in grid back');
  });

  it('a saved page with several live charts opens with one live, the rest pinned', async () => {
    app.openChart();
    await settle();
    const page = app.pageViews();
    const one = page.views.find((v): v is ChartView => v.kind === 'chart')!;
    const two: ChartView = { ...one, id: 'chart-9', title: 'Chart 9' };
    await remount({});
    app.restoreViews({
      views: [...page.views, two],
      layout: { ...page.layout, tiles: [...page.layout.tiles, { id: 'chart-9', x: 6, y: 14, w: 6, h: 10 }] },
    });
    await settle();
    assert.deepEqual([charts().length, live().length], [2, 1]);
  });
});
