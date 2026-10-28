import budget from '../budget-2027.json' with { type: 'json' }
import spendingBook from '../budget-2027-ministry.json' with { type: 'json' }
import { t, tn } from './i18n.ts'

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
  /** Programme outcome quoted from the book, if it has one. */
  about?: string
}

export type Ministry = { code: string; name: string; sector: string; lines: Line[]; /** VISI from the book. */ about?: string }
export type Sector = { name: string; ministries: Ministry[]; lines: Line[] }

export const sectors: Sector[] = spendingBook.sectors.map((s) => {
  const ministries = s.ministries.map((m) => ({
    code: m.code,
    name: m.name,
    about: m.about,
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
      about: 'about' in p ? p.about : undefined, // JSON infers a union; only some lines have it
    })),
  }))
  return { name: tn(s.name), ministries, lines: ministries.flatMap((m) => m.lines) }
})

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

export function linesOf(n: TreeNode): Line[] {
  switch (n.kind) {
    case 'line': return [n.line]
    case 'ministry': return n.ministry.lines
    case 'sector': return n.sector.lines
    case 'root': return lines
  }
}
