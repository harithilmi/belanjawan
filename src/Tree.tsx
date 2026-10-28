import { Fragment, type KeyboardEvent, useLayoutEffect, useMemo, useRef } from 'react'
import { ancestors, fmt, inBillions, lineById, linesOf, ministryKey, nameOf, nodeOf, ROOT, sectorKey, sectors, sum, type Line } from './data.ts'
import { isCut, keepOf, nowOf, statusOf, type Plan } from './plan.ts'
import { EnterIcon, FileIcon, FolderIcon, LockIcon } from './Icons.tsx'
import { t } from './i18n.ts'

export type Open = ReadonlySet<string>

type Props = {
  plan: Plan
  /** Entered folder: the tree lists only what is inside it. */
  cwd: string
  open: Open
  setOpen: (f: (o: Open) => Open) => void
  selected: string
  onSelect: (key: string) => void
  /** Go into a folder (or up to one); `select` is the row to select there, the folder itself by default. */
  onEnter: (key: string, select?: string) => void
  /** Quick Look (Space): everything about a row, in a window. */
  onLook: (key: string) => void
  onShrink: (key: string) => void
  onDelete: (key: string) => void
}

type Item = { key: string; label: string; code?: string; items: readonly Line[] }

/** What a folder holds, one level down. */
function childrenOf(key: string): Item[] {
  const n = nodeOf(key)
  switch (n.kind) {
    case 'root': return sectors.map((s) => ({ key: sectorKey(s), label: s.name, items: s.lines }))
    case 'sector': return n.sector.ministries.map((m) => ({ key: ministryKey(m), label: m.name, code: m.code, items: m.lines }))
    case 'ministry': return n.ministry.lines.map((l) => ({ key: l.id, label: l.name, items: [l] }))
    case 'line': return []
  }
}

/** Open the folders above a key, so a row picked elsewhere (e.g. the map) is visible. */
export function reveal(open: Open, key: string): Open {
  const above = ancestors(key)
  return above.every((k) => open.has(k)) ? open : new Set([...open, ...above])
}

/** A folder and every folder inside it. */
const foldersIn = (key: string): string[] => [
  key,
  ...childrenOf(key).filter((c) => !lineById.has(c.key)).flatMap((c) => foldersIn(c.key)),
]

const totalOf = (items: readonly Line[]) => sum(items.map((l) => l.total))
const alive = (plan: Plan, items: readonly Line[]) => items.some((l) => statusOf(plan, l) !== 'deleted')

/** The entered folder, or the nearest one above it that still has something in it. */
export const liveCwd = (plan: Plan, cwd: string): string =>
  cwd === ROOT || alive(plan, linesOf(nodeOf(cwd))) ? cwd : liveCwd(plan, ancestors(cwd).at(-1) ?? ROOT)

/** Biggest original size at each depth inside a folder. Bars use it, so cuts shrink them live
 *  and an entered folder's rows fill the column instead of looking tiny next to the whole budget. */
function maxByDepth(cwd: string): number[] {
  const max: number[] = []
  const walk = (key: string, d: number) => {
    for (const c of childrenOf(key)) {
      max[d] = Math.max(max[d] ?? 0, totalOf(c.items))
      walk(c.key, d + 1)
    }
  }
  walk(cwd, 0)
  return max
}

export const rowId = (key: string) => `row-${key.replace(/[^a-z0-9-]/gi, '_')}`

/** Scroll a row into view inside the tree box only. scrollIntoView also scrolls the page, which on phones
    moves the map (below the tree) under your finger. The sticky header covers the box's top. */
export function revealRow(key: string, behavior: ScrollBehavior = 'auto') {
  const row = document.getElementById(rowId(key))
  const box = row?.closest('.tree-box')
  if (!row || !box) return
  const r = row.getBoundingClientRect()
  const b = box.getBoundingClientRect()
  const top = b.top + (box.querySelector('.tree-head')?.getBoundingClientRect().height ?? 0)
  const by = r.top < top ? r.top - top : r.bottom > b.bottom ? r.bottom - b.bottom : 0
  if (by) box.scrollBy({ top: by, behavior })
}
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

/** Finder-style path bar: every folder from the root down to the entered one. Click one to go there. */
export function PathBar({ cwd, selected, onGo }: { cwd: string; selected: string; onGo: (key: string) => void }) {
  return (
    <nav className="path" aria-label={t.pathAria}>
      {[...ancestors(cwd), cwd].map((k, i) => {
        const label = nameOf(nodeOf(k))
        return (
          <Fragment key={k}>
            {i > 0 && <span className="sep" aria-hidden="true">›</span>}
            <button
              type="button"
              className={`crumb${k === selected ? ' sel' : ''}`}
              aria-current={k === cwd ? 'location' : undefined}
              title={label}
              onClick={() => onGo(k)}
            >
              <FolderIcon open={k === cwd} />
              <span>{label}</span>
            </button>
          </Fragment>
        )
      })}
    </nav>
  )
}

