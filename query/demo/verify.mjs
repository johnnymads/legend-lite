// `bazel run //query:verify`: the Query app end to end in a real browser (Chromium, headless), in
// both places queries run: IN THE BROWSER (the tab's planner writes the SQL, DuckDB-WASM runs it,
// saved queries in IndexedDB -- no server) and ON legend-lite's SERVER (it executes and keeps saved
// queries; started here with an empty store). The same steps, each asserting what a person would
// see -- rows, not "a request was made". Exit code 0 when every step holds in both.
//
// Needs `java` on the PATH and Playwright's Chromium (`npx playwright install chromium` once).

import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const JAR = process.env.LEGEND_LITE_JAR ?? resolve(ROOT, '..', 'core', 'server_deploy.jar');
const ENGINE_PORT = 18090 + Math.floor(Math.random() * 500);
const SITE_PORT = ENGINE_PORT + 1000;

// everything this writes (the server's store, failure screenshots) stays in the checkout, under .scratch/
const OUT = join(process.env.BUILD_WORKSPACE_DIRECTORY ?? resolve(ROOT, '..'), '.scratch', 'verify');
mkdirSync(OUT, { recursive: true });
const store = mkdtempSync(join(OUT, 'run-'));

// ---- legend-lite's server, for the server mode
const engine = spawn('java', ['-jar', JAR, String(ENGINE_PORT), '--query-store', store], {
  env: process.env,
  stdio: ['ignore', 'pipe', 'pipe'],
});
let engineLog = '';
engine.stdout.on('data', (d) => { engineLog += d; });
engine.stderr.on('data', (d) => { engineLog += d; });

// ---- the site; config-server.json points at that server
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm',
  '.json': 'application/json', '.pure': 'text/plain', '.sql': 'text/plain',
};
const site = createServer(async (req, res) => {
  const { pathname } = new URL(req.url ?? '/', 'http://x');
  try {
    if (pathname === '/demo/config-server.json') {
      const config = JSON.parse(await readFile(join(ROOT, 'demo', 'config-server.json'), 'utf8'));
      config.execution.engine = `http://127.0.0.1:${ENGINE_PORT}/api`;
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(config));
      return;
    }
    const base = pathToFileURL(ROOT + sep);
    const file = fileURLToPath(new URL(`.${pathname}`, base));
    if (!file.startsWith(ROOT)) throw new Error('outside');
    await stat(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(await readFile(file));
  } catch {
    res.writeHead(404).end();
  }
}).listen(SITE_PORT, '127.0.0.1');

async function waitForEngine() {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${ENGINE_PORT}/health`)).ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`the engine did not start:\n${engineLog}`);
}

const PAGE = `http://127.0.0.1:${SITE_PORT}/demo/index.html`;
const GAV = encodeURIComponent('demo:trading:0.0.0');
const enc = encodeURIComponent;
let browser;
let failures = 0;

/** Run, and wait for what it shows: rows or objects ("n rows in", "n objects in"), or an error. */
async function run(page) {
  await page.click('text=▶ Run');
  await page.waitForFunction(() => document.querySelector('.q-error-box')
    || /\d+ (rows?|objects?) in \d+ ms/.test(document.querySelector('.q-results-bar')?.textContent ?? ''), undefined, { timeout: 30000 });
  const error = await page.$('.q-error-box');
  if (error) throw new Error(`the run failed: ${await error.textContent()}`);
}

/** The rows the plain grid shows, each its cells' text. */
async function gridRows(page) {
  return page.$$eval('.q-grid tbody tr', (trs) => trs.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent)));
}

/** The rows a results DataCube shows, each its cells' text. */
async function cubeRows(page) {
  return page.$$eval('.q-cube .dc-row', (rows) => rows.map((r) => [...r.querySelectorAll('.dc-cell')].map((c) => c.textContent?.trim())));
}

