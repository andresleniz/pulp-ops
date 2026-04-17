"use client"

import { useState } from "react"
import { VolumeChart } from "@/components/markets/volume-chart"
import type { EuropeSeriesResult, EuropeCountryDrilldownEntry } from "@/lib/volume-queries"

interface Props {
  /** Country-level volume series + weighted price points. */
  series: EuropeSeriesResult
  /** Per-country list of customer+month detail rows for drill-down. */
  drilldown: Record<string, EuropeCountryDrilldownEntry[]>
}

export function EuropeVolumeSection({ series, drilldown }: Props) {
  const [expandedCountry, setExpandedCountry] = useState<string | null>(null)

  // Aggregate per-country summary across all fibers and months:
  //   totalVolume = sum of all ADT
  //   weightedPrice = sum(price * vol) / sum(vol)  — only for points with non-null price
  const priceAccum: Record<string, { vol: number; val: number }> = {}
  for (const points of Object.values(series.pointsByFiber)) {
    for (const pt of points) {
      if (!priceAccum[pt.country]) priceAccum[pt.country] = { vol: 0, val: 0 }
      priceAccum[pt.country].vol += pt.volume
      if (pt.weightedPrice !== null) {
        priceAccum[pt.country].val += pt.weightedPrice * pt.volume
      }
    }
  }
  const sortedCountries = series.countries.slice().sort(
    (a, b) => (priceAccum[b]?.vol ?? 0) - (priceAccum[a]?.vol ?? 0)
  )

  return (
    <div className="space-y-6">
      {/* Charts — one per fiber, country as series */}
      {Object.entries(series.volumeSeriesByFiber).map(([fiberCode, chartSeries]) => (
        <VolumeChart
          key={fiberCode}
          fiberCode={fiberCode}
          data={chartSeries.data}
          customers={chartSeries.customers}
        />
      ))}

      {/* Country summary table with weighted price + drill-down */}
      {sortedCountries.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 font-medium mb-2">Volume & Price by Country (all periods)</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 border-b">
                <th className="text-left pb-2 font-medium">Country</th>
                <th className="text-right pb-2 font-medium">Total ADT</th>
                <th className="text-right pb-2 font-medium">Avg Price (USD/ADT)</th>
                <th className="pb-2 w-8" />
              </tr>
            </thead>
            <tbody>
              {sortedCountries.map((country) => {
                const { vol, val } = priceAccum[country] ?? { vol: 0, val: 0 }
                const weightedPrice = vol > 0 ? val / vol : null
                return (
                  <>
                    <tr
                      key={country}
                      className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
                      onDoubleClick={() =>
                        setExpandedCountry((prev) => (prev === country ? null : country))
                      }
                    >
                      <td className="py-1.5 font-medium">{country}</td>
                      <td className="py-1.5 text-right tabular-nums">
                        {vol.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                      </td>
                      <td className="py-1.5 text-right tabular-nums font-medium">
                        {weightedPrice !== null
                          ? `$${weightedPrice.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                          : "—"}
                      </td>
                      <td className="py-1.5 text-right">
                        <button
                          onClick={() =>
                            setExpandedCountry((prev) => (prev === country ? null : country))
                          }
                          className="text-xs text-blue-500 hover:text-blue-700 px-2"
                          title="Toggle customer detail"
                        >
                          {expandedCountry === country ? "▲" : "▼"}
                        </button>
                      </td>
                    </tr>

                    {expandedCountry === country && drilldown[country] && (
                      <tr key={`${country}-detail`}>
                        <td colSpan={4} className="pb-3 pt-1 pl-4">
                          <table className="w-full text-xs bg-gray-50 rounded">
                            <thead>
                              <tr className="text-gray-400 border-b border-gray-200">
                                <th className="text-left py-1.5 pl-2 font-medium">Customer</th>
                                <th className="text-left py-1.5 font-medium">Month</th>
                                <th className="text-right py-1.5 font-medium">ADT</th>
                                <th className="text-right py-1.5 pr-2 font-medium">USD/ADT</th>
                              </tr>
                            </thead>
                            <tbody>
                              {drilldown[country].map((row, i) => (
                                <tr key={i} className="border-b border-gray-100 last:border-0">
                                  <td className="py-1 pl-2">{row.customer}</td>
                                  <td className="py-1 text-gray-500">{row.month}</td>
                                  <td className="py-1 text-right tabular-nums">
                                    {row.volume.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                                  </td>
                                  <td className="py-1 text-right tabular-nums pr-2">
                                    ${row.price.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
          <p className="text-xs text-gray-400 mt-1">Double-click a row to expand customer detail.</p>
        </div>
      )}
    </div>
  )
}
