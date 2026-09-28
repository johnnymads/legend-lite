// SAVED CUBES, driven the way a person drives them (docs/DATACUBE_SAVE_SHARE_2026_09_28.md,
// milestone 1 step 1), in a real browser with its real IndexedDB:
//
//   1. open a file, shape a cube, save it from the Cubes window;
//   2. RELOAD the page (nothing survives but the browser's database), open the cube: the page
//      asks for the file (no handle: Playwright hands files to an <input>, which keeps none),
//      and the cube comes back with the SAME typed values;
//   3. a cube over a SAMPLE reopens with no question at all (rebuilt from its seed);
//   4. delete, and the list says so.
//
//   bazel run //datacube:verify_cubes

import { createServer } from 'node:http';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

import { servedPath } from './static-files.ts';
import { readView, sameTyped, stamp } from './typed-view.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm',
  '.pure': 'text/plain', '.css': 'text/css', '.csv': 'text/csv', '.json': 'application/json',
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
const URL_BASE = `http://127.0.0.1:${port}`;

const dir = await mkdtemp(join(tmpdir(), 'dc-cubes-'));
const csv = join(dir, 'trades.csv');
const lossy = join(dir, 'trades-no-notional.csv');
// a LARGE file picked first and a small one straight after (P2-330): the small one must win
const big = join(dir, 'big-trades.csv');
await writeFile(big, 'region,desk,notional,qty\n'
  + Array.from({ length: 400_000 }, (_, i) => `R${i % 97},D${i % 13},${i},${i % 7}`).join('\n') + '\n');
const small = join(dir, 'small-trades.csv');
await writeFile(small, 'region,desk,notional,qty\nEMEA,Rates,1,1\nAMER,FX,2,2\n');
await writeFile(lossy, 'region,desk,qty\n'
  + Array.from({ length: 60 }, (_, i) => `${['EMEA', 'AMER', 'APAC'][i % 3]},${['Rates', 'Credit', 'FX'][i % 5 % 3]},${i}`).join('\n') + '\n');
await writeFile(csv, 'region,desk,notional,qty\n'
  + Array.from({ length: 60 }, (_, i) =>
    `${['EMEA', 'AMER', 'APAC'][i % 3]},${['Rates', 'Credit', 'FX'][i % 5 % 3]},${(i * 12.5).toFixed(2)},${i}`).join('\n') + '\n');

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await context.newPage();
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

/** The status line's text, to wait for it to change. */
const statusNow = () => page.evaluate(() => document.querySelector('.dc-status-timing')?.textContent ?? '');
async function landed(before) {
  await page.waitForFunction((was) => {
    const line = document.querySelector('.dc-status-timing')?.textContent ?? '';
    return line !== was && /rows/.test(line) && document.querySelectorAll('.dc-row').length > 0;
  }, before, { timeout: 60_000 });
  await page.waitForTimeout(300);
}
async function load() {
  await page.goto(`${URL_BASE}/demo/index.html`);
  await page.waitForSelector('.dc-row', { timeout: 90_000 });
}
async function burger(label) {
  await page.click('.dc-titlebar-menu');
  await page.locator('.dc-menu-item', { hasText: label }).first().click();
}
/** A host window shown (its menu entry toggles it), the other ones closed. */
async function showWin(id, label) {
  for (const other of ['datawin', 'cubeswin', 'querywin']) {
    if (other !== id && await page.locator(`#${other}`).isVisible()) {
      await page.click(`#${other} .hostwin-close`);
    }
  }
  if (!(await page.locator(`#${id}`).isVisible())) await burger(label);
  await page.locator(`#${id}`).waitFor({ state: 'visible' });
}
const libMessage = () => page.locator('#cubelib .dc-lib-message').textContent();
async function waitMessage(re) {
  await page.waitForFunction((src) => new RegExp(src).test(
    document.querySelector('#cubelib .dc-lib-message')?.textContent ?? ''), re.source, { timeout: 60_000 });
  return libMessage();
}
/** Shape the cube: grouped by region, notional summed. Setup only -- what is tested is the save. */
async function shape() {
  const before = await statusNow();
  await page.evaluate(async () => {
    const app = window.__dataCube;
    await app.change((s) => ({ ...s, snapshot: { ...s.snapshot, rows: ['region'], measures: [{ name: 'notional', column: 'notional', fn: 'sum' }] } }));
  });
  await landed(before);
}
async function saveAs(name) {
  await showWin('cubeswin', 'Cubes');
  await page.fill('#cubelib .dc-lib-name', name);
  await page.locator('#cubelib .dc-lib-button', { hasText: /^Save$/ }).click();
  await waitMessage(/saved/);
}
async function openSaved(name) {
  await showWin('cubeswin', 'Cubes');
  const row = page.locator('#cubelib .dc-lib-row', { hasText: name });
  await row.waitFor({ timeout: 10_000 });
  const before = await statusNow();
  await row.locator('.dc-lib-button', { hasText: 'Open' }).click();
  return before;
}
const typed = () => readView(page);

