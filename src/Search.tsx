import { useId, useState, type KeyboardEvent } from 'react'
import { fmt, linesOf, nodeOf } from './data.ts'
import { statusOf, type Plan } from './plan.ts'
import { search } from './search.ts'
import { t } from './i18n.ts'

/** Find box over the tree. Picking a hit selects it and scrolls the tree to it. No animation: used often. */
export function Search({ plan, onPick }: { plan: Plan; onPick: (key: string) => void }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const id = useId()
  const res = search(q)
  // Deleted rows are gone from the tree, so there is nothing to scroll to.
  const hits = res.hits.filter((h) => linesOf(nodeOf(h.key)).some((l) => statusOf(plan, l) !== 'deleted'))
  const shown = open && q.trim() !== ''
  const literal = res.terms.join(' ') === q.trim().toLowerCase()

  const pick = (key: string) => {
    setOpen(false)
    onPick(key)
  }
  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') setActive((i) => Math.min(i + 1, hits.length - 1))
    else if (e.key === 'ArrowUp') setActive((i) => Math.max(i - 1, 0))
    else if (e.key === 'Enter' && hits[active]) pick(hits[active].key)
    else if (e.key === 'Escape') setOpen(false)
    else return
    e.preventDefault()
  }

  return (
    <div className="search">
      <input
        type="search"
        className="sunken"
        role="combobox"
        aria-label={t.searchAria}
        aria-expanded={shown}
        aria-controls={id}
        aria-activedescendant={shown && hits[active] ? `${id}-${active}` : undefined}
        placeholder={t.searchPh}
        value={q}
        onChange={(e) => { setQ(e.target.value); setActive(0); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      {shown && (
        <div className="hits window" id={id} role="listbox" aria-label={t.searchAria}>
          {!literal && hits.length > 0 && <div className="muted small hits-as">{t.searchAs(res.terms.join(', '))}</div>}
          {res.note && hits.length > 0 && <div className="hits-note small">{t.searchNote[res.note]}</div>}
          {hits.length === 0 && <div className="muted hits-as">{t.searchNone}</div>}
          {hits.map((h, i) => (
            <div
              key={h.key}
              id={`${id}-${i}`}
              role="option"
              aria-selected={i === active}
              className={`hit${i === active ? ' sel' : ''}`}
              title={`${h.label}\n${h.sub}`}
              onMouseDown={(e) => e.preventDefault()} // keep focus in the input, so blur doesn't close before click
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(h.key)}
            >
              <span className="hit-top"><b>{h.label}</b><span>{fmt(h.size)}</span></span>
              <small>{h.sub}</small>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
