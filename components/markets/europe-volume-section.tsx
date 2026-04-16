"use client"

import { useState } from "react"
import { VolumeChart } from "@/components/markets/volume-chart"
import type { VolumeChartSeries, EuropeCountryDrilldownEntry } from "@/lib/volume-queries"

interface Props {
  /** Per-fiber country-level volume series (same shape as VolumeChartSeries). */
  seriesByFiber: Record<string, VolumeChartSeries>
  /** Per-country list of customer+month detail rows. */
  drilldown: Record<string, EuropeCountryDrilldownEntry[]>
}

export function EuropeVolumeSection({ seriesByFiber, drilldown }: Props) {
  const [expandedCountry, setExpandedCountry] = useState<string | null>(null)

  if (Object.keys(seriesByFiber).length === 0) {
    return <p className="text-sm text-gray-400 italic">No CRM volume data for Europe yet.</p>
  }

  // Build per-country total volume across all fibers and months for the summary table
  const countryTotals: Record<string, number> = {}
  for (const [country, entries] of Object.entries(drilldown)) {
    for (const entry of entries) {
      countryTotals[country] = (countryTotals[country] ?? 0) + entry.volume
    }
  }
  const sortedCountries = Object.keys(countryTotals).sort(
    (a, b) => countryTotals[b] - countryTotals[a]
  )

  return (
    <div className="space-y-6">
      {/* Charts — one per fiber, country as series */}
      {Object.entries(seriesByFiber).map(([fiberCode, series]) => (
        <VolumeChart
          key={fiberCode}
          fiberCode={fiberCode}
          data={series.data}
          customers={series.customers}
        />
      ))}

      {/* Country summary table with drill-down */}
      {sortedCountries.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 font-medium mb-2">Volume by Country (all periods)</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 border-b">
                <th className="text-left pb-2 font-medium">Country</th>
                <th className="text-right pb-2 font-medium">Total ADT</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {sortedCountries.map((country) => (
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
                      {countryTotals[country].toLocaleString("en-US", { maximumFractionDigits: 0 })}
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
                      <td colSpan={3} className="pb-3 pt-1 pl-4">
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
              ))}
            </tbody>
          </table>
          <p className="text-xs text-gray-400 mt-1">Double-click a row to expand customer detail.</p>
        </div>
      )}
    </div>
  )
}
