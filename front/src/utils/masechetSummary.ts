import { t as globalT } from '@/i18n'
import type { TextId, Tractate } from '@/types/metrics'
import { extremes } from '@/utils/metrics'
import { formatFraction } from '@/utils/format'

type Translate = (key: string, params?: Record<string, unknown>) => string

/** Text alternative of the page strip. */
export function stripSummary(tractate: Tractate, t: Translate = globalT): string {
  return t('masechet.strip.summary', {
    tractate: t(`tractate.${tractate.id}`),
    count: tractate.pages.length,
    first: tractate.firstAmud,
    last: tractate.lastAmud,
  })
}

/** Text alternative of the heatmap: densest and lightest amud of the text. */
export function heatmapSummary(tractate: Tractate, id: TextId, t: Translate = globalT): string {
  const range = extremes(tractate, id)
  if (!range) return t('value.notCalculated')
  return t('masechet.heatmap.summary', {
    text: t(`text.${id}`),
    max: range.max.amud,
    maxValue: formatFraction(range.max.value),
    min: range.min.amud,
    minValue: formatFraction(range.min.value),
  })
}
