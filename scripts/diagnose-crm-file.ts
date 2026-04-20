/**
 * Diagnostic script: inspect the real CRM Excel file to find the exact
 * header names, sheet structure, and raw value types for price-related columns.
 *
 * Usage:
 *   tsx scripts/diagnose-crm-file.ts "path/to/file.xlsx"
 */
import * as XLSX from "xlsx"
import * as fs from "fs"

const filePath = process.argv[2]
if (!filePath) {
  console.error("Usage: tsx scripts/diagnose-crm-file.ts <path-to-xlsx>")
  process.exit(1)
}

function normalizeHeader(val: unknown): string {
  return String(val ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
}

const buffer = fs.readFileSync(filePath)
const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true })

// ─── 1. Sheet names ──────────────────────────────────────────────────────────
console.log("\n=== SHEETS ===")
console.log("All sheets:", workbook.SheetNames.join(", "))
console.log("Selected (first):", workbook.SheetNames[0])

const sheetName = workbook.SheetNames[0]
const sheet = workbook.Sheets[sheetName]

// ─── 2. Raw array parse ───────────────────────────────────────────────────────
const rawArrays = XLSX.utils.sheet_to_json(sheet, {
  defval: null,
  header: 1,
}) as unknown[][]

console.log(`\nTotal rows in sheet: ${rawArrays.length}`)

// ─── 3. Header row detection ─────────────────────────────────────────────────
const REQUIRED_HEADERS = ["country", "customer", "grade"]
const HEADER_SCAN_LIMIT = 10

console.log("\n=== HEADER ROW DETECTION (first 10 rows) ===")
let headerRowIndex = -1
for (let i = 0; i < Math.min(rawArrays.length, HEADER_SCAN_LIMIT); i++) {
  const cells = rawArrays[i] as unknown[]
  const normalized = cells.map(normalizeHeader)
  const hasRequired = REQUIRED_HEADERS.every(h => normalized.includes(h))
  const preview = normalized.filter(Boolean).slice(0, 12).map(h => `"${h}"`).join(", ")
  console.log(`Row ${i}: [${preview}]${hasRequired ? "  ← HEADER ROW" : ""}`)
  if (hasRequired && headerRowIndex === -1) headerRowIndex = i
}

if (headerRowIndex === -1) {
  console.error("\nFATAL: No header row found in first 10 rows.")
  process.exit(1)
}

console.log(`\nDetected header row index: ${headerRowIndex}`)

// ─── 4. Full normalized header list ──────────────────────────────────────────
const headerRow = (rawArrays[headerRowIndex] as unknown[]).map(normalizeHeader)

console.log("\n=== ALL NORMALIZED HEADERS ===")
headerRow.forEach((h, i) => {
  if (h) console.log(`  [col ${i}] "${h}"`)
})

// ─── 5. Column resolution ─────────────────────────────────────────────────────
const NET_PRICE_ALIASES = ["net price", "net_price", "netprice", "price net", "net unit price", "net"]
const DEST_PORT_ALIASES = ["destination port", "destination_port", "destinationport", "port"]
const CURRENCY_ALIASES  = ["currency", "document currency", "transaction currency"]

const netPriceHeader = NET_PRICE_ALIASES.find(a => headerRow.includes(a)) ?? null
const destPortHeader  = DEST_PORT_ALIASES.find(a => headerRow.includes(a)) ?? null
const currencyHeader  = CURRENCY_ALIASES.find(a => headerRow.includes(a)) ?? null
const genericPrice    = headerRow.includes("price") ? "price" : null

console.log("\n=== COLUMN RESOLUTION ===")
console.log(`  "price" (generic)  : ${genericPrice ?? "NOT FOUND"}`)
console.log(`  Net Price          : ${netPriceHeader ?? "NOT FOUND"}`)
console.log(`  Destination Port   : ${destPortHeader ?? "NOT FOUND"}`)
console.log(`  Currency           : ${currencyHeader ?? "NOT FOUND"}`)

// ─── 6. Any column whose name contains "net" or "price" ───────────────────────
const priceRelated = headerRow.filter(h => h && (h.includes("net") || h.includes("price")))
if (priceRelated.length > 0) {
  console.log(`\n  ALL columns containing "net" or "price":`)
  priceRelated.forEach(h => console.log(`    "${h}"`))
}

// ─── 7. Sample rows ───────────────────────────────────────────────────────────
const dataRows = rawArrays.slice(headerRowIndex + 1).filter(r =>
  (r as unknown[]).some(v => v !== null && v !== "")
)

const rawRows = dataRows.slice(0, 5).map(row => {
  const obj: Record<string, unknown> = {}
  headerRow.forEach((h, i) => { if (h) obj[h] = (row as unknown[])[i] ?? null })
  return obj
})

console.log("\n=== FIRST 5 DATA ROWS (key columns) ===")
for (const [i, r] of rawRows.entries()) {
  const country  = r["country"]
  const customer = r["customer"]
  const grade    = r["grade"]
  const price    = r["price"]
  const netPrice = netPriceHeader ? r[netPriceHeader] : undefined
  const currency = currencyHeader ? r[currencyHeader] : undefined
  const port     = destPortHeader ? r[destPortHeader] : undefined

  console.log(`\nRow ${i + 1}:`)
  console.log(`  country   : ${JSON.stringify(country)}`)
  console.log(`  customer  : ${JSON.stringify(customer)}`)
  console.log(`  grade     : ${JSON.stringify(grade)}`)
  console.log(`  price     : ${JSON.stringify(price)}  [${typeof price}]`)
  if (netPriceHeader) {
    console.log(`  net price : ${JSON.stringify(netPrice)}  [${typeof netPrice}]  (col: "${netPriceHeader}")`)
  } else {
    // Show what's in ANY price/net column even if alias didn't match
    for (const col of priceRelated) {
      console.log(`  "${col}" : ${JSON.stringify(r[col])}  [${typeof r[col]}]`)
    }
  }
  console.log(`  currency  : ${JSON.stringify(currency)}  (col: "${currencyHeader ?? "none"}")`)
  console.log(`  dest port : ${JSON.stringify(port)}  (col: "${destPortHeader ?? "none"}")`)
}

// ─── 8. Raw header bytes — detect hidden characters ───────────────────────────
console.log("\n=== RAW HEADER BYTES (for any 'price' or 'net' cells) ===")
const rawHeaderRow = rawArrays[headerRowIndex] as unknown[]
rawHeaderRow.forEach((cell, i) => {
  if (typeof cell !== "string") return
  const lower = cell.toLowerCase()
  if (lower.includes("price") || lower.includes("net")) {
    const bytes = [...cell].map(c => `U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`)
    console.log(`  col ${i}: raw="${cell}" → bytes: ${bytes.join(" ")}`)
  }
})

console.log("\n=== DONE ===\n")
