import { lines, ministries, ministryKey, sum } from './data.ts'
import { t } from './i18n.ts'

/** Lowercase, no accents or punctuation, single spaces: "RON-95 " → "ron 95". */
const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const compact = (s: string) => norm(s).replace(/ /g, '')

type Note = keyof typeof t.searchNote

/**
 * Everyday worries → words the book uses. `note` explains when the book has no line of its own for it.
 * ponytail: hand-made list; add words when people search for something and get nothing.
 */
const GROUPS: { words: string[]; terms: string[]; note?: Note }[] = [
  // Money in people's pockets. B.11 has one line for fuel subsidy and cash aid; the book does not split them.
  { words: ['ron95', 'ron97', 'petrol', 'diesel', 'bahan api', 'minyak', 'harga minyak', 'subsidi minyak', 'budi95', 'budi', 'fuel', 'str', 'sara', 'bantuan tunai', 'rahmah', 'sumbangan', 'cash aid'], terms: ['subsidi dan bantuan tunai'], note: 'fuel' },
  { words: ['kos sara hidup', 'harga barang', 'barang mahal', 'harga', 'inflasi', 'ayam', 'telur', 'gula', 'beras', 'cost of living', 'prices'], terms: ['kos sara hidup', 'pengguna', 'subsidi dan bantuan tunai'], note: 'prices' },
  { words: ['subsidy', 'subsidies'], terms: ['subsidi'] },
  { words: ['miskin', 'b40', 'kemiskinan', 'asnaf', 'poor', 'poverty'], terms: ['kemiskinan', 'miskin', 'kesejahteraan rakyat'] },
  { words: ['warga emas', 'oku', 'kebajikan', 'jkm', 'ibu tunggal', 'elderly', 'disabled', 'welfare'], terms: ['pembangunan wanita', 'kebajikan', 'kesejahteraan wanita'] },
  // Politicians and civil servants. Pay sits inside each ministry's lines, not in a line of its own.
  { words: ['gaji menteri', 'elaun menteri', 'menteri', 'ahli parlimen', 'mp', 'wakil rakyat', 'elaun mp', 'minister', 'minister salary'], terms: ['anggota pentadbiran', 'parlimen'], note: 'minister' },
  { words: ['gaji', 'gaji penjawat awam', 'penjawat awam', 'kakitangan awam', 'salary', 'civil servant'], terms: ['pengurusan', 'perkhidmatan awam'], note: 'salary' },
  { words: ['rasuah', 'sprm', 'macc', 'corruption'], terms: ['pencegahan rasuah', 'rasuah'] },
  { words: ['istana', 'raja', 'diraja', 'agong', 'royal'], terms: ['diraja', 'penyimpan mohor'] },
  { words: ['pilihan raya', 'pru', 'undi', 'election'], terms: ['pilihan raya'] },
  { words: ['hutang', 'debt', 'faedah', 'interest'], terms: ['hutang negara', 'faedah'] },
  { words: ['pencen', 'bersara', 'pension', 'retire', 'retirement'], terms: ['pencen', 'persaraan'] },
  // Getting around
  { words: ['lrt', 'mrt', 'ktm', 'komuter', 'ets', 'rapid', 'myrapid', 'train', 'keretapi', 'tren', 'bas', 'bus', 'transit', 'public transport'], terms: ['pengangkutan awam', 'rel', 'landasan'] },
  { words: ['jalan', 'jalan rosak', 'jalan berlubang', 'lubang', 'road', 'pothole', 'highway', 'tol', 'lebuhraya'], terms: ['jalan', 'jambatan', 'lebuhraya'] },
  // Disasters and the home
  { words: ['banjir', 'flood', 'bencana', 'disaster', 'tebatan', 'nadma', 'jps'], terms: ['banjir', 'tebatan', 'bencana', 'nadma'] },
  { words: ['rumah', 'rumah mampu milik', 'ppr', 'pr1ma', 'house', 'housing'], terms: ['perumahan', 'rumah', 'kediaman', 'pr1ma'] },
  { words: ['elektrik', 'letrik', 'bil elektrik', 'tnb', 'electricity'], terms: ['elektrik', 'bil lampu'] },
  { words: ['air', 'air putus', 'paip', 'water', 'nrw'], terms: ['bekalan air', 'air', 'non revenue water', 'pembetungan'] },
  { words: ['sampah', 'sisa', 'rubbish', 'garbage'], terms: ['sisa pepejal'] },
  { words: ['internet', 'internet lembap', 'line', 'coverage', 'wifi', '5g', 'broadband', 'jendela'], terms: ['jendela', 'digital'] },
  // Schools, hospitals, jobs
  { words: ['sekolah', 'sekolah daif', 'cikgu', 'guru', 'school', 'teacher', 'education'], terms: ['pendidikan', 'sekolah'] },
  { words: ['uni', 'universiti', 'university', 'ipta', 'kolej'], terms: ['universiti', 'pendidikan tinggi'] },
  { words: ['ptptn', 'pinjaman belajar', 'pinjaman pelajaran', 'biasiswa', 'scholarship', 'student loan'], terms: ['biasiswa', 'pinjaman pelajaran', 'penajaan'], note: 'ptptn' },
  { words: ['hospital', 'hospital sesak', 'doktor', 'jururawat', 'klinik', 'ubat', 'doctor', 'nurse', 'health', 'sihat'], terms: ['kesihatan', 'hospital', 'klinik'] },
  { words: ['kerja', 'cari kerja', 'pengangguran', 'menganggur', 'jobs', 'unemployment', 'tvet', 'latihan'], terms: ['pekerjaan', 'sumber manusia', 'tvet', 'latihan'] },
  // Safety
  { words: ['askar', 'tentera', 'army', 'military', 'navy', 'tldm', 'tudm', 'atm', 'defence'], terms: ['tentera', 'pertahanan'] },
  { words: ['polis', 'police', 'pdrm'], terms: ['polis', 'pdrm'] },
  { words: ['jenayah', 'scam', 'crime', 'keselamatan'], terms: ['keselamatan dalam negeri', 'pdrm'] },
  { words: ['pendatang', 'pati', 'imigresen', 'immigration', 'sempadan', 'border'], terms: ['imigresen', 'sempadan'] },
  // Countryside, food, environment
  { words: ['kampung', 'desa', 'luar bandar', 'rural'], terms: ['luar bandar', 'kemajuan desa'] },
  { words: ['petani', 'nelayan', 'padi', 'baja', 'nasi', 'rice', 'makanan', 'food', 'farmer', 'fisherman'], terms: ['padi', 'pertanian', 'keterjaminan makanan'] },
  { words: ['iklim', 'alam sekitar', 'pencemaran', 'jerebu', 'climate', 'pollution', 'haze'], terms: ['alam sekitar', 'iklim'] },
  { words: ['masjid', 'surau', 'agama', 'islam', 'mosque', 'religion'], terms: ['islam', 'masjid'] },
  { words: ['bola', 'sukan', 'sport', 'football'], terms: ['sukan'] },
]
const byWord = new Map(GROUPS.flatMap((g) => g.words.map((w) => [compact(w), g] as const)))

