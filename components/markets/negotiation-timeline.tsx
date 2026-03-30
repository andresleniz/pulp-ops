interface Neg {
  id: string
  date: string
  fiber: string
  price: number | null
  status: string
  summary: string
  nextStep: string
  owner: string
}

const statusDot: Record<string, string> = {
  open: "bg-gray-400",
  agreed: "bg-green-500",
  rejected: "bg-red-500",
  pending: "bg-amber-400",
  withdrawn: "bg-gray-300",
}

export function NegotiationTimeline({ negotiations }: { negotiations: Neg[] }) {
  if (negotiations.length === 0) {
    return <p className="text-sm text-gray-400">No negotiation events.</p>
  }

  return (
    <div className="relative pl-5">
      <div className="absolute left-2 top-0 bottom-0 w-px bg-gray-200" />
      {negotiations.map((n) => (
        <div key={n.id} className="relative mb-4 last:mb-0">
          <div className={`absolute -left-3 top-1.5 h-2 w-2 rounded-full border-2 border-white ${statusDot[n.status] ?? "bg-gray-400"}`} />
          <div className="text-xs text-gray-400 mb-0.5">{n.date} · {n.owner}</div>
          <div className="text-sm text-gray-900">
            <span className="font-medium">{n.fiber}</span>
            {n.price !== null && (
              <span> — <span className="font-semibold">${n.price}</span> USD/ADT</span>
            )}
          </div>
          {n.summary && (
            <div className="text-xs text-gray-600 mt-0.5">{n.summary}</div>
          )}
          {n.nextStep && (
            <div className="text-xs text-blue-600 mt-0.5">→ {n.nextStep}</div>
          )}
        </div>
      ))}
    </div>
  )
}
