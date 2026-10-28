export type Rect = { x: number; y: number; w: number; h: number }

/** Squarified treemap (Bruls et al.): lay items in rows that keep tiles close to square. */
export function squarify<T>(items: readonly T[], value: (t: T) => number, rect: Rect): Array<Rect & { item: T }> {
  const out: Array<Rect & { item: T }> = []
  let rest = items.filter((i) => value(i) > 0).sort((a, b) => value(b) - value(a))
  let total = rest.reduce((s, i) => s + value(i), 0)
  let { x, y, w, h } = rect

  while (rest.length > 0 && w > 0 && h > 0) {
    const short = Math.min(w, h)
    const scale = (w * h) / total // area per unit of value
    const worst = (row: readonly T[], s: number) => {
      const thick = (s * scale) / short
      return Math.max(...row.map((i) => {
        const len = (value(i) * scale) / thick
        return Math.max(thick / len, len / thick)
      }))
    }

    let row: T[] = []
    let rowSum = 0
    let best = Infinity
    for (const it of rest) {
      const s = rowSum + value(it)
      const r = worst([...row, it], s)
      if (row.length > 0 && r > best) break
      row = [...row, it]
      rowSum = s
      best = r
    }

    const thick = (rowSum * scale) / short
    let offset = 0
    for (const it of row) {
      const len = (value(it) * scale) / thick
      out.push(w >= h
        ? { x, y: y + offset, w: thick, h: len, item: it } // column on the left
        : { x: x + offset, y, w: len, h: thick, item: it }) // row on top
      offset += len
    }
    if (w >= h) { x += thick; w -= thick } else { y += thick; h -= thick }
    rest = rest.slice(row.length)
    total -= rowSum
  }
  return out
}
