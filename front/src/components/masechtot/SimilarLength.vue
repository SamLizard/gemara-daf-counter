<template>
  <v-card variant="outlined">
    <v-card-title class="text-title-medium">{{ $t('masechtot.similar.title') }}</v-card-title>
    <v-card-text>
      <p class="text-body-medium text-medium-emphasis mb-4">{{ $t('masechtot.similar.intro') }}</p>
      <v-autocomplete
        v-model="picked"
        :items="items"
        :label="$t('masechtot.similar.pick')"
        :custom-filter="filter"
        variant="outlined"
        density="comfortable"
        clearable
        hide-details
      />
      <template v-if="target">
        <p class="text-body-medium mt-4 mb-2">{{ $t('masechtot.similar.target', { value: target.value }) }}</p>
        <v-alert v-if="!target.known" type="info" variant="tonal" density="compact">
          {{ $t('masechtot.similar.unknown') }}
        </v-alert>
        <v-list v-else-if="similar.length" density="compact" lines="one">
          <v-list-item
            v-for="row in similar"
            :key="row.id"
            :to="{ name: 'masechet', params: { id: row.id } }"
            :append-icon="forwardIcon"
          >
            <v-list-item-title><TractateName :id="row.id" /></v-list-item-title>
            <v-list-item-subtitle>{{ row.value }}</v-list-item-subtitle>
          </v-list-item>
        </v-list>
        <p v-else class="text-body-medium text-medium-emphasis mb-0">{{ $t('masechtot.similar.none') }}</p>
      </template>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePreferences } from '@/composables/usePreferences'
import { useMasechtotRows } from '@/composables/useMasechtotRows'
import { useDirectionIcons } from '@/composables/useDirectionIcons'
import { formatValue } from '@/utils/format'
import { similarRows } from '@/utils/masechtotRows'
import { matchesTractate } from '@/utils/masechtotSearch'
import TractateName from '@/components/common/TractateName.vue'

const { t } = useI18n()
const { unit } = usePreferences()
const { forwardIcon } = useDirectionIcons()
const { rows } = useMasechtotRows('shas', null)
const picked = ref<string | null>(null)

const items = computed(() => rows.value.map((row) => ({ value: row.id, title: t(`tractate.${row.id}`) })))

const target = computed(() => {
  const row = rows.value.find((entry) => entry.id === picked.value)
  return row ? { known: row.real !== null, value: formatValue(row.real, unit.value, row.printedSides) } : null
})

const similar = computed(() =>
  picked.value
    ? similarRows(rows.value, picked.value).map((row) => ({
        id: row.id,
        value: formatValue(row.real, unit.value, row.printedSides),
      }))
    : [],
)

// Matches the current-locale, English and Hebrew names, whatever the displayed title.
function filter(_value: string, query: string, item?: { raw?: unknown }): boolean {
  const id = (item?.raw as { value?: string } | undefined)?.value
  return id ? matchesTractate(id, query) : false
}
</script>
