import type { TextEntry, TextId, Tractate } from '@/types/metrics'

/** Sum that returns null as soon as one value is unknown. Unknown is never zero. */
export function sumKnown(values: readonly (number | null | undefined)[]): number | null {
  let sum = 0
  for (const value of values) {
    if (value === null || value === undefined) return null
    sum += value
  }
  return sum
}

export function ratio(a: number | null, b: number | null): number | null {
  if (a === null || b === null || b === 0) return null
  return a / b
}

export function textEntry(tractate: Tractate, id: TextId): TextEntry | undefined {
  return tractate.texts.find((text) => text.id === id)
}

/** Texts of the masechet, in display order, restricted to `ids` when given. */
export function visibleTexts(tractate: Tractate, ids?: readonly TextId[]): TextEntry[] {
  return ids ? tractate.texts.filter((text) => matchesEnabled(text.id, ids)) : tractate.texts
}

export function matchesEnabled(id: TextId, enabled: readonly TextId[]): boolean {
  return enabled.includes(id)
}

/** Values of one page row keyed by text id (only the texts listed in `columns`). */
export function pageValues(tractate: Tractate, rowIndex: number): Partial<Record<TextId, number | null>> {
  const row = tractate.pages[rowIndex]
  const values: Partial<Record<TextId, number | null>> = {}
  if (!row) return values
  tractate.columns.forEach((id, index) => {
    values[id] = row[index + 1] as number | null
  })
  return values
}

export function pageIndex(tractate: Tractate, amud: string): number {
  return tractate.pages.findIndex((row) => row[0] === amud)
}

/** Total in full dafim of the given texts; null if one of them is not measured. */
export function tractateTotal(tractate: Tractate, ids: readonly TextId[]): number | null {
  const texts = visibleTexts(tractate, ids)
  if (!texts.length) return null
  return sumKnown(texts.map((text) => text.total))
}

export function printedDafim(tractate: Tractate): number {
  return tractate.printedSides / 2
}

/** Share of the text body over the whole masechet (full dafim / printed dafim). */
export function shareOfBody(total: number | null, printedSides: number): number | null {
  return ratio(total === null ? null : total * 2, printedSides)
}

export interface Extreme {
  amud: string
  value: number
}

/** Densest and lightest amud for one text (ignores unknown values). */
export function extremes(tractate: Tractate, id: TextId): { max: Extreme; min: Extreme } | null {
  const column = tractate.columns.indexOf(id)
  if (column < 0) return null
  let max: Extreme | null = null
  let min: Extreme | null = null
  for (const row of tractate.pages) {
    const value = row[column + 1]
    if (typeof value !== 'number') continue
    if (!max || value > max.value) max = { amud: row[0], value }
    if (!min || value < min.value) min = { amud: row[0], value }
  }
  return max && min ? { max, min } : null
}
