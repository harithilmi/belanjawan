import { useEffect, useState } from 'react'
import { Dialog } from './Dialog.tsx'
import type { Plan } from './plan.ts'
import { planImage, planText, SIZES, type Format } from './share.ts'
import { t } from './i18n.ts'

const FORMATS = ['story', 'wide'] as const satisfies readonly Format[]

export function ShareDialog({ plan, onClose }: { plan: Plan; onClose: () => void }) {
  // Story first: most shares come from phones.
  const [format, setFormat] = useState<Format>('story')
  // The card remembers its format, so switching tabs never shows the old image at the new size.
  const [card, setCard] = useState<{ format: Format; blob: Blob; url: string }>()
  const [msg, setMsg] = useState('')
  const text = planText(plan)

  useEffect(() => {
    let u: string | undefined
    planImage(plan, format).then((blob) => {
      u = URL.createObjectURL(blob)
      setCard({ format, blob, url: u })
    }, () => setMsg(t.drawFailed))
    return () => { if (u) URL.revokeObjectURL(u) }
  }, [plan, format])

  const ready = card?.format === format ? card : undefined
  const blob = ready?.blob
  const url = ready?.url

  const name = `malaysias-disk-${format}.png`
  const file = blob && new File([blob], name, { type: 'image/png' })
  const canShare = !!file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })

  const run = (label: string, f: () => Promise<unknown>) =>
    f().then(() => setMsg(label), (e: unknown) => setMsg(e instanceof Error && e.name === 'AbortError' ? '' : t.failed))

  return (
    <Dialog title={t.shareTitle} onClose={onClose}>
      {() => (
        <>
          <div className="btns tabs" role="group" aria-label={t.shareTitle}>
            {FORMATS.map((f) => (
              <button type="button" key={f} className="btn" aria-pressed={f === format} onClick={() => setFormat(f)}>
                {f === 'story' ? t.formatStory : t.formatWide}
              </button>
            ))}
          </div>
          <div className="sunken preview">
            {url ? <img src={url} alt={t.imageAlt} width={SIZES[format].w} height={SIZES[format].h} /> : t.drawing}
          </div>
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
            {url && <a className="btn" href={url} download={name}>{t.download}</a>}
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
