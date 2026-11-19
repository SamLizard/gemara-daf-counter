<template>
  <v-card variant="outlined" class="pa-4">
    <div class="d-flex align-center flex-wrap ga-2">
      <div class="flex-grow-1">
        <div class="text-label-large text-medium-emphasis">{{ $t('home.dafYomi.title') }}</div>
        <div class="text-body-small text-medium-emphasis">{{ dateLabel }}</div>
      </div>
      <v-btn :icon="backIcon" variant="text" size="small" :aria-label="$t('home.dafYomi.previousDay')" @click="previous" />
      <v-btn v-if="!isToday" variant="tonal" size="small" @click="reset">{{ $t('home.dafYomi.today') }}</v-btn>
      <v-btn :icon="forwardIcon" variant="text" size="small" :aria-label="$t('home.dafYomi.nextDay')" @click="next" />
    </div>

    <template v-if="day && tractate">
      <router-link
        :to="{ name: 'masechet', params: { id: tractate.id }, query: amudim[0] ? { amud: amudim[0] } : {} }"
        class="daf-link text-headline-medium d-inline-block my-2"
      >
        <i18n-t keypath="home.dafYomi.daf" tag="span" scope="global">
          <template #tractate><TractateName :id="tractate.id" /></template>
          <template #daf>{{ day.daf }}</template>
        </i18n-t>
      </router-link>
      <p v-if="tractate.otherCommentaries === 'not-measured'" class="text-body-small text-medium-emphasis mb-2">
        {{ $t('value.otherCommentariesNotCalculated') }}
      </p>
      <v-alert v-if="!hasTexts" type="info" variant="tonal" density="compact" class="mb-2">
        {{ $t('home.dafYomi.noEnabledText') }}
      </v-alert>
      <v-row v-else>
        <v-col v-for="amud in amudim" :key="amud" cols="12" sm="6">
          <DafYomiAmud :tractate-id="tractate.id" :amud="amud" />
        </v-col>
      </v-row>
      <v-divider class="my-3" />
      <MasechetProgress v-if="lastAmud" :tractate-id="tractate.id" :last-amud="lastAmud" />
    </template>
    <p v-else class="text-body-medium my-4">{{ $t('home.dafYomi.unavailable') }}</p>
  </v-card>
</template>

<script setup lang="ts">
import { computed, toRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDafYomi } from '@/composables/useDafYomi'
import { useDirectionIcons } from '@/composables/useDirectionIcons'
import { usePreferences } from '@/composables/usePreferences'
import { visibleTexts } from '@/utils/metrics'
import { formatLongDate } from '@/utils/dafYomiStats'
import TractateName from '@/components/common/TractateName.vue'
import DafYomiAmud from './DafYomiAmud.vue'
import MasechetProgress from '@/components/common/MasechetProgress.vue'

const props = defineProps<{ date?: Date }>()

const { locale } = useI18n()
const { backIcon, forwardIcon } = useDirectionIcons()
const { enabledTexts } = usePreferences()
const { date, day, tractate, amudim, lastAmud, previous, next, reset, isToday } = useDafYomi(toRef(props, 'date'))

const dateLabel = computed(() => formatLongDate(date.value, locale.value))
const hasTexts = computed(() => !!tractate.value && visibleTexts(tractate.value, enabledTexts.value).length > 0)
</script>

<style scoped>
.daf-link {
  color: inherit;
  text-decoration: none;
}
.daf-link:hover,
.daf-link:focus-visible {
  text-decoration: underline;
}
</style>
