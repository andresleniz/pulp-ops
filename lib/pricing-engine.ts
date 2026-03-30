import { prisma } from "@/lib/prisma"
import { PricingMethod } from "@prisma/client"
import Decimal from "decimal.js"
import { logAudit } from "@/lib/audit"

export interface ResolvedPrice {
  fiberId: string
  fiberCode: string
  millId: string | null
  millName: string | null
  customerId: string | null
  price: Decimal | null
  method: PricingMethod | null
  formulaSnapshot: string | null
  formulaReadable: string | null
  indexSnapshot: Record<string, number>
  isOverride: boolean
  overrideReason: string | null
  ruleId: string | null
}

export interface RecalculateResult {
  cycleId: string
  month: string
  marketId: string
  marketName: string
  prices: ResolvedPrice[]
  missingIndexes: string[]
  errors: string[]
}

export async function resolveIndexes(month: string): Promise<{ values: Record<string, number>; missing: string[] }> {
  const definitions = await prisma.indexDefinition.findMany({
    include: { values: { orderBy: { month: "desc" } } },
  })
  const values: Record<string, number> = {}
  const missing: string[] = []

  for (const def of definitions) {
    const key = def.name.toUpperCase().replace(/\s+/g, "_")
    const match = def.values.find((v) => v.month <= month)
    if (match) {
      values[key] = Number(match.value)
    } else {
      missing.push(def.name)
    }
  }

  return { values, missing }
}

export function evaluateFormula(expression: string, context: Record<string, number>): number {
  let expr = expression.trim()
  for (const [key, val] of Object.entries(context)) {
    expr = expr.replace(new RegExp(`\\b${key}\\b`, "g"), String(val))
  }
  if (!/^[\d\s+\-*/().]+$/.test(expr)) {
    throw new Error(`Unsafe expression after variable substitution: "${expr}"`)
  }
  // eslint-disable-next-line no-new-func
  const result = Function(`"use strict"; return (${expr});`)() as number
  if (typeof result !== "number" || !isFinite(result)) {
    throw new Error(`Formula evaluation returned invalid number: ${result}`)
  }
  return result
}

async function selectRule(
  marketId: string,
  fiberId: string,
  month: string,
  millId?: string | null,
  subgroupId?: string | null,
) {
  const rules = await prisma.pricingRule.findMany({
    where: {
      marketId,
      fiberId,
      isActive: true,
      activeFrom: { lte: month },
      OR: [{ activeTo: null }, { activeTo: { gte: month } }],
    },
    orderBy: { priority: "asc" },
  })

  if (rules.length === 0) return null

  if (millId) {
    const millMatch = rules.find((r) => r.millId === millId && !r.subgroupId)
    if (millMatch) return millMatch
  }

  if (subgroupId) {
    const sgMatch = rules.find((r) => r.subgroupId === subgroupId && !r.millId)
    if (sgMatch) return sgMatch
  }

  const marketMatch = rules.find((r) => !r.millId && !r.subgroupId)
  return marketMatch ?? null
}

