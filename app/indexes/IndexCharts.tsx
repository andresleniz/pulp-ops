"use client"

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export type ChartSeries = { name: string; data: { month: string; value: number }[] }
export type ChartGroup = { title: string; series: ChartSeries[] }

const COLORS = ["#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed", "#0891b2"]

export default function IndexCharts({ groups }: { groups: ChartGroup[] }) {
  return (
    <div className="space-y-6 mb-8">
      {groups.map((group) => {
        // Merge all series into a single array of { month, seriesName: value, ... }
        const monthSet = new Set<string>()
        group.series.forEach((s) => s.data.forEach((d) => monthSet.add(d.month)))
        const months = [...monthSet].sort()

        const chartData = months.map((month) => {
          const row: Record<string, string | number> = { month }
          group.series.forEach((s) => {
            const point = s.data.find((d) => d.month === month)
            if (point) row[s.name] = point.value
          })
          return row
        })

        return (
          <Card key={group.title}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{group.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v) => {
                      const [y, m] = String(v).split("-")
                      return `${m}/${y.slice(2)}`
                    }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    width={42}
                    domain={[450, 1000]}
                    tickFormatter={(v) => String(Math.round(v))}
                  />
                  <Tooltip
                    formatter={(value, name) => [
                      typeof value === "number" ? `${Math.round(value)}` : String(value),
                      name,
                    ]}
                    labelFormatter={(label) => `Month: ${label}`}
                    contentStyle={{ fontSize: 11 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {group.series.map((s, i) => (
                    <Line
                      key={s.name}
                      type="monotone"
                      dataKey={s.name}
                      stroke={COLORS[i % COLORS.length]}
                      dot={false}
                      strokeWidth={1.5}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
