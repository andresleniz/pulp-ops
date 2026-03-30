import { prisma } from "@/lib/prisma"
import { TaskType, TaskPriority } from "@prisma/client"

export interface TaskSpec {
  type: TaskType
  month: string
  cycleId?: string
  marketId?: string
  customerId?: string
  priority: TaskPriority
  dueDate?: Date
  notes: string
}

function dueDateForMonth(month: string, offsetDays: number): Date {
  const [y, m] = month.split("-").map(Number)
  return new Date(y, m - 1, offsetDays)
}

export async function generateTasksForCycle(cycleId: string): Promise<number> {
  const cycle = await prisma.monthlyCycle.findUnique({
    where: { id: cycleId },
    include: {
      market: true,
      monthlyPrices: { include: { fiber: true } },
      tasks: { where: { status: { in: ["open", "in_progress"] } } },
    },
  })

  if (!cycle) throw new Error(`Cycle ${cycleId} not found`)
  if (cycle.cycleStatus === "closed") return 0

  const specs: TaskSpec[] = []

  if (cycle.priceStatus === "not_started" || cycle.priceStatus === "negotiating") {
    const hasSomePrice = cycle.monthlyPrices.some((p) => p.price !== null)
    if (!hasSomePrice) {
      specs.push({
        type: "missing_price",
        month: cycle.month,
        cycleId,
        marketId: cycle.marketId,
        priority: "high",
        dueDate: dueDateForMonth(cycle.month, 5),
        notes: `No prices set for ${cycle.market.name} ${cycle.month}`,
      })
    }
  }

  const indexFormulaCycles = await prisma.pricingRule.findMany({
    where: { marketId: cycle.marketId, method: "index_formula", isActive: true },
    include: { fiber: true },
  })

  if (indexFormulaCycles.length > 0) {
    const indexDefs = await prisma.indexDefinition.findMany({
      include: { values: { where: { month: cycle.month } } },
    })
    const missingIndexes = indexDefs.filter((d) => d.values.length === 0)
    for (const idx of missingIndexes) {
      specs.push({
        type: "missing_index",
        month: cycle.month,
        cycleId,
        marketId: cycle.marketId,
        priority: "high",
        dueDate: dueDateForMonth(cycle.month, 3),
        notes: `Index "${idx.name}" not published for ${cycle.month} — required by ${cycle.market.name}`,
      })
    }
  }

  if (
    cycle.market.requiresAnnouncement &&
    cycle.commStatus === "pending" &&
    cycle.priceStatus === "decided"
  ) {
    specs.push({
      type: "pending_announcement",
      month: cycle.month,
      cycleId,
      marketId: cycle.marketId,
      priority: "high",
      dueDate: dueDateForMonth(cycle.month, 8),
      notes: `Announcement not yet sent for ${cycle.market.name} ${cycle.month}`,
    })
  }

  if (cycle.cycleStatus === "awaiting_confirmation" && !cycle.confirmationReceived) {
    specs.push({
      type: "pending_confirmation",
      month: cycle.month,
      cycleId,
      marketId: cycle.marketId,
      priority: "high",
      dueDate: dueDateForMonth(cycle.month, 10),
      notes: `Awaiting confirmation from ${cycle.market.name}`,
    })
  }

  if (cycle.onHold && cycle.holdReviewDate) {
    specs.push({
      type: "hold_review",
      month: cycle.month,
      cycleId,
      marketId: cycle.marketId,
      priority: "med",
      dueDate: cycle.holdReviewDate,
      notes: `Hold review due: ${cycle.holdReason ?? "reason unspecified"}`,
    })
  }

  if (cycle.market.communicationType === "verbal" && cycle.priceStatus === "negotiating") {
    specs.push({
      type: "negotiation_followup",
      month: cycle.month,
      cycleId,
      marketId: cycle.marketId,
      priority: "med",
      dueDate: dueDateForMonth(cycle.month, 12),
      notes: `Follow up on verbal negotiation with ${cycle.market.name}`,
    })
  }

  let created = 0
  for (const spec of specs) {
    const exists = cycle.tasks.find((t) => t.type === spec.type)
    if (!exists) {
      await prisma.task.create({
        data: {
          type: spec.type,
          month: spec.month,
          cycleId: spec.cycleId,
          marketId: spec.marketId,
          customerId: spec.customerId ?? null,
          priority: spec.priority,
          dueDate: spec.dueDate,
          status: "open",
          notes: spec.notes,
        },
      })
      created++
    }
  }

  return created
}

export async function generateTasksForMonth(month: string): Promise<{ total: number; markets: string[] }> {
  const cycles = await prisma.monthlyCycle.findMany({
    where: { month, cycleStatus: { not: "closed" } },
    select: { id: true, market: { select: { name: true } } },
  })

  let total = 0
  const markets: string[] = []

  for (const cycle of cycles) {
    const n = await generateTasksForCycle(cycle.id)
    if (n > 0) {
      total += n
      markets.push(cycle.market.name)
    }
  }

  return { total, markets }
}

export async function resolveTask(taskId: string, resolvedBy = "system"): Promise<void> {
  await prisma.task.update({
    where: { id: taskId },
    data: { status: "resolved", resolvedAt: new Date(), resolvedBy },
  })
}

export async function getOpenTasks(month?: string) {
  return prisma.task.findMany({
    where: {
      status: { in: ["open", "in_progress"] },
      ...(month ? { month } : {}),
    },
    include: {
      cycle: { include: { market: true } },
    },
    orderBy: [{ priority: "asc" }, { dueDate: "asc" }],
  })
}