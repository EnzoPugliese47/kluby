import { Prisma, UserRole } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { hashPassword } from "../utils/password";
import { signToken } from "../utils/jwt";

/**
 * Carga datos de demostracion en la base. ATENCION: limpia los datos
 * existentes antes de insertar (pensado para un entorno de demo/desarrollo).
 *
 * Genera usuarios, boliches, mesas y catalogo base. Sin eventos ni reservas
 * (listo para entrega en cero).
 *
 * Ejecutar con:  npm run seed
 */

const DEMO_PASSWORD = "password123";

const dec = (n: number): Prisma.Decimal => new Prisma.Decimal(n);

const clearDatabase = async (): Promise<void> => {
  await prisma.eventInviteGuest.deleteMany();
  await prisma.eventInvite.deleteMany();
  await prisma.clubJoinInvite.deleteMany();
  await prisma.clubMember.deleteMany();
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
  const superAdmin = await prisma.user.create({
    data: {
      email: "admin@kluby.com",
      passwordHash,
      fullName: "Super Admin Kluby",
      role: UserRole.SUPER_ADMIN,
      isVerified: true,
    },
  });

  const owners = [];
  for (let i = 1; i <= 3; i++) {
    owners.push(
      await prisma.user.create({
        data: {
          email: `duenokluby${i}@kluby.com`,
          passwordHash,
          fullName: `Dueño Kluby ${i}`,
          phone: `+54 9 11 5000 00${i}${i}`,
          role: UserRole.CLUB_ADMIN,
          isVerified: true,
        },
      })
    );
  }

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
  const puerta = await prisma.user.create({
    data: { email: "puerta@kluby.com", passwordHash, fullName: "Seguridad Puerta", phone: "+54 9 11 3071 5566", role: UserRole.PUERTA, isVerified: true },
  });

  console.log("[seed] Creando boliches, mesas y catalogo...");
  const clubDefs = [
    {
      name: "Club Pacha CABA",
      description: "El templo de la electronica en Buenos Aires.",
      address: "Av. Costanera Rafael Obligado 6151",
      city: "CABA",
      musicGenre: "Electronica",
      contactEmail: "reservas@pacha.com.ar",
      contactPhone: "+54 11 4788-4280",
    },
    {
      name: "Kluby Palermo",
      description: "Noches de reggaeton y cachengue en Palermo.",
      address: "Av. Santa Fe 4200",
      city: "CABA",
      musicGenre: "Reggaeton",
      contactEmail: "reservas@klubypalermo.com",
      contactPhone: "+54 11 4555-1200",
    },
    {
      name: "Boliche Sur",
      description: "House y techno frente al rio.",
      address: "Av. Juan B. Justo 800",
      city: "CABA",
      musicGenre: "House",
      contactEmail: "info@bolichesur.com",
      contactPhone: "+54 11 4666-3300",
    },
  ];

  const clubs: { id: string; name: string }[] = [];

  for (let i = 0; i < clubDefs.length; i++) {
    const def = clubDefs[i]!;
    const owner = owners[i]!;
    const club = await prisma.club.create({
      data: {
        name: def.name,
        description: def.description,
        address: def.address,
        city: def.city,
        musicGenre: def.musicGenre,
        ownerId: owner.id,
        contactEmail: def.contactEmail,
        contactPhone: def.contactPhone,
      },
    });
    clubs.push(club);

    const tableDefs = [
      { label: "VIP 1 - Pista", sector: "Frente a cabina", capacity: 10, price: 120000, x: 120, y: 80 },
      { label: "VIP 2 - Terraza", sector: "Terraza", capacity: 10, price: 180000, x: 320, y: 60 },
      { label: "VIP 3 - Barra", sector: "Barra central", capacity: 10, price: 90000, x: 220, y: 180 },
      { label: "VIP 4 - Privado", sector: "Sala privada", capacity: 10, price: 250000, x: 420, y: 140 },
      { label: "VIP 5 - Balcon", sector: "Planta alta", capacity: 10, price: 140000, x: 520, y: 90 },
    ];
    for (const t of tableDefs) {
      await prisma.clubTable.create({
        data: {
          clubId: club.id,
          label: t.label,
          sector: t.sector,
          capacity: t.capacity,
          price: dec(t.price),
          minConsumption: dec(Math.round(t.price * 1.0)),
          consumptionPercent: 100,
          depositPercent: 10,
          posX: t.x,
          posY: t.y,
        },
      });
    }

    const productDefs = [
      { name: "Vodka Absolut 750ml", category: "Vodka", price: 45000, stock: 60 },
      { name: "Combo Fernet + 2 Coca", category: "Combo", price: 28000, stock: 80 },
      { name: "Champagne Chandon", category: "Espumante", price: 60000, stock: 40 },
    ];
    for (const p of productDefs) {
      await prisma.product.create({
        data: { clubId: club.id, name: p.name, category: p.category, price: dec(p.price), stock: p.stock },
      });
    }
  }

  await prisma.clubMember.create({
    data: {
      userId: puerta.id,
      clubId: clubs[0]!.id,
      invitedBy: owners[0]!.id,
    },
  });

  const tokens = {
    superAdmin: signToken({ sub: superAdmin.id, role: superAdmin.role, email: superAdmin.email }),
    owner1: signToken({ sub: owners[0]!.id, role: owners[0]!.role, email: owners[0]!.email }),
    host: signToken({ sub: host.id, role: host.role, email: host.email }),
    puerta: signToken({ sub: puerta.id, role: puerta.role, email: puerta.email }),
  };

  console.log("\n========== DEMO KLUBY LISTA ==========");
  console.log("Eventos: 0 (listo para entrega)");
  console.log(`Password de todos los usuarios: ${DEMO_PASSWORD}`);
  console.log("\nUsuarios:");
  console.log(`  super admin -> ${superAdmin.email}  (${superAdmin.id})`);
  owners.forEach((o, i) => {
    console.log(`  dueño ${i + 1}     -> ${o.email}  (${o.id})  | boliche: ${clubs[i]!.name}`);
  });
  console.log(`  host        -> ${host.email}  (${host.id})`);
  console.log(`  guest1      -> ${guest1.email}  (${guest1.id})`);
  console.log(`  guest2      -> ${guest2.email}  (${guest2.id})`);
  console.log(`  puerta      -> ${puerta.email}  (${puerta.id})  | boliche: ${clubs[0]!.name}`);
  console.log("\nBoliches:");
  clubs.forEach((c) => console.log(`  ${c.name}  (${c.id})`));
  console.log("\nPaginas:");
  console.log("  Sitio cliente  -> http://localhost:3000           (anfitrion@kluby.com / password123)");
  console.log("  Panel super    -> http://localhost:3000/panel.html (admin@kluby.com / password123)");
  console.log("  Panel dueño    -> http://localhost:3000/panel.html (duenokluby1@kluby.com / password123)");
  console.log("  Puerta/QR      -> http://localhost:3000/staff.html (puerta@kluby.com / password123)");
  console.log("\nToken super admin (Authorization: Bearer <token>):");
  console.log(`  ${tokens.superAdmin}`);
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
