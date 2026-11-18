<template>
  <div>
    <v-chart
      class="stacked-bar"
      :class="{ 'stacked-bar--silent': silent }"
      :style="{ height: `${height}px` }"
      :option="option"
      autoresize
      role="img"
      :aria-label="ariaLabel"
    />
    <div v-if="legend" class="d-flex flex-wrap ga-3 mt-2 text-body-small">
      <span v-for="segment in segments" :key="segment.id">
        <TextName v-if="isText(segment.id)" :id="segment.id" dot />
        <template v-else>{{ $t('value.rest') }}</template>
        <span class="text-medium-emphasis ms-1">{{ formatPercent(segment.value / total) }}</span>
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import VChart from 'vue-echarts'
import { TEXT_IDS, type TextId } from '@/types/metrics'
import { formatPercent } from '@/utils/format'
import { stackedBarOption, type BarSegment } from '@/utils/charts/stackedBar'
import { useChartContext } from '@/composables/useChartContext'
import { useTextColor } from '@/composables/useTextColor'
import TextName from '@/components/common/TextName.vue'

const props = withDefaults(
  defineProps<{
    segments: BarSegment[]
    ariaLabel: string
    height?: number
    legend?: boolean
    /** Value of the full width; defaults to the sum of the segments. */
    max?: number
    /** No tooltip, clicks go through to the parent (e.g. a list item link). */
    silent?: boolean
  }>(),
  { height: 28, legend: true, max: undefined, silent: false },
)

const { t } = useI18n()
const context = useChartContext()
const textColor = useTextColor()
const total = computed(() => props.segments.reduce((sum, segment) => sum + segment.value, 0) || 1)
const isText = (id: string): id is TextId => (TEXT_IDS as readonly string[]).includes(id)

const option = computed(() =>
  stackedBarOption(
    props.segments.map((segment) => ({
      id: segment.id,
      label: segment.id === 'rest' ? t('value.rest') : t(`text.${segment.id}`),
      value: segment.value,
      color: textColor(segment.id),
    })),
    context.value,
    (value) => formatPercent(value / total.value),
    { max: props.max, silent: props.silent },
  ),
)
</script>

<style scoped>
.stacked-bar {
  width: 100%;
  border-radius: 6px;
  overflow: hidden;
}

.stacked-bar--silent {
  pointer-events: none;
}
</style>
