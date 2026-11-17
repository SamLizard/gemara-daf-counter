import { computed, shallowRef } from 'vue'
import type { MetricsFile, OrderId, TextId, Tractate } from '@/types/metrics'
import { sumKnown } from '@/utils/metrics'

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

export interface Totals {
  printedSides: number
  tractateCount: number
  /** Full dafim per text, null if one masechet has it not measured. */
  texts: Partial<Record<TextId, number | null>>
}

/**
 * Totals per text over a group of masechtot. A text is summed only over masechtot where it is
 * printed (absent texts are skipped); one `not-measured` masechet makes the whole total null.
 * "rashi-rashbam" is counted under "rashi".
 */
function totalsOf(tractates: readonly Tractate[]): Totals {
  const byText = new Map<TextId, (number | null)[]>()
  for (const tractate of tractates) {
    for (const text of tractate.texts) {
      const id: TextId = text.id === 'rashi-rashbam' ? 'rashi' : text.id
      byText.set(id, [...(byText.get(id) ?? []), text.total])
    }
  }
  const texts: Partial<Record<TextId, number | null>> = {}
  for (const [id, values] of byText) texts[id] = sumKnown(values)
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
