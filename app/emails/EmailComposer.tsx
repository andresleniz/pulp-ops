"use client"

import { useState, useTransition, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { generateDraft, saveContact, deleteContact, type FiberEntry } from "./actions"

type Market = { id: string; name: string; defaultGreeting: string | null; defaultCc: string | null }
type Contact = { id: string; marketId: string; name: string; email: string; role: string | null }
type Fiber = { code: string; name: string }

const DEFAULT_ON = new Set(["BKP", "EKP", "UKP Paper", "UKP FC"])

function currentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
}

export default function EmailComposer({
  markets,
  allContacts,
  fibers,
}: {
  markets: Market[]
  allContacts: Contact[]
  fibers: Fiber[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [marketId, setMarketId] = useState(markets[0]?.id ?? "")
  const [month, setMonth] = useState(currentMonth())
  const [greetingName, setGreetingName] = useState("")
  const [fiberRows, setFiberRows] = useState(
    fibers.map((f) => ({ code: f.code, enabled: DEFAULT_ON.has(f.code), price: "", change: "" }))
  )
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set())
  const [freeEmail, setFreeEmail] = useState("")
  const [cc, setCc] = useState("")
  const [status, setStatus] = useState<"idle" | "ok" | "error">("idle")
  const [errorMsg, setErrorMsg] = useState("")

  // Contact management
  const [showAddContact, setShowAddContact] = useState(false)
  const [newContactName, setNewContactName] = useState("")
  const [newContactEmail, setNewContactEmail] = useState("")
  const [newContactRole, setNewContactRole] = useState("")
  const [contactPending, startContactTransition] = useTransition()

  const marketContacts = allContacts.filter((c) => c.marketId === marketId)

  useEffect(() => {
    const emails = new Set(marketContacts.map((c) => c.email))
    setSelectedEmails(emails)
    const market = markets.find((m) => m.id === marketId)
    // Use saved greeting if available, else fall back to first contact's first name
    if (market?.defaultGreeting) {
      setGreetingName(market.defaultGreeting)
    } else {
      const first = marketContacts[0]
      setGreetingName(first ? first.name.split(" ")[0] : "")
    }
    setCc(market?.defaultCc ?? "")
  }, [marketId]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleFiber(code: string) {
    setFiberRows((rows) =>
      rows.map((r) => (r.code === code ? { ...r, enabled: !r.enabled } : r))
    )
  }

  function setFiberField(code: string, field: "price" | "change", value: string) {
    setFiberRows((rows) =>
      rows.map((r) => (r.code === code ? { ...r, [field]: value } : r))
    )
  }

  function toggleContact(email: string) {
    setSelectedEmails((prev) => {
      const next = new Set(prev)
      if (next.has(email)) next.delete(email)
      else next.add(email)
      return next
    })
  }

  function handleGenerate() {
    const activeFibers: FiberEntry[] = fiberRows
      .filter((r) => r.enabled && r.price.trim())
      .map((r) => ({ code: r.code, price: r.price.trim(), change: r.change.trim() }))

    if (activeFibers.length === 0) {
      setErrorMsg("Enter at least one fiber price.")
      setStatus("error")
      return
    }
    if (!greetingName.trim()) {
      setErrorMsg("Enter a greeting name.")
      setStatus("error")
      return
    }

    const recipientsTo = [...selectedEmails]
    if (freeEmail.trim()) recipientsTo.push(freeEmail.trim())

    if (recipientsTo.length === 0) {
      setErrorMsg("Add at least one recipient.")
      setStatus("error")
      return
    }

    setStatus("idle")
    startTransition(async () => {
      const result = await generateDraft({
        marketId,
        month,
        greetingName: greetingName.trim(),
        fibers: activeFibers,
        recipientsTo,
        recipientsCc: cc.split(",").map((s) => s.trim()).filter(Boolean),
      })
      if (result.ok) {
        setStatus("ok")
        setFiberRows(fibers.map((f) => ({ code: f.code, enabled: DEFAULT_ON.has(f.code), price: "", change: "" })))
        setFreeEmail("")
        setCc("")
        router.refresh()
      } else {
        setStatus("error")
        setErrorMsg(result.error)
      }
    })
  }

  function handleAddContact() {
    if (!newContactName.trim() || !newContactEmail.trim()) return
    startContactTransition(async () => {
      await saveContact({
        marketId,
        name: newContactName.trim(),
        email: newContactEmail.trim(),
        role: newContactRole.trim(),
      })
      setNewContactName("")
      setNewContactEmail("")
      setNewContactRole("")
      setShowAddContact(false)
      router.refresh()
    })
  }

  function handleDeleteContact(id: string) {
    startContactTransition(async () => {
      await deleteContact(id)
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      {/* Composer */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">New Draft</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Market + Month */}
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">Market</label>
              <select
                value={marketId}
                onChange={(e) => setMarketId(e.target.value)}
                className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm bg-white"
              >
                {markets.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Month</label>
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="border border-gray-200 rounded-md px-2 py-1.5 text-sm"
              />
            </div>
          </div>

          {/* Greeting */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Dear…</label>
            <input
              type="text"
              value={greetingName}
              onChange={(e) => setGreetingName(e.target.value)}
              placeholder="e.g. Silvia"
              className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm"
            />
          </div>

          {/* Fiber prices */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-4" />
              <span className="text-xs text-gray-400 w-8" />
              <span className="text-xs text-gray-400 w-20 text-center">Price</span>
              <span className="text-xs text-gray-400 flex-1 text-center">Change vs prev</span>
            </div>
            <div className="space-y-1.5">
              {fiberRows.map((row) => (
                <div key={row.code} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={row.enabled}
                    onChange={() => toggleFiber(row.code)}
                    className="rounded"
                  />
                  <span className="text-xs font-mono w-8 text-gray-700">{row.code}</span>
                  <input
                    type="number"
                    value={row.price}
                    onChange={(e) => setFiberField(row.code, "price", e.target.value)}
                    placeholder="e.g. 650"
                    disabled={!row.enabled}
                    className="w-20 border border-gray-200 rounded px-2 py-1 text-xs disabled:opacity-40"
                  />
                  <input
                    type="text"
                    value={row.change}
                    onChange={(e) => setFiberField(row.code, "change", e.target.value)}
                    placeholder="+10 / -5 / nc"
                    disabled={!row.enabled}
                    className="flex-1 border border-gray-200 rounded px-2 py-1 text-xs disabled:opacity-40"
                  />
                </div>
              ))}
            </div>
            {/* Live preview of email lines */}
            {fiberRows.some((r) => r.enabled && r.price) && (
              <div className="mt-2 bg-gray-50 rounded p-2 font-mono text-xs text-gray-600 space-y-0.5">
                {fiberRows
                  .filter((r) => r.enabled && r.price)
                  .map((r) => (
                    <div key={r.code}>
                      {r.code}: {r.price} USD/ADT ({r.change || "unchanged"})
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Recipients */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">To</label>
            {marketContacts.length > 0 ? (
              <div className="space-y-1 mb-2">
                {marketContacts.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedEmails.has(c.email)}
                      onChange={() => toggleContact(c.email)}
                    />
                    <span className="font-medium text-gray-700">{c.name}</span>
                    <span className="text-gray-400">{c.email}</span>
                    {c.role && <span className="text-gray-300">· {c.role}</span>}
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400 mb-2">No contacts yet for this market.</p>
            )}
            <input
              type="email"
              value={freeEmail}
              onChange={(e) => setFreeEmail(e.target.value)}
              placeholder="+ add email address"
              className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-xs"
            />
          </div>

          {/* CC */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">CC (comma-separated)</label>
            <input
              type="text"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              placeholder="name@example.com, other@example.com"
              className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-xs"
            />
          </div>

          {status === "error" && (
            <p className="text-xs text-red-600">{errorMsg}</p>
          )}
          {status === "ok" && (
            <p className="text-xs text-green-600">Draft generated.</p>
          )}

          <button
            onClick={handleGenerate}
            disabled={isPending}
            className="w-full bg-gray-900 text-white text-sm py-2 rounded-md hover:bg-gray-700 transition-colors disabled:opacity-40"
          >
            {isPending ? "Generating…" : "Generate Draft"}
          </button>
        </CardContent>
      </Card>

      {/* Contacts repository */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">
              Contacts — {markets.find((m) => m.id === marketId)?.name}
            </CardTitle>
            <button
              onClick={() => setShowAddContact((v) => !v)}
              className="text-xs text-blue-600 hover:underline"
            >
              {showAddContact ? "Cancel" : "+ Add"}
            </button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {marketContacts.length === 0 && !showAddContact && (
            <p className="text-xs text-gray-400">No contacts yet.</p>
          )}
          {marketContacts.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-2 text-xs">
              <div>
                <span className="font-medium text-gray-700">{c.name}</span>
                {c.role && <span className="text-gray-400 ml-1">({c.role})</span>}
                <div className="text-gray-400">{c.email}</div>
              </div>
              <button
                onClick={() => handleDeleteContact(c.id)}
                disabled={contactPending}
                className="text-red-400 hover:text-red-600 text-xs"
              >
                ✕
              </button>
            </div>
          ))}

          {showAddContact && (
            <div className="space-y-1.5 pt-2 border-t border-gray-100">
              <input
                type="text"
                value={newContactName}
                onChange={(e) => setNewContactName(e.target.value)}
                placeholder="Name"
                className="w-full border border-gray-200 rounded px-2 py-1 text-xs"
              />
              <input
                type="email"
                value={newContactEmail}
                onChange={(e) => setNewContactEmail(e.target.value)}
                placeholder="Email"
                className="w-full border border-gray-200 rounded px-2 py-1 text-xs"
              />
              <input
                type="text"
                value={newContactRole}
                onChange={(e) => setNewContactRole(e.target.value)}
                placeholder="Role (optional)"
                className="w-full border border-gray-200 rounded px-2 py-1 text-xs"
              />
              <button
                onClick={handleAddContact}
                disabled={contactPending || !newContactName || !newContactEmail}
                className="w-full bg-gray-800 text-white text-xs py-1.5 rounded hover:bg-gray-700 disabled:opacity-40"
              >
                Save Contact
              </button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
