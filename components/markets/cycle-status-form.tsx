"use client"

import { updateCycleStatus } from "@/app/markets/[id]/actions"
import { useTransition } from "react"

interface Props {
  cycle: {
    id: string
    priceStatus: string
    commStatus: string
    cycleStatus: string
    onHold: boolean
    holdReason: string
    internalNotes: string
    owner: string
  }
}

function StatusSelect({ cycleId, field, value, options, label }: {
  cycleId: string
  field: string
  value: string
  options: string[]
  label: string
}) {
  const [pending, startTransition] = useTransition()

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const fd = new FormData()
    fd.append("cycleId", cycleId)
    fd.append("field", field)
    fd.append("value", e.target.value)
    startTransition(() => { updateCycleStatus(fd) })
  }

  return (
    <div className="mb-3">
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      <select
        defaultValue={value}
        onChange={handleChange}
        disabled={pending}
        className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm bg-white disabled:opacity-50"
      >
        {options.map((o) => (
          <option key={o} value={o}>{o.replace(/_/g, " ")}</option>
        ))}
      </select>
    </div>
  )
}

export function CycleStatusForm({ cycle }: Props) {
  return (
    <div>
      <StatusSelect
        cycleId={cycle.id}
        field="priceStatus"
        value={cycle.priceStatus}
        label="Price Status"
        options={["not_started", "negotiating", "decided", "revised"]}
      />
      <StatusSelect
        cycleId={cycle.id}
        field="commStatus"
        value={cycle.commStatus}
        label="Comm Status"
        options={["not_needed", "pending", "drafted", "sent", "confirmed"]}
      />
      <StatusSelect
        cycleId={cycle.id}
        field="cycleStatus"
        value={cycle.cycleStatus}
        label="Cycle Status"
        options={["open", "in_progress", "awaiting_confirmation", "closed", "on_hold"]}
      />
      <StatusSelect
        cycleId={cycle.id}
        field="onHold"
        value={String(cycle.onHold)}
        label="On Hold"
        options={["false", "true"]}
      />
    </div>
  )
}