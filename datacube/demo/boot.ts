// A runnable demo: real DuckDB-WASM in the browser, real snap mode,
// the real grid.
//
// The planner is the one piece that needs the legend-lite server. If it
// is reachable the demo uses it; otherwise it falls back to a shim that
// emits SQL directly, clearly labelled in the UI so nobody mistakes the
// fallback for the product. That shim lives HERE, in demo/, and not in
// src/, because "one planner" is an architectural commitment and a
// convenient second planner is exactly how such commitments rot.

import * as duckdb from '@duckdb/duckdb-wasm';

import { CubeApp } from '../src/app.ts';
import {
  DEFAULT_CONFIGURATION,
  type CubeConfiguration,
} from '../src/config.ts';
import type { Planner } from '../src/cube.ts';
import { DuckDbEngine, type ArrowishConnection } from '../src/duckdb.ts';
import { mountRemote } from '../src/remote.ts';
import { formatOf, ingestFile } from '../src/upload.ts';
import {
  fileSource,
  openCube,
  readCube,
  type CubeDocument,
  type CubeSource,
  type FileSource,
} from '../src/cube-document.ts';
import {
  BrowserRecords,
  MemoryRecords,
  RuleStore,
  openCubeDatabase,
  persistStorage,
  type CubeStore,
} from '../src/cube-store.ts';
import {
  FileHandles,
  canKeepHandles,
  pickDataFile,
  readHandle,
  type FileHandle,
} from '../src/file-handles.ts';
import { CubeLibrary } from '../src/ui/cube-library.ts';
import { inferModel, type CatalogBuilder } from '../src/infer.ts';
import { pageConfig } from './page-config.ts';
import {
  listObjects,
  signIn,
  WarehouseEngine,
  type CatalogObject,
  type WarehouseSession,
} from '../src/warehouse.ts';
import { makeWindow, type WindowSpec } from '../src/ui/window.ts';
import type { MenuItem } from '../src/ui/menu.ts';
import {
  SAMPLES,
  sampleById,
  sampleFileName,
  type Sample,
} from '../src/samples.ts';
import type { ColumnFormat } from '../src/format.ts';
import type { CubeSnapshot } from '../src/snapshot.ts';
import type { TreeState } from '../src/tree.ts';
import { sourceColumns } from '../src/source-columns.ts';
import { accessor, type ValueSpecification } from '../../pure-protocol/src/index.ts';
import type { SnapTarget } from '../src/snap.ts';

const ROWS = 200_000;

/**
 * THE THREE PLANES, as data rather than as three copies of a menu.
 *
 * Each is one page loading one arrangement, statically: a bundle
 * decides who compiles the Pure and who runs it, and nothing at
 * runtime can change that (`test/guardrails.test.ts` -- the one time
 * shipped code could pick a planner by health check, the fallback hid
 * three real bugs for the life of the project). The menu navigates;
 * it does not switch.
 */
export const PLANES: readonly {
  readonly id: `host.plane.${string}`;
  readonly page: string;
  readonly label: string;
  readonly word: string;
}[] = [
  {
    id: 'host.plane.wasm',
    page: 'index.html',
    label: 'Plan local (in this tab)',
    word: 'local',
  },
  {
    id: 'host.plane.server',
    page: 'index-server.html',
    label: 'Plan remote (legend-lite on :8080)',
    word: 'remote',
  },
  {
    id: 'host.plane.engine',
    page: 'index-engine.html',
    label: 'Run on the engine (legend-engine on :6300)',
    word: 'engine',
  },
];

/** Which page is loaded, and therefore which plane. */
export function currentPlane(): string {
  const here = location.pathname;
  const found = PLANES.find((plane) => plane.page !== 'index.html'
    && here.includes(plane.page.replace('.html', '')));
  return (found ?? PLANES[0]!).word;
}

/** The plane entries, with the one you are ON disabled, not hidden. */
export function planeMenu(): MenuItem[] {
  const now = currentPlane();
  return PLANES.map((plane) => ({
    id: plane.id,
    label: plane.label,
    ...(plane.word === now ? { disabled: true as const } : {}),
  }));
}

/** Navigate to a plane, if that is what was chosen. */
export function goToPlane(id: string | undefined): boolean {
  const found = PLANES.find((plane) => plane.id === id);
  if (!found) return false;
  location.href = found.page;
  return true;
}

/**
 * The formats the HOST knows and the snapshot cannot: notional and
 * pnl are money, qty is a count. Rendering a trade count as $10,005
 * is the kind of wrong that looks plausible.
 */
export const MONEY: ColumnFormat = {
  kind: 'currency',
  currency: 'USD',
  locale: 'en-US',
  maximumFractionDigits: 0,
  negativeParens: true,
};

/** The demo's own configuration, shared by every plane. */
export function demoConfiguration(title: string): CubeConfiguration {
  return {
    ...DEFAULT_CONFIGURATION,
    reportTitle: title,
    showSelectionStats: true,
    columns: {
      notional: { format: MONEY },
      pnl: { format: MONEY },
      qty: {
        format: { kind: 'number', locale: 'en-US', maximumFractionDigits: 0 },
      },
    },
  };
}

