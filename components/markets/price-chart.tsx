"use client"

import { useState } from "react"
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts"

const COLORS = [
  "#2563eb", "#16a34a", "#dc2626", "#d97706",
  "#7c3aed", "#0891b2", "#be185d", "#65a30d",
]

// "Others" is the aggregate series produced when customer count exceeds the chart cap.
const OTHERS_KEY = "Others"
const OTHERS_COLOR = "#94a3b8"

interface Props {
  fiberCode: string
  data: Record<string, string | number | null>[]
  customers: string[]
}

export function PriceChart({ fiberCode, data, customers }: Props) {
  const [active, setActive] = useState<string | null>(null)

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-gray-400">
        No price history available for {fiberCode}
      </div>
    )
  }

  function toggle(name: string) {
    setActive((prev) => (prev === name ? null : name))
  }

  return (
    <div>
      <p className="text-xs font-medium text-gray-500 mb-3 uppercase tracking-wide">
        {fiberCode} — USD/ADT
      </p>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} />
          <YAxis
            tick={{ fontSize: 11, fill: "#9ca3af" }}
            tickLine={false}
            axisLine={false}
            domain={[450, 950]}
            tickFormatter={(v) => `$${v}`}
          />
          <Tooltip
            formatter={(value) => [`$${Number(value)}`, undefined]}
            contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid #e5e7eb" }}
          />
          <Legend
            wrapperStyle={{ fontSize: 12, paddingTop: 8, cursor: "pointer" }}
            onClick={(e) => toggle(e.dataKey as string)}
            formatter={(value: string) => {
              const isActive = active === value
              const isDimmed = active !== null && active !== value
              return (
                <span style={{
                  fontWeight: isActive ? 700 : 400,
                  opacity: isDimmed ? 0.35 : 1,
                  cursor: "pointer",
                }}>
                  {value}
                </span>
              )
            }}
          />
          {customers.map((name, i) => {
            const isStandard = name === "Standard"
            const isOthers = name === OTHERS_KEY
            const dimmed = active !== null && active !== name
            return (
              <Line
                key={name}
                type="monotone"
                dataKey={name}
                stroke={isOthers ? OTHERS_COLOR : isStandard ? "#94a3b8" : COLORS[i % COLORS.length]}
                strokeWidth={active === name ? 3 : isStandard || isOthers ? 1.5 : 2}
                strokeDasharray={isStandard || isOthers ? "5 3" : undefined}
                strokeOpacity={dimmed ? 0.15 : 1}
                dot={{ r: isStandard || isOthers ? 3 : 4, strokeWidth: 2, fillOpacity: dimmed ? 0.15 : 1, strokeOpacity: dimmed ? 0.15 : 1 }}
                activeDot={{ r: 6, onClick: () => toggle(name) }}
                connectNulls
                style={{ cursor: "pointer" }}
              />
            )
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
