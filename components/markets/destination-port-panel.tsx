"use client"

import { DestinationPortVolumeRow } from "@/lib/volume-queries"

interface Props {
  rows: DestinationPortVolumeRow[]
}

export function DestinationPortPanel({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-gray-400 italic">No destination port data available yet.</p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-gray-400 border-b">
            <th className="text-left pb-2 font-medium">Destination Port</th>
            <th className="text-left pb-2 font-medium">Month</th>
            <th className="text-right pb-2 font-medium">Volume (ADT)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
              <td className="py-1.5 font-medium">{r.destinationPort}</td>
              <td className="py-1.5 text-gray-500">{r.month}</td>
              <td className="py-1.5 text-right tabular-nums">
                {r.volume.toLocaleString("en-US", { maximumFractionDigits: 0 })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
