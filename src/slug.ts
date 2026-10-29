// No browser APIs here: vite.config.ts imports this to write one page per ministry.
import book from '../budget-2027-ministry.json' with { type: 'json' }

/** The bits of budget-2027-ministry.json the static pages need. Assigning (not casting) keeps TS checking the file. */
type Book = { sectors: { ministries: { code: string; name: string; programmes: { opex: number; devex: number }[] }[] }[] }
const checked: Book = book
export const bookMinistries = checked.sectors.flatMap((s) => s.ministries)

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/** Ministry code → URL slug from the book's Malay name. A repeated name (Perbendaharaan, T.12) gets its code added. */
export const slugByCode = new Map<string, string>()
for (const m of bookMinistries) {
  const slug = slugify(m.name)
  slugByCode.set(m.code, [...slugByCode.values()].includes(slug) ? `${slug}-${slugify(m.code)}` : slug)
}
