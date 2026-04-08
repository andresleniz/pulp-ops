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

/** All pending MarketTask rows across every market, newest month first. */
export async function getAllPendingTasks(): Promise<PendingMarketTask[]> {
  const tasks = await prisma.marketTask.findMany({
    where: { status: "pending" },
    include: { market: { select: { id: true, name: true } } },
    orderBy: [{ month: "desc" }, { createdAt: "desc" }],
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

export async function listMarketTasks(
  marketId: string,
  month: string,
): Promise<MarketTaskRow[]> {
  return prisma.marketTask.findMany({
    where: { marketId, month },
    orderBy: { createdAt: "asc" },
    select: { id: true, title: true, status: true, createdAt: true },
  })
}

export async function createMarketTask(
  marketId: string,
  month: string,
  cycleId: string | null,
  title: string,
): Promise<void> {
  await prisma.marketTask.create({
    data: { marketId, month, cycleId, title },
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
