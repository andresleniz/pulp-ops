export const dynamic = "force-dynamic"

import { notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { CycleStatusForm } from "@/components/markets/cycle-status-form"
import { PriceTable } from "@/components/markets/price-table"
import { NegotiationTimeline } from "@/components/markets/negotiation-timeline"
import { PriceChart } from "@/components/markets/price-chart"
import { CustomerPanel } from "@/components/markets/customer-panel"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import { MonthSelector } from "@/components/markets/month-selector"
import { USACharts } from "@/components/markets/usa-charts"
import { VolumeAdjustmentPanel } from "@/components/markets/volume-adjustment-panel"
import { VolumeChart } from "@/components/markets/volume-chart"

export default async function MarketDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ month?: string }>
}) {
  const { id } = await params
  const { month: monthParam } = await searchParams

  const market = await prisma.market.findUnique({
    where: { id },
    include: {
      region: true,
      agent: true,
      subgroups: true,
      customers: true,
      pricingRules: {
        where: { isActive: true },
        include: { fiber: true, mill: true, subgroup: true },
        orderBy: { priority: "asc" },
      },
    },
  })

  if (!market) notFound()

  const availableMonthRows = await prisma.monthlyCycle.findMany({
    where: { marketId: market.id },
    select: { month: true },
    distinct: ["month"],
    orderBy: { month: "asc" },
  })
  const ALL_MONTHS = availableMonthRows.map((r) => r.month)
  const selectedMonth = monthParam && ALL_MONTHS.includes(monthParam)
    ? monthParam
    : ALL_MONTHS[ALL_MONTHS.length - 1] ?? "2026-04"

  const fibers = await prisma.fiber.findMany({ orderBy: { code: "asc" } })

  const cycle = await prisma.monthlyCycle.findUnique({
    where: { month_marketId: { month: selectedMonth, marketId: market.id } },
    include: {
      monthlyPrices: { include: { fiber: true, mill: true, customer: true } },
    },
  })

  const negotiations = await prisma.negotiationEvent.findMany({
    where: { marketId: market.id },
    include: { fiber: true, customer: true },
    orderBy: { date: "desc" },
    take: 10,
  })

  const emailDrafts = cycle
    ? await prisma.emailDraft.findMany({
        where: { cycleId: cycle.id },
        orderBy: { createdAt: "desc" },
      })
    : []

  const allCycles = await prisma.monthlyCycle.findMany({
    where: { marketId: market.id },
    orderBy: { month: "desc" },
    take: 12,
  })

  const volumeAdjustments = await prisma.volumeAdjustment.findMany({
    where: { marketId: market.id, month: selectedMonth },
    include: {
      customer: { select: { name: true } },
      fiber: { select: { code: true } },
    },
    orderBy: { createdAt: "asc" },
  })

  const chartMonths = ALL_MONTHS.slice(-12)

  const historicalPrices = await prisma.monthlyPrice.findMany({
    where: {
      marketId: market.id,
      price: { not: null },
      cycle: { month: { in: chartMonths } },
    },
    include: { fiber: true, mill: true, customer: true, cycle: true },
    orderBy: { cycle: { month: "asc" } },
  })

  const fiberCodes = [...new Set(historicalPrices.map((p) => p.fiber.code))]

  const chartDataByFiber: Record<string, {
    data: Record<string, string | number | null>[]
    customers: string[]
  }> = {}

  for (const fiberCode of fiberCodes) {
    const fiberPrices = historicalPrices.filter((p) => p.fiber.code === fiberCode)

    // Standard prices (no customer, no mill) — stored as "Standard" series
    const standardPriceByMonth: Record<string, number | null> = {}
    for (const p of fiberPrices) {
      if (!p.customer && !p.mill) {
        const month = p.cycle?.month ?? ""
        if (month) standardPriceByMonth[month] = p.price ? Number(p.price) : null
      }
    }

    const customerNames = [
      ...new Set(
        fiberPrices
          .filter((p) => p.customer || p.mill)
          .map((p) => p.customer?.name ?? p.mill?.name ?? "")
          .filter(Boolean)
      ),
    ]

    const hasStandard = Object.keys(standardPriceByMonth).length > 0
    // Always show Standard line if any standard price exists; then per-customer on top
    const names = [
      ...(hasStandard ? ["Standard"] : []),
      ...customerNames,
    ]

    const monthMap: Record<string, Record<string, number | null>> = {}
    for (const month of chartMonths) {
      monthMap[month] = {}
      for (const name of names) {
        monthMap[month][name] = null
      }
    }

    // Fill standard line
    for (const [month, price] of Object.entries(standardPriceByMonth)) {
      if (monthMap[month]) monthMap[month]["Standard"] = price
    }

    // Fill per-customer lines; fall back to standard price for months without a specific price
    for (const price of fiberPrices) {
      if (!price.customer && !price.mill) continue
      const name = price.customer?.name ?? price.mill?.name ?? ""
      if (!name) continue
      const month = price.cycle?.month ?? ""
      if (month && monthMap[month]) {
        monthMap[month][name] = price.price ? Number(price.price) : null
      }
    }

    chartDataByFiber[fiberCode] = {
      data: chartMonths.map((m) => {
        const point: Record<string, string | number | null> = { month: m.slice(2) }
        for (const name of names) {
          if (name === "Standard") {
            point[name] = monthMap[m]?.["Standard"] ?? null
          } else {
            // Use customer-specific price, falling back to standard for that month
            point[name] = monthMap[m]?.[name] ?? standardPriceByMonth[m] ?? null
          }
        }
        return point
      }),
      customers: names,
    }
  }

  // ── Volume chart data ────────────────────────────────────────────────────
  const orderRecords = await prisma.orderRecord.findMany({
    where: { cycle: { marketId: market.id, month: { in: chartMonths } } },
    include: { fiber: true, customer: true, cycle: true },
  })

  const volumeFiberCodes = [...new Set(orderRecords.map((o) => o.fiber.code))]

  const volumeChartByFiber: Record<string, {
    data: Record<string, string | number | null>[]
    customers: string[]
  }> = {}

  for (const fiberCode of volumeFiberCodes) {
    const fiberOrders = orderRecords.filter((o) => o.fiber.code === fiberCode)
    const customerNames = [...new Set(fiberOrders.map((o) => o.customer.name))]

    const monthMap: Record<string, Record<string, number>> = {}
    for (const m of chartMonths) {
      monthMap[m] = {}
      for (const name of customerNames) monthMap[m][name] = 0
    }

    for (const order of fiberOrders) {
      const name = order.customer.name
      const month = order.cycle.month
      if (monthMap[month]) {
        monthMap[month][name] = (monthMap[month][name] ?? 0) + Number(order.volume)
      }
    }

    volumeChartByFiber[fiberCode] = {
      data: chartMonths.map((m) => {
        const point: Record<string, string | number | null> = { month: m.slice(2) }
        for (const name of customerNames) {
          point[name] = monthMap[m]?.[name] || null
        }
        return point
      }),
      customers: customerNames,
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-4">
        <Link href={`/?month=${selectedMonth}`} className="text-xs text-gray-400 hover:text-gray-600">
          ← Dashboard
        </Link>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          <h1 className="text-2xl font-semibold">{market.name}</h1>
          <span className="text-sm text-gray-400">{market.region.name}</span>
          {market.requiresAnnouncement && (
            <Badge variant="outline" className="text-xs">Announcement Required</Badge>
          )}
          {market.agent && (
            <Badge variant="secondary" className="text-xs">Agent: {market.agent.name}</Badge>
          )}
          <div className="ml-auto">
            <MonthSelector
              months={ALL_MONTHS}
              selected={selectedMonth}
              marketId={market.id}
            />
          </div>
        </div>
      </div>

      {cycle?.onHold && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center gap-2 text-sm text-amber-800">
          <span>⚠</span>
          <span>On Hold — {cycle.holdReason}</span>
          {cycle.holdReviewDate && (
            <span className="text-xs text-amber-600 ml-auto">
              Review: {cycle.holdReviewDate.toISOString().slice(0, 10)}
            </span>
          )}
        </div>
      )}

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-4">

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                Prices — {new Date(Number(selectedMonth.split("-")[0]), Number(selectedMonth.split("-")[1]) - 1).toLocaleString("en-US", { month: "long", year: "numeric" })}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {cycle ? (
                <PriceTable
                  cycleId={cycle.id}
                  customers={market.customers.map((c) => ({ id: c.id, name: c.name }))}
                  fibers={fibers}
                  prices={cycle.monthlyPrices.map((p) => ({
                    id: p.id,
                    fiberCode: p.fiber.code,
                    customerName: p.customer?.name ?? null,
                    millName: p.mill?.name ?? null,
                    price: p.price ? Number(p.price) : null,
                    method: p.pricingMethod,
                    formulaSnapshot: p.formulaSnapshot,
                    isOverride: p.isOverride,
                    overrideReason: p.overrideReason,
                    cycleId: cycle.id,
                    fiberId: p.fiberId,
                    millId: p.millId,
                    customerId: p.customerId,
                  }))}
                />
              ) : (
                <p className="text-sm text-gray-400">
                  No cycle exists for {selectedMonth}. Create it from the dashboard first.
                </p>
              )}
            </CardContent>
          </Card>

         {market.name === "USA" ? (
  <USACharts />
) : (
  <>
    {Object.keys(chartDataByFiber).length > 0 && (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Price History — Last 12 Months</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {Object.entries(chartDataByFiber).map(([fiberCode, { data, customers }]) => (
            <PriceChart key={fiberCode} fiberCode={fiberCode} data={data} customers={customers} />
          ))}
        </CardContent>
      </Card>
    )}
    {Object.keys(volumeChartByFiber).length > 0 && (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Volume History — Last 12 Months</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {Object.entries(volumeChartByFiber).map(([fiberCode, { data, customers }]) => (
            <VolumeChart key={fiberCode} fiberCode={fiberCode} data={data} customers={customers} />
          ))}
        </CardContent>
      </Card>
    )}
  </>
)}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Pricing Rules</CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-400 border-b">
                    <th className="text-left pb-2 font-medium">Fiber</th>
                    <th className="text-left pb-2 font-medium">Mill / Subgroup</th>
                    <th className="text-left pb-2 font-medium">Method</th>
                    <th className="text-left pb-2 font-medium">Formula</th>
                    <th className="text-left pb-2 font-medium">Priority</th>
                  </tr>
                </thead>
                <tbody>
                  {market.pricingRules.map((rule) => (
                    <tr key={rule.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2 font-medium">{rule.fiber.code}</td>
                      <td className="py-2 text-gray-500">
                        {rule.mill?.name ?? rule.subgroup?.name ?? "—"}
                      </td>
                      <td className="py-2">
                        <span className="text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded">
                          {rule.method}
                        </span>
                      </td>
                      <td className="py-2 text-gray-600 text-xs font-mono">
                        {rule.formulaReadable ?? rule.formulaExpression ?? String(rule.manualPrice ?? "—")}
                      </td>
                      <td className="py-2 text-gray-400 text-xs">{rule.priority}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Negotiation History</CardTitle>
            </CardHeader>
            <CardContent>
              <NegotiationTimeline
                negotiations={negotiations.map((n) => ({
                  id: n.id,
                  date: n.date.toISOString().slice(0, 10),
                  fiber: n.fiber.code,
                  price: n.discussedPrice ? Number(n.discussedPrice) : null,
                  status: n.status,
                  summary: n.summary ?? "",
                  nextStep: n.nextStep ?? "",
                  owner: n.owner,
                }))}
              />
            </CardContent>
          </Card>

          {emailDrafts.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Email Drafts</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {emailDrafts.map((d) => (
                  <div key={d.id} className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 bg-gray-50">
                      <div>
                        <p className="text-sm font-medium">{d.subject}</p>
                        <p className="text-xs text-gray-400">To: {d.recipientsTo}</p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${d.status === "sent" ? "bg-blue-100 text-blue-700" : d.status === "confirmed" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                        {d.status}
                      </span>
                    </div>
                    <pre className="text-xs px-3 py-2 bg-white font-mono whitespace-pre-wrap text-gray-700 max-h-48 overflow-y-auto">
                      {d.body}
                    </pre>
                    <div className="px-3 py-2 border-t border-gray-100">
                      <Link href="/emails" className="text-xs text-blue-600 hover:underline">
                        Edit in Email page →
                      </Link>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          {cycle && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Cycle Status</CardTitle>
              </CardHeader>
              <CardContent>
                <CycleStatusForm
                  cycle={{
                    id: cycle.id,
                    priceStatus: cycle.priceStatus,
                    commStatus: cycle.commStatus,
                    cycleStatus: cycle.cycleStatus,
                    onHold: cycle.onHold,
                    holdReason: cycle.holdReason ?? "",
                    internalNotes: cycle.internalNotes ?? "",
                    owner: cycle.owner,
                  }}
                />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Customers</CardTitle>
            </CardHeader>
            <CardContent>
              <CustomerPanel
                marketId={market.id}
                customers={market.customers.map((c) => ({
                  id: c.id,
                  name: c.name,
                  contactEmail: c.contactEmail,
                  notes: c.notes,
                  pricingNote: null,
                }))}
                fibers={fibers.map((f) => ({ id: f.id, code: f.code }))}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Volume Adjustments</CardTitle>
            </CardHeader>
            <CardContent>
              <VolumeAdjustmentPanel
                marketId={market.id}
                month={selectedMonth}
                customers={market.customers.map((c) => ({ id: c.id, name: c.name }))}
                fibers={fibers.map((f) => ({ id: f.id, code: f.code }))}
                adjustments={volumeAdjustments.map((a) => ({
                  id: a.id,
                  customerId: a.customerId,
                  customerName: a.customer?.name ?? null,
                  fiberId: a.fiberId,
                  fiberCode: a.fiber?.code ?? null,
                  volumeAdt: Number(a.volumeAdt),
                  reason: a.reason,
                }))}
              />
            </CardContent>
          </Card>

          {market.subgroups.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Subgroups</CardTitle>
              </CardHeader>
              <CardContent>
                {market.subgroups.map((sg) => (
                  <div key={sg.id} className="text-sm">
                    <p className="font-medium text-gray-900">{sg.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{sg.description}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Cycle History</CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full text-xs">
                <tbody>
                  {allCycles.map((c) => (
                    <tr key={c.id} className="border-b border-gray-50">
                      <td className="py-1.5 text-gray-600">{c.month}</td>
                      <td className="py-1.5">
                        <span className={`px-1.5 py-0.5 rounded text-xs ${c.priceStatus === "decided" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                          {c.priceStatus.replace("_", " ")}
                        </span>
                      </td>
                      <td className="py-1.5 text-right">
                        <Link
                          href={`/markets/${market.id}?month=${c.month}`}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link href="/emails" className="block text-sm text-gray-600 hover:text-gray-900">
                ✉ View Email Drafts
              </Link>
              <Link href="/negotiations" className="block text-sm text-gray-600 hover:text-gray-900">
                + Add Negotiation Entry
              </Link>
              <Link href="/orders" className="block text-sm text-gray-600 hover:text-gray-900">
                ▤ View Orders
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}