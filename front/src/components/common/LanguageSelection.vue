<template>
  <v-select
    v-model="locale"
    :items="otherLocales"
    item-title="text"
    item-value="lang"
    :aria-label="$t('language')"
    hide-details
    flat
    density="compact"
    variant="solo"
    bg-color="transparent"
    class="language-selection"
  >
    <template #selection>
      <v-img :src="flag(locale)" width="28" max-width="28" alt="" class="me-2" />
      <span class="d-none d-sm-inline">{{ $t('language') }}</span>
    </template>
    <template #item="{ item, props: itemProps }">
      <v-list-item v-bind="itemProps">
        <template #prepend>
          <v-img :src="flag(item.lang)" width="28" max-width="28" alt="" class="me-3" />
        </template>
      </v-list-item>
    </template>
  </v-select>
</template>

<script setup lang="ts">
// Adapted from SamLizard/vue3-ts (dev) src/components/LanguageSelection.vue.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { LOCALES, type LocaleCode } from '@/i18n'
import { usePreferences } from '@/composables/usePreferences'

interface LocaleItem {
  lang: LocaleCode
  text: string
}

const { t } = useI18n()
const { locale } = usePreferences()

const flag = (code: string) => `${import.meta.env.BASE_URL}flags/${code}.svg`

const otherLocales = computed<LocaleItem[]>(() =>
  LOCALES.filter((code) => code !== locale.value).map((lang) => ({ lang, text: t('language', 1, { locale: lang }) })),
)
</script>

<style scoped>
.language-selection {
  max-width: 180px;
}
.language-selection :deep(.v-field__input) {
  padding-inline: 4px;
}
</style>
