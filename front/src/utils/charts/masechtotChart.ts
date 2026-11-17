import type { EChartsCoreOption } from 'echarts/core'
import { formatNumber } from '@/utils/format'
import type { ChartContext } from './echarts'

export interface MasechtotCategory {
  /** Masechet id, or the seder id for a heading row. */
  id: string
  label: string
  heading: boolean
}

export interface MasechtotSeries {
  id: string
  label: string
  color: string
  /** One value per category; null = nothing drawn (heading row or not calculated). */
  values: readonly (number | null)[]
}

export interface MasechtotChartInput {
  categories: readonly MasechtotCategory[]
  texts: readonly MasechtotSeries[]
  /** Thin bar of the printed length; null in 100 % mode, where it has no meaning. */
  printed: MasechtotSeries | null
  /** Values are fractions (0–1) shown as percents. */
  percentAxis: boolean
  tooltip: (index: number) => string
  ariaDescription: string
}

const ROW_HEIGHT = 30
const HEADING_HEIGHT = 30
const CHROME_HEIGHT = 90

export function masechtotChartHeight(categories: readonly MasechtotCategory[]): number {
  return categories.reduce((sum, row) => sum + (row.heading ? HEADING_HEIGHT : ROW_HEIGHT), CHROME_HEIGHT)
}

const toData = (values: readonly (number | null)[]) => values.map((value) => (value === null ? '-' : value))

/** Horizontal stacked bar per masechet (enabled texts), with a thin printed-length bar beside it. */
export function masechtotChartOption(input: MasechtotChartInput, context: ChartContext): EChartsCoreOption {
  const axisFormat = (value: number) =>
    input.percentAxis ? `${formatNumber(value * 100, 0)} %` : formatNumber(value, 0)
  const textSeries = input.texts.map((series) => ({
    type: 'bar',
    name: series.label,
    stack: 'texts',
    barWidth: 14,
    barGap: '30%',
    itemStyle: { color: series.color },
    emphasis: { focus: 'none' },
    cursor: 'pointer',
    data: toData(series.values),
  }))
  const printedSeries = input.printed
    ? [
        {
          type: 'bar',
          name: input.printed.label,
          barWidth: 4,
          itemStyle: { color: input.printed.color, opacity: 0.55 },
          emphasis: { focus: 'none' },
          cursor: 'pointer',
          data: toData(input.printed.values),
        },
      ]
    : []
  return {
    animationDuration: 300,
    aria: { enabled: true, description: input.ariaDescription },
    legend: {
      top: 0,
      [context.isRtl ? 'right' : 'left']: 0,
      textStyle: { color: context.foreground },
      selectedMode: false,
    },
    grid: { top: 40, bottom: 28, left: 8, right: 16, containLabel: true },
    tooltip: {
      // On <body>, so small charts and cards with overflow hidden do not clip it.
      appendTo: 'body',
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      confine: true,
      extraCssText: context.isRtl ? 'direction: rtl; text-align: right;' : '',
      formatter: (params: { dataIndex: number }[]) => input.tooltip(params[0]?.dataIndex ?? -1),
    },
    xAxis: {
      type: 'value',
      inverse: context.isRtl,
      max: input.percentAxis && !input.printed ? 1 : undefined,
      axisLabel: { color: context.foreground, formatter: axisFormat },
      splitLine: { lineStyle: { color: context.muted } },
    },
    yAxis: {
      type: 'category',
      inverse: true,
      position: context.isRtl ? 'right' : 'left',
      data: input.categories.map((row) => row.label),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: context.muted } },
      axisLabel: {
        color: context.foreground,
        interval: 0,
        width: 120,
        overflow: 'truncate',
        formatter: (label: string, index: number) => (input.categories[index]?.heading ? `{heading|${label}}` : label),
        rich: { heading: { fontWeight: 'bold', fontSize: 13, color: context.foreground } },
      },
    },
    series: [...textSeries, ...printedSeries],
  }
}
