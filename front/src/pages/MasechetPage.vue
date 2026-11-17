<template>
  <v-alert v-if="!current" type="warning" variant="tonal">
    {{ $t('app.notFound') }}
    <template #append>
      <v-btn :to="{ name: 'home' }" variant="text">{{ $t('menu.home') }}</v-btn>
    </template>
  </v-alert>
  <div v-else class="d-flex flex-column ga-6">
    <MasechetHeader :tractate-id="id" @select="select" />
    <v-card variant="outlined">
      <v-card-title class="text-title-medium">{{ $t('masechet.strip.title') }}</v-card-title>
      <v-card-text>
        <PageStrip :tractate-id="id" :selected="amud" @select="select" />
      </v-card-text>
    </v-card>
    <v-row>
      <v-col cols="12" md="5">
        <AmudDetail v-if="amud" :tractate-id="id" :amud="amud" @select="select" />
      </v-col>
      <v-col cols="12" md="7">
        <HeatmapCard :tractate-id="id" :selected="amud" @select="select" />
      </v-col>
    </v-row>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useMetrics } from '@/composables/useMetrics'
import { useSelectedAmud } from '@/composables/useSelectedAmud'
import MasechetHeader from '@/components/masechet/MasechetHeader.vue'
import AmudDetail from '@/components/masechet/AmudDetail.vue'
import HeatmapCard from '@/components/masechet/HeatmapCard.vue'
import PageStrip from '@/components/charts/PageStrip.vue'

const props = defineProps<{ id: string }>()

const { tractate } = useMetrics()
const current = computed(() => tractate(props.id))
const { amud, select } = useSelectedAmud(() => props.id)
</script>
