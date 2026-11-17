import { t } from '@/i18n'
import { tractateHebrewName } from '@/utils/names'

/** Lower case, no accents, no niqqud, no punctuation or spaces: "Rosh-Hashanah" ≈ "rosh hashana". */
export function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f\u0591-\u05C7]/g, '')
    .replace(/[\s'"\-–.·״׳]/g, '')
    .toLowerCase()
}

/** Names a masechet can be searched by: current locale, English and Hebrew. */
export function tractateSearchNames(id: string): string[] {
  const key = `tractate.${id}`
  return [t(key), t(key, {}, { locale: 'en' }), tractateHebrewName(id)]
}

export function matchesTractate(id: string, query: string | null | undefined): boolean {
  const needle = normalizeSearch(query ?? '')
  if (!needle) return true
  return tractateSearchNames(id).some((name) => normalizeSearch(name).includes(needle))
}
