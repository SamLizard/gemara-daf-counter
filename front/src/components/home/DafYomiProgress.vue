<template>
  <div>
    <div class="text-title-small mb-1">{{ $t('home.dafYomi.progressTitle') }}</div>
    <p class="text-body-small text-medium-emphasis mb-2">
      {{ $t('home.dafYomi.printed', { value: printed }) }}
    </p>
    <div v-for="row in rows" :key="row.id" class="mb-3">
      <div class="d-flex justify-space-between flex-wrap ga-2 text-body-medium">
        <TextName :id="row.id" dot />
        <span v-if="row.done === null || row.total === null" class="text-medium-emphasis">
          {{ $t('value.notCalculated') }}
        </span>
        <span v-else>{{ $t('home.dafYomi.progress', { done: formatNumber(row.done), total: formatNumber(row.total) }) }}</span>
      </div>
      <v-progress-linear
        v-if="row.done !== null && row.total"
        :model-value="(row.done / row.total) * 100"
        :color="`text-${row.id}`"
        height="6"
        rounded
        class="mt-1"
        :aria-label="$t('home.dafYomi.progressLabel')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useMetrics } from '@/composables/useMetrics'
import { usePreferences } from '@/composables/usePreferences'
import { formatNumber } from '@/utils/format'
import { printedDafim, visibleTexts } from '@/utils/metrics'
import { progressUntil } from '@/utils/dafYomiStats'
import TextName from '@/components/common/TextName.vue'

const props = defineProps<{ tractateId: string; lastAmud: string }>()

const { tractate } = useMetrics()
const { enabledTexts } = usePreferences()
const current = computed(() => tractate(props.tractateId))
const printed = computed(() => (current.value ? formatNumber(printedDafim(current.value)) : ''))

const rows = computed(() => {
  const value = current.value
  if (!value) return []
  return visibleTexts(value, enabledTexts.value).map((text) => ({
    id: text.id,
    total: text.total,
    done: text.total === null ? null : progressUntil(value, text.id, props.lastAmud),
  }))
})
</script>
