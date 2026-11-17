<template>
  <section v-if="facts.length" :aria-label="$t('home.facts.title')">
    <h2 class="text-title-large mb-3">{{ $t('home.facts.title') }}</h2>
    <v-row>
      <v-col v-for="fact in facts" :key="fact.key" cols="12" sm="6" md="4">
        <FactCard :fact="fact" />
      </v-col>
    </v-row>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useMetrics } from '@/composables/useMetrics'
import { didYouKnow } from '@/utils/didYouKnow'
import FactCard from './FactCard.vue'

const { tractates } = useMetrics()
const facts = computed(() => didYouKnow(tractates.value))
</script>
