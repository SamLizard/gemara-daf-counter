import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { useMetrics } from '@/composables/useMetrics'
import { usePreferences } from '@/composables/usePreferences'
import { buildRow, type MasechetRow } from '@/utils/masechtotRows'
import { matchesTractate } from '@/utils/masechtotSearch'
import { sortRows, type MasechtotSort } from '@/utils/masechtotSort'

/** Rows of the Masechtot page for the enabled texts: all of them, and the filtered + sorted ones. */
export function useMasechtotRows(sort: MaybeRefOrGetter<MasechtotSort>, query: MaybeRefOrGetter<string | null>) {
  const { tractates } = useMetrics()
  const { enabledTexts } = usePreferences()

  const rows = computed<MasechetRow[]>(() =>
    tractates.value.map((tractate, index) => buildRow(tractate, index, enabledTexts.value)),
  )
  const visibleRows = computed(() =>
    sortRows(
      rows.value.filter((row) => matchesTractate(row.id, toValue(query))),
      toValue(sort),
    ),
  )
  return { rows, visibleRows }
}
