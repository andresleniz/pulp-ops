import Link from "next/link"

const nav = [
  {
    label: "Overview", items: [
      { href: "/", label: "Dashboard", icon: "◈" },
      { href: "/tasks", label: "Tasks", icon: "✓" },
    ]
  },
  {
    label: "Markets", items: [
      { href: "/markets", label: "All Markets", icon: "◎" },
    ]
  },
  {
    label: "Pricing", items: [
      { href: "/indexes", label: "Indexes", icon: "≡" },
      { href: "/charts", label: "Charts", icon: "∿" },
    ]
  },
  {
    label: "Comms", items: [
      { href: "/emails", label: "Email Drafts", icon: "✉" },
      { href: "/negotiations", label: "Negotiations", icon: "◷" },
    ]
  },
  { label: "Records", items: [
  { href: "/orders", label: "Orders", icon: "▤" },
  { href: "/import", label: "CRM Import", icon: "↑" },
  { href: "/audit", label: "Audit Trail", icon: "⌦" },
]},
]

export function Sidebar() {
  return (
    <aside className="w-52 bg-white border-r border-gray-200 flex-shrink-0 flex flex-col">
      <div className="px-4 py-4 border-b border-gray-100">
        <span className="text-sm font-medium text-gray-400 tracking-widest uppercase">
          Pulp <span className="text-gray-900">Ops</span>
        </span>
      </div>
      <nav className="flex-1 py-2 overflow-y-auto">
        {nav.map((section) => (
          <div key={section.label} className="px-2 py-2">
            <div className="text-xs text-gray-400 uppercase tracking-widest px-2 pb-1">
              {section.label}
            </div>
            {section.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
              >
                <span className="w-4 text-center text-xs opacity-60">{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  )
}