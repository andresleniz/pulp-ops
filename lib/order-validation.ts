import { prisma } from "@/lib/prisma"
import { logAudit } from "@/lib/audit"

export type OrderSource = "CRM" | "Manual"

/** Reference strings that are never valid CRM order identifiers. */
const BLOCKED_REFERENCES = new Set(["edit order", "manual", "manual entry", "override"])

export interface OrderWriteParams {
  cycleId: string
  customerId: string
  fiberId: string
  source: OrderSource
  reference?: string | null
  volume: number
  price: number
}

export interface ValidationResult {
  allowed: boolean
  reason?: string
}

/**
 * Validate an order before writing to storage.
 * Rules:
 *  1. Volume and price must be positive.
 *  2. Sentinel reference strings (e.g. "Edit Order") are blocked on any source.
 *  3. Manual orders cannot be created when a CRM order already exists for the
 *     same cycle + customer + grade.
 */
export function validateOrderWrite(params: OrderWriteParams): ValidationResult {
  const { source, reference, volume, price } = params

  if (volume <= 0) {
    return { allowed: false, reason: `Volume must be positive, got ${volume}` }
  }
  if (price <= 0) {
    return { allowed: false, reason: `Price must be positive, got ${price}` }
  }
  if (reference && BLOCKED_REFERENCES.has(reference.trim().toLowerCase())) {
    return {
      allowed: false,
      reason: `Reference "${reference}" is a blocked sentinel value and is not a valid order identifier`,
    }
  }

  // Async CRM-conflict check is handled in evictManualOrders (CRM path) and
  // validateManualOrderAsync (manual path) below.
  return { allowed: true }
}

/**
 * Async check used before creating a manual order.
 * Blocks if any CRM order already exists for the same cycle + customer + grade.
 */
export async function validateManualOrderAsync(params: {
  cycleId: string
  customerId: string
  fiberId: string
}): Promise<ValidationResult> {
  const existing = await prisma.orderRecord.findFirst({
    where: { cycleId: params.cycleId, customerId: params.customerId, fiberId: params.fiberId, source: "CRM" },
    select: { id: true, reference: true },
  })
  if (existing) {
    return {
      allowed: false,
      reason: `CRM order (ref: ${existing.reference ?? existing.id}) already exists for this customer/grade/month. Manual orders cannot duplicate CRM-backed data.`,
    }
  }
  return { allowed: true }
}

/**
 * Called during CRM import: remove any Manual orders that conflict with
 * the incoming CRM row (same cycle + customer + grade).
 * Returns the IDs that were deleted.
 */
export async function evictManualOrders(params: {
  cycleId: string
  customerId: string
  fiberId: string
  marketId: string
  month: string
}): Promise<string[]> {
  const { cycleId, customerId, fiberId, marketId, month } = params

  const manuals = await prisma.orderRecord.findMany({
    where: { cycleId, customerId, fiberId, source: "Manual" },
    select: { id: true, reference: true, price: true, volume: true },
  })
  if (manuals.length === 0) return []

  const ids = manuals.map((m) => m.id)
  await prisma.orderRecord.deleteMany({ where: { id: { in: ids } } })

  await logAudit({
    entity: "OrderRecord",
    entityId: cycleId,
    field: "manual_eviction",
    oldValue: manuals.map((m) => `id=${m.id} ref=${m.reference ?? "—"} price=${m.price} vol=${m.volume}`).join("; "),
    newValue: "Evicted — superseded by CRM import",
    changedBy: "system",
    marketId,
    month,
  })

  return ids
}