type Entry = { key: string; label: string; sub: string; size: number; hay: string; name: string }
const entry = (key: string, label: string, sub: string, size: number): Entry =>
  ({ key, label, sub, size, name: ` ${norm(label)}`, hay: ` ${norm(`${label} ${sub}`)}` })
const entries: Entry[] = [
  ...ministries.map((m) => entry(ministryKey(m), m.name, m.sector, sum(m.lines.map((l) => l.total)))),
  ...lines.map((l) => entry(l.id, l.name, l.ministry, l.total)),
]

// Word-start match, so "air" finds "Bekalan Air" but not "Pengairan".
const has = (hay: string, term: string) => hay.includes(` ${norm(term)}`)

export type Hit = { key: string; label: string; sub: string; size: number }
export type Result = { hits: Hit[]; terms: string[]; note?: Note }

export function search(query: string, limit = 10): Result {
  const q = norm(query)
  if (!q) return { hits: [], terms: [] }
  // Whole query as one alias first ("bahan api", "ron 95"), else word by word.
  const whole = byWord.get(compact(q))
  const words = whole ? [whole] : q.split(' ').map((w) => byWord.get(w) ?? { words: [w], terms: [w] })
  const matches = entries.filter((e) => words.every((g) => g.terms.some((term) => has(e.hay, term))))
  // Name matches first (a ministry's own name beats its programmes), then biggest first.
  const inName = (e: Entry) => words.every((g) => g.terms.some((term) => has(e.name, term)))
  matches.sort((a, b) => Number(inName(b)) - Number(inName(a)) || b.size - a.size)
  return {
    hits: matches.slice(0, limit).map(({ key, label, sub, size }) => ({ key, label, sub, size })),
    terms: words.flatMap((g) => g.terms),
    note: words.map((g) => ('note' in g ? g.note : undefined)).find(Boolean),
  }
}
