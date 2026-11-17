import type { RouteLocationRaw } from 'vue-router'
import type { TextId, Tractate } from '@/types/metrics'
import { formatNumber, formatPercent } from '@/utils/format'
import { printedDafim, ratio, shareOfBody, textEntry } from '@/utils/metrics'

/** One "did you know" fact: a message key, its parameters, and the page it links to. */
export interface Fact {
  key: string
  /** Slot name → tractate id, rendered with TractateName. */
  tractates: Record<string, string>
  /** Slot name → formatted value. */
  values: Record<string, string>
  to: RouteLocationRaw
}

// Very small masechtot (Kinnim, Tamid, Middos…) would make ratios meaningless.
const MIN_PRINTED_SIDES = 40
// Two masechtot "have about the same Gemara" when their totals differ by at most 10 %.
const SAME_LENGTH = 0.1

const total = (tractate: Tractate, id: TextId) => textEntry(tractate, id)?.total ?? null
const link = (id: string, amud?: string): RouteLocationRaw => ({
  name: 'masechet',
  params: { id },
  query: amud ? { amud } : {},
})

/** Pair with about the same Gemara and the largest gap in printed length. */
function printedVsGemara(tractates: readonly Tractate[]): Fact | null {
  let best: { long: Tractate; short: Tractate; gap: number } | null = null
  const big = tractates.filter((t) => t.printedSides >= MIN_PRINTED_SIDES && total(t, 'main') !== null)
  for (const long of big) {
    for (const short of big) {
      const a = total(long, 'main') as number
      const b = total(short, 'main') as number
      if (Math.abs(a - b) / Math.max(a, b) > SAME_LENGTH) continue
      const gap = long.printedSides / short.printedSides
      if (!best || gap > best.gap) best = { long, short, gap }
    }
  }
  if (!best || best.gap <= 1) return null
  const { long, short } = best
  return {
    key: 'home.facts.printedVsGemara',
    tractates: { long: long.id, short: short.id },
    values: {
      longPrinted: formatNumber(printedDafim(long)),
      shortPrinted: formatNumber(printedDafim(short)),
      longMain: formatNumber(total(long, 'main') as number),
      shortMain: formatNumber(total(short, 'main') as number),
    },
    to: link(long.id),
  }
}

function tosafotRatio(tractates: readonly Tractate[]): Fact | null {
  let best: { tractate: Tractate; value: number } | null = null
  for (const tractate of tractates) {
    if (tractate.printedSides < MIN_PRINTED_SIDES) continue
    const value = ratio(total(tractate, 'tosafot'), total(tractate, 'main'))
    if (value !== null && (!best || value > best.value)) best = { tractate, value }
  }
  if (!best) return null
  return {
    key: 'home.facts.tosafotRatio',
    tractates: { tractate: best.tractate.id },
    values: {
      ratio: formatNumber(best.value),
      tosafot: formatNumber(total(best.tractate, 'tosafot') as number),
      main: formatNumber(total(best.tractate, 'main') as number),
    },
    to: link(best.tractate.id),
  }
}

/** Amud of the whole Shas with the highest fraction of one text. */
function densestAmud(tractates: readonly Tractate[], id: TextId, key: string): Fact | null {
  let best: { tractate: Tractate; amud: string; value: number } | null = null
  for (const tractate of tractates) {
    const column = tractate.columns.indexOf(id)
    if (column < 0) continue
    for (const row of tractate.pages) {
      const value = row[column + 1]
      if (typeof value === 'number' && (!best || value > best.value)) best = { tractate, amud: row[0], value }
    }
  }
  if (!best) return null
  return {
    key,
    tractates: { tractate: best.tractate.id },
    values: { amud: best.amud, share: formatPercent(best.value) },
    to: link(best.tractate.id, best.amud),
  }
}

function highestGemaraShare(tractates: readonly Tractate[]): Fact | null {
  let best: { tractate: Tractate; value: number } | null = null
  for (const tractate of tractates) {
    if (tractate.printedSides < MIN_PRINTED_SIDES) continue
    const value = shareOfBody(total(tractate, 'main'), tractate.printedSides)
    if (value !== null && (!best || value > best.value)) best = { tractate, value }
  }
  if (!best) return null
  return {
    key: 'home.facts.gemaraShare',
    tractates: { tractate: best.tractate.id },
    values: {
      share: formatPercent(best.value),
      main: formatNumber(total(best.tractate, 'main') as number),
      printed: formatNumber(printedDafim(best.tractate)),
    },
    to: link(best.tractate.id),
  }
}

/** "Did you know" facts computed from the data; facts that cannot be computed are left out. */
export function didYouKnow(tractates: readonly Tractate[]): Fact[] {
  return [
    printedVsGemara(tractates),
    tosafotRatio(tractates),
    densestAmud(tractates, 'main', 'home.facts.densestGemara'),
    densestAmud(tractates, 'tosafot', 'home.facts.densestTosafot'),
    highestGemaraShare(tractates),
  ].filter((fact): fact is Fact => fact !== null)
}
