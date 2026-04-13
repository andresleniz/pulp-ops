import { prisma } from "@/lib/prisma"
import { logAudit } from "@/lib/audit"

export async function markEmailSent(draftId: string, sentBy = "system"): Promise<void> {
  const draft = await prisma.emailDraft.findUnique({ where: { id: draftId } })
  if (!draft) throw new Error("Draft not found")

  await prisma.emailDraft.update({
    where: { id: draftId },
    data: { status: "sent", sentAt: new Date() },
  })

  await prisma.monthlyCycle.update({
    where: { id: draft.cycleId },
    data: { commStatus: "sent" },
  })

  await logAudit({
    entity: "EmailDraft",
    entityId: draftId,
    field: "status",
    oldValue: String(draft.status),
    newValue: "sent",
    changedBy: sentBy,
    month: draft.month,
  })
}

export async function updateDraftBody(
  draftId: string,
  body: string,
  subject?: string,
  changedBy = "system"
): Promise<void> {
  await prisma.emailDraft.update({
    where: { id: draftId },
    data: {
      body,
      ...(subject ? { subject } : {}),
      status: "draft_ready",
      updatedAt: new Date(),
    },
  })

  await logAudit({
    entity: "EmailDraft",
    entityId: draftId,
    field: "body",
    oldValue: "[previous body]",
    newValue: "[edited body]",
    changedBy,
  })
}
