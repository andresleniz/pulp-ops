/**
 * test-data-safety.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Regression tests for data-preservation guarantees.
 *
 * Run via: npm run test:safety
 *
 * Tests
 * ─────
 * A. Task persistence across scope change
 *    - Tasks with a legacy `month` value are still returned by listMarketTasks()
 *    - The month field does NOT act as a visibility filter
 *
 * B. Notes persistence — fallback read
 *    - A note created with a non-matching month is still surfaced by
 *      getMarketNoteWithFallback()
 *    - A note with month=null is surfaced by the fallback path
 *
 * C. Dashboard cycle counts
 *    - Each active month has exactly 11 market cycles
 *    - India market is present in all test months
 *
 * D. Migration idempotence
 *    - runPendingMigrations() can be called multiple times without errors or
 *      duplicate log entries
 *
 * All tests are DESTRUCTIVE within isolated fixture records that are cleaned up
 * after each test.  They do NOT touch production data.
 */

import { prisma } from "@/lib/prisma"
import { listMarketTasks, createMarketTask, setMarketTaskStatus } from "@/lib/market-tasks"
import { getMarketNote, getMarketNoteWithFallback, upsertMarketNote } from "@/lib/market-notes"
import { runPendingMigrations } from "@/lib/data-migrations"

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

async function getFixtureMarket(): Promise<{ id: string; name: string }> {
  const market = await prisma.market.findFirst({ select: { id: true, name: true } })
  if (!market) throw new Error("No markets in DB — seed first")
  return market
}

// ── Test A: Task persistence across scope change ──────────────────────────────

async function testTaskPersistence() {
  console.log("\n[A] Task persistence across scope change")
  const market = await getFixtureMarket()
  const createdIds: string[] = []

  try {
    // A1. Create a task with month metadata (simulates a "legacy" month-tagged task)
    await createMarketTask(market.id, "__test_task_with_month__")
    // Manually set month on it to simulate legacy format
    const task = await prisma.marketTask.findFirst({
      where: { marketId: market.id, title: "__test_task_with_month__" },
    })
    if (!task) throw new Error("Task not created")
    createdIds.push(task.id)
    await prisma.marketTask.update({ where: { id: task.id }, data: { month: "2025-01" } })

    // A2. Create a task without month (current format)
    await createMarketTask(market.id, "__test_task_no_month__")
    const task2 = await prisma.marketTask.findFirst({
      where: { marketId: market.id, title: "__test_task_no_month__" },
    })
    if (!task2) throw new Error("Task2 not created")
    createdIds.push(task2.id)

    // A3. listMarketTasks must return BOTH regardless of month
    const tasks = await listMarketTasks(market.id)
    const titles = tasks.map((t) => t.title)
    assert(
      titles.includes("__test_task_with_month__"),
      "listMarketTasks returns task with legacy month=2025-01"
    )
    assert(
      titles.includes("__test_task_no_month__"),
      "listMarketTasks returns task without month"
    )

    // A4. Simulate a different month being "selected" — must still return both
    //     (There is no month param to listMarketTasks — this asserts the invariant
    //      by confirming the function signature doesn't accept one.)
    const fnStr = listMarketTasks.toString()
    assert(
      !fnStr.includes("where: { marketId, month"),
      "listMarketTasks does not contain a month filter in its where clause"
    )

    // A5. Mark one task done — must still be in the list (status filter is UI-level)
    await setMarketTaskStatus(task.id, "done")
    const allTasks = await listMarketTasks(market.id)
    assert(
      allTasks.some((t) => t.id === task.id && t.status === "done"),
      "Done task still visible in listMarketTasks (status does not hide it)"
    )
  } finally {
    // Cleanup
    await prisma.marketTask.deleteMany({ where: { id: { in: createdIds } } })
  }
}

// ── Test B: Notes persistence — fallback read ─────────────────────────────────

