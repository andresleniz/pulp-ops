/**
 * fastmarkets-importer.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Dedicated parser for the Fastmarkets column-oriented Excel export.
 *
 * FILE LAYOUT
 *   Row 0  : Title row (ignored)
 *   Row 1  : Blank (ignored)
 *   Row 2  : "Symbol" | <symbol per column>
 *   Row 3  : "Description" | <description per column>
 *   Row 4  : "Assessment Date" | <assessment type per column>  (usually "Mid")
 *   Row 5+ : <date M/D/YYYY> | <values per column>
 *   Col 0  : date string for every data row
 *   Col 1+ : one price series each
 *
 * STORAGE CONTRACT — MONTHLY GRAIN
 *   IndexValue has a @@unique([indexId, month]) constraint, so only one value
 *   per calendar month can be stored per series regardless of posting frequency.
 *   Aggregation rule applied at import time:
 *     → For each (series, YYYY-MM), the observation with the LATEST date within
 *       that month is selected and stored.  Earlier observations in the same
 *       month are discarded at import time, not stored.
 *   This means:
 *     - A weekly series (e.g. FP-PLP-0033, FP-PLP-0040) with ~4 obs/month is
 *       collapsed to 1 value/month (the last weekly print of the month).
 *     - A biweekly series (e.g. FP-PLP-0027) with 2 obs/month is collapsed
 *       similarly.
 *     - Monthly series (e.g. FP-PLP-0018) are unaffected (already 1/month).
 *   The publicationDate field stores the actual observation date of the retained
 *   point (YYYY-MM-DD), preserving traceability.
 *   Source is stamped "Fastmarkets" on every value.
 *
 * DASHBOARD MAPPING
 *   Known symbols are mapped to the exact IndexDefinition.name used by
 *   getDashboardIndexSnapshot() in lib/dashboard-queries.ts.
 *   Unknown symbols are imported as "FM: <description>" and flagged as unmapped.
 */

// ── Dashboard name mapping ────────────────────────────────────────────────────

/**
 * Maps Fastmarkets symbol → the IndexDefinition.name used in the dashboard.
 * Extend this table whenever a new series is needed on a dashboard card.
 */
export const SYMBOL_NAME_MAP: Record<string, string> = {
  // ── China ──────────────────────────────────────────────────────────────────
  "FP-PLP-0033": "PIX China",                  // PIX Pulp China BHKP Net → hardwood
  "FP-PLP-0034": "FM: PIX Pulp China NBSK Net", // PIX Pulp China NBSK Net → softwood (existing DB name)

  // ── Europe ─────────────────────────────────────────────────────────────────
  "FP-PLP-0040": "RISI Europe HW",              // PIX Pulp BHKP USD — European BHKP benchmark (list)
  "FP-PLP-0153": "RISI Europe HW Spot",         // BEK spot fca Europe
  "FP-PLP-0152": "RISI Europe Softwood Spot",   // NBSK spot dap Europe

  // ── North America ──────────────────────────────────────────────────────────
  "FP-PLP-0027": "RISI USA HW",                 // BHK spot price, delivered US East
}

export function normalizeFastmarketsName(
  symbol: string,
  description: string
): { name: string; mapped: boolean } {
  if (SYMBOL_NAME_MAP[symbol]) {
    return { name: SYMBOL_NAME_MAP[symbol], mapped: true }
  }
  // Trim to a clean, unique name for unmapped series
  const clean = description
    .replace(/,\s*\$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100)
  return { name: `FM: ${clean}`, mapped: false }
}

// ── Frequency inference ───────────────────────────────────────────────────────

export type SeriesFrequency = "weekly" | "biweekly" | "monthly" | "irregular"

/**
 * Infer posting cadence from the median gap (in days) between consecutive
 * non-null observations.  Does NOT rely on series name.
 */
export function inferFrequency(medianGapDays: number): SeriesFrequency {
  if (medianGapDays <= 10) return "weekly"
  if (medianGapDays <= 20) return "biweekly"
  if (medianGapDays <= 45) return "monthly"
  return "irregular"
}

function computeMedianGap(sortedDates: string[]): number {
  if (sortedDates.length < 2) return 999
  const gaps: number[] = []
  for (let i = 0; i < Math.min(20, sortedDates.length - 1); i++) {
    const a = new Date(sortedDates[i]).getTime()
    const b = new Date(sortedDates[i + 1]).getTime()
    gaps.push(Math.round(Math.abs(a - b) / 86_400_000))
  }
  gaps.sort((a, b) => a - b)
  return gaps[Math.floor(gaps.length / 2)]
}

