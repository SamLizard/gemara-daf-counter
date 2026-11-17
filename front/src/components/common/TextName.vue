<template>
  <span>
    <span v-if="dot" class="text-dot me-2" :style="{ backgroundColor: color }" aria-hidden="true" />
    <template v-if="isRtl">
      <span lang="he" dir="rtl">{{ hebrew }}</span>
    </template>
    <template v-else>
      <bdi>{{ $t(`text.${id}`) }}</bdi>
      <template v-if="withHebrew">
        <span class="text-medium-emphasis"> · </span>
        <span lang="he" dir="rtl">{{ hebrew }}</span>
      </template>
    </template>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRtl } from 'vuetify'
import type { TextId } from '@/types/metrics'
import { textHebrewName } from '@/utils/names'
import { useTextColor } from '@/composables/useTextColor'

const props = withDefaults(defineProps<{ id: TextId; dot?: boolean; withHebrew?: boolean }>(), {
  dot: false,
  withHebrew: false,
})

const { isRtl } = useRtl()
const textColor = useTextColor()
const hebrew = computed(() => textHebrewName(props.id))
const color = computed(() => textColor(props.id))
</script>

<style scoped>
.text-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  vertical-align: middle;
}
</style>
