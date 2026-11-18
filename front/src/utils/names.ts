import he from '@/i18n/locales/he.json'
import type { TextId } from '@/types/metrics'

// Hebrew names are shown in every locale (spec §7). They come from the Hebrew locale file,
// so there is one source for them.
const tractateHebrew: Record<string, string> = he.tractate
const textHebrew: Record<string, string> = he.text

export function tractateHebrewName(id: string): string {
  return tractateHebrew[id] ?? id
}

export function textHebrewName(id: TextId): string {
  return textHebrew[id] ?? id
}

const HEBREW_RUN = /([\u0590-\u05FF][\u0590-\u05FF\s״׳"'.,:\-–/()]*[\u0590-\u05FF״׳]|[\u0590-\u05FF])/g

/** Splits a string into Hebrew and non-Hebrew runs, so Hebrew can be wrapped in its own span. */
export function splitHebrew(text: string): { text: string; hebrew: boolean }[] {
  const parts: { text: string; hebrew: boolean }[] = []
  let last = 0
  for (const match of text.matchAll(HEBREW_RUN)) {
    const start = match.index ?? 0
    if (start > last) parts.push({ text: text.slice(last, start), hebrew: false })
    parts.push({ text: match[0], hebrew: true })
    last = start + match[0].length
  }
  if (last < text.length) parts.push({ text: text.slice(last), hebrew: false })
  return parts
}
