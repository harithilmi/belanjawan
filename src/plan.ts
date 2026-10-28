import { useEffect, useRef, useState } from 'react'
import { lineById, lines, sum, REVENUE, SPENDING, type Line } from './data.ts'

/** Line id → percent kept (0–100). Missing = 100 (untouched). 0 = in the Recycle Bin. */
export type Plan = Readonly<Record<string, number>>

const KEY = 'malaysias-disk.plan.v2'

export const keepOf = (plan: Plan, l: Line) => (l.locked ? 100 : (plan[l.id] ?? 100))
export const nowOf = (plan: Plan, l: Line) => (l.total * keepOf(plan, l)) / 100
export const statusOf = (plan: Plan, l: Line) => {
  const k = keepOf(plan, l)
  return l.locked ? 'locked' : k === 0 ? 'deleted' : k < 100 ? 'shrunk' : 'untouched'
}
export type Status = ReturnType<typeof statusOf>
/** Anything in `items` cut? Checks keep %, not summed RM, so float noise never shows "−RM0". */
export const isCut = (plan: Plan, items: readonly Line[]) => items.some((l) => keepOf(plan, l) < 100)

const clamp = (n: number) => Math.min(100, Math.max(0, Math.round(n)))

/** Set keep % for lines; locked lines are ignored, 100 is stored as "missing". */
export function setKeep(plan: Plan, targets: readonly Line[], keep: (current: number) => number): Plan {
  const next: Record<string, number> = { ...plan }
  for (const l of targets) {
    if (l.locked) continue
    const k = clamp(keep(keepOf(plan, l)))
    if (k === 100) delete next[l.id]
    else next[l.id] = k
  }
  return next
}

export const shrink10 = (plan: Plan, t: readonly Line[]) => setKeep(plan, t, (k) => k - 10)
export const remove = (plan: Plan, t: readonly Line[]) => setKeep(plan, t, () => 0)

export function totals(plan: Plan) {
  const spending = sum(lines.map((l) => nowOf(plan, l)))
  return {
    spending,
    cut: SPENDING - spending,
    /** Positive = still borrowing. */
    gap: spending - REVENUE,
    deleted: lines.filter((l) => statusOf(plan, l) === 'deleted').length,
    shrunk: lines.filter((l) => statusOf(plan, l) === 'shrunk').length,
  }
}

/** Changed lines, biggest saving first. */
export const changes = (plan: Plan) =>
  lines
    .filter((l) => keepOf(plan, l) < 100)
    .map((l) => ({ line: l, keep: keepOf(plan, l), freed: l.total - nowOf(plan, l) }))
    .sort((a, b) => b.freed - a.freed)

/** localStorage is user-editable: keep only known, unlocked ids with valid percents. */
function load(): Plan {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    if (typeof raw !== 'object' || raw === null) return {}
    return Object.fromEntries(
      Object.entries(raw).filter(
        ([id, v]) => lineById.get(id)?.locked === false && typeof v === 'number' && v >= 0 && v < 100,
      ),
    )
  } catch {
    return {}
  }
}

const samePlan = (a: Plan, b: Plan) => {
  const ka = Object.keys(a)
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k])
}

/** The plan, saved in localStorage, with ⌘Z history. Changes less than 600ms apart (a slider drag) undo as one step. */
export function usePlan() {
  const [plan, setPlanState] = useState<Plan>(load)
  useEffect(() => localStorage.setItem(KEY, JSON.stringify(plan)), [plan])
  const past = useRef<Plan[]>([])
  const lastAt = useRef(0)

  const setPlan = (f: (p: Plan) => Plan) => {
    const next = f(plan)
    if (samePlan(next, plan)) return // e.g. shrinking a locked line: nothing to undo
    const now = Date.now()
    if (now - lastAt.current > 600) past.current = [...past.current.slice(-99), plan]
    lastAt.current = now
    setPlanState(next)
  }
  const undo = () => {
    const prev = past.current.at(-1)
    if (!prev) return
    past.current = past.current.slice(0, -1)
    lastAt.current = 0
    setPlanState(prev)
  }
  return [plan, setPlan, undo] as const
}
