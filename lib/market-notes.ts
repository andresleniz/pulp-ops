import { prisma } from "@/lib/prisma"

export async function getMarketNote(
  marketId: string,
  month: string,
): Promise<{ id: string; content: string } | null> {
  return prisma.marketNote.findUnique({
    where: { marketId_month: { marketId, month } },
    select: { id: true, content: true },
  })
}

export async function upsertMarketNote(
  marketId: string,
  month: string,
  cycleId: string | null,
  content: string,
): Promise<void> {
  await prisma.marketNote.upsert({
    where: { marketId_month: { marketId, month } },
    create: { marketId, month, cycleId, content },
    update: { content },
  })
}
