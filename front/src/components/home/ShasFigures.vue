<template>
  <section :aria-label="$t('home.shas.title')">
    <h2 class="text-title-large mb-3">{{ $t('home.shas.title') }}</h2>
    <v-row>
      <v-col v-for="row in texts" :key="row.id" cols="12" sm="6" md="3">
        <StatCard
          :text-id="row.id"
          :value="row.total"
          :unit="unit"
          :printed-sides="shasTotals.printedSides"
          :hint="missingNote(row.missing)"
        />
      </v-col>
      <v-col cols="12" sm="6" md="3">
        <v-card variant="outlined" class="pa-4 h-100">
          <div class="text-label-large text-medium-emphasis">{{ $t('home.shas.printed') }}</div>
          <div class="text-headline-medium mt-1">{{ formatNumber(shasTotals.printedSides / 2) }}</div>
          <div class="text-body-small text-medium-emphasis mt-1">
            {{ $t('home.shas.tractates', { count: shasTotals.tractateCount }) }}
          </div>
        </v-card>
      </v-col>
    </v-row>
    <v-card variant="outlined" class="pa-4 mt-4">
      <div class="text-title-small mb-3">{{ $t('home.shas.barTitle') }}</div>
      <StackedBar v-if="segments.length > 1" :segments="segments" :height="36" :ariaLabel="$t('chart.shasBar')" />
      <p class="text-body-small text-medium-emphasis mt-3 mb-0">{{ $t('home.shas.barNote') }}</p>
    </v-card>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useMetrics } from '@/composables/useMetrics'
import { usePreferences } from '@/composables/usePreferences'
import { formatNumber } from '@/utils/format'
import { missingNote, shasRows, shasSegments } from '@/utils/shasSummary'
import StatCard from '@/components/common/StatCard.vue'
import StackedBar from '@/components/charts/StackedBar.vue'

const { shasTotals } = useMetrics()
const { unit } = usePreferences()

const texts = computed(() => shasRows(shasTotals.value))
const segments = computed(() => shasSegments(shasTotals.value))
</script>
