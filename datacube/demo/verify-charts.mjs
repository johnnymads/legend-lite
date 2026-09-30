// The board's charts in a real browser (plan B1, agreed 2026-09-30): ONE live chart that follows
// the grid, Pin to keep a copy that never follows, Open in grid to take a pinned chart's grouping
// back into the grid, and Update it from the live chart -- drawn by real ECharts on the demo page.
//
//   bazel run //datacube:verify_charts            (SHOTS=<dir> also saves a screenshot)

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

import { servedPath } from './static-files.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm',
  '.pure': 'text/plain', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2',
};
const server = createServer(async (req, res) => {
  const file = servedPath(ROOT, req.url);
  try {
    if (!file) throw new Error('not under the root');
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404).end('not found'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const { port } = server.address();

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

const results = [];
async function check(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true });
    console.log(`  ok   ${name}${detail ? ` — ${detail}` : ''}`);
  } catch (e) {
    results.push({ name, ok: false });
    console.log(`  BAD  ${name} — ${String(e.message ?? e).split('\n').slice(0, 4).join(' | ')}`);
  }
}

/** Until the cube is not busy and has told the page of no change for a moment. */
async function settle() {
  await page.evaluate(() => { window.__settleWatch = undefined; });
  await page.waitForFunction(() => {
    const signal = window.__dataCubeSignal;
    const app = window.__dataCube;
    if (!signal || !app) return false;
    const now = performance.now();
    const w = (window.__settleWatch ??= { changes: signal.changes, since: now });
    if (app.busy || signal.printing > 0 || signal.changes !== w.changes) {
      w.changes = signal.changes;
      w.since = now;
      return false;
    }
    return now - w.since >= 400;
  }, null, { timeout: 30_000 });
}

const charts = () => page.evaluate(() => window.__dataCube.pageViews().views.filter((v) => v.kind === 'chart')
  .map((v) => ({ id: v.id, title: v.title, pinned: v.spec.frozen === true, x: v.spec.x, split: v.spec.split ?? null })));
const rows = () => page.evaluate(() => [...window.__dataCube.snapshot.rows]);
const button = (id, text) => page.locator(`[data-tile="${id}"] .dc-tile-actions > button:visible`, { hasText: text }).first();
/** Every chart tile has drawn a canvas with something on it. */
async function drawn() {
  await page.waitForFunction(() => [...document.querySelectorAll('[data-tile^="chart-"]')]
    .every((t) => t.querySelector('.dc-chartpanel-chart canvas')), null, { timeout: 20_000 });
}

try {
  await page.goto(`http://127.0.0.1:${port}/demo/index.html`);
  await page.waitForSelector('.dc-row', { timeout: 120_000 });
  await settle();
  const before = await rows();

  await check('the first chart follows the grid, badged so', async () => {
    await page.locator('.dc-row').nth(1).locator('.dc-cell').nth(2).click({ button: 'right' });
    await page.locator('.dc-menu-item:has(> .dc-menu-label:text-is("Chart..."))').first().click();
    await settle();
    await drawn();
    const list = await charts();
    if (list.length !== 1 || list[0].pinned) throw new Error(JSON.stringify(list));
    await page.locator(`[data-tile="${list[0].id}"] .dc-tile-badge:visible`, { hasText: 'Following the grid' }).waitFor();
    return `${list[0].title}: ${list[0].x} by ${list[0].split}`;
  });

  await check('Pin keeps a copy; pivoting the grid changes the live chart and not the copy', async () => {
    const [live] = await charts();
    await button(live.id, 'Pin').click();
    await settle();
    await drawn();
    const pinned = (await charts()).find((c) => c.pinned);
    if (!pinned) throw new Error('no pinned chart');
    // take the second row group out: the live chart follows, the pinned one keeps its split
    const second = before[1];
    await page.locator(`.dc-zone-rows .dc-chip[data-column="${second}"] .dc-chip-remove`).first().click();
    await settle();
    const after = await charts();
    const nowPinned = after.find((c) => c.id === pinned.id);
    const nowLive = after.find((c) => !c.pinned);
    if (nowPinned.split !== pinned.split) throw new Error(`the pinned chart changed: ${pinned.split} -> ${nowPinned.split}`);
    if (nowLive.split === pinned.split) throw new Error(`the live chart did not follow: still ${nowLive.split}`);
    if (after.filter((c) => !c.pinned).length !== 1) throw new Error('not exactly one live chart');
    return `pinned keeps split ${pinned.split}; live now ${nowLive.split}`;
  });

  await check('Open in grid groups the grid as the pinned chart is; Update puts it back re-pivoted', async () => {
    const pinned = (await charts()).find((c) => c.pinned);
    const live = (await charts()).find((c) => !c.pinned);
    await button(pinned.id, 'Open in grid').click();
    await settle();
    const r = await rows();
    const want = [pinned.x, ...(pinned.split ? [pinned.split] : [])];
    if (JSON.stringify(r) !== JSON.stringify(want)) throw new Error(`grid rows ${r}, want ${want}`);
    const update = button(live.id, `Update ${pinned.title}`);
    await update.waitFor({ timeout: 5_000 });
    // re-pivot in the grid, then update the pinned chart from the live one
    await page.locator(`.dc-zone-rows .dc-chip[data-column="${pinned.split}"] .dc-chip-remove`).first().click();
    await settle();
    await update.click();
    await settle();
    const after = (await charts()).find((c) => c.id === pinned.id);
    if (!after.pinned || after.split !== null) throw new Error(`the pinned chart is ${JSON.stringify(after)}`);
    if ((await charts()).length !== 2) throw new Error('Update added a chart');
    // after the charts' own grow-in animation, so the bars are at their values
    if (process.env.SHOTS) { await page.waitForTimeout(1500); await page.screenshot({ path: `${process.env.SHOTS}/charts.png` }); }
    return `${pinned.title} updated to ${after.x}, no split`;
  });

  await check('no page errors', async () => {
    if (pageErrors.length) throw new Error(pageErrors.slice(0, 2).join(' | '));
  });
} finally {
  await browser.close();
  server.close();
}

const bad = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - bad}/${results.length} chart checks work`);
process.exit(bad ? 1 : 0);
