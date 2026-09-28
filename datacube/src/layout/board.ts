// The board: tiles on a snap grid, drawn with CSS grid, moved by hand.
//
// What a tile HOLDS is the caller's (a DataCube grid, a chart); where it
// SITS is `tile-layout.ts`, a pure model this file only drives: the pointer
// and the keyboard turn into cells, the model answers the page, CSS grid
// draws it (`grid-column: x+1 / span w`). Nothing here measures a tile's
// content, and a tile is never re-parented (see `#paint`), so a grid inside
// keeps its scroll position and a chart its canvas.
//
// View mode shows the tiles. Edit mode adds a drag handle (the title bar
// only -- a grid's own header drags and a chart's clicks inside a tile are
// never taken), a resize corner, a remove button, and the keyboard: arrows
// move the focused tile, Shift+arrows resize it, each step announced. A
// narrow board shows one column and cannot be edited; the saved layout is
// never changed by a screen's width (`fitToColumns` is derived, not stored).

import {
  describe as describeTile,
  fitToColumns,
  moveBy,
  moveTile,
  resizeBy,
  resizeTile,
  type Layout,
  type Tile,
} from './tile-layout.ts';

export interface BoardTile {
  readonly id: string;
  readonly title: string;
  /** What the tile shows. Placed in the tile once, never moved in the DOM. */
  readonly element: HTMLElement;
  /** Extra buttons for the title bar (a chart's Options). */
  readonly actions?: readonly HTMLElement[];
  /** Whether edit mode offers to remove it. */
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
  /** Below this width the board is one column and cannot be edited. */
  readonly narrowBelow?: number;
  /** The layout changed by the user's hand (not by the screen's width). */
  readonly onChange?: (layout: Layout) => void;
  /** The user asked to remove a tile. The caller removes it. */
  readonly onRemove?: (id: string) => void;
}

interface Placed {
  readonly spec: BoardTile;
  readonly root: HTMLElement;
  readonly head: HTMLElement;
  readonly remove: HTMLButtonElement;
  readonly resize: HTMLElement;
}

export const BOARD_COLUMNS = 12;

export class Board {
  readonly #host: HTMLElement;
  readonly #doc: Document;
  readonly #grid: HTMLElement;
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
  #editing = false;
  #narrow = false;
  /** The gesture in flight, if any: its tile, the layout it started from. */
  #gesture: { id: string; base: Tile[]; pointer: number } | null = null;

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

  get editing(): boolean {
    return this.#editing;
  }

  /** How many tiles are on the board. */
  get size(): number {
    return this.#tiles.size;
  }

