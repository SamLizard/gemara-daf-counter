<template>
  <v-app>
    <AppHeader @open-preferences="preferencesOpen = !preferencesOpen" @open-menu="menuOpen = true" />
    <NavDrawer v-model="menuOpen" />
    <PreferencesDrawer v-model="preferencesOpen" />
    <v-main>
      <v-container class="page-container py-6">
        <v-alert v-if="error" type="error" variant="tonal">{{ $t('app.loadError', { error }) }}</v-alert>
        <div v-else-if="!data" class="d-flex justify-center align-center ga-3 py-16">
          <v-progress-circular indeterminate color="primary" />
          <span>{{ $t('app.loading') }}</span>
        </div>
        <router-view v-else />
      </v-container>
    </v-main>
  </v-app>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useTheme } from 'vuetify'
import { usePreferences } from '@/composables/usePreferences'
import { useMetrics } from '@/composables/useMetrics'
import AppHeader from '@/components/layout/AppHeader.vue'
import NavDrawer from '@/components/layout/NavDrawer.vue'
import PreferencesDrawer from '@/components/layout/PreferencesDrawer.vue'

const preferencesOpen = ref(false)
const menuOpen = ref(false)
const { theme } = usePreferences()
const { data, error } = useMetrics()
const vuetifyTheme = useTheme()

watch(theme, (name) => vuetifyTheme.change(name), { immediate: true })
</script>

<style scoped>
.page-container {
  max-width: 1100px;
}
</style>
