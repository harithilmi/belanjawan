import { Suspense, use, useState } from 'react'
import { activitiesIn, fmt, linesOf, nodeOf, REVENUE, SPENDING, sum, YEAR, type Line } from './data.ts'
import { changes, isCut, keepOf, nowOf, setKeep, shrink10, statusOf, totals, type Plan } from './plan.ts'
import { ConfirmDialog } from './Dialog.tsx'
import { BinIcon, ChevronIcon, CutIcon, LockIcon, PeopleIcon, SparklesIcon, TrashIcon, UndoIcon } from './Icons.tsx'
import { LANG, t } from './i18n.ts'
import { useSheet } from './useSheet.ts'

type SetPlan = (f: (p: Plan) => Plan) => void

export function RecycleBin({ plan, setPlan, onDrop }: { plan: Plan; setPlan: SetPlan; onDrop: (key: string) => void }) {
  const [over, setOver] = useState(false)
  const [asking, setAsking] = useState(false)
  const list = changes(plan)
  const freed = sum(list.map((c) => c.freed))
  return (
    <section
      className={`bin groupbox${over ? ' over' : ''}`}
      aria-label={t.bin}
      onDragOver={(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); onDrop(e.dataTransfer.getData('text/plain')) }}
    >
      <div className="bin-head">
        <BinIcon full={list.length > 0} />
        <div>
          <b>{t.bin}</b>
          <div className="muted">
            {list.length === 0
              ? t.binEmpty
              : t.binSummary(list.filter((c) => c.keep === 0).length, list.filter((c) => c.keep > 0).length, fmt(freed))}
          </div>
        </div>
        <button type="button" className="btn fill" disabled={list.length === 0} title={t.tip.restoreAll} onClick={() => setAsking(true)}>
          {t.restoreAll}
        </button>
      </div>
      {asking && (
        <ConfirmDialog
          title={t.restoreAllTitle}
          message={t.restoreAllAsk(list.length, fmt(freed))}
          action={t.restoreAll}
          onConfirm={() => setPlan(() => ({}))}
          onClose={() => setAsking(false)}
        />
      )}
      {list.length > 0 && (
        <ul className="bin-list sunken">
          {list.map(({ line, keep, freed }) => (
            <li key={line.id}>
              <span>{keep === 0 ? '🗑' : '✂'}</span>
              <span className="name" title={`${line.name}\n${line.ministry}`}>
                {line.name} <span className="muted">{keep === 0 ? t.deleted : t.shrunkBy(100 - keep)}</span>
                <small className="muted">{line.ministry}</small>
              </span>
              <span className="good">{fmt(freed)}</span>
              <button type="button" className="btn tiny plain" title={t.tip.restore} onClick={() => setPlan((p) => setKeep(p, [line], () => 100))}>
                {t.restore}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Share → "12.3", "0.04", "<0.01", "0": more decimals only where they matter. */
const pct = (share: number) => {
  const x = share * 100
  return x >= 1 ? x.toFixed(1) : x >= 0.01 ? x.toFixed(2) : x > 0 ? '<0.01' : '0'
}

/** Objek Am in display order (biggest kinds first), as indexes into Line.objek. */
const OBJEK_ORDER = [0, 1, 3, 2, 4]
/** Whole percent, for the money legend. */
const pctOf = (x: number, total: number) => `${Math.round((x / total) * 100)}%`

/** Where the money goes, by Objek Am, plus development spending. Book amounts, so it holds still as you cut. */
function Breakdown({ items }: { items: readonly Line[] }) {
  const objek = OBJEK_ORDER.map((i) => ({ i, rm: sum(items.map((l) => l.objek[i] ?? 0)) })).filter((o) => o.rm >= 0.5) // fmt shows RM0 below that
  const opex = sum(items.map((l) => l.opex))
  const devex = sum(items.map((l) => l.devex))
  const total = opex + devex || 1
  const posts = sum(items.map((l) => l.posts))
  return (
    <div className="breakdown">
      <h4>{t.whereMoney}</h4>
      <div className="split big">
        {objek.map((o) => <i key={o.i} className={`ob${o.i}`} style={{ flex: o.rm }} />)}
        <i className="dv" style={{ flex: devex }} />
      </div>
      <dl className="money">
        {opex > 0 && (
          <>
            <div title={t.tip.opex}>
              <dt>{t.opex}</dt><dd><b>{fmt(opex)}</b></dd><dd>{pctOf(opex, total)}</dd>
            </div>
            {objek.map((o) => (
              <div key={o.i} className="sub" title={t.objekTip[o.i]}>
                <dt><i className={`sw ob${o.i}`} /><span>{t.objek[o.i]}</span></dt><dd>{fmt(o.rm)}</dd><dd>{pctOf(o.rm, total)}</dd>
              </div>
            ))}
          </>
        )}
        {devex > 0 && (
          <div title={t.tip.devex}>
            <dt><i className="sw dv" /><span>{t.devex}</span></dt><dd><b>{fmt(devex)}</b></dd><dd>{pctOf(devex, total)}</dd>
          </div>
        )}
      </dl>
      {posts > 0 && (
        <p className="posts" title={t.postsTip}>
          <PeopleIcon /> <b>{posts.toLocaleString(LANG === 'ms' ? 'ms-MY' : 'en-MY')}</b> {t.posts}
        </p>
      )}
      <p className="muted small" title={t.srcBook(YEAR)}>{t.fromBook}</p>
    </div>
  )
}

const TOP = 5
// Mostly Fungsi text, so it is its own chunk, fetched now (after first paint) rather than in the main bundle.
// If it fails (offline), the panel just shows no activities.
const activitiesOf = import('../budget-2027-activities.json')
  .then((m) => activitiesIn(m.default))
  .catch(() => activitiesIn({}))

/** The line's activities, top few first; each opens to its Fungsi from the book. */
function Activities({ line }: { line: Line }) {
  const acts = use(activitiesOf)(line)
  const [all, setAll] = useState(false)
  if (acts.length === 0) return null
  return (
    <div className="acts-list">
      <h4>{t.topActs}</h4>
      <ul>
        {(all ? acts : acts.slice(0, TOP)).map((a, i) => {
          const row = <><span>{a.name}</span><b>{fmt(a.rm)}</b></>
          return (
            <li key={i}>
              {a.fungsi ? (
                <details>
                  <summary>{row}</summary>
                  <p><b>{t.fungsi}:</b> {a.fungsi}</p>
                </details>
              ) : <div className="act">{row}</div>}
            </li>
          )
        })}
      </ul>
      {acts.length > TOP && (
        <button type="button" className="btn plain" aria-expanded={all} onClick={() => setAll((x) => !x)}>
          {all ? t.fewerActs : t.moreActs(acts.length - TOP)}
        </button>
      )}
    </div>
  )
}

/** `look`: shown in the Quick Look window, so never docked as the phone sheet. */
export function Properties({ plan, setPlan, selected, onDelete, onDismiss = () => {}, look = false }: {
  plan: Plan
  setPlan: SetPlan
  selected: string
  /** Asks first for folders (App). */
  onDelete: (key: string) => void
  /** Phone sheet swiped away. */
  onDismiss?: () => void
  look?: boolean
}) {
  const node = nodeOf(selected)
  const items = linesOf(node)
  const before = sum(items.map((l) => l.total))
  const now = sum(items.map((l) => nowOf(plan, l)))
  const tot = totals(plan)
  const plain = node.kind === 'line' ? node.line.plain : node.kind === 'ministry' ? node.ministry.plain : undefined
  const title =
    node.kind === 'line' ? node.line.name
    : node.kind === 'ministry' ? `${node.ministry.code} ${node.ministry.name}`
    : node.kind === 'sector' ? node.sector.name
    : t.root
  // On narrow screens a selected row's Properties docks to the bottom (CSS), folded to amount + buttons.
  const sheet = !look && node.kind !== 'root'
  const { ref, full, toggle, grab } = useSheet(sheet, onDismiss)

  return (
    <section ref={ref} className={`props groupbox${sheet ? ' sheet' : ''}${full ? ' full' : ''}${look ? ' look' : ''}`} aria-label={t.props}>
      <div className="props-title" {...grab}>
        <span>{title}</span>
        {sheet && (
          <button type="button" className="btn tb sheet-toggle" aria-expanded={full} aria-label={t.props} onClick={toggle}>
            <ChevronIcon up={!full} />
          </button>
        )}
      </div>
      <div className="muted caps">
        {node.kind === 'root' ? t.rootCaps(YEAR) : `${node.kind === 'line' ? `${node.line.code} ${node.line.ministry}` : t.folder} · ${YEAR}`}
      </div>
      <div className="props-amt">
        <b>{fmt(now)}</b>
        {isCut(plan, items) && <> <s className="muted">{fmt(before)}</s> <span className="good">{t.cut} {fmt(before - now)}</span></>}
        {node.kind === 'line' && <span className="muted"> · {t.status[statusOf(plan, node.line)]}</span>}
      </div>
      {node.kind !== 'root' && (
        <p className="share">{t.ofSpending(pct(now / tot.spending))}</p>
      )}
      {node.kind === 'root' ? (
        <p>{t.rootText((((SPENDING - REVENUE) / SPENDING) * 100).toFixed(1))}</p>
      ) : items.every((l) => l.locked) ? (
        <p className="locked-note">
          <LockIcon /> {items.every((l) => l.code === 'T.13') ? t.lockedDebt : t.lockedOther}
        </p>
      ) : (
        <Controls items={items} plan={plan} setPlan={setPlan} onDelete={() => onDelete(selected)} />
      )}

      {/* Desktop: fixed-height panel, so only this part scrolls and the page never jumps. Keyed: new row, back to top. */}
      <div className="props-body" key={selected}>
        {plain && (
          <div className="plain-box">
            <h4 title={t.aiTip}><SparklesIcon /> {t.plainTitle} <small>· AI</small></h4>
            <p>{plain}</p>
          </div>
        )}
        {node.kind === 'line' && t.inside[node.line.name] && <p className="note">ℹ️ {t.inside[node.line.name]}</p>}
        <Breakdown items={items} />
        {node.kind === 'line' && (
          <Suspense fallback={null}>
            <Activities key={node.line.id} line={node.line} />
          </Suspense>
        )}
      </div>
    </section>
  )
}

function Controls({ items, plan, setPlan, onDelete }: { items: readonly Line[]; plan: Plan; setPlan: SetPlan; onDelete: () => void }) {
  const editable = items.filter((l) => !l.locked)
  const one = editable.length === 1 ? editable[0] : undefined
  const keep = one ? keepOf(plan, one) : undefined
  return (
    <div className="controls">
      {one && keep !== undefined && (
        <label className="slider">
          {t.keep}
          <input
            type="range"
            min={0}
            max={100}
            value={keep}
            onChange={(e) => setPlan((p) => setKeep(p, [one], () => Number(e.target.value)))}
          />
          <b>{keep}%</b>
        </label>
      )}
      <div className="btns">
        <button type="button" className="btn tint" title={t.tip.shrink10} onClick={() => setPlan((p) => shrink10(p, editable))}>
          <CutIcon /> {t.shrink10}
        </button>
        {/* Phone sheet shows these two as icons only (CSS), so the label is also the accessible name. */}
        <button type="button" className="btn tint danger" title={t.tip.toBin} aria-label={t.toBin} onClick={onDelete}>
          <TrashIcon /> <span className="lbl">{t.toBin}</span>
        </button>
        <button
          type="button"
          className="btn fill"
          title={t.tip.restore}
          aria-label={t.restore}
          disabled={editable.every((l) => keepOf(plan, l) === 100)}
          onClick={() => setPlan((p) => setKeep(p, editable, () => 100))}
        >
          <UndoIcon /> <span className="lbl">{t.restore}</span>
        </button>
      </div>
      {!one && <p className="muted">{t.folderNote}</p>}
    </div>
  )
}
