import { prisma } from "@/lib/prisma"
import { logAudit } from "@/lib/audit"
import { isManualPrice } from "@/lib/price-source"
import { validateOrderWrite, evictManualOrders } from "@/lib/order-validation"
import Decimal from "decimal.js"

const COUNTRY_TO_MARKET: Record<string, string> = {
  // Asia Pacific
  "TW - Taiwan": "Taiwan",
  "JP - Japan": "Japan",
  "KR - South Korea": "Korea",
  "NZ - New Zealand": "New Zealand",
  // Middle East
  "AE - Utd.Arab.Emir.": "UAE",
  // North America
  "US - USA": "USA",
  // South / Southeast Asia
  "PK - Pakistan": "Pakistan",
  "TH - Thailand": "Thailand",
  "IN - India": "India",
  "MY - Malaysia": "Malaysia",
  "VN - Vietnam": "Vietnam",
  // Turkey — its own market
  "TR - Turkey": "Turkey",
  // Europe — all European countries roll into the Europe market unless already
  // mapped above.  Add entries here as new country codes appear in CRM files.
  "DE - Germany": "Europe",
  "FR - France": "Europe",
  "IT - Italy": "Europe",
  "ES - Spain": "Europe",
  "PT - Portugal": "Europe",
  "PL - Poland": "Europe",
  "NL - Netherlands": "Europe",
  "BE - Belgium": "Europe",
  "SE - Sweden": "Europe",
  "NO - Norway": "Europe",
  "FI - Finland": "Europe",
  "DK - Denmark": "Europe",
  "AT - Austria": "Europe",
  "CH - Switzerland": "Europe",
  "GB - United Kingdom": "Europe",
  "GB - U.K.": "Europe",
  "IE - Ireland": "Europe",
  "CZ - Czech Republic": "Europe",
  "CZ - Czech Rep.": "Europe",
  "HU - Hungary": "Europe",
  "RO - Romania": "Europe",
  "BG - Bulgaria": "Europe",
  "HR - Croatia": "Europe",
  "SK - Slovakia": "Europe",
  "SI - Slovenia": "Europe",
  "LV - Latvia": "Europe",
  "LT - Lithuania": "Europe",
  "EE - Estonia": "Europe",
  "LU - Luxembourg": "Europe",
  "GR - Greece": "Europe",
  "RS - Serbia": "Europe",
  "BA - Bosnia-Herzegov.": "Europe",
  "BA - Bosnia and Herzegovina": "Europe",
  "MK - North Macedonia": "Europe",
  "UA - Ukraine": "Europe",
}

const US_MILL_TO_CUSTOMER: Record<string, string> = {
  "PC1L": "James Hardie",
  "EA3E": "Sofidel",
  "EM1E": "Sofidel",
}

function normalizeGrade(grade: string): string | null {
  if (!grade) return null
  const g = grade.toUpperCase().trim()
  if (g === "BKP") return "BKP"
  if (g === "EKP MDP") return "EKP MDP"   // must precede the startsWith("EKP") check
  if (g.startsWith("EKP")) return "EKP"
  if (g.startsWith("UKP")) return "UKP"
  return null
}

// Maps ISO 2-letter prefix (from CRM country codes like "DE - Germany") to a
// clean display name.  Used to populate OrderRecord.country for Europe orders.
const ISO_TO_COUNTRY: Record<string, string> = {
  "DE": "Germany",
  "FR": "France",
  "IT": "Italy",
  "ES": "Spain",
  "PT": "Portugal",
  "PL": "Poland",
  "NL": "Netherlands",
  "BE": "Belgium",
  "SE": "Sweden",
  "NO": "Norway",
  "FI": "Finland",
  "DK": "Denmark",
  "AT": "Austria",
  "CH": "Switzerland",
  "GB": "United Kingdom",
  "IE": "Ireland",
  "CZ": "Czech Republic",
  "HU": "Hungary",
  "RO": "Romania",
  "BG": "Bulgaria",
  "HR": "Croatia",
  "SK": "Slovakia",
  "SI": "Slovenia",
  "LV": "Latvia",
  "LT": "Lithuania",
  "EE": "Estonia",
  "LU": "Luxembourg",
  "GR": "Greece",
  "RS": "Serbia",
  "BA": "Bosnia-Herzegovina",
  "MK": "North Macedonia",
  "UA": "Ukraine",
}

function extractCountryName(countryCode: string | null): string | null {
  if (!countryCode) return null
  const iso = countryCode.split(" - ")[0].trim()
  return ISO_TO_COUNTRY[iso] ?? null
}

