<template>
  <div class="d-flex flex-column ga-8">
    <header>
      <h1 class="text-headline-medium mb-2">{{ $t('home.title') }}</h1>
      <p class="text-body-large text-medium-emphasis mb-0">{{ $t('home.intro') }}</p>
      <v-btn :to="{ name: 'about', hash: '#unit' }" variant="text" class="px-0 mt-1" :append-icon="forwardIcon">
        {{ $t('home.unitLink') }}
      </v-btn>
    </header>
    <DafYomiCard />
    <ShasFigures />
    <DidYouKnow />
  </div>
</template>

<script setup lang="ts">
import DafYomiCard from '@/components/home/DafYomiCard.vue'
import ShasFigures from '@/components/home/ShasFigures.vue'
import DidYouKnow from '@/components/home/DidYouKnow.vue'
import { useDirectionIcons } from '@/composables/useDirectionIcons'

const { forwardIcon } = useDirectionIcons()
</script>
