import { UserRole } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { hashPassword } from "../utils/password";

/**
 * Crea o repara el usuario demo de puerta sin borrar el resto de la base.
 * Uso: npm run repair:puerta
 */
const EMAIL = "puerta@kluby.com";
const PASSWORD = "password123";

async function main(): Promise<void> {
  const club = await prisma.club.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, ownerId: true },
  });
  if (club === null) {
    throw new Error("No hay boliches activos. Corré npm run seed primero.");
  }

  const passwordHash = await hashPassword(PASSWORD);
  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    create: {
      email: EMAIL,
      passwordHash,
      fullName: "Seguridad Puerta",
      phone: "+54 9 11 3071 5566",
      role: UserRole.PUERTA,
      isVerified: true,
      isActive: true,
    },
    update: {
      passwordHash,
      fullName: "Seguridad Puerta",
      role: UserRole.PUERTA,
      isActive: true,
      isVerified: true,
    },
  });

  const existing = await prisma.clubMember.findFirst({
    where: { userId: user.id, clubId: club.id },
  });
  if (existing === null) {
    await prisma.clubMember.create({
      data: {
        userId: user.id,
        clubId: club.id,
        invitedBy: club.ownerId,
      },
    });
  } else if (!existing.isActive) {
    await prisma.clubMember.update({
      where: { id: existing.id },
      data: { isActive: true },
    });
  }

  console.log("\n========== PUERTA DEMO LISTA ==========");
  console.log(`  Email:    ${EMAIL}`);
  console.log(`  Password: ${PASSWORD}`);
  console.log(`  Boliche:  ${club.name}`);
  console.log("  URL:      http://localhost:3000/staff.html");
  console.log("=======================================\n");
}

main()
  .catch((error) => {
    console.error("[repair:puerta] Error:", error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
