<template>
  <v-card variant="outlined" class="pa-4 h-100 d-flex flex-column" :to="fact.to">
    <v-icon icon="mdi-lightbulb-on-outline" color="secondary" class="mb-2" aria-hidden="true" />
    <i18n-t :keypath="fact.key" tag="p" scope="global" class="text-body-large flex-grow-1">
      <template v-for="(id, name) in fact.tractates" :key="name" #[name]>
        <TractateName :id="id" hide-hebrew class="font-weight-medium" />
      </template>
      <template v-for="(value, name) in fact.values" :key="name" #[name]>
        <bdi class="font-weight-medium">{{ value }}</bdi>
      </template>
    </i18n-t>
    <div class="text-label-large text-primary mt-3">
      {{ $t('home.facts.open') }}
      <v-icon :icon="forwardIcon" size="small" aria-hidden="true" />
    </div>
  </v-card>
</template>

<script setup lang="ts">
import type { Fact } from '@/utils/didYouKnow'
import { useDirectionIcons } from '@/composables/useDirectionIcons'
import TractateName from '@/components/common/TractateName.vue'

defineProps<{ fact: Fact }>()
const { forwardIcon } = useDirectionIcons()
</script>
