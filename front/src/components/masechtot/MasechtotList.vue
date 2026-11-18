<template>
  <div class="d-flex flex-column ga-4">
    <v-card v-for="group in groups" :key="group.order ?? 'all'" variant="outlined">
      <v-card-title v-if="group.order" class="text-title-medium">
        {{ $t(`order.${group.order}`) }}
      </v-card-title>
      <v-list density="compact" bg-color="transparent" class="py-0">
        <template v-for="(row, index) in group.rows" :key="row.id">
          <v-divider v-if="index > 0" />
          <MasechetRowItem :tractate-id="row.id" :mode="mode" :max="max" />
        </template>
      </v-list>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { usePreferences } from '@/composables/usePreferences'
import { useMasechtotRows } from '@/composables/useMasechtotRows'
import { groupRows, scaleMax } from '@/utils/masechtotList'
import type { ChartMode } from '@/utils/masechtotRows'
import type { MasechtotSort } from '@/utils/masechtotSort'
import MasechetRowItem from './MasechetRowItem.vue'

const props = withDefaults(defineProps<{ sort: MasechtotSort; mode: ChartMode; query?: string | null }>(), {
  query: null,
})

const { unit } = usePreferences()
const { rows, visibleRows } = useMasechtotRows(
  () => props.sort,
  () => props.query,
)

const groups = computed(() => groupRows(visibleRows.value, props.sort))
// Scale on all masechtot, so filtering does not stretch the bars.
const max = computed(() => scaleMax(rows.value, props.mode, unit.value))
</script>
