/**
 * market-tasks.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Service layer for MarketTask records.
 *
 * SCOPE INVARIANT (do not violate)
 * ---------------------------------
 * MarketTask records are MARKET-SCOPED, not month-scoped.
 *
 * The `month` field on MarketTask is retained as metadata (it records which
 * cycle month was active when the task was created) but it MUST NOT be used as
 * a read filter.  If you add a `where: { month }` clause to any query here,
 * you will make existing tasks invisible whenever the UI switches to a
 * different month — this is a data-visibility bug, not a feature.
 *
 * If a future requirement genuinely needs month-scoped tasks, add a separate
 * field (e.g. `scope: "market" | "cycle"`) and register a data migration in
 * lib/data-migrations.ts rather than silently changing the read behaviour.
 *
 * DATA PRESERVATION POLICY
 * ------------------------
 * Any change to how tasks are read, scoped, or stored must either:
 *   a) Remain backward-compatible (old records still returned), OR
 *   b) Include a registered migration in lib/data-migrations.ts.
 *
 * See lib/data-migrations.ts for the `tasks-market-scope-v1` migration that
 * documents this invariant.
 */

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
  /** Metadata only — NOT used as a filter. See scope invariant above. */
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
 *
 * SCOPE INVARIANT: intentionally NOT filtered by month.
 * Tasks created in any month remain visible until explicitly marked done.
 * Do not add a `month` parameter here without a data migration.
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
 * `month` is stored as metadata only and does NOT affect visibility.
 * `cycleId` is stored for reference but is NOT required for reads.
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
