"use client"

import { useState, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

// ── Shared result type ─────────────────────────────────────────────────────────

interface ImportResult {
  total: number
  imported: number
  skipped: number
  created: number
  updated: number
  errors: string[]
  rejections?: string[]
  // Diagnostic counters (CRM import only)
  withCountry?: number
  withDestinationPort?: number
  withEkpMdp?: number
  deletedBeforeReimport?: number
  // Europe currency routing
  europeEUR?: number
  europeUSD?: number
  europeRejectedCurrency?: number
  fxRateUsed?: number | null
  fxRateMisses?: number
  // Europe net-price tracking
  europeIsNetPrice?: number
  europeIsNotNetPrice?: number
}

// ── CRM Import Card — Europe EUR rate input ────────────────────────────────────

function CRMImportCard() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [fxRateApplied, setFxRateApplied] = useState<number | null>(null)
  const [fileColumns, setFileColumns] = useState<string[] | null>(null)
  const [parsedSample, setParsedSample] = useState<any[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [replaceAll, setReplaceAll] = useState(false)
  const [fxRate, setFxRate] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)

  const hasFile = !!fileName

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const file = fileRef.current?.files?.[0]
    if (!file) return
    setLoading(true)
    setResult(null)
    setError(null)
    setFileColumns(null)
    setParsedSample(null)
    setFxRateApplied(null)

    const fd = new FormData()
    fd.append("file", file)
    if (replaceAll) fd.append("replaceAll", "true")
    if (fxRate.trim()) fd.append("fxRate", fxRate.trim())

    try {
      const res = await fetch("/api/import", { method: "POST", body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setResult(data.result)
      setFxRateApplied(data.fxRateUsed ?? null)
      if (data.fileColumns) setFileColumns(data.fileColumns)
      if (data.parsedSample) setParsedSample(data.parsedSample)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  const hasEuropeData = (result?.europeEUR ?? 0) + (result?.europeUSD ?? 0) +
    (result?.europeRejectedCurrency ?? 0) + (result?.fxRateMisses ?? 0) > 0

  return (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">CRM Import — All Markets</CardTitle>
        <p className="text-xs text-gray-500 mt-1">
          Standard CRM Excel export. Covers all markets except USA EKP detail.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* File picker */}
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
                <p className="text-xs text-gray-400 mt-1">.xlsx — CRM export format</p>
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

          {/* EUR→USD rate input */}
          <div className={`rounded-lg border p-3 space-y-1.5 ${hasFile ? "border-violet-200 bg-violet-50" : "border-gray-100 bg-gray-50 opacity-60"}`}>
            <label className="block text-xs font-medium text-violet-800">
              EUR → USD exchange rate
            </label>
            <input
              type="number"
              step="0.0001"
              min="0.01"
              max="9.9999"
              placeholder="e.g. 1.0850"
              value={fxRate}
              onChange={(e) => setFxRate(e.target.value)}
              disabled={!hasFile}
              className="w-full text-sm border border-violet-200 rounded px-2.5 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-violet-400 disabled:opacity-50 disabled:cursor-not-allowed tabular-nums"
            />
            <p className="text-xs text-violet-600">
              Required when file contains Europe rows with currency = EUR. Leave blank for non-Europe imports.
              Applied uniformly to all EUR rows in this import.
            </p>
          </div>

          {/* Replace all */}
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

          <button
            type="submit"
            disabled={loading || !hasFile}
            className={`w-full text-white text-sm py-2.5 rounded-md transition-colors disabled:opacity-50 ${
              replaceAll
                ? "bg-red-700 hover:bg-red-800"
                : "bg-gray-900 hover:bg-gray-700"
            }`}
          >
            {loading ? "Importing…" : replaceAll ? "Replace & Re-import" : "Import"}
          </button>
        </form>

        {/* Error */}
        {error && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm text-red-700 font-medium">Import failed</p>
            <p className="text-xs text-red-600 mt-1">{error}</p>
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="mt-4 space-y-3">

            {result.deletedBeforeReimport != null && result.deletedBeforeReimport > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded p-2">
                <p className="text-xs text-amber-700 font-medium">
                  Replace mode: {result.deletedBeforeReimport} existing CRM orders deleted before import
                </p>
              </div>
            )}

            {/* Core counts */}
            <div className="grid grid-cols-3 gap-2">
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

            {/* Field coverage */}
            {(result.withCountry != null || result.withDestinationPort != null || result.withEkpMdp != null) && (
              <div className="bg-blue-50 border border-blue-100 rounded p-2">
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

            {/* Europe currency routing */}
            {hasEuropeData && (
              <div className="bg-violet-50 border border-violet-100 rounded p-2">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-medium text-violet-700">Europe currency routing</p>
                  {fxRateApplied != null && (
                    <span className="text-xs font-mono bg-violet-100 text-violet-800 px-2 py-0.5 rounded">
                      FX rate used: {fxRateApplied}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: "EUR → USD", value: result.europeEUR ?? 0, ok: true },
                    { label: "USD kept", value: result.europeUSD ?? 0, ok: true },
                    { label: "Curr. rejected", value: result.europeRejectedCurrency ?? 0, ok: (result.europeRejectedCurrency ?? 0) === 0 },
                    { label: "No FX rate", value: result.fxRateMisses ?? 0, ok: (result.fxRateMisses ?? 0) === 0 },
                  ].map((s) => (
                    <div key={s.label} className="bg-white rounded p-1.5 border border-violet-100">
                      <p className="text-xs text-gray-500">{s.label}</p>
                      <p className={`text-base font-semibold ${s.ok ? "text-violet-700" : "text-red-600"}`}>
                        {s.value}
                      </p>
                    </div>
                  ))}
                </div>
                {(result.fxRateMisses ?? 0) > 0 && (
                  <p className="text-xs text-red-600 mt-1.5">
                    {result.fxRateMisses} EUR row(s) rejected — enter the EUR→USD rate and re-import.
                  </p>
                )}
              </div>
            )}

            {/* Europe net-price flag */}
            {(result.europeIsNetPrice != null || result.europeIsNotNetPrice != null) && (
              <div className="bg-green-50 border border-green-100 rounded p-2">
                <p className="text-xs font-medium text-green-700 mb-1">Europe net-price flag (isNetPrice)</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: "isNetPrice = true", value: result.europeIsNetPrice ?? 0, ok: (result.europeIsNetPrice ?? 0) > 0 },
                    { label: "isNetPrice = false", value: result.europeIsNotNetPrice ?? 0, ok: (result.europeIsNotNetPrice ?? 0) === 0 },
                  ].map((s) => (
                    <div key={s.label} className="bg-white rounded p-1.5 border border-green-100">
                      <p className="text-xs text-gray-500">{s.label}</p>
                      <p className={`text-base font-semibold ${s.ok ? "text-green-700" : "text-amber-600"}`}>{s.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Parser diagnostic sample */}
            {parsedSample && (
              <div className="bg-yellow-50 border border-yellow-200 rounded p-2">
                <p className="text-xs font-medium text-yellow-800 mb-1">Parser diagnostic — first 5 parsed rows</p>
                {parsedSample.map((r: any, i: number) => (
                  <p key={i} className="text-xs font-mono text-yellow-700">
                    {i + 1}. {r.country} | port: {r.destinationPort ?? "NULL"} | cur: {r.currency ?? "NULL"} | netPrice: {r.netPrice ?? "NULL"} | incoterm: {r.incoterm ?? "NULL"}
                  </p>
                ))}
              </div>
            )}

            {/* Detected columns */}
            {fileColumns && (
              <div className="bg-gray-50 rounded p-2">
                <p className="text-xs font-medium text-gray-600 mb-1">Detected columns</p>
                <p className="text-xs text-gray-500 font-mono break-all">{fileColumns.join(", ")}</p>
              </div>
            )}

            {/* Errors */}
            {result.errors.length > 0 && (
              <div className="bg-red-50 rounded p-2">
                <p className="text-xs font-medium text-red-700 mb-1">First 5 errors</p>
                {result.errors.slice(0, 5).map((e, i) => (
                  <p key={i} className="text-xs text-red-600">{e}</p>
                ))}
                {result.errors.length > 5 && (
                  <p className="text-xs text-red-400">…and {result.errors.length - 5} more</p>
                )}
              </div>
            )}

            {/* Rejections */}
            {(result.rejections?.length ?? 0) > 0 && (
              <div className="bg-orange-50 rounded p-2">
                <p className="text-xs font-medium text-orange-700 mb-1">
                  Rejected rows ({result.rejections!.length})
                </p>
                {result.rejections!.slice(0, 5).map((r, i) => (
                  <p key={i} className="text-xs text-orange-600">{r}</p>
                ))}
                {result.rejections!.length > 5 && (
                  <p className="text-xs text-orange-400">…and {result.rejections!.length - 5} more</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* What it imports */}
        <div className="mt-4 bg-gray-50 rounded p-3">
          <p className="text-xs font-medium text-gray-600 mb-1">What this imports</p>
          <ul className="space-y-0.5">
            {[
              "Maps countries to markets (TW→Taiwan, AE→UAE, etc.)",
              "For US, maps mill codes to customers (PC1L→James Hardie, EA3E/EM1E→Sofidel)",
              "Creates missing customers, cycles and order records",
              "Updates existing orders if same reference already exists",
              "Europe EUR prices converted to USD using the rate you enter above",
              "Stores country, destination port, incoterm, and EKP MDP grade when present",
            ].map((line, i) => (
              <li key={i} className="text-xs text-gray-500">→ {line}</li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Generic import card (USA, etc.) ──────────────────────────────────────────

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
            className="w-full bg-gray-900 hover:bg-gray-700 text-white text-sm py-2.5 rounded-md transition-colors disabled:opacity-50"
          >
            {loading ? "Importing…" : "Import"}
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
                  <p className="text-xs text-red-400">…and {result.errors.length - 5} more</p>
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

// ── Diagnostic panel ──────────────────────────────────────────────────────────

function DiagnoseCard() {
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState<any | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const file = fileRef.current?.files?.[0]
    if (!file) return
    setLoading(true)
    setReport(null)
    setError(null)
    const fd = new FormData()
    fd.append("file", file)
    try {
      const res = await fetch("/api/import-diagnose", { method: "POST", body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setReport(data)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="mb-6 border-amber-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-amber-800">
          Inspect File — Parser Diagnostic
        </CardTitle>
        <p className="text-xs text-gray-500 mt-1">
          Upload a CRM file here to inspect its exact headers and raw column values
          without importing. Use this to verify Net Price and Destination port parsing.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div
            className="border-2 border-dashed border-amber-200 rounded-lg p-4 text-center cursor-pointer hover:border-amber-400 transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            {fileName
              ? <p className="text-sm font-medium text-gray-900">{fileName}</p>
              : <p className="text-sm text-gray-500">Click to select CRM file (.xlsx)</p>}
            <input ref={fileRef} type="file" accept=".xlsx" className="hidden"
              onChange={e => setFileName(e.target.files?.[0]?.name ?? null)} />
          </div>
          <button type="submit" disabled={loading || !fileName}
            className="w-full bg-amber-700 hover:bg-amber-800 disabled:opacity-50 text-white text-sm py-2 rounded-md transition-colors">
            {loading ? "Inspecting…" : "Inspect file (no import)"}
          </button>
        </form>

        {error && (
          <div className="mt-3 bg-red-50 border border-red-200 rounded p-3">
            <p className="text-xs text-red-700 font-mono">{error}</p>
          </div>
        )}

        {report && (
          <div className="mt-4 space-y-3 text-xs font-mono">
            <div className="bg-gray-50 rounded p-2 space-y-0.5">
              <p><span className="text-gray-500">file:</span> {report.file}</p>
              <p><span className="text-gray-500">sheets:</span> {report.sheets?.join(", ")}</p>
              <p><span className="text-gray-500">selected:</span> {report.selectedSheet}</p>
              <p><span className="text-gray-500">total rows:</span> {report.totalRows}</p>
              <p><span className="text-gray-500">header row index:</span> {report.headerRowIndex}</p>
            </div>
            <div className="bg-blue-50 rounded p-2 space-y-0.5">
              <p className="font-semibold text-blue-800 mb-1">Column resolution</p>
              {Object.entries(report.columnResolution ?? {}).map(([k, v]) =>
                k === "netPriceAliases" ? null : (
                  <p key={k}>
                    <span className="text-blue-600">{k}:</span>{" "}
                    {v == null
                      ? <span className="text-red-600 font-bold">NOT FOUND</span>
                      : <span className="text-green-700">&quot;{String(v)}&quot;</span>}
                  </p>
                )
              )}
            </div>
            {report.rawHeaderBytes?.length > 0 && (
              <div className="bg-yellow-50 rounded p-2">
                <p className="font-semibold text-yellow-800 mb-1">Raw header bytes (price / net columns)</p>
                {report.rawHeaderBytes.map((x: any, i: number) => (
                  <div key={i} className="mb-1">
                    <p><span className="text-gray-500">col {x.col}:</span> raw=&quot;{x.raw}&quot; → normalized=&quot;{x.normalized}&quot;</p>
                    <p className="text-yellow-700 text-[10px] break-all">{x.bytes}</p>
                  </div>
                ))}
              </div>
            )}
            {report.priceRelatedHeaders?.length > 0 && (
              <div className="bg-gray-50 rounded p-2">
                <p className="font-semibold text-gray-700 mb-1">All columns containing &quot;price&quot; or &quot;net&quot;</p>
                {report.priceRelatedHeaders.map((x: any, i: number) => (
                  <p key={i}>col {x.col}: normalized=&quot;{x.normalized}&quot;  raw=&quot;{x.raw}&quot;</p>
                ))}
              </div>
            )}
            <details className="bg-gray-50 rounded p-2">
              <summary className="cursor-pointer text-gray-600 font-semibold">Header scan log (rows 0–9)</summary>
              <div className="mt-1 space-y-0.5">
                {report.headerScanLog?.map((line: string, i: number) => (
                  <p key={i} className={line.includes("HEADER ROW") ? "text-green-700 font-bold" : "text-gray-500"}>{line}</p>
                ))}
              </div>
            </details>
            {report.sampleRows?.length > 0 && (
              <div className="bg-gray-50 rounded p-2">
                <p className="font-semibold text-gray-700 mb-1">First {report.sampleRows.length} data rows</p>
                {report.sampleRows.map((row: any, i: number) => (
                  <div key={i} className="mb-2 border-b border-gray-200 pb-1 last:border-0">
                    <p className="text-gray-600 font-semibold">Row {i + 1}</p>
                    {Object.entries(row).map(([col, info]: [string, any]) => (
                      <p key={col} className={(col.includes("net") || col.includes("price")) ? "text-blue-700" : "text-gray-600"}>
                        &nbsp;&nbsp;{col}: {JSON.stringify(info.value)} <span className="text-gray-400">[{info.type}]</span>
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export default function ImportPage() {
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Data Import</h1>
        <p className="text-sm text-gray-500 mt-1">
          Import realized orders and prices from external files
        </p>
      </div>

      <DiagnoseCard />

      <CRMImportCard />

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
