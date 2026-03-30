import { prisma } from "@/lib/prisma"

async function createSnapshot(cycleId: string): Promise<void> {
  const cycle = await prisma.monthlyCycle.findUnique({
    where: { id: cycleId },
    include: {
      market: true,
      monthlyPrices: { include: { fiber: true, mill: true } },
      emailDrafts: true,
      negotiations: { include: { fiber: true } },
      orders: { include: { fiber: true, mill: true, customer: true } },
    },
  })

  if (!cycle) throw new Error(`Cycle ${cycleId} not found`)

  const existing = await prisma.snapshot.findUnique({ where: { cycleId } })
  if (existing) return

  const prices = cycle.monthlyPrices.map((p: {
    fiber: { code: string }
    mill: { name: string } | null
    price: unknown
    pricingMethod: unknown
    isOverride: boolean
  }) => ({
    fiber: p.fiber.code,
    mill: p.mill?.name ?? null,
    price: p.price ? Number(p.price) : null,
    method: p.pricingMethod,
    isOverride: p.isOverride,
  }))

  const emailsSent = cycle.emailDrafts
    .filter((d: { status: string }) => d.status === "sent" || d.status === "confirmed")
    .map((d: { subject: string; recipientsTo: string; sentAt: unknown }) => ({
      subject: d.subject,
      to: d.recipientsTo,
      sentAt: d.sentAt,
    }))

  const orders = cycle.orders.map((o: {
    customerId: string
    fiber: { code: string }
    mill: { name: string } | null
    volume: unknown
    price: unknown
    reference: string | null
  }) => ({
    customer: o.customerId,
    fiber: o.fiber.code,
    mill: o.mill?.name ?? null,
    volume: Number(o.volume),
    price: Number(o.price),
    ref: o.reference,
  }))

  const payload = {
    month: cycle.month,
    market: { id: cycle.market.id, name: cycle.market.name },
    statuses: {
      priceStatus: cycle.priceStatus,
      commStatus: cycle.commStatus,
      orderStatus: cycle.orderStatus,
      cycleStatus: cycle.cycleStatus,
      onHold: cycle.onHold,
    },
    prices,
    emailsSent,
    orders,
    snapshotAt: new Date().toISOString(),
  }

  await prisma.snapshot.create({
    data: {
      cycleId,
      month: cycle.month,
      marketId: cycle.marketId,
      payload: payload as any,
      createdBy: "system",
    },
  })
}

export default { createSnapshot }