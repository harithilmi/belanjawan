import { useState } from 'react'
import { fmt, linesOf, nodeOf, REVENUE, SPENDING, sum, YEAR, type Line } from './data.ts'
import { changes, isCut, keepOf, nowOf, remove, setKeep, shrink10, statusOf, totals, type Plan } from './plan.ts'
import { BinIcon, LockIcon } from './Icons.tsx'
import { t } from './i18n.ts'

type SetPlan = (f: (p: Plan) => Plan) => void

export function RecycleBin({ plan, setPlan, onDrop }: { plan: Plan; setPlan: SetPlan; onDrop: (key: string) => void }) {
  const [over, setOver] = useState(false)
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
        <button type="button" className="btn" disabled={list.length === 0} title={t.tip.restoreAll} onClick={() => setPlan(() => ({}))}>
          {t.restoreAll}
        </button>
      </div>
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
              <button type="button" className="btn tiny" title={t.tip.restore} onClick={() => setPlan((p) => setKeep(p, [line], () => 100))}>
                {t.restore}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function SplitDetail({ items, plan }: { items: readonly Line[]; plan: Plan }) {
  const opex = sum(items.map((l) => (l.opex * keepOf(plan, l)) / 100))
  const devex = sum(items.map((l) => (l.devex * keepOf(plan, l)) / 100))
  const total = opex + devex || 1
  return (
    <div className="split-detail">
      <div className="split big">
        <i className="op" style={{ flex: opex }} />
        <i className="dv" style={{ flex: devex }} />
      </div>
      <div className="legend">
        {/* Hide a type the item never had (by original size), so pure-DE projects don't show "OE RM0 · 0%". */}
        {items.some((l) => l.opex > 0) && <span><i className="sw op" /> {t.opex} <b>{fmt(opex)}</b> · {Math.round((opex / total) * 100)}%</span>}
        {items.some((l) => l.devex > 0) && <span><i className="sw dv" /> {t.devex} <b>{fmt(devex)}</b> · {Math.round((devex / total) * 100)}%</span>}
      </div>
    </div>
  )
}

export function Properties({ plan, setPlan, selected }: { plan: Plan; setPlan: SetPlan; selected: string }) {
  const node = nodeOf(selected)
  const items = linesOf(node)
  const before = sum(items.map((l) => l.total))
  const now = sum(items.map((l) => nowOf(plan, l)))
  const tot = totals(plan)
  // Short description from the book: ministry VISI or programme Outcome.
  const about =
    node.kind === 'ministry' && node.ministry.about ? { label: t.visi, text: node.ministry.about }
    : node.kind === 'line' && node.line.about ? { label: t.outcome, text: node.line.about }
    : undefined
  const title =
    node.kind === 'line' ? node.line.name
    : node.kind === 'ministry' ? `${node.ministry.code} ${node.ministry.name}`
    : node.kind === 'sector' ? node.sector.name
    : t.root

  return (
    <section className="props groupbox" aria-label={t.props}>
      <div className="props-title">{t.props} — {title}</div>
      <div className="muted caps">
        {node.kind === 'root' ? t.rootCaps(YEAR) : `${node.kind === 'line' ? `${node.line.code} ${node.line.ministry}` : t.folder} · ${YEAR}`}
      </div>
      <div className="props-amt">
        <b>{fmt(now)}</b>
        {isCut(plan, items) && <> <s className="muted">{fmt(before)}</s> <span className="good">{t.cut} {fmt(before - now)}</span></>}
        {node.kind === 'line' && <span className="muted"> · {t.status[statusOf(plan, node.line)]}</span>}
      </div>
      {node.kind !== 'root' && (
        <p>{t.per100(((now / tot.spending) * 100).toFixed(2))}</p>
      )}
      {about && <p className="about"><b>{about.label}:</b> “{about.text}”</p>}
      {node.kind === 'line' && t.inside[node.line.name] && <p className="note">ℹ️ {t.inside[node.line.name]}</p>}

      {node.kind === 'root' ? (
        <p>{t.rootText((((SPENDING - REVENUE) / SPENDING) * 100).toFixed(1))}</p>
      ) : items.every((l) => l.locked) ? (
        <p className="locked-note">
          <LockIcon /> {items.every((l) => l.code === 'T.13') ? t.lockedDebt : t.lockedOther}
        </p>
      ) : (
        <Controls items={items} plan={plan} setPlan={setPlan} />
      )}

      <SplitDetail items={items} plan={plan} />
    </section>
  )
}

function Controls({ items, plan, setPlan }: { items: readonly Line[]; plan: Plan; setPlan: SetPlan }) {
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
        <button type="button" className="btn" title={t.tip.shrink10} onClick={() => setPlan((p) => shrink10(p, editable))}>
          {t.shrink10}
        </button>
        <button type="button" className="btn" title={t.tip.toBin} onClick={() => setPlan((p) => remove(p, editable))}>
          {t.toBin}
        </button>
        <button
          type="button"
          className="btn"
          title={t.tip.restore}
          disabled={editable.every((l) => keepOf(plan, l) === 100)}
          onClick={() => setPlan((p) => setKeep(p, editable, () => 100))}
        >
          {t.restore}
        </button>
      </div>
      {!one && <p className="muted">{t.folderNote}</p>}
    </div>
  )
}
