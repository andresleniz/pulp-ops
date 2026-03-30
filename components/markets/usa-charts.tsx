"use client"

import { useEffect, useState } from "react"
import { USALineChart } from "./freight-chart"
import { FreightChangeChart } from "./freight-change-chart"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface ChartData {
  customers: string[]
  priceData: Record<string, string | number | null>[]
  netbackData: Record<string, string | number | null>[]
  freightChangeData: Record<string, string | number | null>[]
  significantLocations: string[]
}

export function USACharts() {
  const [data, setData] = useState<ChartData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/usa-charts")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error)
        setData(d)
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-gray-400">
          Loading charts...
        </CardContent>
      </Card>
    )
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-red-500">
          {error ?? "Failed to load chart data"}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">
          USA EKP — Price, Net Back and Freight History
        </CardTitle>
        <p className="text-xs text-gray-400">
          Last 12 months — volume-weighted averages
        </p>
      </CardHeader>
      <CardContent className="space-y-8">
        <USALineChart
          data={data.priceData}
          customers={data.customers}
          title="Price per customer"
          subtitle="Volume-weighted average selling price USD/ADT"
          domain={[400, 800]}
        />
        <div className="border-t border-gray-100 pt-6">
          <USALineChart
            data={data.netbackData}
            customers={data.customers}
            title="Net back per customer"
            subtitle="Volume-weighted average price minus freight USD/ADT"
            domain={[350, 750]}
          />
        </div>
        <div className="border-t border-gray-100 pt-6">
          <FreightChangeChart
            data={data.freightChangeData}
            locations={data.significantLocations}
          />
        </div>
      </CardContent>
    </Card>
  )
}