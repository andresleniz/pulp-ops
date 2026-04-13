export const dynamic = "force-dynamic"

import Link from "next/link"
import { getRegionalHistoricalCharts } from "@/lib/indexes-chart-queries"
import RegionalIndexChartClient from "./RegionalIndexChartClient"

export default async function PricingChartsPage() {
  const currentMonth = new Date().toISOString().slice(0, 7)
  const regions = await getRegionalHistoricalCharts(currentMonth)

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Index Charts</h1>
          <p className="text-sm text-gray-500 mt-1">
            24-month observed history · Fastmarkets &amp; TTO
          </p>
        </div>
        <Link href="/pricing/indexes" className="text-sm text-blue-600 hover:underline">
          ← Indexes
        </Link>
      </div>

      <div className="space-y-6">
        {regions.map((region) => (
          <RegionalIndexChartClient key={region.region} region={region} />
        ))}
      </div>
    </div>
  )
}
