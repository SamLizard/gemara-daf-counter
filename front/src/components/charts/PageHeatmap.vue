<template>
  <div>
    <v-chart
      class="page-heatmap"
      :style="{ height: `${height}px` }"
      :option="option"
      autoresize
      role="img"
      :aria-label="$t('masechet.heatmap.ariaLabel', { text: $t(`text.${textId}`), tractate: $t(`tractate.${tractateId}`) })"
      @click="onClick"
    />
    <div class="d-flex flex-wrap align-center ga-2 text-body-small text-medium-emphasis mt-1">
      <span class="unknown-swatch" aria-hidden="true" />
      <span>{{ $t('value.notCalculated') }}</span>
    </div>
    <p class="text-body-small text-medium-emphasis mt-2">{{ summary }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import VChart from 'vue-echarts'
import type { TextId } from '@/types/metrics'
import { useMetrics } from '@/composables/useMetrics'
import { useChartContext } from '@/composables/useChartContext'
import { useTextColor } from '@/composables/useTextColor'
import { amudValue } from '@/utils/masechet'
import { formatFraction } from '@/utils/format'
import { heatmapSummary } from '@/utils/masechetSummary'
import {
  HEATMAP_EXTRA_HEIGHT,
  HEATMAP_ROW_HEIGHT,
  heatmapRows,
  pageHeatmapOption,
} from '@/utils/charts/pageHeatmap'

const props = defineProps<{ tractateId: string; textId: TextId; selected: string | null }>()
const emit = defineEmits<{ select: [amud: string] }>()

const { t } = useI18n()
const { tractate } = useMetrics()
const context = useChartContext()
const textColor = useTextColor()

const current = computed(() => tractate(props.tractateId))
const amudim = computed(() => current.value?.pages.map((row) => row[0]) ?? [])
const values = computed(() => {
  const tractateValue = current.value
  return tractateValue ? tractateValue.pages.map((_, index) => amudValue(tractateValue, index, props.textId)) : []
})
const height = computed(() =>
  amudim.value.length ? heatmapRows(amudim.value).count * HEATMAP_ROW_HEIGHT + HEATMAP_EXTRA_HEIGHT : 0,
)
const summary = computed(() => (current.value ? heatmapSummary(current.value, props.textId, t) : ''))

function tooltip(index: number): string {
  return `<b>${amudim.value[index] ?? ''}</b><br>${t(`text.${props.textId}`)}: ${formatFraction(values.value[index])}`
}

const option = computed(() =>
  pageHeatmapOption(
    {
      amudim: amudim.value,
      values: values.value,
      color: textColor(props.textId),
      selectedIndex: props.selected ? amudim.value.indexOf(props.selected) : -1,
      tooltip,
      ariaDescription: summary.value,
    },
    context.value,
  ),
)

function onClick(params: { value?: unknown }) {
  const index = Array.isArray(params.value) ? params.value[3] : undefined
  const amud = typeof index === 'number' ? amudim.value[index] : undefined
  if (amud) emit('select', amud)
}
</script>

<style scoped>
.page-heatmap {
  width: 100%;
}

.unknown-swatch {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 1px dashed currentColor;
  background-color: rgba(var(--v-theme-on-surface), 0.12);
}
</style>