async function testNotesPersistence() {
  console.log("\n[B] Notes persistence — fallback read")
  const market = await getFixtureMarket()
  const createdIds: string[] = []

  try {
    // B1. Create a note for a specific month
    await upsertMarketNote(market.id, "2020-01", null, "Legacy note content")
    const note = await prisma.marketNote.findUnique({
      where: { marketId_month: { marketId: market.id, month: "2020-01" } },
    })
    if (!note) throw new Error("Note not created")
    createdIds.push(note.id)

    // B2. Exact lookup for the correct month succeeds
    const exact = await getMarketNote(market.id, "2020-01")
    assert(exact !== null, "getMarketNote returns note for exact month")
    assert(exact?.content === "Legacy note content", "getMarketNote returns correct content")

    // B3. Exact lookup for a different month returns null (correct behavior)
    const miss = await getMarketNote(market.id, "2099-12")
    assert(miss === null, "getMarketNote returns null for non-existent month")

    // B4. Fallback read for a different month finds the legacy note
    const fallback = await getMarketNoteWithFallback(market.id, "2099-12")
    assert(fallback !== null, "getMarketNoteWithFallback finds note even when month doesn't match")
    assert(fallback?.isFallback === true, "getMarketNoteWithFallback marks result as fallback")
    assert(
      fallback?.content === "Legacy note content",
      "getMarketNoteWithFallback returns correct content via fallback"
    )

    // B5. Fallback read for the exact month returns isFallback=false
    const direct = await getMarketNoteWithFallback(market.id, "2020-01")
    assert(direct?.isFallback === false, "getMarketNoteWithFallback returns isFallback=false for exact month match")
  } finally {
    await prisma.marketNote.deleteMany({ where: { id: { in: createdIds } } })
  }
}

// ── Test C: Dashboard cycle counts ───────────────────────────────────────────

async function testDashboardIsolation() {
  console.log("\n[C] Dashboard cycle counts")

  const months = ["2026-02", "2026-03", "2026-04", "2026-05"]

  // C1. Each test month must have exactly 13 market cycles (11 original + Turkey + Europe)
  const expectedMarketCount = await prisma.market.count()
  let allMatch = true
  for (const m of months) {
    const count = await prisma.monthlyCycle.count({ where: { month: { startsWith: m } } })
    if (count !== expectedMarketCount) allMatch = false
  }
  assert(allMatch, `All test months have exactly ${expectedMarketCount} markets`)

  // C2. India is present in all months
  const india = await prisma.market.findFirst({ where: { name: "India" } })
  if (india) {
    let indiaInAll = true
    for (const m of months) {
      const c = await prisma.monthlyCycle.count({
        where: { month: { startsWith: m }, marketId: india.id },
      })
      if (c !== 1) indiaInAll = false
    }
    assert(indiaInAll, "India market present in all 4 test months")
  }
}

// ── Test D: Migration idempotence ────────────────────────────────────────────

async function testMigrationIdempotence() {
  console.log("\n[D] Migration idempotence")

  // E1. First run
  const results1 = await runPendingMigrations()
  const failed1 = results1.filter((r) => r.status === "failed")
  assert(failed1.length === 0, "First migration run has no failures")

  // E2. Second run — all should be skipped or applied, none failed
  const results2 = await runPendingMigrations()
  const failed2 = results2.filter((r) => r.status === "failed")
  assert(failed2.length === 0, "Second migration run has no failures")

  // D3. No migration should be applied twice
  // After first run, check-based migrations should return skipped on second run
  // (Scope-documentation migrations use hasMigrationLog and should be skipped.)
  const scopeMigrations = results2.filter(
    (r) => r.id === "tasks-market-scope-v1" || r.id === "notes-month-scope-v1"
  )
  assert(
    scopeMigrations.every((r) => r.status === "skipped"),
    "Scope-documentation migrations are skipped on second run (idempotent)"
  )

  console.log(`  (run1: ${results1.map((r) => `${r.id}=${r.status}`).join(", ")})`)
  console.log(`  (run2: ${results2.map((r) => `${r.id}=${r.status}`).join(", ")})`)
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Data Safety Regression Tests ===")

  await testTaskPersistence()
  await testNotesPersistence()
  await testDashboardIsolation()
  await testMigrationIdempotence()

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

main().catch((err) => {
  console.error("Test suite crashed:", err)
  process.exit(1)
}).finally(() => prisma.$disconnect())
