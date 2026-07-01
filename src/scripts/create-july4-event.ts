import { Prisma } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";

/**
 * Crea el evento "Noche VISA" — sábado 4 de julio con plano y 22 mesas en 3 sectores.
 * Ejecutar: npm run seed:july4
 */

const dec = (n: number): Prisma.Decimal => new Prisma.Decimal(n);

const MAP_URL = "/maps/visa-july4.png";

type TableDef = {
  label: string;
  sector: string;
  capacity: number;
  price: number;
  posX: number;
  posY: number;
};

/** Coordenadas en % sobre el plano 1725×2490 — alineadas a los 3 sectores del mapa. */
const TABLES: TableDef[] = [
  // Zona VIP Norte — mesas 1–8
  { label: "Mesa 1", sector: "Zona VIP Norte", capacity: 10, price: 280000, posX: 48, posY: 10 },
  { label: "Mesa 2", sector: "Zona VIP Norte", capacity: 10, price: 270000, posX: 56, posY: 10 },
  { label: "Mesa 3", sector: "Zona VIP Norte", capacity: 10, price: 270000, posX: 64, posY: 10 },
  { label: "Mesa 4", sector: "Zona VIP Norte", capacity: 10, price: 260000, posX: 72, posY: 10 },
  { label: "Mesa 5", sector: "Zona VIP Norte", capacity: 12, price: 300000, posX: 52, posY: 15 },
  { label: "Mesa 6", sector: "Zona VIP Norte", capacity: 10, price: 250000, posX: 60, posY: 15 },
  { label: "Mesa 7", sector: "Zona VIP Norte", capacity: 10, price: 250000, posX: 68, posY: 15 },
  { label: "Mesa 8", sector: "Zona VIP Norte", capacity: 10, price: 240000, posX: 76, posY: 15 },

  // Sector Lounge Sur — mesas 9–15
  { label: "Mesa 9", sector: "Sector Lounge Sur", capacity: 8, price: 120000, posX: 17, posY: 80 },
  { label: "Mesa 10", sector: "Sector Lounge Sur", capacity: 8, price: 115000, posX: 17, posY: 84 },
  { label: "Mesa 11", sector: "Sector Lounge Sur", capacity: 8, price: 115000, posX: 17, posY: 88 },
  { label: "Mesa 12", sector: "Sector Lounge Sur", capacity: 6, price: 105000, posX: 24, posY: 80 },
  { label: "Mesa 13", sector: "Sector Lounge Sur", capacity: 8, price: 110000, posX: 24, posY: 84 },
  { label: "Mesa 14", sector: "Sector Lounge Sur", capacity: 8, price: 110000, posX: 24, posY: 88 },
  { label: "Mesa 15", sector: "Sector Lounge Sur", capacity: 6, price: 100000, posX: 20.5, posY: 82 },

  // Zona VISA — mesas 16–22
  { label: "Mesa 16", sector: "Zona VISA", capacity: 10, price: 165000, posX: 56, posY: 71 },
  { label: "Mesa 17", sector: "Zona VISA", capacity: 10, price: 160000, posX: 64, posY: 71 },
  { label: "Mesa 18", sector: "Zona VISA", capacity: 10, price: 160000, posX: 72, posY: 71 },
  { label: "Mesa 19", sector: "Zona VISA", capacity: 10, price: 155000, posX: 80, posY: 71 },
  { label: "Mesa 20", sector: "Zona VISA", capacity: 10, price: 150000, posX: 60, posY: 77 },
  { label: "Mesa 21", sector: "Zona VISA", capacity: 10, price: 150000, posX: 68, posY: 77 },
  { label: "Mesa 22", sector: "Zona VISA", capacity: 10, price: 145000, posX: 76, posY: 77 },
];

const main = async (): Promise<void> => {
  const club =
    (await prisma.club.findFirst({ where: { name: { contains: "Pacha", mode: "insensitive" } } })) ??
    (await prisma.club.findFirst({ where: { isActive: true }, orderBy: { name: "asc" } }));

  if (club === null) {
    throw new Error("No hay boliches en la base. Ejecutá npm run seed primero.");
  }

  // Sábado 4 de julio de 2026, 23:00 (Argentina UTC-3)
  const eventDate = new Date("2026-07-05T02:00:00.000Z");

  const existing = await prisma.eventNight.findFirst({
    where: { clubId: club.id, name: { contains: "Noche VISA", mode: "insensitive" } },
  });

  let eventId: string;
  if (existing !== null) {
    console.log("[july4] Recreando evento Noche VISA existente...");
    await prisma.reservation.deleteMany({ where: { eventId: existing.id } });
    await prisma.product.deleteMany({ where: { eventId: existing.id } });
    await prisma.eventNight.delete({ where: { id: existing.id } });
  }

  const created = await prisma.eventNight.create({
    data: {
      clubId: club.id,
      name: "Noche VISA · Sábado 4 de Julio",
      date: eventDate,
      musicGenre: "Electrónica",
      backgroundImage: MAP_URL,
      defaultConsumptionPercent: 100,
    },
  });
  eventId = created.id;

  for (const t of TABLES) {
    await prisma.clubTable.create({
      data: {
        clubId: club.id,
        eventId,
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
    const exists = await prisma.product.findFirst({
      where: { eventId, name: p.name },
    });
    if (exists === null) {
      await prisma.product.create({
        data: {
          clubId: club.id,
          eventId,
          name: p.name,
          category: p.category,
          price: dec(p.price),
          stock: 50,
        },
      });
    }
  }

  console.log("\n========== EVENTO CREADO ==========");
  console.log(`Boliche:  ${club.name} (${club.id})`);
  console.log(`Evento:   Noche VISA · Sábado 4 de Julio (${eventId})`);
  console.log(`Fecha:    sábado 4 de julio de 2026 · 23:00`);
  console.log(`Plano:    ${MAP_URL}`);
  console.log(`Mesas:    ${TABLES.length} (Mesa 1 – Mesa 22, sin repetir)`);
  console.log("  · Zona VIP Norte (1–8)");
  console.log("  · Sector Lounge Sur (9–15)");
  console.log("  · Zona VISA (16–22)");
  console.log("\nVer en:");
  console.log(`  Explorar:  http://localhost:3000/explorar.html`);
  console.log(`  Ficha:     http://localhost:3000/boliche.html?id=${club.id}`);
  console.log(`  App:       http://localhost:3000/app.html (login cliente)`);
  console.log("====================================\n");
};

main()
  .catch((error) => {
    console.error("[july4] Error:", error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