async function resolveOnePrice(params: {
  marketId: string
  fiberId: string
  fiberCode: string
  month: string
  millId?: string | null
  millName?: string | null
  customerId?: string | null
  subgroupId?: string | null
  indexValues: Record<string, number>
  existingOverride?: { price: Decimal; reason: string | null } | null
}): Promise<ResolvedPrice> {
  const {
    marketId, fiberId, fiberCode, month,
    millId, millName, customerId, subgroupId,
    indexValues, existingOverride,
  } = params

  if (existingOverride) {
    return {
      fiberId, fiberCode,
      millId: millId ?? null, millName: millName ?? null,
      customerId: customerId ?? null,
      price: existingOverride.price,
      method: "manual",
      formulaSnapshot: "MANUAL_OVERRIDE",
      formulaReadable: "Manual override",
      indexSnapshot: indexValues,
      isOverride: true,
      overrideReason: existingOverride.reason,
      ruleId: null,
    }
  }

  const rule = await selectRule(marketId, fiberId, month, millId, subgroupId)

  if (!rule) {
    return {
      fiberId, fiberCode,
      millId: millId ?? null, millName: millName ?? null,
      customerId: customerId ?? null,
      price: null, method: null,
      formulaSnapshot: null, formulaReadable: "No rule found",
      indexSnapshot: indexValues,
      isOverride: false, overrideReason: null, ruleId: null,
    }
  }

  let price: Decimal | null = null

  if (rule.method === "manual" && rule.manualPrice !== null) {
    price = new Decimal(rule.manualPrice.toString())
  } else if (rule.method === "index_formula" && rule.formulaExpression) {
    try {
      const result = evaluateFormula(rule.formulaExpression, indexValues)
      price = new Decimal(Math.round(result))
    } catch (err) {
      return {
        fiberId, fiberCode,
        millId: millId ?? null, millName: millName ?? null,
        customerId: customerId ?? null,
        price: null, method: rule.method,
        formulaSnapshot: rule.formulaExpression,
        formulaReadable: rule.formulaReadable ?? rule.formulaExpression,
        indexSnapshot: indexValues,
        isOverride: false, overrideReason: String(err), ruleId: rule.id,
      }
    }
  } else if (rule.method === "subgroup_adjustment" && rule.formulaExpression) {
    const baseRule = await selectRule(marketId, fiberId, month, null, null)
    let basePrice: number | null = null
    if (baseRule?.method === "manual" && baseRule.manualPrice !== null) {
      basePrice = Number(baseRule.manualPrice)
    } else if (baseRule?.method === "index_formula" && baseRule.formulaExpression) {
      basePrice = Math.round(evaluateFormula(baseRule.formulaExpression, indexValues))
    }
    if (basePrice !== null && rule.adjustment !== null) {
      price = new Decimal(basePrice).add(new Decimal(rule.adjustment.toString()))
    }
  }

  return {
    fiberId, fiberCode,
    millId: millId ?? null, millName: millName ?? null,
    customerId: customerId ?? null,
    price,
    method: rule.method,
    formulaSnapshot: rule.formulaExpression,
    formulaReadable: rule.formulaReadable,
    indexSnapshot: indexValues,
    isOverride: false, overrideReason: null, ruleId: rule.id,
  }
}

export async function recalculateCycle(cycleId: string, changedBy = "system"): Promise<RecalculateResult> {
  const cycle = await prisma.monthlyCycle.findUnique({
    where: { id: cycleId },
    include: {
      market: { include: { mills: true, subgroups: true } },
      monthlyPrices: true,
    },
  })

  if (!cycle) throw new Error(`Cycle ${cycleId} not found`)

  const { values: indexValues, missing: missingIndexes } = await resolveIndexes(cycle.month)
  const errors: string[] = []
  const prices: ResolvedPrice[] = []

  const rules = await prisma.pricingRule.findMany({
    where: {
      marketId: cycle.marketId,
      isActive: true,
      activeFrom: { lte: cycle.month },
      OR: [{ activeTo: null }, { activeTo: { gte: cycle.month } }],
    },
    include: { fiber: true, mill: true, subgroup: true },
    orderBy: { priority: "asc" },
  })

  const targets: Array<{
    fiberId: string
    fiberCode: string
    millId: string | null
    millName: string | null
    subgroupId: string | null
    customerId: string | null
  }> = []

  for (const rule of rules) {
    const key = `${rule.fiberId}-${rule.millId ?? "null"}-${rule.subgroupId ?? "null"}`
    if (!targets.find((t) => `${t.fiberId}-${t.millId ?? "null"}-${t.subgroupId ?? "null"}` === key)) {
      targets.push({
        fiberId: rule.fiberId,
        fiberCode: rule.fiber.code,
        millId: rule.millId,
        millName: rule.mill?.name ?? null,
        subgroupId: rule.subgroupId,
        customerId: null,
      })
    }
  }

  for (const target of targets) {
    const existingPrice = cycle.monthlyPrices.find(
      (p) => p.fiberId === target.fiberId &&
        p.millId === target.millId &&
        p.customerId === target.customerId
    )
    const override = existingPrice?.isOverride
      ? { price: new Decimal(existingPrice.price!.toString()), reason: existingPrice.overrideReason }
      : null

    try {
      const resolved = await resolveOnePrice({
        marketId: cycle.marketId,
        fiberId: target.fiberId,
        fiberCode: target.fiberCode,
        month: cycle.month,
        millId: target.millId,
        millName: target.millName,
        customerId: target.customerId,
        subgroupId: target.subgroupId,
        indexValues,
        existingOverride: override,
      })

      prices.push(resolved)

      const oldPrice = existingPrice?.price ? Number(existingPrice.price) : null
      const newPrice = resolved.price ? Number(resolved.price) : null

   await prisma.monthlyPrice.upsert({
  where: {
    cycleId_fiberId_millId_customerId: {
      cycleId,
      fiberId: target.fiberId,
      millId: (target.millId ?? null) as any,
      customerId: (target.customerId ?? null) as any
    },
  },
  update: {
    price: resolved.price ? new Decimal(resolved.price.toString()) : undefined,
    pricingMethod: resolved.method ?? undefined,
    formulaSnapshot: resolved.formulaSnapshot,
    indexSnapshot: resolved.indexSnapshot,
    updatedAt: new Date(),
  },
  create: {
    cycleId,
    marketId: cycle.marketId,
    fiberId: target.fiberId,
    millId: target.millId,
    customerId: target.customerId,
    price: resolved.price ? new Decimal(resolved.price.toString()) : undefined,
    pricingMethod: resolved.method ?? undefined,
    formulaSnapshot: resolved.formulaSnapshot,
    isOverride: false,
    indexSnapshot: resolved.indexSnapshot,
  },
})
      if (oldPrice !== newPrice && newPrice !== null) {
        await logAudit({
          entity: "MonthlyPrice",
          entityId: cycleId,
          field: `${target.fiberCode}${target.millName ? ` (${target.millName})` : ""} price`,
          oldValue: oldPrice !== null ? String(oldPrice) : null,
          newValue: String(newPrice),
          changedBy,
          marketId: cycle.marketId,
          month: cycle.month,
          metadata: { formula: resolved.formulaSnapshot, indexes: indexValues },
        })
      }
    } catch (err) {
      errors.push(`${target.fiberCode}${target.millName ? ` ${target.millName}` : ""}: ${String(err)}`)
    }
  }

  return {
    cycleId,
    month: cycle.month,
    marketId: cycle.marketId,
    marketName: cycle.market.name,
    prices,
    missingIndexes,
    errors,
  }
}

