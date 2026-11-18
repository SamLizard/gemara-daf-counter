import type { EChartsCoreOption } from 'echarts/core'
import type { TextId } from '@/types/metrics'
import type { ChartContext } from './echarts'

/** Input of the StackedBar component. */
export interface BarSegment {
  /** Text id, or 'rest' for the neutral remainder. */
  id: TextId | 'rest'
  value: number
}

export interface Segment {
  id: string
  label: string
  value: number
  color: string
}

/** One horizontal 100 % bar made of segments (values are fractions of a whole). */
export interface StackedBarOptions {
  /** Value of the full width; defaults to the sum of the segments. */
  max?: number
  /** No tooltip and no pointer events (the bar sits inside a link). */
  silent?: boolean
}

export function stackedBarOption(
  segments: readonly Segment[],
  context: ChartContext,
  format: (value: number) => string,
  options: StackedBarOptions = {},
): EChartsCoreOption {
  return {
    animationDuration: 300,
    grid: { left: 0, right: 0, top: 0, bottom: 0 },
    // In RTL the bar grows from the right, like the reading direction.
    xAxis: { type: 'value', show: false, max: options.max ?? 'dataMax', inverse: context.isRtl },
    yAxis: { type: 'category', show: false, data: [''] },
    tooltip: {
      show: !options.silent,
      // On <body>, so small charts and cards with overflow hidden do not clip it.
      appendTo: 'body',
      trigger: 'item',
      formatter: (params: { seriesName: string; value: number }) => `${params.seriesName}: ${format(params.value)}`,
    },
    series: segments.map((segment) => ({
      type: 'bar',
      name: segment.label,
      stack: 'total',
      data: [segment.value],
      itemStyle: { color: segment.color },
      barWidth: '100%',
      silent: options.silent ?? false,
      emphasis: { focus: 'series' },
    })),
  }
}
