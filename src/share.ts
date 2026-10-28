import { fmt, sectors, REVENUE, SPENDING, sum, YEAR } from './data.ts'
import { changes, nowOf, totals, type Plan } from './plan.ts'
import { t } from './i18n.ts'

export const SITE = location.origin + location.pathname

const describe = (keep: number) => (keep === 0 ? t.deleted : t.shrunkBy(100 - keep))

export function planText(plan: Plan): string {
  const tot = totals(plan)
  const list = changes(plan).map((c) => `${c.line.name} (${c.line.ministry}): ${describe(c.keep)}, ${fmt(c.freed)}`)
  return [
    t.textIntro(fmt(tot.cut), YEAR, tot.gap > 0 ? t.textShort(fmt(tot.gap)) : t.textBalanced),
    list.length ? t.textList(list.join('; ')) : t.textNone,
    t.textTotal(fmt(tot.cut), fmt(SPENDING - REVENUE)),
    t.textUrl(SITE),
  ].join('\n')
}

const STRIPE = { a: '#e00000', b: '#fff' }

/** 1200×630 share card drawn on a canvas, in the same Win98 look as the app. */
export function planImage(plan: Plan): Promise<Blob> {
  const W = 1200
  const H = 630
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')
  if (!g) return Promise.reject(new Error('Canvas not supported'))
  const tot = totals(plan)
  const font = (px: number, bold = false) => `${bold ? 'bold ' : ''}${px}px Tahoma, Verdana, sans-serif`
  const text = (s: string, x: number, y: number, px: number, color = '#000', bold = false, align: CanvasTextAlign = 'left') => {
    g.font = font(px, bold)
    g.fillStyle = color
    g.textAlign = align
    g.fillText(s, x, y)
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

  // Desktop, window, title bar
  g.fillStyle = '#008080'
  g.fillRect(0, 0, W, H)
  g.fillStyle = '#c0c0c0'
  g.fillRect(24, 24, W - 48, H - 48)
  bevel(24, 24, W - 48, H - 48)
  const bar = g.createLinearGradient(30, 0, W - 30, 0)
  bar.addColorStop(0, '#000080')
  bar.addColorStop(1, '#1084d0')
  g.fillStyle = bar
  g.fillRect(28, 28, W - 56, 32)
  text(`${t.title} — ${t.root}`, 40, 51, 18, '#fff', true)

  // Headline
  text(t.myPlanCuts(fmt(tot.cut)), 56, 112, 40, '#000', true)
  text(tot.gap > 0 ? `⚠ ${t.stillOver(fmt(tot.gap))}` : `✔ ${t.fits(fmt(-tot.gap))}`, 56, 146, 22, tot.gap > 0 ? '#c00000' : '#006400', true)

  // Disk bar, scaled to max(original spending, revenue)
  const bx = 56
  const bw = W - 112
  const by = 166
  const bh = 36
  const s = bw / Math.max(SPENDING, REVENUE)
  g.fillStyle = '#fff'
  g.fillRect(bx, by, bw, bh)
  g.fillStyle = '#0000a8'
  g.fillRect(bx, by, Math.min(tot.spending, REVENUE) * s, bh)
  if (tot.gap > 0) stripes(bx + REVENUE * s, by, tot.gap * s, bh)
  g.fillStyle = '#000'
  g.fillRect(bx + REVENUE * s - 1, by - 4, 3, bh + 8)
  bevel(bx - 2, by - 2, bw + 4, bh + 4, true)
  text(`${t.spending} ${fmt(tot.spending)}  ·  ${t.borrowed} ${fmt(Math.max(0, tot.gap))}`, bx, by + bh + 24, 17)
  text(`${t.revenue} ${fmt(REVENUE)}`, bx + bw, by + bh + 24, 17, '#000', false, 'right')

  // Two panels: biggest cuts (left), what is left by sector (right)
  const py = 262
  const ph = 300
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
  const shown = cuts.slice(0, 6)
  if (shown.length === 0) text(t.nothingYet, lx + 16, py + 70, 18, '#404040')
  shown.forEach((ch, i) => {
    // Two lines per cut: programme + how much, then its ministry (names like "Pengurusan" repeat).
    const y = py + 66 + i * 36
    text(ch.line.name, lx + 16, y, 17, '#000', true)
    text(describe(ch.keep), lx + 16 + g.measureText(ch.line.name).width + 10, y, 14, '#404040')
    text(ch.line.ministry, lx + 16, y + 15, 13, '#606060')
    text(`−${fmt(ch.freed)}`, lx + lw - 16, y, 18, '#006400', true, 'right')
  })
  if (cuts.length > shown.length) text(`+${cuts.length - shown.length}…`, lx + 16, py + ph - 14, 15, '#404040')

  const rx = 600
  const rw = W - 56 - rx
  panel(rx, rw, t.byGroup)
  const rows = sectors.map((s) => ({ name: s.name, before: sum(s.lines.map((l) => l.total)), now: sum(s.lines.map((l) => nowOf(plan, l))) }))
  const max = Math.max(...rows.map((r) => r.before))
  const barW = rw - 32
  rows.forEach((r, i) => {
    const y = py + 62 + i * 46
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

  text(t.footer(YEAR, SITE), 56, H - 44, 15, '#202020')

  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/png'))
}
