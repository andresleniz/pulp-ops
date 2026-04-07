import { prisma } from "@/lib/prisma"
import type { MarketTaskStatus } from "@prisma/client"

export type MarketTaskRow = {
  id: string
  title: string
  status: MarketTaskStatus
  createdAt: Date
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
