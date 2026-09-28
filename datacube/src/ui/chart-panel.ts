// The chart window: a chart of the cube, and the options that shape it.
//
// Left, the options (mark, what goes across, what is plotted and how it is
// aggregated, the split, orientation, stacking, order, how many, labels,
// legend); right, the chart. The chart follows the cube: its query is the
// cube's own, regrouped (`chart-spec.ts`), so a filter added to the grid
// narrows the chart, and a click on a mark (a bar, a slice, a cell) adds
// that mark's values to the cube's filter.

import {
  CHART_MARKS,
  chartColumns,
  chartProblems,
  chartQuery,
  defaultChart,
  type ChartMark,
  type ChartSpec,
} from '../chart-spec.ts';
import { chartOption, type LabelOf, type MarkKey } from '../chart-option.ts';
import { mountChart, themeOf, type MountedChart } from '../chart-render.ts';
import type { ResultTable } from '../result.ts';
import type { AggregateFn, CubeSnapshot } from '../snapshot.ts';
import type { Lambda } from '../../../pure-protocol/src/index.ts';
import { checkbox, dropdown, field, numberInput } from './form.ts';
import { aggregatesFor } from './panel-column.ts';

export interface ChartPanelOptions {
  /** The cube as it is NOW (the chart follows it). */
  readonly snapshot: () => CubeSnapshot;
  /** Run a query the cube did not plan, through the cube's own runner. */
  readonly run: (query: Lambda, snapshot: CubeSnapshot, signal: AbortSignal) => Promise<ResultTable>;
  /** How a value is written: the grid's formatter. */
  readonly label: LabelOf;
  /** A mark was clicked: filter the cube to its values. */
  readonly onPick: (key: MarkKey) => void;
  /** Where to start; the cube's own grouping suggests one otherwise. */
  readonly initial?: ChartSpec;
  /** Upstream-style debounce between an edit and the query; a test passes 0. */
  readonly debounceMs?: number;
}

export class ChartPanel {
  readonly #root: HTMLElement;
  readonly #doc: Document;
  readonly #options: ChartPanelOptions;
  #spec: ChartSpec | null;
  #form!: HTMLElement;
  #canvas!: HTMLElement;
  #status!: HTMLElement;
  #chart: MountedChart | null = null;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #inflight: AbortController | null = null;
  #disposed = false;

  constructor(root: HTMLElement, options: ChartPanelOptions) {
    this.#root = root;
    this.#doc = root.ownerDocument;
    this.#options = options;
    this.#spec = options.initial ?? defaultChart(options.snapshot());
    this.#build();
    this.refresh(0);
  }

  /** The spec being drawn (to save it, later). */
  get spec(): ChartSpec | null {
    return this.#spec;
  }

  /** The cube changed (a new filter, a new calculated column): draw again. */
  refresh(delay = this.#options.debounceMs ?? 150): void {
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => void this.#draw(), delay);
  }