try {
  await check('a cube over a file is saved, and the list shows it', async () => {
    await load();
    const before = await statusNow();
    await page.setInputFiles('#uploadfile', csv);
    await landed(before);
    await shape();
    await saveAs('Trades by region');
    const rows = await page.locator('#cubelib .dc-lib-row').allTextContents();
    if (!rows.some((r) => r.includes('Trades by region'))) throw new Error(`list: ${rows.join(' | ')}`);
    return rows.length + ' saved';
  });

  const savedView = await typed();

  await check('after a reload, opening it asks for the file, then shows the same typed values', async () => {
    await load();
    const before = await openSaved('Trades by region');
    await page.waitForSelector('#cubelib .dc-lib-ask:not([hidden])', { timeout: 10_000 });
    const ask = await page.locator('#cubelib .dc-lib-ask').textContent();
    if (!/trades\.csv/.test(ask ?? '')) throw new Error(`the ask does not name the file: ${ask}`);
    await page.setInputFiles('#cubelib .dc-lib-choose', csv);
    await landed(before);
    const message = await waitMessage(/opened/);
    const now = await typed();
    const differs = savedView.map((c, i) => {
      const n = now[i];
      if (!n || n.name !== c.name || n.type !== c.type) return `${c.name}:${c.type} vs ${n?.name}:${n?.type}`;
      const bad = c.values.findIndex((v, r) => !sameTyped(v, n.values[r] ?? null, c.type));
      return bad < 0 && c.values.length === n.values.length ? null : `${c.name} row ${bad}`;
    }).filter(Boolean);
    if (differs.length) throw new Error(`differs: ${differs.join('; ')}`);
    return `${message.trim()} — ${now.length} columns, ${now[0]?.values.length} rows, identical`;
  });

  await check('changed since saved: the title marks it, and saving clears the mark', async () => {
    const title = () => page.title();
    if ((await title()).startsWith('\u2022')) throw new Error(`marked before any change: ${await title()}`);
    const out = await page.evaluate(async () => {
      const app = window.__dataCube;
      const was = app.snapshot.rows.join(',');
      const o = await app.change((s) => ({ ...s, snapshot: { ...s.snapshot, rows: ['desk'] } }));
      return `${o.kind} (rows ${was} -> ${app.snapshot.rows.join(',')})`;
    });
    // `change` resolves once the view has LANDED: no need to watch the status line (3 regions
    // regrouped as 3 desks can read exactly as before, and the wait never ended)
    if (!/^applied/.test(out)) throw new Error(`the change did not land: ${out}`);
    await page.waitForFunction(() => document.title.startsWith('\u2022'), undefined, { timeout: 10_000 })
      .catch(async () => { throw new Error(`not marked after a change (${out}): ${await title()}`); });
    await showWin('cubeswin', 'Cubes');
    if (await page.locator('#cubelib .dc-lib-unsaved').isHidden()) throw new Error('the window does not say so');
    await page.locator('#cubelib .dc-lib-button', { hasText: /^Save$/ }).click();
    await waitMessage(/saved/);
    if ((await title()).startsWith('\u2022')) throw new Error(`still marked after saving: ${await title()}`);
    // A PRESENTATION change runs no query (Leg B): it is a change all the same
    const pinned = await page.evaluate(async () => (await window.__dataCube.change((s) => ({ ...s,
      configuration: { ...s.configuration, columns: { ...s.configuration.columns, desk: { pinned: 'left' } } } }))).kind);
    if (pinned !== 'applied') throw new Error(`the pin did not apply: ${pinned}`);
    await page.waitForFunction(() => document.title.startsWith('\u2022'), undefined, { timeout: 10_000 })
      .catch(async () => { throw new Error(`a pin (no query) did not mark it: ${await title()}`); });
    return 'marked, saved and clear, marked again by a pin that ran no query';
  });

  await check('opened over a file that lost a column, Save says what it would drop', async () => {
    await load();
    const before = await openSaved('Trades by region');
    await page.waitForSelector('#cubelib .dc-lib-ask:not([hidden])', { timeout: 10_000 });
    await page.setInputFiles('#cubelib .dc-lib-choose', lossy);
    await landed(before);
    const message = await waitMessage(/changes since it was saved/);
    if (!/notional/.test(message)) throw new Error(`the changes do not name notional: ${message}`);
    if (!(await page.title()).startsWith('\u2022')) throw new Error('not marked as changed');
    await page.locator('#cubelib .dc-lib-button', { hasText: /^Save$/ }).click();
    await page.waitForSelector('#cubelib .dc-lib-ask:not([hidden])', { timeout: 5_000 });
    const warning = await page.locator('#cubelib .dc-lib-ask').textContent();
    if (!/cannot show/.test(warning ?? '')) throw new Error(`no warning: ${warning}`);
    await page.locator('#cubelib .dc-lib-ask .dc-lib-button', { hasText: 'Cancel' }).click();
    return 'warned before saving over it';
  });

  await check('a cube over a SAMPLE reopens with no question', async () => {
    await showWin('datawin', 'Data');
    await page.selectOption('#samplepick', 'trades');
    await page.fill('#samplerows', '500');
    let before = await statusNow();
    // the cube on screen has unsaved changes (the check above cancelled its save): opening a
    // sample over it asks first -- answered yes here, and the question checked
    let asked = '';
    page.once('dialog', (d) => { asked = d.message(); void d.accept(); });
    await page.click('#sampleopen');
    await landed(before);
    if (!/unsaved changes/.test(asked)) throw new Error(`it did not ask before replacing: "${asked}"`);
    await shape();
    await saveAs('Sample trades');
    const want = await typed();
    await load();
    before = await openSaved('Sample trades');
    await landed(before);
    const message = await waitMessage(/opened/);
    if (!(await page.locator('#cubelib .dc-lib-ask').isHidden())) throw new Error('it asked for a file');
    const got = await typed();
    if (stamp(got) !== stamp(want)) throw new Error('the rebuilt sample shows different values');
    return message.trim();
  });

  await check('delete removes it from the list', async () => {
    await showWin('cubeswin', 'Cubes');
    const row = page.locator('#cubelib .dc-lib-row', { hasText: 'Sample trades' });
    await row.locator('.dc-lib-button', { hasText: 'Delete' }).click();
    await page.locator('#cubelib .dc-lib-confirm .dc-lib-button', { hasText: 'Delete' }).click();
    await waitMessage(/deleted/);
    const rows = await page.locator('#cubelib .dc-lib-row').allTextContents();
    if (rows.some((r) => r.includes('Sample trades'))) throw new Error('still listed');
    return `${rows.length} left`;
  });

  await check('the LAST file picked wins, however long the first takes to read (P2-330)', async () => {
    await load();
    const answer = (d) => { void d.accept(); };
    page.on('dialog', answer); // "open anyway?" -- yes, both times
    try {
      await page.setInputFiles('#uploadfile', big);
      await page.setInputFiles('#uploadfile', small);
      // both reads finish: the note stops saying "reading", then a moment for a late one to land
      await page.waitForFunction(() => !/reading/.test(document.querySelector('#note')?.textContent ?? ''),
        undefined, { timeout: 120_000 });
      await page.waitForTimeout(4000);
    } finally {
      page.off('dialog', answer);
    }
    const title = await page.evaluate(() => window.__dataCube.configuration.reportTitle ?? '');
    if (!/small-trades/.test(title)) throw new Error(`the cube on screen is "${title}", not the file picked last`);
    return `on screen: ${title}`;
  });

  await check('choosing another plane with a file open asks first; No stays (P2-337)', async () => {
    const here = page.url();
    let asked = '';
    page.once('dialog', (d) => { asked = d.message(); void d.dismiss(); });
    await page.click('.dc-titlebar-menu');
    await page.locator('.dc-menu .dc-menu-item', { hasText: 'Plan remote' }).first().click();
    await page.waitForTimeout(1500);
    if (!asked) throw new Error('it navigated away without asking: the opened file would be lost');
    if (page.url() !== here) throw new Error(`it left for ${page.url()} after No`);
    return `asked: "${asked.slice(0, 60)}…", stayed`;
  });

  await check('no page errors', async () => {
    if (pageErrors.length) throw new Error(pageErrors.slice(0, 2).join(' | '));
  });
} finally {
  await browser.close();
  server.close();
}

const bad = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - bad}/${results.length} saved-cube checks work`);
process.exit(bad ? 1 : 0);
