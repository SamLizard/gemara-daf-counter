<template>
  <v-card v-if="textId" variant="outlined">
    <v-card-title class="text-title-medium">{{ $t('masechet.heatmap.title') }}</v-card-title>
    <v-card-text>
      <v-chip-group v-model="chosen" mandatory column :aria-label="$t('masechet.heatmap.pickText')">
        <v-chip v-for="id in measured" :key="id" :value="id" filter variant="outlined">
          <TextName :id="id" dot />
        </v-chip>
      </v-chip-group>
      <PageHeatmap :tractate-id="tractateId" :text-id="textId" :selected="selected" @select="emit('select', $event)" />
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { TextId } from '@/types/metrics'
import { useMetrics } from '@/composables/useMetrics'
import { measuredTextIds } from '@/utils/masechet'
import PageHeatmap from '@/components/charts/PageHeatmap.vue'
import TextName from '@/components/common/TextName.vue'

const props = defineProps<{ tractateId: string; selected: string | null }>()
const emit = defineEmits<{ select: [amud: string] }>()

const { tractate } = useMetrics()
const chosen = ref<TextId | null>(null)

const measured = computed(() => {
  const current = tractate(props.tractateId)
  return current ? measuredTextIds(current) : []
})
// Falls back to the first measured text when the choice does not exist in this masechet.
const textId = computed<TextId | null>(() =>
  chosen.value && measured.value.includes(chosen.value) ? chosen.value : (measured.value[0] ?? null),
)
</script>
