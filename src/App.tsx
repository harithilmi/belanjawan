import { useState } from 'react'
import { flushSync } from 'react-dom'
import { fmt, lines, linesOf, nodeOf, REVENUE, revenueGroups, ROOT, SPENDING, YEAR } from './data.ts'
import { remove, shrink10, totals, usePlan } from './plan.ts'
import { switchLang, t } from './i18n.ts'
import { DriveIcon } from './Icons.tsx'
import { openToLevel, reveal, rowId, Tree, type Open } from './Tree.tsx'
import { Properties, RecycleBin } from './Side.tsx'
import { MapView } from './MapView.tsx'
import { ShareDialog } from './ShareDialog.tsx'
import { Dialog } from './Dialog.tsx'
import { Search } from './Search.tsx'

const SOURCE_URL = 'https://belanjawan.mof.gov.my/pdf/belanjawan2027/hasil/tinjauan_fiskal_2027.pdf'
const BOOK_URL = 'https://belanjawan.mof.gov.my/ms/perbelanjaan'
const LEVELS = [1, 2, 3] as const
const SEEN_KEY = 'malaysias-disk.seen-how-to'

/** Line whose original size is closest to the amount still to find. */
const closestLine = (gap: number) =>
  lines.reduce((a, b) => (Math.abs(b.total - gap) < Math.abs(a.total - gap) ? b : a))

function HowToPlay({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title={t.howTo} onClose={onClose}>
      {(close) => (
        <div className="howto">
          <p className="howto-goal">{t.howGoal(fmt(SPENDING - REVENUE))}</p>
          <p className="muted">{t.howSub(fmt(SPENDING), fmt(REVENUE))}</p>
          <ul>
            {t.howSteps.map((s) => (
              <li key={s.bold}><span className="howto-ic" aria-hidden="true">{s.icon}</span><b>{s.bold}</b> {s.text}</li>
            ))}
          </ul>
          <p className="muted small">{t.howFoot}</p>
          <div className="btns end">
            <button type="button" className="btn default" autoFocus onClick={close}>{t.start}</button>
          </div>
        </div>
      )}
    </Dialog>
  )
}

