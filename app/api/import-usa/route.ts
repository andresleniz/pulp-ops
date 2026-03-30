import { NextRequest, NextResponse } from "next/server"
import { importUSARows, parseSheetMonth, USARow } from "@/lib/crm-importer"

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get("file") as File | null
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    const buffer = await file.arrayBuffer()
    const bytes = new Uint8Array(buffer)

    const XLSX = await import("xlsx")
    const workbook = XLSX.read(bytes, { type: "array", cellDates: true })

    const rows: USARow[] = []
    let sheetsProcessed = 0

    for (const sheetName of workbook.SheetNames) {
      const month = parseSheetMonth(sheetName)
      if (!month) continue

      const sheet = workbook.Sheets[sheetName]
      const rawRows = XLSX.utils.sheet_to_json(sheet, {
        defval: null,
        raw: true,
      }) as Record<string, unknown>[]

      for (const r of rawRows) {
        const customer = r["Customer"] as string | null
        const cityState = r["City/State"] as string | null
        const volume = typeof r["Volume (admt)"] === "number"
          ? r["Volume (admt)"] as number
          : null
        const price = typeof r["Price"] === "number"
          ? r["Price"] as number
          : null
        const freightCost = r["Freight Cost"]
        const freightPerAdmtRaw = r["Freight per ADMT"]
        const notes = r["NOTES"] as string | null

        if (!customer || typeof customer !== "string") continue
        if (customer.toLowerCase().includes("total")) continue
        if (customer.toLowerCase() === "customer") continue
        if (!price || typeof price !== "number" || price <= 0) continue

        let freightPerAdmt: number | null = null
        if (typeof freightPerAdmtRaw === "number" && isFinite(freightPerAdmtRaw)) {
          freightPerAdmt = freightPerAdmtRaw
        } else if (freightPerAdmtRaw === "-" || freightPerAdmtRaw === null) {
          freightPerAdmt = 0
        } else if (typeof freightCost === "number" && volume && volume > 0) {
          freightPerAdmt = Math.round(((freightCost as number) / volume) * 100) / 100
        }

        rows.push({
          month,
          customer: customer.trim(),
          location: cityState?.trim() ?? "",
          volume,
          price,
          freightPerAdmt,
          notes: notes ?? null,
        })
      }

      sheetsProcessed++
    }

    const result = await importUSARows(rows)
    return NextResponse.json({ success: true, sheetsProcessed, result })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}