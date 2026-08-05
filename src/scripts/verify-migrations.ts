import { prisma } from "../lib/prisma";

async function main(): Promise<void> {
  const floors = await prisma.eventFloor.count();
  const eventsWithFlyer = await prisma.eventNight.count({
    where: { flyerImageUrl: { not: null } },
  });
  const sampleEvent = await prisma.eventNight.findFirst({
    where: { isActive: true, date: { gte: new Date() } },
    include: { floors: { orderBy: { floorIndex: "asc" } } },
  });

  console.log("[verify] EventFloor rows:", floors);
  console.log("[verify] Events with flyer:", eventsWithFlyer);
  if (sampleEvent) {
    console.log("[verify] Sample upcoming event:", sampleEvent.name);
    console.log("[verify] Floors on sample:", sampleEvent.floors.length);
    for (const f of sampleEvent.floors) {
      console.log(`  - ${f.name} (${f.floorIndex}): plano ${f.backgroundImage ? "sí" : "no"}`);
    }
  } else {
    console.log("[verify] No upcoming events found");
  }
}

main()
  .catch((e) => {
    console.error("[verify] Error:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
