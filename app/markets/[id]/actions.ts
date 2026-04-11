"use server"

import { prisma } from "@/lib/prisma"
import { logAudit } from "@/lib/audit"
import { revalidatePath } from "next/cache"
import { CycleStatus, PriceStatus, CommStatus, OrderStatus } from "@prisma/client"
import Decimal from "decimal.js"

export async function updateCycleStatus(formData: FormData) {
  const cycleId = formData.get("cycleId") as string
  const field = formData.get("field") as string
  const value = formData.get("value") as string

  const cycle = await prisma.monthlyCycle.findUnique({
    where: { id: cycleId },
    include: { market: true },
  })
  if (!cycle) throw new Error("Cycle not found")

  const oldValue = (cycle as Record<string, unknown>)[field] as string
  const updateData: Record<string, unknown> = {}

  if (field === "priceStatus") updateData.priceStatus = value as PriceStatus
  else if (field === "commStatus") updateData.commStatus = value as CommStatus
  else if (field === "orderStatus") updateData.orderStatus = value as OrderStatus
  else if (field === "cycleStatus") {
    updateData.cycleStatus = value as CycleStatus
    if (value === "closed") updateData.closedAt = new Date()
  } else if (field === "onHold") updateData.onHold = value === "true"
  else if (field === "holdReason") updateData.holdReason = value
  else if (field === "internalNotes") updateData.internalNotes = value

  await prisma.monthlyCycle.update({ where: { id: cycleId }, data: updateData })

  await logAudit({
    entity: "MonthlyCycle",
    entityId: cycleId,
    field,
    oldValue: String(oldValue),
    newValue: value,
    changedBy: "Andrés",
    marketId: cycle.marketId,
    month: cycle.month,
  })

  revalidatePath(`/markets/${cycle.market.id}`)
  revalidatePath("/")
}

export async function applyPriceOverride(formData: FormData) {
  const { applyOverride } = await import("@/lib/pricing-engine")
  const cycleId = formData.get("cycleId") as string
  const fiberId = formData.get("fiberId") as string
  const millId = (formData.get("millId") as string | null) || null
  const customerId = (formData.get("customerId") as string | null) || null
  const price = parseFloat(formData.get("price") as string)
  const reason = formData.get("reason") as string

  await applyOverride({ cycleId, fiberId, millId, customerId, price, reason, changedBy: "Andrés" })

  const cycle = await prisma.monthlyCycle.findUnique({
    where: { id: cycleId },
    select: { market: { select: { id: true } } },
  })
  revalidatePath(`/markets/${cycle?.market.id}`)
}

export async function addCustomer(formData: FormData) {
  const marketId = formData.get("marketId") as string
  const name = formData.get("name") as string
  const contactEmail = formData.get("contactEmail") as string
  const notes = formData.get("notes") as string

  await prisma.customer.create({
    data: {
      marketId,
      name,
      contactEmail: contactEmail || null,
      notes: notes || null,
      isDirectContact: true,
    },
  })

  await logAudit({
    entity: "Customer",
    entityId: marketId,
    field: "customer added",
    oldValue: null,
    newValue: name,
    changedBy: "Andrés",
    marketId,
  })

  revalidatePath(`/markets/${marketId}`)
}

export async function updateCustomerRule(formData: FormData) {
  const customerId = formData.get("customerId") as string
  const marketId = formData.get("marketId") as string
  const fiberId = formData.get("fiberId") as string
  const method = formData.get("method") as string
  const priceOrFormula = formData.get("priceOrFormula") as string

  const isFormula = method === "index_formula"
  const manualPrice = !isFormula && priceOrFormula ? parseFloat(priceOrFormula) : null

  const existing = await prisma.pricingRule.findFirst({
    where: { marketId, fiberId, isActive: true },
  })

  await prisma.pricingRule.create({
    data: {
      marketId,
      fiberId,
      method: method as any,
      formulaExpression: isFormula ? priceOrFormula : null,
      formulaReadable: isFormula ? priceOrFormula : `Manual — ${priceOrFormula}`,
      manualPrice: manualPrice ? new Decimal(manualPrice) : null,
      priority: 3,
      activeFrom: "2025-01",
      notes: `Customer rule for ${customerId}`,
      isActive: true,
    },
  })

  revalidatePath(`/markets/${marketId}`)
}

export async function setStandardPrices(cycleId: string, entries: { fiberId: string; price: number }[]) {
  const cycle = await prisma.monthlyCycle.findUnique({
    where: { id: cycleId },
    select: { marketId: true, market: { select: { id: true } } },
  })
  if (!cycle) throw new Error("Cycle not found")

  const customers = await prisma.customer.findMany({
    where: { marketId: cycle.marketId },
    select: { id: true },
  })

  // Fan out: for each fiber entry, create a price record for every customer without one
  for (const { fiberId, price } of entries) {
    for (const { id: customerId } of customers) {
      const existing = await prisma.monthlyPrice.findFirst({
        where: { cycleId, fiberId, customerId, millId: null },
      })
      if (!existing) {
        await prisma.monthlyPrice.create({
          data: {
            cycleId,
            marketId: cycle.marketId,
            fiberId,
            customerId,
            millId: null,
            price: new Decimal(price),
            isOverride: true,
            overrideReason: "Standard price",
            pricingMethod: "manual",
            formulaSnapshot: "MANUAL_OVERRIDE",
          },
        })
      }
    }
  }

  revalidatePath(`/markets/${cycle.market.id}`)
}

export async function deletePriceRow(priceId: string, marketId: string) {
  await prisma.monthlyPrice.delete({ where: { id: priceId } })
  revalidatePath(`/markets/${marketId}`)
}

export async function addPriceRow(formData: FormData) {
  const cycleId = formData.get("cycleId") as string
  const customerId = formData.get("customerId") as string
  const fiberId = formData.get("fiberId") as string
  const price = parseFloat(formData.get("price") as string)

  const cycle = await prisma.monthlyCycle.findUnique({
    where: { id: cycleId },
    select: { marketId: true, month: true, market: { select: { id: true } } },
  })
  if (!cycle) throw new Error("Cycle not found")

  const existing = await prisma.monthlyPrice.findFirst({
    where: { cycleId, fiberId, customerId, millId: null },
  })

  if (existing) {
    await prisma.monthlyPrice.update({
      where: { id: existing.id },
      data: { price: new Decimal(price), isOverride: true, overrideReason: "Manual entry", updatedAt: new Date() },
    })
  } else {
    await prisma.monthlyPrice.create({
      data: {
        cycleId,
        marketId: cycle.marketId,
        fiberId,
        customerId,
        millId: null,
        price: new Decimal(price),
        pricingMethod: "manual",
        formulaSnapshot: "Manual entry",
        isOverride: true,
        overrideReason: "Manual entry",
      },
    })
  }

  await logAudit({
    entity: "MonthlyPrice",
    entityId: cycleId,
    field: "price added",
    oldValue: null,
    newValue: String(price),
    changedBy: "Andrés",
    marketId: cycle.marketId,
    month: cycle.month,
  })

  revalidatePath(`/markets/${cycle.market.id}`)
}