// ── Date helpers ──────────────────────────────────────────────────────────────

/** Parse M/D/YYYY → YYYY-MM-DD, or return null */
function toYYYYMMDD(raw: unknown): string | null {
  if (!raw) return null
  const s = String(raw).trim()

  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (mdy) {
    let yr = parseInt(mdy[3])
    if (yr < 100) yr = yr < 50 ? 2000 + yr : 1900 + yr
    const mo = String(parseInt(mdy[1])).padStart(2, "0")
    const dy = String(parseInt(mdy[2])).padStart(2, "0")
    return `${yr}-${mo}-${dy}`
  }

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`

  return null
}

/** YYYY-MM-DD → YYYY-MM */
function toYYYYMM(date: string): string {
  return date.slice(0, 7)
}

// ── Parsed series type ────────────────────────────────────────────────────────

export interface ParsedObservation {
  date: string   // YYYY-MM-DD
  month: string  // YYYY-MM
  value: number
}

export interface ParsedSeries {
  symbol: string
  rawDescription: string
  assessmentType: string
  normalizedName: string
  mapped: boolean
  frequency: SeriesFrequency
  /** All raw non-null observations in chronological order */
  observations: ParsedObservation[]
}

/**
 * Returns the storage key for an observation.
 * Weekly/biweekly/irregular series: store at full YYYY-MM-DD precision so that
 * each weekly point gets its own unique row in IndexValue (leveraging the
 * @@unique([indexId, month]) constraint — month field accepts any string).
 * Monthly series: store at YYYY-MM so the constraint keeps one value/month.
 */
export function storageKey(date: string, freq: SeriesFrequency): string {
  return freq === "monthly" ? date.slice(0, 7) : date
}

// ── Main parser ───────────────────────────────────────────────────────────────

/**
 * Parse a Fastmarkets column-oriented export into per-series data.
 *
 * @param rawRows  2-D array from XLSX.utils.sheet_to_json(ws, { header: 1 })
 * @param sourceFile  original filename, stored on each value
 */
export function parseFastmarketsFile(
  rawRows: unknown[][],
  sourceFile = "Fastmarkets.xlsx"
): { series: ParsedSeries[]; skippedRows: number } {
  // Locate header rows: Symbol at row 2, Description at row 3, Assessment at row 4
  // Data rows start at row 5; col 0 = date.

  // Validate structure
  const symbolRow = rawRows[2] ?? []
  const descRow = rawRows[3] ?? []
  const assessRow = rawRows[4] ?? []

  const totalCols = Math.max(symbolRow.length, descRow.length)

  const seriesBuilders: Array<{
    symbol: string
    description: string
    assessment: string
    name: string
    mapped: boolean
    points: ParsedObservation[]
  }> = []

  for (let c = 1; c < totalCols; c++) {
    const symbol = String(symbolRow[c] ?? "").trim()
    const description = String(descRow[c] ?? "").trim()
    const assessment = String(assessRow[c] ?? "").trim()
    if (!symbol && !description) continue

    const { name, mapped } = normalizeFastmarketsName(symbol, description)
    seriesBuilders.push({ symbol, description, assessment, name, mapped, points: [] })
  }

  let skippedRows = 0

  // Parse data rows (row 5 onward)
  for (let r = 5; r < rawRows.length; r++) {
    const row = rawRows[r] ?? []
    const dateStr = toYYYYMMDD(row[0])
    if (!dateStr) { skippedRows++; continue }

    for (let ci = 0; ci < seriesBuilders.length; ci++) {
      const col = ci + 1 // col 0 is date; series start at col 1
      const raw = row[col]
      if (raw === null || raw === undefined || raw === "") continue
      const v = typeof raw === "number" ? raw : parseFloat(String(raw))
      if (!isFinite(v)) continue

      seriesBuilders[ci].points.push({
        date: dateStr,
        month: toYYYYMM(dateStr),
        value: v,
      })
    }
  }

  // Build final series objects
  const series: ParsedSeries[] = seriesBuilders.map((b) => {
    // Sort chronologically (oldest → newest)
    b.points.sort((a, z) => a.date.localeCompare(z.date))

    const sortedDates = b.points.map((p) => p.date)
    const medianGap = computeMedianGap(sortedDates)
    const frequency = inferFrequency(medianGap)

    return {
      symbol: b.symbol,
      rawDescription: b.description,
      assessmentType: b.assessment,
      normalizedName: b.name,
      mapped: b.mapped,
      frequency,
      observations: b.points,
    }
  })

  return { series, skippedRows }
}
