"use client"

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number)
  return new Date(y, m - 1).toLocaleString("en-US", { month: "short", year: "numeric" })
}

interface Props {
  months: string[]
  selected: string
}

export function DashboardMonthSelector({ months, selected }: Props) {
  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    window.location.href = `/?month=${e.target.value}`
  }

  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-gray-500 whitespace-nowrap">Viewing month</label>
      <select
        value={selected}
        onChange={handleChange}
        className="border border-gray-200 rounded-md px-2 py-1.5 text-sm bg-white"
      >
        {months.map((m) => (
          <option key={m} value={m}>{monthLabel(m)}</option>
        ))}
      </select>
    </div>
  )
}