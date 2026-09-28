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

/** A grid cell: where the pointer is. */
export interface Cell {
  readonly x: number;
  readonly y: number;
}

const contains = (r: Rect, c: Cell): boolean =>
  c.x >= r.x && c.x < r.x + r.w && c.y >= r.y && c.y < r.y + r.h;

/**
 * Lay `row` side by side from column `x0`, `span` columns, in the given
 * order: equal shares, the columns left over to the first tiles, one each.
 * Null when a share would be narrower than a tile's minimum.
 */
function share(row: readonly Tile[], x0: number, span: number): Tile[] | null {
  const each = Math.floor(span / row.length);
  let x = x0;
  const out: Tile[] = [];
  for (const [i, t] of row.entries()) {
    const w = each + (i < span - each * row.length ? 1 : 0);
    if (w < (t.minW ?? 1)) return null;
    out.push({ ...t, x, w });
    x += w;
  }
  return out;
}

/** `layout` with `changed` swapped in, or null when a changed tile would overlap an unchanged one. */
function swapIn(layout: readonly Tile[], changed: readonly Tile[]): Tile[] | null {
  const ids = new Set(changed.map((t) => t.id));
  const kept = layout.filter((t) => !ids.has(t.id));
  if (changed.some((c) => firstCollision(c, kept))) return null;
  return [...kept, ...changed];
}

/**
 * The page with tile `id` taken off it, its hole healed: what floats up
 * floats up, and then, if the hole is still there, its row closes over it
 * -- the tiles that sat beside it on the same row share the row's width
 * again, or else the neighbour it was beside widens back into it. So a
 * chart taken from beside the grid gives the grid its width back, and one
 * taken from a row of charts leaves the rest of the row sharing it.
 */
export function liftTile(layout: Layout, id: string, cols: number): Tile[] {
  const gone = tileOf(layout, id);
  const rest = compact(layout.filter((t) => t.id !== id));
  if (gone.static) return rest;
  // the row it was part of: tiles on its top edge, running unbroken through its place
  const onRow = [...rest.filter((t) => t.y === gone.y && !t.static), gone].sort((a, b) => a.x - b.x);
  const at = onRow.indexOf(gone);
  let lo = at;
  let hi = at;
  while (lo > 0 && onRow[lo - 1]!.x + onRow[lo - 1]!.w === onRow[lo]!.x) lo--;
  while (hi < onRow.length - 1 && onRow[hi]!.x + onRow[hi]!.w === onRow[hi + 1]!.x) hi++;
  const run = onRow.slice(lo, hi + 1);
  const neighbours = run.filter((t) => t.id !== id);
  if (neighbours.length > 0) {
    const x0 = run[0]!.x;
    const span = run[run.length - 1]!.x + run[run.length - 1]!.w - x0;
    const shared = share(neighbours, x0, Math.min(span, cols - x0));
    const healed = shared && swapIn(rest, shared);
    if (healed) return compact(healed);
  }
  return rest;
}

/** Take tile `id` off the page for good: lifted, hole healed, settled. */
export function removeTile(layout: Layout, id: string, cols: number): Tile[] {
  return liftTile(layout, id, cols).sort((a, b) =>
    layout.findIndex((t) => t.id === a.id) - layout.findIndex((t) => t.id === b.id));
}

/**
 * Whether `t` is one of a ROW: tiles side by side on one top edge, of one
 * height, none wider than half the page. A wide tile with a narrow one
 * beside it (a grid and its side chart) is not a row -- dropping on the
 * grid must not squeeze it into sharing the width with its neighbours.
 */
function inRow(layout: readonly Tile[], t: Tile, cols: number): boolean {
  const members = layout.filter((u) => u.y === t.y && u.h === t.h && !u.static);
  return members.length >= 2 && members.every((u) => u.w <= cols / 2);
}

/**
 * Put `d` into the row starting at `d.y`: the tiles whose top edge is that
 * row and whose height is `d`'s (a tall tile beside the row is not part of
 * it). The row's tiles, with `d` among them where the pointer says, are
 * laid side by side -- keeping their widths when they fit the page,
 * sharing it evenly when not. Null when `d` would cover something that is
 * not on the row, or the row cannot take it.
 */
