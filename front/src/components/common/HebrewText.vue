<template>
  <component :is="tag">
    <template v-for="(part, index) in parts" :key="index">
      <span v-if="part.hebrew" lang="he" dir="rtl">{{ part.text }}</span>
      <template v-else>{{ part.text }}</template>
    </template>
  </component>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { splitHebrew } from '@/utils/names'

const props = withDefaults(defineProps<{ text: string; tag?: string }>(), { tag: 'span' })

const parts = computed(() => splitHebrew(props.text))
</script>
