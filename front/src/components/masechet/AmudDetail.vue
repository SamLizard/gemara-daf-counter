<template>
  <v-card v-if="current && rowIndex >= 0" variant="outlined">
    <div class="d-flex align-center ga-2 pa-2">
      <v-btn
        icon="$prev"
        variant="text"
        :disabled="!previous"
        :aria-label="$t('masechet.amud.previous')"
        @click="previous && emit('select', previous)"
      />
      <div class="flex-grow-1 text-center">
        <div class="text-label-large text-medium-emphasis">{{ $t('masechet.amud.title') }}</div>
        <div class="text-headline-small">
          <TractateName :id="tractateId" hide-hebrew /> <bdi>{{ amud }}</bdi>
        </div>
      </div>
      <v-btn
        icon="$next"
        variant="text"
        :disabled="!next"
        :aria-label="$t('masechet.amud.next')"
        @click="next && emit('select', next)"
      />
    </div>
    <v-card-text>
      <StackedBar
        :segments="segments"
        :ariaLabel="$t('masechet.amud.barLabel', { amud })"
        :height="32"
        :legend="false"
      />
      <v-list density="compact" bg-color="transparent" class="mt-2">
        <v-list-item v-for="text in current.texts" :key="text.id">
          <v-list-item-title><TextName :id="text.id" dot /></v-list-item-title>
          <template #append>
            <span class="text-body-medium">{{ formatFraction(amudValue(current, rowIndex, text.id)) }}</span>
          </template>
        </v-list-item>
        <v-list-item>
          <v-list-item-title class="text-medium-emphasis">{{ $t('value.rest') }}</v-list-item-title>
          <template #append>
            <span class="text-body-medium text-medium-emphasis">{{ formatPercent(rest) }}</span>
          </template>
        </v-list-item>
        <v-list-item v-if="current.otherCommentaries === 'not-measured'">
          <v-list-item-title class="text-medium-emphasis">
            {{ $t('value.otherCommentariesNotCalculated') }}
          </v-list-item-title>
        </v-list-item>
      </v-list>
      <v-divider class="my-3" />
      <MasechetProgress :tractate-id="tractateId" :last-amud="amud" :show-printed="false" />
    </v-card-text>
    <v-card-actions>
      <v-btn :href="link" target="_blank" rel="noopener" append-icon="mdi-open-in-new" variant="tonal" color="primary">
        {{ $t('masechet.amud.open', { viewer: $t(`viewer.${viewer}`) }) }}
      </v-btn>
    </v-card-actions>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useMetrics } from '@/composables/useMetrics'
import { usePreferences } from '@/composables/usePreferences'
import { pageIndex } from '@/utils/metrics'
import { amudRest, amudSegments, amudValue, neighbourAmud } from '@/utils/masechet'
import { formatFraction, formatPercent } from '@/utils/format'
import { pageUrl } from '@/utils/links'
import StackedBar from '@/components/charts/StackedBar.vue'
import TextName from '@/components/common/TextName.vue'
import TractateName from '@/components/common/TractateName.vue'
import MasechetProgress from '@/components/common/MasechetProgress.vue'

const props = defineProps<{ tractateId: string; amud: string }>()
const emit = defineEmits<{ select: [amud: string] }>()

const { tractate } = useMetrics()
const { viewer } = usePreferences()

const current = computed(() => tractate(props.tractateId))
const rowIndex = computed(() => (current.value ? pageIndex(current.value, props.amud) : -1))
const ids = computed(() => current.value?.texts.map((text) => text.id) ?? [])
const segments = computed(() => (current.value ? amudSegments(current.value, rowIndex.value, ids.value) : []))
const rest = computed(() => {
  const tractateValue = current.value
  return tractateValue ? amudRest(ids.value.map((id) => amudValue(tractateValue, rowIndex.value, id))) : 0
})
const previous = computed(() => (current.value ? neighbourAmud(current.value, props.amud, -1) : null))
const next = computed(() => (current.value ? neighbourAmud(current.value, props.amud, 1) : null))
const link = computed(() => pageUrl(viewer.value, props.tractateId, props.amud))
</script>
