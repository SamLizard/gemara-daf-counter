import type { MasechetRow } from './masechtotRows'

export type MasechtotSort = 'shas' | 'real' | 'printed' | 'ratio'

export const MASECHTOT_SORTS: readonly { value: MasechtotSort; labelKey: string }[] = [
  { value: 'shas', labelKey: 'masechtot.sort.shas' },
  { value: 'real', labelKey: 'masechtot.sort.real' },
  { value: 'printed', labelKey: 'masechtot.sort.printed' },
  { value: 'ratio', labelKey: 'masechtot.sort.ratio' },
]

/** Descending, unknown values last, ties in Shas order. */
function byValue(read: (row: MasechetRow) => number | null) {
  return (a: MasechetRow, b: MasechetRow): number => {
    const x = read(a)
    const y = read(b)
    if (x === null && y === null) return a.index - b.index
    if (x === null) return 1
    if (y === null) return -1
    return y - x || a.index - b.index
  }
}

const comparators: Record<MasechtotSort, (a: MasechetRow, b: MasechetRow) => number> = {
  shas: (a, b) => a.index - b.index,
  real: byValue((row) => row.real),
  printed: byValue((row) => row.printedSides),
  ratio: byValue((row) => row.commentaryRatio),
}

export function sortRows(rows: readonly MasechetRow[], sort: MasechtotSort): MasechetRow[] {
  return [...rows].sort(comparators[sort])
}

export function isMasechtotSort(value: unknown): value is MasechtotSort {
  return MASECHTOT_SORTS.some((sort) => sort.value === value)
}