/** The named hierarchies the demo offers, shared by every plane. */
export const DEMO_DIMENSIONS: readonly {
  readonly name: string;
  readonly columns: readonly string[];
}[] = [
  { name: 'Geography', columns: ['region', 'desk', 'book'] },
  { name: 'Calendar', columns: ['year', 'qtr'] },
];

/** What an entry point must hand `boot`. */
export interface Engine {
  readonly planner: Planner;
  readonly source: ValueSpecification;
  readonly snapTarget: SnapTarget;
  /**
   * Models made in this tab: the compiler's Database for a table's catalog
   * (T2), and repointing the planner at the model around it.
   *
   * OPTIONAL, and absent is meaningful: the server entry plans
   * against a fixed model on a running legend-lite, where an
   * uploaded file would have nowhere to live, so it supplies
   * nothing and the upload control never appears. The capability
   * and the affordance are the same fact.
   */
  readonly models?: {
    readonly fromCatalog: CatalogBuilder;
    use(model: string, runtime: string): void;
  };
  /**
   * What the status line should say about this planner.
   *
   * Returned rather than written, because `boot` starts the planner
   * CONCURRENTLY with DuckDB: two writers racing on one status line
   * produce flicker and, worse, a final message that depends on
   * which finished last. `boot` owns the line and writes this when
   * both are ready.
   */
  /**
   * WHICH BACKEND ANSWERED, in one word.
   *
   * `local` plans in this tab, `remote` on legend-lite over HTTP,
   * `engine` on the real legend-engine. It sits in a 20px strip
   * beside the row count, where "planner: legend-lite (wasm, no
   * server)" was most of the bar -- and three planes want three
   * words a person can tell apart at a glance, not three sentences.
   */
  readonly label: string;
}

/**
 * How a bundle supplies its planner.
 *
 * Passed in rather than chosen here, because "shipped code must not be
 * able to CHOOSE a planner at runtime" (test/guardrails.test.ts) and a
 * URL parameter is exactly that choice. Each entry point wires one
 * planner and cannot reach the other: `main.ts` the server, and
 * `main-wasm.ts` the in-browser build. The decision is made by which
 * bundle you load, which is static and visible in the build.
 */
export type MakePlanner = (status: HTMLElement) => Promise<Engine>;

/** Where the demo's shared model and tables live: `#>{trades::DB.TRADES}#`. */
export const SOURCE = accessor('trades::DB', 'TRADES');
export const SNAP_TARGET: SnapTarget = {
  table: 'TRADES_SNAP',
  source: accessor('trades::DB', 'TRADES_SNAP'),
};
export const RUNTIME = 'trades::RT';

/** One copy of the model text, fetched so the file is the source. */
export async function loadModel(): Promise<string> {
  return (await fetch('./trades.pure')).text();
}

// -- sample data ----------------------------------------------------

const REGIONS = ['EMEA', 'AMER', 'APAC'];
const DESKS = ['Rates', 'Credit', 'FX', 'Equity', 'Commodities'];

