import XLSX from "xlsx"
import crypto from "crypto"
import { parseFastmarketsFile, storageKey } from "@/lib/fastmarkets-importer"
import { prisma } from "@/lib/prisma"

const FILE = "C:/Users/Andres Leniz/Downloads/Fastmarkets_2026_04_10-080034.xlsx"

async function main() {
  const wb = XLSX.readFile(FILE)
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as unknown[][]
  const { series, skippedRows } = parseFastmarketsFile(rawRows, "Fastmarkets_2026_04_10-080034.xlsx")

  console.log(`Parsed ${series.length} series, ${skippedRows} skipped rows`)

  // Resolve / create IndexDefinitions
  const allNames = [...new Set(series.map(s => s.normalizedName))]
  const defs = await prisma.indexDefinition.findMany({ where: { name: { in: allNames } }, select: { id: true, name: true } })
  const nameToId = new Map(defs.map(d => [d.name, d.id]))

  const missing = allNames.filter(n => !nameToId.has(n))
  if (missing.length > 0) {
    await prisma.indexDefinition.createMany({
      data: missing.map(name => ({ name, unit: "USD/ADT", description: series.find(s => s.normalizedName === name)?.rawDescription ?? null })),
      skipDuplicates: true,
    })
    const newDefs = await prisma.indexDefinition.findMany({ where: { name: { in: missing } }, select: { id: true, name: true } })
    newDefs.forEach(d => nameToId.set(d.name, d.id))
    console.log(`Created ${missing.length} new IndexDefinition(s): ${missing.join(", ")}`)
  }

  // Cleanup: remove old monthly-grain (YYYY-MM, 7-char) Fastmarkets rows in chunks
  const affectedIds = allNames.map(n => nameToId.get(n)).filter(Boolean) as string[]
  const DELETE_CHUNK = 500
  let totalDeleted = 0
  for (let i = 0; i < affectedIds.length; i += DELETE_CHUNK) {
    const chunk = affectedIds.slice(i, i + DELETE_CHUNK)
    const deleted = await prisma.$executeRawUnsafe(
      `DELETE FROM "IndexValue"
       WHERE source = 'Fastmarkets'
         AND "indexId" = ANY($1::text[])
         AND length(month) = 7`,
      chunk
    )
    totalDeleted += deleted
  }
  console.log(`Cleaned up ${totalDeleted} old monthly-grain rows`)

  // Build upsert rows with dedup: keyed by (indexId, storageKey)
  // Winner = latest publicationDate when two obs collide on the same key
  type Row = { indexId: string; month: string; value: number; publicationDate: string }
  const upsertMap = new Map<string, Row>()
  let totalParsedObs = 0
  let totalCollapsed = 0

  for (const s of series) {
    const indexId = nameToId.get(s.normalizedName)
    if (!indexId) continue
    totalParsedObs += s.observations.length

    for (const obs of s.observations) {
      const key = `${indexId}|${storageKey(obs.date, s.frequency)}`
      const incoming: Row = { indexId, month: storageKey(obs.date, s.frequency), value: obs.value, publicationDate: obs.date }
      const existing = upsertMap.get(key)
      if (existing) {
        totalCollapsed++
        if (incoming.publicationDate > existing.publicationDate) upsertMap.set(key, incoming)
        console.log(`  duplicate collapsed: ${s.normalizedName} ${storageKey(obs.date, s.frequency)}`)
      } else {
        upsertMap.set(key, incoming)
      }
    }
  }

  const upsertRows = [...upsertMap.values()]
  console.log(`Observations: ${totalParsedObs} parsed → ${upsertRows.length} after dedup (${totalCollapsed} collapsed)`)

  // Upsert in chunks of 250 rows (6 params × 250 = 1500 params/batch, well under 32767 limit)
  const UPSERT_CHUNK = 250
  let totalUpserted = 0
  for (let i = 0; i < upsertRows.length; i += UPSERT_CHUNK) {
    const chunk = upsertRows.slice(i, i + UPSERT_CHUNK)
    const params: (string | number | null)[] = []
    const placeholders = chunk.map(r => {
      const base = params.length + 1
      params.push(crypto.randomUUID(), r.indexId, r.month, r.value, "Fastmarkets", r.publicationDate)
      return `($${base},$${base+1},$${base+2},$${base+3},NOW(),NOW(),$${base+4},$${base+5}::timestamp)`
    }).join(",")

    await prisma.$executeRawUnsafe(
      `INSERT INTO "IndexValue" (id,"indexId",month,value,"createdAt","updatedAt",source,"publicationDate")
       VALUES ${placeholders}
       ON CONFLICT ("indexId",month) DO UPDATE
         SET value=EXCLUDED.value,"updatedAt"=NOW(),source=EXCLUDED.source,"publicationDate"=EXCLUDED."publicationDate"`,
      ...params
    )
    totalUpserted += chunk.length
    process.stdout.write(`\r  batch ${Math.ceil((i+1)/UPSERT_CHUNK)}: ${totalUpserted}/${upsertRows.length}`)
  }
  console.log(`\nUpserted ${totalUpserted} rows across ${Math.ceil(upsertRows.length / UPSERT_CHUNK)} batches`)

  // ── Per-series verification ───────────────────────────────────────────────
  console.log("\n=== PER-SERIES RESULTS ===")
  for (const s of series) {
    const indexId = nameToId.get(s.normalizedName)
    if (!indexId) { console.log(s.symbol, "SKIPPED — no indexId"); continue }

    const count = await prisma.indexValue.count({ where: { indexId, source: "Fastmarkets" } })
    const latest = await prisma.indexValue.findFirst({
      where: { indexId, source: "Fastmarkets" },
      orderBy: { month: "desc" },
    })
    const sampleKey = latest?.month ?? "—"
    const keyLen = sampleKey.length
    const grain = keyLen === 10 ? "daily(YYYY-MM-DD)" : keyLen === 7 ? "monthly(YYYY-MM)" : `len=${keyLen}`
    console.log(
      (s.mapped ? "MAPPED   " : "unmapped ") +
      s.symbol.padEnd(14) +
      s.normalizedName.slice(0, 30).padEnd(32) +
      s.frequency.padEnd(10) +
      `stored:${String(count).padEnd(6)}` +
      `grain:${grain.padEnd(20)}` +
      `latest:${latest?.month ?? "none"} $${latest ? Number(latest.value) : "—"}`
    )
  }

  // ── Dashboard snapshot verification ──────────────────────────────────────
  const DASHBOARD_NAMES = ["PIX China", "TTO China BHK", "TTO North America BHK", "RISI Europe HW", "RISI USA HW"]
  const DISPLAY_NAMES: Record<string, string> = {
    "PIX China": "PIX China Hardwood",
    "TTO China BHK": "TTO China Hardwood",
    "TTO North America BHK": "TTO USA Hardwood",
    "RISI Europe HW": "RISI Europe HW",
    "RISI USA HW": "RISI USA HW",
  }
  const CURRENT_MONTH = "2026-04"
  const NEXT_MONTH = "2026-05"

  console.log(`\n=== DASHBOARD SNAPSHOT (currentMonth=${CURRENT_MONTH}) ===`)
  for (const dbName of DASHBOARD_NAMES) {
    const def = await prisma.indexDefinition.findFirst({ where: { name: dbName } })
    if (!def) { console.log(DISPLAY_NAMES[dbName], "— NO IndexDefinition"); continue }

    const current = await prisma.indexValue.findFirst({
      where: { indexId: def.id, NOT: { source: "forecast" }, month: { gte: CURRENT_MONTH, lt: NEXT_MONTH } },
      orderBy: { month: "desc" },
    })
    const fallback = !current ? await prisma.indexValue.findFirst({
      where: { indexId: def.id, NOT: { source: "forecast" } },
      orderBy: { month: "desc" },
    }) : null

    const row = current ?? fallback
    const isCurrentMonth = Boolean(current)
    const label = DISPLAY_NAMES[dbName]
    if (!row) {
      console.log(`${label.padEnd(25)} MISSING (no non-forecast value)`)
    } else {
      // Future-dated = stored month key is >= next month (outside current window entirely)
      const isFutureDated = row.month >= NEXT_MONTH
      console.log(
        `${label.padEnd(25)} $${String(Number(row.value)).padEnd(10)}` +
        `month:${row.month.padEnd(12)}` +
        `source:${(row.source ?? "null").padEnd(14)}` +
        (isCurrentMonth ? "CURRENT" : "STALE") +
        (isFutureDated ? " *** FUTURE-DATED ***" : "")
      )
    }
  }

  // ── Row count by grain for mapped series ─────────────────────────────────
  console.log("\n=== WEEKLY OBSERVATION COUNTS (mapped series) ===")
  const mappedChecks = [
    { display: "PIX China Hardwood", dbName: "PIX China" },
    { display: "RISI Europe HW",     dbName: "RISI Europe HW" },
    { display: "RISI USA HW",        dbName: "RISI USA HW" },
  ]
  for (const m of mappedChecks) {
    const def = await prisma.indexDefinition.findFirst({ where: { name: m.dbName } })
    if (!def) { console.log(m.display, "— no def"); continue }
    const total = await prisma.indexValue.count({ where: { indexId: def.id, source: "Fastmarkets" } })
    const daily  = await prisma.indexValue.count({ where: { indexId: def.id, source: "Fastmarkets", month: { contains: "-", not: { startsWith: "20" } } } })
    // Count by key length
    const allRows = await prisma.indexValue.findMany({ where: { indexId: def.id, source: "Fastmarkets" }, select: { month: true } })
    const dailyCount  = allRows.filter(r => r.month.length === 10).length
    const monthlyCount = allRows.filter(r => r.month.length === 7).length
    console.log(`${m.display.padEnd(25)} total:${total} daily(YYYY-MM-DD):${dailyCount} monthly(YYYY-MM):${monthlyCount}`)
  }

  // ── Chart check: no Fastmarkets chart logic ───────────────────────────────
  console.log("\n=== VERIFICATION SUMMARY ===")
  console.log(`Series parsed:          ${series.length}`)
  console.log(`Observations parsed:    ${totalParsedObs}`)
  console.log(`Duplicates collapsed:   ${totalCollapsed}`)
  console.log(`Old monthly rows removed: ${totalDeleted}`)
  console.log(`Rows upserted:          ${totalUpserted}`)
  console.log(`Skipped raw rows:       ${skippedRows}`)
  console.log(`No chart logic for Fastmarkets data (index values only)`)
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
