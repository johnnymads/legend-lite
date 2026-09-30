// A PAGE OF TILES: a grid and the charts made from it, on one board (plan B1, and B2 next).
//
// Moved out of CubeApp so a grid and a chart are the same kind of thing -- a tile on a board --
// and a page can come to hold several grids (the user, 2026-09-30: "the grid is the source").
// A chart reaches its grid only through `ChartSource`: the grid's query as it is now, a way to
// run a query of its own, the grid's formats, and the grid's filter for click-to-filter.
//
// A chart FOLLOWS ITS GRID until frozen -- it re-draws as the grid is pivoted, grouped and
// filtered, badged so -- and any number may follow at once. A frozen chart keeps its grouping
// (its query and spec, not its data: it still refreshes and answers the grid's filter); Follow the
// grid makes it follow again. Open in grid edits a frozen chart's grouping in a grid of its own,
// on the board beside it, leaving its grid as it is; Update writes it back.

import { ChartPanel } from '../ui/chart-panel.ts';
import { Board, BOARD_COLUMNS } from '../layout/board.ts';
import { addToRow, below } from '../layout/tile-layout.ts';
import { followCube, measureName } from '../chart-spec.ts';
import type { MarkKey } from '../chart-option.ts';
import type { ExportPage, ExportTile } from '../export-model.ts';
import { PAGE_CUBE, type ChartView, type PageView, type PageViews } from '../page-document.ts';
import type { CubeSnapshot, FilterNode, Measure } from '../snapshot.ts';
import type { ResultTable, Scalar } from '../result.ts';
import type { Lambda } from '../../../pure-protocol/src/index.ts';

/** The board's rows on one screen (each row a share of the height), and its tiles' least height. */
export const BOARD_ROWS = 24;
const TILE_MIN_ROWS = 6;
/** The grid's rows above its charts, of the 24 on one screen; and charts side by side in a row. */
const GRID_ROWS_ABOVE_CHARTS = 14;
const CHARTS_PER_ROW = 4;
/** The grid's tile, until renamed: the cube's name is already above the board. */
export const GRID_TILE_TITLE = 'Grid';
const GRID = 'grid';

/** What a chart needs from the grid it is made from (a CubeApp). */
export interface ChartSource {
  /** The grid's query as it is now. */
  readonly snapshot: CubeSnapshot;
  /** Run a query the grid did not plan, through the grid's own runner. */
  run(query: Lambda, snapshot: CubeSnapshot, signal: AbortSignal): Promise<ResultTable>;
  /** A value as the grid writes it. */
  format(value: Scalar, column: string, type: string | undefined): string;
  /** A column as the grid names it. */
  label(column: string): string;
  /** Take `old` off the grid's filter and put `add` on, as one change named `label`. */
  refilter(old: readonly FilterNode[], add: readonly FilterNode[], label: string): void;
  /** A grid of its own over the same source, in `host` (a chart's editing grid). */
  spawn(host: HTMLElement, snapshot: CubeSnapshot): SpawnedGrid;
}

/** A grid made for a moment's work (a chart's editing grid). */
export interface SpawnedGrid {
  readonly snapshot: CubeSnapshot;
  open(): Promise<void>;
  dispose(): void;
}

export interface CubePageOptions {
  /** Where the board goes; the grid's element moves into its first tile. */
  readonly host: HTMLElement;
  readonly grid: { readonly element: HTMLElement; readonly source: ChartSource };
  /** The page changed: a tile, its title, its layout, a chart's spec or selection. */
  readonly onChange: () => void;
  /** The last chart is gone: the page is only its grid again (the host puts it back). */
  readonly onEmpty: () => void;
}

interface ChartTile {
  readonly panel: ChartPanel;
  readonly chip: HTMLButtonElement;
  /** The conditions this chart's last click put on its grid's filter. */
  conditions: FilterNode[];
  key: string;
  /** Its editing grid, while open: its tile and its cube. */
  editor?: { readonly tile: string; readonly grid: SpawnedGrid };
}