export async function boot(makePlanner: MakePlanner): Promise<void> {
  const status = must('status');

  // Start the planner NOW, and await it further down where it is
  // first needed.
  //
  // It needs nothing from DuckDB and DuckDB needs nothing from it,
  // but boot used to run them in series, so ~1.3s of boot-layer
  // construction (prelude parse, system metamodel, resolve and
  // normalize) waited for a 36 MB WASM instantiate that had already
  // finished nothing useful for it. Overlapped, the slower of the
  // two sets the floor instead of their sum.
  performance.mark('dc:boot-start');
  const engineReady = makePlanner(status);
  void engineReady.then(() => performance.mark('dc:planner-ready'));
  // Await happens below; this only stops an early rejection being
  // reported as unhandled in the window before that.
  engineReady.catch(() => {});

  status.textContent = 'starting DuckDB…';

  // Bundles are served from OUR origin, copied out of node_modules by
  // `bazel build //datacube:vendor`. Loading them from a CDN instead forces a
  // cross-origin Worker, which the platform forbids outright and which
  // is then usually worked around with a blob that importScripts the
  // CDN url. That workaround exists to solve a problem worth not
  // having: a deployment behind a firewall is not fetching its query
  // engine from a CDN anyway.
  // Absolute URLs, not relative ones. The WORKER resolves mainModule
  // against its own location, so './vendor/x.wasm' becomes
  // '/demo/vendor/vendor/x.wasm' and fails as an opaque
  // "WebAssembly.compile: HTTP status code is not ok".
  const asset = (f: string) => new URL(`./vendor/${f}`, location.href).href;
  const bundle = await duckdb.selectBundle({
    mvp: {
      mainModule: asset('duckdb-mvp.wasm'),
      mainWorker: asset('duckdb-browser-mvp.worker.js'),
    },
    eh: {
      mainModule: asset('duckdb-eh.wasm'),
      mainWorker: asset('duckdb-browser-eh.worker.js'),
    },
  });
  const worker = new Worker(bundle.mainWorker!);
  const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(), worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  const conn = await db.connect();
  const engine = new DuckDbEngine(conn as unknown as ArrowishConnection);
  performance.mark('dc:duckdb-ready');

  // A REMOTE SOURCE, when one is named.
  //
  //   ?remote=https://host/trades.parquet
  //   ?remote=s3://bucket/table&format=iceberg
  //
  // The data stays where it is: DuckDB reads it over HTTP range
  // requests, so the cube pulls the bytes a query needs rather than
  // the file. Everything downstream is unchanged, because the remote
  // file is mounted as a VIEW called `trades` -- the same name the
  // generated table would have had, and the name the model already
  // refers to.
  const params = new URLSearchParams(location.search);
  const remote = params.get('remote');
  if (remote) {
    status.textContent = `mounting ${remote}…`;
    const format = params.get('format');
    await mountRemote(engine, {
      sources: [{
        name: 'trades',
        url: remote,
        ...(format === 'parquet' || format === 'csv' || format === 'iceberg'
          ? { format }
          : {}),
      }],
      // Credentials come from the host, never from the URL bar: a
      // query string lands in history, logs and shoulder-surfing
      // range. A bucket that needs them is configured by the
      // embedding application.
    });
    status.textContent = `reading ${remote}`;
  } else {

  status.textContent = `generating ${ROWS.toLocaleString()} rows…`;
  await engine.run(
    `CREATE OR REPLACE TABLE trades AS
     SELECT
       ${sqlPick(REGIONS, 'i % 3')}            AS region,
       ${sqlPick(DESKS, '(i // 3) % 5')}       AS desk,
       (2021 + ((i // 15) % 5))                AS year,
       ('Q' || (1 + ((i // 75) % 4)))          AS qtr,
       ('Book ' || (1 + ((i // 300) % 4)))     AS book,
       ((i * 7919) % 1000000) / 100.0  AS notional,
       ((i * 104729) % 200000) / 100.0 - 1000.0 AS pnl,
       ((i * 31) % 97) + 1             AS qty
     FROM range(${ROWS}) t(i)`,
    0,
  );
  }

  // -- the cube ------------------------------------------------------

  performance.mark('dc:data-ready');
  status.textContent = 'starting planner…';
  const { planner, source, snapTarget, label, models } = await engineReady;
  status.textContent = label;

  const snapshot: CubeSnapshot = {
    source: { query: source },
    // the compiler types every column; the page declares only that year is a dimension
    columns: await sourceColumns(planner, source, [{ name: 'year', kind: 'dimension' }]),
    derived: [],
    rows: ['region', 'desk', 'book'],
    pivotOn: ['year'],
    measures: [{ name: 'notional', column: 'notional', fn: 'sum' }],
    sorts: [],
    epoch: 1,
  };


  // The page builds the APP, not a grid and a pile of checkboxes.
  // Those checkboxes were the demo standing in for a product; what
  // they reached is now reachable from the toolbar, the drag zones,
  // the context menu and the properties editor -- which is the whole
  // reason src/app.ts exists.
  // The host knows what the snapshot cannot: that notional and pnl
  // are money and qty is a count. Rendering a trade count as $10,005
  // is the kind of wrong that looks plausible.
  const configuration: CubeConfiguration = demoConfiguration('Trades');

  // The close button on each host window. Wired once, by delegation,
  // so a window can be added to the markup without another listener.
  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const close = target.closest('.hostwin-close');
    if (!(close instanceof HTMLElement)) return;
    const id = close.dataset['win'];
    if (id) must(id).hidden = true;
  });

  // The cube, built so it can be built AGAIN.
  //
  // Opening a file replaces the model, and therefore the columns and
  // the source relation, so the app is recreated rather than mutated
  // -- a cube whose snapshot no longer matches its model is not a
  // state worth supporting. Everything the construction needs is a
  // parameter so there is only one copy of it.
  const host = must('app');
  const DEMO_DIMENSIONS = [
    { name: 'Geography', columns: ['region', 'desk', 'book'] },
    { name: 'Calendar', columns: ['year', 'qtr'] },
  ];

  function makeApp(
    snap: CubeSnapshot,
    config: CubeConfiguration,
    dims: { name: string; columns: string[] }[],
    // A warehouse source: Live runs on it, Snap copies into `engine`, and the
    // snap lands under the source's own name so one model reads both.
    place: {
      readonly live?: WarehouseEngine;
      readonly snapTarget?: SnapTarget;
      /** A file's cube can be saved: the file, by identity (never its data). */
      readonly cubeSource?: CubeSource;
    } = {},
  ): CubeApp {
    // PARK THE STATUS TEXT FIRST.
    //
    // It is MOVED into the cube's status bar, and rebuilding the cube
    // -- which opening a file does -- clears the host element and
    // would take it with it. So it goes home before the clear and is
    // adopted again by `hostStatus`. (The node itself survives either
    // way, since `status` is a reference rather than a lookup, but a
    // detached node shows nothing, and boot messages arrive before
    // the new cube's first render.)
    must('offstage').append(status);
    host.replaceChildren();
    let printed = 0;
    const created: CubeApp = new CubeApp(host, snap, {
      engine,
      planner,
      ...(place.live ? { live: place.live } : {}),
      // With a warehouse, the host's text says where the rows are: live
      // there as the signed-in user, or a snap in this tab.
      ...(place.live ? {
        onPlane: () => {
          const live = place.live as WarehouseEngine;
          const state = created.controller.snaps.state;
          status.textContent = state.mode === 'snapped'
            ? `snapped: ${state.snap.rowCount.toLocaleString()} rows in this tab (${live.principal})`
            : `live on the warehouse as ${live.principal}`;
        },
      } : {}),
      configuration: config,
      snapTarget: place.snapTarget ?? snapTarget,
      ...(place.cubeSource ? { cubeSource: place.cubeSource } : {}),
      showColumnZone: true,
      // THE HOST'S TEXT, IN THE STATUS BAR. Planner progress during
      // boot and errors afterwards -- the cube states its own row,
      // column and timing figures there itself now, so this no
      // longer echoes them. MOVED rather than copied: `status` is
      // the same node the planner writes to.
      hostStatus: (slot) => slot.append(status),
      hostMenu: () => [
        // ONLY IF THE PAGE CAN OPEN FILES. Without `models` the
        // bar's controls are inert -- this page's planner compiles a
        // fixed model -- and an entry that opens a panel of dead
        // controls is the dead-button fault one layer up.
        ...(models
          ? [
            { id: 'host.data' as const, label: 'Data\u2026' },
            // saved cubes: in this browser, over the files they were built on
            { id: 'host.cubes' as const, label: 'Cubes\u2026' },
          ]
          : []),
        { id: 'host.query', label: 'Generated Pure & SQL\u2026' },
        // The planes, as entries rather than a control: the bar is
        // for what you watch, the menu for what you do occasionally.
        // The one you are ON is disabled rather than hidden, so the
        // menu still says where the work happens.
        ...planeMenu(),
      ],
      onHostMenu: (item) => {
        if (item.id === 'host.data') toggleHostWindow('datawin');
        if (item.id === 'host.cubes') showCubes?.();
        if (item.id === 'host.query') toggleHostWindow('querywin');
        // A NAVIGATION, not a switch. Each page loads exactly one
        // arrangement, statically, and test/guardrails.test.ts holds
        // that line: shipped code must not be able to CHOOSE at
        // runtime, because the one time it could -- a health check
        // falling back to a demo shim -- it hid three real bugs for
        // the life of the project. The choice is still which bundle
        // the page loads; this only saves knowing the file names.
        goToPlane(item.id);
      },
      dimensions: dims,
      writeClipboard: (text) => navigator.clipboard?.writeText(text),
      // Settings kept between visits, as upstream's hosts keep them
      // (settingsData.values / onSettingsChanged). A browser that will
      // not store them still runs, on the defaults.
      ...(storedSettings() ? { settings: storedSettings() as Record<string, unknown> } : {}),
      onSettingsChanged: (values) => {
        try {
          window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(values));
        } catch {
          // storage refused (private window, quota): the settings hold
          // for this visit
        }
      },
      download: (name, mime, text) => {
        const url = URL.createObjectURL(new Blob([text], { type: mime }));
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.click();
        URL.revokeObjectURL(url);
      },
      onStatus: (text, kind) => {
        // ERRORS ONLY. The cube's own status bar carries the result
        // and the timing; a host that echoed the same line beside it
        // said one fact twice in a 20px strip. What a host is for is
        // saying what the cube cannot -- a planner that failed.
        if (kind !== 'error') return;
        status.textContent = text;
        status.classList.add('bad');
        status.classList.remove('warn-text');
      },
      onView: (view) => {
        // For the browser harness: how many views have landed.
        const w = window as unknown as { __dataCubeViews?: number };
        w.__dataCubeViews = (w.__dataCubeViews ?? 0) + 1;
        // A VIEW LANDED, SO THE LAST ERROR IS OVER.
        //
        // The line showed the last error and nothing ever took it
        // down, so a cube that had recovered still read as broken --
        // and it recovers routinely: opening a file swaps the
        // planner's model while the previous cube still has a query
        // in flight, that query then fails against the new model
        // with "unknown table 'TRADES'", and the app it belonged to
        // is thrown away a moment later. A status line says what is
        // true NOW.
        if (status.classList.contains('bad')) {
          status.classList.remove('bad');
          status.textContent = label;
        }
        // The query this product built, as the compiler prints it, and
        // the SQL the planner made of it. Both, because they answer
        // different questions -- and because the SQL panel showed Pure
        // until the real planner started returning SQL worth reading.
        // The print is asked for; a later view's print wins.
        const printing = (printed += 1);
        void created.controller.print(view.query, 'STANDARD').then(
          (text) => { if (printing === printed) must('pure').textContent = text; },
          (error: unknown) => { if (printing === printed) must('pure').textContent = String(error); },
        );
        must('sql').textContent =
          view.sql || '(the demo shim plans per level; expand a row)';
      },
    });
    // For the browser harness ONLY: the running cube, so a check can
    // read the cube's own configuration and snapshot when what it sees
    // on screen disagrees -- which it could not before, and which left
    // one defect undiagnosable. Not product code: the demo page.
    (window as unknown as { __dataCube?: CubeApp }).__dataCube = created;
    return created;
  }

  /** Opens the saved cubes' window; set once the page can open files. */
  let showCubes: (() => void) | undefined;
  let app = makeApp(snapshot, configuration, DEMO_DIMENSIONS);

  await app.open();

  // OPENING A FILE.
  //
  // DuckDB reads it and sniffs the schema, the compiler declares what it
  // found and `inferModel` writes a Pure model around that, and the cube is rebuilt against that.
  // Nothing downstream learns the data was uploaded: the planner
  // compiles an ordinary model over an ordinary table, which is why
  // the SQL panel, the tree and the snap plane all keep working
  // without a second code path.
  const uploadBar = document.getElementById('uploadbar');
  if (uploadBar) uploadBar.hidden = true;
  if (models) {
    const bar = must('uploadbar');
    const note = must('uploadnote');
    const input = must('uploadfile') as HTMLInputElement;
    bar.hidden = false;

    // Something to open, and a choice of awkwardness.
    //
    // These are the same generators `bazel run //datacube:run_stress` runs every cube
    // operation against, so an option that stopped working fails the
    // suite rather than disappointing whoever picked it. Each one is
    // hard in a different way: a quote inside a header, 60 columns,
    // 250 pivot values, hostile values, numbers at the int64 edges.
    const pick = must('samplepick') as HTMLSelectElement;
    const rowsInput = must('samplerows') as HTMLInputElement;
    for (const s of SAMPLES) {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.label;
      opt.title = s.about;
      pick.append(opt);
    }
    const showPick = () => {
      const s = sampleById(pick.value);
      if (!s) return;
      rowsInput.value = String(s.defaultRows);
            note.classList.remove('bad');
      note.textContent = s.about;
    };
    pick.addEventListener('change', showPick);
    showPick();

    // Narrowed once: the check above does not reach into a function.
    const local = models;

    // A WAREHOUSE. Sign in (the development sign-in: the warehouse's own
    // users), list what this user may read, and open one: the model comes
    // from the catalog's columns exactly as an uploaded file's comes from
    // DESCRIBE. Live runs there, as the user; Snap copies the user's rows
    // into this tab's DuckDB under the same name, so one model reads both.
    const whBar = document.getElementById('warehousebar');
    if (whBar) {
      const whUrl = must('whurl') as HTMLInputElement;
      const whUser = must('whuser') as HTMLInputElement;
      const whPass = must('whpass') as HTMLInputElement;
      const whTable = must('whtable') as HTMLSelectElement;
      const whOpen = must('whopen');
      const whNote = must('whnote');
      let session: WarehouseSession | undefined;
      let objects: CatalogObject[] = [];
      // Which warehouse to offer: the deployment's (config.json, ?warehouse=),
      // else the last one this browser signed in to. A convenience kept in this
      // browser only; storage may be refused (private windows), so never relied on.
      const REMEMBERED = 'datacube.warehouse.url';
      void pageConfig().then((config) => {
        let remembered = '';
        try {
          remembered = window.localStorage.getItem(REMEMBERED) ?? '';
        } catch {
          // storage refused: nothing remembered
        }
        if (!whUrl.value) whUrl.value = config.warehouse || remembered;
      });
      const say = (text: string, bad = false): void => {
        whNote.classList.toggle('bad', bad);
        whNote.textContent = text;
      };
      must('whconnect').addEventListener('click', () => {
        void (async () => {
          say('signing in…');
          try {
            session = await signIn(whUrl.value.trim(), whUser.value.trim(), whPass.value);
            whPass.value = ''; // the token is what is kept, in memory, never the password
            try {
              window.localStorage.setItem(REMEMBERED, session.baseUrl);
            } catch {
              // storage refused: not remembered, nothing else changes
            }
            objects = await listObjects(session);
            whTable.replaceChildren(...objects.map((o, i) => {
              const opt = document.createElement('option');
              opt.value = String(i);
              opt.textContent = `${o.schema}.${o.name}`;
              return opt;
            }));
            whTable.hidden = objects.length === 0;
            whOpen.hidden = objects.length === 0;
            say(objects.length === 0
              ? `signed in as ${session.principal}: nothing is granted to you yet`
              : `signed in as ${session.principal}: ${objects.length} table(s) you may read`);
          } catch (e) {
            say(e instanceof Error ? e.message : String(e), true);
          }
        })();
      });
      whOpen.addEventListener('click', () => {
        const chosen = objects[Number(whTable.value)];
        if (!chosen || !session) return;
        void (async () => {
          try {
            // A warehouse table is read-only: a column the compiler says must be
            // converted to be declared cannot be, so it is left out, and named.
            const m = await inferModel(local.fromCatalog, chosen.columns,
              { table: chosen.name, schema: chosen.schema, convertible: false });
            local.use(m.model, m.runtime);
            const columns = await sourceColumns(planner, m.source);
            app.dispose();
            app = makeApp(
              {
                source: { query: m.source },
                columns,
                derived: [],
                rows: [],
                pivotOn: [],
                measures: [],
                sorts: [],
                epoch: 1,
              },
              {
                ...DEFAULT_CONFIGURATION,
                reportTitle: `${chosen.schema}.${chosen.name}`,
                  },
              [],
              {
                live: new WarehouseEngine(session as WarehouseSession),
                snapTarget: { schema: chosen.schema, table: chosen.name, source: m.source },
              },
            );
            status.textContent = `live on the warehouse as ${(session as WarehouseSession).principal}`;
            await app.open();
            say(`${chosen.schema}.${chosen.name}: live on the warehouse as ${(session as WarehouseSession).principal}`
              + (m.excluded.length === 0 ? ''
                : ` — left out, as this tab cannot convert them on a read-only table: ${m.excluded.join(', ')}`));
          } catch (e) {
            say(e instanceof Error ? e.message : String(e), true);
          }
        })();
      });
    }
    // THE CUBE ON SCREEN, as a saved cube sees it: the file it reads (by identity, and the
    // File itself so a cube saved over the same file reopens without asking), the handle the
    // browser gave for it (to reopen it from where it was picked), and the saved cube it
    // came from (a Save then saves over it).
    let library: CubeLibrary | undefined;
    let current: {
      source?: FileSource;
      file?: File;
      handle?: FileHandle;
      cubeId?: string;
      name?: string;
      unknown?: Readonly<Record<string, unknown>>;
    } = {};

    /**
     * Read a file into this tab and build a cube over it: a fresh one, or -- `saved` -- a
     * saved cube reconciled with what the file holds NOW.
     */
    async function openFile(
      file: File,
      how: {
        readonly handle?: FileHandle;
        readonly sample?: { readonly id: string; readonly rows: number };
        readonly saved?: { readonly doc: CubeDocument; readonly id?: string };
      } = {},
    ): Promise<readonly string[]> {
      note.classList.remove('bad');
      note.textContent = `reading ${file.name}…`;
      try {
        const opened = await ingestFile(engine, db, file, local.fromCatalog);
        local.use(opened.model, opened.runtime);
        const columns = await sourceColumns(planner, opened.source);
        const source = await fileSource(file, formatOf(file.name), columns, how.sample);
        const saved = how.saved;
        let snap: CubeSnapshot;
        let config: CubeConfiguration;
        let notes: readonly string[] = [];
        let tree: TreeState | undefined;
        if (saved) {
          const cube = openCube(saved.doc, { query: opened.source }, columns);
          snap = cube.snapshot;
          config = cube.configuration;
          tree = cube.tree;
          notes = [
            ...(source.sha256 !== saved.doc.source.sha256
              ? [`${file.name} is not the file this cube was saved over (its contents differ)`]
              : []),
            ...cube.notes,
          ];
        } else {
          // A freshly opened file groups by nothing: show the rows as
          // they are and let the user build the cube up. Guessing at
          // dimensions and measures would be wrong more often than
          // the guess is worth.
          snap = {
            source: { query: opened.source },
            columns,
            derived: [],
            rows: [],
            pivotOn: [],
            measures: [],
            sorts: [],
            epoch: 1,
          };
          config = {
            ...DEFAULT_CONFIGURATION,
            reportTitle: opened.fileName,
          };
        }
        app.dispose();
        app = makeApp(snap, config, [], { cubeSource: source });
        if (tree) app.controller.adoptTree(tree);
        current = {
          source,
          file,
          ...(how.handle ? { handle: how.handle } : {}),
          ...(saved?.id ? { cubeId: saved.id } : {}),
          ...(saved ? { name: saved.doc.name } : {}),
          ...(saved?.doc.unknown ? { unknown: saved.doc.unknown } : {}),
        };
        // open() is what runs the first query; without it the
        // chrome renders and the grid stays empty.
        await app.open();
        note.textContent = `${opened.fileName}: `
          + `${opened.rowCount.toLocaleString()} rows, `
          + `${columns.length} columns`;
        library?.sync();
        return notes;
      } catch (e) {
        // Say what failed and about which file. An uploaded file is
        // the one input the user can actually fix.
        note.classList.add('bad');
        note.textContent = `could not open ${file.name}: `
          + (e instanceof Error ? e.message : String(e));
        throw e;
      }
    }

    // SAVED CUBES, in this browser: IndexedDB when the browser gives it, else memory (this
    // visit only, and said so). One database holds the cubes and their files' handles.
    let store: CubeStore;
    let handles: FileHandles | undefined;
    let persistent = false;
    try {
      const database = openCubeDatabase();
      await database;
      store = new RuleStore(new BrowserRecords(database), 'this browser');
      handles = new FileHandles(database);
    } catch {
      store = new RuleStore(new MemoryRecords(), 'this browser');
    }

    /**
     * The file a saved cube needs, got the least intrusive way that works: a sample is
     * rebuilt; the file already open is reused when it IS that file; a kept handle is read
     * (asking for the browser's permission takes a click, so the window offers one);
     * otherwise the user is asked for it.
     */
    async function fileFor(
      doc: CubeDocument,
      id: string | undefined,
    ): Promise<{ file: File; handle?: FileHandle } | undefined> {
      const src = doc.source;
      if (src.sample) {
        const s = sampleById(src.sample.id);
        if (s) {
          return { file: new File([s.build(src.sample.rows)], src.name, { type: mimeOf(s) }) };
        }
      }
      if (current.file && current.source?.sha256 === src.sha256) {
        return { file: current.file, ...(current.handle ? { handle: current.handle } : {}) };
      }
      const kept = id !== undefined ? await handles?.get(id) : undefined;
      if (kept) {
        const read = await readHandle(kept, false);
        if (read.state === 'file') return { file: read.file, handle: kept };
        if (read.state === 'needs-click') {
          return new Promise((resolve) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = `Open ${kept.name}`;
            button.addEventListener('click', () => {
              void readHandle(kept, true).then(async (again) => {
                library?.ask(undefined);
                resolve(again.state === 'file' ? { file: again.file, handle: kept } : await chooseFile(doc));
              });
            });
            library?.ask([`"${doc.name}" reads ${kept.name} from where you picked it. The browser wants you to allow it:`, button]);
          });
        }
      }
      return chooseFile(doc);
    }

    /** Ask the user for the file, naming the one the cube was saved over. */
    function chooseFile(doc: CubeDocument): Promise<{ file: File; handle?: FileHandle } | undefined> {
      return new Promise((resolve) => {
        const src = doc.source;
        const choose = document.createElement('button');
        choose.type = 'button';
        choose.textContent = 'Choose file…';
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.csv,.parquet,.json,.jsonl,.ndjson';
        input.hidden = true;
        input.className = 'dc-lib-choose';
        input.addEventListener('change', () => {
          const file = input.files?.[0];
          library?.ask(undefined);
          resolve(file ? { file } : undefined);
        });
        choose.addEventListener('click', () => {
          if (!canKeepHandles()) {
            input.click();
            return;
          }
          void pickDataFile().then((picked) => {
            library?.ask(undefined);
            resolve(picked);
          });
        });
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.textContent = 'Cancel';
        cancel.addEventListener('click', () => {
          library?.ask(undefined);
          resolve(undefined);
        });
        library?.ask([
          `"${doc.name}" was built over ${src.name} (${bytes(src.size)}). Choose that file:`,
          choose, cancel, input,
        ]);
      });
    }

    /** Open a saved cube (from the store, or a file someone handed over). */
    async function openDocument(doc: CubeDocument, id: string | undefined): Promise<void> {
      const got = await fileFor(doc, id);
      if (!got) {
        library?.say('not opened: no file chosen', 'warn');
        return;
      }
      const notes = await openFile(got.file, {
        ...(got.handle ? { handle: got.handle } : {}),
        ...(doc.source.sample ? { sample: doc.source.sample } : {}),
        saved: { doc, ...(id !== undefined ? { id } : {}) },
      });
      if (id !== undefined && got.handle) await handles?.put(id, got.handle);
      library?.say(notes.length === 0
        ? `opened "${doc.name}"`
        : `opened "${doc.name}", with changes since it was saved:\n${notes.map((n) => `- ${n}`).join('\n')}`,
      notes.length === 0 ? 'ok' : 'warn');
    }

    library = new CubeLibrary(must('cubelib'), store, {
      saveName: () => (current.source ? current.name ?? app.configuration.reportTitle ?? current.source.name : undefined),
      currentId: () => current.cubeId,
      save: async (name, asNew) => {
        const doc = app.cubeDocument(name, current.unknown);
        if (!doc) throw new Error('this cube cannot be saved yet: only cubes over a file are');
        const id = !asNew && current.cubeId !== undefined ? current.cubeId : crypto.randomUUID();
        const record = { id, name, content: doc as unknown as Record<string, unknown> };
        if (id === current.cubeId) await store.update(id, record);
        else await store.create(record);
        if (current.handle) await handles?.put(id, current.handle);
        current = { ...current, cubeId: id, name };
        if (!persistent) persistent = await persistStorage();
      },
      open: async (id) => openDocument(readCube((await store.get(id)).content), id),
      openText: async (text) => openDocument(readCube(text), undefined),
      forget: async (id) => {
        await handles?.remove(id);
        if (current.cubeId === id) {
          const { cubeId: _gone, ...rest } = current;
          current = rest;
        }
      },
    });
    showCubes = () => {
      toggleHostWindow('cubeswin');
      library?.sync();
      void library?.refresh();
    };

    // Build the chosen sample. No row cap: the one hard limit is the
    // browser's longest string (about 512M characters, some millions
    // of rows), and past it the build throws a RangeError -- said in
    // plain words below rather than guessed at with a ceiling here.
    const buildSample = (): { s: Sample; text: string; name: string;
      rows: number } | undefined => {
      const s = sampleById(pick.value);
      if (!s) return undefined;
      const rows = Math.max(1, Math.floor(Number(rowsInput.value))
        || s.defaultRows);
      return { s, text: s.build(rows), name: sampleFileName(s), rows };
    };
    const tooBig = (e: unknown): string =>
      e instanceof RangeError
        ? `${Number(rowsInput.value).toLocaleString()} rows is more than `
          + 'this tab can hold as one file -- try fewer'
        : e instanceof Error ? e.message : String(e);
    const mimeOf = (s: Sample): string =>
      s.format === 'jsonl' ? 'application/x-ndjson' : 'text/csv';

    // Open: generate and load it, the same path a picked file takes.
    must('sampleopen').addEventListener('click', () => {
      note.classList.remove('bad');
      note.textContent = `building ${Number(rowsInput.value)
        .toLocaleString()} rows…`;
      // Generating 200k rows is a second of synchronous string
      // building; let the note paint before starting.
      setTimeout(() => {
        let built;
        try {
          built = buildSample();
        } catch (e) {
          note.classList.add('bad');
          note.textContent = tooBig(e);
          return;
        }
        if (!built) return;
        void openFile(new File([built.text], built.name,
          { type: mimeOf(built.s) }), { sample: { id: built.s.id, rows: built.rows } }).catch(() => {});
      }, 0);
    });

    // Or keep it: the same file, saved, for sharing or reopening.
    must('sampledownload').addEventListener('click', (ev) => {
      ev.preventDefault();
      note.classList.remove('bad');
      setTimeout(() => {
        let built;
        try {
          built = buildSample();
        } catch (e) {
          note.classList.add('bad');
          note.textContent = tooBig(e);
          return;
        }
        if (!built) return;
        const url = URL.createObjectURL(
          new Blob([built.text], { type: mimeOf(built.s) }));
        const a = document.createElement('a');
        a.href = url;
        a.download = built.name;
        a.click();
        URL.revokeObjectURL(url);
        note.textContent = `${built.name} saved `
          + `(${built.rows.toLocaleString()} rows)`;
      }, 0);
    });

    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (file) void openFile(file).catch(() => {});
    });
    // Where the browser can keep a handle to the picked file, pick THROUGH it: a saved cube
    // then reopens its file from where it was picked (file-handles.ts).
    input.addEventListener('click', (event) => {
      if (!canKeepHandles()) return;
      event.preventDefault();
      void pickDataFile().then((picked) => {
        if (picked) void openFile(picked.file, { handle: picked.handle }).catch(() => {});
      });
    });
  }
}

