import { i18n, t } from '@/i18n'
import type { TextId } from '@/types/metrics'
import type { Totals } from '@/composables/useMetrics'
import type { BarSegment } from '@/utils/charts/stackedBar'
import { shareOfBody } from '@/utils/metrics'

const SHAS_ORDER: readonly TextId[] = ['main', 'rashi', 'rashbam', 'ran', 'tosafot']

export interface ShasRow {
  id: TextId
  total: number
  missing: string[]
}

/** Texts of the whole Shas in display order. Texts measured nowhere are left out. */
export function shasRows(totals: Totals): ShasRow[] {
  return SHAS_ORDER.flatMap((id) => {
    const entry = totals.texts[id]
    return entry && entry.total > 0 ? [{ id, ...entry }] : []
  })
}

/** "Without Nedarim" / "Without Shekalim, Kinnim, Tamid and Middos": masechtot not calculated yet. */
export function missingNote(missing: readonly string[]): string | undefined {
  if (!missing.length) return undefined
  const names = missing.map((id) => t(`tractate.${id}`))
  const list = new Intl.ListFormat(i18n.global.locale.value, { type: 'conjunction' }).format(names)
  return t('home.shas.missing', { list }, missing.length)
}

/** Share of the whole Shas text body per text, plus the rest. */
export function shasSegments(totals: Totals): BarSegment[] {
  const segments: BarSegment[] = []
  for (const { id, total } of shasRows(totals)) {
    const share = shareOfBody(total, totals.printedSides)
    if (share !== null) segments.push({ id, value: share })
  }
  if (!segments.length) return []
  const known = segments.reduce((sum, segment) => sum + segment.value, 0)
  segments.push({ id: 'rest', value: Math.max(0, 1 - known) })
  return segments
}
