import type { TextId, ThemeName } from '@/types/metrics'

// Okabe–Ito based palette: distinguishable for the common color-vision deficiencies.
const palettes: Record<ThemeName, Record<TextId | 'rest', string>> = {
  parchment: {
    main: '#1F3A5F',
    rashi: '#D55E00',
    // Purple: distinct from Rashi's orange, since both are printed on Pesachim 99b–121b.
    rashbam: '#8E5BA8',
    ran: '#009E73',
    tosafot: '#CC9A06',
    rest: '#D9D2C3',
  },
  night: {
    main: '#7FB2F0',
    rashi: '#F08A4B',
    rashbam: '#C79BE0',
    ran: '#3FC59A',
    tosafot: '#F2C94C',
    rest: '#3A3F4B',
  },
}

export function textColor(id: TextId | 'rest', theme: ThemeName): string {
  return palettes[theme][id]
}

/** Theme color names, registered in the Vuetify themes as `text-<id>`. */
export function themeTextColors(theme: ThemeName): Record<string, string> {
  return Object.fromEntries(Object.entries(palettes[theme]).map(([id, color]) => [`text-${id}`, color]))
}
