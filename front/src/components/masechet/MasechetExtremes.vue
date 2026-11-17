<template>
  <v-card variant="outlined" class="h-100">
    <v-card-title class="text-title-medium">{{ $t('masechet.extremes.title') }}</v-card-title>
    <v-list density="compact" bg-color="transparent">
      <v-list-item v-for="entry in entries" :key="entry.id">
        <v-list-item-title class="mb-1">
          <TextName :id="entry.id" dot />
        </v-list-item-title>
        <div class="d-flex flex-wrap ga-2">
          <v-chip
            size="small"
            variant="tonal"
            prepend-icon="mdi-arrow-up-bold"
            :aria-label="$t('masechet.extremes.densestAria', { amud: entry.max.amud, value: formatFraction(entry.max.value) })"
            @click="emit('select', entry.max.amud)"
          >
            {{ $t('masechet.extremes.densest', { amud: entry.max.amud, value: formatFraction(entry.max.value) }) }}
          </v-chip>
          <v-chip
            size="small"
            variant="tonal"
            prepend-icon="mdi-arrow-down-bold"
            :aria-label="$t('masechet.extremes.lightestAria', { amud: entry.min.amud, value: formatFraction(entry.min.value) })"
            @click="emit('select', entry.min.amud)"
          >
            {{ $t('masechet.extremes.lightest', { amud: entry.min.amud, value: formatFraction(entry.min.value) }) }}
          </v-chip>
        </div>
      </v-list-item>
    </v-list>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { TextId } from '@/types/metrics'
import { useMetrics } from '@/composables/useMetrics'
import { extremes, type Extreme } from '@/utils/metrics'
import { measuredTextIds } from '@/utils/masechet'
import { formatFraction } from '@/utils/format'
import TextName from '@/components/common/TextName.vue'

const props = defineProps<{ tractateId: string }>()
const emit = defineEmits<{ select: [amud: string] }>()

const { tractate } = useMetrics()

const entries = computed(() => {
  const current = tractate(props.tractateId)
  if (!current) return []
  return measuredTextIds(current).flatMap((id): { id: TextId; max: Extreme; min: Extreme }[] => {
    const range = extremes(current, id)
    return range ? [{ id, ...range }] : []
  })
})
</script>
