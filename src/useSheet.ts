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
type Drag = { id: number; at: Detent; from: number; start: number; hist: Sample[]; moved: boolean; tap: boolean }
/** A touch not yet known to be a sheet drag or a content scroll. */
type Touch = { id: number; y: number; t: number; tap: boolean }
type State = { y: number; fold: number; to: Detent; raf: number; was: boolean; drag?: Drag; touch?: Touch; onDismiss?: () => void }
/** Moves under this many px still count as a tap. */
const SLOP = 4

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

  const toggle = () => go(s.to === 'full' ? 'fold' : 'full')

  // One drag, fed by touch (whole sheet) or mouse (grabber only). `tap`: started on the grabber,
  // so a press that doesn't move toggles, like iOS.
  const begin = (id: number, y: number, t: number, tap: boolean) => {
    cancelAnimationFrame(s.raf) // a sheet in flight stops under the finger
    s.raf = 0
    s.drag = { id, at: s.to, from: s.y, start: y, hist: [{ t, y }], moved: false, tap }
  }
  const move = (y: number, t: number) => {
    const d = s.drag
    if (!d) return
    const raw = d.from + y - d.start
    // Up past full resists; down past folded follows 1:1 towards dismissing.
    set(raw < 0 ? -rubberband(-raw, ref.current?.offsetHeight ?? 1) : raw)
    d.hist = [...d.hist.filter((p) => t - p.t < 100), { t, y }]
    d.moved ||= Math.abs(y - d.start) > SLOP
  }
  const release = (t: number, cancel: boolean) => {
    const d = s.drag
    if (!d) return
    s.drag = undefined
    if (!d.moved) return d.tap && !cancel ? toggle() : go(s.to)
    // Velocity over the last 100ms; a finger that stopped before lifting throws nothing, nor does a cancel.
    const recent = d.hist.filter((p) => t - p.t < 100)
    const [a, b] = [recent[0], recent.at(-1)]
    const v = !cancel && a && b && b.t > a.t ? ((b.y - a.y) / (b.t - a.t)) * 1000 : 0
    // Nearest detent to where the flick would land, one step at most: a hard flick from full folds, not dismisses.
    const end = s.y + project(v)
    const from = DETENTS.indexOf(d.at)
    const near = DETENTS.filter((_, i) => Math.abs(i - from) <= 1)
    go(near.reduce((x, k) => (Math.abs(offset(k) - end) < Math.abs(offset(x) - end) ? k : x)), v)
  }

  // Touch: anywhere on the sheet. A full sheet with content to scroll only drags when pulled
  // down from scroll top; otherwise the content scrolls. Decided on the first move, the only
  // one whose default (native scroll) can still be prevented.
  useLayoutEffect(() => {
    const el = ref.current
    if (!on || !el) return
    const find = (e: TouchEvent) => [...e.changedTouches].find((x) => x.identifier === s.touch?.id)
    const onStart = (e: TouchEvent) => {
      const f = e.touches[0]
      const at = e.target instanceof Element ? e.target : null
      s.touch = undefined
      if (e.touches.length !== 1 || !f || !phone() || at?.closest('input')) return
      const tap = !!at?.closest('.props-title') && !at.closest('button')
      s.touch = { id: f.identifier, y: f.clientY, t: e.timeStamp, tap }
      if (s.raf) begin(f.identifier, f.clientY, e.timeStamp, false)
    }
    const onMove = (e: TouchEvent) => {
      const p = s.touch
      const f = find(e)
      if (!p || !f) return
      if (!s.drag) {
        const scrolls = s.to === 'full' && el.scrollHeight > el.clientHeight
        if (scrolls && !p.tap && !(el.scrollTop <= 0 && f.clientY > p.y)) {
          s.touch = undefined // the content scrolls this one
          return
        }
        begin(p.id, p.y, p.t, p.tap)
      }
      if (e.cancelable) e.preventDefault()
      move(f.clientY, e.timeStamp)
    }
    const onEnd = (e: TouchEvent) => {
      const p = s.touch
      if (!p || !find(e)) return
      s.touch = undefined
      if (s.drag) release(e.timeStamp, e.type === 'touchcancel')
      else if (p.tap && e.type === 'touchend') toggle()
    }
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd)
    el.addEventListener('touchcancel', onEnd)
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
    }
  }, [on, s])

  // Mouse/pen: the grabber only (touch is handled above).
  const grab = {
    onPointerDown(e: PointerEvent<HTMLElement>) {
      const onButton = e.target instanceof Element && e.target.closest('button')
      if (!on || !phone() || e.pointerType === 'touch' || e.button !== 0 || onButton) return
      begin(e.pointerId, e.clientY, e.timeStamp, true)
      // No mouse compat events: else, once the sheet slides off the press point, the browser
      // starts a native drag of the tree row now under it and cancels this pointer.
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    onPointerMove(e: PointerEvent<HTMLElement>) {
      if (e.pointerType !== 'touch' && s.drag?.id === e.pointerId) move(e.clientY, e.timeStamp)
    },
    onPointerUp(e: PointerEvent<HTMLElement>) {
      if (e.pointerType !== 'touch' && s.drag?.id === e.pointerId) release(e.timeStamp, e.type === 'pointercancel')
    },
  }

  return { ref, full, toggle, grab: { ...grab, onPointerCancel: grab.onPointerUp } }
}
