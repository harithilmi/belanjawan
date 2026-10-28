import budget from '../budget-2027.json' with { type: 'json' }
import spendingBook from '../budget-2027-ministry.json' with { type: 'json' }
import plainText from '../budget-2027-plain.json' with { type: 'json' }
import { LANG, t, tn } from './i18n.ts'

export const YEAR = budget.year

export type Line = {
  id: string
  name: string
  /** Ministry (Maksud) code, e.g. "B/P.42". */
  code: string
  ministry: string
  opex: number
  devex: number
  total: number
  locked: boolean
  /** AI-written plain-language summary of the book's text, if any. */
  plain?: string
  /** OE by Objek Am, RM million: emolumen, perkhidmatan & bekalan, aset, pemberian & kenaan bayaran tetap, lain. */
  objek: readonly number[]
  /** Bil. Jawatan 2027 (approved posts). */
  posts: number
}

export type Ministry = {
  code: string
  name: string
  sector: string
  lines: Line[]
  plain?: string
}

export type Sector = { name: string; ministries: Ministry[]; lines: Line[] }

/** Plain summaries are keyed by ministry code, or "code|line name". */
const plain: Record<string, { ms: string; en: string } | undefined> = plainText
const plainOf = (key: string) => plain[key]?.[LANG]

/** Shape of budget-2027-ministry.json. Assigning (not casting) keeps TS checking the file against it. */
type Book = {
  sectors: {
    name: string
    ministries: {
      code: string
      name: string
      locked: boolean
      about?: string
      programmes: { name: string; opex: number; devex: number; about?: string; objek?: number[]; posts?: number }[]
    }[]
  }[]
}
const book: Book = spendingBook
const NO_OBJEK = [0, 0, 0, 0, 0]

export const sectors: Sector[] = book.sectors.map((s) => {
  const ministries = s.ministries.map((m) => ({
    code: m.code,
    name: m.name,
    plain: plainOf(m.code),
    sector: tn(s.name),
    lines: m.programmes.map((p, i) => ({
      id: `${m.code}#${i}`, // position in the book's order; bump the plan key when the data changes
      name: p.name,
      code: m.code,
      ministry: m.name,
      opex: p.opex,
      devex: p.devex,
      total: p.opex + p.devex,
      locked: m.locked,
      plain: plainOf(`${m.code}|${p.name}`),
      objek: p.objek ?? NO_OBJEK, // DE projects have none
      posts: p.posts ?? 0,
    })),
  }))
  return { name: tn(s.name), ministries, lines: ministries.flatMap((m) => m.lines) }
})

export type Activity = { name: string; rm: number; fungsi?: string }

/** budget-2027-activities.json: ministry code → line name → activities, biggest first. */
export type ActivitiesByLine = Record<string, Record<string, Activity[] | undefined> | undefined>
export const activitiesIn = (byLine: ActivitiesByLine) => (l: Line): readonly Activity[] => byLine[l.code]?.[l.name] ?? []

export const ministries: Ministry[] = sectors.flatMap((s) => s.ministries)
export const lines: Line[] = sectors.flatMap((s) => s.lines)
export const lineById = new Map(lines.map((l) => [l.id, l]))

export const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0)

/** Disk capacity: total federal revenue (RM million). */
export const REVENUE = sum(budget.revenue.flatMap((g) => g.items.map((i) => i.value)))
/** Disk used before any cuts (RM million). */
export const SPENDING = sum(lines.map((l) => l.total))

export const revenueGroups = budget.revenue.map((g) => ({
  name: tn(g.group),
  total: sum(g.items.map((i) => i.value)),
}))

/** RM million → "RM12.3 bilion" / "RM12.3bn". */
export function fmt(m: number): string {
  const sign = m < 0 ? '−' : ''
  const a = Math.abs(m)
  if (a < 0.5) return 'RM0'
  return a >= 1000 ? `${sign}RM${(a / 1000).toFixed(1)}${t.bn}` : `${sign}RM${Math.round(a)}${t.m}`
}

/** Bare billions for the tree's size column (the unit is in its header). 2 dp so decimals line up. */
export const inBillions = (m: number) => (m / 1000).toFixed(2)

/** Tree nodes are addressed by a string key, so selection and drag data stay plain strings. */
export type TreeNode =
  | { kind: 'root' }
  | { kind: 'sector'; sector: Sector }
  | { kind: 'ministry'; ministry: Ministry }
  | { kind: 'line'; line: Line }

export const ROOT = 'root'
export const sectorKey = (s: Sector) => `s:${s.name}`
export const ministryKey = (m: Ministry) => `m:${m.code}`

export function nodeOf(key: string): TreeNode {
  const line = lineById.get(key)
  if (line) return { kind: 'line', line }
  const ministry = ministries.find((m) => ministryKey(m) === key)
  if (ministry) return { kind: 'ministry', ministry }
  const sector = sectors.find((s) => sectorKey(s) === key)
  return sector ? { kind: 'sector', sector } : { kind: 'root' }
}

export const nameOf = (n: TreeNode) =>
  n.kind === 'root' ? t.root : n.kind === 'sector' ? n.sector.name : n.kind === 'ministry' ? n.ministry.name : n.line.name

export function linesOf(n: TreeNode): Line[] {
  switch (n.kind) {
    case 'line': return [n.line]
    case 'ministry': return n.ministry.lines
    case 'sector': return n.sector.lines
    case 'root': return lines
  }
}

/** Folders above a key, root first. */
export function ancestors(key: string): string[] {
  const n = nodeOf(key)
  if (n.kind === 'root') return []
  if (n.kind === 'sector') return [ROOT]
  const m = n.kind === 'ministry' ? n.ministry : ministries.find((x) => x.code === n.line.code)
  const s = m && sectors.find((x) => x.ministries.includes(m))
  return [ROOT, ...(s ? [sectorKey(s)] : []), ...(m && n.kind === 'line' ? [ministryKey(m)] : [])]
}

/** Deepest folder that is the entered one or above it, and holds `key` (so its row can show). */
export const cwdFor = (cwd: string, key: string) => {
  const here = [...ancestors(cwd), cwd]
  return ancestors(key).findLast((k) => here.includes(k)) ?? ROOT
}
