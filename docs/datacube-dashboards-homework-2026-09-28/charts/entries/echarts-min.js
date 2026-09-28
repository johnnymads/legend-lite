import * as echarts from 'echarts/core';
import { BarChart, LineChart, ScatterChart, PieChart, HeatmapChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent, TitleComponent, DatasetComponent, VisualMapComponent, AriaComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
echarts.use([BarChart, LineChart, ScatterChart, PieChart, HeatmapChart, GridComponent, TooltipComponent, LegendComponent, TitleComponent, DatasetComponent, VisualMapComponent, AriaComponent, SVGRenderer]);
window.x=echarts;
