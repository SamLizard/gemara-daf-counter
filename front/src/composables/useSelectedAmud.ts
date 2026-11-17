import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMetrics } from '@/composables/useMetrics'
import { validAmud } from '@/utils/masechet'

/** Selected amud of a masechet, stored in the `amud` query (defaults to the first amud). */
export function useSelectedAmud(tractateId: () => string) {
  const route = useRoute()
  const router = useRouter()
  const { tractate } = useMetrics()

  const amud = computed<string | null>(() => {
    const current = tractate(tractateId())
    return current ? validAmud(current, route.query.amud) : null
  })

  function select(value: string) {
    if (value === route.query.amud) return
    void router.replace({ query: { ...route.query, amud: value } })
  }

  return { amud, select }
}
