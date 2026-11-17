import type { TextId } from '@/types/metrics'
import type { Totals } from '@/composables/useMetrics'
import type { BarSegment } from '@/utils/charts/stackedBar'
import { shareOfBody } from '@/utils/metrics'

const SHAS_ORDER: readonly TextId[] = ['main', 'rashi', 'tosafot', 'ran']

/** Texts of the whole Shas in display order, with their total (null = not calculated). */
export function shasRows(totals: Totals): { id: TextId; total: number | null }[] {
  return SHAS_ORDER.filter((id) => id in totals.texts).map((id) => ({ id, total: totals.texts[id] ?? null }))
}

/** Share of the whole Shas text body per text; texts with an unknown total are left out. */
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
