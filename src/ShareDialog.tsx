import { useEffect, useState } from 'react'
import { Dialog } from './Dialog.tsx'
import type { Plan } from './plan.ts'
import { planImage, planText, SIZES, type Format } from './share.ts'
import { t } from './i18n.ts'
import { CopyIcon, DownloadIcon, ShareIcon, TextIcon } from './Icons.tsx'

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
          <div className="share-seg">
            <span className="seg" role="group" aria-label={t.shareTitle}>
              {FORMATS.map((f) => (
                <button type="button" key={f} aria-pressed={f === format} onClick={() => setFormat(f)}>
                  {f === 'story' ? t.formatStory : t.formatWide}
                </button>
              ))}
            </span>
          </div>
          <div className="sunken preview">
            {url ? <img src={url} alt={t.imageAlt} width={SIZES[format].w} height={SIZES[format].h} /> : t.drawing}
          </div>
          {/* One blue button: the system share sheet on phones, else copying the image. */}
          <div className="share-acts">
            {canShare && file && (
              <button type="button" className="btn default" onClick={() => run('', () => navigator.share({ files: [file], text }))}>
                <ShareIcon /> {t.shareBtn}
              </button>
            )}
            <button
              type="button"
              className={canShare ? 'btn fill' : 'btn default'}
              disabled={!blob}
              onClick={() => blob && run(t.imageCopied, () => navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]))}
            >
              <CopyIcon /> {t.copyImage}
            </button>
            {url && <a className="btn fill" href={url} download={name}><DownloadIcon /> {t.download}</a>}
            <button type="button" className="btn fill" onClick={() => run(t.textCopied, () => navigator.clipboard.writeText(text))}>
              <TextIcon /> {t.copyText}
            </button>
          </div>
          <p className="muted small share-msg" role="status">{msg}</p>
          <details className="disclosure">
            <summary>{t.showText}</summary>
            <pre className="sunken">{text}</pre>
          </details>
        </>
      )}
    </Dialog>
  )
}
