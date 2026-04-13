import { PrismaClient, PricingMethod, PriceStatus, CommStatus, OrderStatus, CycleStatus } from "@prisma/client"
import Decimal from "decimal.js"

const prisma = new PrismaClient()

async function main() {
  console.log("🌱 Seeding database...")

  const rAsiaPac = await prisma.region.upsert({ where: { name: "Asia Pacific" }, update: {}, create: { name: "Asia Pacific" } })
  const rMiddleEast = await prisma.region.upsert({ where: { name: "Middle East" }, update: {}, create: { name: "Middle East" } })
  const rNorthAm = await prisma.region.upsert({ where: { name: "North America" }, update: {}, create: { name: "North America" } })
  const rSouthAsia = await prisma.region.upsert({ where: { name: "South Asia" }, update: {}, create: { name: "South Asia" } })
  const rSEAsia = await prisma.region.upsert({ where: { name: "Southeast Asia" }, update: {}, create: { name: "Southeast Asia" } })
  const rOceania = await prisma.region.upsert({ where: { name: "Oceania" }, update: {}, create: { name: "Oceania" } })

  const fBKP = await prisma.fiber.upsert({ where: { code: "BKP" }, update: {}, create: { code: "BKP", name: "Bleached Kraft Pulp", unit: "USD/ADT" } })
  const fEKP = await prisma.fiber.upsert({ where: { code: "EKP" }, update: {}, create: { code: "EKP", name: "Elemental Chlorine-Free Kraft Pulp", unit: "USD/ADT" } })
  const fUKP = await prisma.fiber.upsert({ where: { code: "UKP" }, update: {}, create: { code: "UKP", name: "Unbleached Kraft Pulp", unit: "USD/ADT" } })

  const agentSilvia = await prisma.agent.upsert({
    where: { email: "silvia.hsu@ekman.com" },
    update: {},
    create: { name: "Silvia Hsu", email: "silvia.hsu@ekman.com", company: "Ekman" },
  })

  const idxPIX = await prisma.indexDefinition.upsert({
    where: { name: "PIX China" },
    update: {},
    create: { name: "PIX China", description: "FOEX PIX China hardwood index", unit: "USD/ADT" },
  })

  const idxTTO = await prisma.indexDefinition.upsert({
    where: { name: "TTO" },
    update: {},
    create: { name: "TTO", description: "NBSK TTO list price", unit: "USD/ADT" },
  })

  const indexMonths = [
    { month: "2025-10", pix: 590, tto: 575 },
    { month: "2025-11", pix: 598, tto: 580 },
    { month: "2025-12", pix: 605, tto: 585 },
    { month: "2026-01", pix: 612, tto: 590 },
    { month: "2026-02", pix: 618, tto: 594 },
    { month: "2026-03", pix: 625, tto: 598 },
  ]

  for (const row of indexMonths) {
    await prisma.indexValue.upsert({
      where: { indexId_month: { indexId: idxPIX.id, month: row.month } },
      update: { value: new Decimal(row.pix) },
      create: { indexId: idxPIX.id, month: row.month, value: new Decimal(row.pix), publicationDate: new Date(`${row.month}-05`) },
    })
    await prisma.indexValue.upsert({
      where: { indexId_month: { indexId: idxTTO.id, month: row.month } },
      update: { value: new Decimal(row.tto) },
      create: { indexId: idxTTO.id, month: row.month, value: new Decimal(row.tto), publicationDate: new Date(`${row.month}-05`) },
    })
  }

  const mktTaiwan = await prisma.market.upsert({
    where: { name: "Taiwan" }, update: {},
    create: { name: "Taiwan", regionId: rAsiaPac.id, requiresAnnouncement: true, communicationType: "agent", agentId: agentSilvia.id, notes: "All customers covered via Ekman." },
  })
  const mktUAE = await prisma.market.upsert({
    where: { name: "UAE" }, update: {},
    create: { name: "UAE", regionId: rMiddleEast.id, requiresAnnouncement: false, communicationType: "email", notes: "ADNIP customer. EKP only. Crown pricing starts May." },
  })
  const mktUSA = await prisma.market.upsert({
    where: { name: "USA" }, update: {},
    create: { name: "USA", regionId: rNorthAm.id, requiresAnnouncement: false, communicationType: "email", notes: "Sofidel (EKP, TTO-based) and James Hardie (UKP, manual per mill)." },
  })
  const mktSofidel = mktUSA
  const mktJH = mktUSA

  const mktNZ = await prisma.market.upsert({
    where: { name: "New Zealand" }, update: {},
    create: { name: "New Zealand", regionId: rOceania.id, requiresAnnouncement: false, communicationType: "email", notes: "Whakatane mill. EKP via PIX formula." },
  })
  const mktPakistan = await prisma.market.upsert({
    where: { name: "Pakistan" }, update: {},
    create: { name: "Pakistan", regionId: rSouthAsia.id, requiresAnnouncement: true, communicationType: "email", notes: "Manual negotiated monthly. EKP and UKP only." },
  })
  const mktJapan = await prisma.market.upsert({
    where: { name: "Japan" }, update: {},
    create: { name: "Japan", regionId: rAsiaPac.id, requiresAnnouncement: false, communicationType: "verbal", notes: "Verbal negotiation only." },
  })
  const mktKorea = await prisma.market.upsert({
    where: { name: "Korea" }, update: {},
    create: { name: "Korea", regionId: rAsiaPac.id, requiresAnnouncement: false, communicationType: "verbal", notes: "Verbal negotiation only." },
  })
  const mktThailand = await prisma.market.upsert({
    where: { name: "Thailand" }, update: {},
    create: { name: "Thailand", regionId: rSEAsia.id, requiresAnnouncement: false, communicationType: "verbal", notes: "Verbal negotiation first." },
  })
  await prisma.market.upsert({
    where: { name: "India" }, update: {},
    create: { name: "India", regionId: rSouthAsia.id, requiresAnnouncement: false, communicationType: "email", notes: "Imported from CRM." },
  })
  await prisma.market.upsert({
    where: { name: "Malaysia" }, update: {},
    create: { name: "Malaysia", regionId: rSEAsia.id, requiresAnnouncement: false, communicationType: "email", notes: "Imported from CRM." },
  })
  await prisma.market.upsert({
    where: { name: "Vietnam" }, update: {},
    create: { name: "Vietnam", regionId: rSEAsia.id, requiresAnnouncement: false, communicationType: "email", notes: "Imported from CRM." },
  })

  const existingSg = await prisma.subgroup.findFirst({
    where: { name: "Chinese-based Taiwan customers", marketId: mktTaiwan.id },
  })
  const sgChina = existingSg ?? await prisma.subgroup.create({
    data: { name: "Chinese-based Taiwan customers", marketId: mktTaiwan.id, description: "BKP and UKP adjusted -5 vs base." },
  })

  const custADNIP = await prisma.customer.upsert({
    where: { id: "cust-adnip" }, update: {},
    create: { id: "cust-adnip", name: "ADNIP", marketId: mktUAE.id, isDirectContact: true, contactEmail: "procurement@adnip.ae" },
  })
  const custCrown = await prisma.customer.upsert({
    where: { id: "cust-crown" }, update: {},
    create: { id: "cust-crown", name: "Crown", marketId: mktUAE.id, isDirectContact: true, contactEmail: "purchasing@crown.ae", notes: "Pricing starts May 2026" },
  })
  const custSofidel = await prisma.customer.upsert({
    where: { id: "cust-sofidel" }, update: {},
    create: { id: "cust-sofidel", name: "Sofidel", marketId: mktSofidel.id, isDirectContact: true, contactEmail: "procurement@sofidel.com" },
  })
  const custJH = await prisma.customer.upsert({
    where: { id: "cust-jh" }, update: {},
    create: { id: "cust-jh", name: "James Hardie", marketId: mktJH.id, isDirectContact: true, contactEmail: "supply@jameshardie.com" },
  })
  const custWhakatane = await prisma.customer.upsert({
    where: { id: "cust-whakatane" }, update: {},
    create: { id: "cust-whakatane", name: "Whakatane Mill", marketId: mktNZ.id, isDirectContact: true, contactEmail: "procurement@whakatane.co.nz" },
  })

  const millShelby = await prisma.mill.upsert({ where: { id: "mill-shelby" }, update: {}, create: { id: "mill-shelby", name: "Shelby", marketId: mktSofidel.id, customerId: custSofidel.id, location: "Shelby, NC" } })
  const millCircleville = await prisma.mill.upsert({ where: { id: "mill-circleville" }, update: {}, create: { id: "mill-circleville", name: "Circleville", marketId: mktSofidel.id, customerId: custSofidel.id, location: "Circleville, OH" } })
  const millGilaBend = await prisma.mill.upsert({ where: { id: "mill-gilabend" }, update: {}, create: { id: "mill-gilabend", name: "Gila Bend", marketId: mktSofidel.id, customerId: custSofidel.id, location: "Gila Bend, AZ" } })
  const millPulaski = await prisma.mill.upsert({ where: { id: "mill-pulaski" }, update: {}, create: { id: "mill-pulaski", name: "Pulaski", marketId: mktJH.id, customerId: custJH.id, location: "Pulaski, VA" } })
  const millPeru = await prisma.mill.upsert({ where: { id: "mill-peru" }, update: {}, create: { id: "mill-peru", name: "Peru", marketId: mktJH.id, customerId: custJH.id, location: "Peru, IL" } })
  const millPC = await prisma.mill.upsert({ where: { id: "mill-pc" }, update: {}, create: { id: "mill-pc", name: "PC", marketId: mktJH.id, customerId: custJH.id, location: "Plant City, FL" } })
  const millReno = await prisma.mill.upsert({ where: { id: "mill-reno" }, update: {}, create: { id: "mill-reno", name: "Reno", marketId: mktJH.id, customerId: custJH.id, location: "Reno, NV" } })
  const millPrattville = await prisma.mill.upsert({ where: { id: "mill-prattville" }, update: {}, create: { id: "mill-prattville", name: "Prattville", marketId: mktJH.id, customerId: custJH.id, location: "Prattville, AL" } })
  const millWhakatane = await prisma.mill.upsert({ where: { id: "mill-whakatane" }, update: {}, create: { id: "mill-whakatane", name: "Whakatane", marketId: mktNZ.id, customerId: custWhakatane.id, location: "Whakatane, NZ" } })

  async function upsertRule(id: string, data: any) {
    return prisma.pricingRule.upsert({ where: { id }, update: data, create: { id, ...data } })
  }

  // Taiwan — BKP, EKP, UKP (all three confirmed in CRM)
  await upsertRule("rule-tw-bkp", { marketId: mktTaiwan.id, fiberId: fBKP.id, method: "manual", formulaReadable: "Manual — agreed with Ekman", manualPrice: new Decimal(685), priority: 10, activeFrom: "2025-01" })
  await upsertRule("rule-tw-ekp", { marketId: mktTaiwan.id, fiberId: fEKP.id, method: "manual", formulaReadable: "Manual — agreed with Ekman", manualPrice: new Decimal(675), priority: 10, activeFrom: "2025-01" })
  await upsertRule("rule-tw-ukp", { marketId: mktTaiwan.id, fiberId: fUKP.id, method: "manual", formulaReadable: "Manual — agreed with Ekman", manualPrice: new Decimal(680), priority: 10, activeFrom: "2025-01" })
  await upsertRule("rule-tw-sg-bkp", { marketId: mktTaiwan.id, fiberId: fBKP.id, subgroupId: sgChina.id, method: "subgroup_adjustment", formulaExpression: "BASE - 5", formulaReadable: "BKP base − 5 (Chinese-based subgroup)", adjustment: new Decimal(-5), priority: 5, activeFrom: "2025-01" })
  await upsertRule("rule-tw-sg-ukp", { marketId: mktTaiwan.id, fiberId: fUKP.id, subgroupId: sgChina.id, method: "subgroup_adjustment", formulaExpression: "BASE - 5", formulaReadable: "UKP base − 5 (Chinese-based subgroup)", adjustment: new Decimal(-5), priority: 5, activeFrom: "2025-01" })

  // UAE — EKP only (confirmed in CRM: ABU DHABI NATIONAL PAPER MILL)
  await upsertRule("rule-uae-ekp", { marketId: mktUAE.id, fiberId: fEKP.id, method: "index_formula", formulaExpression: "PIX_CHINA + 10", formulaReadable: "PIX China + 10", priority: 10, activeFrom: "2025-01" })
  await upsertRule("rule-uae-crown-ekp", { marketId: mktUAE.id, fiberId: fEKP.id, method: "manual", formulaReadable: "Crown — manual from May 2026", priority: 5, activeFrom: "2026-05", notes: "Crown pricing from May 2026" })

  // USA Sofidel — EKP per mill (TTO-based)
  await upsertRule("rule-sof-shelby-ekp", { marketId: mktSofidel.id, fiberId: fEKP.id, millId: millShelby.id, method: "index_formula", formulaExpression: "TTO - 30", formulaReadable: "TTO − 30 (Shelby)", priority: 5, activeFrom: "2025-01" })
  await upsertRule("rule-sof-circleville-ekp", { marketId: mktSofidel.id, fiberId: fEKP.id, millId: millCircleville.id, method: "index_formula", formulaExpression: "TTO - 20", formulaReadable: "TTO − 20 (Circleville)", priority: 5, activeFrom: "2025-01" })
  await upsertRule("rule-sof-gilabend-ekp", { marketId: mktSofidel.id, fiberId: fEKP.id, millId: millGilaBend.id, method: "index_formula", formulaExpression: "TTO + 30", formulaReadable: "TTO + 30 (Gila Bend)", priority: 5, activeFrom: "2025-01" })

  // USA James Hardie — UKP per mill (manual)
  for (const [ruleId, millId] of [
    ["rule-jh-pulaski-ukp", millPulaski.id],
    ["rule-jh-peru-ukp", millPeru.id],
    ["rule-jh-pc-ukp", millPC.id],
    ["rule-jh-reno-ukp", millReno.id],
    ["rule-jh-prattville-ukp", millPrattville.id],
  ] as [string, string][]) {
    await upsertRule(ruleId, { marketId: mktJH.id, fiberId: fUKP.id, millId, method: "manual", formulaReadable: "Manual per mill", manualPrice: new Decimal(598), priority: 5, activeFrom: "2025-01" })
  }

  // New Zealand — EKP only (Whakatane, PIX formula)
  await upsertRule("rule-nz-ekp", { marketId: mktNZ.id, fiberId: fEKP.id, millId: millWhakatane.id, method: "index_formula", formulaExpression: "PIX_CHINA * 0.985 + 25", formulaReadable: "PIX China × (1 − 1.5%) + 25", priority: 5, activeFrom: "2025-01" })

  // Pakistan — EKP and UKP only (confirmed in CRM: BULLEH SHAH PACKAGING)
  await upsertRule("rule-pak-ekp", { marketId: mktPakistan.id, fiberId: fEKP.id, method: "manual", formulaReadable: "Manual negotiated monthly", priority: 10, activeFrom: "2025-01", notes: "BULLEH SHAH PACKAGING" })
  await upsertRule("rule-pak-ukp", { marketId: mktPakistan.id, fiberId: fUKP.id, method: "manual", formulaReadable: "Manual negotiated monthly", priority: 10, activeFrom: "2025-01", notes: "BULLEH SHAH PACKAGING" })

  // Japan — BKP, EKP, UKP (all three confirmed in CRM: ITOCHU + KAMI SHOJI)
  for (const [ruleId, fiberId] of [
    ["rule-jp-bkp", fBKP.id],
    ["rule-jp-ekp", fEKP.id],
    ["rule-jp-ukp", fUKP.id],
  ] as [string, string][]) {
    await upsertRule(ruleId, { marketId: mktJapan.id, fiberId, method: "manual", formulaReadable: "Manual verbal negotiation", priority: 10, activeFrom: "2025-01", notes: "Verbal only." })
  }

  // Korea — BKP, EKP, UKP (all three confirmed in CRM)
  for (const [ruleId, fiberId] of [
    ["rule-kr-bkp", fBKP.id],
    ["rule-kr-ekp", fEKP.id],
    ["rule-kr-ukp", fUKP.id],
  ] as [string, string][]) {
    await upsertRule(ruleId, { marketId: mktKorea.id, fiberId, method: "manual", formulaReadable: "Manual verbal negotiation", priority: 10, activeFrom: "2025-01", notes: "Verbal only." })
  }

  // Thailand — EKP and UKP only (confirmed in CRM)
  for (const [ruleId, fiberId] of [
    ["rule-th-ekp", fEKP.id],
    ["rule-th-ukp", fUKP.id],
  ] as [string, string][]) {
    await upsertRule(ruleId, { marketId: mktThailand.id, fiberId, method: "manual", formulaReadable: "Manual verbal negotiation", priority: 10, activeFrom: "2025-01", notes: "Verbal only." })
  }

  const excExists = await prisma.customerException.findFirst({ where: { customerId: custCrown.id, fiberId: fEKP.id } })
  if (!excExists) {
    await prisma.customerException.create({
      data: { customerId: custCrown.id, fiberId: fEKP.id, adjustmentType: "delayed_start", delayedStart: "2026-05", notes: "Crown pricing not active until May 2026", activeFrom: "2025-01" },
    })
  }

  const cycleRows = [
    { market: mktTaiwan, month: "2025-12", priceStatus: "decided" as PriceStatus, commStatus: "confirmed" as CommStatus, orderStatus: "closed" as OrderStatus, cycleStatus: "closed" as CycleStatus },
    { market: mktTaiwan, month: "2026-01", priceStatus: "decided" as PriceStatus, commStatus: "confirmed" as CommStatus, orderStatus: "closed" as OrderStatus, cycleStatus: "closed" as CycleStatus },
    { market: mktTaiwan, month: "2026-02", priceStatus: "decided" as PriceStatus, commStatus: "sent" as CommStatus, orderStatus: "agreed" as OrderStatus, cycleStatus: "in_progress" as CycleStatus },
    { market: mktTaiwan, month: "2026-03", priceStatus: "decided" as PriceStatus, commStatus: "pending" as CommStatus, orderStatus: "none" as OrderStatus, cycleStatus: "in_progress" as CycleStatus },

    { market: mktUAE, month: "2026-02", priceStatus: "negotiating" as PriceStatus, commStatus: "not_needed" as CommStatus, orderStatus: "discussed" as OrderStatus, cycleStatus: "on_hold" as CycleStatus, onHold: true, holdReason: "Crown pricing starts May", holdReviewDate: new Date("2026-05-01") },
    { market: mktUAE, month: "2026-03", priceStatus: "not_started" as PriceStatus, commStatus: "not_needed" as CommStatus, orderStatus: "none" as OrderStatus, cycleStatus: "on_hold" as CycleStatus, onHold: true, holdReason: "Crown pricing starts May", holdReviewDate: new Date("2026-05-01") },

    { market: mktUSA, month: "2026-01", priceStatus: "decided" as PriceStatus, commStatus: "sent" as CommStatus, orderStatus: "ordered" as OrderStatus, cycleStatus: "closed" as CycleStatus },
    { market: mktUSA, month: "2026-02", priceStatus: "decided" as PriceStatus, commStatus: "sent" as CommStatus, orderStatus: "ordered" as OrderStatus, cycleStatus: "in_progress" as CycleStatus },
    { market: mktUSA, month: "2026-03", priceStatus: "decided" as PriceStatus, commStatus: "drafted" as CommStatus, orderStatus: "discussed" as OrderStatus, cycleStatus: "in_progress" as CycleStatus },

    { market: mktNZ, month: "2026-01", priceStatus: "decided" as PriceStatus, commStatus: "sent" as CommStatus, orderStatus: "agreed" as OrderStatus, cycleStatus: "closed" as CycleStatus },
    { market: mktNZ, month: "2026-02", priceStatus: "decided" as PriceStatus, commStatus: "sent" as CommStatus, orderStatus: "agreed" as OrderStatus, cycleStatus: "in_progress" as CycleStatus },
    { market: mktNZ, month: "2026-03", priceStatus: "decided" as PriceStatus, commStatus: "pending" as CommStatus, orderStatus: "none" as OrderStatus, cycleStatus: "in_progress" as CycleStatus },

    { market: mktPakistan, month: "2025-12", priceStatus: "decided" as PriceStatus, commStatus: "confirmed" as CommStatus, orderStatus: "closed" as OrderStatus, cycleStatus: "closed" as CycleStatus },
    { market: mktPakistan, month: "2026-01", priceStatus: "decided" as PriceStatus, commStatus: "confirmed" as CommStatus, orderStatus: "closed" as OrderStatus, cycleStatus: "closed" as CycleStatus },
    { market: mktPakistan, month: "2026-02", priceStatus: "decided" as PriceStatus, commStatus: "confirmed" as CommStatus, orderStatus: "closed" as OrderStatus, cycleStatus: "closed" as CycleStatus },
    { market: mktPakistan, month: "2026-03", priceStatus: "negotiating" as PriceStatus, commStatus: "pending" as CommStatus, orderStatus: "discussed" as OrderStatus, cycleStatus: "in_progress" as CycleStatus },

    { market: mktJapan, month: "2026-03", priceStatus: "negotiating" as PriceStatus, commStatus: "not_needed" as CommStatus, orderStatus: "discussed" as OrderStatus, cycleStatus: "in_progress" as CycleStatus },
    { market: mktKorea, month: "2026-03", priceStatus: "not_started" as PriceStatus, commStatus: "not_needed" as CommStatus, orderStatus: "none" as OrderStatus, cycleStatus: "open" as CycleStatus },
    { market: mktThailand, month: "2026-03", priceStatus: "negotiating" as PriceStatus, commStatus: "not_needed" as CommStatus, orderStatus: "discussed" as OrderStatus, cycleStatus: "in_progress" as CycleStatus },
  ]

  const cycleMap: Record<string, string> = {}

  for (const row of cycleRows) {
    const cycle = await prisma.monthlyCycle.upsert({
      where: { month_marketId: { month: row.month, marketId: row.market.id } },
      update: {},
      create: {
        month: row.month, marketId: row.market.id,
        priceStatus: row.priceStatus, commStatus: row.commStatus,
        orderStatus: row.orderStatus, cycleStatus: row.cycleStatus,
        onHold: (row as any).onHold ?? false,
        holdReason: (row as any).holdReason ?? null,
        holdReviewDate: (row as any).holdReviewDate ?? null,
        owner: "Andrés",
        closedAt: row.cycleStatus === "closed" ? new Date() : null,
      },
    })
    cycleMap[`${row.market.id}-${row.month}`] = cycle.id
  }

  async function seedPrice(cycleId: string, fiberId: string, price: number, method: PricingMethod, formula?: string, millId?: string) {
    const cycle = await prisma.monthlyCycle.findUnique({ where: { id: cycleId }, select: { marketId: true } })
    if (!cycle) return
    const existing = await prisma.monthlyPrice.findFirst({
      where: { cycleId, fiberId, millId: millId ?? null, customerId: null },
    })
    if (existing) {
      await prisma.monthlyPrice.update({
        where: { id: existing.id },
        data: { price: new Decimal(price) },
      })
    } else {
      await prisma.monthlyPrice.create({
        data: {
          cycleId, marketId: cycle.marketId, fiberId,
          millId: millId ?? null,
          customerId: null,
          price: new Decimal(price),
          pricingMethod: method,
          formulaSnapshot: formula ?? null,
          indexSnapshot: { PIX_CHINA: 625, TTO: 598 },
        },
      })
    }
  }

  const twFeb = cycleMap[`${mktTaiwan.id}-2026-02`]
  const twMar = cycleMap[`${mktTaiwan.id}-2026-03`]
  const nzMar = cycleMap[`${mktNZ.id}-2026-03`]
  const usaMar = cycleMap[`${mktUSA.id}-2026-03`]

  // Taiwan — seed current month prices only, CRM will fill history
  if (twFeb) {
    await seedPrice(twFeb, fBKP.id, 680, "manual")
    await seedPrice(twFeb, fEKP.id, 670, "manual")
    await seedPrice(twFeb, fUKP.id, 675, "manual")
  }
  if (twMar) {
    await seedPrice(twMar, fBKP.id, 685, "manual")
    await seedPrice(twMar, fEKP.id, 675, "manual")
    await seedPrice(twMar, fUKP.id, 680, "manual")
  }

  // New Zealand — PIX formula
  if (nzMar) await seedPrice(nzMar, fEKP.id, 641, "index_formula", "PIX_CHINA * 0.985 + 25", millWhakatane.id)

  // USA — TTO formula for Sofidel, manual for JH
  if (usaMar) {
    await seedPrice(usaMar, fEKP.id, 568, "index_formula", "TTO - 30", millShelby.id)
    await seedPrice(usaMar, fEKP.id, 578, "index_formula", "TTO - 20", millCircleville.id)
    await seedPrice(usaMar, fEKP.id, 628, "index_formula", "TTO + 30", millGilaBend.id)
    await seedPrice(usaMar, fUKP.id, 598, "manual", undefined, millPulaski.id)
    await seedPrice(usaMar, fUKP.id, 598, "manual", undefined, millPeru.id)
    await seedPrice(usaMar, fUKP.id, 598, "manual", undefined, millPC.id)
    await seedPrice(usaMar, fUKP.id, 598, "manual", undefined, millReno.id)
    await seedPrice(usaMar, fUKP.id, 598, "manual", undefined, millPrattville.id)
  }

  // Pakistan — no seeded prices, CRM import provides all history

  const negEvents = [
    { date: new Date("2026-03-07"), month: "2026-03", marketId: mktJapan.id, fiberId: fBKP.id, price: 690, status: "pending", summary: "Verbal discussion, no decision", next: "Follow up call", cycleId: cycleMap[`${mktJapan.id}-2026-03`] },
    { date: new Date("2026-03-05"), month: "2026-03", marketId: mktUAE.id, fiberId: fEKP.id, price: 641, status: "open", summary: "Formula price discussed, Crown on hold", next: "Resume May 1", cycleId: cycleMap[`${mktUAE.id}-2026-03`] },
    { date: new Date("2026-02-28"), month: "2026-02", marketId: mktTaiwan.id, fiberId: fBKP.id, price: 680, status: "agreed", summary: "Feb increase accepted by Silvia", next: "Confirmed", cycleId: twFeb },
  ]

  for (const ev of negEvents) {
    if (!ev.cycleId) continue
    await prisma.negotiationEvent.create({
      data: { date: ev.date, month: ev.month, marketId: ev.marketId, cycleId: ev.cycleId, fiberId: ev.fiberId, discussedPrice: new Decimal(ev.price), status: ev.status as any, summary: ev.summary, nextStep: ev.next, owner: "Andrés" },
    }).catch(() => {})
  }

  const orderDefs = [
    { cycleId: usaMar, customerId: custSofidel.id, fiberId: fEKP.id, millId: millShelby.id, volume: 800, price: 568, status: "ordered", ref: "SO-2026-0341" },
    { cycleId: usaMar, customerId: custSofidel.id, fiberId: fEKP.id, millId: millCircleville.id, volume: 600, price: 578, status: "ordered", ref: "SO-2026-0342" },
    { cycleId: usaMar, customerId: custJH.id, fiberId: fUKP.id, millId: millPulaski.id, volume: 400, price: 598, status: "agreed", ref: "JH-2026-0211" },
    { cycleId: nzMar, customerId: custWhakatane.id, fiberId: fEKP.id, millId: millWhakatane.id, volume: 1200, price: 641, status: "agreed", ref: "NZ-2026-0088" },
  ]

  for (const o of orderDefs) {
    if (!o.cycleId) continue
    const cycle = await prisma.monthlyCycle.findUnique({ where: { id: o.cycleId }, select: { month: true } })
    if (!cycle) continue
    await prisma.orderRecord.create({
      data: { month: cycle.month, cycleId: o.cycleId, customerId: o.customerId, fiberId: o.fiberId, millId: o.millId, volume: new Decimal(o.volume), price: new Decimal(o.price), status: o.status as any, reference: o.ref },
    }).catch(() => {})
  }

  await prisma.auditLog.create({ data: { entity: "Seed", entityId: "init", field: "seeded", oldValue: null, newValue: "2026-03", changedBy: "system", month: "2026-03" } }).catch(() => {})

  console.log("✅ Seed complete.")
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())