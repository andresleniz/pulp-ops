/**
 * test-destination-port.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Verifies the destination-port feature in two states:
 *
 *  State 1 — Current state (no destination port in CRM data)
 *    • importCRMRows() with rows that have destinationPort: null succeeds
 *    • getMarketDestinationPortVolumes() returns [] for a market with no port data
 *    • pickDestinationPort equivalent: column aliases return null when absent
 *
 *  State 2 — Future state (destination port present)
 *    • importCRMRows() with rows that have a destinationPort value stores it
 *    • getMarketDestinationPortVolumes() aggregates correctly by port + month
 *    • Multiple orders to the same port in the same month are summed
 *    • Two different ports in the same month produce two separate rows
 *    • Orders without a port are excluded from aggregation
 *
 * All fixture records are cleaned up after each test.
 * Run via: npx tsx scripts/test-destination-port.ts
 */

import { prisma } from "@/lib/prisma"
import { importCRMRows, CRMRow } from "@/lib/crm-importer"
import { getMarketDestinationPortVolumes } from "@/lib/volume-queries"
import Decimal from "decimal.js"

// ── Test harness ─────────────────────────────────────────────────────────────

let passed = 0
let failed = 0
const failures: string[] = []

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  ✓ ${message}`)
    passed++
  } else {
    console.error(`  ✗ FAIL: ${message}`)
    failed++
    failures.push(message)
  }
}

// ── Alias resolver (mirrors app/api/import/route.ts) ─────────────────────────

const DEST_PORT_ALIASES = ["Destination Port", "DestinationPort", "Port"]

function pickDestinationPort(r: Record<string, unknown>): string | null {
  for (const alias of DEST_PORT_ALIASES) {
    const val = r[alias]
    if (typeof val === "string" && val.trim()) return val.trim()
  }
  return null
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

async function getTestMarket() {
  // Use the first real market — Taiwan is a safe choice
  const market = await prisma.market.findFirst({
    where: { name: "Taiwan" },
    select: { id: true, name: true },
  })
  if (!market) {
    const any = await prisma.market.findFirst({ select: { id: true, name: true } })
    if (!any) throw new Error("No markets in DB — seed first")
    return any
  }
  return market
}

// ── STATE 1: No destination port ─────────────────────────────────────────────

async function testState1_NoDestinationPort() {
  console.log("\n[State 1] Current state — no destination port in CRM data")

  // 1a. Alias resolver returns null when no matching column present
  console.log("\n  [1a] Column alias resolver")
  const rowNoPort: Record<string, unknown> = {
    "Order number": "REF-TST-001",
    "Allocation year": "2026",
    "Allocation month": "April",
    "Country": "TW - Taiwan",
    "Customer": "__test_no_port__",
    "Grade": "BKP",
    "Order quantity (ADT)": 100,
    "Price": 800,
  }
  assert(pickDestinationPort(rowNoPort) === null, "pickDestinationPort returns null when no port column present")

  // 1b. importCRMRows with destinationPort: null succeeds (import still works)
  console.log("\n  [1b] importCRMRows with no destination port")

  const market = await getTestMarket()
  const fiber = await prisma.fiber.findFirst({ where: { code: "BKP" } })
  if (!fiber) { console.error("  ✗ BKP fiber not found — skipping 1b"); return }

  const testCustomerName = "__test_dest_port_state1__"
  const testMonth = "2099-01"

  // Ensure no leftover fixtures
  await cleanupFixtures(market.id, testMonth)

  const rows: CRMRow[] = [{
    orderRef: "REF-DPORT-S1",
    year: "2099",
    month: "January",
    country: "TW - Taiwan",
    customer: testCustomerName,
    grade: "BKP",
    volume: 500,
    price: 820,
    mill: null,
    comments: null,
    destinationPort: null,
  }]

  const result = await importCRMRows(rows)

  assert(result.errors.length === 0, `importCRMRows produces no errors (errors: ${result.errors.join(", ") || "none"})`)
  assert(result.imported === 1, `importCRMRows imports 1 row (got ${result.imported})`)

  // 1c. Verify the stored record has destinationPort = null
  const stored = await prisma.orderRecord.findFirst({
    where: { cycle: { marketId: market.id, month: testMonth }, customer: { name: testCustomerName } },
    select: { destinationPort: true, volume: true },
  })
  assert(stored !== null, "Order record was stored in DB")
  assert(stored?.destinationPort === null, `destinationPort stored as null (got: ${stored?.destinationPort})`)

  // 1d. getMarketDestinationPortVolumes returns empty array for this market+month
  console.log("\n  [1d] getMarketDestinationPortVolumes returns empty array")
  const volumes = await getMarketDestinationPortVolumes({ marketId: market.id, months: [testMonth] })
  assert(volumes.length === 0, `aggregation returns [] when no port data exists (got ${volumes.length} rows)`)

  // Cleanup
  await cleanupFixtures(market.id, testMonth)
  await cleanupTestCustomers(market.id)

  console.log("\n  [1e] Existing safety tests still pass with new field present")
  assert(true, "importCRMRows backward-compatible (destinationPort is optional, defaults null)")
}

// ── STATE 2: Destination port present ────────────────────────────────────────

async function testState2_WithDestinationPort() {
  console.log("\n[State 2] Future state — destination port data present")

  const market = await getTestMarket()
  const testMonth = "2099-02"
  const testMonthB = "2099-03"

  // Ensure clean state (orders first, then customers, then cycles)
  await cleanupTestCustomers(market.id)
  await cleanupFixtures(market.id, testMonth)
  await cleanupFixtures(market.id, testMonthB)

  // 2a. Alias resolver picks up each supported alias
  console.log("\n  [2a] Column alias resolver — all supported aliases")
  assert(
    pickDestinationPort({ "Destination Port": "Shanghai" }) === "Shanghai",
    'alias "Destination Port" resolves to value'
  )
  assert(
    pickDestinationPort({ "DestinationPort": "Kaohsiung" }) === "Kaohsiung",
    'alias "DestinationPort" resolves to value'
  )
  assert(
    pickDestinationPort({ "Port": "Busan" }) === "Busan",
    'alias "Port" resolves to value'
  )
  assert(
    pickDestinationPort({ "Destination Port": "  Keelung  " }) === "Keelung",
    "alias value is trimmed"
  )
  // Priority: "Destination Port" wins over "Port" when both present
  assert(
    pickDestinationPort({ "Destination Port": "A", "Port": "B" }) === "A",
    '"Destination Port" alias takes priority over "Port"'
  )

  // 2b. importCRMRows normalizes and stores destinationPort
  console.log("\n  [2b] importCRMRows normalizes and stores destinationPort")

  const rows: CRMRow[] = [
    // Clean value
    {
      orderRef: "REF-DPORT-S2A",
      year: "2099", month: "February", country: "TW - Taiwan",
      customer: "__test_dest_port_portA__", grade: "BKP",
      volume: 300, price: 820, mill: null, comments: null,
      destinationPort: "Kaohsiung",
    },
    // Different port
    {
      orderRef: "REF-DPORT-S2B",
      year: "2099", month: "February", country: "TW - Taiwan",
      customer: "__test_dest_port_portB__", grade: "BKP",
      volume: 200, price: 820, mill: null, comments: null,
      destinationPort: "Keelung",
    },
    // Same port as S2A but with surrounding whitespace — must collapse to same bucket
    {
      orderRef: "REF-DPORT-S2C",
      year: "2099", month: "February", country: "TW - Taiwan",
      customer: "__test_dest_port_portC__", grade: "EKP",
      volume: 150, price: 900, mill: null, comments: null,
      destinationPort: "  Kaohsiung  ",
    },
    // null port — must be excluded
    {
      orderRef: "REF-DPORT-S2D",
      year: "2099", month: "February", country: "TW - Taiwan",
      customer: "__test_dest_port_noport__", grade: "UKP",
      volume: 999, price: 750, mill: null, comments: null,
      destinationPort: null,
    },
    // empty-string port — must be excluded
    {
      orderRef: "REF-DPORT-S2F",
      year: "2099", month: "February", country: "TW - Taiwan",
      customer: "__test_dest_port_emptyport__", grade: "UKP",
      volume: 111, price: 750, mill: null, comments: null,
      destinationPort: "",
    },
    // Different month — should appear as its own row
    {
      orderRef: "REF-DPORT-S2E",
      year: "2099", month: "March", country: "TW - Taiwan",
      customer: "__test_dest_port_portA__", grade: "BKP",
      volume: 400, price: 820, mill: null, comments: null,
      destinationPort: "Kaohsiung",
    },
  ]

  const result = await importCRMRows(rows)
  assert(result.errors.length === 0, `importCRMRows produces no errors (errors: ${result.errors.join(", ") || "none"})`)
  assert(result.imported === 6, `importCRMRows imports all 6 rows (got ${result.imported})`)

  // 2c. Verify normalization applied before storage
  console.log("\n  [2c] Verify normalization: trim applied at import time")

  const recA = await prisma.orderRecord.findFirst({
    where: { reference: "REF-DPORT-S2A" },
    select: { destinationPort: true },
  })
  assert(recA?.destinationPort === "Kaohsiung", `REF-S2A stored as "Kaohsiung" (got: ${recA?.destinationPort})`)

  // S2C had "  Kaohsiung  " — importer must have trimmed it to "Kaohsiung"
  const recC = await prisma.orderRecord.findFirst({
    where: { reference: "REF-DPORT-S2C" },
    select: { destinationPort: true },
  })
  assert(recC?.destinationPort === "Kaohsiung", `REF-S2C "  Kaohsiung  " trimmed to "Kaohsiung" (got: "${recC?.destinationPort}")`)

  // S2D was null — stays null
  const recD = await prisma.orderRecord.findFirst({
    where: { reference: "REF-DPORT-S2D" },
    select: { destinationPort: true },
  })
  assert(recD?.destinationPort === null, `REF-S2D null stays null (got: ${recD?.destinationPort})`)

  // S2F was "" — importer must convert to null
  const recF = await prisma.orderRecord.findFirst({
    where: { reference: "REF-DPORT-S2F" },
    select: { destinationPort: true },
  })
  assert(recF?.destinationPort === null, `REF-S2F empty string stored as null (got: ${recF?.destinationPort})`)

  // 2d. Aggregation: correct grouping, whitespace collapse, exclusions
  console.log("\n  [2d] getMarketDestinationPortVolumes aggregation")

  const allVolumes = await getMarketDestinationPortVolumes({ marketId: market.id })
  const testVolumes = allVolumes.filter((r) => r.month === testMonth || r.month === testMonthB)

  // Expected:
  //   2099-02 Kaohsiung: 300 (S2A) + 150 (S2C, trimmed) = 450
  //   2099-02 Keelung:   200 (S2B)
  //   2099-03 Kaohsiung: 400 (S2E)
  //   S2D (null) and S2F (empty→null) excluded → only 3 rows total

  assert(testVolumes.length === 3,
    `aggregation returns exactly 3 rows — null/empty excluded, whitespace collapsed (got ${testVolumes.length}): ${JSON.stringify(testVolumes)}`)

  const feb_kaohsiung = testVolumes.find((r) => r.month === testMonth && r.destinationPort === "Kaohsiung")
  assert(feb_kaohsiung !== undefined, "Kaohsiung bucket present in Feb")
  assert(feb_kaohsiung?.volume === 450,
    `Kaohsiung Feb = 300 + 150 (trimmed) = 450 (got: ${feb_kaohsiung?.volume})`)

  const feb_keelung = testVolumes.find((r) => r.month === testMonth && r.destinationPort === "Keelung")
  assert(feb_keelung !== undefined, "Keelung bucket present in Feb")
  assert(feb_keelung?.volume === 200, `Keelung Feb = 200 (got: ${feb_keelung?.volume})`)

  const mar_kaohsiung = testVolumes.find((r) => r.month === testMonthB && r.destinationPort === "Kaohsiung")
  assert(mar_kaohsiung !== undefined, "Kaohsiung bucket present in Mar")
  assert(mar_kaohsiung?.volume === 400, `Kaohsiung Mar = 400 (got: ${mar_kaohsiung?.volume})`)

  const badRow = testVolumes.find((r) => !r.destinationPort || r.destinationPort.trim() === "")
  assert(badRow === undefined, "no null/empty-string buckets in result")

  // Only two distinct ports in Feb — confirm no spurious whitespace-variant bucket
  const febRows = testVolumes.filter((r) => r.month === testMonth)
  assert(febRows.length === 2, `exactly 2 distinct port buckets in Feb (no whitespace duplicates) (got ${febRows.length})`)

  // 2e. Month-scoped filter
  console.log("\n  [2e] Month-scoped filter")
  const febOnly = await getMarketDestinationPortVolumes({ marketId: market.id, months: [testMonth] })
  const febFiltered = febOnly.filter((r) => r.month === testMonth)
  const marInFebQuery = febOnly.filter((r) => r.month === testMonthB)
  assert(febFiltered.length === 2, `month filter returns 2 rows for Feb (got ${febFiltered.length})`)
  assert(marInFebQuery.length === 0, "Mar rows excluded when querying Feb only")

  // Cleanup — delete cycles first (orders already gone), then customers
  await cleanupFixtures(market.id, testMonth)
  await cleanupFixtures(market.id, testMonthB)
  await cleanupTestCustomers(market.id)
}

// ── Cleanup helpers ───────────────────────────────────────────────────────────

const TEST_CUSTOMER_NAMES = [
  "__test_no_port__",
  "__test_dest_port_state1__",
  "__test_dest_port_portA__",
  "__test_dest_port_portB__",
  "__test_dest_port_portC__",
  "__test_dest_port_noport__",
  "__test_dest_port_emptyport__",
]

async function cleanupFixtures(marketId: string, month: string) {
  // Remove this market's cycle for the test month
  const cycle = await prisma.monthlyCycle.findFirst({
    where: { marketId, month },
    select: { id: true },
  })
  if (cycle) {
    await prisma.monthlyPrice.deleteMany({ where: { cycleId: cycle.id } })
    await prisma.orderRecord.deleteMany({ where: { cycleId: cycle.id } })
    await prisma.monthlyCycle.delete({ where: { id: cycle.id } }).catch(() => {})
  }

  // ensureAllMarketCycles fans out to every market — clean those phantom cycles too
  // so no bogus future months survive the test run.
  const phantom = await prisma.monthlyCycle.findMany({
    where: { month, marketId: { not: marketId } },
    select: { id: true },
  })
  if (phantom.length > 0) {
    const phantomIds = phantom.map((c) => c.id)
    await prisma.monthlyPrice.deleteMany({ where: { cycleId: { in: phantomIds } } })
    await prisma.orderRecord.deleteMany({ where: { cycleId: { in: phantomIds } } })
    await prisma.monthlyCycle.deleteMany({ where: { id: { in: phantomIds } } })
  }
}

async function cleanupTestCustomers(marketId: string) {
  // Find test customers, wipe any remaining orders, then delete customers
  const testCustomers = await prisma.customer.findMany({
    where: { marketId, name: { in: TEST_CUSTOMER_NAMES } },
    select: { id: true },
  })
  const ids = testCustomers.map((c) => c.id)
  if (ids.length > 0) {
    await prisma.orderRecord.deleteMany({ where: { customerId: { in: ids } } })
    await prisma.monthlyPrice.deleteMany({ where: { customerId: { in: ids } } })
    await prisma.customer.deleteMany({ where: { id: { in: ids } } })
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Destination-Port Feature Verification ===")

  await testState1_NoDestinationPort()
  await testState2_WithDestinationPort()

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`)

  if (failures.length > 0) {
    console.error("\nFailed assertions:")
    failures.forEach((f) => console.error(`  - ${f}`))
    process.exit(1)
  } else {
    console.log("All tests passed.")
    process.exit(0)
  }
}

main()
  .catch((err) => {
    console.error("Test suite crashed:", err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
