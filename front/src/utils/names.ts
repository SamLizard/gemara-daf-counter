import type { TextId } from '@/types/metrics'

// Hebrew names are shown in every locale (spec §7), so they live here and not in the locale files.
const tractateHebrew: Record<string, string> = {
  berachos: 'ברכות', shabbos: 'שבת', eruvin: 'עירובין', pesachim: 'פסחים', shekalim: 'שקלים', yoma: 'יומא',
  sukkah: 'סוכה', beitzah: 'ביצה', 'rosh-hashanah': 'ראש השנה', taanis: 'תענית', megillah: 'מגילה',
  'moed-katan': 'מועד קטן', chagigah: 'חגיגה', yevamos: 'יבמות', kesubos: 'כתובות', nedarim: 'נדרים',
  nazir: 'נזיר', sotah: 'סוטה', gittin: 'גיטין', kiddushin: 'קידושין', 'bava-kamma': 'בבא קמא',
  'bava-metzia': 'בבא מציעא', 'bava-basra': 'בבא בתרא', sanhedrin: 'סנהדרין', makkos: 'מכות',
  shevuos: 'שבועות', 'avodah-zarah': 'עבודה זרה', horayos: 'הוריות', zevachim: 'זבחים', menachos: 'מנחות',
  chullin: 'חולין', bechoros: 'בכורות', arachin: 'ערכין', temurah: 'תמורה', kereisos: 'כריתות',
  meilah: 'מעילה', kinim: 'קינים', tamid: 'תמיד', middos: 'מידות', niddah: 'נדה',
}

const textHebrew: Record<TextId, string> = {
  main: 'גמרא ומשנה',
  rashi: 'רש״י',
  'rashi-rashbam': 'רש״י / רשב״ם',
  ran: 'ר״ן',
  tosafot: 'תוספות',
}

export function tractateHebrewName(id: string): string {
  return tractateHebrew[id] ?? id
}

export function textHebrewName(id: TextId): string {
  return textHebrew[id]
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