  dispose(): void {
    this.#disposed = true;
    clearTimeout(this.#timer);
    this.#inflight?.abort();
    this.#chart?.dispose();
    this.#chart = null;
  }

  // -- layout ---------------------------------------------------------------

  #build(): void {
    const doc = this.#doc;
    this.#root.replaceChildren();
    this.#root.classList.add('dc-chartpanel');
    this.#form = doc.createElement('div');
    this.#form.className = 'dc-chartpanel-form';
    const right = doc.createElement('div');
    right.className = 'dc-chartpanel-main';
    this.#canvas = doc.createElement('div');
    this.#canvas.className = 'dc-chartpanel-chart';
    this.#canvas.setAttribute('role', 'img');
    this.#status = doc.createElement('div');
    this.#status.className = 'dc-chartpanel-status';
    this.#status.setAttribute('role', 'status');
    right.append(this.#canvas, this.#status);
    this.#root.append(this.#form, right);
    this.#paintForm();
  }

  #set(change: Partial<ChartSpec>, redrawForm = false): void {
    if (!this.#spec) return;
    this.#spec = { ...this.#spec, ...change };
    if (redrawForm) this.#paintForm();
    this.refresh();
  }

  #setOption<K extends keyof ChartSpec['options']>(key: K, value: ChartSpec['options'][K]): void {
    if (!this.#spec) return;
    this.#set({ options: { ...this.#spec.options, [key]: value } });
  }

  #paintForm(): void {
    const doc = this.#doc;
    const form = this.#form;
    form.replaceChildren();
    const s = this.#options.snapshot();
    const spec = this.#spec;
    if (!spec) {
      form.textContent = 'This cube has no column to chart.';
      return;
    }
    const { dimensions, measures } = chartColumns(s);
    const dims = dimensions.map((c) => ({ value: c.name, label: c.name }));
    const scatter = spec.mark === 'scatter';
    const across = scatter
      ? [...measures, ...dimensions].map((c) => ({ value: c.name, label: c.name }))
      : dims;
    const first = spec.y[0];
    const typeOf = new Map([...dimensions, ...measures].map((c) => [c.name, c.type]));
    const fns = (first ? aggregatesFor(typeOf.get(first.column)) : [])
      .filter((a) => a.value !== 'wavg')
      .map((a) => ({ value: a.value, label: a.label }));

    form.append(
      field(doc, 'Chart:', dropdown<ChartMark>(doc, spec.mark, CHART_MARKS, (v) => {
        if (v) this.#set({ mark: v }, true);
      })),
      field(doc, scatter ? 'X:' : 'Across:', dropdown<string>(doc, spec.x, across, (v) => {
        if (v) this.#set({ x: v });
      })),
      // every handler reads the spec as it is AT THE EVENT, never the one
      // this form was painted from: a stale copy undid the edit before it
      field(doc, scatter ? 'Y:' : 'Value:', dropdown<string>(
        doc, first?.column, measures.map((c) => ({ value: c.name, label: c.name })),
        (v) => {
          if (v) this.#set({ y: [{ column: v, fn: this.#spec?.y[0]?.fn ?? 'sum' }] }, true);
        },
      )),
      ...(scatter ? [] : [field(doc, 'Aggregate:', dropdown<AggregateFn>(
        doc, first?.fn, fns,
        (v) => {
          const now = this.#spec?.y[0];
          if (v && now) this.#set({ y: [{ column: now.column, fn: v }] });
        },
      ))]),
      field(doc, spec.mark === 'heatmap' ? 'Rows:' : 'Split by:', dropdown<string>(
        doc, spec.split, dims,
        (v) => {
          if (!this.#spec) return;
          const { split: _old, ...rest } = this.#spec;
          this.#spec = v ? { ...rest, split: v } : rest;
          this.refresh();
        },
        { allowNone: spec.mark !== 'heatmap' },
      )),
    );
    if (spec.mark === 'bar') {
      form.append(field(doc, 'Orientation:', dropdown(doc, spec.options.orientation, [
        { value: 'vertical', label: 'Vertical' },
        { value: 'horizontal', label: 'Horizontal' },
      ] as const, (v) => { if (v) this.#setOption('orientation', v); })));
    }
    if (spec.mark === 'bar' || spec.mark === 'area') {
      form.append(field(doc, 'Stack:', dropdown(doc, spec.options.stack, [
        { value: 'none', label: 'None' },
        { value: 'stacked', label: 'Stacked' },
        { value: 'percent', label: '100%' },
      ] as const, (v) => { if (v) this.#setOption('stack', v); })));
    }
    if (!scatter) {
      form.append(
        field(doc, 'Order by:', dropdown(doc, `${spec.options.sort.by}:${spec.options.sort.direction}`, [
          { value: 'y:desc', label: 'Value, largest first' },
          { value: 'y:asc', label: 'Value, smallest first' },
          { value: 'x:asc', label: 'Category, A to Z' },
          { value: 'x:desc', label: 'Category, Z to A' },
        ] as const, (v) => {
          if (!v) return;
          const [by, direction] = v.split(':') as ['x' | 'y', 'asc' | 'desc'];
          this.#setOption('sort', { by, direction });
        })),
        field(doc, 'At most:', numberInput(doc, spec.options.limit, (v) => {
          if (v !== undefined && v >= 1) this.#setOption('limit', Math.floor(v));
        }, { min: 1, max: 5000, step: 10, width: 80 })),
      );
    }
    form.append(
      field(doc, 'Legend:', dropdown(doc, spec.options.legend, [
        { value: 'top', label: 'Top' },
        { value: 'bottom', label: 'Bottom' },
        { value: 'right', label: 'Right' },
        { value: 'none', label: 'None' },
      ] as const, (v) => { if (v) this.#setOption('legend', v); })),
      checkbox(doc, 'Show values', spec.options.labels, (v) => this.#setOption('labels', v)),
    );
  }

  // -- drawing ----------------------------------------------------------------

  async #draw(): Promise<void> {
    if (this.#disposed) return;
    const spec = this.#spec;
    const cube = this.#options.snapshot();
    if (!spec) return;
    const problems = chartProblems(spec, cube);
    if (problems.length > 0) {
      this.#say(problems.join(' '), true);
      return;
    }
    this.#inflight?.abort();
    const abort = new AbortController();
    this.#inflight = abort;
    this.#say('Loading…');
    try {
      const { query, snapshot } = chartQuery(cube, spec);
      const rows = await this.#options.run(query, snapshot, abort.signal);
      if (abort.signal.aborted || this.#disposed) return;
      this.#chart ??= mountChart(this.#canvas, (key) => this.#options.onPick(key));
      const drawing = chartOption(spec, rows, themeOf(this.#canvas), this.#options.label);
      this.#chart.show(drawing);
      const capped = rows.rowCount >= (spec.mark === 'scatter' ? Infinity : spec.options.limit);
      this.#say([
        ...drawing.notes,
        ...(capped ? [`The first ${spec.options.limit} by the chosen order; raise "At most" to see more.`] : []),
        spec.mark === 'scatter' ? '' : 'Click a mark to filter the cube to it.',
      ].filter(Boolean).join(' '));
    } catch (e) {
      if (abort.signal.aborted || this.#disposed) return;
      this.#say(e instanceof Error ? e.message : String(e), true);
    }
  }

  #say(text: string, bad = false): void {
    this.#status.textContent = text;
    this.#status.classList.toggle('dc-chartpanel-bad', bad);
  }
}
