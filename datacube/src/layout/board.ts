// The board: tiles on a snap grid, drawn with CSS grid, moved by hand.
//
// What a tile HOLDS is the caller's (a DataCube grid, a chart); where it
// SITS is `tile-layout.ts`, a pure model this file only drives: the pointer
// and the keyboard turn into cells, the model answers the page, CSS grid
// draws it (`grid-column: x+1 / span w`). Nothing here measures a tile's
// content, and a tile is never re-parented (see `#paint`), so a grid inside
// keeps its scroll position and a chart its canvas.
//
// There is no edit mode. A tile's title bar is its handle (a grid's own
// header drags and a chart's clicks inside a tile are never taken); its
// resize corner and remove button show on hover and focus; a double click
// on its title renames it. While a tile is dragged it follows the pointer
// and a placeholder shows exactly where it will land (`dragTile`: nothing
// moves unless the pointer is on it). A focused tile moves with the arrow
// keys and resizes with Shift+arrows, each step announced. A narrow board
// shows one column and cannot be rearranged; the saved layout is never
// changed by a screen's width (`fitToColumns` is derived, not stored).

import {
  describe as describeTile,
  dragTile,
  fitToColumns,
  moveBy,
  moveTile,
  removeTile,
  resizeBy,
  resizeTile,
  type Layout,
  type Rect,
  type Tile,
} from './tile-layout.ts';

export interface BoardTile {
  readonly id: string;
  readonly title: string;
  /** What the tile shows. Placed in the tile once, never moved in the DOM. */
  readonly element: HTMLElement;
  /** Extra buttons for the title bar (a chart's Options). */
  readonly actions?: readonly HTMLElement[];
  /** Whether the tile offers to be removed. */
  readonly removable?: boolean;
  readonly minW?: number;
  readonly minH?: number;
}

export interface BoardOptions {
  /** Columns of the full-width board. */
  readonly cols?: number;
  /** One row's height, in pixels; with `fitRows`, the least it may be. */
  readonly rowHeight?: number;
  /**
   * Rows that fill the board's visible height: each row is that height
   * divided among them, so a layout that many rows tall fits the screen
   * exactly, whatever its size, and a taller one scrolls.
   */
  readonly fitRows?: number;
  /** Space between tiles, in pixels. */
  readonly gap?: number;
  /** Below this width the board is one column and cannot be rearranged. */
  readonly narrowBelow?: number;
  /** The layout changed by the user's hand (not by the screen's width). */
  readonly onChange?: (layout: Layout) => void;
  /** The user asked to remove a tile. The caller removes it. */
  readonly onRemove?: (id: string) => void;
  /** The user renamed a tile. */
  readonly onRename?: (id: string, title: string) => void;
}

interface Placed {
  readonly spec: BoardTile;
  readonly root: HTMLElement;
  readonly title: HTMLElement;
  readonly remove: HTMLButtonElement;
  name: string;
}

export const BOARD_COLUMNS = 12;

export class Board {
  readonly #host: HTMLElement;
  readonly #doc: Document;
  readonly #grid: HTMLElement;
  readonly #placeholder: HTMLElement;
  readonly #live: HTMLElement;
  readonly #cols: number;
  #rowHeight: number;
  readonly #gap: number;
  readonly #narrowBelow: number;
  readonly #options: BoardOptions;
  readonly #tiles = new Map<string, Placed>();
  readonly #observer: ResizeObserver | undefined;
  /** The saved layout, at full width. */
  #layout: Tile[] = [];
  /** What is on screen: the saved layout, or the one a gesture in flight proposes. */
  #shown: Tile[] = [];
  #narrow = false;
  /** The gesture in flight, if any: its tile, what it is, the layout it started from. */
  #gesture: { id: string; kind: 'move' | 'resize'; base: Tile[] } | null = null;

