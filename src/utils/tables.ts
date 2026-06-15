/** Extrae el numero al final del label (ej. "VIP Malvinas 12" -> 12). */
export const tableNumberFromLabel = (label: string): number => {
  const match = /(\d+)\s*$/.exec(label);
  return match ? Number(match[1]) : 0;
};

/** Orden habitual de sectores en el plano del salon. */
const SECTOR_ORDER = ["Ultra VIP", "VIP Malvinas", "Pista", "General"] as const;

/**
 * Ordena mesas: primero por sector, luego por numero de mesa (no alfabetico).
 */
export const sortTablesBySectorAndNumber = <
  T extends { label: string; sector?: string | null },
>(
  tables: T[]
): T[] =>
  [...tables].sort((a, b) => {
    const sectorA = a.sector ?? "";
    const sectorB = b.sector ?? "";
    const rankA = SECTOR_ORDER.indexOf(
      sectorA as (typeof SECTOR_ORDER)[number]
    );
    const rankB = SECTOR_ORDER.indexOf(
      sectorB as (typeof SECTOR_ORDER)[number]
    );
    const orderA = rankA >= 0 ? rankA : SECTOR_ORDER.length;
    const orderB = rankB >= 0 ? rankB : SECTOR_ORDER.length;
    if (orderA !== orderB) return orderA - orderB;
    if (sectorA !== sectorB) return sectorA.localeCompare(sectorB, "es");

    const numA = tableNumberFromLabel(a.label);
    const numB = tableNumberFromLabel(b.label);
    if (numA !== numB) return numA - numB;
    return a.label.localeCompare(b.label, "es");
  });
