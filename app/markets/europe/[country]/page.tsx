export const dynamic = "force-dynamic"

import { notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import {
  getEuropeCountryVolumeSeries,
  getEuropeCountryPriceSeries,
} from "@/lib/europe-queries"
import { VolumeChart } from "@/components/markets/volume-chart"
import { PriceChart } from "@/components/markets/price-chart"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import Link from "next/link"

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number)
  return new Date(y, m - 1).toLocaleString("en-US", { month: "long", year: "numeric" })
}

export default async function EuropeCountryPage({
  params,
  searchParams,
}: {
  params: Promise<{ country: string }>
  searchParams: Promise<{ month?: string }>
}) {
  const [{ country: countrySlug }, { month: monthParam }] = await Promise.all([
    params,
    searchParams,
  ])
  const country = decodeURIComponent(countrySlug)

  const europeMarket = await prisma.market.findUnique({ where: { name: "Europe" } })
  if (!europeMarket) notFound()

  // Verify this country exists in our order data
  const countryExists = await prisma.orderRecord.findFirst({
    where: { country, cycle: { marketId: europeMarket.id } },
    select: { id: true },
  })
  if (!countryExists) notFound()

  // ── Month resolution — same rule as main dashboard and Europe overview ────
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

  // Chart window: last 12 months of available cycle data
  const chartMonths = months.slice(0, 12).reverse()

  const [volumeByFiber, { chartDataByFiber, allPoints }] = await Promise.all([
    getEuropeCountryVolumeSeries({ marketId: europeMarket.id, country, months: chartMonths }),
    getEuropeCountryPriceSeries({ marketId: europeMarket.id, country, months: chartMonths }),
  ])

  // Sort detail rows by month desc, then customer asc
  const sortedPoints = [...allPoints].sort(
    (a, b) => b.month.localeCompare(a.month) || a.customer.localeCompare(b.customer)
  )

  return (
    <div className="p-6 max-w-7xl mx-auto">

      {/* ── Breadcrumb + header ── */}
      <div className="mb-4">
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <Link href="/" className="hover:text-gray-600">Dashboard</Link>
          <span>›</span>
          {/* Preserve selected month when navigating back to Europe overview */}
          <Link
            href={`/markets/europe?month=${selectedMonth}`}
            className="hover:text-gray-600"
          >
            Europe
          </Link>
          <span>›</span>
          <span className="text-gray-600">{country}</span>
        </div>
        <h1 className="text-2xl font-semibold mt-1">{country}</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Europe · {monthLabel(selectedMonth)} context · Last 12 months shown
        </p>
      </div>

      <div className="space-y-4">

        {/* Volume charts */}
        {Object.keys(volumeByFiber).length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                Volume History — Last 12 Months
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {Object.entries(volumeByFiber).map(([fiberCode, { data, customers }]) => (
                <VolumeChart
                  key={fiberCode}
                  fiberCode={fiberCode}
                  data={data}
                  customers={customers}
                />
              ))}
            </CardContent>
          </Card>
        )}

        {/* Price charts */}
        {Object.keys(chartDataByFiber).length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                Price History — Last 12 Months (USD/ADT)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {Object.entries(chartDataByFiber).map(([fiberCode, { data, customers }]) => (
                <PriceChart
                  key={fiberCode}
                  fiberCode={fiberCode}
                  data={data}
                  customers={customers}
                />
              ))}
            </CardContent>
          </Card>
        )}

        {/* Order detail table */}
        {sortedPoints.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Order Detail</CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-400 border-b">
                    <th className="text-left pb-2 font-medium">Month</th>
                    <th className="text-left pb-2 font-medium">Customer</th>
                    <th className="text-left pb-2 font-medium">Fiber</th>
                    <th className="text-right pb-2 font-medium">ADT</th>
                    <th className="text-right pb-2 font-medium">USD/ADT</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPoints.map((p, i) => (
                    <tr
                      key={i}
                      className={`border-b border-gray-50 last:border-0 hover:bg-gray-50 ${
                        p.month === selectedMonth ? "bg-blue-50/40" : ""
                      }`}
                    >
                      <td className="py-1.5 text-gray-500">{p.month}</td>
                      <td className="py-1.5">{p.customer}</td>
                      <td className="py-1.5 text-gray-500 text-xs">{p.fiber}</td>
                      <td className="py-1.5 text-right tabular-nums">
                        {p.volume.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                      </td>
                      <td className="py-1.5 text-right tabular-nums font-medium">
                        ${p.price.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}

      </div>
    </div>
  )
}
