/**
 * usa-queries.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Query logic and shared constants for the USA / North America market page.
 *
 * DATA SOURCE
 *   Both the CRM importer and the Arauco Sales uploader write to the same
 *   OrderRecord table with source = "CRM".  They are distinguished by customer
 *   name convention:
 *
 *   • Arauco Sales uploader  → "Customer — City, ST"  (e.g. "BiOrigin — Wiggins MS")
 *   • CRM importer (USA)     → plain mill-mapped names (e.g. "James Hardie", "Sofidel")
 *
 *   CUSTOMER_NORMALIZE, EXCLUDE, extractBase(), and the freightPerAdmt IS NOT
 *   NULL guard are the authoritative filters that restrict output to Arauco
 *   Sales customers only.  They are shared with /api/usa-charts/route.ts so
 *   the two code paths stay in sync.
 *
 *   KEY SIGNAL — freightPerAdmt:
 *     Arauco Sales importer always stores freightPerAdmt (0 when blank, positive
 *     when available).  CRM importer never sets it (stays NULL).  Filtering
 *     freightPerAdmt IS NOT NULL is therefore the reliable Arauco Sales gate.
 */

import { prisma } from "@/lib/prisma"
import { CRM_FILTER } from "@/lib/order-queries"
import type { VolumeChartSeries } from "@/lib/volume-queries"

// ── Shared normalisation constants ────────────────────────────────────────────

/**
 * Canonical display names for customers whose raw CRM/Sales strings vary across
 * uploads.  Keys must be lowercase-trimmed.
 */
export const CUSTOMER_NORMALIZE: Record<string, string> = {
  "atlas": "Atlas", "atlas - smart": "Atlas", "atlas - smart whse": "Atlas",
  "atlas paper": "Atlas", "atlas paper mill": "Atlas", "atlas paper mills": "Atlas",
  "atlas southeast": "Atlas", "atlas southeast (smart whse)": "Atlas",
  "atlas southeast - smart whse": "Atlas", "atlas southeast papers": "Atlas",
  // "biorign" is the lowercase form of the "BiOrign" typo that appears in some
  // upload files.  The map lookup is always done after .toLowerCase() so all
  // keys must be lowercase-only — mixed-case keys are never matched.
  "biorigin": "BiOrigin", "biorign": "BiOrigin",
  "gp": "Georgia Pacific", "georgia pacific": "Georgia Pacific",
  "georgia pacific (wauna)": "Georgia Pacific",
  "omnia": "Omnia", "omnia advanced materials": "Omnia", "omnia c/o castorland": "Omnia",
  "royal": "Royal Paper", "royal paper": "Royal Paper",
  "sapp na c/o  lsw": "Sappi", "sapp na c/o lsw": "Sappi",
  "sappi": "Sappi", "sappi na/nepw": "Sappi",
  "seaman": "Seaman", "seaman paper": "Seaman",
  "twin rivers": "Twin Rivers", "twin rivers (oneida whse)": "Twin Rivers",
  "twin rivers/fdc": "Twin Rivers", "twin rivers/grand prix": "Twin Rivers",
  "twin rivers/lfdc": "Twin Rivers", "twin rivers/oneida": "Twin Rivers",
  "twin rives/lfdc": "Twin Rivers",
  "neenah": "Neenah", "neenah paper": "Neenah",
  "barnwell": "Barnwell", "barnwell tissue": "Barnwell",
  "kruger": "Kruger", "kruger sherbrooke": "Kruger",
}

/**
 * Customers that appear in USA OrderRecord rows but are NOT Arauco Sales
 * accounts — typically internal entities or CRM-only entries.
 * Lowercase for case-insensitive comparison.
 */
export const EXCLUDE = new Set([
  "james hardie",
  "arauco north america, inc.",
  "arauco north america inc",
  "arauco north america",
])

/** Minimum total ADT across all months for a customer to appear in charts. */
export const MIN_VOLUME = 500

/**
 * Returns the canonical display name for a raw customer string.
 * Checks the CUSTOMER_NORMALIZE map; falls back to the trimmed input.
 */
export function normalizeName(name: string): string {
  const key = name.trim().toLowerCase()
  return CUSTOMER_NORMALIZE[key] ?? name.trim()
}

