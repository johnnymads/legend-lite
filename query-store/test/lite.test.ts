// legend-lite's server (`//core:server --query-store`), held to the one suite: the store the page
// answers is the store a server answers.

import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before } from 'node:test';

import { conformance } from './conformance.ts';

const RUNFILES = process.env['RUNFILES_DIR'] ?? process.env['TEST_SRCDIR'] ?? '';
const SERVER = join(RUNFILES, '_main', 'core', 'server');

const freePort = (): Promise<number> => new Promise((resolve, reject) => {
  const s = createServer();
  s.once('error', reject);
  s.listen(0, '127.0.0.1', () => {
    const port = (s.address() as { port: number }).port;
    s.close(() => resolve(port));
  });
});

let server: ChildProcess | undefined;
let api = '';
let log = '';

before(async () => {
  const port = await freePort();
  const store = mkdtempSync(join(process.env['TEST_TMPDIR'] ?? tmpdir(), 'query-store-'));
  server = spawn(SERVER, [String(port), '--query-store', store], {
    env: { ...process.env, RUNFILES_DIR: RUNFILES, JAVA_RUNFILES: RUNFILES },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout?.on('data', (d) => { log += d; });
  server.stderr?.on('data', (d) => { log += d; });
  const until = Date.now() + 60_000;
  for (;;) {
    const up = await fetch(`http://127.0.0.1:${port}/health`).then((r) => r.ok, () => false);
    if (up) break;
    if (Date.now() > until || server.exitCode !== null) throw new Error(`legend-lite did not start:\n${log.slice(-2000)}`);
    await new Promise((r) => setTimeout(r, 250));
  }
  api = `http://127.0.0.1:${port}/api`;
});

after(() => {
  server?.kill();
});

conformance("legend-lite's server", () => ({ api, fetch: globalThis.fetch.bind(globalThis), user: 'anonymous' }));