function intoRow(rest: readonly Tile[], d: Tile, pointer: Cell, cols: number): Tile[] | null {
  const member = (t: Tile) => t.y === d.y && t.h === d.h && !t.static;
  const row = rest.filter(member).sort((a, b) => a.x - b.x);
  if (row.length === 0) return null;
  const before = row.filter((t) => t.x + t.w / 2 <= pointer.x);
  const order = [...before, d, ...row.filter((t) => !before.includes(t))];
  const total = order.reduce((n, t) => n + t.w, 0);
  let laid: Tile[] | null;
  if (total <= cols) {
    // keep every width; start where the row did, pulled left if it would overrun
    let x = Math.min(row[0]!.x, d.x, cols - total);
    laid = order.map((t) => {
      const placed = { ...t, x };
      x += t.w;
      return placed;
    });
  } else {
    laid = share(order, 0, cols);
  }
  return laid && swapIn(rest.filter((t) => !member(t)), laid);
}

/**
 * Where a tile dragged by the pointer lands. The drag's one rule is that
 * NOTHING MOVES UNLESS THE POINTER IS ON IT: the tile's rectangle brushing
 * a neighbour displaces nothing; what the pointer is over decides.
 *
 *   - its own place: nothing changes (a grab is not a move);
 *   - a tile of the same size: the two swap;
 *   - near the left or right edge of a tile that can give up the width
 *     (keeping half of its own): the dragged tile goes beside it;
 *   - near the top of a tile: the dragged tile goes above it;
 *   - anywhere else on a tile: below it -- into the row there, if one
 *     starts there;
 *   - empty space: where it is put, joining the row it lands on, slid
 *     sideways under the pointer, or else down, clear of what it covers.
 *
 * The tile is lifted first (`liftTile`: its hole healed), and the page is
 * settled after, so the answer is exactly where the drop lands: the
 * placeholder shows it, and letting go puts the tile there.
 */
export function dragTile(layout: Layout, id: string, rect: Rect, pointer: Cell, cols: number): Tile[] {
  const from = tileOf(layout, id);
  if (from.static || contains(from, pointer)) return [...layout];
  const rest = liftTile(layout, id, cols);
  const want = normalize({ ...from, x: rect.x, y: rect.y }, cols);
  const over = rest.find((t) => contains(t, pointer));
  let settled: Tile[] | null = null;
  let target: Tile = want;
  if (over && over.static) {
    target = { ...want, y: firstFreeRowDown(want, rest) };
  } else if (over && !(over.w === from.w && over.h === from.h) && inRow(rest, over, cols)
    && (settled = intoRow(rest, { ...want, y: over.y, h: Math.max(from.minH ?? 1, over.h) }, pointer, cols))) {
    // a tile of a row: join the row there, at its height
  } else if (over && over.w === from.w && over.h === from.h) {
    // same size: trade places
    settled = [...rest.map((t) => (t.id === over.id ? { ...t, x: from.x, y: from.y } : t)),
      { ...from, x: over.x, y: over.y }];
    if (firstCollision(settled[settled.length - 1]!, settled.slice(0, -1))) settled = null;
  } else if (over) {
    const side = Math.max(1, Math.min(2, Math.floor(over.w / 4)));
    const top = Math.min(Math.ceil(over.h / 2), Math.max(2, Math.ceil(from.h / 2)));
    const room = over.w - from.w >= Math.max(over.minW ?? 1, Math.ceil(over.w / 2));
    const left = pointer.x < over.x + side;
    const right = pointer.x >= over.x + over.w - side;
    if (room && (left || right)) {
      const narrowed = { ...over, w: over.w - from.w, x: left ? over.x + from.w : over.x };
      // beside it, as tall as it: flush, no hole under the shorter one
      target = { ...from, x: left ? over.x : over.x + over.w - from.w, y: over.y,
        h: Math.max(from.minH ?? 1, over.h) };
      settled = pushDown([...rest.map((t) => (t.id === over.id ? narrowed : t)), target], target);
    } else if (pointer.y < over.y + top) {
      target = { ...want, y: over.y };
    } else {
      // below it: into the row there, at the row's height
      const y = over.y + over.h;
      const rowH = rest.find((t) => t.y === y && !t.static)?.h;
      target = { ...want, y, h: Math.max(from.minH ?? 1, rowH ?? want.h) };
      settled = intoRow(rest, target, pointer, cols);
    }
  } else if (firstCollision(want, rest)) {
    // overlapping a row: join it (the nearest, when it covers more than one)
    const rows = [...new Set(rest.filter((t) => collides(t, want) && t.h === want.h).map((t) => t.y))]
      .sort((a, b) => Math.abs(a - want.y) - Math.abs(b - want.y));
    for (const y of rows) {
      settled = intoRow(rest, { ...want, y }, pointer, cols);
      if (settled) break;
    }
    if (!settled) {
      // slide clear sideways, still under the pointer, before going down
      const xs: number[] = [];
      for (let x = Math.max(0, pointer.x - want.w + 1); x <= Math.min(pointer.x, cols - want.w); x++) xs.push(x);
      xs.sort((a, b) => Math.abs(a - want.x) - Math.abs(b - want.x));
      const x = xs.find((x) => !firstCollision({ ...want, x }, rest));
      target = x !== undefined ? { ...want, x } : { ...want, y: firstFreeRowDown(want, rest) };
    }
  }
  settled ??= pushDown([...rest, target], target);
  return compact(settled)
    .sort((a, b) => layout.findIndex((t) => t.id === a.id) - layout.findIndex((t) => t.id === b.id));
}