const MONTH_MAP: Record<string, string> = {
  January: "01", February: "02", March: "03", April: "04",
  May: "05", June: "06", July: "07", August: "08",
  September: "09", October: "10", November: "11", December: "12",
}

function toYearMonth(year: string | number, month: string): string | null {
  const m = MONTH_MAP[month]
  if (!m || !year) return null
  return `${year}-${m}`
}

export interface CRMRow {
  orderRef: string | null
  year: string | number | null
  month: string | null
  country: string | null
  customer: string | null
  grade: string | null
  volume: number | null
  price: number | null
  mill: string | null
  comments: string | null
  destinationPort: string | null
}

export interface ImportResult {
  total: number
  imported: number
  skipped: number
  created: number
  updated: number
  evicted: number
  errors: string[]
  rejections: string[]
}

/**
 * Ensures that a MonthlyCycle exists for every active market for the given month.
 * Cycles for markets that do not yet have one are created with default "open" status.
 * The Set `initialized` is used as a guard so the fan-out only runs once per month
 * per import run, regardless of how many CRM rows share that month.
 */
async function ensureAllMarketCycles(
  yearMonth: string,
  allMarkets: { id: string }[],
  initialized: Set<string>,
): Promise<void> {
  if (initialized.has(yearMonth)) return
  initialized.add(yearMonth)

  for (const m of allMarkets) {
    const exists = await prisma.monthlyCycle.findUnique({
      where: { month_marketId: { month: yearMonth, marketId: m.id } },
      select: { id: true },
    })
    if (!exists) {
      await prisma.monthlyCycle.create({
        data: { month: yearMonth, marketId: m.id, owner: "System" },
      })
    }
  }
}

