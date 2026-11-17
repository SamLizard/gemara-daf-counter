import { computed, ref, type Ref } from 'vue'
import { addDays, dafYomiFor } from '@/utils/dafYomi'
import { dafAmudim } from '@/utils/dafYomiStats'
import { useMetrics } from '@/composables/useMetrics'

/** Daf Yomi of `base` shifted by a day offset the user moves with previous / next. */
export function useDafYomi(base: Ref<Date | undefined>) {
  const { tractate } = useMetrics()
  const offset = ref(0)
  const date = computed(() => addDays(base.value ?? new Date(), offset.value))
  const day = computed(() => dafYomiFor(date.value))
  const current = computed(() => (day.value ? tractate(day.value.tractateId) : undefined))
  const amudim = computed(() => (current.value && day.value ? dafAmudim(current.value, day.value.daf) : []))
  /** Last amud learned once today's daf is done. */
  const lastAmud = computed(() => amudim.value[amudim.value.length - 1])

  return {
    date,
    day,
    tractate: current,
    amudim,
    lastAmud,
    previous: () => offset.value--,
    next: () => offset.value++,
    reset: () => (offset.value = 0),
    isToday: computed(() => offset.value === 0),
  }
}
