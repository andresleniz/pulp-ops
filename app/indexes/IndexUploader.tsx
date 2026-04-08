"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type UploadType = "pix_china" | "tto" | "fastmarkets"

interface FastmarketsSeries {
  symbol: string
  rawDescription: string
  normalizedName: string
  mapped: boolean
  frequency: string
  pointsImported: number
}

interface UploadResult {
  success: boolean
  error?: string
  debug?: { totalRows: number; first6Rows: unknown[][] }
  // PIX China
  index?: string
  months?: string[]
  created?: number
  updated?: number
  // TTO
  totalRows?: number
  indexes?: Record<string, { rows: number; lastActual: string }>
  // Fastmarkets
  sourceFile?: string
  totalSeriesFound?: number
  totalParsedObs?: number
  totalPointsImported?: number
  duplicatesCollapsed?: number
  rowsDeleted?: number
  skippedRows?: number
  mapped?: string[]
  unmapped?: string[]
  series?: FastmarketsSeries[]
}

function UploadPanel({
  label,
  type,
  hint,
}: {
  label: string
  type: UploadType
  hint: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">("idle")
  const [result, setResult] = useState<UploadResult | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  async function handleUpload() {
    const file = inputRef.current?.files?.[0]
    if (!file) return

    setStatus("uploading")
    setResult(null)

    const formData = new FormData()
    formData.append("file", file)

    try {
      const res = await fetch(`/api/import-indexes?type=${type}`, {
        method: "POST",
        body: formData,
      })
      const data: UploadResult = await res.json()
      setResult(data)
      setStatus(data.success ? "done" : "error")

      if (data.success) {
        startTransition(() => router.refresh())
      }
    } catch (e) {
      setResult({ success: false, error: String(e) })
      setStatus("error")
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-gray-400">{hint}</p>

        <div
          className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center cursor-pointer hover:border-gray-400 transition-colors"
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              setFileName(e.target.files?.[0]?.name ?? null)
              setStatus("idle")
              setResult(null)
            }}
          />
          {fileName ? (
            <p className="text-xs text-gray-700 font-medium truncate">{fileName}</p>
          ) : (
            <p className="text-xs text-gray-400">Click to select Excel file</p>
          )}
        </div>

        <button
          onClick={handleUpload}
          disabled={!fileName || status === "uploading" || isPending}
          className="w-full bg-gray-900 text-white text-sm py-2 rounded-md hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {status === "uploading" || isPending ? "Importing..." : "Import"}
        </button>

        {result && (
          <div
            className={`rounded-md p-3 text-xs space-y-1 ${
              result.success
                ? "bg-green-50 text-green-800"
                : "bg-red-50 text-red-800"
            }`}
          >
            {result.success ? (
              <>
                {/* PIX China */}
                {result.index && (
                  <>
                    <p className="font-semibold">{result.index}</p>
                    <p>
                      {result.created} created, {result.updated} updated
                    </p>
                    {result.months && result.months.length > 0 && (
                      <p className="text-green-600 font-mono">
                        {result.months.slice(-6).join(", ")}
                        {result.months.length > 6 ? ` … (+${result.months.length - 6} more)` : ""}
                      </p>
                    )}
                  </>
                )}
                {/* TTO */}
                {result.indexes && (
                  <>
                    <p className="font-semibold">
                      {Object.keys(result.indexes).length} index columns,{" "}
                      {result.totalRows} values upserted
                    </p>
                    <div className="max-h-40 overflow-y-auto space-y-0.5">
                      {Object.entries(result.indexes).map(([name, info]) => (
                        <p key={name} className="font-mono">
                          <span className="text-green-700">{name}</span>
                          <span className="text-green-500 ml-2">last actual: {info.lastActual}</span>
                        </p>
                      ))}
                    </div>
                  </>
                )}
                {/* Fastmarkets */}
                {result.series && (
                  <>
                    <p className="font-semibold">
                      {result.totalSeriesFound} series · {result.totalPointsImported} observations upserted
                      {result.duplicatesCollapsed ? ` · ${result.duplicatesCollapsed} duplicates collapsed` : ""}
                      {result.rowsDeleted ? ` · ${result.rowsDeleted} old rows removed` : ""}
                    </p>
                    <div className="space-y-0.5">
                      {result.series.map((s) => (
                        <p key={s.symbol} className="font-mono leading-relaxed">
                          <span className={s.mapped ? "text-green-700" : "text-amber-700"}>
                            {s.normalizedName}
                          </span>
                          <span className="text-green-500 ml-2">
                            {s.symbol} · {s.frequency} · {s.pointsImported} months
                          </span>
                          {!s.mapped && (
                            <span className="text-amber-500 ml-1">[unmapped]</span>
                          )}
                        </p>
                      ))}
                    </div>
                    {result.unmapped && result.unmapped.length > 0 && (
                      <p className="text-amber-700 mt-1">
                        {result.unmapped.length} unmapped series preserved — add to SYMBOL_NAME_MAP to link to dashboard cards.
                      </p>
                    )}
                  </>
                )}
              </>
            ) : (
              <>
                <p>{result.error}</p>
                {result.debug && (
                  <details className="mt-2">
                    <summary className="cursor-pointer font-semibold">
                      Debug: {result.debug.totalRows} rows in file
                    </summary>
                    <pre className="mt-1 text-[10px] overflow-x-auto whitespace-pre-wrap break-all">
                      {JSON.stringify(result.debug.first6Rows, null, 2)}
                    </pre>
                  </details>
                )}
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function IndexUploader() {
  return (
    <div className="space-y-4">
      <UploadPanel
        label="Import Fastmarkets"
        type="fastmarkets"
        hint="Fastmarkets column-oriented export — Symbol/Description header rows, dated values below. Handles PIX, RISI, and all other Fastmarkets series."
      />
      <UploadPanel
        label="Import PIX China"
        type="pix_china"
        hint="FOEX/Risi export — needs 'Period' date column and 'Mid' value column."
      />
      <UploadPanel
        label="Import TTO Prices"
        type="tto"
        hint="TTO monthly spreadsheet — all columns are imported as separate index definitions."
      />
    </div>
  )
}
