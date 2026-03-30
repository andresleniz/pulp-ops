import { prisma } from "@/lib/prisma"
import { logAudit } from "@/lib/audit"
import Decimal from "decimal.js"

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`)
}

function fmtChange(current: number | null, prev: number | null): string {
  if (current === null || prev === null) return "—"
  const d = current - prev
  if (d > 0) return `+${d}`
  if (d < 0) return `${d}`
  return "unchanged"
}

function fmtPrice(p: Decimal | null): string {
  return p !== null ? p.toFixed(0) : "TBD"
}

async function getPriorPrice(
  marketId: string,
  fiberId: string,
  month: string,
  millId?: string | null
): Promise<number | null> {
  const [y, m] = month.split("-").map(Number)
  const priorMonth = m === 1
    ? `${y - 1}-12`
    : `${y}-${String(m - 1).padStart(2, "0")}`

  const priorCycle = await prisma.monthlyCycle.findUnique({
    where: { month_marketId: { month: priorMonth, marketId } },
  })
  if (!priorCycle) return null

  const price = await prisma.monthlyPrice.findFirst({
    where: {
      cycleId: priorCycle.id,
      fiberId,
      millId: millId ?? null,
      customerId: null,
    },
  })
  return price?.price ? Number(price.price) : null
}

function getMonthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number)
  return new Date(y, m - 1).toLocaleString("en-US", { month: "long", year: "numeric" })
}

async function generateTaiwanEmail(cycleId: string): Promise<string> {
  const cycle = await prisma.monthlyCycle.findUnique({
    where: { id: cycleId },
    include: {
      market: { include: { agent: true } },
      monthlyPrices: { include: { fiber: true } },
    },
  })
  if (!cycle) throw new Error("Cycle not found")

  const template = await prisma.emailTemplate.findFirst({
    where: { templateKey: "taiwan_announcement", isActive: true },
    orderBy: { version: "desc" },
  })
  if (!template) throw new Error("Taiwan announcement template not found")

  const fBKP = await prisma.fiber.findUnique({ where: { code: "BKP" } })
  const fEKP = await prisma.fiber.findUnique({ where: { code: "EKP" } })
  const fUKP = await prisma.fiber.findUnique({ where: { code: "UKP" } })
  if (!fBKP || !fEKP || !fUKP) throw new Error("Fibers not found")

  const getPrice = (code: string) =>
    cycle.monthlyPrices.find((p) => p.fiber.code === code && !p.millId)?.price ?? null

  const bkp = getPrice("BKP")
  const ekp = getPrice("EKP")
  const ukp = getPrice("UKP")

  const bkpPrev = await getPriorPrice(cycle.marketId, fBKP.id, cycle.month)
  const ekpPrev = await getPriorPrice(cycle.marketId, fEKP.id, cycle.month)
  const ukpPrev = await getPriorPrice(cycle.marketId, fUKP.id, cycle.month)

  const cnBkp = bkp ? new Decimal(bkp.toString()).minus(5) : null
  const cnUkp = ukp ? new Decimal(ukp.toString()).minus(5) : null
  const cnBkpPrev = bkpPrev !== null ? bkpPrev - 5 : null
  const cnUkpPrev = ukpPrev !== null ? ukpPrev - 5 : null

  const vars: Record<string, string> = {
    MONTH: getMonthLabel(cycle.month),
    TW_BKP: fmtPrice(bkp ? new Decimal(bkp.toString()) : null),
    TW_BKP_CHANGE: fmtChange(bkp ? Number(bkp) : null, bkpPrev),
    TW_EKP: fmtPrice(ekp ? new Decimal(ekp.toString()) : null),
    TW_EKP_CHANGE: fmtChange(ekp ? Number(ekp) : null, ekpPrev),
    TW_UKP: fmtPrice(ukp ? new Decimal(ukp.toString()) : null),
    TW_UKP_CHANGE: fmtChange(ukp ? Number(ukp) : null, ukpPrev),
    TW_CN_BKP: fmtPrice(cnBkp),
    TW_CN_BKP_CHANGE: fmtChange(cnBkp ? Number(cnBkp) : null, cnBkpPrev),
    TW_CN_EKP: fmtPrice(ekp ? new Decimal(ekp.toString()) : null),
    TW_CN_EKP_CHANGE: fmtChange(ekp ? Number(ekp) : null, ekpPrev),
    TW_CN_UKP: fmtPrice(cnUkp),
    TW_CN_UKP_CHANGE: fmtChange(cnUkp ? Number(cnUkp) : null, cnUkpPrev),
  }

  const body = renderTemplate(template.bodyTemplate, vars)
  const subject = renderTemplate(template.subjectTemplate, vars)

  const draft = await prisma.emailDraft.create({
    data: {
      month: cycle.month,
      cycleId,
      templateId: template.id,
      marketId: cycle.marketId,
      subject,
      body,
      recipientsTo: JSON.stringify([cycle.market.agent?.email ?? "silvia.hsu@ekman.com"]),
      recipientsCc: JSON.stringify([]),
      status: "draft_ready",
    },
  })

  await logAudit({
    entity: "EmailDraft",
    entityId: draft.id,
    field: "status",
    oldValue: null,
    newValue: "draft_ready",
    changedBy: "system",
    marketId: cycle.marketId,
    month: cycle.month,
  })

  return draft.id
}

async function generatePakistanEmail(cycleId: string): Promise<string> {
  const cycle = await prisma.monthlyCycle.findUnique({
    where: { id: cycleId },
    include: { monthlyPrices: { include: { fiber: true } } },
  })
  if (!cycle) throw new Error("Cycle not found")

  const template = await prisma.emailTemplate.findFirst({
    where: { templateKey: "pakistan_announcement", isActive: true },
    orderBy: { version: "desc" },
  })
  if (!template) throw new Error("Pakistan template not found")

  const fBKP = await prisma.fiber.findUnique({ where: { code: "BKP" } })
  if (!fBKP) throw new Error("BKP fiber not found")

  const bkp = cycle.monthlyPrices.find((p) => p.fiber.code === "BKP")?.price ?? null
  const bkpPrev = await getPriorPrice(cycle.marketId, fBKP.id, cycle.month)

  const vars: Record<string, string> = {
    MONTH: getMonthLabel(cycle.month),
    PK_BKP: fmtPrice(bkp ? new Decimal(bkp.toString()) : null),
    PK_BKP_CHANGE: fmtChange(bkp ? Number(bkp) : null, bkpPrev),
  }

  const body = renderTemplate(template.bodyTemplate, vars)
  const subject = renderTemplate(template.subjectTemplate, vars)

  const draft = await prisma.emailDraft.create({
    data: {
      month: cycle.month,
      cycleId,
      templateId: template.id,
      marketId: cycle.marketId,
      subject,
      body,
      recipientsTo: JSON.stringify(["procurement@pk-customer.com"]),
      recipientsCc: JSON.stringify([]),
      status: "draft_ready",
    },
  })

  await logAudit({
    entity: "EmailDraft",
    entityId: draft.id,
    field: "status",
    oldValue: null,
    newValue: "draft_ready",
    changedBy: "system",
    marketId: cycle.marketId,
    month: cycle.month,
  })

  return draft.id
}

async function generateSofidelEmail(cycleId: string): Promise<string> {
  const cycle = await prisma.monthlyCycle.findUnique({
    where: { id: cycleId },
    include: { monthlyPrices: { include: { fiber: true, mill: true } } },
  })
  if (!cycle) throw new Error("Cycle not found")

  const template = await prisma.emailTemplate.findFirst({
    where: { templateKey: "sofidel_quote", isActive: true },
    orderBy: { version: "desc" },
  })
  if (!template) throw new Error("Sofidel template not found")

  const fEKP = await prisma.fiber.findUnique({ where: { code: "EKP" } })
  if (!fEKP) throw new Error("EKP fiber not found")

  const getMillPrice = (millName: string) =>
    cycle.monthlyPrices.find((p) => p.fiber.code === "EKP" && p.mill?.name === millName)?.price ?? null

  const shelby = getMillPrice("Shelby")
  const circleville = getMillPrice("Circleville")
  const gilaBend = getMillPrice("Gila Bend")

  const shPrev = await getPriorPrice(cycle.marketId, fEKP.id, cycle.month, "mill-shelby")
  const cvPrev = await getPriorPrice(cycle.marketId, fEKP.id, cycle.month, "mill-circleville")
  const gbPrev = await getPriorPrice(cycle.marketId, fEKP.id, cycle.month, "mill-gilabend")

  const ttoVal = await prisma.indexValue.findFirst({
    where: { month: cycle.month, index: { name: "TTO" } },
  })

  const vars: Record<string, string> = {
    MONTH: getMonthLabel(cycle.month),
    TTO: ttoVal?.value?.toString() ?? "N/A",
    SOF_SHELBY: fmtPrice(shelby ? new Decimal(shelby.toString()) : null),
    SOF_SHELBY_CHANGE: fmtChange(shelby ? Number(shelby) : null, shPrev),
    SOF_CIRCLEVILLE: fmtPrice(circleville ? new Decimal(circleville.toString()) : null),
    SOF_CIRCLEVILLE_CHANGE: fmtChange(circleville ? Number(circleville) : null, cvPrev),
    SOF_GILABEND: fmtPrice(gilaBend ? new Decimal(gilaBend.toString()) : null),
    SOF_GILABEND_CHANGE: fmtChange(gilaBend ? Number(gilaBend) : null, gbPrev),
  }

  const body = renderTemplate(template.bodyTemplate, vars)
  const subject = renderTemplate(template.subjectTemplate, vars)

  const draft = await prisma.emailDraft.create({
    data: {
      month: cycle.month,
      cycleId,
      templateId: template.id,
      marketId: cycle.marketId,
      subject,
      body,
      recipientsTo: JSON.stringify(["procurement@sofidel.com"]),
      recipientsCc: JSON.stringify([]),
      status: "draft_ready",
    },
  })

  await logAudit({
    entity: "EmailDraft",
    entityId: draft.id,
    field: "status",
    oldValue: null,
    newValue: "draft_ready",
    changedBy: "system",
    marketId: cycle.marketId,
    month: cycle.month,
  })

  return draft.id
}

async function generateJHEmail(cycleId: string): Promise<string> {
  const cycle = await prisma.monthlyCycle.findUnique({
    where: { id: cycleId },
    include: { monthlyPrices: { include: { fiber: true, mill: true } } },
  })
  if (!cycle) throw new Error("Cycle not found")

  const template = await prisma.emailTemplate.findFirst({
    where: { templateKey: "jh_quote", isActive: true },
    orderBy: { version: "desc" },
  })
  if (!template) throw new Error("JH template not found")

  const fUKP = await prisma.fiber.findUnique({ where: { code: "UKP" } })
  if (!fUKP) throw new Error("UKP not found")

  const getMillPrice = (millName: string) =>
    cycle.monthlyPrices.find((p) => p.fiber.code === "UKP" && p.mill?.name === millName)?.price ?? null

  const millIds: Record<string, string> = {
    Pulaski: "mill-pulaski",
    Peru: "mill-peru",
    PC: "mill-pc",
    Reno: "mill-reno",
    Prattville: "mill-prattville",
  }

  const mills = ["Pulaski", "Peru", "PC", "Reno", "Prattville"]
  const vars: Record<string, string> = { MONTH: getMonthLabel(cycle.month) }

  for (const mill of mills) {
    const price = getMillPrice(mill)
    const prev = await getPriorPrice(cycle.marketId, fUKP.id, cycle.month, millIds[mill])
    vars[`JH_${mill.toUpperCase()}`] = fmtPrice(price ? new Decimal(price.toString()) : null)
    vars[`JH_${mill.toUpperCase()}_CHANGE`] = fmtChange(price ? Number(price) : null, prev)
  }

  const body = renderTemplate(template.bodyTemplate, vars)
  const subject = renderTemplate(template.subjectTemplate, vars)

  const draft = await prisma.emailDraft.create({
    data: {
      month: cycle.month,
      cycleId,
      templateId: template.id,
      marketId: cycle.marketId,
      subject,
      body,
      recipientsTo: JSON.stringify(["supply@jameshardie.com"]),
      recipientsCc: JSON.stringify([]),
      status: "draft_ready",
    },
  })

  await logAudit({
    entity: "EmailDraft",
    entityId: draft.id,
    field: "status",
    oldValue: null,
    newValue: "draft_ready",
    changedBy: "system",
    marketId: cycle.marketId,
    month: cycle.month,
  })

  return draft.id
}

async function generateNZEmail(cycleId: string): Promise<string> {
  const cycle = await prisma.monthlyCycle.findUnique({
    where: { id: cycleId },
    include: { monthlyPrices: { include: { fiber: true, mill: true } } },
  })
  if (!cycle) throw new Error("Cycle not found")

  const template = await prisma.emailTemplate.findFirst({
    where: { templateKey: "nz_quote", isActive: true },
    orderBy: { version: "desc" },
  })
  if (!template) throw new Error("NZ template not found")

  const fEKP = await prisma.fiber.findUnique({ where: { code: "EKP" } })
  if (!fEKP) throw new Error("EKP not found")

  const nzEKP = cycle.monthlyPrices.find(
    (p) => p.fiber.code === "EKP" && p.mill?.name === "Whakatane"
  )?.price ?? null

  const nzPrev = await getPriorPrice(cycle.marketId, fEKP.id, cycle.month, "mill-whakatane")

  const pixVal = await prisma.indexValue.findFirst({
    where: { month: cycle.month, index: { name: "PIX China" } },
  })

  const vars: Record<string, string> = {
    MONTH: getMonthLabel(cycle.month),
    PIX_CHINA: pixVal?.value?.toString() ?? "N/A",
    NZ_EKP: fmtPrice(nzEKP ? new Decimal(nzEKP.toString()) : null),
    NZ_EKP_CHANGE: fmtChange(nzEKP ? Number(nzEKP) : null, nzPrev),
  }

  const body = renderTemplate(template.bodyTemplate, vars)
  const subject = renderTemplate(template.subjectTemplate, vars)

  const draft = await prisma.emailDraft.create({
    data: {
      month: cycle.month,
      cycleId,
      templateId: template.id,
      marketId: cycle.marketId,
      subject,
      body,
      recipientsTo: JSON.stringify(["procurement@whakatane.co.nz"]),
      recipientsCc: JSON.stringify([]),
      status: "draft_ready",
    },
  })

  await logAudit({
    entity: "EmailDraft",
    entityId: draft.id,
    field: "status",
    oldValue: null,
    newValue: "draft_ready",
    changedBy: "system",
    marketId: cycle.marketId,
    month: cycle.month,
  })

  return draft.id
}

const GENERATOR_MAP: Record<string, (cycleId: string) => Promise<string>> = {
  Taiwan: generateTaiwanEmail,
  Pakistan: generatePakistanEmail,
  "USA Sofidel": generateSofidelEmail,
  "USA James Hardie": generateJHEmail,
  "New Zealand": generateNZEmail,
}

export async function generateEmailsForCycle(cycleId: string): Promise<{ draftIds: string[]; skipped: string[] }> {
  const cycle = await prisma.monthlyCycle.findUnique({
    where: { id: cycleId },
    include: { market: true },
  })
  if (!cycle) throw new Error("Cycle not found")

  const generator = GENERATOR_MAP[cycle.market.name]
  if (!generator) {
    return {
      draftIds: [],
      skipped: [`${cycle.market.name} — no email template (verbal-only market)`],
    }
  }

  const draftId = await generator(cycleId)
  return { draftIds: [draftId], skipped: [] }
}

export async function generateEmailsForMonth(month: string): Promise<{ generated: number; skipped: string[] }> {
  const cycles = await prisma.monthlyCycle.findMany({
    where: { month, cycleStatus: { not: "closed" } },
    include: { market: true },
  })

  let generated = 0
  const skipped: string[] = []

  for (const cycle of cycles) {
    const result = await generateEmailsForCycle(cycle.id)
    generated += result.draftIds.length
    skipped.push(...result.skipped)
  }

  return { generated, skipped }
}

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
