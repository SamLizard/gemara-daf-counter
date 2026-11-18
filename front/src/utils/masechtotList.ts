import type { OrderId, Unit } from '@/types/metrics'
import type { BarSegment } from '@/utils/charts/stackedBar'
import { chartValues, printedValue, type ChartMode, type MasechetRow } from './masechtotRows'
import type { MasechtotSort } from './masechtotSort'

export interface ListGroup {
  /** Seder of the group; null when the list is not in Shas order. */
  order: OrderId | null
  rows: MasechetRow[]
}

/** In Shas order the masechtot are grouped by seder; other sorts give one flat list. */
export function groupRows(rows: readonly MasechetRow[], sort: MasechtotSort): ListGroup[] {
  if (sort !== 'shas') return [{ order: null, rows: [...rows] }]
  const groups: ListGroup[] = []
  for (const row of rows) {
    const last = groups.at(-1)
    if (last?.order === row.order) last.rows.push(row)
    else groups.push({ order: row.order, rows: [row] })
  }
  return groups
}

/** Bar of one masechet: the known enabled texts (texts not calculated are not drawn). */
export function rowSegments(row: MasechetRow, mode: ChartMode, unit: Unit): BarSegment[] {
  const values = chartValues(row, mode, unit)
  return row.texts.flatMap((text) => {
    const value = values[text.id]
    return typeof value === 'number' && value > 0 ? [{ id: text.id, value }] : []
  })
}

/** Common full width of all bars, so lengths compare across masechtot (1 in 100 % mode). */
export function scaleMax(rows: readonly MasechetRow[], mode: ChartMode, unit: Unit): number {
  if (mode === 'percent') return 1
  const widths = rows.map((row) =>
    Math.max(
      printedValue(row, unit),
      rowSegments(row, mode, unit).reduce((sum, segment) => sum + segment.value, 0),
    ),
  )
  return Math.max(0.0001, ...widths)
}
