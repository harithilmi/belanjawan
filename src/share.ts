import { fmt, sectors, REVENUE, SPENDING, sum, YEAR } from './data.ts'
import { changes, nowOf, totals, type Plan } from './plan.ts'
import { t } from './i18n.ts'

export const SITE = location.origin + location.pathname

const describe = (keep: number) => (keep === 0 ? t.deleted : t.shrunkBy(100 - keep))

/** Share caption: two short lines, the card carries the detail. */
export function planText(plan: Plan): string {
  const tot = totals(plan)
  const head = tot.cut > 0
    ? `${t.textCut(fmt(tot.cut), YEAR)} ${tot.gap > 0 ? t.textShort(fmt(tot.gap)) : t.textBalanced}`
    : t.textNone
  return `${head}\n${t.textUrl(SITE)}`
}

const STRIPE = { a: '#e00000', b: '#fff' }
/** URL as printed on the cards: no protocol, no trailing slash. */
const SHORT_SITE = SITE.replace(/^https?:\/\//, '').replace(/\/$/, '')

export type Format = 'story' | 'wide'
export const SIZES = { story: { w: 1080, h: 1920 }, wide: { w: 1200, h: 675 } } as const satisfies Record<Format, { w: number; h: number }>

/** Canvas plus the Win98 drawing helpers both cards share. */
function canvas(W: number, H: number) {
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')
  if (!g) throw new Error('Canvas not supported')
  const font = (px: number, bold = false) => `${bold ? 'bold ' : ''}${px}px Tahoma, Verdana, sans-serif`
  const text = (s: string, x: number, y: number, px: number, color = '#000', bold = false, align: CanvasTextAlign = 'left') => {
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
  const stripes = (x: number, y: number, w: number, h: number) => {
    g.save()
    g.beginPath()
    g.rect(x, y, w, h)
    g.clip()
    g.fillStyle = STRIPE.b
    g.fillRect(x, y, w, h)
    g.fillStyle = STRIPE.a
    for (let sx = x - h; sx < x + w; sx += 12) {
      g.beginPath()
      g.moveTo(sx, y + h); g.lineTo(sx + h, y); g.lineTo(sx + h + 6, y); g.lineTo(sx + 6, y + h)
      g.fill()
    }
    g.restore()
  }
  // Win98 bevel: light top-left, dark bottom-right
  const bevel = (x: number, y: number, w: number, h: number, sunken = false) => {
    g.fillStyle = sunken ? '#808080' : '#fff'
    g.fillRect(x, y, w, 2); g.fillRect(x, y, 2, h)
    g.fillStyle = sunken ? '#fff' : '#404040'
    g.fillRect(x, y + h - 2, w, 2); g.fillRect(x + w - 2, y, 2, h)
  }
  const window98 = (x: number, y: number, w: number, h: number, title: string, titlePx: number) => {
    g.fillStyle = '#c0c0c0'
    g.fillRect(x, y, w, h)
    bevel(x, y, w, h)
    const bh = Math.round(titlePx * 1.75)
    const bar = g.createLinearGradient(x, 0, x + w, 0)
    bar.addColorStop(0, '#000080')
    bar.addColorStop(1, '#1084d0')
    g.fillStyle = bar
    g.fillRect(x + 4, y + 4, w - 8, bh)
    text(title, x + 4 + titlePx * 0.6, y + 4 + bh / 2 + titlePx * 0.36, titlePx, '#fff', true)
    return y + 4 + bh
  }
  const button = (x: number, y: number, w: number, h: number, label: string, px: number, isDefault = false) => {
    g.fillStyle = '#c0c0c0'
    g.fillRect(x, y, w, h)
    if (isDefault) {
      g.fillStyle = '#000'
      g.fillRect(x - 2, y - 2, w + 4, h + 4)
      g.fillStyle = '#c0c0c0'
      g.fillRect(x, y, w, h)
    }
    bevel(x, y, w, h)
    text(label, x + w / 2, y + h / 2 + px * 0.36, px, '#000', isDefault, 'center')
  }
  const disk = (x: number, y: number, w: number, h: number, spending: number, gap: number) => {
    const s = w / Math.max(SPENDING, REVENUE)
    g.fillStyle = '#fff'
    g.fillRect(x, y, w, h)
    g.fillStyle = '#0000a8'
    g.fillRect(x, y, Math.min(spending, REVENUE) * s, h)
    if (gap > 0) stripes(x + REVENUE * s, y, gap * s, h)
    g.fillStyle = '#000'
    g.fillRect(x + REVENUE * s - 1, y - 4, 3, h + 8)
    bevel(x - 2, y - 2, w + 4, h + 4, true)
  }
  const blob = () => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/png'))
  return { g, text, fit, bevel, window98, button, disk, blob }
}

/** Share card: a tall Win98 "Disk Cleanup" dialog for stories, or the wide summary for X/WhatsApp. */
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
  const { g, text, fit, bevel } = k
  const tot = totals(plan)
  const cuts = changes(plan)
  const shown = cuts.slice(0, 6)
  const rest = cuts.slice(shown.length)

  // Measure first so the dialog can be centred in the safe area.
  const ROW = 76
  const listH = 20 + Math.max(1, shown.length) * ROW + (rest.length ? 56 : 0)
  const winH = 56 + 300 + listH + 280
  const x = 60
  const w = W - 120
  // Block = headline (110) + dialog + URL lines (150), centred between IG's top and bottom UI.
  const y = Math.max(360, Math.round((H - winH - 260) / 2) + 110)

  g.fillStyle = '#008080'
  g.fillRect(0, 0, W, H)
  g.shadowColor = '#000'
  g.shadowOffsetX = 3
  g.shadowOffsetY = 3
  text(t.title, W / 2, y - 44, 60, '#fff', true, 'center')
  g.shadowColor = 'transparent'
  const top = k.window98(x, y, w, winH, `${t.window} — MY:`, 30)
  // Title bar ? and × buttons
  k.button(x + w - 98, y + 12, 40, 36, '?', 24)
  k.button(x + w - 52, y + 12, 40, 36, '×', 28)

  const px = x + 44
  const pw = w - 88
  text('🧹', px, top + 84, 60)
  text(t.freedUp, px + 90, top + 72, 38)
  text(fmt(tot.cut), px, top + 196, 108, '#000', true)
  text(t.toDelete(cuts.length), px, top + 262, 32)

  // List box: checkbox, programme (ministry under it), amount freed
  const ly = top + 290
  g.fillStyle = '#fff'
  g.fillRect(px, ly, pw, listH)
  bevel(px, ly, pw, listH, true)
  if (shown.length === 0) text(t.nothingYet, px + 24, ly + 64, 32, '#404040')
  shown.forEach((ch, i) => {
    const ry = ly + 10 + i * ROW
    const amt = `−${fmt(ch.freed)}`
    g.font = '32px Tahoma, Verdana, sans-serif'
    const amtW = g.measureText(amt).width
    // checkbox
    g.fillStyle = '#fff'
    g.fillRect(px + 20, ry + 14, 30, 30)
    bevel(px + 20, ry + 14, 30, 30, true)
    text('✓', px + 35, ry + 39, 26, '#000', true, 'center')
    const nameW = pw - 90 - amtW - 50
    text(fit(ch.line.name, nameW, 32, true), px + 68, ry + 40, 32, '#000', true)
    text(fit(`${ch.line.ministry} · ${describe(ch.keep)}`, nameW, 22), px + 68, ry + 66, 22, '#606060')
    text(amt, px + pw - 20, ry + 40, 32, '#006400', true, 'right')
  })
  if (rest.length) {
    const ry = ly + 10 + shown.length * ROW
    g.fillStyle = '#808080'
    for (let dx = px + 20; dx < px + pw - 20; dx += 6) g.fillRect(dx, ry + 4, 3, 2)
    text(t.moreCuts(rest.length, fmt(sum(rest.map((c) => c.freed)))), px + 20, ry + 40, 26, '#404040')
  }

  const dy = ly + listH + 40
  k.disk(px, dy, pw, 56, tot.spending, tot.gap)
  text(
    tot.gap > 0 ? `⚠ ${t.stillOver(fmt(tot.gap))}` : `✔ ${t.fits(fmt(-tot.gap))}`,
    px, dy + 112, 34, tot.gap > 0 ? '#c00000' : '#006400', true,
  )
  const by = dy + 146
  k.button(px + pw - 470, by, 270, 70, t.tryIt, 30, true)
  k.button(px + pw - 180, by, 180, 70, t.cancel, 30)

  g.shadowColor = '#000'
  g.shadowOffsetX = 3
  g.shadowOffsetY = 3
  text(SHORT_SITE, W / 2, y + winH + 76, 40, '#fff', true, 'center')
  text(t.storyFoot(YEAR), W / 2, y + winH + 124, 26, '#fff', false, 'center')
  g.shadowColor = 'transparent'
  return k.blob()
}

/** 1200×675 (16:9), the size X and WhatsApp show uncropped. */
function wide(plan: Plan): Promise<Blob> {
  const { w: W, h: H } = SIZES.wide
  const k = canvas(W, H)
  const { g, text, fit, bevel } = k
  const tot = totals(plan)

  g.fillStyle = '#008080'
  g.fillRect(0, 0, W, H)
  k.window98(24, 24, W - 48, H - 48, `${t.title} — ${t.root}`, 18)

  // Headline
  text(t.myPlanCuts(fmt(tot.cut)), 56, 112, 40, '#000', true)
  text(tot.gap > 0 ? `⚠ ${t.stillOver(fmt(tot.gap))}` : `✔ ${t.fits(fmt(-tot.gap))}`, 56, 146, 22, tot.gap > 0 ? '#c00000' : '#006400', true)

  const bx = 56
  const bw = W - 112
  k.disk(bx, 166, bw, 36, tot.spending, tot.gap)
  text(`${t.spending} ${fmt(tot.spending)}  ·  ${t.borrowed} ${fmt(Math.max(0, tot.gap))}`, bx, 226, 17)
  text(`${t.revenue} ${fmt(REVENUE)}`, bx + bw, 226, 17, '#000', false, 'right')

  // Two panels: biggest cuts (left), what is left by sector (right)
  const py = 262
  const ph = 340
  const panel = (x: number, w: number, title: string) => {
    bevel(x, py, w, ph, true)
    g.fillStyle = '#fff'
    g.fillRect(x + 2, py + 2, w - 4, ph - 4)
    text(title, x + 16, py + 32, 20, '#000080', true)
  }

  const lx = 56
  const lw = 520
  panel(lx, lw, t.whatICut)
  const cuts = changes(plan)
  const shown = cuts.slice(0, 7)
  const rest = cuts.slice(shown.length)
  if (shown.length === 0) text(t.nothingYet, lx + 16, py + 70, 18, '#404040')
  shown.forEach((ch, i) => {
    // Two lines per cut: programme + how much, then its ministry (names like "Pengurusan" repeat).
    const y = py + 66 + i * 36
    const amt = `−${fmt(ch.freed)}`
    g.font = 'bold 18px Tahoma, Verdana, sans-serif'
    const room = lw - 48 - g.measureText(amt).width
    const name = fit(ch.line.name, room - 90, 17, true)
    text(name, lx + 16, y, 17, '#000', true)
    text(describe(ch.keep), lx + 16 + g.measureText(name).width + 10, y, 14, '#404040')
    text(fit(ch.line.ministry, room, 13), lx + 16, y + 15, 13, '#606060')
    text(amt, lx + lw - 16, y, 18, '#006400', true, 'right')
  })
  if (rest.length) text(t.moreCuts(rest.length, fmt(sum(rest.map((c) => c.freed)))), lx + 16, py + ph - 14, 15, '#404040')

  const rx = 600
  const rw = W - 56 - rx
  panel(rx, rw, t.byGroup)
  const rows = sectors.map((s) => ({ name: s.name, before: sum(s.lines.map((l) => l.total)), now: sum(s.lines.map((l) => nowOf(plan, l))) }))
  const max = Math.max(...rows.map((r) => r.before))
  const barW = rw - 32
  rows.forEach((r, i) => {
    const y = py + 66 + i * 52
    text(r.name, rx + 16, y, 16, '#000', true)
    text(fmt(r.now), rx + rw - 16, y, 16, '#000', false, 'right')
    const nowW = (r.now / max) * barW
    const cutW = ((r.before - r.now) / max) * barW
    g.fillStyle = '#0000a8'
    g.fillRect(rx + 16, y + 8, nowW, 14)
    if (cutW > 0) {
      g.strokeStyle = '#006400'
      g.setLineDash([4, 3])
      g.strokeRect(rx + 16 + nowW + 0.5, y + 8.5, cutW - 1, 13)
      g.setLineDash([])
    }
  })

  text(t.footer(YEAR, SHORT_SITE), 56, H - 44, 15, '#202020')
  return k.blob()
}
