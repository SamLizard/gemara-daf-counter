import type { TextId, Tractate } from '@/types/metrics'
import { tractateTotal } from '@/utils/metrics'

export interface Rank {
  /** 1 = longest. */
  rank: number
  /** Number of masechtot whose total is known for these texts. */
  count: number
}

/**
 * Real length of the given texts, null when unknown. A masechet whose commentaries are not
 * measured is unknown as soon as a commentary is asked for (its missing Rashi is not a zero).
 */
export function knownLength(tractate: Tractate, ids: readonly TextId[]): number | null {
  if (tractate.otherCommentaries === 'not-measured' && ids.some((id) => id !== 'main')) return null
  return tractateTotal(tractate, ids)
}

/**
 * Rank of a masechet by real length of the given texts. Masechtot whose length is unknown
 * are left out of the ranking; null if this one is unknown.
 */
export function lengthRank(tractates: readonly Tractate[], id: string, ids: readonly TextId[]): Rank | null {
  const known = tractates
    .map((tractate) => ({ id: tractate.id, total: knownLength(tractate, ids) }))
    .filter((entry): entry is { id: string; total: number } => entry.total !== null)
    .sort((a, b) => b.total - a.total)
  const index = known.findIndex((entry) => entry.id === id)
  return index < 0 ? null : { rank: index + 1, count: known.length }
}
