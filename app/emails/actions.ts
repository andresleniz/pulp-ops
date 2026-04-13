"use server"

import { markEmailSent, updateDraftBody } from "@/lib/email-engine"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"

export async function markSent(formData: FormData) {
  const draftId = formData.get("draftId") as string
  await markEmailSent(draftId, "Andrés")
  revalidatePath("/emails")
}

export async function updateBody(formData: FormData) {
  const draftId = formData.get("draftId") as string
  const body = formData.get("body") as string
  await updateDraftBody(draftId, body, undefined, "Andrés")
  revalidatePath("/emails")
}

// ── Per-market manual draft ───────────────────────────────────────────────────

export interface FiberEntry {
  code: string
  price: string
  change: string
}

export async function generateDraft(args: {
  marketId: string
  month: string
  greetingName: string
  fibers: FiberEntry[]
  recipientsTo: string[]
  recipientsCc: string[]
}): Promise<{ ok: true; draftId: string } | { ok: false; error: string }> {
  try {
    const market = await prisma.market.findUnique({ where: { id: args.marketId } })
    if (!market) return { ok: false, error: "Market not found" }

    let cycle = await prisma.monthlyCycle.findUnique({
      where: { month_marketId: { month: args.month, marketId: args.marketId } },
    })
    if (!cycle) {
      cycle = await prisma.monthlyCycle.create({
        data: {
          month: args.month,
          marketId: args.marketId,
          cycleStatus: "open",
          priceStatus: "not_started",
          commStatus: "pending",
          orderStatus: "none",
        },
      })
    }

    const [y, m] = args.month.split("-").map(Number)
    const monthLabel = new Date(y, m - 1).toLocaleString("en-US", {
      month: "long",
      year: "numeric",
    })

    const fiberLines = args.fibers
      .map((f) => `${f.code}: ${f.price} USD/ADT (${f.change || "unchanged"})`)
      .join("\n")

    const body =
      `Dear ${args.greetingName},\n\n` +
      `Please find below the Arauco pulp prices for ${market.name} — ${monthLabel}:\n\n` +
      `${fiberLines}\n\n` +
      `If any price adjustments occur during the month, an update will be communicated.\n\n` +
      `Brgds,\nAndrés`

    const subject = `${market.name} Pulp Prices — ${monthLabel}`

    const draft = await prisma.emailDraft.create({
      data: {
        month: args.month,
        cycleId: cycle.id,
        marketId: args.marketId,
        subject,
        body,
        recipientsTo: JSON.stringify(args.recipientsTo),
        recipientsCc: JSON.stringify(args.recipientsCc),
        status: "draft_ready",
      },
    })

    // Persist greeting and CC as market defaults for next time
    await prisma.market.update({
      where: { id: args.marketId },
      data: {
        defaultGreeting: args.greetingName,
        defaultCc: args.recipientsCc.join(", ") || null,
      },
    })

    revalidatePath("/emails")
    return { ok: true, draftId: draft.id }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

// ── Contacts repository ───────────────────────────────────────────────────────

export async function saveContact(args: {
  marketId: string
  name: string
  email: string
  role: string
}): Promise<void> {
  await prisma.marketContact.create({
    data: { marketId: args.marketId, name: args.name, email: args.email, role: args.role || null },
  })
  revalidatePath("/emails")
}

export async function deleteContact(contactId: string): Promise<void> {
  await prisma.marketContact.delete({ where: { id: contactId } })
  revalidatePath("/emails")
}

export async function deleteDraft(draftId: string): Promise<void> {
  await prisma.emailDraft.delete({ where: { id: draftId } })
  revalidatePath("/emails")
}
