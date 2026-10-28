import { type KeyboardEvent } from 'react'
import { fmt, inBillions, lineById, lines, ministries, ministryKey, nodeOf, ROOT, sectorKey, sectors, sum, type Line } from './data.ts'
import { isCut, keepOf, nowOf, statusOf, type Plan } from './plan.ts'
import { FileIcon, FolderIcon, LockIcon } from './Icons.tsx'
import { t } from './i18n.ts'

export type Open = ReadonlySet<string>

type Props = {
  plan: Plan
  open: Open
  setOpen: (f: (o: Open) => Open) => void
  selected: string
  onSelect: (key: string) => void
  onShrink: (key: string) => void
  onDelete: (key: string) => void
}

/** Open folders so rows down to `level` show: 0 = root only, 1 = sectors, 2 = ministries, 3 = programmes. */
export function openToLevel(level: 0 | 1 | 2 | 3): Open {
  return new Set([
    ...(level >= 1 ? [ROOT] : []),
    ...(level >= 2 ? sectors.map(sectorKey) : []),
    ...(level >= 3 ? ministries.map(ministryKey) : []),
  ])
}

/** Open the folders above a key, so a row picked elsewhere (e.g. the map) is visible. */
export function reveal(open: Open, key: string): Open {
  const node = nodeOf(key)
  const m = node.kind === 'line' ? ministries.find((x) => x.code === node.line.code) : node.kind === 'ministry' ? node.ministry : undefined
  const s = m ? sectors.find((x) => x.ministries.includes(m)) : node.kind === 'sector' ? node.sector : undefined
  const above = [ROOT, ...(s ? [sectorKey(s)] : []), ...(m && node.kind === 'line' ? [ministryKey(m)] : [])]
  return above.every((k) => open.has(k)) ? open : new Set([...open, ...above])
}

const totalOf = (items: readonly Line[]) => sum(items.map((l) => l.total))
// Bars are scaled against the biggest original size at each level, so cuts shrink them live.
const MAX = [
  totalOf(lines),
  Math.max(...sectors.map((s) => totalOf(s.lines))),
  Math.max(...ministries.map((m) => totalOf(m.lines))),
  Math.max(...lines.map((l) => l.total)),
]
export const rowId = (key: string) => `row-${key.replace(/[^a-z0-9-]/gi, '_')}`
const alive = (plan: Plan, items: readonly Line[]) => items.some((l) => statusOf(plan, l) !== 'deleted')

/** Size bar: width = current size / biggest at this level, filled with the opex/devex split. */
function SizeBar({ items, plan, max }: { items: readonly Line[]; plan: Plan; max: number }) {
  const opex = sum(items.map((l) => (l.opex * keepOf(plan, l)) / 100))
  const devex = sum(items.map((l) => (l.devex * keepOf(plan, l)) / 100))
  return (
    <span className="bar-col">
      <span className="split" style={{ width: `max(3px, ${((opex + devex) / max) * 100}%)` }} title={`${t.opex} ${fmt(opex)} · ${t.devex} ${fmt(devex)}`}>
        <i className="op" style={{ flex: opex }} />
        <i className="dv" style={{ flex: devex }} />
      </span>
    </span>
  )
}

