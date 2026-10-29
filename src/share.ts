import { BASE, fmt, sectors, REVENUE, SPENDING, sum, YEAR } from './data.ts'
import { changes, nowOf, totals, type Plan } from './plan.ts'
import { t } from './i18n.ts'

export const SITE = location.origin + BASE

const describe = (keep: number) => (keep === 0 ? t.deleted : t.shrunkBy(100 - keep))

/** Most cuts in a group that are still listed one by one; bigger groups become one row. */
const GROUP_MIN = 4

/**
 * Card rows, biggest saving first. Files cut by the same share are merged into one row once
 * there are GROUP_MIN of them, so a folder-wide trim reads as "221 files −10%", not 221 rows.
 */
function cutRows(plan: Plan) {
  const byKeep = new Map<number, ReturnType<typeof changes>>()
  for (const c of changes(plan)) {
    const group = byKeep.get(c.keep)
    if (group) group.push(c)
    else byKeep.set(c.keep, [c])
  }
  return [...byKeep].flatMap(([keep, cs]) =>
    cs.length < GROUP_MIN
      ? cs.map((c) => ({ name: c.line.name, tag: describe(keep), sub: c.line.ministry, freed: c.freed, files: 1 }))
      : [{
          name: t.cutGroup(cs.length, keep),
          tag: '',
          // changes() is sorted, so these are the group's biggest
          sub: `${cs.slice(0, 3).map((c) => c.line.name).join(', ')}…`,
          freed: sum(cs.map((c) => c.freed)),
          files: cs.length,
        }],
  ).sort((a, b) => b.freed - a.freed)
}
type Row = ReturnType<typeof cutRows>[number]

/** "+N more" line under the list: counts files, not rows. */
const moreText = (rest: readonly Row[]) => t.moreCuts(sum(rest.map((r) => r.files)), fmt(sum(rest.map((r) => r.freed))))

/** Share caption: two short lines, the card carries the detail. */
export function planText(plan: Plan): string {
  const tot = totals(plan)
  const head = tot.cut > 0
    ? `${t.textCut(fmt(tot.cut), YEAR)} ${tot.gap > 0 ? t.textShort(fmt(tot.gap)) : t.textBalanced}`
    : t.textNone
  return `${head}\n${t.textUrl(SITE)}`
}

