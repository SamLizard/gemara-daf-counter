import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TextId } from '@/types/metrics'
import { useMetrics } from '@/composables/useMetrics'
import { usePreferences } from '@/composables/usePreferences'
import { useTextColor } from '@/composables/useTextColor'
import { amudRest, amudValue, measuredTextIds } from '@/utils/masechet'
import { matchesEnabled } from '@/utils/metrics'
import { formatFraction, formatPercent } from '@/utils/format'
import type { StripSeries } from '@/utils/charts/pageStrip'

/** Per-amud series of the enabled measured texts of a masechet, plus the neutral rest. */
export function usePageSeries(tractateId: () => string) {
  const { t } = useI18n()
  const { tractate } = useMetrics()
  const { enabledTexts } = usePreferences()
  const textColor = useTextColor()

  const current = computed(() => tractate(tractateId()))
  const amudim = computed(() => current.value?.pages.map((row) => row[0]) ?? [])

  /** Enabled texts shown in the strip; not-measured texts keep their known values (e.g. Rashi sides). */
  const textIds = computed<TextId[]>(() =>
    (current.value?.texts ?? []).map((text) => text.id).filter((id) => matchesEnabled(id, enabledTexts.value)),
  )

  const series = computed<StripSeries[]>(() => {
    const tractateValue = current.value
    if (!tractateValue) return []
    const texts = textIds.value.map((id) => ({
      id,
      label: t(`text.${id}`),
      color: textColor(id),
      values: tractateValue.pages.map((_, index) => amudValue(tractateValue, index, id)),
    }))
    // The rest fills each column to 100 %: headings, spacing, unknown and hidden texts.
    const rest = tractateValue.pages.map((_, index) => amudRest(texts.map((text) => text.values[index] ?? null)))
    return [...texts, { id: 'rest', label: t('value.rest'), color: textColor('rest'), values: rest }]
  })

  function tooltip(index: number): string {
    const lines = series.value.map((entry) => {
      const value = entry.values[index] ?? null
      const shown = entry.id === 'rest' && value !== null ? formatPercent(value) : formatFraction(value)
      return `<span style="color:${entry.color}">●</span> ${entry.label}: ${shown}`
    })
    return [`<b>${amudim.value[index] ?? ''}</b>`, ...lines].join('<br>')
  }

  const measured = computed(() => (current.value ? measuredTextIds(current.value) : []))

  return { current, amudim, textIds, series, tooltip, measured }
}
