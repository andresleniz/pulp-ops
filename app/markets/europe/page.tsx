export const dynamic = "force-dynamic"

import { prisma } from "@/lib/prisma"
import { getEuropeCountrySummaries } from "@/lib/europe-queries"
import { EuropeMonthSelector } from "@/components/markets/europe-month-selector"
import { Card, CardContent } from "@/components/ui/card"
import Link from "next/link"

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number)
  return new Date(y, m - 1).toLocaleString("en-US", { month: "long", year: "numeric" })
}

export default async function EuropeMarketPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const { month: monthParam } = await searchParams

  const europeMarket = await prisma.market.findUnique({ where: { name: "Europe" } })
  if (!europeMarket) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <p className="text-sm text-red-600">Europe market not configured in database.</p>
      </div>
    )
  }

  // ── Month resolution — identical to main dashboard ────────────────────────
  const today = new Date()
  const maxValidMonth = `${today.getFullYear() + 1}-${String(today.getMonth() + 1).padStart(2, "0")}`

  const monthRows = await prisma.monthlyCycle.findMany({
    where: { marketId: europeMarket.id, month: { lte: maxValidMonth } },
    select: { month: true },
    distinct: ["month"],
    orderBy: { month: "desc" },
  })
  const months = monthRows.map((r) => r.month)

  const calendarMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`
  const selectedMonth =
    monthParam && months.includes(monthParam)
      ? monthParam
      : months.includes(calendarMonth)
      ? calendarMonth
      : months[0] ?? calendarMonth

  if (months.length === 0) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <p className="text-sm text-gray-500">No cycle data found for Europe.</p>
      </div>
    )
  }

  // ── Country summaries for the selected month ──────────────────────────────
  const summaries = await getEuropeCountrySummaries({
    marketId: europeMarket.id,
    months: [selectedMonth],
  })

  // KPI aggregates — computed from summaries, no extra queries
  const totalVolume = summaries.reduce((s, c) => s + c.totalVolume, 0)
  const totalVal = summaries.reduce(
    (s, c) => s + (c.weightedPrice !== null ? c.weightedPrice * c.totalVolume : 0),
    0
  )
  const avgWeightedPrice = totalVolume > 0 ? totalVal / totalVolume : null
  const customerTotal = summaries.reduce((s, c) => s + c.customerCount, 0)

  return (
    <div className="p-6 max-w-7xl mx-auto">

      {/* ── Header — mirrors main dashboard: breadcrumb above, title+selector flex row ── */}
      <div className="mb-6">
        <Link href="/" className="text-xs text-gray-400 hover:text-gray-600">
          ← Dashboard
        </Link>
        <div className="flex items-center justify-between gap-4 mt-1">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Europe</h1>
            <p className="text-sm text-gray-500 mt-1">
              {monthLabel(selectedMonth)} — Country Overview
            </p>
          </div>
          <EuropeMonthSelector months={months} selected={selectedMonth} />
        </div>
      </div>

      {/* ── KPI strip — grid-cols-4, identical card style to main dashboard ── */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          {
            label: "Total Volume",
            value: totalVolume.toLocaleString("en-US", { maximumFractionDigits: 0 }),
            sub: "ADT",
          },
          {
            label: "Avg Price",
            value: avgWeightedPrice !== null
              ? `$${avgWeightedPrice.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
              : "—",
            sub: "USD/ADT",
          },
          {
            label: "Countries",
            value: summaries.length,
            sub: "with orders",
          },
          {
            label: "Customers",
            value: customerTotal,
            sub: "active",
          },
        ].map((m) => (
          <Card key={m.label} className="bg-gray-50 border-gray-200">
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-gray-500 mb-1">{m.label}</p>
              <p className="text-3xl font-semibold text-gray-900">{m.value}</p>
              <p className="text-xs text-gray-400 mt-1">{m.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {summaries.length === 0 ? (
        <Card>
          <CardContent className="pt-6 pb-6">
            <p className="text-sm text-amber-700 bg-amber-50 rounded px-3 py-2">
              No country data for {monthLabel(selectedMonth)}. Try a different month, or{" "}
              <Link href="/import" className="underline">
                re-import
              </Link>{" "}
              the CRM file with &ldquo;Replace all existing data&rdquo; to populate country
              breakdowns.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ── Section header — identical to dashboard "Market Status — Month" ── */}
          <h2 className="text-sm font-medium text-gray-700 mb-3">
            Countries — {monthLabel(selectedMonth)}
          </h2>

          {/* ── Country grid — grid-cols-2 gap-3, matching dashboard market grid ── */}
          <div className="grid grid-cols-2 gap-3">
            {summaries.map((s) => (
              <Link
                key={s.country}
                href={`/markets/europe/${encodeURIComponent(s.country)}?month=${selectedMonth}`}
              >
                {/* Card class mirrors dashboard: cursor-pointer hover:border-gray-400 transition-colors */}
                <Card className="cursor-pointer hover:border-gray-400 transition-colors">
                  <CardContent className="p-4">

                    {/* Top row: name + customer count badge — mirrors market name + status badges */}
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-medium text-gray-900 text-sm">{s.country}</p>
                        <p className="text-xs text-gray-400">Europe</p>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-700">
                        {s.customerCount} cust.
                      </span>
                    </div>

                    {/* Data pills — same bg-gray-100 style as market price pills */}
                    <div className="flex gap-2 flex-wrap mb-2">
                      <div className="flex items-center gap-1 bg-gray-100 rounded px-2 py-0.5">
                        <span className="text-xs text-gray-500">ADT</span>
                        <span className="text-xs font-medium text-gray-900 tabular-nums">
                          {s.totalVolume.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                        </span>
                      </div>
                      {s.weightedPrice !== null && (
                        <div className="flex items-center gap-1 bg-gray-100 rounded px-2 py-0.5">
                          <span className="text-xs text-gray-500">$/ADT</span>
                          <span className="text-xs font-medium text-gray-900 tabular-nums">
                            {s.weightedPrice.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Volume bar — single filled segment matching dashboard progress bar height */}
                    <div className="flex gap-0.5 h-1.5 mt-2">
                      <div className="flex-1 rounded-sm bg-blue-400" />
                    </div>

                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
