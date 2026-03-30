"use client"

import { useState, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface ImportResult {
  total: number
  imported: number
  skipped: number
  created: number
  updated: number
  errors: string[]
}

function ImportCard({
  title,
  description,
  endpoint,
  accepts,
  whatItDoes,
}: {
  title: string
  description: string
  endpoint: string
  accepts: string
  whatItDoes: string[]
}) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [extra, setExtra] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const file = fileRef.current?.files?.[0]
    if (!file) return
    setLoading(true)
    setResult(null)
    setError(null)
    setExtra(null)
    const fd = new FormData()
    fd.append("file", file)
    try {
      const res = await fetch(endpoint, { method: "POST", body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setResult(data.result)
      if (data.sheetsProcessed) setExtra(`${data.sheetsProcessed} sheets processed`)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <p className="text-xs text-gray-500 mt-1">{description}</p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div
            className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center cursor-pointer hover:border-gray-400 transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            {fileName ? (
              <div>
                <p className="text-sm font-medium text-gray-900">{fileName}</p>
                <p className="text-xs text-gray-400 mt-1">Click to change</p>
              </div>
            ) : (
              <div>
                <p className="text-sm text-gray-500">Click to select file</p>
                <p className="text-xs text-gray-400 mt-1">{accepts}</p>
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
            />
          </div>

          <button
            type="submit"
            disabled={loading || !fileName}
            className="w-full bg-gray-900 text-white text-sm py-2.5 rounded-md hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            {loading ? "Importing..." : "Import"}
          </button>
        </form>

        {error && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm text-red-700 font-medium">Import failed</p>
            <p className="text-xs text-red-600 mt-1">{error}</p>
          </div>
        )}

        {result && (
          <div className="mt-4">
            <div className="grid grid-cols-3 gap-2 mb-3">
              {[
                { label: "Total rows", value: result.total },
                { label: "Imported", value: result.imported },
                { label: "Created", value: result.created },
                { label: "Updated", value: result.updated },
                { label: "Skipped", value: result.skipped },
                { label: "Errors", value: result.errors.length },
              ].map((s) => (
                <div key={s.label} className="bg-gray-50 rounded p-2">
                  <p className="text-xs text-gray-500">{s.label}</p>
                  <p className={`text-lg font-semibold ${s.label === "Errors" && s.value > 0 ? "text-red-600" : "text-gray-900"}`}>
                    {s.value}
                  </p>
                </div>
              ))}
            </div>
            {extra && <p className="text-xs text-gray-500 mb-2">{extra}</p>}
            {result.errors.length > 0 && (
              <div className="bg-red-50 rounded p-2 mt-2">
                <p className="text-xs font-medium text-red-700 mb-1">First 5 errors</p>
                {result.errors.slice(0, 5).map((e, i) => (
                  <p key={i} className="text-xs text-red-600">{e}</p>
                ))}
                {result.errors.length > 5 && (
                  <p className="text-xs text-red-400">
                    ...and {result.errors.length - 5} more
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <div className="mt-4 bg-gray-50 rounded p-3">
          <p className="text-xs font-medium text-gray-600 mb-1">What this imports</p>
          <ul className="space-y-0.5">
            {whatItDoes.map((line, i) => (
              <li key={i} className="text-xs text-gray-500">→ {line}</li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}

export default function ImportPage() {
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Data Import</h1>
        <p className="text-sm text-gray-500 mt-1">
          Import realized orders and prices from external files
        </p>
      </div>

      <ImportCard
        title="CRM Import — All Markets"
        description="Standard CRM Excel export. Covers all markets except USA EKP detail."
        endpoint="/api/import"
        accepts=".xlsx — CRM export format"
        whatItDoes={[
          "Maps countries to markets (TW→Taiwan, AE→UAE, etc.)",
          "For US, maps mill codes to customers (PC1L→James Hardie, EA3E/EM1E→Sofidel)",
          "Creates missing customers, cycles and order records",
          "Updates existing orders if same reference already exists",
          "Updates MonthlyPrice with realized prices for charts",
        ]}
      />

      <ImportCard
        title="USA Sales Import — EKP Detail"
        description="USA sales spreadsheet with one tab per month. Real customer names, locations, freight and prices."
        endpoint="/api/import-usa"
        accepts=".xlsx — one tab per month (May 2024, January 2025, etc.)"
        whatItDoes={[
          "Reads each tab as a separate month automatically",
          "Creates customer as Customer — City (e.g. Sofidel — Shelby NC)",
          "Stores price and freight per ADMT separately",
          "Net back (price minus freight) available in charts on the USA market page",
          "Skips rows with no price or no customer name",
        ]}
      />
    </div>
  )
}