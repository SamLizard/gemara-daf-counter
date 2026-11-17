<template>
  <v-navigation-drawer v-model="open" temporary>
    <v-list nav>
      <v-list-item
        v-for="item in navItems"
        :key="item.to"
        :to="item.to"
        :exact="item.to === '/'"
        :prepend-icon="item.icon"
        :title="$t(item.labelKey)"
        @click="open = false"
      />
    </v-list>
  </v-navigation-drawer>
</template>

<script setup lang="ts">
import { navItems } from './navItems'

const open = defineModel<boolean>({ required: true })
</script>
