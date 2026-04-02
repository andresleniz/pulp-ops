/**
 * price-queries.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Centralized helpers for all price-related analytics queries.
 *
 * SOURCE PRECEDENCE MODEL
 * ────────────────────────
 * Default (all markets):
 *   CRM is the authoritative price source. MonthlyPrice records are populated
 *   by CRM import and represent the effective/decided price for each cycle.
 *   Manual overrides (applyOverride / addPriceRow) replace the MonthlyPrice
 *   record for the cycle and act as a fallback when CRM data is absent.
 *   On the next CRM re-import, manual prices are overwritten back to CRM.
 *
 * Japan exception (SOLE EXCEPTION):
 *   Japan ships first and adjusts price post-shipment via credit notes that
 *   do not appear correctly in CRM. Therefore, for Japan:
 *   - Manual price inputs supersede CRM prices in all price-related analytics.
 *   - CRM import deliberately skips overwriting a Japan MonthlyPrice that was
 *     manually set (enforced in lib/crm-importer.ts via isManualPrice check).
 *   - The effective price for Japan is: manual override if one exists, else CRM.
 *   - This is already stored correctly in MonthlyPrice — no extra read-time
 *     logic is needed. This helper documents and centralises the contract.
 *
 * VOLUME ANALYTICS
 *   Volume charts always use OrderRecord with source = "CRM" (via CRM_FILTER).
 *   The Japan pricing exception does NOT extend to volume.
 *
 * USAGE
 *   import { getEffectiveMonthlyPrices, JAPAN_MARKET } from "@/lib/price-queries"
 *   const prices = await getEffectiveMonthlyPrices({ marketId, marketName, months })
 */

import { prisma } from "@/lib/prisma"
import { isManualPrice } from "@/lib/price-source"
import type { Fiber, Customer, Mill, MonthlyCycle } from "@prisma/client"

/** The only market where manual prices supersede CRM in price analytics. */
export const JAPAN_MARKET = "Japan"

export interface EffectiveMonthlyPrice {
  id: string
  price: number
  fiberId: string
  millId: string | null
  customerId: string | null
  formulaSnapshot: string | null
  isOverride: boolean
  /** Resolved effective source for this record. */
  effectiveSource: "crm" | "manual"
  fiber: Fiber
  mill: Mill | null
  customer: Customer | null
  cycle: MonthlyCycle
}

/**
 * Returns effective monthly prices for a market across the given months.
 *
 * For Japan:    MonthlyPrice may contain manual overrides (preserved through
 *               CRM re-imports). effectiveSource = "manual" for those records.
 * For non-Japan: MonthlyPrice is CRM-backed. Any manual override present means
 *               CRM has not yet been re-imported for that month; it will be
 *               overwritten on next import. effectiveSource = "manual" for
 *               those fallback records.
 *
 * In both cases the record returned IS the effective price — callers do not
 * need to branch on market name. The effectiveSource field is informational.
 */
export async function getEffectiveMonthlyPrices(params: {
  marketId: string
  marketName: string
  months: string[]
}): Promise<EffectiveMonthlyPrice[]> {
  const { marketId, months } = params

  const raw = await prisma.monthlyPrice.findMany({
    where: {
      marketId,
      price: { not: null },
      cycle: { month: { in: months } },
    },
    include: { fiber: true, mill: true, customer: true, cycle: true },
    orderBy: { cycle: { month: "asc" } },
  })

  return raw
    .filter((p) => p.price !== null)
    .map((p) => ({
      id: p.id,
      price: Number(p.price),
      fiberId: p.fiberId,
      millId: p.millId,
      customerId: p.customerId,
      formulaSnapshot: p.formulaSnapshot,
      isOverride: p.isOverride,
      effectiveSource: isManualPrice(p.formulaSnapshot, p.isOverride) ? "manual" : "crm",
      fiber: p.fiber,
      mill: p.mill,
      customer: p.customer,
      cycle: p.cycle,
    }))
}

/**
 * Returns the effective price for a single customer/fiber/month combination.
 * Null if no price record exists.
 */
export async function getEffectivePrice(params: {
  cycleId: string
  fiberId: string
  customerId: string | null
  millId?: string | null
}): Promise<number | null> {
  const record = await prisma.monthlyPrice.findFirst({
    where: {
      cycleId: params.cycleId,
      fiberId: params.fiberId,
      customerId: params.customerId ?? null,
      millId: params.millId ?? null,
      price: { not: null },
    },
    select: { price: true },
  })
  return record?.price ? Number(record.price) : null
}

/**
 * Assertion: verify the Japan pricing contract is intact for a given cycle.
 * Returns details of any MonthlyPrice records that would be at risk.
 * Use in scripts or health-check routes.
 */
export async function assertJapanPricingIntegrity(cycleId: string): Promise<{
  cycleId: string
  manualPricesPreserved: number
  crmPricesFallback: number
  details: { customer: string | null; fiber: string; source: "manual" | "crm" }[]
}> {
  const prices = await prisma.monthlyPrice.findMany({
    where: { cycleId },
    include: { fiber: true, customer: true },
  })

  const details = prices.map((p) => ({
    customer: p.customer?.name ?? null,
    fiber: p.fiber.code,
    source: isManualPrice(p.formulaSnapshot, p.isOverride) ? "manual" as const : "crm" as const,
  }))

  return {
    cycleId,
    manualPricesPreserved: details.filter((d) => d.source === "manual").length,
    crmPricesFallback: details.filter((d) => d.source === "crm").length,
    details,
  }
}
