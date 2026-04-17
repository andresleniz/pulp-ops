import { NextRequest, NextResponse } from "next/server"
import { importCRMRows, CRMRow, ImportOptions } from "@/lib/crm-importer"

// ── Header normalisation ──────────────────────────────────────────────────────
/**
 * Normalise a raw header cell to a canonical form used for all comparisons.
 * Rules: trim → lowercase → collapse internal whitespace to single space.
 *
 * Examples:
 *   "Destination port"   → "destination port"
 *   " destination Port " → "destination port"
 *   "DESTINATION PORT"   → "destination port"
 *   "Order quantity (ADT)" → "order quantity (adt)"
 */
function normalizeHeader(val: unknown): string {
  return String(val ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
}

// ── Column alias tables (all entries already normalised) ─────────────────────
const DEST_PORT_ALIASES = [
  "destination port",
  "destination_port",
  "destinationport",
  "port",
]

const CURRENCY_ALIASES = ["currency", "document currency", "transaction currency"]

/**
 * Returns the first non-empty string value found under any of the given aliases.
 * Because all keys in rawRows are normalised, aliases must also be normalised.
 */
function pickColumn(r: Record<string, unknown>, aliases: string[]): string | null {
  for (const alias of aliases) {
    const val = r[alias]
    if (typeof val === "string" && val.trim()) return val.trim()
  }
  return null
}

// ── Header row detection ──────────────────────────────────────────────────────
/**
 * Scans the first N rows (raw arrays) and returns the index of the first row
 * that contains all required column identifiers — handles CRM exports that
 * prepend a title row before the real header row.
 *
 * Required: "country", "customer", "grade" (normalised).
 */
const REQUIRED_HEADERS = ["country", "customer", "grade"]
const HEADER_SCAN_LIMIT = 5

function detectHeaderRow(rawArrays: unknown[][]): number {
  for (let i = 0; i < Math.min(rawArrays.length, HEADER_SCAN_LIMIT); i++) {
    const normalized = (rawArrays[i] as unknown[]).map(normalizeHeader)
    if (REQUIRED_HEADERS.every((h) => normalized.includes(h))) return i
  }
  return -1
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get("file") as File | null
    const replaceAll = formData.get("replaceAll") === "true"

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    const buffer = await file.arrayBuffer()
    const bytes = new Uint8Array(buffer)

    let XLSX: any
    try {
      XLSX = await import("xlsx")
    } catch (e) {
      return NextResponse.json({ error: "xlsx package not available: " + String(e) }, { status: 500 })
    }

    let workbook: any
    try {
      workbook = XLSX.read(bytes, { type: "array", cellDates: true })
    } catch (e) {
      return NextResponse.json({ error: "Could not parse Excel file: " + String(e) }, { status: 500 })
    }

    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]

    // Read all rows as raw arrays — no auto-header detection yet
    const rawArrays = XLSX.utils.sheet_to_json(sheet, {
      defval: null,
      header: 1,
    }) as unknown[][]

    if (rawArrays.length === 0) {
      return NextResponse.json({ error: "No rows found in file" }, { status: 400 })
    }

    // ── Detect the header row ─────────────────────────────────────────────────
    const headerRowIndex = detectHeaderRow(rawArrays)
    if (headerRowIndex === -1) {
      return NextResponse.json(
        {
          error:
            `Could not detect header row in first ${HEADER_SCAN_LIMIT} rows. ` +
            `Expected columns: ${REQUIRED_HEADERS.join(", ")}. ` +
            `Row 0 contents: ${(rawArrays[0] as unknown[]).slice(0, 5).map(String).join(" | ")}`,
        },
        { status: 400 }
      )
    }

    // ── Build normalised rows ─────────────────────────────────────────────────
    // All keys are lowercase-trimmed-single-spaced so alias matching is uniform.
    const headerRow: string[] = (rawArrays[headerRowIndex] as unknown[]).map(normalizeHeader)
    const dataRows: unknown[][] = rawArrays.slice(headerRowIndex + 1)

    const rawRows: Record<string, unknown>[] = dataRows
      .map((row) => {
        const obj: Record<string, unknown> = {}
        headerRow.forEach((h, i) => {
          if (h) obj[h] = (row as unknown[])[i] ?? null
        })
        return obj
      })
      // Drop completely-empty rows (all values null) — common at end of exports
      .filter((r) => Object.values(r).some((v) => v !== null))

    if (rawRows.length === 0) {
      return NextResponse.json({ error: "No data rows found after header row" }, { status: 400 })
    }

    // ── Diagnostic logging ────────────────────────────────────────────────────
    const fileColumns = headerRow.filter((h) => h)
    const portResolved = DEST_PORT_ALIASES.find((a) => headerRow.includes(a)) ?? "NONE"
    const currencyResolved = CURRENCY_ALIASES.find((a) => headerRow.includes(a)) ?? "NONE"

    console.log("[CRM import] Header row detected at row index:", headerRowIndex)
    console.log("[CRM import] Detected headers:", fileColumns.join(" | "))
    console.log("[CRM import] destinationPort column resolved to:", portResolved)
    console.log("[CRM import] currency column resolved to:", currencyResolved)
    console.log("[CRM import] country present:", headerRow.includes("country"))
    console.log("[CRM import] grade present:", headerRow.includes("grade"))
    console.log("[CRM import] replaceAll:", replaceAll)
    console.log("[CRM import] data rows after header:", rawRows.length)

    // ── Map to CRMRow using normalised keys ───────────────────────────────────
    const rows: CRMRow[] = rawRows.map((r) => ({
      orderRef:  (r["order number"] as string) ?? null,
      year:      r["allocation year"] as string | number | null,
      month:     r["allocation month"] as string | null,
      country:   r["country"] as string | null,
      customer:  r["customer"] as string | null,
      grade:     r["grade"] as string | null,
      volume:    r["order quantity (adt)"] as number | null,
      price:     r["price"] as number | null,
      mill:      r["mill"] as string | null,
      comments:  r["comments"] as string | null,
      destinationPort: pickColumn(r, DEST_PORT_ALIASES),
      currency:        pickColumn(r, CURRENCY_ALIASES),
    }))

    // ── Diagnostic sample (temporary — remove after port fix verified) ─────────
    const parsedSample = rows.slice(0, 5).map((r) => ({
      country: r.country,
      destinationPort: r.destinationPort,
      currency: r.currency,
      orderRef: r.orderRef,
      grade: r.grade,
    }))

    const options: ImportOptions = { replaceAll }
    const result = await importCRMRows(rows, options)
    return NextResponse.json({ success: true, result, fileColumns, parsedSample })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
