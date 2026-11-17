import type { Viewer } from '@/types/metrics'
import { amudDaf, amudSide } from '@/utils/format'

// Names used by each external site, keyed by our tractate id.
const sefariaNames: Record<string, string> = {
  berachos: 'Berakhot', shabbos: 'Shabbat', eruvin: 'Eruvin', pesachim: 'Pesachim', shekalim: 'Shekalim',
  yoma: 'Yoma', sukkah: 'Sukkah', beitzah: 'Beitzah', 'rosh-hashanah': 'Rosh_Hashanah', taanis: 'Taanit',
  megillah: 'Megillah', 'moed-katan': 'Moed_Katan', chagigah: 'Chagigah', yevamos: 'Yevamot',
  kesubos: 'Ketubot', nedarim: 'Nedarim', nazir: 'Nazir', sotah: 'Sotah', gittin: 'Gittin',
  kiddushin: 'Kiddushin', 'bava-kamma': 'Bava_Kamma', 'bava-metzia': 'Bava_Metzia', 'bava-basra': 'Bava_Batra',
  sanhedrin: 'Sanhedrin', makkos: 'Makkot', shevuos: 'Shevuot', 'avodah-zarah': 'Avodah_Zarah',
  horayos: 'Horayot', zevachim: 'Zevachim', menachos: 'Menachot', chullin: 'Chullin', bechoros: 'Bekhorot',
  arachin: 'Arakhin', temurah: 'Temurah', kereisos: 'Keritot', meilah: 'Meilah', kinim: 'Kinnim',
  tamid: 'Tamid', middos: 'Middot', niddah: 'Niddah',
}

// HebrewBooks Shas numbering (mesechta=1 Berachos … 37 Niddah); Kinnim/Tamid/Middos follow Meilah.
const hebrewBooksIds: Record<string, number> = {
  berachos: 1, shabbos: 2, eruvin: 3, pesachim: 4, shekalim: 5, yoma: 6, sukkah: 7, beitzah: 8,
  'rosh-hashanah': 9, taanis: 10, megillah: 11, 'moed-katan': 12, chagigah: 13, yevamos: 14, kesubos: 15,
  nedarim: 16, nazir: 17, sotah: 18, gittin: 19, kiddushin: 20, 'bava-kamma': 21, 'bava-metzia': 22,
  'bava-basra': 23, sanhedrin: 24, makkos: 25, shevuos: 26, 'avodah-zarah': 27, horayos: 28, zevachim: 29,
  menachos: 30, chullin: 31, bechoros: 32, arachin: 33, temurah: 34, kereisos: 35, meilah: 36, kinim: 36,
  tamid: 36, middos: 36, niddah: 37,
}

export function pageUrl(viewer: Viewer, tractateId: string, amud: string): string {
  const daf = amudDaf(amud)
  const side = amudSide(amud)
  if (viewer === 'hebrewbooks') {
    const id = hebrewBooksIds[tractateId] ?? 1
    return `https://hebrewbooks.org/shas.aspx?mesechta=${id}&daf=${daf}${side === 'b' ? 'b' : ''}&format=pdf`
  }
  if (viewer === 'shas-org') {
    // Kinnim, Tamid and Middos are printed at the end of Meilah.
    const masechta = ['kinim', 'tamid', 'middos'].includes(tractateId) ? 'meilah' : tractateId
    return `https://www.shas.org/daf-pdf/api/?masechta=${masechta}&daf=${daf}&amud=${side}`
  }
  return `https://www.sefaria.org/${sefariaNames[tractateId] ?? tractateId}.${daf}${side}`
}

export const sourceLinks = {
  shasOrgApi: 'https://www.shas.org/daf-pdf/api/',
  sefariaExport: 'https://github.com/Sefaria/Sefaria-Export-Archive',
  wikisource: 'https://he.wikisource.org/',
  hebcal: 'https://github.com/hebcal/hebcal-learning',
}