export class CubePage {
  readonly #doc: Document;
  readonly #options: CubePageOptions;
  readonly #board: Board;
  readonly #charts = new Map<string, ChartTile>();
  #chartCount = 0;
  /** Until arranged by hand, the page lays itself out. */
  #auto = true;

  constructor(options: CubePageOptions) {
    this.#options = options;
    this.#doc = options.host.ownerDocument;
    this.#board = new Board(options.host, {
      fitRows: BOARD_ROWS,
      // a short window still fits its screenful; a 6-row tile is then ~110px
      rowHeight: 12,
      onRemove: (tileId) => this.#removeTile(tileId),
      // arranged by hand: from now on the layout is the user's
      onChange: () => {
        this.#auto = false;
        options.onChange();
      },
      onRename: () => options.onChange(),
    });
    const add = this.#button('+ Chart', 'Add a chart of this cube');
    add.addEventListener('click', () => this.openChart());
    this.#board.add({
      id: GRID,
      // the cube's own name is the page's title already, above the board
      title: GRID_TILE_TITLE,
      element: options.grid.element,
      actions: [add],
      removable: false,
      anchor: true,
      minW: 3,
      minH: TILE_MIN_ROWS,
    }, { x: 0, y: 0, w: BOARD_COLUMNS, h: BOARD_ROWS });
  }

  /** How many charts are on the page. */
  get charts(): number {
    return this.#charts.size;
  }

  /** A chart of the grid on the board, below it: live, or as a saved page had it. */
  openChart(restore?: ChartView): void {
    const source = this.#options.grid.source;
    this.#chartCount += 1;
    const id = restore?.id ?? this.#freshChartId();
    const doc = this.#doc;
    const body = doc.createElement('div');
    body.className = 'dc-chart-tile';
    // what the chart is filtering the grid to, with a way out: shown only while it does
    const chip = doc.createElement('button');
    chip.type = 'button';
    chip.className = 'dc-tile-chip';
    chip.hidden = true;
    chip.addEventListener('click', () => this.#select(id, null));
    // which charts a pivot will change: every one that follows, marked
    const badge = doc.createElement('span');
    badge.className = 'dc-tile-badge';
    badge.textContent = 'Following the grid';
    badge.title = 'This chart re-draws as the grid is pivoted, grouped and filtered.';
    const freeze = this.#button('Freeze', '');
    const edit = this.#button('Open in grid', 'Change this chart\'s grouping in a grid of its own, beside it; your grid stays as it is.');
    const options = this.#button('Options', 'This chart\'s mark, columns and options.');
    options.setAttribute('aria-pressed', 'false');
    const paint = (): void => {
      const frozen = panel.frozen;
      badge.hidden = frozen;
      freeze.textContent = frozen ? 'Follow the grid' : 'Freeze';
      freeze.title = frozen
        ? 'Follow the grid\'s pivots again (this chart takes the grid\'s grouping).'
        : 'Keep this chart\'s grouping as it is: pivoting the grid will not change it.';
      edit.hidden = !frozen;
      // a scatter plots rows, not groups: there is no grouping to open
      edit.disabled = panel.spec?.mark === 'scatter';
    };
    const panel = new ChartPanel(body, {
      onFrozen: () => {
        paint();
        this.#options.onChange();
      },
      onSpec: () => this.#options.onChange(),
      ...(restore ? { initial: restore.spec } : {}),
      snapshot: () => source.snapshot,
      run: (query, snapshot, signal) => source.run(query, snapshot, signal),
      label: (value, column, type) => source.format(value, column, type),
      onPick: (mark) => this.#select(id, mark),
      formOpen: false,
    });
    options.addEventListener('click', () => {
      options.setAttribute('aria-pressed', String(panel.toggleForm()));
    });
    freeze.addEventListener('click', () => {
      // following again, it takes the grid's grouping: an open editing grid has nothing to edit
      if (panel.frozen) this.#closeEditor(id);
      panel.setFrozen(!panel.frozen);
    });
    edit.addEventListener('click', () => this.#openEditor(id));
    paint();
    this.#charts.set(id, {
      panel,
      chip,
      conditions: restore?.selection ? [...restore.selection] : [],
      key: restore?.selection ? JSON.stringify(restore.selection) : '',
    });
    if (restore?.selection) this.#paintSelection(id);
    const actions = [chip, badge, freeze, edit, options];
    if (restore) {
      // placed by the page's layout, once every view is on the board (`restore`)
      this.#board.add({ id, title: restore.title, element: body, actions, minW: 3, minH: TILE_MIN_ROWS });
      return;
    }
    const before = this.#board.layout;
    this.#board.add({
      id,
      title: `Chart ${this.#chartCount}`,
      element: body,
      actions,
      minW: 3,
      minH: TILE_MIN_ROWS,
    }, { w: 6, h: 10 });
    if (this.#auto) {
      this.#arrange();
    } else {
      // arranged by hand: at the end of the bottom row of charts, or a row of its own
      this.#board.setLayout(addToRow(before, id, BOARD_COLUMNS, BOARD_ROWS - GRID_ROWS_ABOVE_CHARTS,
        CHARTS_PER_ROW, 3));
    }
    this.#board.reveal(id);
    this.#options.onChange();
  }

  /** The grid changed (a view landed, a sign-in): every chart draws again, a following one regrouped. */
  refresh(): void {
    for (const chart of this.#charts.values()) chart.panel.refresh();
  }

  /**
   * The grid's filter changed: a selection whose conditions are no longer all in it (cleared or
   * edited in the filter window, undone) is no longer the chart's to take off.
   */
  reconcile(filter: FilterNode | undefined): void {
    for (const [id, chart] of this.#charts) {
      if (chart.conditions.length === 0) continue;
      if (withoutConditions(filter, chart.conditions, true) === null) {
        chart.conditions = [];
        chart.key = '';
        this.#paintSelection(id);
      }
    }
  }

  /**
   * What the page shows, as a saved page keeps it: the grid, each chart (its title, spec, and the
   * mark it filters to) and the layout -- not an editing grid, a moment's work.
   */
  views(): PageViews {
    const views: PageView[] = [{
      id: GRID,
      kind: 'grid',
      cube: PAGE_CUBE,
      ...(this.#board.title(GRID) !== GRID_TILE_TITLE ? { title: this.#board.title(GRID) ?? GRID_TILE_TITLE } : {}),
    }];
    for (const [id, chart] of this.#charts) {
      const spec = chart.panel.spec;
      if (!spec) continue;
      views.push({
        id,
        kind: 'chart',
        cube: PAGE_CUBE,
        title: this.#board.title(id) ?? id,
        spec,
        ...(chart.conditions.length > 0 ? { selection: chart.conditions } : {}),
      });
    }
    return {
      views,
      layout: {
        kind: 'grid',
        cols: BOARD_COLUMNS,
        tiles: this.#pageTiles().map((t) => ({ id: t.id, x: t.x, y: t.y, w: t.w, h: t.h })),
        arranged: !this.#auto,
      },
    };
  }

  /** Put a saved page's views back: its charts, their titles, its layout. */
  restore(page: PageViews): void {
    const charts = page.views.filter((v): v is ChartView => v.kind === 'chart');
    const grid = page.views.find((v) => v.kind === 'grid');
    if (grid?.title) this.#board.rename(GRID, grid.title);
    for (const chart of charts) this.openChart(chart);
    this.#board.setLayout(page.layout.tiles);
    this.#auto = !page.layout.arranged;
    this.#chartCount = Math.max(this.#chartCount, ...charts.map((c) => Number(/^chart-(\d+)$/.exec(c.id)?.[1] ?? 0)));
  }

  /** The page's tiles as an export lays them out: where each is, a chart as its picture. */
  exportPage(): ExportPage {
    const tiles = this.#pageTiles().map((t): ExportTile => {
      const chart = this.#charts.get(t.id);
      const picture = chart?.panel.picture() ?? null;
      return {
        id: t.id,
        kind: chart ? 'chart' : 'grid',
        title: this.#board.title(t.id) ?? (chart ? t.id : GRID_TILE_TITLE),
        x: t.x, y: t.y, w: t.w, h: t.h,
        ...(picture ? { picture } : {}),
      };
    });
    return { cols: BOARD_COLUMNS, tiles };
  }

  dispose(): void {
    for (const chart of this.#charts.values()) {
      chart.editor?.grid.dispose();
      chart.panel.dispose();
    }
    this.#charts.clear();
    this.#board.dispose();
  }

  // -- charts ---------------------------------------------------------------

  #button(text: string, title: string): HTMLButtonElement {
    const el = this.#doc.createElement('button');
    el.type = 'button';
    el.className = 'dc-tile-button';
    el.textContent = text;
    el.title = title;
    return el;
  }

  /** A chart id not on the board (a restored page's ids may run ahead of the count). */
  #freshChartId(): string {
    let n = this.#chartCount;
    while (this.#charts.has(`chart-${n}`)) n += 1;
    this.#chartCount = n;
    return `chart-${n}`;
  }

  /** The board's tiles that are the page: the grid and the charts, not an editing grid. */
  #pageTiles(): Board['layout'] {
    const editing = new Set([...this.#charts.values()].flatMap((c) => (c.editor ? [c.editor.tile] : [])));
    return this.#board.layout.filter((t) => !editing.has(t.id));
  }

  /**
   * Until the layout is arranged by hand: the grid across the top, the charts in a row below it
   * sharing the width, each chart's editing grid right after it, all on one screen.
   */
  #arrange(): void {
    if (!this.#auto) return;
    const tiles = [...this.#charts].flatMap(([id, chart]) => (chart.editor ? [id, chart.editor.tile] : [id]));
    this.#board.setLayout(below(GRID, tiles, BOARD_COLUMNS, BOARD_ROWS,
      GRID_ROWS_ABOVE_CHARTS, CHARTS_PER_ROW, TILE_MIN_ROWS));
  }

  /** Take a tile off the board: an editing grid (its chart left as it was), or a chart and its selection. */
  #removeTile(id: string): void {
    for (const [chartId, chart] of this.#charts) {
      if (chart.editor?.tile === id) {
        this.#closeEditor(chartId);
        return;
      }
    }
    const chart = this.#charts.get(id);
    if (!chart) return;
    if (chart.conditions.length) this.#select(id, null);
    this.#closeEditor(id);
    chart.panel.dispose();
    this.#charts.delete(id);
    this.#board.remove(id);
    this.#options.onChange();
    if (this.#charts.size > 0) {
      this.#arrange();
      return;
    }
    this.#options.onEmpty();
  }

  /**
   * OPEN IN GRID: a frozen chart's grouping in a grid of its own, in a tile beside the chart --
   * the chart's column across and its split as the row groups, its measures as the grid's, over
   * the same source and filter. The chart's grid is not touched. Update writes the editing grid's
   * grouping back into the chart; removing its tile throws it away.
   */
  #openEditor(chartId: string): void {
    const chart = this.#charts.get(chartId);
    if (!chart) return;
    if (chart.editor) {
      this.#board.reveal(chart.editor.tile);
      return;
    }
    const spec = chart.panel.spec;
    if (!spec || spec.mark === 'scatter' || spec.x === undefined) return;
    const source = this.#options.grid.source;
    const tile = `edit-${chartId}`;
    const host = this.#doc.createElement('div');
    host.className = 'dc-chart-editor';
    const used = new Set<string>();
    const measures = spec.y.map((m): Measure => {
      // the grid's own measure of that column and aggregate keeps its name (its format)
      const own = source.snapshot.measures.find((c) => c.column === m.column && c.fn === m.fn);
      const name = own?.name ?? (used.has(m.column) ? measureName(m) : m.column);
      used.add(name);
      return { name, column: m.column, fn: m.fn };
    });
    const grid = source.spawn(host, {
      ...source.snapshot,
      rows: [spec.x, ...(spec.split !== undefined ? [spec.split] : [])],
      pivotOn: [],
      measures,
    });
    const chartTitle = this.#board.title(chartId) ?? 'the chart';
    const update = this.#button(`Update ${chartTitle}`, 'Give the chart this grid\'s grouping, and close this grid.');
    update.addEventListener('click', () => {
      const current = chart.panel.spec;
      if (!current) return;
      // the chart regrouped the way the editing grid is -- as a following chart would follow it --
      // then frozen again: its mark and options are its own
      const { frozen: _f, ...following } = current;
      chart.panel.setSpec({ ...followCube(following, grid.snapshot), frozen: true });
      this.#closeEditor(chartId);
      this.#options.onChange();
    });
    chart.editor = { tile, grid };
    this.#board.add({
      id: tile,
      title: `Editing ${chartTitle}`,
      element: host,
      actions: [update],
      minW: 3,
      minH: TILE_MIN_ROWS,
    }, { w: 6, h: 10 });
    this.#arrange();
    this.#board.reveal(tile);
    void grid.open();
  }

  /** Throw a chart's editing grid away, if it has one. */
  #closeEditor(chartId: string): void {
    const chart = this.#charts.get(chartId);
    const editor = chart?.editor;
    if (!chart || !editor) return;
    delete chart.editor;
    editor.grid.dispose();
    this.#board.remove(editor.tile);
    this.#arrange();
  }

  // -- selections: click-to-filter ----------------------------------------------

  /**
   * A chart's SELECTION: the mark clicked last, as conditions on the grid's filter (one per
   * column the mark names, ANDed on), owned by that chart. A click on another mark replaces them
   * rather than piling more on (two clicks must not filter to nothing); a click on the same mark,
   * or the chip naming it in the chart's title bar, takes them off. Each is ONE change -- one undo
   * step, refused as a whole.
   */
  #select(id: string, mark: MarkKey | null): void {
    const chart = this.#charts.get(id);
    if (!chart) return;
    const next: FilterNode[] = mark === null ? [] : Object.entries(mark).map(([column, raw]) => {
      // a big integer as its digits, as the context menu's value filters do
      const value = typeof raw === 'bigint' ? raw.toString() : raw;
      return value === null
        ? { kind: 'condition', column, operator: 'isEmpty' }
        : { kind: 'condition', column, operator: 'equal', value };
    });
    const key = JSON.stringify(next);
    const add = key === chart.key ? [] : next;
    const old = chart.conditions;
    if (old.length === 0 && add.length === 0) return;
    this.#options.grid.source.refilter(old, add, add.length === 0 ? 'clear chart selection' : 'filter to chart mark');
    chart.conditions = add;
    chart.key = add.length === 0 ? '' : key;
    this.#paintSelection(id);
    this.#options.onChange();
  }

  #paintSelection(id: string): void {
    const chart = this.#charts.get(id);
    if (!chart) return;
    const source = this.#options.grid.source;
    const words = chart.conditions.map((c) => c.kind === 'condition'
      ? `${source.label(c.column)}: ${c.operator === 'isEmpty' ? '(empty)' : String(c.value)}`
      : '');
    chart.chip.hidden = words.length === 0;
    chart.chip.textContent = `${words.join(', ')} ×`;
    chart.chip.title = 'Filtered to this; click to clear';
    chart.chip.setAttribute('aria-label', `Clear the filter to ${words.join(', ')}`);
  }
}

/**
 * `filter` without one occurrence of each of `conditions` (compared as data) among its top-level
 * AND. With `strict`, null when any is not there.
 */
export function withoutConditions(
  filter: FilterNode | undefined, conditions: readonly FilterNode[], strict = false,
): FilterNode | undefined | null {
  const children = filter === undefined ? [] : filter.kind === 'and' ? [...filter.children] : [filter];
  for (const c of conditions) {
    const key = JSON.stringify(c);
    const at = children.findIndex((n) => JSON.stringify(n) === key);
    if (at < 0) {
      if (strict) return null;
      continue;
    }
    children.splice(at, 1);
  }
  if (children.length === 0) return undefined;
  return children.length === 1 ? children[0]! : { kind: 'and', children };
}
