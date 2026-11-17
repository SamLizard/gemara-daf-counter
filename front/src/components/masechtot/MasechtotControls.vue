<template>
  <div class="d-flex flex-wrap align-center ga-4">
    <v-text-field
      v-model="query"
      class="control-field"
      :label="$t('masechtot.search.label')"
      prepend-inner-icon="mdi-magnify"
      variant="outlined"
      density="comfortable"
      clearable
      hide-details
    />
    <v-select
      v-model="sort"
      class="control-field"
      :items="sortItems"
      :label="$t('masechtot.sort.label')"
      variant="outlined"
      density="comfortable"
      hide-details
    />
    <v-btn-toggle
      v-model="mode"
      mandatory
      divided
      variant="outlined"
      density="comfortable"
      :aria-label="$t('masechtot.mode.label')"
    >
      <v-btn value="absolute">{{ $t('masechtot.mode.absolute') }}</v-btn>
      <v-btn value="percent">{{ $t('masechtot.mode.percent') }}</v-btn>
    </v-btn-toggle>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ChartMode } from '@/utils/masechtotRows'
import { MASECHTOT_SORTS, type MasechtotSort } from '@/utils/masechtotSort'

const query = defineModel<string | null>('query', { default: null })
const sort = defineModel<MasechtotSort>('sort', { required: true })
const mode = defineModel<ChartMode>('mode', { required: true })

const { t } = useI18n()
const sortItems = computed(() => MASECHTOT_SORTS.map((item) => ({ value: item.value, title: t(item.labelKey) })))
</script>

<style scoped>
.control-field {
  flex: 1 1 220px;
  min-width: 200px;
}
</style>
