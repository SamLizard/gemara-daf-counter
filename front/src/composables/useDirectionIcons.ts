import { computed } from 'vue'
import { useRtl } from 'vuetify'

/**
 * Icons pointing backward / forward in the reading direction.
 * Vuetify's `$prev` / `$next` aliases are fixed chevrons, so they are swapped in RTL (as VPagination does).
 */
export function useDirectionIcons() {
  const { isRtl } = useRtl()
  return {
    backIcon: computed(() => (isRtl.value ? '$next' : '$prev')),
    forwardIcon: computed(() => (isRtl.value ? '$prev' : '$next')),
  }
}