/**
 * Extracts the base company name from a Sales upload customer label.
 * "BiOrigin — Wiggins MS" → "BiOrigin" (then normalized via normalizeName).
 * Plain strings like "Atlas Paper" are normalized directly.
 */
export function extractBase(fullName: string): string {
  const base = fullName.split(" — ")[0].trim()
  return normalizeName(base)
}

// ── USA customer-volume query ─────────────────────────────────────────────────

/**
 * Returns per-fiber monthly volume grouped by customer for the USA market,
 * using only Arauco Sales uploader data.
 *
 * Filtering contract (mirrors /api/usa-charts):
 *   1. CRM_FILTER — source = "CRM" (both importers use this)
 *   2. extractBase() normalization — collapses location variants to base name
 *   3. EXCLUDE set — removes non-Sales entries (James Hardie, Arauco NA, …)
 *   4. MIN_VOLUME — drops customers with negligible total ADT
 *
 * @returns Record<fiberCode, VolumeChartSeries> — pass directly to VolumeChart.
 *          Month keys in data points use the short YY-MM form.
 */
export async function getUSACustomerVolumeSeriesFromSales(params: {
  marketId: string
  months: string[]
}): Promise<Record<string, VolumeChartSeries>> {
  const { marketId, months } = params

  const orders = await prisma.orderRecord.findMany({
    where: {
      ...CRM_FILTER,
      // Arauco Sales gate: the Sales importer always stores freightPerAdmt (0
      // when freight is blank, positive otherwise).  CRM importer never sets it,
      // leaving NULL.  This filter is the authoritative way to exclude CRM-only
      // entries (e.g. plain "Sofidel" EKP MDP rows) from the Sales volume chart.
      freightPerAdmt: { not: null },
      month: { in: months },
      cycle: { marketId },
    },
    select: {
      month: true,
      volume: true,
      fiber: { select: { code: true } },
      customer: { select: { name: true } },
    },
  })

  // Normalise and filter to Arauco Sales customers only
  type NormOrder = { month: string; volume: number; fiberCode: string; customer: string }
  const normalised: NormOrder[] = orders
    .map((o) => ({
      month: o.month,
      volume: Number(o.volume),
      fiberCode: o.fiber.code,
      customer: extractBase(o.customer.name),
    }))
    .filter((o) => !EXCLUDE.has(o.customer.toLowerCase()))

  // Total volume per customer (across months + fibers) for MIN_VOLUME gate
  const totalByCustomer: Record<string, number> = {}
  for (const o of normalised) {
    totalByCustomer[o.customer] = (totalByCustomer[o.customer] ?? 0) + o.volume
  }
  const validCustomers = new Set(
    Object.entries(totalByCustomer)
      .filter(([, vol]) => vol >= MIN_VOLUME)
      .map(([name]) => name)
  )

  const filtered = normalised.filter((o) => validCustomers.has(o.customer))
  if (filtered.length === 0) return {}

  const fiberCodes = [...new Set(filtered.map((o) => o.fiberCode))]
  const result: Record<string, VolumeChartSeries> = {}

  for (const fiberCode of fiberCodes) {
    const fiberOrders = filtered.filter((o) => o.fiberCode === fiberCode)

    // Customers present for this fiber, sorted by total volume descending
    const fiberCustomerVol: Record<string, number> = {}
    for (const o of fiberOrders) {
      fiberCustomerVol[o.customer] = (fiberCustomerVol[o.customer] ?? 0) + o.volume
    }
    const customerNames = Object.entries(fiberCustomerVol)
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name)

    // Accumulate volume per (month, customer)
    const monthMap: Record<string, Record<string, number>> = {}
    for (const m of months) {
      monthMap[m] = {}
      for (const c of customerNames) monthMap[m][c] = 0
    }
    for (const o of fiberOrders) {
      if (monthMap[o.month]) {
        monthMap[o.month][o.customer] = (monthMap[o.month][o.customer] ?? 0) + o.volume
      }
    }

    result[fiberCode] = {
      data: months.map((m) => {
        const point: Record<string, string | number | null> = { month: m.slice(2) }
        let total = 0
        for (const c of customerNames) {
          const vol = monthMap[m]?.[c] || null
          point[c] = vol
          total += vol ?? 0
        }
        point["Total"] = total > 0 ? total : null
        return point
      }),
      customers: customerNames,
    }
  }

  return result
}
