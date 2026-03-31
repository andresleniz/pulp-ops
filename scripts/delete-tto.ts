import { prisma } from "../lib/prisma"

async function main() {
  const def = await prisma.indexDefinition.findUnique({ where: { name: "TTO" } })
  if (!def) {
    console.log("IndexDefinition 'TTO' not found — nothing to delete.")
    return
  }
  const deleted = await prisma.indexValue.deleteMany({ where: { indexId: def.id } })
  await prisma.indexDefinition.delete({ where: { id: def.id } })
  console.log(`Deleted 'TTO' definition and ${deleted.count} index values.`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
