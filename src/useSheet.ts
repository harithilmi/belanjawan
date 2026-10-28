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

const DETENTS = ['full', 'fold', 'gone'] as const
type Detent = (typeof DETENTS)[number]
type Sample = { t: number; y: number }
type Drag = { id: number; from: number; start: number; hist: Sample[] }
type State = { y: number; fold: number; to: Detent; raf: number; was: boolean; drag?: Drag; onDismiss?: () => void }

/**
 * Phone bottom sheet with three detents: full (y = 0), folded (pushed down until only the
 * title, amount and buttons show) and gone (off screen, then `onDismiss`).
 * `y` lives in `--y` and is moved by drag and a spring, not React.
 */
export function useSheet(on: boolean, onDismiss: () => void) {
  const ref = useRef<HTMLElement>(null)
  const [full, setFull] = useState(false)
  const s = useRef<State>({ y: 0, fold: 0, to: 'fold', raf: 0, was: false }).current

  const set = (y: number) => {
    s.y = y
    ref.current?.style.setProperty('--y', `${y}px`)
  }
  const offset = (d: Detent) => (d === 'full' ? 0 : d === 'fold' ? s.fold : (ref.current?.offsetHeight ?? 0))
  const arrive = () => {
    set(offset(s.to))
    if (s.to === 'gone') s.onDismiss?.()
  }

  // Spring from the on-screen y and velocity, so any grab or toggle mid-flight carries on smoothly.
  const settle = (v0: number) => {
    cancelAnimationFrame(s.raf)
    s.raf = 0
    if (still()) return arrive()
    const w = (2 * Math.PI) / RESPONSE
    let v = v0
    let last = performance.now()
    const step = (now: number) => {
      const dt = Math.min((now - last) / 1000, 1 / 30) / 4
      last = now
      const to = offset(s.to) // re-read: content may resize mid-flight
      let y = s.y
      for (let i = 0; i < 4; i++) {
        v += (-w * w * (y - to) - 2 * DAMPING * w * v) * dt
        y += v * dt
      }
      // Leaving: done once out of sight, no need to wait for the bounce.
      if ((Math.abs(y - to) < 0.5 && Math.abs(v) < 10) || (s.to === 'gone' && y >= to)) {
        s.raf = 0
        return arrive()
      }
      set(y)
      s.raf = requestAnimationFrame(step)
    }
    s.raf = requestAnimationFrame(step)
  }

  const go = (to: Detent, v = 0) => {
    s.to = to
    setFull(to === 'full')
    if (to !== 'full') ref.current?.scrollTo({ top: 0, behavior: still() ? 'auto' : 'smooth' })
    settle(v)
  }

  // Folded detent = everything below the buttons. Re-measured on every render and resize.
  useLayoutEffect(() => {
    s.onDismiss = onDismiss
    const el = ref.current
    if (!on || !el) {
      // Dismissed: the next row's sheet comes back folded.
      if (s.to === 'gone') s.to = 'fold'
      s.was = false
      return
    }
    const measure = () => {
      const end = el.querySelector('.btns, .locked-note')
      if (!end) return
      const pad = parseFloat(getComputedStyle(el).paddingBottom)
      const shown = end.getBoundingClientRect().bottom - el.getBoundingClientRect().top + el.scrollTop + pad
      s.fold = Math.max(0, el.offsetHeight - shown)
      // Nothing to scroll: CSS then blocks touch panning, else iOS scrolls the page behind instead.
      el.toggleAttribute('data-fits', el.scrollHeight <= el.clientHeight)
      el.closest<HTMLElement>('.desktop')?.style.setProperty('--fold', `${Math.ceil(shown)}px`)
      if (!s.drag && !s.raf) set(offset(s.to))
    }
    measure()
    // Arriving: rise from below, the way it leaves.
    if (!s.was && phone()) {
      set(offset('gone'))
      settle(0)
    }
    s.was = true
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
      // No mouse compat events: else, once the sheet slides off the press point, the browser
      // starts a native drag of the tree row now under it and cancels this pointer.
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    onPointerMove(e: PointerEvent<HTMLElement>) {
      const d = s.drag
      if (d?.id !== e.pointerId) return
      const raw = d.from + e.clientY - d.start
      // Up past full resists; down past folded follows 1:1 towards dismissing.
      set(raw < 0 ? -rubberband(-raw, ref.current?.offsetHeight ?? 1) : raw)
      d.hist = [...d.hist.filter((p) => e.timeStamp - p.t < 100), { t: e.timeStamp, y: e.clientY }]
    },
    onPointerUp(e: PointerEvent<HTMLElement>) {
      const d = s.drag
      if (d?.id !== e.pointerId) return
      s.drag = undefined
      // Velocity over the last 100ms; a finger that stopped before lifting throws nothing, nor does a cancel.
      const recent = d.hist.filter((p) => e.timeStamp - p.t < 100)
      const [a, b] = [recent[0], recent.at(-1)]
      const v = e.type !== 'pointercancel' && a && b && b.t > a.t ? ((b.y - a.y) / (b.t - a.t)) * 1000 : 0
      const end = s.y + project(v)
      const near = DETENTS.reduce((x, k) => (Math.abs(offset(k) - end) < Math.abs(offset(x) - end) ? k : x))
      go(near, v)
    },
  }

  return { ref, full, toggle: () => go(s.to === 'full' ? 'fold' : 'full'), grab: { ...grab, onPointerCancel: grab.onPointerUp } }
}
