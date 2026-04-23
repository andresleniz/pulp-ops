export const dynamic = "force-dynamic"

import { notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import {
  getEuropeCustomerIncotermVolumeSeries,
  getEuropeCustomerIncotermPriceSeries,
  getEuropeCustomerIncotermSummaries,
} from "@/lib/europe-queries"
import { EuropeCustomerClient } from "@/components/markets/europe-customer-client"
import Link from "next/link"

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number)
  return new Date(y, m - 1).toLocaleString("en-US", { month: "long", year: "numeric" })
}

export default async function EuropeCustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ country: string; customer: string }>
  searchParams: Promise<{ month?: string }>
}) {
  const [{ country: countrySlug, customer: customerSlug }, { month: monthParam }] = await Promise.all([
    params,
    searchParams,
  ])
  const country = decodeURIComponent(countrySlug)
  const customer = decodeURIComponent(customerSlug)

  const europeMarket = await prisma.market.findUnique({ where: { name: "Europe" } })
  if (!europeMarket) notFound()

  // Verify this customer exists for this country in Europe net-price data
  const customerExists = await prisma.orderRecord.findFirst({
    where: {
      source: "CRM",
      isNetPrice: true,
      country,
      cycle: { marketId: europeMarket.id },
      customer: { name: customer },
    },
    select: { id: true },
  })
  if (!customerExists) notFound()

  // ── Month resolution ──────────────────────────────────────────────────────
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

  // ── Fetch all data in parallel ────────────────────────────────────────────
  const [
    incotermVolumeSeries,
    { chartDataByFiber: incotermPriceSeries, allPoints },
    incotermSummaries,
  ] = await Promise.all([
    getEuropeCustomerIncotermVolumeSeries({
      marketId: europeMarket.id, country, customer, months: chartMonths,
    }),
    getEuropeCustomerIncotermPriceSeries({
      marketId: europeMarket.id, country, customer, months: chartMonths,
    }),
    getEuropeCustomerIncotermSummaries({
      marketId: europeMarket.id, country, customer, months: chartMonths,
    }),
  ])

  // ── KPI strip — computed from allPoints ───────────────────────────────────
  const totalVolume = allPoints.reduce((s, p) => s + p.volume, 0)
  const totalVal = allPoints.reduce((s, p) => s + p.price * p.volume, 0)
  const avgNetPrice = totalVolume > 0 ? totalVal / totalVolume : null
  const monthsActive = new Set(allPoints.map((p) => p.month)).size
  const incotermCount = new Set(
    allPoints.map((p) => p.incoterm).filter((i): i is string => !!i && i.trim() !== "")
  ).size

  return (
    <div className="p-6 max-w-7xl mx-auto">

      {/* ── Breadcrumb + header ── */}
      <div className="mb-6">
        <div className="flex items-center gap-1.5 text-xs text-gray-400 flex-wrap">
          <Link href="/" className="hover:text-gray-600">Dashboard</Link>
          <span>›</span>
          <Link href={`/markets/europe?month=${selectedMonth}`} className="hover:text-gray-600">
            Europe
          </Link>
          <span>›</span>
          <Link
            href={`/markets/europe/${encodeURIComponent(country)}?month=${selectedMonth}`}
            className="hover:text-gray-600"
          >
            {country}
          </Link>
          <span>›</span>
          <span className="text-gray-600">{customer}</span>
        </div>
        <h1 className="text-2xl font-semibold mt-1">{customer}</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Europe · {country} · {monthLabel(selectedMonth)} context · Last 12 months shown
        </p>
      </div>

      <EuropeCustomerClient
        country={country}
        customer={customer}
        selectedMonth={selectedMonth}
        kpi={{ totalVolume, avgNetPrice, monthsActive, incotermCount }}
        incotermVolumeSeries={incotermVolumeSeries}
        incotermPriceSeries={incotermPriceSeries}
        incotermSummaries={incotermSummaries}
        allPoints={allPoints}
      />
    </div>
  )
}
