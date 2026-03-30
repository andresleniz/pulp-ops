import { prisma } from "@/lib/prisma"

export interface AuditParams {
  entity: string
  entityId: string
  field: string
  oldValue?: string | null
  newValue?: string | null
  changedBy?: string
  marketId?: string
  month?: string
  metadata?: Record<string, unknown>
}

export async function logAudit(params: AuditParams): Promise<void> {
  await prisma.auditLog.create({
    data: {
      entity: params.entity,
      entityId: params.entityId,
      field: params.field,
      oldValue: params.oldValue ?? null,
      newValue: params.newValue ?? null,
      changedBy: params.changedBy ?? "system",
      changedAt: new Date(),
      marketId: params.marketId ?? null,
      month: params.month ?? null,
      metadata: params.metadata ? params.metadata : undefined,
    },
  })
}

export async function getAuditLog(filters: {
  entity?: string
  entityId?: string
  marketId?: string
  month?: string
  limit?: number
}) {
  return prisma.auditLog.findMany({
    where: {
      ...(filters.entity ? { entity: filters.entity } : {}),
      ...(filters.entityId ? { entityId: filters.entityId } : {}),
      ...(filters.marketId ? { marketId: filters.marketId } : {}),
      ...(filters.month ? { month: filters.month } : {}),
    },
    orderBy: { changedAt: "desc" },
    take: filters.limit ?? 100,
  })
}