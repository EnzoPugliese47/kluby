import fs from "fs";
import path from "path";
import { Prisma } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { saveStoredAsset } from "../utils/storedAsset";

/**
 * Crea evento Kora — sábado 15 de agosto con plano y 40 mesas en 3 sectores.
 * Ejecutar: npm run seed:kora-aug15 [ruta-al-plano.png|reuse]
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

/** Coordenadas en % sobre el plano vertical de Kora. Etiquetas: solo números 1–40. */
const GENERAL_X = [5, 11, 17, 23, 29, 35, 41, 47, 53, 59];
const GENERAL_PRICES = [95000, 95000, 100000, 100000, 105000, 105000, 110000, 110000, 115000, 115000];

const generalRow = (row: 0 | 1, startNum: number): TableDef[] =>
  GENERAL_X.map((posX, i) => ({
    label: String(startNum + i),
    sector: "Pista General",
    capacity: i >= 4 && i <= 5 ? 10 : 8,
    price: GENERAL_PRICES[i]!,
    posX,
    posY: row === 0 ? 9 : 17,
  }));

const vip1Pairs: Array<[number, number]> = [
  [180000, 185000],
  [185000, 190000],
  [190000, 195000],
  [195000, 200000],
  [200000, 205000],
  [205000, 210000],
  [210000, 220000],
];

const vip1Tables = (): TableDef[] => {
  const out: TableDef[] = [];
  let n = 21;
  for (let row = 0; row < vip1Pairs.length; row++) {
    const [p1, p2] = vip1Pairs[row]!;
    const y = 24 + row * 8;
    out.push(
      { label: String(n++), sector: "VIP 1", capacity: 10, price: p1, posX: 78, posY: y },
      { label: String(n++), sector: "VIP 1", capacity: 10, price: p2, posX: 88, posY: y }
    );
  }
  return out;
};

const TABLES: TableDef[] = [
  ...generalRow(0, 1),
  ...generalRow(1, 11),
  ...vip1Tables(),
  // VIP 2 — 6 mesas (35–40), más separadas entre sí
  { label: "35", sector: "VIP 2", capacity: 10, price: 150000, posX: 7, posY: 78 },
  { label: "36", sector: "VIP 2", capacity: 10, price: 150000, posX: 16, posY: 78 },
  { label: "37", sector: "VIP 2", capacity: 10, price: 155000, posX: 25, posY: 78 },
  { label: "38", sector: "VIP 2", capacity: 10, price: 155000, posX: 7, posY: 91 },
  { label: "39", sector: "VIP 2", capacity: 10, price: 160000, posX: 16, posY: 91 },
  { label: "40", sector: "VIP 2", capacity: 10, price: 165000, posX: 25, posY: 91 },
];

const defaultMapPath = path.join(
  process.cwd(),
  "public/maps/kora-aug15.png"
);

const main = async (): Promise<void> => {
  const club = await prisma.club.findUnique({ where: { id: KORA_CLUB_ID } });
  if (club === null) {
    throw new Error("Boliche Kora no encontrado.");
  }

  const mapArg = process.argv[2];
  const reuseMap = mapArg === "reuse";

  let mapUrl = club.floorMapUrl;
  if (!reuseMap) {
    const mapPath = mapArg ?? defaultMapPath;
    if (!fs.existsSync(mapPath)) {
      if (mapUrl) {
        console.log("[kora-aug15] Plano no en disco, reutilizando mapa del boliche.");
      } else {
        throw new Error(`Plano no encontrado: ${mapPath}`);
      }
    } else {
      const mapBuffer = fs.readFileSync(mapPath);
      mapUrl = await saveStoredAsset("image/png", mapBuffer, "kora-plano-aug15.png");
      await prisma.club.update({
        where: { id: KORA_CLUB_ID },
        data: { floorMapUrl: mapUrl },
      });
    }
  } else if (!mapUrl) {
    throw new Error("No hay plano guardado en el boliche. Pasá la ruta al PNG.");
  }

  if (!mapUrl) {
    throw new Error("No se pudo determinar el plano del evento.");
  }

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
  console.log("  · Pista General (1–20)");
  console.log("  · VIP 1 (21–34)");
  console.log("  · VIP 2 (35–40)");
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