export function Tree({ plan, open, setOpen, selected, onSelect, onShrink, onDelete }: Props) {
  const toggle = (k: string, force?: boolean) =>
    setOpen((o) => {
      const n = new Set(o)
      if (force ?? !n.has(k)) n.add(k)
      else n.delete(k)
      return n
    })

  // Visible rows in order, for keyboard navigation and rendering.
  type Row = { key: string; level: number; label: string; code?: string; items: readonly Line[] }
  const rows: Row[] = [{ key: ROOT, level: 0, label: t.root, items: lines }]
  if (open.has(ROOT))
    for (const s of sectors.filter((x) => alive(plan, x.lines))) {
      rows.push({ key: sectorKey(s), level: 1, label: s.name, items: s.lines })
      if (!open.has(sectorKey(s))) continue
      for (const m of s.ministries.filter((x) => alive(plan, x.lines))) {
        rows.push({ key: ministryKey(m), level: 2, label: m.name, code: m.code, items: m.lines })
        if (open.has(ministryKey(m)))
          for (const l of m.lines.filter((x) => statusOf(plan, x) !== 'deleted'))
            rows.push({ key: l.id, level: 3, label: l.name, items: [l] })
      }
    }
  const keys = rows.map((r) => r.key)

  function onKeyDown(e: KeyboardEvent) {
    const i = keys.indexOf(selected)
    const folder = !lineById.has(selected)
    const go = (k: string | undefined) => k && onSelect(k)
    if (e.key === 'ArrowDown') go(keys[i + 1])
    else if (e.key === 'ArrowUp') go(keys[i - 1])
    else if (e.key === 'ArrowRight' && folder) toggle(selected, true)
    else if (e.key === 'ArrowLeft' && folder) toggle(selected, false)
    else if (e.key === 'Enter' && folder) toggle(selected)
    else if (e.key === 'Delete' || e.key === 'Backspace') onDelete(selected)
    else if (e.key === '-') onShrink(selected)
    else return
    e.preventDefault()
  }

  const row = ({ key, level, label, code, items }: Row) => {
    const folder = level < 3
    const before = totalOf(items)
    const now = sum(items.map((l) => nowOf(plan, l)))
    const locked = items.every((l) => l.locked)
    const isSel = key === selected
    return (
      <div
        key={key}
        id={rowId(key)}
        role="treeitem"
        aria-level={level + 1}
        aria-selected={isSel}
        aria-expanded={folder ? open.has(key) : undefined}
        className={`row${isSel ? ' sel' : ''}`}
        draggable={key !== ROOT && !locked}
        onDragStart={(e) => e.dataTransfer.setData('text/plain', key)}
        onClick={() => onSelect(key)}
        onDoubleClick={folder ? () => toggle(key) : undefined}
      >
        {/* Size stays in a fixed column (like Explorer's details view); only the name side is indented. */}
        <span className="amt" title={fmt(now)}>{inBillions(now)}</span>
        <span
          className="tw"
          style={{ marginLeft: `calc(${level} * var(--indent))` }}
          onClick={(e) => { e.stopPropagation(); toggle(key) }}
          onDoubleClick={(e) => e.stopPropagation()} // its two clicks already toggled; don't add a third
        >
          {folder ? (open.has(key) ? '−' : '+') : ''}
        </span>
        {folder ? <FolderIcon open={open.has(key)} /> : <FileIcon />}
        {/* Maksud code goes in the tooltip (and the Properties title), so long names get the room. */}
        <span className="name" title={code ? `${code} ${label}` : label}>{label}</span>
        {locked && <span title={t.tip.locked}><LockIcon /></span>}
        {isCut(plan, items) && <span className="freed" title={t.tip.freed}>−{inBillions(before - now)}</span>}
        <span className="grow" />
        {isSel && key !== ROOT && !locked && (
          <span className="acts">
            <button type="button" className="btn tiny" onClick={(e) => { e.stopPropagation(); onShrink(key) }} aria-label={t.shrinkAria(label)} title={t.tip.shrink10}>−10%</button>
            <button type="button" className="btn tiny" onClick={(e) => { e.stopPropagation(); onDelete(key) }} aria-label={t.delAria(label)} title={t.tip.toBin}>{t.del}</button>
          </span>
        )}
        <SizeBar items={items} plan={plan} max={MAX[level] ?? 1} />
      </div>
    )
  }

  return (
    <div className="tree-box sunken">
      <div className="tree-head" aria-hidden="true">
        <span className="h-amt" title={t.tip.size}>{t.colSize}</span>
        <span className="grow">{t.colName}</span>
        <span className="bar-col">
          <span title={t.tip.opex}><i className="sw op" /> {t.opexShort}</span> <span title={t.tip.devex}><i className="sw dv" /> {t.devexShort}</span>
        </span>
      </div>
      <div
        className="tree"
        role="tree"
        aria-label={t.spending}
        tabIndex={0}
        aria-activedescendant={rowId(selected)}
        onKeyDown={onKeyDown}
      >
        {rows.map(row)}
      </div>
    </div>
  )
}