export function Tree({ plan, cwd, open, setOpen, selected, onSelect, onEnter, onLook, onShrink, onDelete }: Props) {
  const toggle = (k: string, force?: boolean) =>
    setOpen((o) => {
      const n = new Set(o)
      if (force ?? !n.has(k)) n.add(k)
      else n.delete(k)
      return n
    })

  // Visible rows in order, for keyboard navigation and rendering. Indent restarts inside the entered folder.
  type Row = Item & { level: number }
  const rows: Row[] = []
  const walk = (key: string, level: number) => {
    for (const c of childrenOf(key).filter((x) => alive(plan, x.items))) {
      rows.push({ ...c, level })
      if (open.has(c.key)) walk(c.key, level + 1)
    }
  }
  walk(cwd, 0)
  const keys = rows.map((r) => r.key)
  const max = useMemo(() => maxByDepth(cwd), [cwd])

  // New folder: start at its top, but keep the selected row (e.g. the folder you just left) in view.
  const box = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    box.current?.scrollTo({ top: 0 })
    revealRow(selected)
  }, [cwd]) // only when the folder changes, not on every selection

  // Type-to-select, like Finder: letters typed within 800ms build one prefix.
  const typed = useRef({ text: '', at: 0 })
  function typeToSelect(ch: string) {
    const now = Date.now()
    const text = (now - typed.current.at < 800 ? typed.current.text : '') + ch.toLowerCase()
    typed.current = { text, at: now }
    // Search from the row after the selected one (same letter again = next match), wrapping round.
    const from = keys.indexOf(selected) + (text.length === 1 ? 1 : 0)
    const order = [...rows.slice(from), ...rows.slice(0, from)].map((r) => ({ key: r.key, name: r.label.toLowerCase() }))
    // Name start first; else any word start, since most folders begin with "Kementerian".
    const hit = order.find((r) => r.name.startsWith(text)) ?? order.find((r) => r.name.split(/[\s(]+/).some((w) => w.startsWith(text)))
    if (hit) onSelect(hit.key)
  }

  function onKeyDown(e: KeyboardEvent) {
    const i = keys.indexOf(selected)
    const folder = !lineById.has(selected)
    const go = (k: string | undefined) => k && onSelect(k)
    const cmd = e.metaKey || e.ctrlKey
    // ⌥→ / ⌥←: open or close a folder and every folder inside it.
    const deep = (on: boolean) => setOpen((o) => {
      const all = foldersIn(selected)
      return on ? new Set([...o, ...all]) : new Set([...o].filter((k) => !all.includes(k)))
    })
    // Finder: ⌘↓ opens the selected folder, ⌘↑ goes to the one above.
    if (cmd && e.key === 'ArrowDown') { if (folder && selected !== cwd) onEnter(selected) }
    else if (cmd && e.key === 'ArrowUp') { if (cwd !== ROOT) onEnter(ancestors(cwd).at(-1) ?? ROOT, cwd) }
    else if (e.altKey && e.key === 'ArrowRight' && folder) deep(true)
    else if (e.altKey && e.key === 'ArrowLeft' && folder) deep(false)
    else if (e.key === ' ') onLook(selected)
    else if (!cmd && !e.altKey && /^[\p{L}\d]$/u.test(e.key)) typeToSelect(e.key)
    else if (e.key === 'ArrowDown') go(keys[i + 1])
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
    const folder = !lineById.has(key)
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
        draggable={!locked}
        onDragStart={(e) => e.dataTransfer.setData('text/plain', key)}
        onClick={() => onSelect(key)}
        onDoubleClick={folder ? () => onEnter(key) : undefined}
      >
        {/* Size stays in a fixed column (like Explorer's details view); only the name side is indented. */}
        <span className="amt" title={fmt(now)}>{inBillions(now)}</span>
        <span
          className={`tw${open.has(key) ? ' open' : ''}`}
          style={{ marginLeft: `calc(${level} * var(--indent))` }}
          onClick={(e) => { e.stopPropagation(); toggle(key) }}
          onDoubleClick={(e) => e.stopPropagation()} // its two clicks already toggled; don't also enter
        >
          {folder ? '›' : ''}
        </span>
        {folder ? <FolderIcon open={open.has(key)} /> : <FileIcon />}
        {/* Maksud code goes in the tooltip (and the Properties title), so long names get the room. */}
        <span className="name" title={code ? `${code} ${label}` : label}>{label}</span>
        {locked && <span title={t.tip.locked}><LockIcon /></span>}
        {isCut(plan, items) && <span className="freed" title={t.tip.freed}>−{inBillions(before - now)}</span>}
        <span className="grow" />
        {isSel && !locked && (
          <span className="acts">
            <button type="button" className="btn tiny" onClick={(e) => { e.stopPropagation(); onShrink(key) }} aria-label={t.shrinkAria(label)} title={t.tip.shrink10}>−10%</button>
            <button type="button" className="btn tiny" onClick={(e) => { e.stopPropagation(); onDelete(key) }} aria-label={t.delAria(label)} title={t.tip.toBin}>{t.del}</button>
          </span>
        )}
        {/* Phones have no double-click: the selected folder gets a button to go in. */}
        {isSel && folder && (
          <button type="button" className="enter" onClick={(e) => { e.stopPropagation(); onEnter(key) }} aria-label={t.enterAria(label)} title={t.tip.enter}>
            <EnterIcon />
          </button>
        )}
        <SizeBar items={items} plan={plan} max={max[level] ?? 1} />
      </div>
    )
  }

  return (
    <div className="tree-box sunken" ref={box}>
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
        aria-activedescendant={keys.includes(selected) ? rowId(selected) : undefined}
        onKeyDown={onKeyDown}
      >
        {rows.map(row)}
      </div>
    </div>
  )
}
