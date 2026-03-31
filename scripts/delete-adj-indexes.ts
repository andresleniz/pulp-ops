import { prisma } from "../lib/prisma"

async function main() {
  const defs = await prisma.indexDefinition.findMany({
    where: { name: { contains: "Adj" } },
    select: { id: true, name: true },
  })
  for (const def of defs) {
    const { count } = await prisma.indexValue.deleteMany({ where: { indexId: def.id } })
    await prisma.indexDefinition.delete({ where: { id: def.id } })
    console.log(`Deleted "${def.name}" (${count} values)`)
  }
  if (defs.length === 0) console.log("No Adj indexes found.")
}

main().catch(console.error).finally(() => prisma.$disconnect())
