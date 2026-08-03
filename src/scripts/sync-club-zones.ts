/**
 * Infiere y actualiza la zona (CABA / GBA) de cada boliche según city + address.
 * No modifica pointValue ni otros campos.
 *
 *   npm run sync:zones
 *   npm run sync:zones -- --dry-run
 */
import { prisma } from "../lib/prisma";
import {
  CLUB_ZONE_SHORT,
  inferClubZoneFromLocation,
} from "../utils/clubZones";

const main = async (): Promise<void> => {
  const dryRun = process.argv.includes("--dry-run");
  const clubs = await prisma.club.findMany({
    where: { isActive: true },
    select: { id: true, name: true, city: true, address: true, zone: true },
    orderBy: { name: "asc" },
  });

  let updated = 0;
  for (const club of clubs) {
    const inferred = inferClubZoneFromLocation(club.city, club.address);
    if (inferred === club.zone) continue;
    console.log(
      `[sync:zones] ${club.name}: ${CLUB_ZONE_SHORT[club.zone]} → ${CLUB_ZONE_SHORT[inferred]} (${club.city})`
    );
    if (!dryRun) {
      await prisma.club.update({
        where: { id: club.id },
        data: { zone: inferred },
      });
    }
    updated++;
  }

  console.log(
    dryRun
      ? `[sync:zones] Dry-run: ${updated} boliche(s) se actualizarían.`
      : `[sync:zones] Listo: ${updated} boliche(s) actualizados.`
  );
};

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
