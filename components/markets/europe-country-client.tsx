"use client"

import { useState } from "react"
import Link from "next/link"
import { VolumeChart } from "@/components/markets/volume-chart"
import { PriceChart } from "@/components/markets/price-chart"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { VolumeChartSeries } from "@/lib/volume-queries"
import type {
  EuropeCountryPricePoint,
  EuropeCustomerSummary,
  EuropeIncotermSummary,
} from "@/lib/europe-queries"

type View = "customers" | "incoterms"

interface Props {
  country: string
  selectedMonth: string
  kpi: {
    totalVolume: number
    avgNetPrice: number | null
    customerCount: number
    incotermCount: number
  }
  // Customer view
  customerVolumeSeries: Record<string, VolumeChartSeries>
  customerPriceSeries: Record<string, { data: Record<string, string | number | null>[]; customers: string[] }>
  customerSummaries: EuropeCustomerSummary[]
  // Incoterm view
  incotermVolumeSeries: Record<string, VolumeChartSeries>
  incotermPriceSeries: Record<string, { data: Record<string, string | number | null>[]; customers: string[] }>
  incotermSummaries: EuropeIncotermSummary[]
  // Shared detail table
  allPoints: EuropeCountryPricePoint[]
}

export function EuropeCountryClient({
  country,
  selectedMonth,
  kpi,
  customerVolumeSeries,
  customerPriceSeries,
  customerSummaries,
  incotermVolumeSeries,
  incotermPriceSeries,
  incotermSummaries,
  allPoints,
}: Props) {
  const [view, setView] = useState<View>("customers")

  // Detail table sorted by month desc, then customer asc
  const sortedPoints = [...allPoints].sort(
    (a, b) => b.month.localeCompare(a.month) || a.customer.localeCompare(b.customer)
  )

  return (
    <div className="space-y-4">

      {/* ── KPI strip ── */}
      <div className="grid grid-cols-4 gap-4">
        {[
          {
            label: "Total Volume",
            value: kpi.totalVolume.toLocaleString("en-US", { maximumFractionDigits: 0 }),
            sub: "ADT",
          },
          {
            label: "Avg Net Price",
            value: kpi.avgNetPrice !== null
              ? `$${kpi.avgNetPrice.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
              : "—",
            sub: kpi.avgNetPrice !== null ? "USD/ADT · weighted" : "no net price data",
          },
          {
            label: "Customers",
            value: kpi.customerCount,
            sub: "last 12 months",
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

      {/* ── View toggle ── */}
      <div className="flex items-center gap-1">
        <span className="text-xs text-gray-400 mr-2">View:</span>
        {(["customers", "incoterms"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={[
              "px-3 py-1 text-xs font-medium rounded transition-colors",
              view === v
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200",
            ].join(" ")}
          >
            {v === "customers" ? "Customers" : "Incoterms"}
          </button>
        ))}
      </div>

      {/* ── Customer view ── */}
      {view === "customers" && (
        <>
          {/* Volume by Customer */}
          {Object.keys(customerVolumeSeries).length > 0 ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  Volume by Customer — Last 12 Months
                </CardTitle>
                <p className="text-xs text-gray-400 mt-0.5">ADT — net-price rows only · sorted by total volume</p>
              </CardHeader>
              <CardContent className="space-y-6">
                {Object.entries(customerVolumeSeries).map(([fiberCode, { data, customers }]) => (
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
                  No customer volume data available for {country}.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Net Price by Customer */}
          {Object.keys(customerPriceSeries).length > 0 ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  Net Price by Customer — Last 12 Months (USD/ADT)
                </CardTitle>
                <p className="text-xs text-gray-400 mt-0.5">Volume-weighted average net price</p>
              </CardHeader>
              <CardContent className="space-y-6">
                {Object.entries(customerPriceSeries).map(([fiberCode, { data, customers }]) => (
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
                  No net price data available for {country}.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Customer summary table */}
          {customerSummaries.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Customer Summary</CardTitle>
                <p className="text-xs text-gray-400 mt-0.5">Last 12 months · sorted by total volume</p>
              </CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400 border-b">
                      <th className="text-left pb-2 font-medium">Customer</th>
                      <th className="text-right pb-2 font-medium">Total ADT</th>
                      <th className="text-right pb-2 font-medium">Avg Net USD/ADT</th>
                      <th className="text-right pb-2 font-medium">Incoterms</th>
                      <th className="text-right pb-2 font-medium">Months Active</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customerSummaries.map((s) => (
                      <tr key={s.customer} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                        <td className="py-1.5 font-medium">
                          <Link
                            href={`/markets/europe/${encodeURIComponent(country)}/${encodeURIComponent(s.customer)}?month=${selectedMonth}`}
                            className="hover:text-blue-600 hover:underline"
                          >
                            {s.customer}
                          </Link>
                        </td>
                        <td className="py-1.5 text-right tabular-nums">
                          {s.totalVolume.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                        </td>
                        <td className="py-1.5 text-right tabular-nums">
                          {s.avgNetPrice !== null
                            ? `$${s.avgNetPrice.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
                            : "—"}
                        </td>
                        <td className="py-1.5 text-right text-gray-500 text-xs">{s.incotermsCount}</td>
                        <td className="py-1.5 text-right text-gray-500 text-xs">{s.monthsActive}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* ── Incoterm view ── */}
      {view === "incoterms" && (
        <>
          {/* Volume by Incoterm */}
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
                  No Incoterm data available yet for {country}. Re-import the CRM file with an
                  &ldquo;Incoterm&rdquo; column to populate Incoterm-grouped volume charts.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Net Price by Incoterm */}
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
                  No net price data available for {country}. Re-import the CRM file with a
                  dedicated &ldquo;Net Price&rdquo; column to populate net-price reports.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Incoterm summary table */}
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
                      <th className="text-right pb-2 font-medium">Customers</th>
                    </tr>
                  </thead>
                  <tbody>
                    {incotermSummaries.map((s) => (
                      <tr key={s.incoterm} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                        <td className="py-1.5 font-medium">{s.incoterm}</td>
                        <td className="py-1.5 text-right tabular-nums">
                          {s.totalVolume.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                        </td>
                        <td className="py-1.5 text-right tabular-nums">
                          {s.avgNetPrice !== null
                            ? `$${s.avgNetPrice.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
                            : "—"}
                        </td>
                        <td className="py-1.5 text-right text-gray-500 text-xs">{s.customerCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* ── Detail table (shared across both views) ── */}
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
                  <th className="text-left pb-2 font-medium">Customer</th>
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
                    <td className="py-1.5">{p.customer}</td>
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