/** Every step, on the page `query` configures (`''`: in the browser; `?config=...`: elsewhere). */
async function suite(title, query) {
  console.log(`\n${title}:`);
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const app = (hash = '') => `${PAGE}${query}${hash}`;
  const step = async (name, fn) => {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    try {
      await fn(page);
      assert.deepEqual(errors, [], 'no page errors');
      console.log(`  ✔ ${name}`);
    } catch (e) {
      failures++;
      console.log(`  ✖ ${name}\n    ${String(e.message).split('\n').join('\n    ')}`);
      await page.screenshot({ path: join(store, `${title.replace(/\W+/g, '-')}--${name.replace(/\W+/g, '-')}.png`) });
    } finally {
      await page.close();
    }
  };

  await step('the landing page lists the data space, classes and services', async (page) => {
    await page.goto(app());
    await page.waitForSelector('.q-card', { timeout: 60000 });
    assert.match(await page.textContent('.q-landing'), /Trading[\s\S]*Firm[\s\S]*Trade[\s\S]*ExecutedEquityTrades/);
  });

  await step('the data space viewer shows its curated queries and documentation', async (page) => {
    await page.goto(app(`#/dataspace/${GAV}/${enc('demo::trading::TradingDataSpace')}`));
    await page.waitForSelector('text=Quick start', { timeout: 60000 });
    assert.equal(await page.locator('.q-card').count(), 3);
    await page.waitForFunction(() => document.querySelector('.q-card pre')?.textContent?.includes('project'));
    assert.match(await page.textContent('.q-ds'), /Models documentation[\s\S]*Firm[\s\S]*Registered legal name/);
  });

  let savedHash;
  await step('build, filter, run, save and reopen a query', async (page) => {
    await page.goto(app(`#/extensions/dataspace/${GAV}/${enc('demo::trading::TradingDataSpace')}?class=${enc('demo::trading::Trade')}`));
    await page.waitForSelector('.q-node', { timeout: 60000 });
    for (const p of ['Trade Id', 'Side', 'Quantity']) await page.dblclick(`.q-node:has-text('${p}')`);
    await run(page);
    assert.equal((await gridRows(page)).length, 12);
    await page.click(".q-node:has-text('Side')", { button: 'right' });
    await page.click(".q-menu button:has-text('Add as filter condition')");
    await page.selectOption('.q-cond select[aria-label=Side]', 'SELL');
    await run(page);
    const rows = await gridRows(page);
    assert.equal(rows.length, 5);
    assert.ok(rows.every((r) => r[1] === 'SELL'));
    await page.click('.q-header button.primary:text-is("Save")');
    await page.fill('.q-dialog input.q-input', 'Sells');
    await page.click('.q-dialog button.primary');
    await page.waitForFunction(() => location.hash.startsWith('#/edit/'));
    savedHash = await page.evaluate(() => location.hash);
    await page.reload();
    await page.waitForSelector('.q-cond', { timeout: 60000 });
    assert.equal(await page.inputValue('.q-col input'), 'Trade Id');
    assert.equal(await page.locator('.q-chip:has-text("unsaved")').count(), 0);
    await run(page);
    assert.equal((await gridRows(page)).length, 5);
  });

  await step('the query store: search finds it, history holds each version', async (page) => {
    await page.goto(app(savedHash));
    await page.waitForSelector('.q-cond', { timeout: 60000 });
    await page.fill('.q-col input', 'Id');
    await page.press('.q-col input', 'Tab');
    await page.click('.q-header button.primary:text-is("Save")');
    await page.waitForSelector('.q-toast:has-text("version 2")');
    await page.click('text=More ▾');
    await page.click(".q-menu button:has-text('History and versions')");
    await page.waitForSelector('.q-dialog :text("Compare")');
    assert.match(await page.textContent('.q-dialog pre'), /- .*'Trade Id'[\s\S]*\+ .*Id:/);
    await page.goto(app());
    await page.waitForSelector('.q-list-row:has-text("Sells")', { timeout: 60000 });
  });

  await step("a data space's curated query opens in the form and runs", async (page) => {
    await page.goto(app(`#/extensions/dataspace/${GAV}/${enc('demo::trading::TradingDataSpace')}/template/by_firm`));
    await page.waitForSelector('.q-col', { timeout: 60000 });
    assert.equal(await page.textContent('.q-col .q-btn.primary'), 'count');
    await run(page);
    assert.equal((await gridRows(page)).length, 5);
  });

  await step('a parameter: required before running, then bound', async (page) => {
    await page.goto(app(`#/create/manual/${GAV}/${enc('demo::trading::TradingMapping')}/${enc('demo::trading::Runtime')}?class=${enc('demo::trading::Trade')}`));
    await page.waitForSelector('.q-node', { timeout: 60000 });
    await page.dblclick(".q-node:has-text('Trade Id')");
    await page.click(".q-node:has-text('Quantity')", { button: 'right' });
    await page.click(".q-menu button:has-text('Add as filter condition')");
    await page.selectOption('.q-cond select[aria-label=Operator]', 'greaterThan');
    await page.click('text=+ Add');
    await page.fill('.q-dialog input.q-input', 'minQty');
    await page.selectOption('.q-dialog select.q-select >> nth=0', 'Integer');
    await page.click('.q-dialog button.primary');
    await page.click(".q-cond button[title='Parameters and relative values']");
    await page.click(".q-menu button:has-text('Use parameter')");
    await page.click('text=▶ Run');
    await page.waitForSelector('.q-toast:has-text("Set a value for $minQty")');
    await page.fill('.q-side input[aria-label=Value]', '1000000');
    await page.press('.q-side input[aria-label=Value]', 'Tab');
    await run(page);
    assert.equal((await gridRows(page)).length, 6);
  });

  await step('DataCube shows the rows, and groups them on the same planner', async (page) => {
    await page.goto(app(`#/extensions/dataspace/${GAV}/${enc('demo::trading::TradingDataSpace')}?class=${enc('demo::trading::Trade')}`));
    await page.waitForSelector('.q-node', { timeout: 60000 });
    for (const p of ['Trade Id', 'Side', 'Quantity']) await page.dblclick(`.q-node:has-text('${p}')`);
    await run(page);
    assert.equal((await gridRows(page)).length, 12);
    await page.click('.q-results-bar button.q-tab:text-is("DataCube")');
    await page.waitForFunction(() => document.querySelectorAll('.q-cube .dc-row').length === 12, undefined, { timeout: 30000 });
    // the grid alone: no title bar, drag zones, columns panel or status bar
    assert.equal(await page.locator('.q-cube .dc-titlebar:visible, .q-cube .dc-zone-bar:visible, .q-cube .dc-app-side:visible, .q-cube .dc-app-stats:visible').count(), 0);
    assert.match(await page.textContent('.q-results-bar'), /12 rows in \d+ ms/);
    // group by Side (an enumeration) from the grid's right-click menu: the cube's own groupBy,
    // planned on the query
    await page.click('.q-cube .dc-row >> nth=0 >> .dc-cell >> nth=1', { button: 'right' });
    await page.hover('.dc-menu > .dc-menu-item:has(> .dc-menu-label:text-is("Pivot"))');
    await page.click('.dc-submenu .dc-menu-item:has(> .dc-menu-label:text-is("Vertical Pivot on Side"))');
    await page.waitForFunction(() => document.querySelectorAll('.q-cube .dc-row').length === 2, undefined, { timeout: 30000 });
    // a group's first cell carries the tree's expander (▸) before its label
    const groups = (await cubeRows(page)).map((r) => [r[0].replace(/^[▸▾]\s*/, ''), r[r.length - 1]]);
    assert.deepEqual(groups, [['BUY', '15,003,400'], ['SELL', '37,503,100']]);
    // its controls come back from the right-click menu's last entry (DataCube's own mode)
    await page.click('.q-cube .dc-row >> nth=0 >> .dc-cell >> nth=1', { button: 'right' });
    await page.click('.dc-menu > .dc-menu-item:has(> .dc-menu-label:text-is("Show Controls"))');
    await page.waitForSelector('.q-cube .dc-titlebar:visible, .q-cube .dc-app-stats:visible', { timeout: 10000 });
    await page.click('.q-results-bar button.q-tab:text-is("Grid")');
    await page.waitForSelector('.q-grid tbody tr', { timeout: 30000 });
    assert.equal((await gridRows(page)).length, 12);
  });

  await step('Objects mode fetches JSON', async (page) => {
    await page.goto(app(`#/create/manual/${GAV}/${enc('demo::trading::TradingMapping')}/${enc('demo::trading::Runtime')}?class=${enc('demo::trading::Firm')}`));
    await page.waitForSelector('.q-node', { timeout: 60000 });
    await page.dblclick(".q-node:has-text('Legal Name')");
    await page.click('.q-panel-title button:has-text("Objects")');
    await run(page);
    const json = JSON.parse(await page.textContent('.q-json'));
    assert.equal(json.length, 4);
    assert.ok('legalName' in json[0]);
  });

  await context.close();
}

try {
  await waitForEngine();
  browser = await chromium.launch();
  console.log('Query app, end to end');
  await suite('In the browser (DuckDB-WASM, no server)', '');
  await suite("On legend-lite's server", '?config=config-server.json');
} finally {
  await browser?.close();
  site.close();
  engine.kill();
}

if (failures > 0) {
  console.log(`\n${failures} step(s) failed; screenshots in ${store}`);
  process.exit(1);
}
console.log('\nevery step holds, in both');
