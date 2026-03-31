import { prisma } from "../lib/prisma"
prisma.indexDefinition.findMany({ select: { name: true }, orderBy: { name: "asc" } })
  .then((r) => r.forEach((d) => console.log(d.name)))
  .finally(() => prisma.$disconnect())