/** URL as printed on the cards: no protocol, no trailing slash. */
const SHORT_SITE = SITE.replace(/^https?:\/\//, '').replace(/\/$/, '')

export type Format = 'story' | 'wide'
export const SIZES = { story: { w: 1080, h: 1920 }, wide: { w: 1200, h: 675 } } as const satisfies Record<Format, { w: number; h: number }>

const C = { text: '#1d1d1f', muted: '#6e6e73', blue: '#007aff', good: '#248a3d', bad: '#d70015', win: '#ececec', soft: '#f5f5f7', line: '#d1d1d6' }

/** Canvas plus the macOS drawing helpers both cards share. */
function canvas(W: number, H: number) {
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')
  if (!g) throw new Error('Canvas not supported')
  const font = (px: number, bold = false) => `${bold ? 700 : 400} ${px}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`
  const text = (s: string, x: number, y: number, px: number, color = C.text, bold = false, align: CanvasTextAlign = 'left') => {
    g.font = font(px, bold)
    g.fillStyle = color
    g.textAlign = align
    g.fillText(s, x, y)
  }
  /** Trim with "…" until it fits maxW at this font. */
  const fit = (s: string, maxW: number, px: number, bold = false) => {
    g.font = font(px, bold)
    if (g.measureText(s).width <= maxW) return s
    let t = s
    while (t.length > 1 && g.measureText(`${t}…`).width > maxW) t = t.slice(0, -1)
    return `${t.trimEnd()}…`
  }
  const box = (x: number, y: number, w: number, h: number, r: number, fill: string, stroke?: string) => {
    g.beginPath()
    g.roundRect(x, y, w, h, r)
    g.fillStyle = fill
    g.fill()
    if (stroke) {
      g.strokeStyle = stroke
      g.lineWidth = 1.5
      g.stroke()
    }
  }
  /** Pastel wash, same as the site's page background. */
  const wallpaper = () => {
    const bg = g.createLinearGradient(0, 0, W, H)
    bg.addColorStop(0, '#dfe7f5')
    bg.addColorStop(1, '#f3e9f2')
    g.fillStyle = bg
    g.fillRect(0, 0, W, H)
  }
  /** Grey window with traffic lights and a centred title. Returns the y where content starts. */
  const macWindow = (x: number, y: number, w: number, h: number, title: string, px: number) => {
    g.save()
    g.shadowColor = 'rgb(0 0 0 / 0.18)'
    g.shadowBlur = px * 2
    g.shadowOffsetY = px * 0.6
    box(x, y, w, h, px * 0.9, C.win)
    g.restore()
    const bh = px * 2.4
    ;['#ff5f57', '#febc2e', '#28c840'].forEach((col, i) => {
      g.beginPath()
      g.arc(x + px * 1.2 + i * px * 1.05, y + bh / 2, px * 0.38, 0, Math.PI * 2)
      g.fillStyle = col
      g.fill()
    })
    text(title, x + w / 2, y + bh / 2 + px * 0.36, px, '#4d4d4d', true, 'center')
    return y + bh
  }
  const button = (x: number, y: number, w: number, h: number, label: string, px: number, primary = false) => {
    box(x, y, w, h, h * 0.24, primary ? C.blue : '#fff', primary ? undefined : C.line)
    text(label, x + w / 2, y + h / 2 + px * 0.36, px, primary ? '#fff' : C.text, primary, 'center')
  }
  const disk = (x: number, y: number, w: number, h: number, spending: number, gap: number) => {
    const s = w / Math.max(SPENDING, REVENUE)
    g.save()
    g.beginPath()
    g.roundRect(x, y, w, h, h * 0.3)
    g.clip()
    g.fillStyle = '#e5e5ea'
    g.fillRect(x, y, w, h)
    g.fillStyle = C.blue
    g.fillRect(x, y, Math.min(spending, REVENUE) * s, h)
    if (gap > 0) {
      const bx = x + REVENUE * s
      g.beginPath()
      g.rect(bx, y, gap * s, h)
      g.clip()
      g.fillStyle = '#ff9f9a'
      g.fillRect(bx, y, gap * s, h)
      g.fillStyle = '#ff3b30'
      for (let sx = bx - h; sx < bx + gap * s; sx += 14) {
        g.beginPath()
        g.moveTo(sx, y + h); g.lineTo(sx + h, y); g.lineTo(sx + h + 7, y); g.lineTo(sx + 7, y + h)
        g.fill()
      }
    }
    g.restore()
    g.fillStyle = C.text
    g.fillRect(x + REVENUE * s - 1.5, y - 5, 3, h + 10)
  }
  const blob = () => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/png'))
  return { g, text, fit, box, wallpaper, macWindow, button, disk, blob }
}

/** Share card: a tall macOS "Storage" window for stories, or the wide summary for X/WhatsApp. */
export function planImage(plan: Plan, format: Format): Promise<Blob> {
  try {
    return format === 'story' ? story(plan) : wide(plan)
  } catch (e) {
    return Promise.reject(e)
  }
}

/** 1080×1920. Keeps clear of the top/bottom ~250px that Instagram covers with its own UI. */
function story(plan: Plan): Promise<Blob> {
  const { w: W, h: H } = SIZES.story
  const k = canvas(W, H)
  const { g, text, fit, box } = k
  const tot = totals(plan)
  const cuts = changes(plan)
  const rows = cutRows(plan)
  const shown = rows.slice(0, 6)
  const rest = rows.slice(shown.length)

  // Measure first so the window can be centred in the safe area.
  const ROW = 76
  const listH = 20 + Math.max(1, shown.length) * ROW + (rest.length ? 56 : 0)
  const winH = 56 + 300 + listH + 280
  const x = 60
  const w = W - 120
  // Block = headline (110) + window + URL lines (150), centred between IG's top and bottom UI.
  const y = Math.max(360, Math.round((H - winH - 260) / 2) + 110)

  k.wallpaper()
  text(t.title, W / 2, y - 48, 60, C.text, true, 'center')
  const top = k.macWindow(x, y, w, winH, t.window, 30)

  // White content box inside the grey window, like the Storage pane.
  const px = x + 44
  const pw = w - 88
  box(x + 20, top, w - 40, winH - (top - y) - 20, 22, '#fff')
  text(t.freedUp, px, top + 72, 38, C.muted)
  text(fmt(tot.cut), px, top + 186, 108, C.text, true)
  text(t.toDelete(cuts.length), px, top + 252, 32, C.muted)

  // List: blue check, programme (ministry under it), amount freed
  const ly = top + 280
  box(px, ly, pw, listH, 20, C.soft)
  if (shown.length === 0) text(t.nothingYet, px + 24, ly + 64, 32, C.muted)
  shown.forEach((row, i) => {
    const ry = ly + 10 + i * ROW
    const amt = `−${fmt(row.freed)}`
    g.font = '700 32px -apple-system, BlinkMacSystemFont, sans-serif'
    const amtW = g.measureText(amt).width
    box(px + 20, ry + 14, 32, 32, 8, C.blue)
    text('✓', px + 36, ry + 40, 24, '#fff', true, 'center')
    const nameW = pw - 90 - amtW - 50
    text(fit(row.name, nameW, 32, true), px + 70, ry + 40, 32, C.text, true)
    text(fit(row.tag ? `${row.sub} · ${row.tag}` : row.sub, nameW, 22), px + 70, ry + 66, 22, C.muted)
    text(amt, px + pw - 20, ry + 40, 32, C.good, true, 'right')
  })
  if (rest.length) {
    const ry = ly + 10 + shown.length * ROW
    g.fillStyle = C.line
    g.fillRect(px + 20, ry + 4, pw - 40, 2)
    text(moreText(rest), px + 20, ry + 40, 26, C.muted)
  }

  const dy = ly + listH + 40
  k.disk(px, dy, pw, 40, tot.spending, tot.gap)
  text(
    tot.gap > 0 ? `⚠ ${t.stillOver(fmt(tot.gap))}` : `✔ ${t.fits(fmt(-tot.gap))}`,
    px, dy + 98, 34, tot.gap > 0 ? C.bad : C.good, true,
  )
  const by = dy + 136
  k.button(px + pw - 470, by, 270, 70, t.tryIt, 30, true)
  k.button(px + pw - 180, by, 180, 70, t.cancel, 30)

  text(SHORT_SITE, W / 2, y + winH + 76, 40, C.text, true, 'center')
  text(t.storyFoot(YEAR), W / 2, y + winH + 124, 26, C.muted, false, 'center')
  return k.blob()
}

/** 1200×675 (16:9), the size X and WhatsApp show uncropped. */
function wide(plan: Plan): Promise<Blob> {
  const { w: W, h: H } = SIZES.wide
  const k = canvas(W, H)
  const { g, text, fit, box } = k
  const tot = totals(plan)

  k.wallpaper()
  k.macWindow(24, 24, W - 48, H - 48, `${t.title} — ${t.window}`, 18)

  // Headline
  text(t.myPlanCuts(fmt(tot.cut)), 56, 116, 40, C.text, true)
  text(tot.gap > 0 ? `⚠ ${t.stillOver(fmt(tot.gap))}` : `✔ ${t.fits(fmt(-tot.gap))}`, 56, 150, 22, tot.gap > 0 ? C.bad : C.good, true)

  const bx = 56
  const bw = W - 112
  k.disk(bx, 172, bw, 26, tot.spending, tot.gap)
  text(`${t.spending} ${fmt(tot.spending)}  ·  ${t.borrowed} ${fmt(Math.max(0, tot.gap))}`, bx, 228, 17, C.muted)
  text(`${t.revenue} ${fmt(REVENUE)}`, bx + bw, 228, 17, C.muted, false, 'right')

  // Two white boxes: biggest cuts (left), what is left by sector (right)
  const py = 254
  const ph = 340
  const panel = (x: number, w: number, title: string) => {
    box(x, py, w, ph, 14, '#fff')
    text(title, x + 16, py + 32, 19, C.text, true)
  }

  const lx = 56
  const lw = 520
  panel(lx, lw, t.whatICut)
  const cutList = cutRows(plan)
  const shown = cutList.slice(0, 7)
  const rest = cutList.slice(shown.length)
  if (shown.length === 0) text(t.nothingYet, lx + 16, py + 70, 18, C.muted)
  shown.forEach((row, i) => {
    // Two lines per row: programme + how much, then its ministry (names like "Pengurusan" repeat),
    // or for a group, its biggest files.
    const y = py + 66 + i * 36
    const amt = `−${fmt(row.freed)}`
    g.font = '700 18px -apple-system, BlinkMacSystemFont, sans-serif'
    const room = lw - 48 - g.measureText(amt).width
    const name = fit(row.name, row.tag ? room - 60 : room, 17, true)
    text(name, lx + 16, y, 17, C.text, true)
    if (row.tag) text(row.tag, lx + 16 + g.measureText(name).width + 10, y, 14, C.muted)
    text(fit(row.sub, room, 13), lx + 16, y + 15, 13, C.muted)
    text(amt, lx + lw - 16, y, 18, C.good, true, 'right')
  })
  if (rest.length) text(moreText(rest), lx + 16, py + ph - 14, 15, C.muted)

  const rx = 600
  const rw = W - 56 - rx
  panel(rx, rw, t.byGroup)
  const rows = sectors.map((s) => ({ name: s.name, before: sum(s.lines.map((l) => l.total)), now: sum(s.lines.map((l) => nowOf(plan, l))) }))
  const max = Math.max(...rows.map((r) => r.before))
  const barW = rw - 32
  rows.forEach((r, i) => {
    const y = py + 66 + i * 52
    text(r.name, rx + 16, y, 16, C.text, true)
    text(fmt(r.now), rx + rw - 16, y, 16, C.muted, false, 'right')
    const nowW = (r.now / max) * barW
    const cutW = ((r.before - r.now) / max) * barW
    box(rx + 16, y + 8, Math.max(nowW, 2), 14, 4, C.blue)
    if (cutW > 0) {
      g.strokeStyle = C.good
      g.lineWidth = 1.5
      g.setLineDash([4, 3])
      g.beginPath()
      g.roundRect(rx + 16 + nowW + 2, y + 8.5, Math.max(cutW - 3, 1), 13, 4)
      g.stroke()
      g.setLineDash([])
    }
  })

  text(t.footer(YEAR, SHORT_SITE), 56, H - 46, 15, C.muted)
  return k.blob()
}