  /**
   * Add a tile. With a rectangle it goes there (others make room); without,
   * it goes below everything, at `w` x `h` (defaults 6 x 10).
   */
  add(tile: BoardTile, at: Partial<Pick<Tile, 'x' | 'y' | 'w' | 'h'>> = {}): void {
    if (this.#tiles.has(tile.id)) throw new Error(`a tile ${tile.id} is already on the board`);
    this.#tiles.set(tile.id, this.#make(tile));
    const w = at.w ?? 6;
    const h = at.h ?? 10;
    const below = this.#layout.reduce((m, t) => Math.max(m, t.y + t.h), 0);
    const placed: Tile = {
      id: tile.id,
      x: at.x ?? 0,
      y: at.y ?? below,
      w,
      h,
      ...(tile.minW !== undefined ? { minW: tile.minW } : {}),
      ...(tile.minH !== undefined ? { minH: tile.minH } : {}),
    };
    this.#commit(moveTile([...this.#layout, placed], tile.id, placed.x, placed.y, this.#cols));
  }

  /** Take a tile off the board. Its element is detached, not destroyed. */
  remove(id: string): void {
    const placed = this.#tiles.get(id);
    if (!placed) return;
    placed.root.remove();
    this.#tiles.delete(id);
    this.#commit(this.#layout.filter((t) => t.id !== id));
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

  setEditing(on: boolean): void {
    this.#editing = on && !this.#narrow;
    this.#host.classList.toggle('dc-board-editing', this.#editing);
    for (const p of this.#tiles.values()) {
      p.root.tabIndex = this.#editing ? 0 : -1;
      p.remove.hidden = !this.#editing || p.spec.removable === false;
      p.resize.hidden = !this.#editing;
      p.head.classList.toggle('dc-tile-handle', this.#editing);
    }
    this.#say(this.#editing
      ? 'Editing the layout: drag a tile by its title, or focus it and use the arrow keys (Shift to resize).'
      : '');
  }

  dispose(): void {
    this.#observer?.disconnect();
    this.#gesture = null;
    this.#host.replaceChildren();
    this.#host.classList.remove('dc-board', 'dc-board-editing', 'dc-board-narrow');
  }

  // -- drawing ----------------------------------------------------------------

  #make(spec: BoardTile): Placed {
    const doc = this.#doc;
    const root = doc.createElement('section');
    root.className = 'dc-tile';
    root.dataset['tile'] = spec.id;
    root.setAttribute('aria-label', spec.title);
    const head = doc.createElement('div');
    head.className = 'dc-tile-head';
    const title = doc.createElement('span');
    title.className = 'dc-tile-title';
    title.textContent = spec.title;
    const actions = doc.createElement('span');
    actions.className = 'dc-tile-actions';
    actions.append(...(spec.actions ?? []));
    const remove = doc.createElement('button');
    remove.type = 'button';
    remove.className = 'dc-tile-remove';
    remove.textContent = '×';
    remove.title = `Remove ${spec.title}`;
    remove.setAttribute('aria-label', `Remove ${spec.title}`);
    remove.hidden = true;
    remove.addEventListener('click', () => this.#options.onRemove?.(spec.id));
    actions.append(remove);
    head.append(title, actions);
    const body = doc.createElement('div');
    body.className = 'dc-tile-body';
    body.append(spec.element);
    const resize = doc.createElement('div');
    resize.className = 'dc-tile-resize';
    resize.title = 'Resize';
    resize.hidden = true;
    root.append(head, body, resize);
    this.#grid.append(root);

    head.addEventListener('pointerdown', (e) => this.#startDrag(spec.id, e, 'move'));
    resize.addEventListener('pointerdown', (e) => this.#startDrag(spec.id, e, 'resize'));
    root.addEventListener('keydown', (e) => this.#onKey(spec.id, e));
    return { spec, root, head, remove, resize };
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
      if (narrow && this.#editing) this.setEditing(false);
      this.#paint();
    }
  }

  /** Columns on screen now. */
  get #columns(): number {
    return this.#narrow ? 1 : this.#cols;
  }

  #paint(): void {
    const cols = this.#columns;
    this.#grid.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
    const shown = this.#narrow ? fitToColumns(this.#shown, this.#cols, 1) : this.#shown;
    for (const t of shown) {
      const p = this.#tiles.get(t.id);
      if (!p) continue;
      p.root.style.gridColumn = `${t.x + 1} / span ${t.w}`;
      p.root.style.gridRow = `${t.y + 1} / span ${t.h}`;
    }
    // Tab order follows reading order, where the browser can reorder without
    // re-parenting: `moveBefore` keeps a moved node's state (a grid's scroll,
    // a chart's canvas); appending would detach and re-attach it. Without it
    // the DOM order is left alone -- a tab order that lags the picture is the
    // lesser harm.
    const moveBefore = (this.#grid as unknown as { moveBefore?: (n: Node, ref: Node | null) => void })
      .moveBefore?.bind(this.#grid);
    if (this.#gesture === null && moveBefore) {
      const order = [...shown].sort((a, b) => a.y - b.y || a.x - b.x).map((t) => t.id);
      const now = [...this.#grid.children].map((c) => (c as HTMLElement).dataset['tile']);
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

  // -- the pointer ------------------------------------------------------------

  #cell(): { w: number; h: number } {
    const width = this.#grid.clientWidth;
    const cols = this.#columns;
    return {
      w: (width - this.#gap * (cols - 1)) / cols + this.#gap,
      h: this.#rowHeight + this.#gap,
    };
  }

  #startDrag(id: string, e: PointerEvent, kind: 'move' | 'resize'): void {
    if (!this.#editing || e.button !== 0) return;
    const target = e.target as Element | null;
    // the title bar's own buttons (Options, Remove) are not a drag
    if (kind === 'move' && target?.closest('button')) return;
    const start = this.#layout.find((t) => t.id === id);
    if (!start) return;
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const base = this.#layout;
    this.#gesture = { id, base, pointer: e.pointerId };
    const tile = this.#tiles.get(id);
    tile?.root.classList.add('dc-tile-dragging');
    const cell = this.#cell();
    const x0 = e.clientX;
    const y0 = e.clientY;
    let last: { x: number; y: number; w: number; h: number } = start;

    const target_ = (ev: PointerEvent) => {
      const dx = Math.round((ev.clientX - x0) / cell.w);
      const dy = Math.round((ev.clientY - y0) / cell.h);
      return kind === 'move'
        ? { x: start.x + dx, y: Math.max(0, start.y + dy), w: start.w, h: start.h }
        : { x: start.x, y: start.y, w: Math.max(1, start.w + dx), h: Math.max(1, start.h + dy) };
    };
    const propose = (r: typeof last, hold: boolean) => (kind === 'move'
      ? moveTile(base, id, r.x, r.y, this.#cols, { hold, swap: true })
      : resizeTile(base, id, r.w, r.h, this.#cols, { hold }));

    const onMove = (ev: PointerEvent): void => {
      const r = target_(ev);
      if (r.x === last.x && r.y === last.y && r.w === last.w && r.h === last.h) return;
      last = r;
      this.#shown = propose(r, true);
      this.#paint();
    };
    const end = (ev: PointerEvent, cancelled: boolean): void => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', cancel);
      tile?.root.classList.remove('dc-tile-dragging');
      this.#gesture = null;
      if (cancelled) {
        this.#commit(base);
        return;
      }
      const next = propose(target_(ev), false);
      this.#commit(next, this.#describe(id, next));
      this.#options.onChange?.(next);
    };
    const up = (ev: PointerEvent) => end(ev, false);
    const cancel = (ev: PointerEvent) => end(ev, true);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', cancel);
  }

  // -- the keyboard ------------------------------------------------------------

  #onKey(id: string, e: KeyboardEvent): void {
    if (!this.#editing || e.target !== this.#tiles.get(id)?.root) return;
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
      const title = this.#tiles.get(id)?.spec.title ?? 'The tile';
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
    const title = this.#tiles.get(id)?.spec.title ?? id;
    return t ? `${title}: ${describeTile(t, this.#cols)}` : '';
  }
}
