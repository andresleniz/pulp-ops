"use client"

import { VolumeChart } from "@/components/markets/volume-chart"
import { PriceChart } from "@/components/markets/price-chart"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { VolumeChartSeries } from "@/lib/volume-queries"
import type {
  EuropeCountryPricePoint,
  EuropeCustomerIncotermSummary,
} from "@/lib/europe-queries"

interface Props {
  country: string
  customer: string
  selectedMonth: string
  kpi: {
    totalVolume: number
    avgNetPrice: number | null
    monthsActive: number
    incotermCount: number
  }
  incotermVolumeSeries: Record<string, VolumeChartSeries>
  incotermPriceSeries: Record<string, { data: Record<string, string | number | null>[]; customers: string[] }>
  incotermSummaries: EuropeCustomerIncotermSummary[]
  allPoints: EuropeCountryPricePoint[]
}

export function EuropeCustomerClient({
  country,
  customer,
  selectedMonth,
  kpi,
  incotermVolumeSeries,
  incotermPriceSeries,
  incotermSummaries,
  allPoints,
}: Props) {
  // Detail table sorted by month desc
  const sortedPoints = [...allPoints].sort((a, b) => b.month.localeCompare(a.month))

  return (
    <div className="space-y-4">

      {/* ── KPI strip ── */}
      <div className="grid grid-cols-4 gap-4">
        {[
          {
            label: "Total Volume",
            value: kpi.totalVolume.toLocaleString("en-US", { maximumFractionDigits: 0 }),
            sub: "ADT · last 12 months",
          },
          {
            label: "Avg Net Price",
            value: kpi.avgNetPrice !== null
              ? `$${kpi.avgNetPrice.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
              : "—",
            sub: kpi.avgNetPrice !== null ? "USD/ADT · weighted" : "no net price data",
          },
          {
            label: "Months Active",
            value: kpi.monthsActive,
            sub: "of last 12",
          },
          {
            label: "Incoterms",
            value: kpi.incotermCount,
            sub: "distinct",
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

      {/* ── Volume by Incoterm ── */}
      {Object.keys(incotermVolumeSeries).length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Volume by Incoterm — Last 12 Months
            </CardTitle>
            <p className="text-xs text-gray-400 mt-0.5">ADT — net-price rows only</p>
          </CardHeader>
          <CardContent className="space-y-6">
            {Object.entries(incotermVolumeSeries).map(([fiberCode, { data, customers }]) => (
              <VolumeChart
                key={fiberCode}
                fiberCode={fiberCode}
                data={data}
                customers={customers}
              />
            ))}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6 pb-6">
            <p className="text-sm text-amber-700 bg-amber-50 rounded px-3 py-2">
              No Incoterm data available for {customer} in {country}. Re-import the CRM
              file with an &ldquo;Incoterm&rdquo; column to populate this chart.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Net Price by Incoterm ── */}
      {Object.keys(incotermPriceSeries).length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Net Price by Incoterm — Last 12 Months (USD/ADT)
            </CardTitle>
            <p className="text-xs text-gray-400 mt-0.5">Volume-weighted average net price</p>
          </CardHeader>
          <CardContent className="space-y-6">
            {Object.entries(incotermPriceSeries).map(([fiberCode, { data, customers }]) => (
              <PriceChart
                key={fiberCode}
                fiberCode={fiberCode}
                data={data}
                customers={customers}
              />
            ))}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6 pb-6">
            <p className="text-sm text-amber-700 bg-amber-50 rounded px-3 py-2">
              No net price data available for {customer}. Re-import the CRM file with a
              dedicated &ldquo;Net Price&rdquo; column to populate net-price reports.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Incoterm summary table ── */}
      {incotermSummaries.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Incoterm Summary</CardTitle>
            <p className="text-xs text-gray-400 mt-0.5">Last 12 months · sorted by total volume</p>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 border-b">
                  <th className="text-left pb-2 font-medium">Incoterm</th>
                  <th className="text-right pb-2 font-medium">Total ADT</th>
                  <th className="text-right pb-2 font-medium">Avg Net USD/ADT</th>
                  <th className="text-right pb-2 font-medium">Months Active</th>
                </tr>
              </thead>
              <tbody>
                {incotermSummaries.map((s) => (
                  <tr
                    key={s.incoterm}
                    className="border-b border-gray-50 last:border-0 hover:bg-gray-50"
                  >
                    <td className="py-1.5 font-medium">{s.incoterm}</td>
                    <td className="py-1.5 text-right tabular-nums">
                      {s.totalVolume.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {s.avgNetPrice !== null
                        ? `$${s.avgNetPrice.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
                        : "—"}
                    </td>
                    <td className="py-1.5 text-right text-gray-500 text-xs">{s.monthsActive}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* ── Order detail table ── */}
      {sortedPoints.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Net Price Order Detail</CardTitle>
            <p className="text-xs text-gray-400 mt-0.5">
              All net-price rows · {selectedMonth} highlighted
            </p>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 border-b">
                  <th className="text-left pb-2 font-medium">Month</th>
                  <th className="text-left pb-2 font-medium">Incoterm</th>
                  <th className="text-left pb-2 font-medium">Fiber</th>
                  <th className="text-right pb-2 font-medium">ADT</th>
                  <th className="text-right pb-2 font-medium">Net USD/ADT</th>
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
                    <td className="py-1.5 text-gray-500 text-xs">
                      {p.incoterm ?? <span className="text-gray-300">—</span>}
                    </td>
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
  )
}
