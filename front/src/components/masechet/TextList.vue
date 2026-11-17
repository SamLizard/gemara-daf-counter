<template>
  <v-card v-if="current" variant="outlined" class="h-100">
    <v-card-title class="text-title-medium">{{ $t('masechet.texts') }}</v-card-title>
    <v-list density="compact" bg-color="transparent">
      <v-list-item v-for="text in current.texts" :key="text.id">
        <v-list-item-title>
          <TextName :id="text.id" dot with-hebrew />
        </v-list-item-title>
        <template #append>
          <span :class="['text-body-medium', { 'text-medium-emphasis': text.state !== 'measured' }]">
            {{ text.state === 'measured' ? formatValue(text.total, unit, current.printedSides) : $t('value.notCalculated') }}
          </span>
        </template>
      </v-list-item>
      <v-list-item v-if="current.otherCommentaries === 'not-measured'">
        <v-list-item-title class="text-medium-emphasis">
          {{ $t('value.otherCommentariesNotCalculated') }}
        </v-list-item-title>
      </v-list-item>
    </v-list>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useMetrics } from '@/composables/useMetrics'
import { usePreferences } from '@/composables/usePreferences'
import { formatValue } from '@/utils/format'
import TextName from '@/components/common/TextName.vue'

const props = defineProps<{ tractateId: string }>()

const { tractate } = useMetrics()
const { unit } = usePreferences()

const current = computed(() => tractate(props.tractateId))
</script>
