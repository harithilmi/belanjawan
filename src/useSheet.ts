import { useLayoutEffect, useRef, useState } from 'react'

const phone = () => matchMedia('(max-width: 800px)').matches
const behavior = (): ScrollBehavior => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth')

/**
 * Phone bottom sheet driven by native scrolling, so drag, momentum and snapping run on the
 * browser's compositor instead of JS. `ref` is a fixed full-screen scroller (CSS) holding a
 * spacer and the sheet; scroll snap gives three detents: gone (scrollTop 0, then `onDismiss`),
 * folded (title, amount and buttons show) and full (sheet bottom at screen bottom).
 */
export function useSheet(on: boolean, onDismiss: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLElement>(null)
  const [full, setFull] = useState(false)
  const s = useRef({ shown: 0, onDismiss }).current
  s.onDismiss = onDismiss

  // Folded detent = everything down to the buttons. Re-measured on every render and resize.
  useLayoutEffect(() => {
    const el = ref.current
    const sheet = panel.current
    if (!on || !el || !sheet) return
    const measure = () => {
      const end = sheet.querySelector('.btns, .locked-note')
      if (!end) return
      const pad = parseFloat(getComputedStyle(sheet).paddingBottom)
      s.shown = Math.ceil(end.getBoundingClientRect().bottom - sheet.getBoundingClientRect().top + sheet.scrollTop + pad)
      el.style.setProperty('--shown', `${s.shown}px`)
      el.closest<HTMLElement>('.desktop')?.style.setProperty('--fold', `${s.shown}px`)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(sheet)
    return () => ro.disconnect()
  })

  // Arriving: straight to folded (iOS ignores a smooth scrollTo here); the rise is a CSS animation.
  useLayoutEffect(() => {
    const el = ref.current
    if (!on || !el || !phone()) return
    el.scrollTop = s.shown
    setFull(false)
  }, [on, s])

  // Once a scroll settles: swiped to the bottom detent dismisses, the top one unlocks content scrolling.
  useLayoutEffect(() => {
    const el = ref.current
    if (!on || !el) return
    let timer = 0
    const settle = () => {
      const max = el.scrollHeight - el.clientHeight
      if (el.scrollTop < 2) return s.onDismiss()
      const top = el.scrollTop >= max - 2
      setFull(top)
      if (!top) panel.current?.scrollTo({ top: 0 })
    }
    // No scrollend (older Safari): settle once scroll events stop.
    const native = 'onscrollend' in window
    const onScroll = () => {
      // Unlock content scrolling the moment the top is reached, not after the snap settles.
      if (el.scrollTop >= el.scrollHeight - el.clientHeight - 2) setFull(true)
      if (native) return
      clearTimeout(timer)
      timer = window.setTimeout(settle, 150)
    }
    el.addEventListener('scroll', onScroll)
    if (native) el.addEventListener('scrollend', settle)
    return () => {
      clearTimeout(timer)
      el.removeEventListener('scroll', onScroll)
      el.removeEventListener('scrollend', settle)
    }
  }, [on, s])

  const toggle = () => {
    const el = ref.current
    if (!el) return
    el.scrollTo({ top: full ? s.shown : el.scrollHeight - el.clientHeight, behavior: behavior() })
  }

  // Down to the gone detent; settling there dismisses.
  const close = () => ref.current?.scrollTo({ top: 0, behavior: behavior() })

  return { ref, panel, full, toggle, close }
}
