import budget from '../budget-2027.json' with { type: 'json' }
import spendingBook from '../budget-2027-ministry.json' with { type: 'json' }
import plainText from '../budget-2027-plain.json' with { type: 'json' }
import { LANG, t, tn } from './i18n.ts'
import { slugByCode } from './slug.ts'

export const YEAR = budget.year

export type Line = {
  id: string
  /** Display name: the book's Malay, plus our own English in brackets in English mode. */
  name: string
  /** The book's Malay name. Search terms and notes are keyed by it. */
  bm: string
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
  /** The book's Malay name. */
  bm: string
  sector: string
  lines: Line[]
  plain?: string
  /** URL path segment: harithilmi.com/belanjawan/<slug>/ */
  slug: string
}

export type Sector = { name: string; ministries: Ministry[]; lines: Line[] }

/** Plain summaries are keyed by ministry code, or "code|line name" (the book's Malay). */
const plain: Record<string, { ms: string; en: string } | undefined> = plainText
const plainOf = (key: string) => plain[key]?.[LANG]

/** Names in the JSON: `en` is official (Maksud), `enOurs` our own translation of a programme. */
type Named = { name: string; en?: string; enOurs?: string }

/** Shape of budget-2027-ministry.json. Assigning (not casting) keeps TS checking the file against it. */
type Book = {
  sectors: {
    name: string
    ministries: (Named & {
      code: string
      locked: boolean
      about?: string
      programmes: (Named & { opex: number; devex: number; about?: string; objek?: number[]; posts?: number })[]
    })[]
  }[]
}
const book: Book = spendingBook
const NO_OBJEK = [0, 0, 0, 0, 0]

/**
 * English mode: official English names (Maksud, from the Supply Bill) as they are.
 * Programme names have no official English, so ours goes in brackets after the book's Malay.
 */
const show = (n: Named) => (LANG === 'ms' ? n.name : (n.en ?? (n.enOurs ? `${n.name} (${n.enOurs})` : n.name)))

export const sectors: Sector[] = book.sectors.map((s) => {
  const ministries = s.ministries.map((m) => ({
    code: m.code,
    name: show(m),
    bm: m.name,
    plain: plainOf(m.code),
    slug: slugByCode.get(m.code) ?? m.code,
    sector: tn(s.name),
    lines: m.programmes.map((p, i) => ({
      id: `${m.code}#${i}`, // position in the book's order; bump the plan key when the data changes
      name: show(p),
      bm: p.name,
      code: m.code,
      ministry: show(m),
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
export const activitiesIn = (byLine: ActivitiesByLine) => (l: Line): readonly Activity[] => byLine[l.code]?.[l.bm] ?? []

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

const bySlug = new Map(ministries.map((m) => [m.slug, m]))
const [, dir = '/', last = ''] = /^(.*\/)([^/]+)\/$/.exec(location.pathname) ?? []
const opened = bySlug.get(last)
/** The app's own path without a ministry slug, e.g. "/belanjawan/". */
export const BASE = opened ? dir : location.pathname.replace(/[^/]*$/, '')
/** Row to select on load: the ministry in the URL, if any. */
export const START = opened ? ministryKey(opened) : ROOT

/** URL for a selection: its ministry's page, or the app's root for anything above a ministry. */
export function urlOf(key: string): string {
  const n = nodeOf(key)
  const m = n.kind === 'ministry' ? n.ministry : n.kind === 'line' ? ministries.find((x) => x.code === n.line.code) : undefined
  return m ? `${BASE}${m.slug}/` : BASE
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
