<template>
  <v-navigation-drawer v-model="open" location="end" :temporary="temporary" width="320">
    <div class="d-flex align-center pa-4">
      <div class="text-title-large flex-grow-1">{{ $t('prefs.title') }}</div>
      <v-btn icon="mdi-close" variant="text" size="small" :aria-label="$t('prefs.close')" @click="open = false" />
    </div>
    <v-divider />
    <div class="pa-4 d-flex flex-column ga-5">
      <section>
        <div class="text-label-large mb-2">{{ $t('prefs.theme') }}</div>
        <v-btn-toggle v-model="theme" mandatory divided variant="outlined" density="comfortable">
          <v-btn value="parchment" prepend-icon="mdi-weather-sunny">{{ $t('prefs.themeParchment') }}</v-btn>
          <v-btn value="night" prepend-icon="mdi-weather-night">{{ $t('prefs.themeNight') }}</v-btn>
        </v-btn-toggle>
      </section>
      <section>
        <div class="text-label-large mb-2">{{ $t('prefs.unit') }}</div>
        <v-radio-group v-model="unit" hide-details density="compact">
          <v-radio v-for="option in units" :key="option" :value="option" :label="$t(`unit.${option}`)" />
        </v-radio-group>
      </section>
      <section>
        <div class="text-label-large mb-2">{{ $t('prefs.texts') }}</div>
        <TextSelector v-model="enabledTexts" />
      </section>
      <section>
        <v-select
          v-model="viewer"
          :items="viewers"
          :item-title="(id: Viewer) => $t(`viewer.${id}`)"
          :item-value="(id: Viewer) => id"
          :label="$t('prefs.viewer')"
          variant="outlined"
          density="comfortable"
          hide-details
        />
      </section>
    </div>
  </v-navigation-drawer>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useDisplay } from 'vuetify'
import type { Unit, Viewer } from '@/types/metrics'
import { usePreferences } from '@/composables/usePreferences'
import TextSelector from '@/components/common/TextSelector.vue'

const open = defineModel<boolean>({ required: true })

const { theme, unit, enabledTexts, viewer } = usePreferences()
const { mdAndUp } = useDisplay()
const temporary = computed(() => !mdAndUp.value)

const units: Unit[] = ['dafim', 'amudim', 'percent']
const viewers: Viewer[] = ['sefaria', 'hebrewbooks', 'shas-org']
</script>