/**
 * A host panel, shown as a floating window.
 *
 * The same window the cube uses for its own dialogs
 * (`src/ui/window.ts`), so a panel the host adds behaves like the
 * ones it did not: dragged by its header, resized from any edge, and
 * remembering where it was left.
 */
/** A size in words: 2.1 MB. */
function bytes(n: number): string {
  if (n < 1024) return `${n} bytes`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const hostWindows = new Map<string, WindowSpec>();

function toggleHostWindow(id: string): void {
  const el = must(id);
  if (!el.hidden) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  const head = el.querySelector('.hostwin-head');
  if (!(head instanceof HTMLElement)) return;
  hostWindows.set(id, makeWindow(el, head, document.body, {
    width: 720,
    height: 420,
    ...(hostWindows.get(id) ? { spec: hostWindows.get(id) } : {}),
    onChange: (spec) => hostWindows.set(id, spec),
  }));
}


/**
 * Pick a label by an explicit index expression.
 *
 * The index is passed in rather than derived from the value count,
 * because deriving it gave every dimension the same `i % n` and made
 * them perfectly correlated: each desk then had exactly one year, so
 * four of five pivot columns were legitimately null and the grid
 * looked broken. Independent divisors make every combination occur.
 */
function sqlPick(values: readonly string[], indexExpr: string): string {
  const cases = values.map((v, i) => `WHEN ${i} THEN '${v}'`).join(' ');
  return `CASE (${indexExpr}) ${cases} END`;
}

export function must(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
}

const SETTINGS_KEY = 'dataCube.settings';

/** The settings this browser kept, or none. */
function storedSettings(): Record<string, unknown> | undefined {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    const parsed: unknown = raw === null ? undefined : JSON.parse(raw);
    return parsed !== null && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}
