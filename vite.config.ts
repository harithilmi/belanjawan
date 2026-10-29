import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import plain from './budget-2027-plain.json' with { type: 'json' }
import { bookMinistries as ministries, slugByCode } from './src/slug.ts'

const SITE = 'https://harithilmi.com/belanjawan/'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
/** RM million → "RM12.3 bilion" / "RM450 juta". */
const rm = (m: number) => (m >= 1000 ? `RM${(m / 1000).toFixed(1)} bilion` : `RM${Math.round(m)} juta`)
const summaries: Record<string, { ms: string } | undefined> = plain

/**
 * One static page per ministry (dist/<slug>/index.html) with its own title, description and text,
 * so searches like "bajet 2027 kementerian pendidikan" can land on it. The app picks the ministry from the URL.
 */
function ministryPages(): Plugin {
  return {
    name: 'ministry-pages',
    apply: 'build',
    writeBundle({ dir = 'dist' }) {
      const html = readFileSync(join(dir, 'index.html'), 'utf8')
      const total = ministries.flatMap((m) => m.programmes).reduce((a, p) => a + p.opex + p.devex, 0)
      const urls = [SITE]

      for (const m of ministries) {
        const slug = slugByCode.get(m.code) ?? m.code
        const url = `${SITE}${slug}/`
        const opex = m.programmes.reduce((a, p) => a + p.opex, 0)
        const devex = m.programmes.reduce((a, p) => a + p.devex, 0)
        const share = (((opex + devex) / total) * 100).toFixed(1)
        const title = `${m.name} dalam Bajet 2027: ${rm(opex + devex)}`
        const desc = `Peruntukan Belanjawan 2027 untuk ${m.name}: ${rm(opex + devex)} (mengurus ${rm(opex)}, pembangunan ${rm(devex)}), ${share}% daripada perbelanjaan persekutuan. Lihat ${m.programmes.length} program dan potong sendiri.`
        const about = summaries[m.code]?.ms
        const page = html
          // One folder down, so relative asset paths step up a level.
          .replace(/(href|src)="\.\//g, '$1="../')
          .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
          .replace(/(<meta name="description" content=")[^"]*/, `$1${esc(desc)}`)
          .replace(/(<meta property="og:description" content=")[^"]*/, `$1${esc(desc)}`)
          .replace(/(<meta property="og:title" content=")[^"]*/, `$1${esc(title)}`)
          .replace(/(<link rel="canonical" href=")[^"]*/, `$1${url}`)
          .replace(/(<meta property="og:url" content=")[^"]*/, `$1${url}`)
          .replace(/(<main class="desktop">)[\s\S]*?(<\/main>)/, `$1
        <header class="hero">
          <h1>${esc(m.name)}: Belanjawan 2027</h1>
          <p>${esc(desc)}</p>${about ? `\n          <p>${esc(about)}</p>` : ''}
          <p><a href="${SITE}">Semua kementerian dalam Bajet 2027</a></p>
        </header>
      $2`)
        mkdirSync(join(dir, slug), { recursive: true })
        writeFileSync(join(dir, slug, 'index.html'), page)
        urls.push(url)
      }

      const today = new Date().toISOString().slice(0, 10)
      writeFileSync(join(dir, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc><lastmod>${today}</lastmod></url>`).join('\n')}
</urlset>
`)
    },
  }
}

// Relative base so dist/ works from any static host or sub-path.
export default defineConfig({ plugins: [react(), ministryPages()], base: './' })
