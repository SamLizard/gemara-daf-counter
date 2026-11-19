import type { EChartsCoreOption } from 'echarts/core'
import type { ChartContext } from './echarts'

export interface StripSeries {
  /** Text id or 'rest'. */
  id: string
  label: string
  color: string
  /** One fraction per amud; null = not calculated (drawn as nothing). */
  values: readonly (number | null)[]
}

export interface StripInput {
  amudim: readonly string[]
  series: readonly StripSeries[]
  selectedIndex: number
  /** Zoom window in percent; kept by the component so a click does not move the window. */
  zoom: ZoomWindow
  tooltip: (index: number) => string
  ariaDescription: string
}

export interface ZoomWindow {
  start: number
  end: number
}

/** Amudim shown at once before zooming; longer masechtot get a zoom window. */
const WINDOW = 60

export function needsZoom(count: number): boolean {
  return count > WINDOW
}

/** Initial zoom window (percent) of about WINDOW amudim around `center`. */
export function initialZoom(count: number, center: number): ZoomWindow {
  if (!needsZoom(count)) return { start: 0, end: 100 }
  const first = Math.max(0, Math.min(count - WINDOW, center - WINDOW / 2))
  return { start: (first / count) * 100, end: ((first + WINDOW) / count) * 100 }
}

/** Window scaled around its center by `factor` (< 1 zooms in), kept within 0–100 and at least 10 amudim. */
export function scaleZoom(window: ZoomWindow, factor: number, count: number): ZoomWindow {
  const minSpan = count ? Math.min(100, (10 / count) * 100) : 100
  const span = Math.min(100, Math.max(minSpan, (window.end - window.start) * factor))
  const center = (window.start + window.end) / 2
  const start = Math.min(100 - span, Math.max(0, center - span / 2))
  return { start, end: start + span }
}

export const FULL_ZOOM: ZoomWindow = { start: 0, end: 100 }

/** One stacked column per amud (fractions of the text body), with zoom for long masechtot. */
export function pageStripOption(input: StripInput, context: ChartContext): EChartsCoreOption {
  const zoomed = needsZoom(input.amudim.length)
  const window = input.zoom
  return {
    animationDuration: 300,
    aria: { enabled: true, description: input.ariaDescription },
    legend: {
      top: 0,
      [context.isRtl ? 'right' : 'left']: 0,
      textStyle: { color: context.foreground },
      selectedMode: false,
    },
    grid: { top: 36, bottom: zoomed ? 64 : 28, left: 8, right: 8, containLabel: true },
    tooltip: {
      // On <body>, so small charts and cards with overflow hidden do not clip it.
      appendTo: 'body',
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      confine: true,
      formatter: (params: { dataIndex: number }[]) => input.tooltip(params[0]?.dataIndex ?? 0),
    },
    xAxis: {
      type: 'category',
      data: input.amudim,
      inverse: context.isRtl,
      axisLabel: { color: context.foreground },
      axisLine: { lineStyle: { color: context.muted } },
    },
    yAxis: {
      type: 'value',
      max: 1,
      position: context.isRtl ? 'right' : 'left',
      axisLabel: { color: context.foreground, formatter: (value: number) => `${Math.round(value * 100)} %` },
      splitLine: { lineStyle: { color: context.muted } },
    },
    dataZoom: zoomed
      ? [
          // On touch screens the slider alone moves the window, so a drag on the bars scrolls the page.
          ...(context.touch ? [] : [{ type: 'inside', xAxisIndex: 0, ...window }]),
          {
            type: 'slider',
            xAxisIndex: 0,
            bottom: 8,
            height: context.touch ? 28 : 20,
            // Off: a touch next to a handle would start a new selection instead of moving the handle.
            brushSelect: false,
            handleSize: context.touch ? '160%' : '100%',
            moveHandleSize: context.touch ? 14 : 7,
            ...window,
          },
        ]
      : [],
    series: input.series.map((series) => ({
      type: 'bar',
      name: series.label,
      stack: 'page',
      barCategoryGap: '10%',
      itemStyle: { color: series.color },
      emphasis: { focus: 'none' },
      data: series.values.map((value, index) => {
        if (value === null) return '-'
        if (index !== input.selectedIndex) return value
        // Neutral highlight: a theme accent could be mistaken for a text color.
        const style = series.id === 'rest' ? { color: context.foreground, opacity: 0.3 } : { color: series.color }
        return { value, itemStyle: { ...style, borderColor: context.foreground, borderWidth: 1 } }
      }),
    })),
  }
}
