// `bazel run //site:verify`: the one-origin promise, end to end in Chromium, with no server at all --
// a query built and saved in Legend Query (in this browser: query-store's page store, IndexedDB)
// is listed in DataCube's Saved queries on the same origin, says it comes from this browser, and
// opens as a grid with the rows it ran to in Query.
//
// Needs Playwright's Chromium (`bazel run //datacube:install_browser` once).

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Playwright as DataCube's harnesses have it (this package links no npm packages of its own)
const { chromium } = createRequire(fileURLToPath(new URL('../datacube/node_modules/', import.meta.url)))('playwright');

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), 'dist');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm',
  '.pure': 'text/plain', '.sql': 'text/plain', '.json': 'application/json', '.woff2': 'font/woff2',
};
const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url ?? '/', 'http://x');
  const base = pathToFileURL(ROOT.endsWith(sep) ? ROOT : `${ROOT}${sep}`);
  const file = new URL(`.${pathname}`, base);
  try {
    if (!file.href.startsWith(base.href)) throw new Error('outside');
    const path = fileURLToPath(file);
    if (!(await stat(path)).isFile()) throw new Error('not a file');
    res.writeHead(200, { 'Content-Type': TYPES[extname(path)] ?? 'application/octet-stream' });
    res.end(await readFile(path));
  } catch {
    res.writeHead(404).end('not found');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const errors = [];
let failed = false;
const name = `Shared sells ${Date.now().toString(36)}`;
const enc = encodeURIComponent;

try {
  // ---- Legend Query, in this browser: build Trade Id, Side, Quantity where Side = SELL; save it
  const query = await context.newPage();
  query.on('pageerror', (e) => errors.push(`query: ${e.message}`));
  await query.goto(`${ORIGIN}/query/demo/index.html#/extensions/dataspace/${enc('demo:trading:0.0.0')}/${enc('demo::trading::TradingDataSpace')}?class=${enc('demo::trading::Trade')}`);
  await query.waitForSelector('.q-node', { timeout: 90_000 });
  for (const p of ['Trade Id', 'Side', 'Quantity']) await query.dblclick(`.q-node:has-text('${p}')`);
  await query.click(".q-node:has-text('Side')", { button: 'right' });
  await query.click(".q-menu button:has-text('Add as filter condition')");
  await query.selectOption('.q-cond select[aria-label=Side]', 'SELL');
  await query.click('button.q-run');
  await query.waitForFunction(() => /\d+ rows? in \d+ ms/.test(document.querySelector('.q-results-bar')?.textContent ?? ''), undefined, { timeout: 60_000 });
  const ranTo = await query.$$eval('.q-grid tbody tr', (trs) => trs.length);
  await query.click('button[title="Save (Ctrl+S)"]');
  await query.fill('.q-dialog input.q-input', name);
  await query.click('.q-dialog button.primary');
  await query.waitForFunction(() => location.hash.startsWith('#/edit/'), undefined, { timeout: 30_000 });
  console.log(`Query: saved "${name}" in this browser (it ran to ${ranTo} rows)`);

  // ---- DataCube, same origin: its Saved queries list it, from this browser; it opens as a grid
  const cube = await context.newPage();
  cube.on('pageerror', (e) => errors.push(`datacube: ${e.message}`));
  await cube.goto(`${ORIGIN}/datacube/demo/index.html`);
  await cube.waitForSelector('.dc-row', { timeout: 120_000 });
  await cube.click('.dc-titlebar-menu');
  await cube.locator('.dc-menu .dc-menu-item', { has: cube.locator(':scope > .dc-menu-label:text-is("New")') }).hover();
  await cube.locator('.dc-menu .dc-menu-item', { has: cube.locator(':scope > .dc-menu-label:text-is("Data Source…")') }).click();
  await cube.locator('.dc-picker-tab[data-section="saved"]').click();
  const row = cube.locator('.dc-picker-row[data-query]', { hasText: name });
  await row.waitFor({ timeout: 15_000 });
  const said = (await cube.textContent('.dc-picker-body')) ?? '';
  if (!/Saved in this browser/.test(said)) throw new Error(`the picker does not say the list is this browser's: ${said.slice(0, 200)}`);
  await row.click();
  await cube.locator('.dc-picker').waitFor({ state: 'detached', timeout: 60_000 });
  const tile = cube.locator('[data-tile^="grid-"]').last();
  await tile.locator('.dc-row').first().waitFor({ timeout: 60_000 });
  const cols = (await tile.locator('.dc-th').allTextContents()).map((t) => t.trim());
  const sides = await tile.locator('.dc-row').evaluateAll((rows) => rows.map((r) => r.querySelectorAll('.dc-cell')[1]?.textContent?.trim()));
  if (cols.join() !== 'Trade Id,Side,Quantity') throw new Error(`DataCube shows columns ${cols.join(', ')}`);
  if (sides.length !== ranTo || sides.some((s) => s !== 'SELL')) throw new Error(`DataCube shows ${JSON.stringify(sides)}, Query ran to ${ranTo} SELL rows`);
  console.log(`DataCube: listed from this browser, opened as a grid of ${sides.length} rows, Side as SELL`);
} catch (e) {
  failed = true;
  console.log(`FAIL: ${String(e.message ?? e).split('\n')[0]}`);
} finally {
  await browser.close();
  server.close();
}
if (errors.length) {
  failed = true;
  console.log(`page errors: ${errors.join(' | ')}`);
}
console.log(failed ? '\n!!! the apps do not share their saved queries !!!' : '\n*** saved in Query, opened in DataCube: one origin, no server ***');
process.exit(failed ? 1 : 0);
