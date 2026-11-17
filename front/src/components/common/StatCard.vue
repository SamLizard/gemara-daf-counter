<template>
  <v-card variant="outlined" class="pa-4 h-100">
    <div class="text-label-large text-medium-emphasis">
      <TextName v-if="textId" :id="textId" dot />
      <template v-else>{{ $t(labelKey ?? '') }}</template>
    </div>
    <div class="text-headline-medium mt-1">
      <template v-if="value === null">
        <span class="text-body-large">{{ $t('value.notCalculated') }}</span>
      </template>
      <template v-else>{{ display }}</template>
    </div>
    <div v-if="hint" class="text-body-small text-medium-emphasis mt-1">{{ hint }}</div>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { TextId, Unit } from '@/types/metrics'
import { formatValue } from '@/utils/format'
import TextName from './TextName.vue'

const props = withDefaults(
  defineProps<{
    /** Label message key, used when `textId` is not given. */
    labelKey?: string
    textId?: TextId
    /** Full dafim, null = not calculated. */
    value: number | null
    unit?: Unit
    printedSides?: number
    hint?: string
  }>(),
  { unit: 'dafim' },
)

const display = computed(() => formatValue(props.value, props.unit, props.printedSides))
</script>
