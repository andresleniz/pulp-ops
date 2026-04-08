import XLSX from 'xlsx'
import { parseFastmarketsFile, storageKey } from '../lib/fastmarkets-importer'

const wb = XLSX.readFile('C:/Users/Andres Leniz/Downloads/Fastmarkets_2026_04_08-140501.xlsx')
const ws = wb.Sheets[wb.SheetNames[0]]
const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as unknown[][]
const { series } = parseFastmarketsFile(rawRows, 'test')

console.log('=== Per-series summary ===')
for (const s of series) {
  const keys = s.observations.map(o => storageKey(o.date, s.frequency))
  const uniqueKeys = new Set(keys)
  console.log(
    s.symbol.padEnd(14),
    s.frequency.padEnd(10),
    'obs:', String(s.observations.length).padEnd(6),
    'storageKeys:', uniqueKeys.size,
    uniqueKeys.size < s.observations.length ? `*** INTRA-SERIES DUPE: ${s.observations.length - uniqueKeys.size} collisions ***` : 'ok'
  )
  if (uniqueKeys.size < s.observations.length) {
    // Show which keys collide
    const seen = new Map<string, number>()
    for (const k of keys) seen.set(k, (seen.get(k) ?? 0) + 1)
    const dupes = [...seen.entries()].filter(([, n]) => n > 1)
    dupes.slice(0, 5).forEach(([k, n]) => console.log('   dupe key:', k, 'x' + n))
  }
}

// Build the full upsert row list (mocked with name as proxy for indexId)
// to find cross-series collisions on (normalizedName, storageKey)
console.log('\n=== Cross-series collision check (normalizedName, storageKey) ===')
const allKeys = new Map<string, { name: string; date: string; count: number }>()
for (const s of series) {
  for (const obs of s.observations) {
    const k = `${s.normalizedName}|${storageKey(obs.date, s.frequency)}`
    if (allKeys.has(k)) {
      const existing = allKeys.get(k)!
      existing.count++
    } else {
      allKeys.set(k, { name: s.normalizedName, date: storageKey(obs.date, s.frequency), count: 1 })
    }
  }
}
const crossDupes = [...allKeys.values()].filter(v => v.count > 1)
console.log('Cross-series collisions:', crossDupes.length)
crossDupes.slice(0, 10).forEach(v => console.log(' ', v.name, '|', v.date, 'x' + v.count))

// Show total observations and unique (name, storageKey) pairs
const totalObs = series.reduce((acc, s) => acc + s.observations.length, 0)
console.log('\nTotal observations:', totalObs)
console.log('Unique (name, storageKey) pairs:', allKeys.size)
console.log('Duplicates to collapse:', totalObs - allKeys.size)

// Check if any storageKey for a MONTHLY series has value shorter than YYYY-MM
console.log('\n=== storageKey length check ===')
for (const s of series) {
  const badKeys = s.observations
    .map(o => storageKey(o.date, s.frequency))
    .filter(k => s.frequency === 'monthly' ? k.length !== 7 : k.length !== 10)
  if (badKeys.length) {
    console.log(s.symbol, s.frequency, 'BAD KEY FORMAT:', badKeys.slice(0, 3))
  }
}
console.log('done')
