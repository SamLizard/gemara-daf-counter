import type { EChartsCoreOption } from 'echarts/core'
import { amudDaf, amudSide } from '@/utils/format'
import type { ChartContext } from './echarts'

/** Dafim per row of the grid: 10 dafim = 20 amudim, readable from 360 px. */
const DAFIM_PER_ROW = 10

export interface HeatmapCell {
  x: number
  y: number
  rowIndex: number
}

/** Grid position of an amud: row = block of 10 dafim, column = daf digit × 2 + side. */
export function heatmapCell(amud: string, rowIndex: number, firstRow: number): HeatmapCell {
  const daf = amudDaf(amud)
  return {
    x: (daf % DAFIM_PER_ROW) * 2 + (amudSide(amud) === 'b' ? 1 : 0),
    y: Math.floor(daf / DAFIM_PER_ROW) - firstRow,
    rowIndex,
  }
}

export function heatmapRows(amudim: readonly string[]): { first: number; count: number } {
  const dafim = amudim.map(amudDaf)
  const first = Math.floor(Math.min(...dafim) / DAFIM_PER_ROW)
  const last = Math.floor(Math.max(...dafim) / DAFIM_PER_ROW)
  return { first, count: last - first + 1 }
}

export interface HeatmapInput {
  amudim: readonly string[]
  values: readonly (number | null)[]
  color: string
  selectedIndex: number
  tooltip: (rowIndex: number) => string
  ariaDescription: string
}

export const HEATMAP_ROW_HEIGHT = 22
export const HEATMAP_EXTRA_HEIGHT = 90

/** Grid of amudim colored by the density of one text; unknown cells are gray and dashed. */
export function pageHeatmapOption(input: HeatmapInput, context: ChartContext): EChartsCoreOption {
  const rows = heatmapRows(input.amudim)
  const known: number[][] = []
  const unknown: number[][] = []
  input.amudim.forEach((amud, index) => {
    const cell = heatmapCell(amud, index, rows.first)
    const value = input.values[index]
    if (value === null || value === undefined) unknown.push([cell.x, cell.y, 0, index])
    else known.push([cell.x, cell.y, value, index])
  })
  const max = Math.max(0.01, ...known.map((cell) => cell[2] ?? 0))
  const selected = (cell: number[]) => cell[3] === input.selectedIndex
  const selectedStyle = { borderColor: context.foreground, borderWidth: 2 }
  const columns = Array.from({ length: DAFIM_PER_ROW * 2 }, (_, i) => `${Math.floor(i / 2)}${i % 2 ? 'b' : 'a'}`)
  const dafim = input.amudim.map(amudDaf)
  const [firstDaf, lastDaf] = [Math.min(...dafim), Math.max(...dafim)]
  const rowLabels = Array.from({ length: rows.count }, (_, i) => {
    const start = (rows.first + i) * DAFIM_PER_ROW
    return `${Math.max(start, firstDaf)}–${Math.min(start + DAFIM_PER_ROW - 1, lastDaf)}`
  })
  return {
    animation: false,
    aria: { enabled: true, description: input.ariaDescription },
    grid: { top: 8, bottom: 56, left: 8, right: 8, containLabel: true },
    tooltip: {
      // On <body>, so small charts and cards with overflow hidden do not clip it.
      appendTo: 'body',
      confine: true,
      formatter: (params: { value: number[] }) => input.tooltip(params.value[3] ?? 0),
    },
    xAxis: {
      type: 'category',
      data: columns,
      inverse: context.isRtl,
      position: 'top',
      splitArea: { show: false },
      axisTick: { show: false },
      axisLabel: { color: context.foreground, interval: 1, formatter: (label: string) => label.slice(0, -1) },
    },
    yAxis: {
      type: 'category',
      data: rowLabels,
      inverse: true,
      position: context.isRtl ? 'right' : 'left',
      axisTick: { show: false },
      axisLabel: { color: context.foreground },
    },
    visualMap: {
      type: 'continuous',
      seriesIndex: 0,
      dimension: 2,
      min: 0,
      max,
      orient: 'horizontal',
      left: 'center',
      bottom: 4,
      itemHeight: 120,
      inverse: context.isRtl,
      calculable: false,
      text: [`${Math.round(max * 100)} %`, '0 %'],
      textStyle: { color: context.foreground },
      // Light to full shades of the text color; the gray stays reserved for "not calculated".
      inRange: { color: [input.color], opacity: [0.12, 1] },
    },
    series: [
      {
        type: 'heatmap',
        data: known.map((cell) => (selected(cell) ? { value: cell, itemStyle: selectedStyle } : cell)),
        itemStyle: { borderColor: 'transparent', borderWidth: 1 },
      },
      {
        type: 'heatmap',
        data: unknown.map((cell) => (selected(cell) ? { value: cell, itemStyle: selectedStyle } : cell)),
        itemStyle: { color: context.muted, borderColor: context.foreground, borderWidth: 1, borderType: 'dashed' },
      },
    ],
  }
}
