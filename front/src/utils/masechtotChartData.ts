import { t as globalT } from '@/i18n'
import { TEXT_IDS, type TextId, type Unit } from '@/types/metrics'
import { formatNumber, formatPercent, formatValue } from '@/utils/format'
import type { MasechtotCategory, MasechtotChartInput, MasechtotSeries } from '@/utils/charts/masechtotChart'
import { chartValues, drawnTextIds, printedValue, relativeShares, type ChartMode, type MasechetRow } from './masechtotRows'
import type { MasechtotSort } from './masechtotSort'

type Translate = (key: string, params?: Record<string, unknown>) => string

export interface ChartEntry {
  category: MasechtotCategory
  row: MasechetRow | null
}

/** Chart rows; in Shas order a heading row is inserted before each seder. */
export function chartEntries(rows: readonly MasechetRow[], sort: MasechtotSort, t: Translate = globalT): ChartEntry[] {
  const entries: ChartEntry[] = []
  let order: string | null = null
  for (const row of rows) {
    if (sort === 'shas' && row.order !== order) {
      order = row.order
      entries.push({ category: { id: `order:${row.order}`, label: t(`order.${row.order}`), heading: true }, row: null })
    }
    entries.push({ category: { id: row.id, label: t(`tractate.${row.id}`), heading: false }, row })
  }
  return entries
}

export interface ChartDataOptions {
  mode: ChartMode
  unit: Unit
  color: (id: TextId) => string
  printedColor: string
  t?: Translate
}

function textLine(row: MasechetRow, id: TextId, total: number | null, options: ChartDataOptions, t: Translate): string {
  const value = formatValue(total, options.unit, row.printedSides)
  const share = options.mode === 'percent' ? relativeShares(row)[id] : null
  const shown = share === null || share === undefined ? value : `${formatPercent(share)} · ${value}`
  return `<span style="color:${options.color(id)}">●</span> ${t(`text.${id}`)}: ${shown}`
}

/** Table cell of one text: its share in percent mode, its value in the unit otherwise; '' if not printed. */
export function textCell(row: MasechetRow, id: TextId, mode: ChartMode, unit: Unit): string {
  const text = row.texts.find((entry) => entry.id === id)
  if (!text) return ''
  if (mode === 'percent') {
    const share = relativeShares(row)[id]
    return share === null || share === undefined ? globalT('value.notCalculated') : formatPercent(share)
  }
  return formatValue(text.total, unit, row.printedSides)
}

/** HTML of the tooltip of one chart row. Labels come from the locale files only. */
export function rowTooltip(entry: ChartEntry | undefined, options: ChartDataOptions): string {
  const t = options.t ?? globalT
  if (!entry) return ''
  const { row } = entry
  if (!row) return `<b>${entry.category.label}</b>`
  const lines = row.texts.map((text) => textLine(row, text.id, text.total, options, t))
  if (row.otherNotMeasured) lines.push(t('value.otherCommentariesNotCalculated'))
  lines.push(t('masechtot.chart.realLength', { value: formatValue(row.real, options.unit, row.printedSides) }))
  lines.push(t('unit.printedDafimValue', { value: formatNumber(row.printedSides / 2) }))
  return [`<b>${entry.category.label}</b>`, ...lines].join('<br>')
}

/** Series of the chart: one per drawn text, plus the printed length in absolute mode. */
export function chartInput(
  entries: readonly ChartEntry[],
  options: ChartDataOptions,
  ariaDescription: string,
): MasechtotChartInput {
  const t = options.t ?? globalT
  const rows = entries.flatMap((entry) => (entry.row ? [entry.row] : []))
  const values = entries.map((entry) => (entry.row ? chartValues(entry.row, options.mode, options.unit) : null))
  const texts: MasechtotSeries[] = drawnTextIds(rows, TEXT_IDS).map((id) => ({
    id,
    label: t(`text.${id}`),
    color: options.color(id),
    values: values.map((rowValues) => rowValues?.[id] ?? null),
  }))
  const printed: MasechtotSeries | null =
    options.mode === 'absolute'
      ? {
          id: 'printed',
          label: t('masechtot.chart.printed'),
          color: options.printedColor,
          values: entries.map((entry) => (entry.row ? printedValue(entry.row, options.unit) : null)),
        }
      : null
  return {
    categories: entries.map((entry) => entry.category),
    texts,
    printed,
    percentAxis: options.mode === 'percent' || options.unit === 'percent',
    tooltip: (index) => rowTooltip(entries[index], options),
    ariaDescription,
  }
}
