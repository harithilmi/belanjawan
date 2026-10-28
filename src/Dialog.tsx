import { useEffect, useId, useRef, type MouseEvent, type ReactNode } from 'react'
import { BinIcon } from './Icons.tsx'
import { t } from './i18n.ts'

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

/** macOS alert: icon, bold question, one line of detail, Cancel | action. The action is the default button
    (Return), Esc cancels, and clicking outside does nothing, as in Finder's "Empty Trash?". */
export function ConfirmDialog({ title, message, action, onConfirm, onClose }: {
  title: string
  message: string
  action: string
  onConfirm: () => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const go = useRef<HTMLButtonElement>(null)
  const id = useId()
  const close = () => ref.current?.close()
  useEffect(() => {
    if (!ref.current?.open) ref.current?.showModal()
    go.current?.focus() // showModal focuses the first button (Cancel); React's autoFocus runs before it
  }, [])
  return (
    <dialog ref={ref} className="alert" onClose={onClose} aria-labelledby={`${id}t`} aria-describedby={`${id}m`}>
      <BinIcon full />
      <h2 id={`${id}t`}>{title}</h2>
      <p id={`${id}m`}>{message}</p>
      <div className="alert-btns">
        <button type="button" className="btn" onClick={close}>{t.cancel}</button>
        <button ref={go} type="button" className="btn default" onClick={() => { onConfirm(); close() }}>{action}</button>
      </div>
    </dialog>
  )
}
