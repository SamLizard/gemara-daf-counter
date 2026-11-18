<template>
  <div class="d-flex flex-column ga-6">
    <header>
      <h1 class="text-headline-medium mb-2">{{ $t('masechtot.title') }}</h1>
      <p class="text-body-large text-medium-emphasis mb-0">{{ $t('masechtot.intro') }}</p>
    </header>
    <v-card variant="outlined">
      <v-card-text class="d-flex flex-column ga-4">
        <MasechtotControls v-model:query="query" v-model:sort="sort" v-model:mode="mode" />
        <TextSelector v-model="enabledTexts" />
        <p class="text-body-small text-medium-emphasis mb-0">
          {{ $t(mode === 'percent' ? 'masechtot.list.hintPercent' : 'masechtot.list.hint') }}
        </p>
      </v-card-text>
    </v-card>
    <v-alert v-if="!visibleRows.length" type="info" variant="tonal">{{ $t('masechtot.search.none') }}</v-alert>
    <MasechtotList v-else :sort="sort" :mode="mode" :query="query" />
    <SimilarLength />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useMasechtotRows } from '@/composables/useMasechtotRows'
import { usePreferences } from '@/composables/usePreferences'
import type { ChartMode } from '@/utils/masechtotRows'
import type { MasechtotSort } from '@/utils/masechtotSort'
import MasechtotControls from '@/components/masechtot/MasechtotControls.vue'
import MasechtotList from '@/components/masechtot/MasechtotList.vue'
import SimilarLength from '@/components/masechtot/SimilarLength.vue'
import TextSelector from '@/components/common/TextSelector.vue'

const query = ref<string | null>(null)
const sort = ref<MasechtotSort>('shas')
const mode = ref<ChartMode>('absolute')
const { enabledTexts } = usePreferences()
const { visibleRows } = useMasechtotRows(sort, query)
</script>
