import XLSX from "xlsx"
import { parseFastmarketsFile, storageKey } from "@/lib/fastmarkets-importer"

const wb = XLSX.readFile("C:/Users/Andres Leniz/Downloads/Fastmarkets_2026_04_08-140501.xlsx")
const ws = wb.Sheets[wb.SheetNames[0]]
const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as unknown[][]
const { series, skippedRows } = parseFastmarketsFile(rawRows, "Fastmarkets_2026_04_08-140501.xlsx")

for (const s of series) {
  const latestObs = s.observations.at(-1)
  console.log(
    (s.mapped ? "MAPPED   " : "unmapped ") +
    s.symbol.padEnd(14) +
    s.normalizedName.padEnd(32) +
    s.frequency.padEnd(10) +
    "obs:" + String(s.observations.length).padEnd(5) +
    (latestObs ? "  latest:" + storageKey(latestObs.date, s.frequency) + "=$" + latestObs.value : "")
  )
}
console.log("Skipped rows:", skippedRows)
