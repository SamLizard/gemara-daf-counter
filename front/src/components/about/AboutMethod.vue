<template>
  <section aria-labelledby="about-method-title">
    <h2 id="about-method-title" class="text-title-large mb-3">{{ $t('about.method.title') }}</h2>
    <v-list class="bg-transparent pa-0">
      <v-list-item v-for="(step, index) in steps" :key="step" class="px-0 align-start">
        <template #prepend>
          <v-avatar size="28" color="primary" variant="tonal" class="me-3 text-label-large">{{ index + 1 }}</v-avatar>
        </template>
        <p class="text-body-large mb-0">{{ $t(step) }}</p>
      </v-list-item>
    </v-list>

    <h3 class="text-title-medium mt-6 mb-2">{{ $t('about.method.notCalculatedTitle') }}</h3>
    <ul class="ps-6 text-body-medium">
      <li>{{ $t('about.method.notCalculatedRashbam') }}</li>
      <li>{{ $t('about.method.notCalculatedNedarim') }}</li>
      <li>{{ $t('about.method.notCalculatedSmall') }}</li>
    </ul>

    <h3 class="text-title-medium mt-6 mb-2">{{ $t('about.caveats.title') }}</h3>
    <ul class="ps-6 text-body-medium">
      <li v-for="caveat in caveats" :key="caveat">{{ $t(caveat) }}</li>
    </ul>
  </section>
</template>

<script setup lang="ts">
const steps = [
  'about.method.stepPdf',
  'about.method.stepMatch',
  'about.method.stepArea',
  'about.method.stepTotal',
] as const

const caveats = ['about.caveats.estimate', 'about.caveats.frames', 'about.caveats.unknown'] as const
</script>
