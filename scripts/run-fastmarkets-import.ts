import XLSX from "xlsx"
import crypto from "crypto"
import { parseFastmarketsFile, storageKey } from "@/lib/fastmarkets-importer"
import { prisma } from "@/lib/prisma"

const FILE = "C:/Users/Andres Leniz/Downloads/Fastmarkets_2026_04_08-140501.xlsx"

async function main() {
  const wb = XLSX.readFile(FILE)
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as unknown[][]
  const { series, skippedRows } = parseFastmarketsFile(rawRows, "Fastmarkets_2026_04_08-140501.xlsx")

  console.log(`Parsed ${series.length} series, ${skippedRows} skipped rows`)

  // Resolve IndexDefinitions (already created on first run)
  const allNames = [...new Set(series.map(s => s.normalizedName))]
  const defs = await prisma.indexDefinition.findMany({ where: { name: { in: allNames } }, select: { id: true, name: true } })
  const nameToId = new Map(defs.map(d => [d.name, d.id]))

  // Cleanup: remove old monthly-grain (YYYY-MM, 7-char) Fastmarkets rows
  const affectedIds = allNames.map(n => nameToId.get(n)).filter(Boolean) as string[]
  if (affectedIds.length > 0) {
    const deleted = await prisma.$executeRawUnsafe(
      `DELETE FROM "IndexValue"
       WHERE source = 'Fastmarkets'
         AND "indexId" = ANY($1::text[])
         AND length(month) = 7`,
      affectedIds
    )
    console.log(`Cleaned up ${deleted} old monthly-grain rows`)
  }

  // Build upsert rows using full observation grain
  const upsertRows: { indexId: string; month: string; value: number; publicationDate: string }[] = []
  for (const s of series) {
    const indexId = nameToId.get(s.normalizedName)!
    for (const obs of s.observations) {
      upsertRows.push({ indexId, month: storageKey(obs.date, s.frequency), value: obs.value, publicationDate: obs.date })
    }
  }

  console.log(`Total observation values to upsert: ${upsertRows.length}`)

  // Process in chunks of 500 to avoid param limits
  const CHUNK = 500
  let total = 0
  for (let i = 0; i < upsertRows.length; i += CHUNK) {
    const chunk = upsertRows.slice(i, i + CHUNK)
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
    total += chunk.length
    process.stdout.write(`\r  ${total}/${upsertRows.length}`)
  }
  console.log(`\nUpserted ${total} values`)

  // Verify mapped series
  console.log("\n=== MAPPED SERIES VERIFICATION ===")
  for (const s of series.filter(x => x.mapped)) {
    const def = await prisma.indexDefinition.findFirst({ where: { name: s.normalizedName } })
    const latest = await prisma.indexValue.findFirst({ where: { indexId: def!.id }, orderBy: { month: "desc" } })
    console.log(`${s.normalizedName}: ${latest?.month} $${Number(latest?.value)} (obs ${latest?.publicationDate?.toISOString().slice(0,10)})`)
  }
}

main().finally(() => prisma.$disconnect())
