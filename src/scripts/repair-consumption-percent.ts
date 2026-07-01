import { prisma } from "../lib/prisma";
import { minConsumptionFromPercent } from "../utils/tableConsumption";

async function main(): Promise<void> {
  const tables = await prisma.clubTable.findMany({ where: { isActive: true } });
  for (const t of tables) {
    await prisma.clubTable.update({
      where: { id: t.id },
      data: {
        consumptionPercent: 100,
        minConsumption: minConsumptionFromPercent(t.price, 100),
      },
    });
  }
  const events = await prisma.eventNight.findMany({ where: { isActive: true } });
  for (const e of events) {
    await prisma.eventNight.update({
      where: { id: e.id },
      data: { defaultConsumptionPercent: 100 },
    });
  }
  console.log(`[repair:consumption] ${tables.length} mesas y ${events.length} eventos → 100%`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