  constructor(host: HTMLElement, options: BoardOptions = {}) {
    this.#host = host;
    this.#doc = host.ownerDocument;
    this.#options = options;
    this.#cols = options.cols ?? BOARD_COLUMNS;
    this.#rowHeight = options.rowHeight ?? 32;
    this.#gap = options.gap ?? 8;
    this.#narrowBelow = options.narrowBelow ?? 640;
    host.classList.add('dc-board');
    this.#grid = this.#doc.createElement('div');
    this.#grid.className = 'dc-board-grid';
    this.#grid.style.gap = `${this.#gap}px`;
    this.#grid.style.gridAutoRows = `${this.#rowHeight}px`;
    this.#placeholder = this.#doc.createElement('div');
    this.#placeholder.className = 'dc-board-placeholder';
    this.#placeholder.hidden = true;
    this.#grid.append(this.#placeholder);
    this.#live = this.#doc.createElement('div');
    this.#live.className = 'dc-board-live';
    this.#live.setAttribute('aria-live', 'polite');
    this.#live.setAttribute('role', 'status');
    host.append(this.#grid, this.#live);
    const Observer = this.#doc.defaultView?.ResizeObserver;
    this.#observer = Observer ? new Observer(() => this.#measure()) : undefined;
    this.#observer?.observe(host);
    this.#measure();
  }

  /** The layout as saved (full width). */
  get layout(): Layout {
    return this.#layout;
  }

  /** How many tiles are on the board. */
  get size(): number {
    return this.#tiles.size;
  }

  /** A tile's title as shown (renamed or not). */
  title(id: string): string | undefined {
    return this.#tiles.get(id)?.name;
  }

  /**
   * Add a tile. With a rectangle it goes there (others make room); without,
   * it goes below everything, at `w` x `h` (defaults 6 x 10).
   */
  add(tile: BoardTile, at: Partial<Pick<Tile, 'x' | 'y' | 'w' | 'h'>> = {}): void {
    if (this.#tiles.has(tile.id)) throw new Error(`a tile ${tile.id} is already on the board`);
    this.#tiles.set(tile.id, this.#make(tile));
    const below = this.#layout.reduce((m, t) => Math.max(m, t.y + t.h), 0);
    const placed: Tile = {
      id: tile.id,
      x: at.x ?? 0,
      y: at.y ?? below,
      w: at.w ?? 6,
      h: at.h ?? 10,
      ...(tile.minW !== undefined ? { minW: tile.minW } : {}),
      ...(tile.minH !== undefined ? { minH: tile.minH } : {}),
    };
    this.#commit(moveTile([...this.#layout, placed], tile.id, placed.x, placed.y, this.#cols));
  }

  /** Take a tile off the board, its neighbours closing over the gap. Its element is detached, not destroyed. */
  remove(id: string): void {
    const placed = this.#tiles.get(id);
    if (!placed) return;
    placed.root.remove();
    this.#tiles.delete(id);
    this.#commit(removeTile(this.#layout, id, this.#cols));
  }

  /** Put a whole layout (restoring a saved page). Unknown ids are ignored. */
  setLayout(layout: Layout): void {
    this.#layout = layout.filter((t) => this.#tiles.has(t.id)).map((t) => {
      // a tile's limits are its own, whatever the layout handed in says
      const spec = this.#tiles.get(t.id)!.spec;
      return {
        ...t,
        ...(spec.minW !== undefined ? { minW: spec.minW } : {}),
        ...(spec.minH !== undefined ? { minH: spec.minH } : {}),
      };
    });
    this.#shown = this.#layout;
    this.#paint();
  }

  /** Resize one tile (placing a new neighbour beside it). */
  resizeTile(id: string, w: number, h: number): void {
    this.#commit(resizeTile(this.#layout, id, w, h, this.#cols));
  }

  /** Rename a tile, as a double click on its title does. */
  rename(id: string, title: string): void {
    const p = this.#tiles.get(id);
    if (!p) return;
    p.name = title;
    p.title.textContent = title;
    p.root.setAttribute('aria-label', title);
    p.remove.title = `Remove ${title}`;
    p.remove.setAttribute('aria-label', `Remove ${title}`);
  }

  dispose(): void {
    this.#observer?.disconnect();
    this.#gesture = null;
    this.#host.replaceChildren();
    this.#host.classList.remove('dc-board', 'dc-board-narrow');
  }

  // -- drawing ----------------------------------------------------------------

