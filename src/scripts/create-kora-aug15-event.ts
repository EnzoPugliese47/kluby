import fs from "fs";
import path from "path";
import { Prisma } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { saveStoredAsset } from "../utils/storedAsset";

/**
 * Crea evento Kora — sábado 15 de agosto con plano y 30 mesas en 3 sectores.
 * Ejecutar: npm run seed:kora-aug15 [ruta-al-plano.png]
 */

const KORA_CLUB_ID = "a13df687-c80f-4440-9c08-264424e57f0f";
const EVENT_NAME = "Kora · Sábado 15 de Agosto";

const dec = (n: number): Prisma.Decimal => new Prisma.Decimal(n);

type TableDef = {
  label: string;
  sector: string;
  capacity: number;
  price: number;
  posX: number;
  posY: number;
};

/** Coordenadas en % sobre el plano vertical de Kora. */
const TABLES: TableDef[] = [
  // Pista General — 10 mesas arriba pegadas a la pared (PG 1–10)
  { label: "PG 1", sector: "Pista General", capacity: 8, price: 95000, posX: 12, posY: 9 },
  { label: "PG 2", sector: "Pista General", capacity: 8, price: 95000, posX: 18, posY: 9 },
  { label: "PG 3", sector: "Pista General", capacity: 8, price: 100000, posX: 24, posY: 9 },
  { label: "PG 4", sector: "Pista General", capacity: 8, price: 100000, posX: 30, posY: 9 },
  { label: "PG 5", sector: "Pista General", capacity: 10, price: 105000, posX: 36, posY: 9 },
  { label: "PG 6", sector: "Pista General", capacity: 10, price: 105000, posX: 42, posY: 9 },
  { label: "PG 7", sector: "Pista General", capacity: 8, price: 110000, posX: 48, posY: 9 },
  { label: "PG 8", sector: "Pista General", capacity: 8, price: 110000, posX: 54, posY: 9 },
  { label: "PG 9", sector: "Pista General", capacity: 8, price: 115000, posX: 60, posY: 9 },
  { label: "PG 10", sector: "Pista General", capacity: 8, price: 115000, posX: 66, posY: 9 },

  // VIP 1 — 14 mesas en la franja derecha (V1-1 – V1-14)
  { label: "V1-1", sector: "VIP 1", capacity: 10, price: 180000, posX: 78, posY: 16 },
  { label: "V1-2", sector: "VIP 1", capacity: 10, price: 185000, posX: 88, posY: 16 },
  { label: "V1-3", sector: "VIP 1", capacity: 10, price: 185000, posX: 78, posY: 24 },
  { label: "V1-4", sector: "VIP 1", capacity: 10, price: 190000, posX: 88, posY: 24 },
  { label: "V1-5", sector: "VIP 1", capacity: 10, price: 190000, posX: 78, posY: 32 },
  { label: "V1-6", sector: "VIP 1", capacity: 10, price: 195000, posX: 88, posY: 32 },
  { label: "V1-7", sector: "VIP 1", capacity: 10, price: 195000, posX: 78, posY: 40 },
  { label: "V1-8", sector: "VIP 1", capacity: 10, price: 200000, posX: 88, posY: 40 },
  { label: "V1-9", sector: "VIP 1", capacity: 10, price: 200000, posX: 78, posY: 48 },
  { label: "V1-10", sector: "VIP 1", capacity: 10, price: 205000, posX: 88, posY: 48 },
  { label: "V1-11", sector: "VIP 1", capacity: 10, price: 205000, posX: 78, posY: 56 },
  { label: "V1-12", sector: "VIP 1", capacity: 10, price: 210000, posX: 88, posY: 56 },
  { label: "V1-13", sector: "VIP 1", capacity: 10, price: 210000, posX: 78, posY: 64 },
  { label: "V1-14", sector: "VIP 1", capacity: 10, price: 220000, posX: 88, posY: 64 },

  // VIP 2 — 6 mesas abajo a la izquierda (V2-1 – V2-6)
  { label: "V2-1", sector: "VIP 2", capacity: 10, price: 150000, posX: 10, posY: 82 },
  { label: "V2-2", sector: "VIP 2", capacity: 10, price: 150000, posX: 16, posY: 82 },
  { label: "V2-3", sector: "VIP 2", capacity: 10, price: 155000, posX: 22, posY: 82 },
  { label: "V2-4", sector: "VIP 2", capacity: 10, price: 155000, posX: 10, posY: 89 },
  { label: "V2-5", sector: "VIP 2", capacity: 10, price: 160000, posX: 16, posY: 89 },
  { label: "V2-6", sector: "VIP 2", capacity: 10, price: 165000, posX: 22, posY: 89 },
];

