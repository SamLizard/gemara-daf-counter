<template>
  <section id="unit" aria-labelledby="about-unit-title">
    <h2 id="about-unit-title" class="text-title-large mb-3">{{ $t('about.unit.title') }}</h2>
    <p class="text-body-large">{{ $t('about.unit.definition') }}</p>
    <v-card v-if="example" variant="outlined" class="pa-4 my-3">
      <v-row>
        <v-col cols="12" sm="6">
          <div class="text-label-large text-medium-emphasis">
            <i18n-t keypath="about.unit.examplePrinted" tag="span" scope="global">
              <template #tractate><TractateName :id="example.id" /></template>
            </i18n-t>
          </div>
          <div class="text-headline-medium">{{ example.printed }}</div>
        </v-col>
        <v-col cols="12" sm="6">
          <div class="text-label-large text-medium-emphasis">
            <TextName :id="'main'" dot />
          </div>
          <div class="text-headline-medium">{{ example.main }}</div>
        </v-col>
      </v-row>
      <i18n-t keypath="about.unit.example" tag="p" scope="global" class="text-body-medium mt-2 mb-0">
        <template #tractate><TractateName :id="example.id" hide-hebrew /></template>
        <template #printed><bdi>{{ example.printed }}</bdi></template>
        <template #main><bdi>{{ example.main }}</bdi></template>
        <template #share><bdi>{{ example.share }}</bdi></template>
      </i18n-t>
    </v-card>
    <p class="text-body-medium">{{ $t('about.unit.units') }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useMetrics } from '@/composables/useMetrics'
import { formatNumber, formatPercent } from '@/utils/format'
import { printedDafim, shareOfBody, textEntry } from '@/utils/metrics'
import TractateName from '@/components/common/TractateName.vue'
import TextName from '@/components/common/TextName.vue'

// The example of the spec (§2): the masechet read first, with the densest Gemara.
const EXAMPLE_ID = 'berachos'

const { tractate } = useMetrics()

const example = computed(() => {
  const value = tractate(EXAMPLE_ID)
  const main = value ? (textEntry(value, 'main')?.total ?? null) : null
  if (!value || main === null) return null
  const share = shareOfBody(main, value.printedSides)
  return {
    id: value.id,
    printed: formatNumber(printedDafim(value)),
    main: formatNumber(main),
    share: share === null ? '' : formatPercent(share),
  }
})
</script>
