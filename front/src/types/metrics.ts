// Schema of public/shas-front.json, written by src/export-front.mjs at the repository root.
// The export script and these types change together.

export type TextId = 'main' | 'rashi' | 'rashbam' | 'ran' | 'tosafot'

export const TEXT_IDS: readonly TextId[] = ['main', 'rashi', 'rashbam', 'ran', 'tosafot']

export type TextState = 'measured' | 'not-measured'

export interface TextEntry {
  id: TextId
  state: TextState
  /** Full dafim; null when not measured. */
  total: number | null
}

/** [amud, ...fractions in the order of `columns`]; null = not calculated. */
export type PageRow = [string, ...(number | null)[]]

export interface Tractate {
  id: string
  order: OrderId
  firstAmud: string
  lastAmud: string
  printedSides: number
  /** Texts printed on this masechet. Absent texts are not listed. */
  texts: TextEntry[]
  otherCommentaries: 'none' | 'not-measured'
  columns: TextId[]
  pages: PageRow[]
}

export type OrderId = 'Zeraim' | 'Moed' | 'Nashim' | 'Nezikin' | 'Kodashim' | 'Tahorot'

export interface MetricsFile {
  generatedFrom: { schemaVersion: number; classifierVersion: number }
  attribution: { pdf: string; sources: string[] }
  warning: string
  orders: OrderId[]
  tractates: Tractate[]
}

export type Unit = 'dafim' | 'amudim' | 'percent'
export type Viewer = 'sefaria' | 'hebrewbooks' | 'shas-org'
export type ThemeName = 'parchment' | 'night'
