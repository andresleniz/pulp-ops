/**
 * indexes-queries.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Centralised data layer for the Indexes page regional snapshot view.
 *
 * OWNERSHIP
 *   - INDEX_REGION_CONFIG   fixed region → card definitions (label, dbName,
 *                           publisher, tags).  All label/mapping/tag logic
 *                           lives here — not in components.
 *   - getIndexesPageSnapshotByRegion()   fetches snapshot values for every card
 *                           in every region and returns structured results.
 *
 * DATA SCOPE
 *   Only Fastmarkets and TTO data is surfaced.
 *   - "Fastmarkets" rows:  source = 'Fastmarkets'
 *   - TTO observed rows:   source IS NULL  (legacy import before source stamp)
 *   - Forecast rows are never used as the primary displayed value.
 *   - Future-dated rows are excluded (month >= nextMonth filter).
 *
 * NULL-SOURCE HANDLING
 *   The observed-data predicate is:
 *     OR: [{ source: null }, { source: { not: "forecast" } }]
 *   This is required because PostgreSQL's `source != 'forecast'` excludes NULL
 *   rows.  The OR branch explicitly captures null-source TTO observed data.
 *
 * SNAPSHOT RULES (per card)
 *   1. Find latest observed value within [currentMonth, nextMonth).
 *      → status = "current"
 *   2. If none, find latest observed value overall.
 *      → status = "stale"
 *   3. If no observed value exists at all (or dbName is null / not in DB).
 *      → status = "missing", value = null
 *
 * MISSING CARDS
 *   Cards with dbName = null are rendered explicitly with status = "missing".
 *   Cards whose dbName is not found in the DB also render as "missing".
 *   Nothing is silently omitted.
 */

import { prisma } from "@/lib/prisma"

// ── Types ─────────────────────────────────────────────────────────────────────

export type IndexCardStatus = "current" | "stale" | "missing"

/**
 * How a card's label relates to the underlying data:
 *   direct      — a real FM or TTO series is mapped; value reflects actual observations
 *   unavailable — no FM/TTO series has been acquired for this concept yet;
 *                 the card is shown explicitly so the gap is visible, not silently omitted
 *
 * "derived" is reserved for future use (e.g. a calculated spread).
 * It is not used in the current config.
 */
export type IndexMappingType = "direct" | "unavailable"

export type IndexCardData = {
  label: string
  mappingType: IndexMappingType
  /** Exact IndexDefinition.name in DB, or null when not yet seeded. */
  dbName: string | null
  /** Rounded to 2 decimal places, or null when no observed data. */
  value: number | null
  /** Month key as stored (YYYY-MM or YYYY-MM-DD for weekly series). */
  observationDate: string | null
  status: IndexCardStatus
  /** "Fastmarkets" | "TTO" — falls back to publisher from config for null-source rows. */
  source: string | null
  tags: string[]
}

export type RegionSnapshot = {
  region: string
  cards: IndexCardData[]
}

// ── Card definition type (internal) ──────────────────────────────────────────

type CardDef = {
  label: string
  mappingType: IndexMappingType
  dbName: string | null
  /** Used as source display label for null-source rows (TTO legacy). */
  publisher: "Fastmarkets" | "TTO"
  tags: string[]
}

// ── Region → index config ─────────────────────────────────────────────────────
//
// MAPPING NOTES
//   PIX China          ← DB "PIX China"               (FM symbol FP-PLP-0033, BHKP hardwood)
//   TTO China BHK      ← DB "TTO China BHK"            (null-source observed data)
//   PIX China Softwood ← DB "FM: PIX Pulp China NBSK Net"
//   TTO Global UKP     ← DB "TTO Global UKP UKP"
//   RISI Europe HW     ← DB "RISI Europe HW"           (FM symbol FP-PLP-0040, European BHKP benchmark → List)
//   RISI Europe HW Spot  ← no DB series yet → missing
//   RISI Europe Softwood List/Spot ← no DB series yet → missing
//   TTO North America BHK ← DB "TTO North America BHK" (null-source observed)
//   RISI USA HW        ← DB "RISI USA HW"              (FM symbol FP-PLP-0027, BHK spot US East)
//   RISI USA HW List   ← no DB series yet → missing
//   TTO North America NBSK/SBSK ← DB "TTO North America NBSK/SBSK"

