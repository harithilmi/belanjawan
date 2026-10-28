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
          {/* One labelled blue button (share sheet on phones, else copy image); the rest are icon-only, named by tooltip. */}
          <div className="share-acts">
            {canShare && file && (
              <button type="button" className="btn default" onClick={() => run('', () => navigator.share({ files: [file], text }))}>
                <ShareIcon /> {t.shareBtn}
              </button>
            )}
            <button
              type="button"
              className={canShare ? 'btn fill icon' : 'btn default'}
              disabled={!blob}
              aria-label={t.copyImage}
              title={t.copyImage}
              onClick={() => blob && run(t.imageCopied, () => navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]))}
            >
              <CopyIcon /> {!canShare && t.copyImage}
            </button>
            {url && <a className="btn fill icon" href={url} download={name} aria-label={t.download} title={t.download}><DownloadIcon /></a>}
            <button type="button" className="btn fill icon" aria-label={t.copyText} title={t.copyText} onClick={() => run(t.textCopied, () => navigator.clipboard.writeText(text))}>
              <TextIcon />
            </button>
          </div>
          <p className="muted small share-msg" role="status">{msg}</p>
        </>
      )}
    </Dialog>
  )
}
