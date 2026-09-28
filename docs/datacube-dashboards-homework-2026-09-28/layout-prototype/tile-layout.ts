// The tile layout, as data: where each tile of a page sits on an
// N-column snap grid, and what every gesture does to that.
//
// PURE. No DOM, no pixels, no state: every function takes a layout
// and returns a new one, so the whole behaviour of the page -- drag,
// resize, keyboard, the responsive re-pack -- is testable in node the
// way window.ts's `resize` is, and the pointer layer on top only has
// to turn pixels into (x, y, w, h) and call in here.
//
// The rules, all enforced by construction and checked by `problems`:
//   - a tile lies inside the columns, at y >= 0, no smaller than its
//     minimum;
//   - no two tiles overlap;
//   - a static tile never moves or resizes because of another's gesture;
//   - after a gesture everything floats up (gravity), static tiles
//     excepted, and nothing passes THROUGH another tile to get there.

export interface Tile {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly minW?: number;
  readonly minH?: number;
  readonly maxW?: number;
  readonly maxH?: number;
  /** Pinned: never pushed, never floated, never dragged. */
  readonly static?: boolean;
}

export type Layout = readonly Tile[];

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(Math.max(v, lo), hi);

/** True when the two rectangles share any cell. Edges touching is not a collision. */
export function collides(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w
    && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** The first row below every tile. */
export function bottom(layout: Layout): number {
  let max = 0;
  for (const t of layout) max = Math.max(max, t.y + t.h);
  return max;
}

/** Reading order: row, then column, then id so ties are deterministic. */
export function byReadingOrder(a: Tile, b: Tile): number {
  return a.y - b.y || a.x - b.x || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/**
 * The tile's size, clamped to its own min/max and to the columns.
 *
 * The column limit wins over minW: a minW of 4 on a 1-column phone
 * cannot be honoured, and a tile wider than the page is worse than a
 * tile narrower than it asked for.
 */
function clampSize(t: Tile, w: number, h: number, cols: number): { w: number; h: number } {
  const cw = clamp(w, t.minW ?? 1, t.maxW ?? Infinity);
  return {
    w: clamp(Math.round(cw), 1, cols),
    h: Math.max(1, Math.round(clamp(h, t.minH ?? 1, t.maxH ?? Infinity))),
  };
}

/** A tile made legal on `cols` columns: sized, then moved inside. */
export function normalize(t: Tile, cols: number): Tile {
  const { w, h } = clampSize(t, t.w, t.h, cols);
  return {
    ...t,
    w,
    h,
    x: clamp(Math.round(t.x), 0, cols - w),
    y: Math.max(0, Math.round(t.y)),
  };
}

function firstCollision(r: Rect, others: Iterable<Rect>): Rect | undefined {
  for (const o of others) if (collides(r, o)) return o;
  return undefined;
}

/**
 * The first row at or below `r.y` where `r` hits nothing in `placed`.
 *
 * Jumps straight past each obstacle's bottom rather than stepping one
 * row at a time: same answer, and a push through a tall column of
 * tiles costs one test per tile instead of one per row.
 */
function firstFreeRowDown(r: Rect, placed: readonly Rect[]): number {
  let y = r.y;
  for (;;) {
    const hit = firstCollision({ ...r, y }, placed);
    if (!hit) return y;
    y = hit.y + hit.h;
  }
}

/**
 * Gravity: every non-static tile floats up as far as it can.
 *
 * In reading order, each tile rises one row at a time while the row
 * above is free of everything already settled -- so a tile never
 * passes THROUGH another to reach a gap above it (that would reorder
 * the page behind the user's back). Static tiles are obstacles that
 * are settled from the start. `pinned` tiles are held where they are
 * too: the tile under the user's pointer during a drag.
 */
export function compact(layout: Layout, pinned: ReadonlySet<string> = new Set()): Tile[] {
  const fixed = layout.filter((t) => t.static || pinned.has(t.id));
  const placed: Rect[] = [...fixed];
  const out = new Map<string, Tile>(fixed.map((t) => [t.id, t]));
  for (const t of [...layout].filter((t) => !out.has(t.id)).sort(byReadingOrder)) {
    let y = t.y;
    while (y > 0 && !firstCollision({ ...t, y: y - 1 }, placed)) y--;
    // Settled tiles may now sit where this one was (a pinned tile
    // dropped on it): go down past them instead.
    y = firstFreeRowDown({ ...t, y }, placed);
    const next = y === t.y ? t : { ...t, y };
    placed.push(next);
    out.set(t.id, next);
  }
  return layout.map((t) => out.get(t.id)!);
}

/**
 * Push every tile off whatever `moved` (and the statics) now covers.
 *
 * In reading order, each tile is placed at the first free row at or
 * below where it is, given everything placed before it. A tile pushed
 * down may land on another; that one is placed after it and is pushed
 * in turn -- the cascade -- and because every placement avoids every
 * earlier one, the result has no overlap by construction and the loop
 * always ends.
 */
function pushDown(layout: Layout, moved: Tile): Tile[] {
  const fixed: Tile[] = [moved, ...layout.filter((t) => t.static && t.id !== moved.id)];
  const placed: Rect[] = [...fixed];
  const out = new Map<string, Tile>(fixed.map((t) => [t.id, t]));
  for (const t of [...layout].filter((t) => !out.has(t.id)).sort(byReadingOrder)) {
    const y = firstFreeRowDown(t, placed);
    const next = y === t.y ? t : { ...t, y };
    placed.push(next);
    out.set(t.id, next);
  }
  return layout.map((t) => out.get(t.id)!);
}

export interface PlaceOptions {
  /**
   * Keep the moved tile where it was put instead of letting it float
   * up. True while a drag is in flight (the placeholder stays under
   * the pointer); false for the drop and for keyboard moves.
   */
  readonly hold?: boolean;
  /** Try to lift a tile ABOVE one moved down onto it (drag / keyboard move). */
  readonly swap?: boolean;
}

/**
 * Put tile `id` at `rect` and settle the page around it.
 *
 * The one core the gestures share. A static tile is never moved; a
 * tile put on a static one lands below it; a tile moved DOWN onto
 * another first tries to lift that one into the space above (so
 * dragging A over B swaps them, as every dashboard does); anything
 * still in the way is pushed down, cascading; then gravity.
 */
export function place(
  layout: Layout,
  id: string,
  rect: Rect,
  cols: number,
  options: PlaceOptions = {},
): Tile[] {
  const from = layout.find((t) => t.id === id);
  if (!from) throw new Error(`no tile ${id}`);
  if (from.static) return [...layout];
  const statics = layout.filter((t) => t.static);
  let target = normalize({ ...from, ...rect }, cols);
  target = { ...target, y: firstFreeRowDown(target, statics) };

  let tiles = layout.map((t) => (t.id === id ? target : t));
  if (options.swap && target.y > from.y) {
    const others = tiles.filter((t) => t.id !== id);
    for (const c of others.filter((t) => !t.static && collides(t, target)).sort(byReadingOrder)) {
      const up = { ...c, y: Math.max(0, target.y - c.h) };
      const rest = tiles.filter((t) => t.id !== c.id);
      if (!firstCollision(up, rest)) tiles = tiles.map((t) => (t.id === c.id ? up : t));
    }
  }
  tiles = pushDown(tiles, target);
  return compact(tiles, options.hold ? new Set([id]) : new Set());
}

/** Move tile `id` to column `x`, row `y`. */
export function moveTile(layout: Layout, id: string, x: number, y: number, cols: number,
  options: PlaceOptions = { swap: true }): Tile[] {
  const t = layout.find((t) => t.id === id);
  if (!t) throw new Error(`no tile ${id}`);
  return place(layout, id, { x, y, w: t.w, h: t.h }, cols, options);
}

/**
 * Resize tile `id` to `w` x `h`, keeping its top-left corner.
 *
 * A static tile in the way stops the growth on the axis that hit it
 * rather than being pushed (it cannot be) or the resize being refused
 * outright (the other axis may well fit).
 */
export function resizeTile(layout: Layout, id: string, w: number, h: number, cols: number,
  options: PlaceOptions = {}): Tile[] {
  return resizeRect(layout, id, { ...tileOf(layout, id), w, h }, cols, options);
}

/** Resize to an arbitrary rectangle (a west or north edge moves x or y as well). */
export function resizeRect(layout: Layout, id: string, rect: Rect, cols: number,
  options: PlaceOptions = {}): Tile[] {
  const from = tileOf(layout, id);
  if (from.static) return [...layout];
  const statics = layout.filter((t) => t.static);
  const want = normalize({ ...from, ...rect }, cols);
  const candidates: Rect[] = [
    want,
    { ...want, x: from.x, w: from.w }, // keep the width, take the height
    { ...want, y: from.y, h: from.h }, // keep the height, take the width
    from,
  ];
  const ok = candidates.find((r) => !firstCollision(r, statics))!;
  return place(layout, id, ok, cols, { ...options, swap: false });
}

/** The edge a pointer resize is dragging, as window.ts names them. */
export type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

/**
 * The rectangle a drag of (dCols, dRows) on `edge` asks for -- the
 * grid-unit twin of window.ts `resize`: a west or north edge moves the
 * tile and shrinks it at once, and the minimum stops that edge rather
 * than letting the opposite one run away.
 */
export function edgeRect(t: Tile, edge: Edge, dCols: number, dRows: number): Rect {
  const minW = t.minW ?? 1;
  const minH = t.minH ?? 1;
  let { x, y, w, h } = t;
  if (edge.includes('e')) w = Math.max(minW, t.w + dCols);
  if (edge.includes('s')) h = Math.max(minH, t.h + dRows);
  if (edge.includes('w')) {
    w = Math.max(minW, Math.min(t.w - dCols, t.x + t.w));
    x = t.x + (t.w - w);
  }
  if (edge.includes('n')) {
    h = Math.max(minH, Math.min(t.h - dRows, t.y + t.h));
    y = t.y + (t.h - h);
  }
  return { x, y, w, h };
}

function tileOf(layout: Layout, id: string): Tile {
  const t = layout.find((t) => t.id === id);
  if (!t) throw new Error(`no tile ${id}`);
  return t;
}

const sameLayout = (a: Layout, b: Layout): boolean =>
  a.length === b.length && a.every((t, i) => {
    const u = b[i]!;
    return t.id === u.id && t.x === u.x && t.y === u.y && t.w === u.w && t.h === u.h;
  });

export interface KeyResult {
  readonly layout: Tile[];
  /** False when the step was blocked (an edge, a static tile): announce it, change nothing. */
  readonly changed: boolean;
}

/**
 * One keyboard step: arrow keys in edit mode.
 *
 * A step is "the next DIFFERENT page in that direction", not "one row":
 * under gravity, moving a tile down one row onto its neighbour settles
 * straight back where it was, so the keyboard would appear dead. Rows
 * are tried until the settled page differs, which in practice means
 * down swaps with the next tile below and up with the one above.
 * Sideways is one column, clamped at the edges.
 */
export function moveBy(layout: Layout, id: string, dx: number, dy: number, cols: number): KeyResult {
  const t = tileOf(layout, id);
  if (t.static || (dx === 0 && dy === 0)) return { layout: [...layout], changed: false };
  const x = clamp(t.x + dx, 0, cols - t.w);
  if (dy === 0) {
    if (x === t.x) return { layout: [...layout], changed: false };
    const next = moveTile(layout, id, x, t.y, cols);
    return { layout: next, changed: !sameLayout(next, layout) };
  }
  const limit = bottom(layout) + 1;
  for (let y = t.y + dy; y >= 0 && y <= limit; y += dy) {
    const next = moveTile(layout, id, x, y, cols);
    if (!sameLayout(next, layout)) return { layout: next, changed: true };
  }
  return { layout: [...layout], changed: false };
}

/** One keyboard resize step: shift+arrows grow/shrink from the bottom-right. */
export function resizeBy(layout: Layout, id: string, dw: number, dh: number, cols: number): KeyResult {
  const t = tileOf(layout, id);
  if (t.static) return { layout: [...layout], changed: false };
  const next = resizeTile(layout, id, t.w + dw, t.h + dh, cols);
  return { layout: next, changed: !sameLayout(next, layout) };
}

/**
 * The page on `toCols` columns, from its canonical layout on `fromCols`.
 *
 * DERIVED, NEVER STORED: the page JSON keeps the one canonical layout
 * and every narrower one is computed from it, so going 12 -> 1 -> 12
 * gives back exactly the page that was saved (gridstack spends ~370
 * lines caching per-column layouts to get the same effect).
 *
 * Reading order (row, then column) is preserved: each tile is scaled
 * proportionally, then placed at the first free row at or below the
 * previous tile's row. On one column this is a plain stack in reading
 * order, which is what a phone should show and what a screen reader
 * reads.
 */
export function fitToColumns(layout: Layout, fromCols: number, toCols: number): Tile[] {
  if (toCols === fromCols) return layout.map((t) => normalize(t, toCols));
  const r = toCols / fromCols;
  const order = [...layout].sort(byReadingOrder);
  const placed: Rect[] = [];
  const out = new Map<string, Tile>();
  let floor = 0;
  for (const t of order) {
    // A static tile's pin is a statement about the wide page; on a
    // narrow one it flows with the rest, but stays unmovable there.
    // SCALE THE EDGES, NOT THE WIDTH. Rounding x and w separately
    // turned two 6-wide halves on 12 columns into 3-wide tiles at x=0
    // and x=2 on 5 -- overlapping, so the second was pushed down and a
    // side-by-side pair became a staircase. Rounding each edge keeps
    // neighbours that touched still touching.
    const left = Math.round(t.x * r);
    const right = Math.round((t.x + t.w) * r);
    const scaled = normalize({
      ...t,
      x: left,
      w: Math.max(1, right - left),
      y: floor,
    }, toCols);
    const y = firstFreeRowDown(scaled, placed);
    const next = { ...scaled, y };
    placed.push(next);
    out.set(t.id, next);
    floor = y;
  }
  return layout.map((t) => out.get(t.id)!);
}

/** Every rule the layout breaks; empty when it is a legal page. */
export function problems(layout: Layout, cols: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  layout.forEach((t, i) => {
    if (seen.has(t.id)) out.push(`duplicate id ${t.id}`);
    seen.add(t.id);
    if (!Number.isInteger(t.x) || !Number.isInteger(t.y) || !Number.isInteger(t.w) || !Number.isInteger(t.h)) {
      out.push(`${t.id}: non-integer`);
    }
    if (t.x < 0 || t.y < 0 || t.w < 1 || t.h < 1 || t.x + t.w > cols) out.push(`${t.id}: out of bounds`);
    for (const u of layout.slice(i + 1)) if (collides(t, u)) out.push(`${t.id} overlaps ${u.id}`);
  });
  return out;
}

/** What a screen reader hears after a step (aria-live): 1-based, in words. */
export function describe(t: Tile, cols: number): string {
  return `${t.id}: column ${t.x + 1} of ${cols}, row ${t.y + 1}, ${t.w} wide, ${t.h} tall`;
}