export const INDEX_REGION_CONFIG: { region: string; cards: CardDef[] }[] = [
  {
    region: "China",
    cards: [
      {
        label: "PIX China Hardwood",
        mappingType: "direct",
        dbName: "PIX China",
        publisher: "Fastmarkets",
        tags: ["China", "Fastmarkets", "Hardwood"],
      },
      {
        label: "TTO China Hardwood",
        mappingType: "direct",
        dbName: "TTO China BHK",
        publisher: "TTO",
        tags: ["China", "TTO", "Hardwood"],
      },
      {
        label: "PIX China Softwood",
        mappingType: "direct",
        dbName: "FM: PIX Pulp China NBSK Net",
        publisher: "Fastmarkets",
        tags: ["China", "Fastmarkets", "Softwood", "NBSK"],
      },
      {
        label: "TTO UKP Global",
        mappingType: "direct",
        dbName: "TTO Global UKP UKP",
        publisher: "TTO",
        tags: ["China", "TTO", "UKP", "Global"],
      },
    ],
  },
  {
    region: "Europe",
    cards: [
      {
        // FP-PLP-0040: "PIX Pulp BHKP USD — European BHKP benchmark" → list/benchmark price.
        // Only one European HW FM series exists; it is a list/benchmark, not a spot transaction.
        label: "RISI Europe HW List",
        mappingType: "direct",
        dbName: "RISI Europe HW",
        publisher: "Fastmarkets",
        tags: ["Europe", "Fastmarkets", "Hardwood", "List"],
      },
      {
        // No FM European HW spot series has been acquired. Card shown explicitly as unavailable
        // so the gap is visible. Do not map to RISI Europe HW (that series is already List).
        label: "RISI Europe HW Spot",
        mappingType: "unavailable",
        dbName: null,
        publisher: "Fastmarkets",
        tags: ["Europe", "Fastmarkets", "Hardwood", "Spot"],
      },
      {
        // No FM European softwood series has been acquired.
        label: "RISI Europe Softwood List",
        mappingType: "unavailable",
        dbName: null,
        publisher: "Fastmarkets",
        tags: ["Europe", "Fastmarkets", "Softwood", "List"],
      },
      {
        // No FM European softwood series has been acquired.
        label: "RISI Europe Softwood Spot",
        mappingType: "unavailable",
        dbName: null,
        publisher: "Fastmarkets",
        tags: ["Europe", "Fastmarkets", "Softwood", "Spot"],
      },
    ],
  },
  {
    region: "North America",
    cards: [
      {
        label: "TTO USA Hardwood",
        mappingType: "direct",
        dbName: "TTO North America BHK",
        publisher: "TTO",
        tags: ["North America", "TTO", "Hardwood"],
      },
      {
        // FP-PLP-0027: "BHK spot price, delivered US East" → confirmed Spot.
        label: "RISI USA HW Spot",
        mappingType: "direct",
        dbName: "RISI USA HW",
        publisher: "Fastmarkets",
        tags: ["North America", "Fastmarkets", "Hardwood", "Spot"],
      },
      {
        // No FM USA HW list/benchmark series has been acquired.
        // FM: "bleached hardwood kraft, eucalyptus, Brazil→US East" is NOT the same
        // concept — it is a specific origin route, not a USA market benchmark.
        label: "RISI USA HW List",
        mappingType: "unavailable",
        dbName: null,
        publisher: "Fastmarkets",
        tags: ["North America", "Fastmarkets", "Hardwood", "List"],
      },
      {
        label: "TTO NBSK",
        mappingType: "direct",
        dbName: "TTO North America NBSK",
        publisher: "TTO",
        tags: ["North America", "TTO", "Softwood", "NBSK"],
      },
      {
        label: "TTO SBSK",
        mappingType: "direct",
        dbName: "TTO North America SBSK",
        publisher: "TTO",
        tags: ["North America", "TTO", "Softwood", "SBSK"],
      },
    ],
  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Observed-data predicate for IndexValue queries.
 *
 * Includes null-source rows (legacy TTO observed data) explicitly because
 * PostgreSQL's `source != 'forecast'` condition excludes NULL rows.
 */
function observedWhere(indexId: string) {
  return {
    indexId,
    OR: [{ source: null }, { source: { not: "forecast" } }],
  }
}

function nextMonthStr(month: string): string {
  const [y, m] = month.split("-").map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`
}

// ── Main query ────────────────────────────────────────────────────────────────

/**
 * Returns all three regions with per-card snapshot data for the Indexes page.
 *
 * @param currentMonth  YYYY-MM string — used as the current-month window anchor.
 */
export async function getIndexesPageSnapshotByRegion(
  currentMonth: string
): Promise<RegionSnapshot[]> {
  const nextMonth = nextMonthStr(currentMonth)
  const results: RegionSnapshot[] = []

  for (const regionDef of INDEX_REGION_CONFIG) {
    const cards: IndexCardData[] = []

    for (const cardDef of regionDef.cards) {
      // unavailable — no FM/TTO series acquired for this concept yet
      if (cardDef.mappingType === "unavailable") {
        cards.push({
          label: cardDef.label,
          mappingType: "unavailable",
          dbName: null,
          value: null,
          observationDate: null,
          status: "missing",
          source: null,
          tags: cardDef.tags,
        })
        continue
      }

      const def = await prisma.indexDefinition.findFirst({
        where: { name: cardDef.dbName! },
      })

      // Mapped but not yet in DB — treat same as unavailable at runtime
      if (!def) {
        cards.push({
          label: cardDef.label,
          mappingType: cardDef.mappingType,
          dbName: cardDef.dbName,
          value: null,
          observationDate: null,
          status: "missing",
          source: null,
          tags: cardDef.tags,
        })
        continue
      }

      const base = observedWhere(def.id)

      // 1. Try current-month window (handles YYYY-MM and YYYY-MM-DD keys)
      const current = await prisma.indexValue.findFirst({
        where: { ...base, month: { gte: currentMonth, lt: nextMonth } },
        orderBy: { month: "desc" },
      })

      if (current) {
        cards.push({
          label: cardDef.label,
          mappingType: cardDef.mappingType,
          dbName: cardDef.dbName,
          value: Math.round(Number(current.value) * 100) / 100,
          observationDate: current.month,
          status: "current",
          source: current.source ?? cardDef.publisher,
          tags: cardDef.tags,
        })
        continue
      }

      // 2. Fallback: latest observed value across all months → stale
      const latest = await prisma.indexValue.findFirst({
        where: base,
        orderBy: { month: "desc" },
      })

      if (!latest) {
        cards.push({
          label: cardDef.label,
          mappingType: cardDef.mappingType,
          dbName: cardDef.dbName,
          value: null,
          observationDate: null,
          status: "missing",
          source: null,
          tags: cardDef.tags,
        })
        continue
      }

      cards.push({
        label: cardDef.label,
        mappingType: cardDef.mappingType,
        dbName: cardDef.dbName,
        value: Math.round(Number(latest.value) * 100) / 100,
        observationDate: latest.month,
        status: "stale",
        source: latest.source ?? cardDef.publisher,
        tags: cardDef.tags,
      })
    }

    results.push({ region: regionDef.region, cards })
  }

  return results
}
