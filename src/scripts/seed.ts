import { Prisma, UserRole } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { hashPassword } from "../utils/password";
import { signToken } from "../utils/jwt";

/**
 * Carga datos de demostracion en la base. ATENCION: limpia los datos
 * existentes antes de insertar (pensado para un entorno de demo/desarrollo).
 *
 * Genera un historico realista (varias noches, reservas, pedidos de bebidas)
 * para que el panel de estadisticas muestre informacion atractiva.
 *
 * Ejecutar con:  npm run seed
 */

const DEMO_PASSWORD = "password123";

// Generador pseudoaleatorio con semilla fija (resultados reproducibles).
let rngState = 4242;
const rand = (): number => {
  rngState = (rngState * 1103515245 + 12345) & 0x7fffffff;
  return rngState / 0x7fffffff;
};
const randInt = (min: number, max: number): number =>
  min + Math.floor(rand() * (max - min + 1));
const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)] as T;
const pickMany = <T>(arr: T[], count: number): T[] => {
  const copy = [...arr];
  const result: T[] = [];
  while (result.length < count && copy.length > 0) {
    const idx = Math.floor(rand() * copy.length);
    result.push(copy.splice(idx, 1)[0] as T);
  }
  return result;
};

const dec = (n: number): Prisma.Decimal => new Prisma.Decimal(n);

const clearDatabase = async (): Promise<void> => {
  await prisma.payment.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.chatMessage.deleteMany();
  await prisma.loyaltyTransaction.deleteMany();
  await prisma.reservationGuest.deleteMany();
  await prisma.reservation.deleteMany();
  await prisma.product.deleteMany();
  await prisma.eventNight.deleteMany();
  await prisma.clubTable.deleteMany();
  await prisma.club.deleteMany();
  await prisma.user.deleteMany();
};

