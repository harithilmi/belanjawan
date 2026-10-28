import { useEffect, useId, useRef, type ReactNode } from 'react'

/** Win98 window on a native modal <dialog> (gives Esc, focus trap and backdrop for free). */
export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: (close: () => void) => ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  const id = useId()
  const close = () => ref.current?.close()
  useEffect(() => {
    if (!ref.current?.open) ref.current?.showModal()
  }, [])
  return (
    <dialog ref={ref} className="window dialog" onClose={onClose} aria-labelledby={id}>
      <div className="titlebar">
        <span id={id}>{title}</span>
        <button type="button" className="btn tb" aria-label="Close" onClick={close}>×</button>
      </div>
      <div className="dialog-body">{children(close)}</div>
    </dialog>
  )
}