const defaultMapPath = path.join(
  process.cwd(),
  "public/maps/kora-aug15.png"
);

const main = async (): Promise<void> => {
  const mapPath = process.argv[2] ?? defaultMapPath;
  if (!fs.existsSync(mapPath)) {
    throw new Error(`Plano no encontrado: ${mapPath}`);
  }

  const club = await prisma.club.findUnique({ where: { id: KORA_CLUB_ID } });
  if (club === null) {
    throw new Error("Boliche Kora no encontrado.");
  }

  const mapBuffer = fs.readFileSync(mapPath);
  const mapUrl = await saveStoredAsset("image/png", mapBuffer, "kora-plano-aug15.png");

  await prisma.club.update({
    where: { id: KORA_CLUB_ID },
    data: { floorMapUrl: mapUrl },
  });

  // Sábado 15 de agosto de 2026, 23:00 (Argentina UTC-3)
  const eventDate = new Date("2026-08-16T02:00:00.000Z");

  const existing = await prisma.eventNight.findFirst({
    where: { clubId: KORA_CLUB_ID, name: EVENT_NAME },
  });

  if (existing !== null) {
    console.log("[kora-aug15] Recreando evento existente...");
    await prisma.reservation.deleteMany({ where: { eventId: existing.id } });
    await prisma.product.deleteMany({ where: { eventId: existing.id } });
    await prisma.clubTable.deleteMany({ where: { eventId: existing.id } });
    await prisma.eventNight.delete({ where: { id: existing.id } });
  }

  const event = await prisma.eventNight.create({
    data: {
      clubId: KORA_CLUB_ID,
      name: EVENT_NAME,
      date: eventDate,
      musicGenre: "House",
      backgroundImage: mapUrl,
      defaultConsumptionPercent: 100,
    },
  });

  for (const t of TABLES) {
    await prisma.clubTable.create({
      data: {
        clubId: KORA_CLUB_ID,
        eventId: event.id,
        label: t.label,
        sector: t.sector,
        capacity: t.capacity,
        price: dec(t.price),
        consumptionPercent: 100,
        minConsumption: dec(t.price),
        depositPercent: 10,
        posX: t.posX,
        posY: t.posY,
      },
    });
  }

  const bottleDefs = [
    { name: "Vodka Absolut 750ml", category: "Vodka", price: 45000 },
    { name: "Champagne Chandon", category: "Espumante", price: 60000 },
    { name: "Combo Fernet + 2 Coca", category: "Combo", price: 28000 },
  ];
  for (const p of bottleDefs) {
    await prisma.product.create({
      data: {
        clubId: KORA_CLUB_ID,
        eventId: event.id,
        name: p.name,
        category: p.category,
        price: dec(p.price),
        stock: 50,
      },
    });
  }

  console.log("\n========== EVENTO KORA CREADO ==========");
  console.log(`Boliche:  ${club.name} (${club.id})`);
  console.log(`Evento:   ${EVENT_NAME} (${event.id})`);
  console.log(`Fecha:    sábado 15 de agosto de 2026 · 23:00`);
  console.log(`Plano:    ${mapUrl}`);
  console.log(`Mesas:    ${TABLES.length}`);
  console.log("  · Pista General (PG 1–10)");
  console.log("  · VIP 1 (V1-1 – V1-14)");
  console.log("  · VIP 2 (V2-1 – V2-6)");
  console.log("========================================\n");
};

main()
  .catch((error) => {
    console.error("[kora-aug15] Error:", error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
