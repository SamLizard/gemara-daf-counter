<template>
  <div>
    <div class="d-flex align-center justify-space-between flex-wrap ga-2 mb-2">
      <span class="text-title-medium">{{ $t('home.dafYomi.amud', { amud: formatAmud(amud) }) }}</span>
      <v-btn
        :to="{ name: 'masechet', params: { id: tractateId }, query: { amud } }"
        variant="text"
        size="small"
        :append-icon="forwardIcon"
        :aria-label="$t('home.dafYomi.openAmud', { amud: formatAmud(amud) })"
      >
        {{ $t('home.dafYomi.details') }}
      </v-btn>
    </div>
    <StackedBar :segments="segments" :legend="false" :ariaLabel="$t('home.dafYomi.barLabel', { amud })" />
    <v-list density="compact" class="bg-transparent pa-0 mt-1">
      <v-list-item v-for="row in rows" :key="row.id" class="px-0" min-height="28">
        <TextName :id="row.id" dot />
        <template #append>
          <span class="text-body-medium">{{ row.display }}</span>
        </template>
      </v-list-item>
    </v-list>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useMetrics } from '@/composables/useMetrics'
import { usePreferences } from '@/composables/usePreferences'
import { useDirectionIcons } from '@/composables/useDirectionIcons'
import { formatAmud, formatFraction } from '@/utils/format'
import { pageIndex, pageValues, visibleTexts } from '@/utils/metrics'
import { amudSegments } from '@/utils/dafYomiStats'
import StackedBar from '@/components/charts/StackedBar.vue'
import TextName from '@/components/common/TextName.vue'

const props = defineProps<{ tractateId: string; amud: string }>()

const { tractate } = useMetrics()
const { enabledTexts } = usePreferences()
const { forwardIcon } = useDirectionIcons()
const current = computed(() => tractate(props.tractateId))

const segments = computed(() =>
  current.value ? amudSegments(current.value, props.amud, enabledTexts.value) : [],
)

const rows = computed(() => {
  const value = current.value
  if (!value) return []
  const values = pageValues(value, pageIndex(value, props.amud))
  return visibleTexts(value, enabledTexts.value).map((text) => ({
    id: text.id,
    display: formatFraction(values[text.id]),
  }))
})
</script>
