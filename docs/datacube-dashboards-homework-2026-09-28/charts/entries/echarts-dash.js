import * as echarts from 'echarts/core';
import { BarChart, LineChart, ScatterChart, PieChart, HeatmapChart, TreemapChart, BoxplotChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent, TitleComponent, DatasetComponent, VisualMapComponent, AriaComponent, DataZoomComponent, BrushComponent, ToolboxComponent, TransformComponent, MarkLineComponent } from 'echarts/components';
import { SVGRenderer, CanvasRenderer } from 'echarts/renderers';
import { LabelLayout, UniversalTransition } from 'echarts/features';
echarts.use([BarChart, LineChart, ScatterChart, PieChart, HeatmapChart, TreemapChart, BoxplotChart, GridComponent, TooltipComponent, LegendComponent, TitleComponent, DatasetComponent, VisualMapComponent, AriaComponent, DataZoomComponent, BrushComponent, ToolboxComponent, TransformComponent, MarkLineComponent, SVGRenderer, CanvasRenderer, LabelLayout, UniversalTransition]);
window.x=echarts;
