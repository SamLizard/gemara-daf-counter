<template>
  <div>
    <v-chart
      class="page-strip"
      :option="option"
      autoresize
      role="img"
      :aria-label="$t('masechet.strip.ariaLabel', { tractate: $t(`tractate.${tractateId}`) })"
      @click="onClick"
      @datazoom="onZoom"
    />
    <p class="text-body-small text-medium-emphasis mt-2">{{ summary }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import VChart from 'vue-echarts'
import { useChartContext } from '@/composables/useChartContext'
import { usePageSeries } from '@/composables/usePageSeries'
import { initialZoom, pageStripOption, type ZoomWindow } from '@/utils/charts/pageStrip'
import { stripSummary } from '@/utils/masechetSummary'

const props = defineProps<{ tractateId: string; selected: string | null }>()
const emit = defineEmits<{ select: [amud: string] }>()

const { t } = useI18n()
const context = useChartContext()
const { current, amudim, series, tooltip } = usePageSeries(() => props.tractateId)

const selectedIndex = computed(() => (props.selected ? amudim.value.indexOf(props.selected) : -1))
const zoom = ref<ZoomWindow>({ start: 0, end: 100 })

// The window follows the selection only when it leaves the visible range (e.g. prev/next buttons).
watch(
  () => props.tractateId,
  () => (zoom.value = initialZoom(amudim.value.length, Math.max(0, selectedIndex.value))),
  { immediate: true },
)
watch(selectedIndex, (index) => {
  const count = amudim.value.length
  const position = count ? (index / count) * 100 : 0
  if (position < zoom.value.start || position > zoom.value.end) zoom.value = initialZoom(count, Math.max(0, index))
})


const option = computed(() =>
  pageStripOption(
    {
      amudim: amudim.value,
      series: series.value,
      selectedIndex: selectedIndex.value,
      zoom: zoom.value,
      tooltip,
      ariaDescription: summary.value,
    },
    context.value,
  ),
)

const summary = computed(() => (current.value ? stripSummary(current.value, t) : ''))

function onClick(params: { dataIndex?: number }) {
  const amud = params.dataIndex === undefined ? undefined : amudim.value[params.dataIndex]
  if (amud) emit('select', amud)
}

interface ZoomEvent {
  start?: number
  end?: number
  batch?: { start?: number; end?: number }[]
}

function onZoom(event: unknown) {
  const zoomEvent = event as ZoomEvent
  const range = zoomEvent.batch?.[0] ?? zoomEvent
  if (range.start !== undefined && range.end !== undefined) zoom.value = { start: range.start, end: range.end }
}
</script>

<style scoped>
.page-strip {
  width: 100%;
  height: 320px;
}
</style>
