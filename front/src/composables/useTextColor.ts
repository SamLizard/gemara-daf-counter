import { computed } from 'vue'
import { useTheme } from 'vuetify'
import type { TextId, ThemeName } from '@/types/metrics'
import { textColor } from '@/utils/colors'

/** Returns a function giving the current theme's color of a text id. */
export function useTextColor() {
  const theme = useTheme()
  const name = computed<ThemeName>(() => (theme.global.name.value === 'night' ? 'night' : 'parchment'))
  return (id: TextId | 'rest') => textColor(id, name.value)
}

export function useThemeName() {
  const theme = useTheme()
  return computed<ThemeName>(() => (theme.global.name.value === 'night' ? 'night' : 'parchment'))
}
