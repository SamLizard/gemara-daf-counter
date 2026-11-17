<template>
  <v-row v-if="current">
    <v-col v-for="stat in stats" :key="stat.id" cols="12" sm="6" :md="columns">
      <StatCard
        :text-id="stat.id"
        :value="stat.total"
        :unit="unit"
        :printed-sides="current.printedSides"
        :hint="hint(stat)"
      />
    </v-col>
  </v-row>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMetrics } from '@/composables/useMetrics'
import { usePreferences } from '@/composables/usePreferences'
import { textStats, type TextStat } from '@/utils/masechet'
import { formatNumber, formatPercent } from '@/utils/format'
import StatCard from '@/components/common/StatCard.vue'

const props = defineProps<{ tractateId: string }>()

const { t } = useI18n()
const { tractate } = useMetrics()
const { unit } = usePreferences()

const current = computed(() => tractate(props.tractateId))
const stats = computed(() => (current.value ? textStats(current.value) : []))
const columns = computed(() => Math.max(3, Math.floor(12 / Math.max(1, stats.value.length))))

function hint(stat: TextStat): string | undefined {
  if (stat.share === null) return undefined
  const share = formatPercent(stat.share)
  if (stat.ratioToMain === null) return t('masechet.shareHint', { share })
  return t('masechet.shareRatioHint', { share, ratio: formatNumber(stat.ratioToMain) })
}
</script>
