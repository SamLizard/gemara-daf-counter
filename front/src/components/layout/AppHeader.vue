<template>
  <v-app-bar flat border="b" density="comfortable">
    <v-app-bar-nav-icon v-if="mobile" :aria-label="$t('menu.openMenu')" @click="emit('open-menu')" />
    <v-app-bar-title>
      <router-link to="/" class="text-decoration-none text-primary font-weight-bold">
        {{ $t('app.title') }}
      </router-link>
    </v-app-bar-title>
    <template v-if="!mobile">
      <v-btn v-for="item in navItems" :key="item.to" :to="item.to" variant="text" :exact="item.to === '/'">
        {{ $t(item.labelKey) }}
      </v-btn>
    </template>
    <template #append>
      <LanguageSelection />
      <v-btn icon="mdi-tune-variant" :aria-label="$t('menu.preferences')" @click="emit('open-preferences')" />
    </template>
  </v-app-bar>
</template>

<script setup lang="ts">
import { useDisplay } from 'vuetify'
import LanguageSelection from '@/components/common/LanguageSelection.vue'
import { navItems } from './navItems'

const emit = defineEmits<{ 'open-preferences': []; 'open-menu': [] }>()
const { smAndDown: mobile } = useDisplay()
</script>
