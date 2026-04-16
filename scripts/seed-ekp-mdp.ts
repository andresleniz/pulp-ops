/**
 * One-shot: create EKP MDP fiber if it doesn't exist.
 * Run via: npx tsx scripts/seed-ekp-mdp.ts
 */
import { prisma } from "@/lib/prisma"

async function main() {
  const f = await prisma.fiber.upsert({
    where: { code: "EKP MDP" },
    update: {},
    create: { code: "EKP MDP", name: "EKP Medium Density Pulp", unit: "USD/ADT" },
  })
  console.log("Fiber:", f.code, f.id)
}

main().finally(() => prisma.$disconnect())
