// A saved page: a cube and the views arranged around it, as one document.
//
// The page WRAPS the cube's own document, by value (cube-document.ts is unchanged,
// and a page holds a cube the way a folder holds a file): the cube is saved and
// reopened exactly as a cube alone is, source reconciled and all. Around it the page
// keeps what only a page has:
//
//   views    what is shown: the cube's grid, and each chart of it -- its title, its
//            spec (plain JSON, ours: chart-spec.ts), frozen or live, and the mark it
//            is filtering the cube to (the conditions are in the cube's filter; the
//            view names them, so the chart can take them off again)
//   layout   where each view sits (tile-layout.ts, full width), and whether it was
//            arranged by hand or is still arranging itself
//
// A cube with no charts is saved as a cube: the page exists when there is more than
// the cube to keep. The same three rules as the cube's document: VERSIONED (a newer
// page is refused by name), UNKNOWN FIELDS KEPT (written back verbatim), and a page
// that cannot be read fails LOUDLY.
//
// Step 1 holds one cube. The list of cubes is already a list, and every view names
// its cube, so pages of several cubes change no field.

import { ExactNumber, fromJson, toJson as protocolJson } from '../../pure-protocol/src/index.ts';
import { CHART_MARKS, type ChartSpec } from './chart-spec.ts';
import { CUBE_KIND, cubeToJson, definitionText, readCube, type CubeDocument } from './cube-document.ts';
import type { FilterNode } from './snapshot.ts';

export const PAGE_KIND = 'datacube.page';
export const PAGE_VERSION = 1;

export interface GridView {
  readonly id: string;
  readonly kind: 'grid';
  /** The cube it shows (an id in `PageDocument.cubes`). */
  readonly cube: string;
  readonly title?: string;
}

export interface ChartView {
  readonly id: string;
  readonly kind: 'chart';
  readonly cube: string;
  readonly title: string;
  readonly spec: ChartSpec;
  /** The conditions this chart's last click put on its cube's filter, if any. */
  readonly selection?: readonly FilterNode[];
}

export type PageView = GridView | ChartView;

export interface PageTile {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface PageLayout {
  readonly kind: 'grid';
  readonly cols: number;
  readonly tiles: readonly PageTile[];
  /** Arranged by hand: kept as it is. Not: still arranging itself as views come and go. */
  readonly arranged: boolean;
}

/** What a cube app shows around its cube: its views and their layout. */
export interface PageViews {
  readonly views: readonly PageView[];
  readonly layout: PageLayout;
}

export interface PageDocument extends PageViews {
  readonly kind: typeof PAGE_KIND;
  readonly version: number;
  readonly name: string;
  readonly cubes: readonly { readonly id: string; readonly cube: CubeDocument }[];
  /** Top-level fields a newer writer added, kept verbatim. */
  readonly unknown?: Readonly<Record<string, unknown>>;
}

export class PageDocumentError extends Error {
  constructor(detail: string) {
    super(`cannot read saved page: ${detail}`);
    this.name = 'PageDocumentError';
  }
}

const KNOWN = new Set(['kind', 'version', 'name', 'cubes', 'views', 'layout']);

/** The one cube of a step-1 page. */
export const PAGE_CUBE = 'cube';

// ---------------------------------------------------------------- writing

export function writePage(o: {
  readonly name: string;
  readonly cube: CubeDocument;
  readonly views: PageViews;
  readonly unknown?: Readonly<Record<string, unknown>>;
}): PageDocument {
  return {
    kind: PAGE_KIND,
    version: PAGE_VERSION,
    name: o.name,
    // the page's name is the cube's too: one name, whichever is opened
    cubes: [{ id: PAGE_CUBE, cube: { ...o.cube, name: o.name } }],
    views: o.views.views,
    layout: o.views.layout,
    ...(o.unknown && Object.keys(o.unknown).length > 0 ? { unknown: o.unknown } : {}),
  };
}

/** The page as a JSON-ready object: each cube as its own document writes itself. */
export function pageContent(page: PageDocument): Record<string, unknown> {
  const { unknown, cubes, ...rest } = page;
  return {
    ...unknown,
    ...rest,
    cubes: cubes.map((c) => ({ id: c.id, cube: fromJson(cubeToJson(c.cube)) })),
  };
}

/** The page as JSON text (exact numbers kept, as the cube's own document keeps them). */
export function pageToJson(page: PageDocument): string {
  return protocolJson(pageContent(page));
}

/**
 * What makes two pages "the same" for "changed since saved": each cube's definition, the
 * views and the layout. Not the name, not the open rows.
 */
export function pageDefinitionText(page: PageDocument): string {
  // the protocol's writer puts keys in one order: a page read back compares equal
  return protocolJson({
    cubes: page.cubes.map((c) => definitionText(c.cube)),
    views: page.views,
    layout: page.layout,
  });
}

// ---------------------------------------------------------------- reading

/** A saved document of either kind: a cube alone, or a page around one. */
export type SavedDocument =
  | { readonly kind: 'cube'; readonly cube: CubeDocument }
  | { readonly kind: 'page'; readonly page: PageDocument };

/** Read a saved cube or page, by its kind. */
export function readSaved(input: string | unknown): SavedDocument {
  const raw = typeof input === 'string' ? parse(input) : input;
  if (isObject(raw) && raw['kind'] === PAGE_KIND) return { kind: 'page', page: readPage(raw) };
  return { kind: 'cube', cube: readCube(raw) };
}

export function readPage(input: string | unknown): PageDocument {
  const raw = typeof input === 'string' ? parse(input) : input;
  if (!isObject(raw)) throw new PageDocumentError('expected an object');
  if (raw['kind'] !== PAGE_KIND) {
    throw new PageDocumentError(`not a saved page (kind ${JSON.stringify(plain(raw['kind']) ?? null)})`);
  }
  const version = plain(raw['version']);
  if (typeof version !== 'number' || version < 1) throw new PageDocumentError('it has no version');
  if (version > PAGE_VERSION) {
    throw new PageDocumentError(`written by a newer version (${version} > ${PAGE_VERSION}); upgrade to open it`);
  }
  if (typeof raw['name'] !== 'string') throw new PageDocumentError("missing 'name'");

  const cubesRaw = raw['cubes'];
  if (!Array.isArray(cubesRaw) || cubesRaw.length === 0) throw new PageDocumentError('it has no cube');
  const cubes = cubesRaw.map((c, i) => {
    if (!isObject(c) || typeof c['id'] !== 'string' || !isObject(c['cube'])) {
      throw new PageDocumentError(`cube ${i + 1} is not an id and a cube`);
    }
    if (c['cube']['kind'] !== CUBE_KIND) throw new PageDocumentError(`cube ${c['id']} is not a saved cube`);
    return { id: c['id'], cube: readCube(c['cube']) };
  });
  const ids = new Set(cubes.map((c) => c.id));

  const viewsRaw = plain(raw['views']);
  if (!Array.isArray(viewsRaw)) throw new PageDocumentError("'views' is not a list");
  const views = viewsRaw.map((v) => readView(v, ids));
  const viewIds = new Set(views.map((v) => v.id));
  if (viewIds.size !== views.length) throw new PageDocumentError('two views share an id');

  const layout = readLayout(plain(raw['layout']), viewIds);

  const unknown: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) if (!KNOWN.has(k)) unknown[k] = plain(v);

