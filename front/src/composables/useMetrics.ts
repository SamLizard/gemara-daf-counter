import { computed, shallowRef } from 'vue'
import type { MetricsFile, OrderId, TextId, Tractate } from '@/types/metrics'

const data = shallowRef<MetricsFile | null>(null)
const loading = shallowRef(false)
const error = shallowRef<string | null>(null)
let request: Promise<void> | null = null

function load(): Promise<void> {
  request ??= (async () => {
    loading.value = true
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}shas-front.json`)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      data.value = (await response.json()) as MetricsFile
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause)
      request = null
    } finally {
      loading.value = false
    }
  })()
  return request
}

export interface TextTotal {
  /** Full dafim over the masechtot where the text is measured. */
  total: number
  /** Masechtot left out because the text is not calculated there yet (Shas order). */
  missing: string[]
}

export interface Totals {
  printedSides: number
  tractateCount: number
  texts: Partial<Record<TextId, TextTotal>>
}

// Commentaries that the masechtot with `otherCommentaries: 'not-measured'` would have.
const USUAL_COMMENTARIES: readonly TextId[] = ['rashi', 'tosafot']

/**
 * Totals per text over a group of masechtot. Masechtot where a text is not calculated yet
 * (whole masechet left out by the pipeline) are listed in `missing` instead of making the total
 * unknown: they are known gaps, not measurement errors.
 */
function totalsOf(tractates: readonly Tractate[]): Totals {
  const texts: Partial<Record<TextId, TextTotal>> = {}
  const entry = (id: TextId) => (texts[id] ??= { total: 0, missing: [] })
  for (const tractate of tractates) {
    for (const text of tractate.texts) {
      if (text.total === null) entry(text.id).missing.push(tractate.id)
      else entry(text.id).total += text.total
    }
    if (tractate.otherCommentaries === 'not-measured') {
      for (const id of USUAL_COMMENTARIES) entry(id).missing.push(tractate.id)
    }
  }
  return {
    printedSides: tractates.reduce((sum, tractate) => sum + tractate.printedSides, 0),
    tractateCount: tractates.length,
    texts,
  }
}

/** Single access point to the condensed data. Loads public/shas-front.json once. */
export function useMetrics() {
  void load()
  const tractates = computed(() => data.value?.tractates ?? [])
  const orders = computed(() => data.value?.orders ?? [])
  const byId = computed(() => new Map(tractates.value.map((tractate) => [tractate.id, tractate])))
  const shasTotals = computed(() => totalsOf(tractates.value))
  const orderTotals = computed(() =>
    Object.fromEntries(
      orders.value.map((order) => [order, totalsOf(tractates.value.filter((t) => t.order === order))]),
    ) as Record<OrderId, Totals>,
  )
  return {
    data,
    loading,
    error,
    tractates,
    orders,
    shasTotals,
    orderTotals,
    tractate: (id: string) => byId.value.get(id),
  }
}
