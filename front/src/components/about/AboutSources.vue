<template>
  <section aria-labelledby="about-sources-title">
    <h2 id="about-sources-title" class="text-title-large mb-3">{{ $t('about.sources.title') }}</h2>
    <v-alert v-if="data?.warning" type="warning" variant="tonal" class="mb-4" :title="$t('about.sources.warningTitle')">
      <p lang="en" dir="ltr" class="text-body-medium mb-0">{{ data.warning }}</p>
    </v-alert>

    <v-list class="bg-transparent pa-0">
      <v-list-item
        v-for="link in links"
        :key="link.key"
        :href="link.href"
        target="_blank"
        rel="noopener"
        prepend-icon="mdi-open-in-new"
        class="px-0"
      >
        <v-list-item-title>{{ $t(`about.sources.${link.key}`) }}</v-list-item-title>
        <v-list-item-subtitle>{{ $t(`about.sources.${link.key}Use`) }}</v-list-item-subtitle>
      </v-list-item>
    </v-list>

    <template v-if="data?.attribution">
      <h3 class="text-title-medium mt-6 mb-2">{{ $t('about.sources.attributionTitle') }}</h3>
      <p class="text-body-medium mb-1">
        {{ $t('about.sources.pdfAttribution') }}
        <HebrewText :text="data.attribution.pdf" />
      </p>
      <ul class="ps-6 text-body-small text-medium-emphasis" lang="en" dir="ltr">
        <li v-for="source in data.attribution.sources" :key="source" class="text-break">{{ source }}</li>
      </ul>
    </template>
    <p class="text-body-medium mt-4">{{ $t('about.sources.hebcalCredit') }}</p>
  </section>
</template>

<script setup lang="ts">
import { useMetrics } from '@/composables/useMetrics'
import { sourceLinks } from '@/utils/links'
import HebrewText from '@/components/common/HebrewText.vue'

const { data } = useMetrics()

const links = (Object.keys(sourceLinks) as (keyof typeof sourceLinks)[]).map((key) => ({
  key,
  href: sourceLinks[key],
}))
</script>
