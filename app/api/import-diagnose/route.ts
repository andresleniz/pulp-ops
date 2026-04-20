/**
 * POST /api/import-diagnose
 *
 * Accepts the same file upload as /api/import but does NOT write to the
 * database.  Returns a complete diagnostic report so we can identify exactly
 * which headers the xlsx parser sees, which aliases were matched, and what
 * JavaScript type / value comes out of the "Net Price" and "Destination port"
 * columns before any importer logic runs.
 */
import { NextRequest, NextResponse } from "next/server"

function normalizeHeader(val: unknown): string {
  return String(val ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
}

const NET_PRICE_ALIASES  = ["net price", "net_price", "netprice", "price net", "net unit price", "net"]
const DEST_PORT_ALIASES  = ["destination port", "destination_port", "destinationport", "port"]
const CURRENCY_ALIASES   = ["currency", "document currency", "transaction currency"]
const REQUIRED_HEADERS   = ["country", "customer", "grade"]
const HEADER_SCAN_LIMIT  = 10

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get("file") as File | null
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 })

    const buffer = await file.arrayBuffer()
    const bytes  = new Uint8Array(buffer)

    let XLSX: any
    try { XLSX = await import("xlsx") }
    catch (e) { return NextResponse.json({ error: "xlsx not available: " + String(e) }, { status: 500 }) }

    const workbook = XLSX.read(bytes, { type: "array", cellDates: true })
    const sheets   = workbook.SheetNames as string[]
    const selectedSheet = sheets[0]
    const sheet = workbook.Sheets[selectedSheet]

    // ── Raw array parse ───────────────────────────────────────────────────────
    const rawArrays = XLSX.utils.sheet_to_json(sheet, {
      defval: null,
      header: 1,
    }) as unknown[][]

    // ── Header row detection ──────────────────────────────────────────────────
    let headerRowIndex = -1
    const headerScanLog: string[] = []
    for (let i = 0; i < Math.min(rawArrays.length, HEADER_SCAN_LIMIT); i++) {
      const normalized = (rawArrays[i] as unknown[]).map(normalizeHeader)
      const hasRequired = REQUIRED_HEADERS.every(h => normalized.includes(h))
      headerScanLog.push(`Row ${i}: [${normalized.filter(Boolean).slice(0, 8).join(" | ")}]${hasRequired ? "  ← HEADER ROW" : ""}`)
      if (hasRequired && headerRowIndex === -1) headerRowIndex = i
    }

    if (headerRowIndex === -1) {
      return NextResponse.json({
        error: "Header row not found in first 10 rows",
        sheets,
        selectedSheet,
        headerScanLog,
        totalRows: rawArrays.length,
      }, { status: 400 })
    }

    // ── Normalized headers ────────────────────────────────────────────────────
    const rawHeaderCells = rawArrays[headerRowIndex] as unknown[]
    const headerRow = rawHeaderCells.map(normalizeHeader)

    // Raw header bytes for every cell containing "price" or "net"
    const rawHeaderBytes: { col: number; raw: string; bytes: string; normalized: string }[] = []
    rawHeaderCells.forEach((cell, i) => {
      if (typeof cell !== "string") return
      const lower = cell.toLowerCase()
      if (lower.includes("price") || lower.includes("net")) {
        const bytes = [...cell].map(
          c => `U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}(${c})`
        ).join(" ")
        rawHeaderBytes.push({ col: i, raw: cell, bytes, normalized: normalizeHeader(cell) })
      }
    })

    // ── Column resolution ─────────────────────────────────────────────────────
    const netPriceHeader  = NET_PRICE_ALIASES.find(a => headerRow.includes(a)) ?? null
    const destPortHeader  = DEST_PORT_ALIASES.find(a => headerRow.includes(a)) ?? null
    const currencyHeader  = CURRENCY_ALIASES.find(a => headerRow.includes(a)) ?? null
    const hasGenericPrice = headerRow.includes("price")

    // All columns whose normalized name contains "price" or "net"
    const priceRelatedHeaders = headerRow
      .map((h, i) => ({ col: i, normalized: h, raw: String(rawHeaderCells[i] ?? "") }))
      .filter(x => x.normalized && (x.normalized.includes("price") || x.normalized.includes("net")))

    // ── Sample rows ───────────────────────────────────────────────────────────
    const dataRows = (rawArrays as unknown[][])
      .slice(headerRowIndex + 1)
      .filter(r => r.some(v => v !== null && v !== ""))

    type SampleRow = Record<string, { value: unknown; type: string }>
    const sampleRows: SampleRow[] = dataRows.slice(0, 5).map(row => {
      const obj: Record<string, unknown> = {}
      headerRow.forEach((h, i) => { if (h) obj[h] = (row as unknown[])[i] ?? null })

      const interested = ["country", "customer", "grade", "price"]
      if (netPriceHeader)  interested.push(netPriceHeader)
      if (currencyHeader)  interested.push(currencyHeader)
      if (destPortHeader)  interested.push(destPortHeader)
      // Also include any price/net column even if alias didn't match
      priceRelatedHeaders.forEach(x => { if (!interested.includes(x.normalized)) interested.push(x.normalized) })

      const result: SampleRow = {}
      for (const key of interested) {
        const v = obj[key] ?? null
        result[key] = { value: v, type: typeof v }
      }
      return result
    })

    return NextResponse.json({
      file: file.name,
      sheets,
      selectedSheet,
      totalRows: rawArrays.length,
      headerRowIndex,
      headerScanLog,
      allNormalizedHeaders: headerRow.filter(Boolean).map((h, _i) => {
        const idx = headerRow.indexOf(h)
        return { col: idx, normalized: h, raw: String(rawHeaderCells[idx] ?? "") }
      }),
      rawHeaderBytes,
      priceRelatedHeaders,
      columnResolution: {
        price:           hasGenericPrice ? "price" : null,
        netPrice:        netPriceHeader,
        netPriceAliases: NET_PRICE_ALIASES,
        currency:        currencyHeader,
        destinationPort: destPortHeader,
      },
      sampleRows,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
