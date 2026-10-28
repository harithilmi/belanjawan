import { useEffect, useState } from 'react'
import { Dialog } from './Dialog.tsx'
import type { Plan } from './plan.ts'
import { planImage, planText } from './share.ts'
import { t } from './i18n.ts'

const FILE = 'malaysias-disk-plan.png'

export function ShareDialog({ plan, onClose }: { plan: Plan; onClose: () => void }) {
  const [blob, setBlob] = useState<Blob>()
  const [url, setUrl] = useState<string>()
  const [msg, setMsg] = useState('')
  const text = planText(plan)

  useEffect(() => {
    let u: string | undefined
    planImage(plan).then((b) => {
      u = URL.createObjectURL(b)
      setBlob(b)
      setUrl(u)
    }, () => setMsg(t.drawFailed))
    return () => { if (u) URL.revokeObjectURL(u) }
  }, [plan])

  const file = blob && new File([blob], FILE, { type: 'image/png' })
  const canShare = !!file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })

  const run = (label: string, f: () => Promise<unknown>) =>
    f().then(() => setMsg(label), (e: unknown) => setMsg(e instanceof Error && e.name === 'AbortError' ? '' : t.failed))

  return (
    <Dialog title={t.shareTitle} onClose={onClose}>
      {() => (
        <>
          <div className="sunken preview">{url ? <img src={url} alt={t.imageAlt} /> : t.drawing}</div>
          <div className="btns">
            {canShare && file && (
              <button type="button" className="btn" onClick={() => run('', () => navigator.share({ files: [file], text }))}>
                {t.shareBtn}
              </button>
            )}
            <button
              type="button"
              className="btn"
              disabled={!blob}
              onClick={() => blob && run(t.imageCopied, () => navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]))}
            >
              {t.copyImage}
            </button>
            {url && <a className="btn" href={url} download={FILE}>{t.download}</a>}
            <button type="button" className="btn" onClick={() => run(t.textCopied, () => navigator.clipboard.writeText(text))}>
              {t.copyText}
            </button>
            <span className="muted" role="status">{msg}</span>
          </div>
          <details>
            <summary>{t.showText}</summary>
            <pre className="sunken">{text}</pre>
        </details>
        </>
      )}
    </Dialog>
  )
}
