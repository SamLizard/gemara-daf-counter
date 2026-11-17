<template>
  <div class="masechtot-chart-scroll">
    <v-chart
      class="masechtot-chart"
      :style="{ height: `${height}px` }"
      :option="option"
      autoresize
      role="img"
      :aria-label="ariaLabel"
      @click="onClick"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import VChart from 'vue-echarts'
import { useChartContext } from '@/composables/useChartContext'
import { useTextColor } from '@/composables/useTextColor'
import { usePreferences } from '@/composables/usePreferences'
import { useMasechtotRows } from '@/composables/useMasechtotRows'
import { masechtotChartHeight, masechtotChartOption } from '@/utils/charts/masechtotChart'
import { chartEntries, chartInput } from '@/utils/masechtotChartData'
import type { ChartMode } from '@/utils/masechtotRows'
import type { MasechtotSort } from '@/utils/masechtotSort'

const props = withDefaults(defineProps<{ sort: MasechtotSort; mode: ChartMode; query?: string | null }>(), {
  query: null,
})

const { t } = useI18n()
const router = useRouter()
const context = useChartContext()
const textColor = useTextColor()
const { unit } = usePreferences()
const { visibleRows } = useMasechtotRows(
  () => props.sort,
  () => props.query,
)

const entries = computed(() => chartEntries(visibleRows.value, props.sort, t))
const height = computed(() => masechtotChartHeight(entries.value.map((entry) => entry.category)))
const ariaLabel = computed(() =>
  t(props.mode === 'percent' ? 'masechtot.chart.ariaLabelPercent' : 'masechtot.chart.ariaLabel', {
    count: visibleRows.value.length,
  }),
)

const option = computed(() =>
  masechtotChartOption(
    chartInput(
      entries.value,
      {
        mode: props.mode,
        unit: unit.value,
        color: textColor,
        printedColor: context.value.foreground,
        t,
      },
      ariaLabel.value,
    ),
    context.value,
  ),
)

function onClick(params: { dataIndex?: number }) {
  const row = params.dataIndex === undefined ? null : entries.value[params.dataIndex]?.row
  if (row) void router.push({ name: 'masechet', params: { id: row.id } })
}
</script>

<style scoped>
.masechtot-chart-scroll {
  overflow-x: auto;
}

.masechtot-chart {
  width: 100%;
  min-width: 320px;
}
</style>