  return {
    kind: PAGE_KIND,
    version: PAGE_VERSION,
    name: raw['name'],
    cubes,
    views,
    layout,
    ...(Object.keys(unknown).length > 0 ? { unknown } : {}),
  };
}

function readView(v: unknown, cubes: ReadonlySet<string>): PageView {
  if (!isObject(v) || typeof v['id'] !== 'string') throw new PageDocumentError('a view has no id');
  const id = v['id'];
  if (typeof v['cube'] !== 'string' || !cubes.has(v['cube'])) {
    throw new PageDocumentError(`view ${id} shows no cube of this page`);
  }
  if (v['kind'] === 'grid') {
    return {
      id,
      kind: 'grid',
      cube: v['cube'],
      ...(typeof v['title'] === 'string' ? { title: v['title'] } : {}),
    };
  }
  if (v['kind'] !== 'chart') throw new PageDocumentError(`view ${id} is of an unknown kind ${JSON.stringify(v['kind'] ?? null)}`);
  if (typeof v['title'] !== 'string') throw new PageDocumentError(`chart ${id} has no title`);
  const spec = v['spec'];
  if (!isObject(spec) || spec['version'] !== 1 || !CHART_MARKS.some((m) => m.value === spec['mark'])
    || !Array.isArray(spec['y']) || !isObject(spec['options'])) {
    throw new PageDocumentError(`chart ${id} has no chart it can draw (version 1: a mark, what is plotted, its options)`);
  }
  const selection = v['selection'];
  if (selection !== undefined && !Array.isArray(selection)) {
    throw new PageDocumentError(`chart ${id}'s selection is not a list`);
  }
  return {
    id,
    kind: 'chart',
    cube: v['cube'],
    title: v['title'],
    spec: spec as unknown as ChartSpec,
    ...(selection && selection.length > 0 ? { selection: selection as FilterNode[] } : {}),
  };
}

function readLayout(l: unknown, views: ReadonlySet<string>): PageLayout {
  if (!isObject(l) || l['kind'] !== 'grid') throw new PageDocumentError("'layout' is not a grid layout");
  const cols = l['cols'];
  if (typeof cols !== 'number' || !Number.isInteger(cols) || cols < 1) throw new PageDocumentError("'layout.cols' is not a count");
  if (!Array.isArray(l['tiles'])) throw new PageDocumentError("'layout.tiles' is not a list");
  const tiles = l['tiles'].map((t) => {
    const ok = isObject(t) && typeof t['id'] === 'string'
      && ['x', 'y', 'w', 'h'].every((k) => Number.isInteger(t[k]) && (t[k] as number) >= (k === 'w' || k === 'h' ? 1 : 0));
    if (!ok) throw new PageDocumentError(`a tile is not an id and a place (x, y, w, h): ${JSON.stringify(t)}`);
    const tile = t as unknown as PageTile;
    if (!views.has(tile.id)) throw new PageDocumentError(`a tile shows no view of this page (${tile.id})`);
    return { id: tile.id, x: tile.x, y: tile.y, w: tile.w, h: tile.h };
  });
  return { kind: 'grid', cols, tiles, arranged: l['arranged'] === true };
}

function parse(text: string): unknown {
  try {
    return fromJson(text);
  } catch (e) {
    throw new PageDocumentError(`not valid JSON (${e instanceof Error ? e.message : String(e)})`);
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof ExactNumber);
}

function plain(v: unknown): unknown {
  if (v instanceof ExactNumber) return Number(v.text);
  if (Array.isArray(v)) return v.map(plain);
  if (isObject(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]));
  return v;
}
