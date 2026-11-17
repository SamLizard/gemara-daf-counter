<template>
  <div class="about d-flex flex-column ga-8">
    <header>
      <h1 class="text-headline-medium mb-2">{{ $t('about.title') }}</h1>
      <p class="text-body-large text-medium-emphasis mb-0">{{ $t('about.intro') }}</p>
    </header>
    <AboutUnit />
    <AboutMethod />
    <AboutSources />
  </div>
</template>

<script setup lang="ts">
import AboutUnit from '@/components/about/AboutUnit.vue'
import AboutMethod from '@/components/about/AboutMethod.vue'
import AboutSources from '@/components/about/AboutSources.vue'
</script>

<style scoped>
.about {
  max-width: 820px;
}
</style>