/**
 * The page a board shows until its user arranges it by hand: the main tile
 * across the top, `mainH` rows tall, and the others in rows below it, up to
 * `perRow` side by side sharing the width, each row the rest of one screen
 * (at least `minH`).
 */
export function below(
  main: string, others: readonly string[], cols: number, rows: number, mainH: number,
  perRow = 4, minH = 1,
): Tile[] {
  if (others.length === 0) return [{ id: main, x: 0, y: 0, w: cols, h: rows }];
  const h = Math.max(minH, rows - mainH);
  const out: Tile[] = [{ id: main, x: 0, y: 0, w: cols, h: mainH }];
  for (let start = 0; start < others.length; start += perRow) {
    const row = others.slice(start, start + perRow);
    const share = Math.floor(cols / row.length);
    let x = 0;
    row.forEach((id, i) => {
      // the columns left over go to the first tiles, one each
      const w = share + (i < cols - share * row.length ? 1 : 0);
      out.push({ id, x, y: mainH + (start / perRow) * h, w, h });
      x += w;
    });
  }
  return out;
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

/**
 * The page a board shows until its user arranges it by hand: the main tile
 * on the left, `mainW` wide, the others stacked on its right, sharing the
 * `rows` of one screen evenly -- each at least `minH`, so many of them run
 * past the screen and scroll rather than shrink to nothing. With nothing
 * beside it, the main tile takes the whole width.
 */
export function beside(
  main: string, others: readonly string[], cols: number, rows: number, mainW: number, minH = 1,
): Tile[] {
  if (others.length === 0) return [{ id: main, x: 0, y: 0, w: cols, h: rows }];
  const w = Math.min(Math.max(1, mainW), cols - 1);
  const share = Math.floor(rows / others.length);
  const out: Tile[] = [];
  let y = 0;
  others.forEach((id, i) => {
    // the rows left over go to the first tiles, one each
    const h = Math.max(minH, share + (i < rows - share * others.length ? 1 : 0));
    out.push({ id, x: w, y, w: cols - w, h });
    y += h;
  });
  return [{ id: main, x: 0, y: 0, w, h: rows }, ...out];
}

/** What a screen reader hears after a step (aria-live): 1-based, in words. */
export function describe(t: Tile, cols: number): string {
  return `column ${t.x + 1} of ${cols}, row ${t.y + 1}, ${t.w} wide, ${t.h} tall`;
}