  #make(spec: BoardTile): Placed {
    const doc = this.#doc;
    const root = doc.createElement('section');
    root.className = 'dc-tile';
    root.dataset['tile'] = spec.id;
    root.tabIndex = 0;
    root.setAttribute('aria-label', spec.title);
    root.setAttribute('aria-roledescription', 'tile');
    const head = doc.createElement('div');
    head.className = 'dc-tile-head';
    const title = doc.createElement('span');
    title.className = 'dc-tile-title';
    title.textContent = spec.title;
    title.title = 'Drag to move; double-click to rename';
    const actions = doc.createElement('span');
    actions.className = 'dc-tile-actions';
    actions.append(...(spec.actions ?? []));
    const remove = doc.createElement('button');
    remove.type = 'button';
    remove.className = 'dc-tile-remove';
    remove.textContent = '×';
    remove.title = `Remove ${spec.title}`;
    remove.setAttribute('aria-label', `Remove ${spec.title}`);
    remove.hidden = spec.removable === false;
    remove.addEventListener('click', () => this.#options.onRemove?.(spec.id));
    actions.append(remove);
    head.append(title, actions);
    const body = doc.createElement('div');
    body.className = 'dc-tile-body';
    body.append(spec.element);
    const resize = doc.createElement('div');
    resize.className = 'dc-tile-resize';
    resize.title = 'Drag to resize';
    root.append(head, body, resize);
    this.#grid.append(root);

    const placed: Placed = { spec, root, title, remove, name: spec.title };
    head.addEventListener('pointerdown', (e) => this.#startDrag(spec.id, e, 'move'));
    resize.addEventListener('pointerdown', (e) => this.#startDrag(spec.id, e, 'resize'));
    // on the bar, not the title text: a press on the bar captures the pointer
    // (it may be a drag), so the double click arrives at the bar
    head.addEventListener('dblclick', (e) => {
      if (!(e.target as Element | null)?.closest('button, input, select')) this.#startRename(placed);
    });
    root.addEventListener('keydown', (e) => this.#onKey(spec.id, e));
    return placed;
  }

  #measure(): void {
    const fit = this.#options.fitRows;
    const height = this.#host.clientHeight;
    if (fit !== undefined && height > 0) {
      const least = this.#options.rowHeight ?? 16;
      const row = Math.max(least, Math.floor((height - this.#gap * (fit - 1)) / fit));
      if (row !== this.#rowHeight) {
        this.#rowHeight = row;
        this.#grid.style.gridAutoRows = `${row}px`;
      }
    }
    const width = this.#host.clientWidth;
    const narrow = width > 0 && width < this.#narrowBelow;
    if (narrow !== this.#narrow) {
      this.#narrow = narrow;
      this.#host.classList.toggle('dc-board-narrow', narrow);
      this.#paint();
    }
  }

  /** Columns on screen now. */
  get #columns(): number {
    return this.#narrow ? 1 : this.#cols;
  }

  #place(el: HTMLElement, t: Rect): void {
    el.style.gridColumn = `${t.x + 1} / span ${t.w}`;
    el.style.gridRow = `${t.y + 1} / span ${t.h}`;
  }

  #paint(): void {
    const cols = this.#columns;
    this.#grid.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
    const shown = this.#narrow ? fitToColumns(this.#shown, this.#cols, 1) : this.#shown;
    const g = this.#gesture;
    for (const t of shown) {
      const p = this.#tiles.get(t.id);
      if (!p) continue;
      if (g?.kind === 'move' && g.id === t.id) {
        // the dragged tile stays where it started (a transform makes it
        // follow the pointer); the placeholder shows where it will land
        this.#place(p.root, g.base.find((b) => b.id === t.id) ?? t);
        this.#place(this.#placeholder, t);
      } else {
        this.#place(p.root, t);
      }
    }
    this.#placeholder.hidden = g?.kind !== 'move';
    // Tab order follows reading order, where the browser can reorder without
    // re-parenting: `moveBefore` keeps a moved node's state (a grid's scroll,
    // a chart's canvas); appending would detach and re-attach it. Without it
    // the DOM order is left alone -- a tab order that lags the picture is the
    // lesser harm.
    const moveBefore = (this.#grid as unknown as { moveBefore?: (n: Node, ref: Node | null) => void })
      .moveBefore?.bind(this.#grid);
    if (g === null && moveBefore) {
      const order = [...shown].sort((a, b) => a.y - b.y || a.x - b.x).map((t) => t.id);
      const now = [...this.#grid.children]
        .map((c) => (c as HTMLElement).dataset['tile'])
        .filter((id) => id !== undefined);
      if (order.join('\u0000') !== now.join('\u0000')) {
        for (const id of order) {
          const p = this.#tiles.get(id);
          if (p) moveBefore(p.root, null);
        }
      }
    }
  }

  #commit(next: Tile[], announce?: string): void {
    this.#layout = next;
    this.#shown = next;
    this.#paint();
    if (announce) this.#say(announce);
  }

  #say(text: string): void {
    this.#live.textContent = text;
  }

  // -- renaming ---------------------------------------------------------------

  #startRename(p: Placed): void {
    const input = this.#doc.createElement('input');
    input.className = 'dc-tile-rename';
    input.value = p.name;
    input.setAttribute('aria-label', 'Tile title');
    let done = false;
    const finish = (keep: boolean): void => {
      if (done) return;
      done = true;
      const next = input.value.trim();
      input.replaceWith(p.title);
      if (keep && next !== '' && next !== p.name) {
        this.rename(p.spec.id, next);
        this.#options.onRename?.(p.spec.id, next);
      }
      p.root.focus();
    };
    input.addEventListener('keydown', (e) => {
      // typing, not the tile's arrow keys
      e.stopPropagation();
      if (e.key === 'Enter') finish(true);
      else if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
    // a press in the field is typing, not a drag
    input.addEventListener('pointerdown', (e) => e.stopPropagation());
    p.title.replaceWith(input);
    input.focus();
    input.select();
  }

  // -- the pointer ------------------------------------------------------------

  #cell(): { w: number; h: number } {
    const width = this.#grid.clientWidth;
    const cols = this.#columns;
    return {
      w: (width - this.#gap * (cols - 1)) / cols + this.#gap,
      h: this.#rowHeight + this.#gap,
    };
  }

  /** The grid cell under a pointer. */
  #cellAt(clientX: number, clientY: number): { x: number; y: number } {
    const box = this.#grid.getBoundingClientRect();
    const cell = this.#cell();
    return {
      x: Math.min(this.#cols - 1, Math.max(0, Math.floor((clientX - box.left) / cell.w))),
      y: Math.max(0, Math.floor((clientY - box.top) / cell.h)),
    };
  }

  #startDrag(id: string, e: PointerEvent, kind: 'move' | 'resize'): void {
    if (this.#narrow || e.button !== 0) return;
    const target = e.target as Element | null;
    // the title bar's own buttons and the rename field are not a drag
    if (kind === 'move' && target?.closest('button, input, select')) return;
    const start = this.#layout.find((t) => t.id === id);
    const tile = this.#tiles.get(id);
    if (!start || !tile) return;
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const base = this.#layout;
    this.#gesture = { id, kind, base };
    tile.root.classList.add('dc-tile-dragging');
    const cell = this.#cell();
    const x0 = e.clientX;
    const y0 = e.clientY;
    const grab = this.#cellAt(x0, y0);
    const offset = { x: grab.x - start.x, y: grab.y - start.y };
    let last = '';

    const propose = (ev: PointerEvent): Tile[] => {
      if (kind === 'move') {
        const p = this.#cellAt(ev.clientX, ev.clientY);
        const rect = { x: p.x - offset.x, y: p.y - offset.y, w: start.w, h: start.h };
        return dragTile(base, id, rect, p, this.#cols);
      }
      const dw = Math.round((ev.clientX - x0) / cell.w);
      const dh = Math.round((ev.clientY - y0) / cell.h);
      return resizeTile(base, id, Math.max(1, start.w + dw), Math.max(1, start.h + dh), this.#cols);
    };
    const onMove = (ev: PointerEvent): void => {
      if (kind === 'move') {
        tile.root.style.transform = `translate(${ev.clientX - x0}px, ${ev.clientY - y0}px)`;
      }
      const next = propose(ev);
      const key = next.map((t) => `${t.id}:${t.x},${t.y},${t.w},${t.h}`).join(' ');
      if (key === last) return;
      last = key;
      this.#shown = next;
      this.#paint();
    };
    const end = (ev: PointerEvent, cancelled: boolean): void => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', cancel);
      tile.root.classList.remove('dc-tile-dragging');
      tile.root.style.transform = '';
      this.#gesture = null;
      if (cancelled) {
        this.#commit(base);
        return;
      }
      const next = propose(ev);
      const moved = next.some((t) => {
        const b = base.find((u) => u.id === t.id);
        return !b || b.x !== t.x || b.y !== t.y || b.w !== t.w || b.h !== t.h;
      });
      this.#commit(next, moved ? this.#describe(id, next) : undefined);
      if (moved) this.#options.onChange?.(next);
    };
    const up = (ev: PointerEvent) => end(ev, false);
    const cancel = (ev: PointerEvent) => end(ev, true);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', cancel);
  }

  // -- the keyboard ------------------------------------------------------------

  #onKey(id: string, e: KeyboardEvent): void {
    if (this.#narrow || e.target !== this.#tiles.get(id)?.root) return;
    const steps: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
    };
    const step = steps[e.key];
    if (!step) return;
    e.preventDefault();
    const result = e.shiftKey
      ? resizeBy(this.#layout, id, step[0], step[1], this.#cols)
      : moveBy(this.#layout, id, step[0], step[1], this.#cols);
    if (!result.changed) {
      const title = this.#tiles.get(id)?.name ?? 'The tile';
      // tiles float up to fill space, so down is only ever past a neighbour
      this.#say(e.shiftKey ? `${title} cannot grow or shrink that way.`
        : step[1] > 0 ? `${title} is as low as it goes: tiles rise to fill the space above them.`
        : step[1] < 0 ? `${title} is already at the top.`
        : `${title} is already at the ${step[0] < 0 ? 'left' : 'right'} edge.`);
      return;
    }
    this.#commit(result.layout, this.#describe(id, result.layout));
    this.#options.onChange?.(result.layout);
    this.#tiles.get(id)?.root.focus();
  }

  #describe(id: string, layout: Layout): string {
    const t = layout.find((x) => x.id === id);
    const title = this.#tiles.get(id)?.name ?? id;
    return t ? `${title}: ${describeTile(t, this.#cols)}` : '';
  }
}
