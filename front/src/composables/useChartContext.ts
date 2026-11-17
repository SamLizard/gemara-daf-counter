import { computed } from 'vue'
import { useRtl, useTheme } from 'vuetify'
import type { ChartContext } from '@/utils/charts/echarts'

/** Direction and theme colors passed to the chart option builders in utils/charts. */
export function useChartContext() {
  const { isRtl } = useRtl()
  const theme = useTheme()
  return computed<ChartContext>(() => {
    const dark = theme.current.value.dark
    return {
      isRtl: isRtl.value,
      foreground: dark ? '#E6E1D6' : '#2B2B2B',
      muted: dark ? '#3A3F4B' : '#E2DACB',
    }
  })
}
