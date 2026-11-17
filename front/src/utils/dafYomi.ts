import { DafYomi } from '@hebcal/learning/dafYomiBase'

// @hebcal/learning tractate names → our tractate ids.
const hebcalToId: Record<string, string> = {
  Berachot: 'berachos', Shabbat: 'shabbos', Eruvin: 'eruvin', Pesachim: 'pesachim', Shekalim: 'shekalim',
  Yoma: 'yoma', Sukkah: 'sukkah', Beitzah: 'beitzah', 'Rosh Hashana': 'rosh-hashanah', Taanit: 'taanis',
  Megillah: 'megillah', 'Moed Katan': 'moed-katan', Chagigah: 'chagigah', Yevamot: 'yevamos',
  Ketubot: 'kesubos', Nedarim: 'nedarim', Nazir: 'nazir', Sotah: 'sotah', Gitin: 'gittin',
  Kiddushin: 'kiddushin', 'Baba Kamma': 'bava-kamma', 'Baba Metzia': 'bava-metzia', 'Baba Batra': 'bava-basra',
  Sanhedrin: 'sanhedrin', Makkot: 'makkos', Shevuot: 'shevuos', 'Avodah Zarah': 'avodah-zarah',
  Horayot: 'horayos', Zevachim: 'zevachim', Menachot: 'menachos', Chullin: 'chullin', Bechorot: 'bechoros',
  Arachin: 'arachin', Temurah: 'temurah', Keritot: 'kereisos', Meilah: 'meilah', Kinnim: 'kinim',
  Tamid: 'tamid', Midot: 'middos', Niddah: 'niddah',
}

export interface DafYomiDay {
  tractateId: string
  daf: number
}

export function dafYomiFor(date: Date): DafYomiDay | null {
  try {
    const daf = new DafYomi(date)
    const tractateId = hebcalToId[daf.getName()]
    return tractateId ? { tractateId, daf: Number(daf.getBlatt()) } : null
  } catch {
    return null
  }
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}
