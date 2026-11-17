<template>
  <section v-if="current" class="d-flex flex-column ga-4">
    <div>
      <TractateName :id="tractateId" tag="h1" class="text-display-small" />
      <div class="d-flex flex-wrap ga-2 mt-2">
        <v-chip size="small" variant="tonal" prepend-icon="mdi-bookshelf">{{ $t(`order.${current.order}`) }}</v-chip>
        <v-chip size="small" variant="tonal" prepend-icon="mdi-book-open-page-variant">
          {{ $t('unit.printedDafimValue', { value: formatNumber(printedDafim(current)) }) }}
        </v-chip>
        <v-chip size="small" variant="tonal">
          {{ $t('masechet.amudRange', { first: current.firstAmud, last: current.lastAmud }) }}
        </v-chip>
        <v-chip size="small" variant="tonal" color="primary">{{ rankLabel }}</v-chip>
      </div>
    </div>
    <TextStatCards :tractate-id="tractateId" />
    <v-row>
      <v-col cols="12" md="5">
        <TextList :tractate-id="tractateId" />
      </v-col>
      <v-col cols="12" md="7">
        <MasechetExtremes :tractate-id="tractateId" @select="emit('select', $event)" />
      </v-col>
    </v-row>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMetrics } from '@/composables/useMetrics'
import { usePreferences } from '@/composables/usePreferences'
import { printedDafim } from '@/utils/metrics'
import { formatNumber } from '@/utils/format'
import { lengthRank } from '@/utils/rank'
import TractateName from '@/components/common/TractateName.vue'
import TextStatCards from './TextStatCards.vue'
import TextList from './TextList.vue'
import MasechetExtremes from './MasechetExtremes.vue'

const props = defineProps<{ tractateId: string }>()
const emit = defineEmits<{ select: [amud: string] }>()

const { t } = useI18n()
const { tractate, tractates } = useMetrics()
const { enabledTexts } = usePreferences()

const current = computed(() => tractate(props.tractateId))
const rankLabel = computed(() => {
  const rank = lengthRank(tractates.value, props.tractateId, enabledTexts.value)
  return rank ? t('masechet.rank', { rank: rank.rank, count: rank.count }) : t('masechet.rankUnknown')
})
</script>
