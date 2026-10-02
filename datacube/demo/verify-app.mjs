// The single-user app, end to end (docs/DATACUBE_APP_PLAN_2026_10_02.md, A2 and A3): the native
// warehouse serving this site with one user, its printed address opened the way `--open` opens it.
// It starts from the launch key, never from the sample; it opens the table asked for, or offers the
// tables; a reload signs in again; a wrong key and an unknown table leave the blank page saying why.
//
//   DATACUBE_APP_PG=postgresql://reader:secret@127.0.0.1:5432/shop \
//   DATACUBE_APP_TABLE=sales.orders DATACUBE_APP_GROUP=channel bazel run //datacube:verify_app
//
// Manual: it needs a Postgres (16+) that the URL's user can read, as //warehouse:postgres_live does.

import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const PG = process.env.DATACUBE_APP_PG;
const TABLE = process.env.DATACUBE_APP_TABLE;
const GROUP = process.env.DATACUBE_APP_GROUP;
if (!PG || !TABLE || !GROUP) {
  console.error('set DATACUBE_APP_PG (a postgresql:// URL with its password), DATACUBE_APP_TABLE (schema.name)'
    + ' and DATACUBE_APP_GROUP (a text column of that table to group by)');
  process.exit(2);
}

// This file is datacube/demo/verify-app.mjs in the runfiles: the site and the launcher are beside it.
const DATACUBE = fileURLToPath(new URL('..', import.meta.url));
const RUNFILES = resolve(DATACUBE, '..', '..');
const work = await mkdtemp(join(tmpdir(), 'verify-app-'));

let failed = false;
const bad = (m) => { console.log(`FAIL: ${m}`); failed = true; };
const ok = (m) => console.log(`ok: ${m}`);

// The warehouse as //datacube:app runs it, without --open: the address is read from what it prints.
const server = spawn(join(DATACUBE, '..', 'warehouse', 'serve.sh'),
  ['--port', '0', '--site', join(DATACUBE, 'dist'), '--single-user', PG],
  { env: { ...process.env, RUNFILES_DIR: RUNFILES, BUILD_WORKING_DIRECTORY: work }, stdio: ['ignore', 'ignore', 'pipe'] });
let printed = '';
const address = await new Promise((done, fail) => {
  server.stderr.on('data', (b) => {
    printed += b.toString();
    const m = /DataCube: (http:\/\/127\.0\.0\.1:\d+\/#key=[A-Za-z0-9_-]+)/.exec(printed);
    if (m) done(m[1]);
  });
  server.on('exit', (code) => fail(new Error(`the warehouse exited (${code}):\n${printed}`)));
  setTimeout(() => fail(new Error(`no address in 60s:\n${printed}`)), 60_000);
});
ok(`the warehouse printed ${address.replace(/key=.*/, 'key=…')}`);

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const statuses = [];
  page.on('pageerror', (e) => bad(`page error: ${e.message}`));
  await page.exposeFunction('__status', (t) => statuses.push(t));
  await page.addInitScript(() => {
    new MutationObserver(() => {
      const s = document.getElementById('status');
      if (s) window.__status(s.textContent ?? '');
    }).observe(document, { subtree: true, childList: true, characterData: true });
  });
  // Live: the title bar's plane button says so, and the status bar's receipt names the warehouse
  const live = () => page.waitForFunction(() =>
    document.querySelector('.dc-titlebar-toggle')?.textContent?.trim() === 'Live'
    && /the warehouse/.test(document.querySelector('.dc-status-receipt')?.textContent ?? ''), undefined,
  { timeout: 120_000 });

  // 1. THE TABLE ASKED FOR, opened Live, and nothing generated first
  await page.goto(`${address}&table=${TABLE}`);
  await live();
  const title = await page.evaluate(() => window.__dataCube?.configuration.reportTitle);
  if (title !== TABLE) bad(`the cube is ${title}, not ${TABLE}`); else ok(`opened ${TABLE} Live`);
  if (statuses.some((t) => /generating/.test(t))) bad('the sample was generated before the table opened');
  else ok('no sample was generated');

  // 2. GROUPED in Postgres: one row per value, no error
  const cols = await page.$$eval('.dc-th[data-column]', (els) => els.map((e) => e.dataset.column));
  const at = cols.indexOf(GROUP);
  if (at < 0) bad(`${GROUP} is not a column (${cols.join(', ')})`);
  else {
    await page.locator('.dc-row').nth(0).locator('.dc-cell').nth(at).click({ button: 'right' });
    const own = (t) => `.dc-menu-item:has(> .dc-menu-label:text-is(${JSON.stringify(t)}))`;
    await page.locator(own('Pivot')).first().hover();
    await page.locator(own(`Vertical Pivot on ${GROUP}`)).first().click();
    await page.waitForFunction(() => document.querySelectorAll('.dc-row[aria-expanded]').length > 0, undefined,
      { timeout: 60_000 }).catch(() => bad(`grouping by ${GROUP} shows no groups`));
    if (await page.locator('text=Data Fetch Failure').count()) bad(`grouping by ${GROUP} failed in Postgres`);
    else ok(`grouped by ${GROUP}: ${await page.locator('.dc-row[aria-expanded]').count()} groups`);
  }

  // 3. A RELOAD signs in again with the key still in the address
  await page.reload();
  await live();
  ok('a reload signed in again');

  // Each start below is a NEW page: going to an address that differs only in its fragment does not
  // load the page again, so the start would never run.
  const fresh = async () => {
    const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    p.on('pageerror', (e) => bad(`page error: ${e.message}`));
    return p;
  };

  // 4. NO TABLE: the tables are offered, already signed in
  const offered = await fresh();
  await offered.goto(address);
  await offered.locator('.dc-picker-row[data-object]').first().waitFor({ timeout: 60_000 })
    .then(async () => ok(`the tables are offered: ${await offered.locator('.dc-picker-row[data-object]').count()}`))
    .catch(() => bad('without a table, no table list was offered'));
  if (await offered.locator('.dc-picker-form input[type=password]').count()) bad('the picker asked for a password');

  // 5. A WRONG KEY and 6. AN UNKNOWN TABLE: the blank page says why
  for (const [url, why] of [
    [address.replace(/key=.*/, 'key=not-the-key'), /wrong launch key/],
    [`${address}&table=no_such.table`, /no_such\.table is not a table you may read here/],
  ]) {
    const refused = await fresh();
    await refused.goto(url);
    const said = await refused.locator('.dc-blank-reason').textContent({ timeout: 60_000 }).catch(() => '');
    if (!why.test(said ?? '')) bad(`${url.replace(/key=[^&]*/, 'key=…')}: the blank page said "${said}"`);
    else ok(`the blank page says: ${said}`);
  }
} finally {
  await browser.close();
  server.kill('SIGTERM');
  await rm(work, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