export function App() {
  const [plan, setPlan] = usePlan()
  const [selected, setSelected] = useState(ROOT)
  const [open, setOpen] = useState<Open>(() => openToLevel(1))
  // Last view picked in the segmented control; folders toggled by hand don't change it.
  const [level, setLevel] = useState<(typeof LEVELS)[number]>(1)
  /** Select from the map: open its folders, then scroll the row into view. */
  const pick = (key: string) => {
    // flushSync so the row exists in the DOM before we scroll to it.
    flushSync(() => {
      setSelected(key)
      setOpen((o) => reveal(o, key))
    })
    const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches
    document.getElementById(rowId(key))?.scrollIntoView({ block: 'nearest', behavior: smooth ? 'smooth' : 'auto' })
  }
  const [dialog, setDialog] = useState<'share' | 'howto' | null>(() => (localStorage.getItem(SEEN_KEY) ? null : 'howto'))
  const tot = totals(plan)

  const act = (key: string, f: typeof shrink10) => {
    const node = nodeOf(key)
    if (node.kind !== 'root') setPlan((p) => f(p, linesOf(node)))
  }
  const onDelete = (key: string) => {
    act(key, remove)
    if (nodeOf(key).kind === 'line') setSelected(ROOT)
  }
  const closeDialog = () => {
    if (dialog === 'howto') localStorage.setItem(SEEN_KEY, '1')
    setDialog(null)
  }

  // Disk bar scale: the bigger of capacity and original usage.
  const scale = (n: number) => `${(n / Math.max(SPENDING, REVENUE)) * 100}%`
  const eq = tot.gap > 0 ? closestLine(tot.gap) : undefined

  return (
    <main className="desktop">
      <header className="hero">
        <div className="hero-top">
          <h1>{t.title}</h1>
          <span className="btns">
            <button type="button" className="btn fill" onClick={() => setDialog('howto')}>{t.howTo}</button>
            <button type="button" className="btn fill" onClick={switchLang}>{t.otherLang}</button>
          </span>
        </div>
        <p>{t.intro(fmt(SPENDING), fmt(REVENUE), YEAR)}</p>
      </header>

      <div className="window">
        <div className="titlebar">
          <span className="tb-btns" aria-hidden="true"><i className="light" /><i className="light" /><i className="light" /></span>
          <span>{t.window}</span>
        </div>

        <section className="drive" aria-label={t.drive}>
          <div className="drive-head">
            <DriveIcon />
            <div>
              <b>{t.drive}</b>
              <div className="muted">
                {eq ? t.roughly(eq.name, fmt(eq.total)) : <b className="good">{t.balanced(((tot.cut / SPENDING) * 100).toFixed(1))}</b>}
              </div>
            </div>
            <div className={tot.gap > 0 ? 'warn' : 'ok'} role="status">
              {tot.gap > 0 ? `⚠ ${t.over(fmt(tot.gap))}` : `✔ ${t.fits(fmt(-tot.gap))}`}
            </div>
            <button type="button" className="btn default" title={t.tip.share} onClick={() => setDialog('share')}>{t.share}</button>
          </div>

          <div className="disk sunken" title={t.capacity(YEAR)} role="img" aria-label={`${t.spending} ${fmt(tot.spending)} · ${t.revenue} ${fmt(REVENUE)}`}>
            <div className="used" style={{ width: scale(Math.min(tot.spending, REVENUE)) }} />
            {tot.gap > 0 && <div className="borrowed" style={{ left: scale(REVENUE), width: scale(tot.gap) }} />}
            <div className="cap" style={{ left: scale(REVENUE) }} />
          </div>

          <div className="legend">
            <span><i className="sw used" /> {t.spending} <b>{fmt(tot.spending)}</b></span>
            <span title={t.tip.borrowed}><i className="sw borrowed" /> {t.borrowed}</span>
            <span title={t.tip.cutSoFar}>{t.cutSoFar} <b className="good">{fmt(tot.cut)}</b></span>
            <span className="grow" />
            <span title={t.tip.revenue}>{t.revenue} ⟶ <b>{fmt(REVENUE)}</b></span>
          </div>
        </section>

        <div className="body">
          <div className="main-col">
            <div className="levels">
              <span className="seg" role="group" aria-label={t.show}>
                {LEVELS.map((n) => (
                  <button
                    type="button"
                    key={n}
                    aria-pressed={n === level}
                    title={t.tip.levels[n - 1]}
                    onClick={() => { setLevel(n); setOpen(() => openToLevel(n)) }}
                  >
                    {t.levelNames[n - 1]}
                  </button>
                ))}
              </span>
              <Search plan={plan} onPick={pick} />
            </div>
            <Tree
              plan={plan}
              open={open}
              setOpen={setOpen}
              selected={selected}
              onSelect={setSelected}
              onShrink={(k) => act(k, shrink10)}
              onDelete={onDelete}
            />
          </div>
          <div className="side">
            {/* Map first: panels below it change height, and a tile must not move after you click it. */}
            <MapView plan={plan} selected={selected} onSelect={pick} />
            <RecycleBin plan={plan} setPlan={setPlan} onDrop={onDelete} />
            <Properties plan={plan} setPlan={setPlan} selected={selected} />
          </div>
        </div>

        <details className="groupbox sources">
          <summary>{t.sources}</summary>
          <p>
            <b>{t.srcSource}</b> <a href={BOOK_URL} target="_blank" rel="noreferrer">{t.srcBook(YEAR)}</a>{' '}
            {t.srcRevenue} <a href={SOURCE_URL} target="_blank" rel="noreferrer">{t.srcBody(YEAR)}</a>
          </p>
          <p><b>{t.srcTree}</b> {t.srcTreeBody}</p>
          <p>
            <b>{t.srcCapacity}</b> {t.srcCapacityBody} {revenueGroups.map((g) => `${g.name} ${fmt(g.total)}`).join(', ')}.
          </p>
          <p><b>{t.srcLines}</b> {t.srcLinesBody}</p>
          <p><b>{t.srcNames}</b> {t.srcNamesBody}</p>
          <p><b>{t.srcLocked}</b> {t.srcLockedBody}</p>
        </details>

        <div className="statusbar">
          <span>{t.counts(lines.length, tot.deleted, tot.shrunk)}</span>
        </div>
      </div>

      {dialog === 'share' && <ShareDialog plan={plan} onClose={closeDialog} />}
      {dialog === 'howto' && <HowToPlay onClose={closeDialog} />}
    </main>
  )
}
