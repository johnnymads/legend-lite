// The ONE file that draws with ECharts.
//
// Only what DataCube uses is registered (`echarts/core`), never the whole
// library: bar, line, scatter, pie and heatmap, with the grid, tooltip,
// legend, visual map, dataset and aria components, drawn on canvas. (The
// tests draw the same options as SVG in node, registering the SVG renderer
// themselves, so the page does not ship it.)
//
// Everything a chart shows comes from `chart-option.ts`; this file only
// mounts it, keeps it sized to its box, reads the theme from CSS tokens,
// and turns a click on a mark into the values behind it.

import * as echarts from 'echarts/core';
import { BarChart, HeatmapChart, LineChart, PieChart, ScatterChart } from 'echarts/charts';
import {
  AriaComponent,
  DatasetComponent,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsOption } from 'echarts';
import { LIGHT_THEME, type ChartDrawing, type ChartTheme, type MarkKey } from './chart-option.ts';

echarts.use([
  BarChart, LineChart, ScatterChart, PieChart, HeatmapChart,
  GridComponent, TooltipComponent, LegendComponent, TitleComponent,
  DatasetComponent, VisualMapComponent, AriaComponent,
  CanvasRenderer,
]);

/** A chart mounted in an element. */
export interface MountedChart {
  /** Draw (or redraw) a drawing. */
  show(drawing: ChartDrawing): void;
  dispose(): void;
}

/**
 * The theme, from the element's CSS tokens: `--dc-chart-*`, falling back
 * to the reference palette. Canvas cannot read CSS variables itself, so
 * they are read here, once per draw.
 */
export function themeOf(el: Element): ChartTheme {
  const view = el.ownerDocument.defaultView;
  const css = view ? view.getComputedStyle(el) : undefined;
  const read = (name: string, fallback: string): string =>
    css?.getPropertyValue(name).trim() || fallback;
  const list = (name: string, fallback: readonly string[]): string[] => {
    const v = read(name, '');
    return v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [...fallback];
  };
  return {
    surface: read('--dc-chart-surface', LIGHT_THEME.surface),
    ink: read('--dc-chart-ink', LIGHT_THEME.ink),
    inkSecondary: read('--dc-chart-ink-secondary', LIGHT_THEME.inkSecondary),
    muted: read('--dc-chart-muted', LIGHT_THEME.muted),
    grid: read('--dc-chart-grid', LIGHT_THEME.grid),
    axis: read('--dc-chart-axis', LIGHT_THEME.axis),
    series: list('--dc-chart-series', LIGHT_THEME.series),
    sequential: list('--dc-chart-sequential', LIGHT_THEME.sequential),
  };
}

/**
 * Mount a chart in `el`: canvas, sized to the element and kept so.
 * `onPick` receives the values behind a clicked mark (a bar's category,
 * a slice, a heatmap cell); a mark that is not a group (a scatter point)
 * picks nothing.
 */
export function mountChart(el: HTMLElement, onPick?: (key: MarkKey) => void): MountedChart {
  const chart = echarts.init(el, null, { renderer: 'canvas' });
  let drawing: ChartDrawing | null = null;
  chart.on('click', (params: unknown) => {
    const p = params as { seriesIndex?: number; dataIndex?: number };
    if (!drawing || !onPick || p.seriesIndex === undefined || p.dataIndex === undefined) return;
    const key = drawing.keyAt(p.seriesIndex, p.dataIndex);
    if (key) onPick(key);
  });
  const view = el.ownerDocument.defaultView;
  const Observer = view?.ResizeObserver;
  const observer = Observer ? new Observer(() => chart.resize()) : undefined;
  observer?.observe(el);
  return {
    show(d) {
      drawing = d;
      el.setAttribute('aria-label', d.description);
      chart.setOption(d.option as EChartsOption, { notMerge: true });
    },
    dispose() {
      observer?.disconnect();
      chart.dispose();
    },
  };
}
