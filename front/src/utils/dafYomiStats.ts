import type { TextId, Tractate } from '@/types/metrics'
import type { BarSegment } from '@/utils/charts/stackedBar'
import { pageIndex, pageValues, sumKnown, visibleTexts } from '@/utils/metrics'

/**
 * Amudim of one printed daf that belong to this masechet. Daf Yomi gives the printed daf number,
 * and Kinnim, Tamid and Middos start in the middle of a daf (22a, 25b, 34a), so one side may be missing.
 */
export function dafAmudim(tractate: Tractate, daf: number): string[] {
  return [`${daf}a`, `${daf}b`].filter((amud) => pageIndex(tractate, amud) >= 0)
}

/** Segments of one amud for the enabled texts, plus the rest of the page. Unknown values are not drawn. */
export function amudSegments(tractate: Tractate, amud: string, enabled: readonly TextId[]): BarSegment[] {
  const values = pageValues(tractate, pageIndex(tractate, amud))
  const segments: BarSegment[] = []
  for (const text of visibleTexts(tractate, enabled)) {
    const value = values[text.id]
    if (typeof value === 'number') segments.push({ id: text.id, value })
  }
  const known = segments.reduce((sum, segment) => sum + segment.value, 0)
  segments.push({ id: 'rest', value: Math.max(0, 1 - known) })
  return segments
}

/** Full dafim of one text from the start of the masechet up to and including `lastAmud`. */
export function progressUntil(tractate: Tractate, id: TextId, lastAmud: string): number | null {
  const column = tractate.columns.indexOf(id)
  const last = pageIndex(tractate, lastAmud)
  if (column < 0 || last < 0) return null
  const sum = sumKnown(tractate.pages.slice(0, last + 1).map((row) => row[column + 1] as number | null))
  return sum === null ? null : sum / 2
}

/** Long date in the current locale, with Western digits. */
export function formatLongDate(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'full', numberingSystem: 'latn' }).format(date)
}
