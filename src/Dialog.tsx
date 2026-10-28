import { useEffect, useId, useRef, type MouseEvent, type ReactNode } from 'react'

/** macOS-style window on a native modal <dialog> (gives Esc, focus trap and backdrop for free). */
export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: (close: () => void) => ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  const id = useId()
  const close = () => ref.current?.close()
  // Backdrop clicks land on the <dialog> itself, outside its box. Both press and release must be outside,
  // so a text selection dragged out of the window doesn't close it.
  const downOutside = useRef(false)
  const outside = (e: MouseEvent<HTMLDialogElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom
  }
  useEffect(() => {
    if (!ref.current?.open) ref.current?.showModal()
  }, [])
  return (
    <dialog
      ref={ref}
      className="window dialog"
      onClose={onClose}
      aria-labelledby={id}
      onMouseDown={(e) => { downOutside.current = outside(e) }}
      onClick={(e) => { if (downOutside.current && outside(e)) close() }}
    >
      <div className="titlebar">
        <span className="tb-btns"><button type="button" className="light" aria-label="Close" onClick={close} /></span>
        <span id={id}>{title}</span>
      </div>
      <div className="dialog-body">{children(close)}</div>
    </dialog>
  )
}
