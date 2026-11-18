import type { TextId, Tractate } from '@/types/metrics'
import type { BarSegment } from '@/utils/charts/stackedBar'
import { pageIndex, ratio, shareOfBody, textEntry } from '@/utils/metrics'

/**
 * Value of one text on one amud (fraction of the text body), null = not calculated.
 * A `not-measured` text keeps its positive values (none at the moment),
 * but its zeros mean "not measured" (the pipeline stores excluded texts as 0), never "none".
 */
export function amudValue(tractate: Tractate, rowIndex: number, id: TextId): number | null {
  const column = tractate.columns.indexOf(id)
  const value = tractate.pages[rowIndex]?.[column + 1]
  if (column < 0 || typeof value !== 'number') return null
  if (value === 0 && textEntry(tractate, id)?.state !== 'measured') return null
  return value
}

/** Neutral remainder of the page: 1 − the known values (unknown values are not counted). */
export function amudRest(values: readonly (number | null)[]): number {
  const known = values.reduce<number>((sum, value) => sum + (value ?? 0), 0)
  return Math.max(0, 1 - known)
}

/** Segments of one amud for StackedBar: known values of the given texts, then the rest. */
export function amudSegments(tractate: Tractate, rowIndex: number, ids: readonly TextId[]): BarSegment[] {
  const values = ids.map((id) => ({ id, value: amudValue(tractate, rowIndex, id) }))
  const segments: BarSegment[] = values
    .filter((entry): entry is { id: TextId; value: number } => entry.value !== null && entry.value > 0)
    .map((entry) => ({ id: entry.id, value: entry.value }))
  return [...segments, { id: 'rest', value: amudRest(values.map((entry) => entry.value)) }]
}

/** The requested amud if it exists in the masechet, else its first amud. */
export function validAmud(tractate: Tractate, amud: unknown): string | null {
  if (typeof amud === 'string' && pageIndex(tractate, amud) >= 0) return amud
  return tractate.pages[0]?.[0] ?? null
}

export function neighbourAmud(tractate: Tractate, amud: string, step: 1 | -1): string | null {
  const index = pageIndex(tractate, amud)
  if (index < 0) return null
  return tractate.pages[index + step]?.[0] ?? null
}

export interface TextStat {
  id: TextId
  /** Full dafim, null = not calculated. */
  total: number | null
  share: number | null
  /** Commentary ÷ Gemara; null for the Gemara itself or when unknown. */
  ratioToMain: number | null
}

export function textStats(tractate: Tractate): TextStat[] {
  const main = textEntry(tractate, 'main')?.total ?? null
  return tractate.texts.map((text) => ({
    id: text.id,
    total: text.total,
    share: shareOfBody(text.total, tractate.printedSides),
    ratioToMain: text.id === 'main' ? null : ratio(text.total, main),
  }))
}

export function measuredTextIds(tractate: Tractate): TextId[] {
  return tractate.texts.filter((text) => text.state === 'measured').map((text) => text.id)
}
