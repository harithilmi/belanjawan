import { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { cwdFor, fmt, lines, linesOf, nameOf, nodeOf, REVENUE, revenueGroups, ROOT, SPENDING, sum, YEAR } from './data.ts'
import { nowOf, remove, shrink10, totals, usePlan } from './plan.ts'
import { switchLang, t } from './i18n.ts'
import { CheckCircleIcon, DriveIcon, LockSymIcon, ShareIcon, TapIcon, TrashIcon, WarnIcon } from './Icons.tsx'
import { liveCwd, PathBar, reveal, revealRow, Tree, type Open } from './Tree.tsx'
import { Properties, RecycleBin } from './Side.tsx'
import { MapView } from './MapView.tsx'
import { ShareDialog } from './ShareDialog.tsx'
import { ConfirmDialog, Dialog } from './Dialog.tsx'
import { Search } from './Search.tsx'

const SOURCE_URL = 'https://belanjawan.mof.gov.my/pdf/belanjawan2027/hasil/tinjauan_fiskal_2027.pdf'
const BOOK_URL = 'https://belanjawan.mof.gov.my/ms/perbelanjaan'
const SEEN_KEY = 'malaysias-disk.seen-how-to'
const ME_URL = 'https://x.com/harithilmi'
const INSPIRATION_URL = 'https://britains-disk.pages.dev'
const INSPIRATION_BY_URL = 'https://x.com/SAshworthHayes'

/** Line whose original size is closest to the amount still to find. */
const closestLine = (gap: number) =>
  lines.reduce((a, b) => (Math.abs(b.total - gap) < Math.abs(a.total - gap) ? b : a))

/** Same order as `t.howSteps`. */
const STEP_ICONS = [<TapIcon />, <TrashIcon />, <LockSymIcon />]

function HowToPlay({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title={t.howTo} onClose={onClose}>
      {(close) => (
        <div className="howto">
          <p className="howto-goal">{t.howGoal(fmt(SPENDING - REVENUE))}</p>
          <p className="muted">{t.howSub(fmt(SPENDING), fmt(REVENUE))}</p>
          <ul>
            {t.howSteps.map((s, i) => (
              <li key={s.bold}><span className="howto-ic">{STEP_ICONS[i]}</span><span><b>{s.bold}</b> {s.text}</span></li>
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

// ⌘ on Apple keyboards, Ctrl elsewhere (the handlers accept both).
const MOD = /Mac|iP(hone|ad)/.test(navigator.userAgent) ? '⌘' : 'Ctrl '

function Shortcuts({ onClose }: { onClose: () => void }) {
  const rows: [keys: string[], what: string][] = [
    [['↑', '↓'], t.keys.move],
    [['→', '←', 'Enter'], t.keys.fold],
    [['⌥→', '⌥←'], t.keys.foldAll],
    [[`${MOD}↓`, t.dblClick], t.keys.enter],
    [[`${MOD}↑`], t.keys.up],
    [[t.letters], t.keys.type],
    [['Space'], t.keys.look],
    [['−'], t.keys.shrink],
    [['Delete'], t.keys.del],
    [[`${MOD}Z`], t.keys.undo],
    [[`${MOD}⇧Z`], t.keys.redo],
    [['/'], t.keys.search],
    [['?'], t.keys.help],
  ]
  return (
    <Dialog title={t.keysTitle} onClose={onClose}>
      {() => (
        <dl className="keys">
          {rows.map(([keys, what]) => (
            <div key={what}>
              <dt>{keys.map((k) => <kbd key={k}>{k}</kbd>)}</dt>
              <dd>{what}</dd>
            </div>
          ))}
        </dl>
      )}
    </Dialog>
  )
}

export function App() {
  const [plan, setPlan, undo, redo] = usePlan()
  const [selected, setSelected] = useState(ROOT)
  const [open, setOpen] = useState<Open>(() => new Set())
  // Entered folder. Deleting everything in it shows the nearest folder above instead.
  const [entered, setEntered] = useState(ROOT)
  const cwd = liveCwd(plan, entered)
  const enter = (key: string, select = key) => {
    setEntered(key)
    setSelected(select)
  }
  /** Select from the map or search: step out of the entered folder if needed, open its folders, then scroll the row into view. */
  const pick = (key: string) => {
    // flushSync so the row exists in the DOM before we scroll to it.
    flushSync(() => {
      setSelected(key)
      setEntered(cwdFor(cwd, key))
      setOpen((o) => reveal(o, key))
    })
    const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches
    const go = () => revealRow(key, smooth ? 'smooth' : 'auto')
    // Picked from search on a phone: leave the box so the sheet (hidden while searching) comes back.
    const input = document.activeElement
    if (!(input instanceof HTMLInputElement) || !matchMedia('(max-width: 800px)').matches) return go()
    input.blur()
    // Touch keyboard closing: scroll once the screen is full size again.
    const vv = window.visualViewport
    if (!vv || !matchMedia('(pointer: coarse)').matches) return go()
    let timer = 0
    const once = () => {
      clearTimeout(timer)
      vv.removeEventListener('resize', once)
      go()
    }
    vv.addEventListener('resize', once)
    timer = window.setTimeout(once, 600)
  }
  const [dialog, setDialog] = useState<'share' | 'howto' | 'look' | 'keys' | null>(() => (localStorage.getItem(SEEN_KEY) ? null : 'howto'))
  const tot = totals(plan)

  const act = (key: string, f: typeof shrink10) => {
    const node = nodeOf(key)
    if (node.kind !== 'root') setPlan((p) => f(p, linesOf(node)))
  }
  // A line goes straight to the Bin (one tap restores it). A whole folder asks first.
  const [deleting, setDeleting] = useState<string | null>(null)
  const del = (key: string) => {
    act(key, remove)
    if (nodeOf(key).kind === 'line') setSelected(cwd)
  }
  const onDelete = (key: string) => (nodeOf(key).kind === 'line' ? del(key) : setDeleting(key))
  const doomed = deleting === null ? [] : linesOf(nodeOf(deleting)).filter((l) => !l.locked && nowOf(plan, l) > 0)
  // Page-wide keys, skipped while typing in a text box: ⌘Z / ⌘⇧Z undo and redo, / jumps to search
  // (⌘F stays the browser's Find), ? lists every shortcut (like YouTube and X).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLTextAreaElement || (e.target instanceof HTMLInputElement && e.target.type !== 'range')
      if (typing) return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') (e.shiftKey ? redo : undo)()
      else if (e.key === '/' && !dialog) document.querySelector<HTMLInputElement>('.search input')?.focus()
      else if (e.key === '?' && !dialog) setDialog('keys')
      else if (e.key === 'Escape' && !dialog && !deleting) setSelected(ROOT) // also closes the phone sheet
      else return
      e.preventDefault()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })
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
        <p className="byline">
          {t.by} <a href={ME_URL} target="_blank" rel="noreferrer">@harithilmi</a> · {t.inspiredBy}{' '}
          <a href={INSPIRATION_URL} target="_blank" rel="noreferrer">Britain's Disk Is Full</a>{' '}
          (<a href={INSPIRATION_BY_URL} target="_blank" rel="noreferrer">@SAshworthHayes</a>)
        </p>
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
              {tot.gap > 0 ? <><WarnIcon /> {t.over(fmt(tot.gap))}</> : <><CheckCircleIcon /> {t.fits(fmt(-tot.gap))}</>}
            </div>
            <button type="button" className="btn default" title={t.tip.share} onClick={() => setDialog('share')}><ShareIcon /> {t.share}</button>
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
            <div className="toolbar">
              <PathBar cwd={cwd} selected={selected} onGo={enter} />
              <Search plan={plan} onPick={pick} />
            </div>
            <Tree
              plan={plan}
              cwd={cwd}
              open={open}
              setOpen={setOpen}
              selected={selected}
              onSelect={setSelected}
              onEnter={enter}
              onLook={() => setDialog('look')}
              onShrink={(k) => act(k, shrink10)}
              onDelete={onDelete}
            />
          </div>
          <div className="side">
            {/* Info first, in view. Its height is fixed on desktop, so map tiles don't move after a click. */}
            <Properties plan={plan} setPlan={setPlan} selected={selected} onDelete={onDelete} onDismiss={() => setSelected(ROOT)} />
            <MapView plan={plan} cwd={cwd} selected={selected} onSelect={pick} />
            <RecycleBin plan={plan} setPlan={setPlan} onDrop={onDelete} />
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
          <span className="grow" />
          <button type="button" className="keys-hint" onClick={() => setDialog('keys')}><kbd>?</kbd> {t.keysHint}</button>
        </div>
      </div>

      {deleting !== null && (
        <ConfirmDialog
          title={t.delTitle(nameOf(nodeOf(deleting)))}
          message={t.delAsk(doomed.length, fmt(sum(doomed.map((l) => nowOf(plan, l)))))}
          action={t.delAction}
          onConfirm={() => del(deleting)}
          onClose={() => setDeleting(null)}
        />
      )}
      {dialog === 'share' && <ShareDialog plan={plan} onClose={closeDialog} />}
      {dialog === 'howto' && <HowToPlay onClose={closeDialog} />}
      {dialog === 'keys' && <Shortcuts onClose={closeDialog} />}
      {dialog === 'look' && (
        <Dialog title={t.props} onClose={closeDialog}>
          {() => <Properties plan={plan} setPlan={setPlan} selected={selected} onDelete={onDelete} look />}
        </Dialog>
      )}
    </main>
  )
}
