import { prisma } from "../lib/prisma"

const TO_DELETE = [
  "TTO Global BCTMP HWD",
  "TTO Global BCTMP SWD",
  "TTO Global Dissolving HWD",
  "TTO Global Dissolving SWD",
  "TTO Global Fluff FLUFF",
  "TTO North America Freight Rate",
]

async function main() {
  for (const name of TO_DELETE) {
    const def = await prisma.indexDefinition.findUnique({ where: { name } })
    if (!def) { console.log(`Not found: ${name}`); continue }
    const { count } = await prisma.indexValue.deleteMany({ where: { indexId: def.id } })
    await prisma.indexDefinition.delete({ where: { id: def.id } })
    console.log(`Deleted "${name}" (${count} values)`)
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())
