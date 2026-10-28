import { useLayoutEffect, useRef, useState, type PointerEvent } from 'react'

// Apple's drawer spring: a little bounce, since a flick usually drives it.
const DAMPING = 0.8
const RESPONSE = 0.3
const phone = () => matchMedia('(max-width: 800px)').matches
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches

/** Where a flick at `v` px/s comes to rest (Apple's scroll deceleration). */
const project = (v: number, d = 0.998) => ((v / 1000) * d) / (1 - d)
/** Past an edge the sheet follows less and less. */
const rubberband = (over: number, dim: number, c = 0.55) => (over * dim * c) / (dim + c * Math.abs(over))

type Sample = { t: number; y: number }
type Drag = { id: number; from: number; start: number; hist: Sample[] }
type State = { y: number; fold: number; full: boolean; raf: number; drag?: Drag }

/**
 * Phone bottom sheet with two detents: full (y = 0) and folded (pushed down until only the
 * title, amount and buttons show). `y` lives in `--y` and is moved by drag and a spring, not React.
 */
export function useSheet(on: boolean) {
  const ref = useRef<HTMLElement>(null)
  const [full, setFull] = useState(false)
  const s = useRef<State>({ y: 0, fold: 0, full: false, raf: 0 }).current

  const set = (y: number) => {
    s.y = y
    ref.current?.style.setProperty('--y', `${y}px`)
  }
  const target = () => (s.full ? 0 : s.fold)

  // Spring from the on-screen y and velocity, so any grab or toggle mid-flight carries on smoothly.
  const settle = (v0: number) => {
    cancelAnimationFrame(s.raf)
    s.raf = 0
    if (still()) return set(target())
    const w = (2 * Math.PI) / RESPONSE
    let v = v0
    let last = performance.now()
    const step = (now: number) => {
      const dt = Math.min((now - last) / 1000, 1 / 30) / 4
      last = now
      const to = target() // re-read: content may resize mid-flight
      let y = s.y
      for (let i = 0; i < 4; i++) {
        v += (-w * w * (y - to) - 2 * DAMPING * w * v) * dt
        y += v * dt
      }
      if (Math.abs(y - to) < 0.5 && Math.abs(v) < 10) return set(to)
      set(y)
      s.raf = requestAnimationFrame(step)
    }
    s.raf = requestAnimationFrame(step)
  }

  const go = (toFull: boolean, v = 0) => {
    s.full = toFull
    setFull(toFull)
    if (!toFull) ref.current?.scrollTo({ top: 0, behavior: still() ? 'auto' : 'smooth' })
    settle(v)
  }

  // Folded detent = everything below the buttons. Re-measured on every render and resize.
  useLayoutEffect(() => {
    const el = ref.current
    if (!on || !el) return
    const measure = () => {
      const end = el.querySelector('.btns, .locked-note')
      if (!end) return
      const pad = parseFloat(getComputedStyle(el).paddingBottom)
      const shown = end.getBoundingClientRect().bottom - el.getBoundingClientRect().top + el.scrollTop + pad
      s.fold = Math.max(0, el.offsetHeight - shown)
      el.closest<HTMLElement>('.desktop')?.style.setProperty('--fold', `${Math.ceil(shown)}px`)
      if (!s.drag && !s.raf) set(target())
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  })
  useLayoutEffect(() => () => cancelAnimationFrame(s.raf), [s])

  // Drag handlers for the title bar (grabber). The chevron keeps its own click.
  const grab = {
    onPointerDown(e: PointerEvent<HTMLElement>) {
      if (!on || !phone() || e.button !== 0 || (e.target instanceof Element && e.target.closest('button'))) return
      cancelAnimationFrame(s.raf)
      s.raf = 0
      s.drag = { id: e.pointerId, from: s.y, start: e.clientY, hist: [{ t: e.timeStamp, y: e.clientY }] }
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    onPointerMove(e: PointerEvent<HTMLElement>) {
      const d = s.drag
      if (d?.id !== e.pointerId) return
      const raw = d.from + e.clientY - d.start
      const h = ref.current?.offsetHeight ?? 1
      set(raw < 0 ? -rubberband(-raw, h) : raw > s.fold ? s.fold + rubberband(raw - s.fold, h) : raw)
      d.hist = [...d.hist.filter((p) => e.timeStamp - p.t < 100), { t: e.timeStamp, y: e.clientY }]
    },
    onPointerUp(e: PointerEvent<HTMLElement>) {
      const d = s.drag
      if (d?.id !== e.pointerId) return
      s.drag = undefined
      // Velocity over the last 100ms; a finger that stopped before lifting throws nothing.
      const recent = d.hist.filter((p) => e.timeStamp - p.t < 100)
      const [a, b] = [recent[0], recent.at(-1)]
      const v = a && b && b.t > a.t ? ((b.y - a.y) / (b.t - a.t)) * 1000 : 0
      go(s.y + project(v) < s.fold / 2, v)
    },
  }

  return { ref, full, toggle: () => go(!s.full), grab: { ...grab, onPointerCancel: grab.onPointerUp } }
}
