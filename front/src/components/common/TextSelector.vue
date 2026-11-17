<template>
  <v-chip-group v-model="model" multiple column :aria-label="$t('prefs.texts')">
    <v-chip
      v-for="id in selectable"
      :key="id"
      :value="id"
      filter
      variant="outlined"
      :color="`text-${id}`"
    >
      <TextName :id="id" />
    </v-chip>
  </v-chip-group>
</template>

<script setup lang="ts">
import type { TextId } from '@/types/metrics'
import TextName from './TextName.vue'

const model = defineModel<TextId[]>({ required: true })

// "rashi" also covers the combined Rashi / Rashbam text of Pesachim and Bava Basra.
const selectable: TextId[] = ['main', 'rashi', 'ran', 'tosafot']
</script>