export async function recalculateMonth(month: string, changedBy = "system"): Promise<RecalculateResult[]> {
  const cycles = await prisma.monthlyCycle.findMany({
    where: { month, cycleStatus: { not: "closed" } },
    select: { id: true },
  })
  const results = await Promise.all(cycles.map((c) => recalculateCycle(c.id, changedBy)))
  return results
}

export async function applyOverride(params: {
  cycleId: string
  fiberId: string
  millId?: string | null
  customerId?: string | null
  price: number
  reason: string
  changedBy?: string
}): Promise<void> {
  const { cycleId, fiberId, millId = null, customerId = null, price, reason, changedBy = "system" } = params

  const cycle = await prisma.monthlyCycle.findUnique({
    where: { id: cycleId },
    select: { marketId: true, month: true },
  })
  if (!cycle) throw new Error("Cycle not found")

  const existing = await prisma.monthlyPrice.findFirst({
  where: {
    cycleId,
    fiberId,
    millId: millId ?? null,
    customerId: customerId ?? null,
  },
})

  if (existing) {
  await prisma.monthlyPrice.update({
    where: { id: existing.id },
    data: {
      price: new Decimal(price),
      isOverride: true,
      overrideReason: reason,
      updatedAt: new Date(),
    },
  })
} else {
  await prisma.monthlyPrice.create({
    data: {
      cycleId,
      marketId: cycle.marketId,
      fiberId,
      millId: millId ?? null,
      customerId: customerId ?? null,
      price: new Decimal(price),
      isOverride: true,
      overrideReason: reason,
      pricingMethod: "manual",
    },
  })
}

  await logAudit({
    entity: "MonthlyPrice",
    entityId: cycleId,
    field: "price (override)",
    oldValue: existing?.price ? String(existing.price) : null,
    newValue: String(price),
    changedBy,
    marketId: cycle.marketId,
    month: cycle.month,
    metadata: { reason, millId, customerId },
  })
}

export async function getCyclePrices(cycleId: string) {
  return prisma.monthlyPrice.findMany({
    where: { cycleId },
    include: { fiber: true, mill: true, customer: true },
    orderBy: [{ fiber: { code: "asc" } }, { mill: { name: "asc" } }],
  })
}