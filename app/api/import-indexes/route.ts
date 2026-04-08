import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import Decimal from "decimal.js"
import crypto from "crypto"
import { parseFastmarketsFile } from "@/lib/fastmarkets-importer"

export const maxDuration = 60 // seconds

// ── Helpers ──────────────────────────────────────────────────────────────────

function toYYYYMM(raw: unknown): string | null {
  if (!raw) return null

  // If it's already a JS Date (xlsx cellDates:true)
  if (raw instanceof Date) {
    const y = raw.getFullYear()
    const m = String(raw.getMonth() + 1).padStart(2, "0")
    return `${y}-${m}`
  }

  const s = String(raw).trim()

  // "Jan-23", "Feb-24", etc.
  const shortMonth = s.match(/^([A-Za-z]{3})-(\d{2})$/)
  if (shortMonth) {
    const months: Record<string, string> = {
      Jan: "01", Feb: "02", Mar: "03", Apr: "04",
      May: "05", Jun: "06", Jul: "07", Aug: "08",
      Sep: "09", Oct: "10", Nov: "11", Dec: "12",
    }
    const mo = months[shortMonth[1]]
    if (!mo) return null
    const yr = parseInt(shortMonth[2]) < 50 ? `20${shortMonth[2]}` : `19${shortMonth[2]}`
    return `${yr}-${mo}`
  }

  // "January 2026", "March 2025"
  const longMonth = s.match(/^([A-Za-z]+)\s+(\d{4})$/)
  if (longMonth) {
    const months: Record<string, string> = {
      January: "01", February: "02", March: "03", April: "04",
      May: "05", June: "06", July: "07", August: "08",
      September: "09", October: "10", November: "11", December: "12",
    }
    const mo = months[longMonth[1]]
    if (!mo) return null
    return `${longMonth[2]}-${mo}`
  }

  // M/D/YYYY or M/D/YY
  const mdyy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (mdyy) {
    let yr = parseInt(mdyy[3])
    if (yr < 100) yr = yr < 50 ? 2000 + yr : 1900 + yr
    const mo = String(parseInt(mdyy[1])).padStart(2, "0")
    return `${yr}-${mo}`
  }

  // YYYY-MM-DD or YYYY-MM
  const iso = s.match(/^(\d{4})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}`

  return null
}

function isNumeric(v: unknown): v is number {
  return typeof v === "number" && isFinite(v)
}

// ── PIX China parser ──────────────────────────────────────────────────────────
// Format: header rows at top, then "Period" | "Mid" columns.
// Weekly rows — only month-end rows have a Mid value.

function parsePIXChina(rows: Record<string, unknown>[]): Map<string, number> {
  const result = new Map<string, number>()

  // Find the header row that has "Period" key
  // sheet_to_json uses first row as keys by default, OR the file may have
  // leading metadata rows. Try both approaches.

  // 1) If headers are "Period" and "Mid" directly (xlsx found them)
  const directRows = rows.filter(
    (r) => r["Period"] !== undefined || r["period"] !== undefined
  )

  if (directRows.length > 0) {
    for (const r of directRows) {
      const period = r["Period"] ?? r["period"]
      const mid = r["Mid"] ?? r["mid"]
      if (!isNumeric(mid) || mid <= 0) continue
      const month = toYYYYMM(period)
      if (!month) continue
      // Keep the last row per month (month-end)
      result.set(month, mid)
    }
    return result
  }

  // 2) Scan for rows that look like date+number pairs
  for (const r of rows) {
    const vals = Object.values(r)
    // Find a date-like value and a numeric value
    let dateVal: unknown = null
    let numVal: number | null = null
    for (const v of vals) {
      if (v instanceof Date || (typeof v === "string" && /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(v))) {
        dateVal = v
      } else if (isNumeric(v) && v > 100 && v < 2000) {
        numVal = v
      }
    }
    if (!dateVal || numVal === null) continue
    const month = toYYYYMM(dateVal)
    if (!month) continue
    result.set(month, numVal)
  }

  return result
}

// ── TTO parser ────────────────────────────────────────────────────────────────
// Actual file layout (from debug):
//   Row 0: ["Nominal US$/tonne", null, "TTO North America", null, ..., "TTO China", ...]
//   Row 1: ["Forecast Updated on: ...", null, "NBSK", "Freight Rate", ..., "NBSK", "BHK", ...]
//   Row 2+: [null, <ISO date>, 897.24, 85, 812.24, ...]
// Month column = column 1 (ISO date string). Column 0 is always null.

interface TTOParseResult {
  data: Map<string, Map<string, number>>
  // Maps index name → the Excel column index it came from
  colIndexByName: Map<string, number>
  monthCol: number
  dataStartRow: number
}

function parseTTO(rawRows: unknown[][]): TTOParseResult | null {
  // Step 1: find the month column and data start row.
  let monthCol = -1
  let dataStartIdx = -1

  for (let i = 0; i < Math.min(rawRows.length, 20); i++) {
    const row = rawRows[i]
    for (let c = 0; c < Math.min(row.length, 4); c++) {
      const m = toYYYYMM(row[c])
      if (m) { monthCol = c; dataStartIdx = i; break }
    }
    if (dataStartIdx !== -1) break
  }

  if (monthCol === -1 || dataStartIdx === -1) return null

  // Step 2: build column names
  const categoryRow: unknown[] = dataStartIdx >= 2 ? rawRows[dataStartIdx - 2] : []
  const subHeaderRow: unknown[] = dataStartIdx >= 1 ? rawRows[dataStartIdx - 1] : []

  const colCount = Math.max(
    categoryRow.length,
    subHeaderRow.length,
    rawRows[dataStartIdx]?.length ?? 0
  )

  const cats: string[] = []
  let lastCat = ""
  for (let c = 0; c < colCount; c++) {
    const v = String(categoryRow[c] ?? "").trim()
    if (v) lastCat = v
    cats.push(lastCat)
  }

  const colNames: string[] = []
  for (let c = 0; c < colCount; c++) {
    if (c === monthCol) { colNames.push("__month__"); continue }
    const cat = cats[c]
    const sub = String(subHeaderRow[c] ?? "").trim()
    let name = ""
    if (cat && sub && !cat.startsWith("Nominal") && !cat.startsWith("Forecast")) {
      name = sub ? `${cat} ${sub}` : cat
    } else if (sub && !sub.startsWith("Forecast")) {
      name = sub
    }
    colNames.push(name || "__skip__")
  }

  // Step 3: parse data rows, tracking which col index each name came from
  const data = new Map<string, Map<string, number>>()
  const colIndexByName = new Map<string, number>()

  for (let i = dataStartIdx; i < rawRows.length; i++) {
    const row = rawRows[i]
    const month = toYYYYMM(row[monthCol])
    if (!month) continue

    for (let c = 0; c < row.length; c++) {
      if (c === monthCol) continue
      const name = colNames[c]
      if (!name || name === "__month__" || name === "__skip__") continue
      if (name.includes("Adj") || name.includes("Freight Rate")) continue
      if (name.includes("BCTMP") || name.includes("Dissolving") || name.includes("Fluff")) continue
      const v = row[c]
      if (!isNumeric(v)) continue
      if (!data.has(name)) { data.set(name, new Map()); colIndexByName.set(name, c) }
      data.get(name)!.set(month, v)
    }
  }

  return { data, colIndexByName, monthCol, dataStartRow: dataStartIdx }
}

// ── Upsert helpers ────────────────────────────────────────────────────────────

// Single SQL INSERT ... ON CONFLICT DO UPDATE for all rows at once.
async function bulkUpsertIndexValues(
  rows: { indexId: string; month: string; value: number; source?: string | null }[]
): Promise<number> {
  if (rows.length === 0) return 0

  const params: (string | number | null)[] = []
  const placeholders = rows
    .map((r) => {
      const base = params.length + 1
      params.push(crypto.randomUUID(), r.indexId, r.month, r.value, r.source ?? null)
      return `($${base},$${base + 1},$${base + 2},$${base + 3},NOW(),NOW(),$${base + 4})`
    })
    .join(",")

  await prisma.$executeRawUnsafe(
    `INSERT INTO "IndexValue" (id,"indexId",month,value,"createdAt","updatedAt",source)
     VALUES ${placeholders}
     ON CONFLICT ("indexId",month) DO UPDATE
       SET value=EXCLUDED.value,"updatedAt"=NOW(),source=EXCLUDED.source`,
    ...params
  )

  return rows.length
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const type = url.searchParams.get("type") // "pix_china" | "tto"

    if (!type || !["pix_china", "tto", "fastmarkets"].includes(type)) {
      return NextResponse.json(
        { error: 'Missing or invalid ?type= parameter. Use "pix_china", "tto", or "fastmarkets".' },
        { status: 400 }
      )
    }

    const formData = await req.formData()
    const file = formData.get("file") as File | null
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 })

    const buffer = await file.arrayBuffer()
    const bytes = new Uint8Array(buffer)

    let XLSX: any
    try {
      XLSX = await import("xlsx")
    } catch (e) {
      return NextResponse.json({ error: "xlsx package not available: " + String(e) }, { status: 500 })
    }

    const workbook = XLSX.read(bytes, { type: "array", cellDates: true, cellStyles: true })
    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]

    if (type === "pix_china") {
      // Parse with default headers (first row as keys)
      const sheetRows = XLSX.utils.sheet_to_json(sheet, {
        defval: null,
        cellDates: true,
      }) as Record<string, unknown>[]

      const values = parsePIXChina(sheetRows)

      if (values.size === 0) {
        return NextResponse.json(
          { error: "No PIX China values found. Expected rows with Period date and Mid value." },
          { status: 400 }
        )
      }

      let def = await prisma.indexDefinition.findUnique({ where: { name: "PIX China" } })
      if (!def) {
        def = await prisma.indexDefinition.create({ data: { name: "PIX China", unit: "USD/ADT" } })
      }

      const pixRows = [...values.entries()].map(([month, value]) => ({
        indexId: def!.id,
        month,
        value,
      }))
      await bulkUpsertIndexValues(pixRows)

      return NextResponse.json({
        success: true,
        index: "PIX China",
        months: [...values.keys()].sort(),
        created: pixRows.length,
        updated: 0,
      })
    }

    // TTO
    if (type === "tto") {
    const rawRows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: null,
      cellDates: true,
    }) as unknown[][]

    // Debug mode: return first 8 rows as-is so we can inspect the structure
    if (url.searchParams.get("debug") === "1") {
      return NextResponse.json({
        sheetNames: workbook.SheetNames,
        totalRows: rawRows.length,
        first8Rows: rawRows.slice(0, 8).map((row) =>
          (row as unknown[]).map((cell) =>
            cell instanceof Date ? cell.toISOString() : cell
          )
        ),
      })
    }

    const parsed = parseTTO(rawRows)

    if (!parsed || parsed.data.size === 0) {
      const diagRows = rawRows.slice(0, 6).map((row) =>
        (row as unknown[]).map((cell) =>
          cell instanceof Date ? cell.toISOString() : cell
        )
      )
      return NextResponse.json(
        {
          error: "No TTO columns found. Make sure the file has month rows and numeric columns.",
          debug: { totalRows: rawRows.length, first6Rows: diagRows },
        },
        { status: 400 }
      )
    }

    const { data: ttoData, colIndexByName, monthCol: ttoMonthCol } = parsed

    // ── Per-column yellow detection ──────────────────────────────────────────
    // Yellow cell in a column = last actually published data row for that index.
    // Rows after the yellow row for that column are forecast.

    function isYellowCell(cell: any): boolean {
      if (!cell?.s) return false
      for (const key of ["fgColor", "bgColor"]) {
        const c = cell.s[key]
        if (!c) continue
        if (c.rgb && /^(FF)?FFFF00$/i.test(c.rgb)) return true
        if (c.indexed === 13) return true
      }
      return false
    }

    // For each data column, find the last row with a yellow cell → get that row's month
    const lastActualByCol = new Map<number, string>() // colIndex → last actual YYYY-MM
    const ref = sheet["!ref"]
    if (ref) {
      const range = XLSX.utils.decode_range(ref)
      for (let r = range.s.r; r <= range.e.r; r++) {
        const monthCell = sheet[XLSX.utils.encode_cell({ r, c: ttoMonthCol })]
        const month = toYYYYMM(monthCell?.v ?? monthCell?.w)
        if (!month) continue
        for (let c = range.s.c; c <= range.e.c; c++) {
          if (c === ttoMonthCol) continue
          const addr = XLSX.utils.encode_cell({ r, c })
          if (isYellowCell(sheet[addr])) {
            // This cell is yellow — update the last actual month for this column
            lastActualByCol.set(c, month)
          }
        }
      }
    }

    // Fallback cutoff: previous month
    const now = new Date()
    const prevMonth = `${now.getFullYear()}-${String(now.getMonth()).padStart(2, "0")}`

    // ── Resolve / create all index definitions ────────────────────────────────
    const allNames = [...ttoData.keys()]
    const existingDefs = await prisma.indexDefinition.findMany({
      where: { name: { in: allNames } },
      select: { id: true, name: true },
    })
    const nameToId = new Map(existingDefs.map((d) => [d.name, d.id]))

    const missing = allNames.filter((n) => !nameToId.has(n))
    if (missing.length > 0) {
      await prisma.indexDefinition.createMany({
        data: missing.map((name) => ({ name, unit: "USD/ADT" })),
        skipDuplicates: true,
      })
      const newDefs = await prisma.indexDefinition.findMany({
        where: { name: { in: missing } },
        select: { id: true, name: true },
      })
      newDefs.forEach((d) => nameToId.set(d.name, d.id))
    }

    // ── Flatten and upsert in one SQL statement ───────────────────────────────
    const allRows: { indexId: string; month: string; value: number; source?: string | null }[] = []
    const summary: Record<string, { rows: number; lastActual: string }> = {}

    for (const [indexName, values] of ttoData) {
      if (values.size === 0) continue
      const indexId = nameToId.get(indexName)
      if (!indexId) continue
      const colIdx = colIndexByName.get(indexName)
      const cutoff = colIdx !== undefined ? (lastActualByCol.get(colIdx) ?? prevMonth) : prevMonth
      summary[indexName] = { rows: values.size, lastActual: cutoff }
      for (const [month, value] of values) {
        allRows.push({ indexId, month, value, source: month > cutoff ? "forecast" : null })
      }
    }

    await bulkUpsertIndexValues(allRows)

    return NextResponse.json({
      success: true,
      totalRows: allRows.length,
      indexes: summary,
    })
    } // end if (type === "tto")

  // ── Fastmarkets ───────────────────────────────────────────────────────────────
  if (type === "fastmarkets") {
    const rawRows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: null,
    }) as unknown[][]

    const { series, skippedRows } = parseFastmarketsFile(rawRows, file.name)

    if (series.length === 0) {
      return NextResponse.json(
        { error: "No series found. Ensure this is a Fastmarkets column-oriented export with Symbol/Description header rows." },
        { status: 400 }
      )
    }

    // Resolve or create IndexDefinition for each series
    const allNames = [...new Set(series.map((s) => s.normalizedName))]
    const existingDefs = await prisma.indexDefinition.findMany({
      where: { name: { in: allNames } },
      select: { id: true, name: true },
    })
    const nameToId = new Map(existingDefs.map((d) => [d.name, d.id]))

    const missing = allNames.filter((n) => !nameToId.has(n))
    if (missing.length > 0) {
      await prisma.indexDefinition.createMany({
        data: missing.map((name) => ({
          name,
          unit: "USD/ADT",
          description: series.find((s) => s.normalizedName === name)?.rawDescription ?? null,
        })),
        skipDuplicates: true,
      })
      const newDefs = await prisma.indexDefinition.findMany({
        where: { name: { in: missing } },
        select: { id: true, name: true },
      })
      newDefs.forEach((d) => nameToId.set(d.name, d.id))
    }

    // Build upsert rows: one per (indexId, month) using the latest observation per month
    const upsertRows: { indexId: string; month: string; value: number; source: string; publicationDate: Date | null }[] = []

    const reportSeries: Array<{
      symbol: string
      rawDescription: string
      normalizedName: string
      mapped: boolean
      frequency: string
      pointsImported: number
    }> = []

    for (const s of series) {
      const indexId = nameToId.get(s.normalizedName)
      if (!indexId) continue

      for (const [month, { value, date }] of s.latestPerMonth) {
        upsertRows.push({
          indexId,
          month,
          value,
          source: "Fastmarkets",
          publicationDate: new Date(date),
        })
      }

      reportSeries.push({
        symbol: s.symbol,
        rawDescription: s.rawDescription,
        normalizedName: s.normalizedName,
        mapped: s.mapped,
        frequency: s.frequency,
        pointsImported: s.latestPerMonth.size,
      })
    }

    // Bulk upsert with publicationDate
    if (upsertRows.length > 0) {
      const params: (string | number | null)[] = []
      const placeholders = upsertRows
        .map((r) => {
          const base = params.length + 1
          params.push(
            crypto.randomUUID(),
            r.indexId,
            r.month,
            r.value,
            r.source,
            r.publicationDate ? r.publicationDate.toISOString() : null,
          )
          return `($${base},$${base+1},$${base+2},$${base+3},NOW(),NOW(),$${base+4},$${base+5}::timestamp)`
        })
        .join(",")

      await prisma.$executeRawUnsafe(
        `INSERT INTO "IndexValue" (id,"indexId",month,value,"createdAt","updatedAt",source,"publicationDate")
         VALUES ${placeholders}
         ON CONFLICT ("indexId",month) DO UPDATE
           SET value=EXCLUDED.value,"updatedAt"=NOW(),source=EXCLUDED.source,"publicationDate"=EXCLUDED."publicationDate"`,
        ...params
      )
    }

    return NextResponse.json({
      success: true,
      sourceFile: file.name,
      totalSeriesFound: series.length,
      totalPointsImported: upsertRows.length,
      skippedRows,
      mapped: reportSeries.filter((s) => s.mapped).map((s) => s.normalizedName),
      unmapped: reportSeries.filter((s) => !s.mapped).map((s) => s.normalizedName),
      series: reportSeries,
    })
  }

  } catch (err) {
    console.error("[import-indexes] Error:", err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
