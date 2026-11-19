<template>
  <div>
    <div class="text-title-small mb-1">
      {{ $t('progress.title') }} <span class="text-medium-emphasis">· {{ $t('progress.until', { amud: lastAmud }) }}</span>
    </div>
    <p v-if="showPrinted" class="text-body-small text-medium-emphasis mb-2">
      {{ $t('progress.printed', { value: printed }) }}
    </p>
    <p v-if="!rows.length" class="text-body-small text-medium-emphasis mb-0">{{ $t('progress.noText') }}</p>
    <div v-for="row in rows" :key="row.id" class="mb-3">
      <div class="d-flex justify-space-between flex-wrap ga-2 text-body-medium">
        <TextName :id="row.id" dot />
        <span v-if="row.done === null || row.total === null" class="text-medium-emphasis">
          {{ $t('value.notCalculated') }}
        </span>
        <span v-else>
          {{ $t('progress.value', { done: formatNumber(row.done), total: formatNumber(row.total) }) }}
          <span class="text-medium-emphasis">({{ formatPercent(row.share ?? 0) }})</span>
        </span>
      </div>
      <v-progress-linear
        v-if="row.share !== null"
        :model-value="row.share * 100"
        :color="`text-${row.id}`"
        height="6"
        rounded
        class="mt-1"
        :aria-label="$t('progress.label', { amud: lastAmud })"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useMetrics } from '@/composables/useMetrics'
import { usePreferences } from '@/composables/usePreferences'
import { formatNumber, formatPercent } from '@/utils/format'
import { printedDafim, ratio, visibleTexts } from '@/utils/metrics'
import { progressUntil } from '@/utils/dafYomiStats'
import TextName from './TextName.vue'

/** Real length learned from the start of the masechet up to and including `lastAmud`, per enabled text. */
const props = withDefaults(defineProps<{ tractateId: string; lastAmud: string; showPrinted?: boolean }>(), {
  showPrinted: true,
})

const { tractate } = useMetrics()
const { enabledTexts } = usePreferences()
const current = computed(() => tractate(props.tractateId))
const printed = computed(() => (current.value ? formatNumber(printedDafim(current.value)) : ''))

const rows = computed(() => {
  const value = current.value
  if (!value) return []
  return visibleTexts(value, enabledTexts.value).map((text) => {
    const done = text.total === null ? null : progressUntil(value, text.id, props.lastAmud)
    return { id: text.id, total: text.total, done, share: ratio(done, text.total) }
  })
})
</script>
