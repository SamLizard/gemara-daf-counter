import { ref, watch } from 'vue'
import { i18n, isLocale, RTL_LOCALES, type LocaleCode } from '@/i18n'
import { TEXT_IDS, type TextId, type ThemeName, type Unit, type Viewer } from '@/types/metrics'

const STORAGE_KEY = 'gemara-daf-counter:preferences'

interface Stored {
  locale: LocaleCode
  theme: ThemeName
  unit: Unit
  enabledTexts: TextId[]
  viewer: Viewer
}

const defaults: Stored = {
  locale: 'en',
  theme: 'parchment',
  unit: 'dafim',
  enabledTexts: ['main', 'rashi'],
  viewer: 'sefaria',
}

function read(): Stored {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<Stored>
    return {
      locale: isLocale(raw.locale) ? raw.locale : defaults.locale,
      theme: raw.theme === 'night' || raw.theme === 'parchment' ? raw.theme : defaults.theme,
      unit: raw.unit && ['dafim', 'amudim', 'percent'].includes(raw.unit) ? raw.unit : defaults.unit,
      enabledTexts: Array.isArray(raw.enabledTexts)
        ? raw.enabledTexts.filter((id): id is TextId => TEXT_IDS.includes(id))
        : defaults.enabledTexts,
      viewer: raw.viewer && ['sefaria', 'hebrewbooks', 'shas-org'].includes(raw.viewer) ? raw.viewer : defaults.viewer,
    }
  } catch {
    return { ...defaults }
  }
}

const initial = read()
const locale = ref<LocaleCode>(initial.locale)
const theme = ref<ThemeName>(initial.theme)
const unit = ref<Unit>(initial.unit)
const enabledTexts = ref<TextId[]>(initial.enabledTexts)
const viewer = ref<Viewer>(initial.viewer)

watch(
  [locale, theme, unit, enabledTexts, viewer],
  () => {
    const stored: Stored = {
      locale: locale.value,
      theme: theme.value,
      unit: unit.value,
      enabledTexts: enabledTexts.value,
      viewer: viewer.value,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
  },
  { deep: true },
)

watch(
  locale,
  (code) => {
    i18n.global.locale.value = code
    document.documentElement.lang = code
    document.documentElement.dir = RTL_LOCALES[code] ? 'rtl' : 'ltr'
  },
  { immediate: true },
)

/** User preferences, stored in localStorage. Theme is applied by App.vue. */
export function usePreferences() {
  return { locale, theme, unit, enabledTexts, viewer }
}
