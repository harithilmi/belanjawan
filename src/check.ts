// Smoke check: `npm run check`. Data totals, tree shape, plan math and treemap areas.
import assert from 'node:assert/strict'
import { lines, linesOf, ministries, nodeOf, REVENUE, sectors, SPENDING, sum } from './data.ts'
import { remove, setKeep, shrink10, totals } from './plan.ts'
import { squarify } from './squarify.ts'
import { search } from './search.ts'

const near = (a: number, b: number, msg?: string) => assert.ok(Math.abs(a - b) < 1e-3, msg ?? `${a} ≈ ${b}`)

assert.equal(REVENUE, 380_817)
near(SPENDING, 459_840) // Tinjauan Fiskal total = book OE + DE minus P.70 contingency
near(totals({}).gap, 79_023)

// Sector → ministry → programme, ids unique, folders hold their children.
assert.equal(sectors.length, 5)
assert.equal(new Set(lines.map((l) => l.id)).size, lines.length)
near(sum(sectors.map((s) => sum(s.lines.map((l) => l.total)))), SPENDING)
for (const m of ministries) assert.ok(m.lines.length > 0 && m.lines.every((l) => l.code === m.code), m.code)
assert.ok(ministries.filter((m) => m.code.startsWith('T')).every((m) => m.lines.every((l) => l.locked)), 'charged = locked')
assert.ok(lines.filter((l) => !l.code.startsWith('T')).every((l) => !l.locked), 'only charged is locked')
assert.equal(linesOf(nodeOf('m:B/P.42')).length, ministries.find((m) => m.code === 'B/P.42')?.lines.length)

const debt = lines.find((l) => l.code === 'T.13')
const health = lines.find((l) => l.code === 'B/P.42')
assert.ok(debt?.locked && health)

assert.deepEqual(remove({}, [debt]), {}, 'locked lines never change')
let p = shrink10(shrink10({}, [health]), [health])
assert.equal(p[health.id], 80)
near(totals(p).cut, health.total * 0.2)
p = setKeep(p, [health], () => 100)
assert.deepEqual(p, {}, 'restoring to 100% clears the entry')
near(totals(remove({}, lines)).spending, sum(lines.filter((l) => l.locked).map((l) => l.total)))

const tiles = squarify(lines, (l) => l.total, { x: 0, y: 0, w: 1000, h: 500 })
const area = tiles.reduce((s, t) => s + t.w * t.h, 0)
assert.ok(Math.abs(area - 500_000) < 1e-6, `treemap fills the rect (${area})`)
assert.ok(tiles.every((t) => t.x >= -1e-9 && t.y >= -1e-9 && t.x + t.w <= 1000 + 1e-6 && t.y + t.h <= 500 + 1e-6))

// Search: everyday words reach the book's names; word-start only; nonsense finds nothing.
assert.equal(search('RON 95').hits[0]?.label, 'Subsidi dan Bantuan Tunai')
assert.equal(search('ron95').note, 'fuel')
assert.equal(search('hutang').hits[0]?.key, 'm:T.13')
assert.ok(search('air').hits.every((h) => !/pengairan/i.test(h.label)), 'air ≠ pengairan')
assert.equal(search('xyzzy').hits.length, 0)
assert.equal(search('gaji menteri').note, 'minister')
assert.ok(search('banjir').hits.every((h) => !/pengairan/i.test(h.label)), 'banjir ≠ pengairan')
for (const q of ['lrt', 'ptptn', 'kos sara hidup', 'warga emas', 'sampah', 'scam']) assert.ok(search(q).hits.length > 0, q)

console.log('ok')
