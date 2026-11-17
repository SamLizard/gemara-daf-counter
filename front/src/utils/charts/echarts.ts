import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, HeatmapChart } from 'echarts/charts'
import {
  AriaComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components'

// Register only the modules the site uses (tree-shaken bundle). Imported once by main.ts.
use([
  CanvasRenderer,
  BarChart,
  HeatmapChart,
  AriaComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  VisualMapComponent,
])

export interface ChartContext {
  isRtl: boolean
  /** Text color of the current theme, for axis labels. */
  foreground: string
  /** Muted color for grid lines. */
  muted: string
}
