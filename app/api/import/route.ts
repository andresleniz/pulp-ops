import { NextRequest, NextResponse } from "next/server"
import { importCRMRows, CRMRow } from "@/lib/crm-importer"

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    const buffer = await file.arrayBuffer()
    const bytes = new Uint8Array(buffer)

    let XLSX: any
    try {
      XLSX = await import("xlsx")
    } catch (e) {
      return NextResponse.json({ error: "xlsx package not available: " + String(e) }, { status: 500 })
    }

    let workbook: any
    try {
      workbook = XLSX.read(bytes, { type: "array", cellDates: true })
    } catch (e) {
      return NextResponse.json({ error: "Could not parse Excel file: " + String(e) }, { status: 500 })
    }

    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]
    const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: null }) as Record<string, unknown>[]

    if (rawRows.length === 0) {
      return NextResponse.json({ error: "No rows found in file" }, { status: 400 })
    }

    const rows: CRMRow[] = rawRows.map((r) => ({
      orderRef: (r["Order number"] as string) ?? null,
      year: r["Allocation year"] as string | number | null,
      month: r["Allocation month"] as string | null,
      country: r["Country"] as string | null,
      customer: r["Customer"] as string | null,
      grade: r["Grade"] as string | null,
      volume: r["Order quantity (ADT)"] as number | null,
      price: r["Price"] as number | null,
      mill: r["Mill"] as string | null,
      comments: r["Comments"] as string | null,
    }))

    const result = await importCRMRows(rows)
    return NextResponse.json({ success: true, result })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}