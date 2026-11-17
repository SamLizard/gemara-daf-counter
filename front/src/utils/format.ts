import { t } from '@/i18n'
import type { Unit } from '@/types/metrics'

const numberFormat = (digits: number) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: digits, minimumFractionDigits: 0 })

/** Western digits in every locale. */
export function formatNumber(value: number, digits = 1): string {
  return numberFormat(digits).format(value)
}

/**
 * Formats a quantity given in full dafim.
 * For 'percent', `printedSides` is required (share of the text body).
 */
export function formatValue(dafim: number | null, unit: Unit, printedSides?: number): string {
  if (dafim === null) return t('value.notCalculated')
  if (unit === 'amudim') return t('unit.amudimValue', { value: formatNumber(dafim * 2) })
  if (unit === 'percent' && printedSides) return formatPercent((dafim * 2) / printedSides)
  return t('unit.dafimValue', { value: formatNumber(dafim) })
}

/** A fraction of one amud's text body. 0 on a measured text = "none on this amud". */
export function formatFraction(value: number | null | undefined): string {
  if (value === null || value === undefined) return t('value.notCalculated')
  if (value === 0) return t('value.noneOnAmud')
  return formatPercent(value)
}

export function formatPercent(fraction: number, digits = 0): string {
  return `${formatNumber(fraction * 100, digits)} %`
}

/** "2a" → "2a" in en/fr, "ב." / "ב:" style is not used: Western amud labels everywhere. */
export function formatAmud(amud: string): string {
  return amud
}

export function amudDaf(amud: string): number {
  return Number.parseInt(amud, 10)
}

export function amudSide(amud: string): 'a' | 'b' {
  return amud.endsWith('b') ? 'b' : 'a'
}
