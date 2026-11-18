<template>
  <div class="d-flex flex-wrap ga-2" role="group" :aria-label="$t('prefs.texts')">
    <v-chip
      v-for="id in shown"
      :key="id"
      :color="`text-${id}`"
      :variant="model.includes(id) ? 'flat' : 'outlined'"
      :prepend-icon="model.includes(id) ? 'mdi-check' : undefined"
      :aria-pressed="model.includes(id)"
      @click="toggle(id)"
    >
      <TextName :id="id" />
    </v-chip>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { TEXT_IDS, type TextId } from '@/types/metrics'
import TextName from './TextName.vue'

// Chips are toggled one by one instead of through v-chip-group, which would drop from the model
// the texts that are not offered here (e.g. Tosafot hidden on Shekalim).
const props = defineProps<{ available?: readonly TextId[] }>()
const model = defineModel<TextId[]>({ required: true })

const shown = computed(() => TEXT_IDS.filter((id) => !props.available || props.available.includes(id)))

function toggle(id: TextId) {
  model.value = model.value.includes(id) ? model.value.filter((value) => value !== id) : [...model.value, id]
}
</script>