export async function importCRMRows(rows: CRMRow[]): Promise<ImportResult> {
  const result: ImportResult = {
    total: rows.length,
    imported: 0,
    skipped: 0,
    created: 0,
    updated: 0,
    evicted: 0,
    errors: [],
    rejections: [],
  }

  const markets = await prisma.market.findMany()
  const fibers = await prisma.fiber.findMany()
  const customers = await prisma.customer.findMany()

  // Tracks which months have already had cycles created for all markets this run
  const globallyInitializedMonths = new Set<string>()

  for (const row of rows) {
    try {
      const yearMonth = row.year && row.month
        ? toYearMonth(row.year, row.month)
        : null
      if (!yearMonth) { result.skipped++; continue }

      const marketName = row.country ? COUNTRY_TO_MARKET[row.country] : null
      if (!marketName) { result.skipped++; continue }
      const market = markets.find((m) => m.name === marketName)
      if (!market) { result.skipped++; continue }

      const fiberCode = normalizeGrade(row.grade ?? "")
      if (!fiberCode) { result.skipped++; continue }
      const fiber = fibers.find((f) => f.code === fiberCode)
      if (!fiber) { result.skipped++; continue }

      let customerName: string
      if (row.country === "US - USA" && row.mill) {
        customerName = US_MILL_TO_CUSTOMER[row.mill] ?? row.customer ?? "Unknown"
      } else {
        customerName = row.customer ?? "Unknown"
      }

      let customer = customers.find(
        (c) =>
          c.marketId === market.id &&
          c.name.toLowerCase() === customerName.toLowerCase()
      )
      if (!customer) {
        customer = await prisma.customer.create({
          data: { marketId: market.id, name: customerName, isDirectContact: true },
        })
        customers.push(customer)
      }

      const volume = row.volume && row.volume > 0 ? row.volume : null
      const price = row.price && row.price > 0 ? row.price : null
      if (!volume || !price) { result.skipped++; continue }

      // Validate before any DB write
      const validation = validateOrderWrite({
        cycleId: "pending", // ref/price validation only at this stage
        customerId: customer.id,
        fiberId: fiber.id,
        source: "CRM",
        reference: row.orderRef,
        volume,
        price,
      })
      if (!validation.allowed) {
        result.rejections.push(`${customerName} ${yearMonth} ${fiberCode}: ${validation.reason}`)
        result.skipped++
        continue
      }

      // Ensure every market has a cycle for this month before writing CRM data.
      // This fan-out runs at most once per unique month per import run.
      await ensureAllMarketCycles(yearMonth, markets, globallyInitializedMonths)

      let cycle = await prisma.monthlyCycle.findUnique({
        where: { month_marketId: { month: yearMonth, marketId: market.id } },
      })
      if (!cycle) {
        cycle = await prisma.monthlyCycle.create({
          data: {
            month: yearMonth, marketId: market.id,
            owner: "CRM Import", priceStatus: "decided",
            commStatus: "confirmed", orderStatus: "ordered",
            cycleStatus: "closed", closedAt: new Date(),
          },
        })
      }

      // Evict any manual orders for this customer+grade+cycle before writing CRM data
      const evictedIds = await evictManualOrders({
        cycleId: cycle.id,
        customerId: customer.id,
        fiberId: fiber.id,
        marketId: market.id,
        month: yearMonth,
      })
      result.evicted += evictedIds.length

      const existingOrder = row.orderRef
        ? await prisma.orderRecord.findFirst({
            where: { reference: row.orderRef, cycleId: cycle.id },
          })
        : null

      // For Europe orders, store the country name so we can chart by country
      const countryName = marketName === "Europe" ? extractCountryName(row.country) : null

      if (existingOrder) {
        await prisma.orderRecord.update({
          where: { id: existingOrder.id },
          data: {
            volume: new Decimal(volume),
            price: new Decimal(price),
            source: "CRM",
            status: "ordered",
            notes: row.comments ?? null,
            destinationPort: row.destinationPort?.trim() || null,
            country: countryName,
          },
        })
        result.updated++
      } else {
        await prisma.orderRecord.create({
          data: {
            month: yearMonth, cycleId: cycle.id,
            customerId: customer.id, fiberId: fiber.id,
            volume: new Decimal(volume),
            price: new Decimal(price),
            source: "CRM",
            status: "ordered",
            reference: row.orderRef ?? null,
            notes: row.comments ?? null,
            destinationPort: row.destinationPort?.trim() || null,
            country: countryName,
          },
        })
        result.created++

        const existingPrice = await prisma.monthlyPrice.findFirst({
          where: { cycleId: cycle.id, fiberId: fiber.id, millId: null, customerId: customer.id },
        })

        // Japan rule: manual prices always supersede CRM — never overwrite them
        const isJapan = market.name === "Japan"
        const skipUpdate = isJapan && existingPrice &&
          isManualPrice(existingPrice.formulaSnapshot, existingPrice.isOverride)

        if (!skipUpdate) {
          if (existingPrice) {
            await prisma.monthlyPrice.update({
              where: { id: existingPrice.id },
              data: { price: new Decimal(price), pricingMethod: "manual", formulaSnapshot: "CRM Import", updatedAt: new Date() },
            })
          } else {
            await prisma.monthlyPrice.create({
              data: {
                cycleId: cycle.id, marketId: market.id,
                fiberId: fiber.id, customerId: customer.id,
                price: new Decimal(price),
                pricingMethod: "manual",
                formulaSnapshot: "CRM Import",
                isOverride: false,
              },
            })
          }
        }
      }

      result.imported++
    } catch (err) {
      result.errors.push(`Row error: ${String(err)}`)
    }
  }

  await logAudit({
    entity: "CRMImport", entityId: "bulk", field: "import",
    oldValue: null,
    newValue: `${result.imported} rows (${result.created} created, ${result.updated} updated, ${result.evicted} manual rows evicted)`,
    changedBy: "Andrés",
  })

  return result
}

// ── USA Sales Import ────────────────────────────────────────────────────────

const USA_MONTH_MAP: Record<string, string> = {
  "January": "01", "Jan": "01",
  "February": "02", "Feb": "02",
  "March": "03", "Mar": "03",
  "April": "04", "Apr": "04",
  "May": "05",
  "June": "06", "Jun": "06",
  "July": "07", "Jul": "07",
  "August": "08", "Aug": "08",
  "September": "09", "Sept": "09", "Sep": "09",
  "October": "10", "Oct": "10",
  "November": "11", "Nov": "11",
  "December": "12", "Dec": "12",
}

export function parseSheetMonth(sheetName: string): string | null {
  const parts = sheetName.trim().split(" ")
  if (parts.length < 2) return null
  const monthStr = parts[0]
  const yearStr = parts[parts.length - 1]
  const m = USA_MONTH_MAP[monthStr]
  if (!m || !yearStr.match(/^\d{4}$/)) return null
  return `${yearStr}-${m}`
}

function locationLabel(customer: string, cityState: string): string {
  const city = cityState.split(",")[0].trim()
  return `${customer.trim()} — ${city}`
}

export interface USARow {
  month: string
  customer: string
  location: string
  volume: number | null
  price: number | null
  freightPerAdmt: number | null
  notes: string | null
  destinationPort: string | null
}

