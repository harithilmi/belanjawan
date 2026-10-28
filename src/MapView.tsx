import { fmt, ministryKey, sectorKey, sectors, sum, type Line } from './data.ts'
import { isCut, nowOf, type Plan, type Status } from './plan.ts'
import { squarify, type Rect } from './squarify.ts'
import { t } from './i18n.ts'

const W = 1000
const H = 620
const HEAD = 30 // sector label strip, in map units
const pct = (r: Rect) => ({
  left: `${(r.x / W) * 100}%`,
  top: `${(r.y / H) * 100}%`,
  width: `${(r.w / W) * 100}%`,
  height: `${(r.h / H) * 100}%`,
})
const nowSum = (plan: Plan, items: readonly Line[]) => sum(items.map((l) => nowOf(plan, l)))

/** A ministry tile's colour: locked, shrunk if anything inside was cut, else untouched. */
function statusOfAll(plan: Plan, items: readonly Line[]): Exclude<Status, 'deleted'> {
  if (items.every((l) => l.locked)) return 'locked'
  return isCut(plan, items) ? 'shrunk' : 'untouched'
}

/** Treemap of what is left: sectors, then ministries inside. Deleted ministries disappear. */
export function MapView({ plan, selected, onSelect }: { plan: Plan; selected: string; onSelect: (key: string) => void }) {
  const remaining = sectors.map((s) => ({ s, now: nowSum(plan, s.lines) })).filter((x) => x.now > 0)
  const tiles = squarify(remaining, (x) => x.now, { x: 0, y: 0, w: W, h: H })

  return (
    <section className="groupbox map-box" aria-label={t.mapAria}>
      <div className="map" style={{ aspectRatio: `${W} / ${H}` }}>
        {tiles.map((st) => {
          const inner = { x: st.x, y: st.y + HEAD, w: st.w, h: Math.max(0, st.h - HEAD) }
          const mTiles = squarify(st.item.s.ministries, (m) => nowSum(plan, m.lines), inner)
          return (
            <div key={st.item.s.name}>
              <button
                type="button"
                className={`map-group${selected === sectorKey(st.item.s) ? ' sel' : ''}`}
                style={pct({ ...st, h: HEAD })}
                onClick={() => onSelect(sectorKey(st.item.s))}
              >
                {st.item.s.name}
              </button>
              {mTiles.filter((mt) => mt.w * mt.h > 0).map((mt) => {
                const m = mt.item
                const key = ministryKey(m)
                const now = nowSum(plan, m.lines)
                const status = statusOfAll(plan, m.lines)
                return (
                  <button
                    type="button"
                    key={key}
                    className={`tile ${status}${selected === key ? ' sel' : ''}`}
                    style={pct(mt)}
                    title={`${m.code} ${m.name}: ${fmt(now)}`}
                    aria-label={`${m.name}, ${fmt(now)}${status === 'locked' ? ` · ${t.status.locked}` : ''}`}
                    onClick={() => onSelect(key)}
                  >
                    {mt.w * mt.h > 9000 && mt.w > 110 && (
                      <>
                        <span>{m.name}</span>
                        <b>{fmt(now)}</b>
                      </>
                    )}
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>
      <div className="legend">
        <span><i className="sw untouched" /> {t.status.untouched}</span>
        <span><i className="sw shrunk" /> {t.status.shrunk}</span>
        <span><i className="sw locked" /> {t.status.locked}</span>
        <span className="muted">{t.mapGone}</span>
      </div>
    </section>
  )
}
