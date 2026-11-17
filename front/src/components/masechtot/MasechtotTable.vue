<template>
  <v-expansion-panels variant="accordion">
    <v-expansion-panel :title="$t('masechtot.table.title')">
      <v-expansion-panel-text>
        <div class="table-scroll">
          <v-table density="compact">
            <thead>
              <tr>
                <th scope="col" class="text-start">{{ $t('masechtot.table.masechet') }}</th>
                <th v-for="id in columns" :key="id" scope="col" class="text-end"><TextName :id="id" /></th>
                <th scope="col" class="text-end">{{ $t('masechtot.table.real') }}</th>
                <th scope="col" class="text-end">{{ $t('masechtot.table.printed') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in tableRows" :key="row.id">
                <th scope="row" class="text-start font-weight-regular">
                  <router-link :to="{ name: 'masechet', params: { id: row.id } }">
                    <TractateName :id="row.id" hide-hebrew />
                  </router-link>
                  <div v-if="row.otherNotMeasured" class="text-body-small text-medium-emphasis">
                    {{ $t('value.otherCommentariesNotCalculated') }}
                  </div>
                </th>
                <td v-for="(cell, index) in row.cells" :key="index" class="text-end">{{ cell }}</td>
                <td class="text-end">{{ row.real }}</td>
                <td class="text-end">{{ row.printed }}</td>
              </tr>
            </tbody>
          </v-table>
        </div>
      </v-expansion-panel-text>
    </v-expansion-panel>
  </v-expansion-panels>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { TEXT_IDS } from '@/types/metrics'
import { usePreferences } from '@/composables/usePreferences'
import { useMasechtotRows } from '@/composables/useMasechtotRows'
import { formatNumber, formatValue } from '@/utils/format'
import { textCell } from '@/utils/masechtotChartData'
import type { ChartMode } from '@/utils/masechtotRows'
import type { MasechtotSort } from '@/utils/masechtotSort'
import TextName from '@/components/common/TextName.vue'
import TractateName from '@/components/common/TractateName.vue'

const props = withDefaults(defineProps<{ sort: MasechtotSort; mode: ChartMode; query?: string | null }>(), {
  query: null,
})

const { unit } = usePreferences()
const { visibleRows } = useMasechtotRows(
  () => props.sort,
  () => props.query,
)

const columns = computed(() =>
  TEXT_IDS.filter((id) => visibleRows.value.some((row) => row.texts.some((text) => text.id === id))),
)

const tableRows = computed(() =>
  visibleRows.value.map((row) => ({
    id: row.id,
    otherNotMeasured: row.otherNotMeasured,
    cells: columns.value.map((id) => textCell(row, id, props.mode, unit.value)),
    real: formatValue(row.real, unit.value, row.printedSides),
    printed: formatNumber(row.printedSides / 2),
  })),
)
</script>

<style scoped>
.table-scroll {
  overflow-x: auto;
}
</style>
