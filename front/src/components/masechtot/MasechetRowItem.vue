<template>
  <v-list-item v-if="row" :to="{ name: 'masechet', params: { id: tractateId } }" class="py-2">
    <div class="d-flex align-baseline flex-wrap ga-x-3">
      <TractateName :id="tractateId" class="text-title-small flex-grow-1" />
      <span class="text-body-medium font-weight-medium">{{ value }}</span>
      <span class="text-body-small text-medium-emphasis">{{ printed }}</span>
    </div>
    <StackedBar
      v-if="segments.length"
      class="mt-1"
      :segments="segments"
      :max="max"
      :height="12"
      :legend="false"
      silent
      :ariaLabel="value"
    />
    <div v-else class="text-body-small text-medium-emphasis mt-1">{{ $t('value.notCalculated') }}</div>
    <v-progress-linear
      v-if="mode === 'absolute'"
      class="mt-1"
      :model-value="printedPercent"
      height="3"
      color="on-surface"
      bg-opacity="0"
      rounded
      :aria-label="printed"
    />
    <div v-if="row.otherNotMeasured" class="text-body-small text-medium-emphasis mt-1">
      {{ $t('value.otherCommentariesNotCalculated') }}
    </div>
    <template #append>
      <v-icon :icon="forwardIcon" size="small" class="ms-2 text-medium-emphasis" />
    </template>
  </v-list-item>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMetrics } from '@/composables/useMetrics'
import { usePreferences } from '@/composables/usePreferences'
import { useDirectionIcons } from '@/composables/useDirectionIcons'
import { formatNumber, formatPercent, formatValue } from '@/utils/format'
import { buildRow, printedValue, relativeShares, type ChartMode } from '@/utils/masechtotRows'
import { rowSegments } from '@/utils/masechtotList'
import StackedBar from '@/components/charts/StackedBar.vue'
import TractateName from '@/components/common/TractateName.vue'

const props = defineProps<{ tractateId: string; mode: ChartMode; max: number }>()

const { t } = useI18n()
const { tractate } = useMetrics()
const { enabledTexts, unit } = usePreferences()
const { forwardIcon } = useDirectionIcons()

const row = computed(() => {
  const current = tractate(props.tractateId)
  return current ? buildRow(current, 0, enabledTexts.value) : null
})
const segments = computed(() => (row.value ? rowSegments(row.value, props.mode, unit.value) : []))
const value = computed(() => {
  if (!row.value) return ''
  if (props.mode === 'percent') {
    const main = relativeShares(row.value).main
    return main === null || main === undefined
      ? formatValue(row.value.real, unit.value, row.value.printedSides)
      : t('masechtot.list.mainShare', { share: formatPercent(main) })
  }
  return formatValue(row.value.real, unit.value, row.value.printedSides)
})
const printed = computed(() =>
  row.value ? t('unit.printedDafimValue', { value: formatNumber(row.value.printedSides / 2) }) : '',
)
const printedPercent = computed(() => (row.value ? (printedValue(row.value, unit.value) / props.max) * 100 : 0))
</script>
