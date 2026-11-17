<template>
  <component :is="tag">
    <template v-if="isRtl">
      <span lang="he" dir="rtl">{{ hebrew }}</span>
    </template>
    <template v-else>
      <bdi>{{ $t(`tractate.${id}`) }}</bdi>
      <template v-if="!hideHebrew">
        <span class="text-medium-emphasis"> · </span>
        <span lang="he" dir="rtl">{{ hebrew }}</span>
      </template>
    </template>
  </component>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRtl } from 'vuetify'
import { tractateHebrewName } from '@/utils/names'

const props = withDefaults(defineProps<{ id: string; tag?: string; hideHebrew?: boolean }>(), {
  tag: 'span',
  hideHebrew: false,
})

const { isRtl } = useRtl()
const hebrew = computed(() => tractateHebrewName(props.id))
</script>
