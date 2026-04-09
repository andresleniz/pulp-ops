import { prisma } from "@/lib/prisma"
import type { MarketTaskStatus } from "@prisma/client"

export type MarketTaskRow = {
  id: string
  title: string
  status: MarketTaskStatus
  createdAt: Date
}

export type PendingMarketTask = {
  id: string
  title: string
  status: MarketTaskStatus
  marketId: string
  marketName: string
  month: string | null
  createdAt: Date
}

/** All pending MarketTask rows across every market, newest first. */
export async function getAllPendingTasks(): Promise<PendingMarketTask[]> {
  const tasks = await prisma.marketTask.findMany({
    where: { status: "pending" },
    include: { market: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  })
  return tasks.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    marketId: t.market.id,
    marketName: t.market.name,
    month: t.month,
    createdAt: t.createdAt,
  }))
}

/**
 * All tasks for a market — pending and done.
 * NOT scoped by month: a task created in any month remains visible until
 * explicitly marked done.
 */
export async function listMarketTasks(marketId: string): Promise<MarketTaskRow[]> {
  return prisma.marketTask.findMany({
    where: { marketId },
    orderBy: { createdAt: "asc" },
    select: { id: true, title: true, status: true, createdAt: true },
  })
}

/**
 * Creates a task belonging to a market.
 * Month is stored as metadata only and does NOT affect visibility.
 */
export async function createMarketTask(
  marketId: string,
  title: string,
  cycleId?: string | null,
): Promise<void> {
  await prisma.marketTask.create({
    data: { marketId, cycleId: cycleId ?? null, title },
  })
}

export async function setMarketTaskStatus(
  taskId: string,
  status: MarketTaskStatus,
): Promise<void> {
  await prisma.marketTask.update({
    where: { id: taskId },
    data: { status },
  })
}