const main = async (): Promise<void> => {
  console.log("[seed] Limpiando datos previos...");
  await clearDatabase();

  const passwordHash = await hashPassword(DEMO_PASSWORD);

  console.log("[seed] Creando usuarios...");
  const admin = await prisma.user.create({
    data: {
      email: "admin@kluby.com",
      passwordHash,
      fullName: "Admin Boliche",
      role: UserRole.CLUB_ADMIN,
      isVerified: true,
    },
  });
  const host = await prisma.user.create({
    data: {
      email: "anfitrion@kluby.com",
      passwordHash,
      fullName: "Lucas Anfitrion",
      phone: "+54 9 11 5512 3344",
      role: UserRole.CLIENT,
      isVerified: true,
      birthDate: new Date("2000-05-20"),
    },
  });
  const guest1 = await prisma.user.create({
    data: { email: "invitado1@kluby.com", passwordHash, fullName: "Sofia Invitada", phone: "+54 9 11 6623 7788", role: UserRole.CLIENT, isVerified: true },
  });
  const guest2 = await prisma.user.create({
    data: { email: "invitado2@kluby.com", passwordHash, fullName: "Martin Invitado", phone: "+54 9 11 4490 1122", role: UserRole.CLIENT, isVerified: true },
  });
  const staff = await prisma.user.create({
    data: { email: "staff@kluby.com", passwordHash, fullName: "Seguridad Puerta", phone: "+54 9 11 3071 5566", role: UserRole.STAFF, isVerified: true },
  });
  const clients = [host, guest1, guest2];

  console.log("[seed] Creando boliche, mesas y catalogo...");
  const club = await prisma.club.create({
    data: {
      name: "Club Pacha CABA",
      description: "El templo de la electronica en Buenos Aires.",
      address: "Av. Costanera Rafael Obligado 6151",
      city: "CABA",
      musicGenre: "Electronica",
      ownerId: admin.id,
    },
  });

  const tableDefs = [
    { label: "VIP 1 - Pista", sector: "Frente a cabina", capacity: 10, price: 120000, x: 120, y: 80 },
    { label: "VIP 2 - Terraza", sector: "Terraza", capacity: 10, price: 180000, x: 320, y: 60 },
    { label: "VIP 3 - Barra", sector: "Barra central", capacity: 10, price: 90000, x: 220, y: 180 },
    { label: "VIP 4 - Privado", sector: "Sala privada", capacity: 10, price: 250000, x: 420, y: 140 },
    { label: "VIP 5 - Balcon", sector: "Planta alta", capacity: 10, price: 140000, x: 520, y: 90 },
  ];
  const tables = [];
  for (const t of tableDefs) {
    const created = await prisma.clubTable.create({
      data: {
        clubId: club.id,
        label: t.label,
        sector: t.sector,
        capacity: t.capacity,
        price: dec(t.price),
        minConsumption: dec(Math.round(t.price * 0.6)),
        depositPercent: 10,
        posX: t.x,
        posY: t.y,
      },
    });
    tables.push(created);
  }

  const productDefs = [
    { name: "Vodka Absolut 750ml", category: "Vodka", price: 45000, stock: 60 },
    { name: "Combo Fernet + 2 Coca", category: "Combo", price: 28000, stock: 80 },
    { name: "Champagne Chandon", category: "Espumante", price: 60000, stock: 40 },
    { name: "Gin Beefeater 750ml", category: "Gin", price: 50000, stock: 50 },
    { name: "Whisky Johnnie Walker Red", category: "Whisky", price: 70000, stock: 35 },
    { name: "Combo Cerveza x6", category: "Cerveza", price: 22000, stock: 100 },
  ];
  const products = [];
  for (const p of productDefs) {
    const created = await prisma.product.create({
      data: { clubId: club.id, name: p.name, category: p.category, price: dec(p.price), stock: p.stock },
    });
    products.push(created);
  }

  console.log("[seed] Generando historico de noches, reservas y pedidos...");
  const today = new Date();
  today.setHours(23, 0, 0, 0);
  const NIGHT_WEEKDAYS = [0, 4, 5, 6]; // Dom, Jue, Vie, Sab

  let reservationsCreated = 0;
  let ordersCreated = 0;

  for (let daysAgo = 28; daysAgo >= 1; daysAgo--) {
    const date = new Date(today);
    date.setDate(today.getDate() - daysAgo);
    const weekday = date.getDay();
    if (!NIGHT_WEEKDAYS.includes(weekday)) continue;

    const event = await prisma.eventNight.create({
      data: {
        clubId: club.id,
        name: `Noche ${date.toLocaleDateString("es-AR")}`,
        date,
        musicGenre: pick(["Electronica", "Reggaeton", "Cachengue", "House"]),
      },
    });

    // Viernes y sabados venden mas (mas reservas).
    const isHotNight = weekday === 5 || weekday === 6;
    const reservationsThisNight = isHotNight ? randInt(3, 4) : randInt(1, 2);
    const chosenTables = pickMany(tables, reservationsThisNight);

    for (const table of chosenTables) {
      const reservationHost = pick(clients);
      const fullPay = rand() < 0.35;
      const total = Number(table.price);
      const deposit = Math.round(total * 0.1);
      const amountPaid = fullPay ? total : deposit;
      const completed = rand() < 0.8;
      const points = Math.floor(amountPaid / 100);

      const reservation = await prisma.reservation.create({
        data: {
          clubId: club.id,
          eventId: event.id,
          tableId: table.id,
          hostId: reservationHost.id,
          mode: "STANDARD",
          paymentOption: fullPay ? "FULL_PAYMENT" : "DEPOSIT_ONLY",
          status: completed ? "COMPLETED" : "CONFIRMED",
          totalAmount: dec(total),
          depositAmount: dec(deposit),
          amountPaid: dec(amountPaid),
          createdAt: date,
          confirmedAt: date,
          completedAt: completed ? date : null,
          expiresAt: date,
          payments: {
            create: {
              userId: reservationHost.id,
              type: fullPay ? "FULL" : "DEPOSIT",
              amount: dec(amountPaid),
              status: "APPROVED",
              createdAt: date,
            },
          },
          loyaltyTxns: completed
            ? {
                create: {
                  userId: reservationHost.id,
                  clubId: club.id,
                  type: "EARNED",
                  points,
                  description: "Acreditacion por cierre de mesa (check-out)",
                  createdAt: date,
                },
              }
            : undefined,
        },
      });
      reservationsCreated += 1;

      // ~65% de las reservas tienen un pedido de bebidas pagado.
      if (rand() < 0.65) {
        const lineProducts = pickMany(products, randInt(1, 3));
        let orderTotal = 0;
        const items = lineProducts.map((product) => {
          const quantity = randInt(1, 3);
          const unitPrice = Number(product.price);
          const subtotal = unitPrice * quantity;
          orderTotal += subtotal;
          return {
            productId: product.id,
            quantity,
            unitPrice: dec(unitPrice),
            subtotal: dec(subtotal),
          };
        });

        await prisma.order.create({
          data: {
            reservationId: reservation.id,
            userId: reservationHost.id,
            type: rand() < 0.5 ? "PREORDER" : "LIVE",
            status: "DELIVERED",
            total: dec(orderTotal),
            createdAt: date,
            items: { createMany: { data: items } },
            payments: {
              create: {
                reservationId: reservation.id,
                userId: reservationHost.id,
                type: "CONSUMPTION",
                amount: dec(orderTotal),
                status: "APPROVED",
                createdAt: date,
              },
            },
          },
        });
        ordersCreated += 1;
      }
    }
  }

  console.log("[seed] Creando evento futuro + Mesa Abierta de ejemplo...");
  const futureEvent = await prisma.eventNight.create({
    data: {
      clubId: club.id,
      name: "Saturday Night - Headliner Internacional",
      date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      musicGenre: "Electronica",
    },
  });
  const openTableMesa = tables[0];
  if (openTableMesa === undefined) throw new Error("No se crearon mesas");
  const openReservation = await prisma.reservation.create({
    data: {
      clubId: club.id,
      eventId: futureEvent.id,
      tableId: openTableMesa.id,
      hostId: host.id,
      mode: "OPEN_TABLE",
      paymentOption: "DEPOSIT_ONLY",
      status: "CONFIRMED",
      totalAmount: dec(Number(openTableMesa.price)),
      depositAmount: dec(Math.round(Number(openTableMesa.price) * 0.1)),
      amountPaid: dec(Math.round(Number(openTableMesa.price) * 0.1)),
      maxGuests: 4,
      confirmedAt: new Date(),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      payments: {
        create: {
          userId: host.id,
          type: "DEPOSIT",
          amount: dec(Math.round(Number(openTableMesa.price) * 0.1)),
          status: "APPROVED",
        },
      },
    },
  });

  const tokens = {
    admin: signToken({ sub: admin.id, role: admin.role, email: admin.email }),
    host: signToken({ sub: host.id, role: host.role, email: host.email }),
    staff: signToken({ sub: staff.id, role: staff.role, email: staff.email }),
  };

  console.log("\n========== DEMO KLUBY LISTA ==========");
  console.log(`Reservas historicas: ${reservationsCreated} | Pedidos: ${ordersCreated}`);
  console.log(`Password de todos los usuarios: ${DEMO_PASSWORD}`);
  console.log("\nUsuarios:");
  console.log(`  admin  -> ${admin.email}  (${admin.id})`);
  console.log(`  host   -> ${host.email}  (${host.id})`);
  console.log(`  guest1 -> ${guest1.email}  (${guest1.id})`);
  console.log(`  guest2 -> ${guest2.email}  (${guest2.id})`);
  console.log(`  staff  -> ${staff.email}  (${staff.id})`);
  console.log("\nRecursos:");
  console.log(`  clubId          -> ${club.id}`);
  console.log(`  eventId futuro  -> ${futureEvent.id}`);
  console.log(`  tableId (VIP 1) -> ${openTableMesa.id}`);
  console.log(`  reservationId   -> ${openReservation.id} (Mesa Abierta, 3 cupos libres)`);
  console.log("\nPaginas:");
  console.log("  Sitio cliente  -> http://localhost:3000           (anfitrion@kluby.com / password123)");
  console.log("  Panel admin    -> http://localhost:3000/panel.html (admin@kluby.com / password123)");
  console.log("  Staff/Puerta   -> http://localhost:3000/staff.html (staff@kluby.com / password123)");
  console.log("\nToken admin (Authorization: Bearer <token>):");
  console.log(`  ${tokens.admin}`);
  console.log("======================================\n");
};

main()
  .catch((error) => {
    console.error("[seed] Error:", error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
