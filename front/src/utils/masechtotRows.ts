import type { OrderId, TextId, Tractate, Unit } from '@/types/metrics'
import { ratio, sumKnown, textEntry, visibleTexts } from '@/utils/metrics'
import { knownLength } from '@/utils/rank'

export interface RowText {
  id: TextId
  /** Full dafim; null = not calculated. */
  total: number | null
}

/** One masechet seen through the enabled texts (Masechtot page). */
export interface MasechetRow {
  id: string
  order: OrderId
  /** Position in Shas order. */
  index: number
  printedSides: number
  /** Enabled texts printed on this masechet, in display order (absent texts are not listed). */
  texts: RowText[]
  /**
   * Real length of the enabled texts in full dafim; null if one is not calculated, none is printed,
   * or a commentary is enabled on a masechet whose commentaries are not measured (same rule as the rank).
   */
  real: number | null
  /** Enabled commentaries ÷ Gemara; null if unknown or no enabled commentary is printed. */
  commentaryRatio: number | null
  otherNotMeasured: boolean
}

export type ChartMode = 'absolute' | 'percent'

export function buildRow(tractate: Tractate, index: number, enabled: readonly TextId[]): MasechetRow {
  const texts = visibleTexts(tractate, enabled).map(({ id, total }) => ({ id, total }))
  const commentaries = texts.filter((text) => text.id !== 'main')
  const main = textEntry(tractate, 'main')?.total ?? null
  return {
    id: tractate.id,
    order: tractate.order,
    index,
    printedSides: tractate.printedSides,
    texts,
    real: knownLength(tractate, enabled),
    commentaryRatio: commentaries.length ? ratio(sumKnown(commentaries.map((text) => text.total)), main) : null,
    otherNotMeasured: tractate.otherCommentaries === 'not-measured',
  }
}

/** Converts full dafim to the preferred unit. 'percent' gives a fraction of the masechet's text body. */
export function unitValue(dafim: number, unit: Unit, printedSides: number): number {
  if (unit === 'amudim') return dafim * 2
  if (unit === 'percent') return (dafim * 2) / printedSides
  return dafim
}

/** Printed length in the preferred unit (the whole text body = 100 % in 'percent'). */
export function printedValue(row: MasechetRow, unit: Unit): number {
  return unitValue(row.printedSides / 2, unit, row.printedSides)
}

/**
 * Share of each enabled text in the sum of the known enabled texts of the masechet.
 * A text that is not calculated has no share (null) and is left out of the sum.
 */
export function relativeShares(row: MasechetRow): Partial<Record<TextId, number | null>> {
  const known = row.texts.filter((text) => text.total !== null)
  const sum = known.length ? sumKnown(known.map((text) => text.total)) : null
  const shares: Partial<Record<TextId, number | null>> = {}
  for (const text of row.texts) shares[text.id] = ratio(text.total, sum)
  return shares
}

/** Values drawn for each text: unit values in absolute mode, shares (0–1) in percent mode. */
export function chartValues(row: MasechetRow, mode: ChartMode, unit: Unit): Partial<Record<TextId, number | null>> {
  if (mode === 'percent') return relativeShares(row)
  const values: Partial<Record<TextId, number | null>> = {}
  for (const text of row.texts) {
    values[text.id] = text.total === null ? null : unitValue(text.total, unit, row.printedSides)
  }
  return values
}

/** Text ids that have at least one known value among the rows, in display order. */
export function drawnTextIds(rows: readonly MasechetRow[], order: readonly TextId[]): TextId[] {
  return order.filter((id) => rows.some((row) => row.texts.some((text) => text.id === id && text.total !== null)))
}

/** Masechtot whose real length is within ±tolerance of the given one, closest first. */
export function similarRows(rows: readonly MasechetRow[], id: string, tolerance = 0.15): MasechetRow[] {
  const target = rows.find((row) => row.id === id)?.real
  if (target === null || target === undefined || target === 0) return []
  return rows
    .filter((row) => row.id !== id && row.real !== null && Math.abs(row.real - target) <= tolerance * target)
    .sort((a, b) => Math.abs((a.real ?? 0) - target) - Math.abs((b.real ?? 0) - target))
}