export async function importUSARows(rows: USARow[]): Promise<ImportResult> {
  const result: ImportResult = {
    total: rows.length,
    imported: 0,
    skipped: 0,
    created: 0,
    updated: 0,
    evicted: 0,
    errors: [],
    rejections: [],
  }

  const usaMarket = await prisma.market.findUnique({ where: { name: "USA" } })
  if (!usaMarket) { result.errors.push("USA market not found"); return result }

  const fEKP = await prisma.fiber.findUnique({ where: { code: "EKP" } })
  if (!fEKP) { result.errors.push("EKP fiber not found"); return result }

  const allMarkets = await prisma.market.findMany({ select: { id: true } })
  const customers = await prisma.customer.findMany({ where: { marketId: usaMarket.id } })
  const globallyInitializedMonths = new Set<string>()

  for (const row of rows) {
    try {
      if (!row.month || !row.customer || !row.price || row.price <= 0) {
        result.skipped++
        continue
      }

      const fullName = row.location
        ? locationLabel(row.customer, row.location)
        : row.customer.trim()

      let customer = customers.find(
        (c) => c.name.toLowerCase().trim() === fullName.toLowerCase().trim()
      )
      if (!customer) {
        customer = await prisma.customer.create({
          data: { marketId: usaMarket.id, name: fullName, isDirectContact: true },
        })
        customers.push(customer)
      }

      // Validate before any DB write
      const validation = validateOrderWrite({
        cycleId: "pending",
        customerId: customer.id,
        fiberId: fEKP.id,
        source: "CRM",
        reference: null,
        volume: row.volume ?? 1,
        price: row.price,
      })
      if (!validation.allowed) {
        result.rejections.push(`${fullName} ${row.month}: ${validation.reason}`)
        result.skipped++
        continue
      }

      // Ensure every market has a cycle for this month before writing USA data.
      await ensureAllMarketCycles(row.month, allMarkets, globallyInitializedMonths)

      let cycle = await prisma.monthlyCycle.findUnique({
        where: { month_marketId: { month: row.month, marketId: usaMarket.id } },
      })
      if (!cycle) {
        cycle = await prisma.monthlyCycle.create({
          data: {
            month: row.month, marketId: usaMarket.id,
            owner: "USA Import", priceStatus: "decided",
            commStatus: "confirmed", orderStatus: "ordered",
            cycleStatus: "closed", closedAt: new Date(),
          },
        })
      }

      // Evict any manual orders for this customer+grade+cycle
      const evictedIds = await evictManualOrders({
        cycleId: cycle.id,
        customerId: customer.id,
        fiberId: fEKP.id,
        marketId: usaMarket.id,
        month: row.month,
      })
      result.evicted += evictedIds.length

      const existingOrder = await prisma.orderRecord.findFirst({
        where: {
          cycleId: cycle.id,
          customerId: customer.id,
          fiberId: fEKP.id,
          price: new Decimal(row.price),
          source: "CRM",
        },
      })

      if (!existingOrder) {
        await prisma.orderRecord.create({
          data: {
            month: row.month, cycleId: cycle.id,
            customerId: customer.id, fiberId: fEKP.id,
            volume: new Decimal(row.volume ?? 0),
            price: new Decimal(row.price),
            freightPerAdmt: row.freightPerAdmt != null
              ? new Decimal(row.freightPerAdmt)
              : null,
            source: "CRM",
            status: "ordered",
            notes: row.notes ?? null,
            destinationPort: row.destinationPort?.trim() || null,
          },
        })
        result.created++
      } else {
        result.updated++
      }

      const existingPrice = await prisma.monthlyPrice.findFirst({
        where: { cycleId: cycle.id, fiberId: fEKP.id, customerId: customer.id, millId: null },
      })

      if (existingPrice) {
        await prisma.monthlyPrice.update({
          where: { id: existingPrice.id },
          data: { price: new Decimal(row.price), updatedAt: new Date() },
        })
      } else {
        await prisma.monthlyPrice.create({
          data: {
            cycleId: cycle.id, marketId: usaMarket.id,
            fiberId: fEKP.id, customerId: customer.id,
            price: new Decimal(row.price),
            pricingMethod: "manual",
            formulaSnapshot: "USA Sales Import",
            isOverride: false,
          },
        })
      }

      result.imported++
    } catch (err) {
      result.errors.push(`${row.customer} ${row.month}: ${String(err)}`)
    }
  }

  await logAudit({
    entity: "USAImport", entityId: "bulk", field: "import",
    oldValue: null,
    newValue: `${result.imported} rows (${result.created} created, ${result.updated} updated, ${result.evicted} manual rows evicted)`,
    changedBy: "Andrés",
  })

  return result
}
