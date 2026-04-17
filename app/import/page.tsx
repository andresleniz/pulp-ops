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
  // Diagnostic counters (CRM import only)
  withCountry?: number
  withDestinationPort?: number
  withEkpMdp?: number
  deletedBeforeReimport?: number
  // Europe currency routing (CRM import only)
  europeEUR?: number
  europeUSD?: number
  europeRejectedCurrency?: number
}

function ImportCard({
  title,
  description,
  endpoint,
  accepts,
  whatItDoes,
  showReplaceAll,
}: {
  title: string
  description: string
  endpoint: string
  accepts: string
  whatItDoes: string[]
  showReplaceAll?: boolean
}) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [fileColumns, setFileColumns] = useState<string[] | null>(null)
  const [extra, setExtra] = useState<string | null>(null)
  const [parsedSample, setParsedSample] = useState<any[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [replaceAll, setReplaceAll] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const file = fileRef.current?.files?.[0]
    if (!file) return
    setLoading(true)
    setResult(null)
    setError(null)
    setExtra(null)
    setFileColumns(null)
    setParsedSample(null)
    const fd = new FormData()
    fd.append("file", file)
    if (replaceAll) fd.append("replaceAll", "true")
    try {
      const res = await fetch(endpoint, { method: "POST", body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setResult(data.result)
      if (data.fileColumns) setFileColumns(data.fileColumns)
      if (data.sheetsProcessed) setExtra(`${data.sheetsProcessed} sheets processed`)
      if (data.parsedSample) setParsedSample(data.parsedSample)
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

          {showReplaceAll && (
            <label className="flex items-start gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={replaceAll}
                onChange={(e) => setReplaceAll(e.target.checked)}
                className="mt-0.5"
              />
              <div>
                <span className="text-sm font-medium text-gray-800">Replace all existing data</span>
                <p className="text-xs text-gray-500 mt-0.5">
                  Deletes existing CRM orders for all market/month combinations in this file before
                  importing. Required to fix country, destination port, and EKP MDP fields on
                  historical data.
                </p>
              </div>
            </label>
          )}

          <button
            type="submit"
            disabled={loading || !fileName}
            className={`w-full text-white text-sm py-2.5 rounded-md transition-colors disabled:opacity-50 ${
              replaceAll
                ? "bg-red-700 hover:bg-red-800"
                : "bg-gray-900 hover:bg-gray-700"
            }`}
          >
            {loading ? "Importing..." : replaceAll ? "Replace & Re-import" : "Import"}
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
            {result.deletedBeforeReimport != null && result.deletedBeforeReimport > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded p-2 mb-3">
                <p className="text-xs text-amber-700 font-medium">
                  Replace mode: {result.deletedBeforeReimport} existing CRM orders deleted before import
                </p>
              </div>
            )}
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
            {(result.withCountry != null || result.withDestinationPort != null || result.withEkpMdp != null) && (
              <div className="bg-blue-50 border border-blue-100 rounded p-2 mb-3">
                <p className="text-xs font-medium text-blue-700 mb-1">Field coverage (imported rows)</p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "with Country", value: result.withCountry ?? 0, ok: (result.withCountry ?? 0) > 0 },
                    { label: "with Port", value: result.withDestinationPort ?? 0, ok: (result.withDestinationPort ?? 0) > 0 },
                    { label: "EKP MDP", value: result.withEkpMdp ?? 0, ok: true },
                  ].map((s) => (
                    <div key={s.label} className="bg-white rounded p-1.5 border border-blue-100">
                      <p className="text-xs text-gray-500">{s.label}</p>
                      <p className={`text-base font-semibold ${s.ok ? "text-blue-700" : "text-amber-600"}`}>
                        {s.value}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {(result.europeEUR != null || result.europeUSD != null || result.europeRejectedCurrency != null) &&
             (result.europeEUR! + result.europeUSD! + result.europeRejectedCurrency!) > 0 && (
              <div className="bg-violet-50 border border-violet-100 rounded p-2 mb-3">
                <p className="text-xs font-medium text-violet-700 mb-1">Europe currency routing</p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "EUR → USD", value: result.europeEUR ?? 0, ok: true },
                    { label: "USD kept", value: result.europeUSD ?? 0, ok: true },
                    { label: "Rejected", value: result.europeRejectedCurrency ?? 0, ok: (result.europeRejectedCurrency ?? 0) === 0 },
                  ].map((s) => (
                    <div key={s.label} className="bg-white rounded p-1.5 border border-violet-100">
                      <p className="text-xs text-gray-500">{s.label}</p>
                      <p className={`text-base font-semibold ${s.ok ? "text-violet-700" : "text-red-600"}`}>
                        {s.value}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {fileColumns && (
              <div className="bg-gray-50 rounded p-2 mb-2">
                <p className="text-xs font-medium text-gray-600 mb-1">Detected columns</p>
                <p className="text-xs text-gray-500 font-mono break-all">{fileColumns.join(", ")}</p>
              </div>
            )}
            {parsedSample && (
              <div className="bg-yellow-50 border border-yellow-200 rounded p-2 mb-2">
                <p className="text-xs font-medium text-yellow-800 mb-1">Parser diagnostic — first 5 parsed rows</p>
                {parsedSample.map((r, i) => (
                  <p key={i} className="text-xs font-mono text-yellow-700">
                    {i+1}. {r.country} | port: {r.destinationPort ?? "NULL"} | cur: {r.currency ?? "NULL"} | ref: {r.orderRef ?? "NULL"}
                  </p>
                ))}
              </div>
            )}
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
        showReplaceAll
        whatItDoes={[
          "Maps countries to markets (TW→Taiwan, AE→UAE, etc.)",
          "For US, maps mill codes to customers (PC1L→James Hardie, EA3E/EM1E→Sofidel)",
          "Creates missing customers, cycles and order records",
          "Updates existing orders if same reference already exists",
          "Updates MonthlyPrice with realized prices for charts",
          "Stores country (Europe), destination port, and EKP MDP grade when present in file",
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