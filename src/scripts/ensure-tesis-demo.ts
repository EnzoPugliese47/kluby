import { LoyaltyTxType, UserRole } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { computeBalances } from "../utils/loyalty";

/**
 * Verifica cuentas demo y acredita Kluby Points a anfitrion@kluby.com en Kora
 * para mostrar fidelización en la tesis.
 *
 * Uso: npm run ensure:tesis-demo
 */

const DEMO_EMAILS = [
  "anfitrion@kluby.com",
  "invitado1@kluby.com",
  "invitado2@kluby.com",
  "duenokluby1@kluby.com",
  "puerta@kluby.com",
  "admin@kluby.com",
];

const TARGET_HOST_EMAIL = "anfitrion@kluby.com";
const MIN_POINTS = 1800;

const main = async (): Promise<void> => {
  console.log("[tesis-demo] Verificando cuentas...\n");

  const anfitrion = await prisma.user.findUnique({ where: { email: TARGET_HOST_EMAIL } });
  if (anfitrion !== null && anfitrion.role !== UserRole.CLIENT) {
    await prisma.user.update({
      where: { id: anfitrion.id },
      data: { role: UserRole.CLIENT },
    });
    console.log(`  ↻ ${TARGET_HOST_EMAIL}: rol corregido a CLIENT (era ${anfitrion.role})`);
  }

  for (const email of DEMO_EMAILS) {
    const user = await prisma.user.findUnique({ where: { email }, select: { email: true, role: true } });
    if (user === null) {
      console.warn(`  ✗ Falta usuario: ${email}`);
    } else {
      console.log(`  ✓ ${email} (${user.role})`);
    }
  }

  const kora =
    (await prisma.club.findFirst({ where: { name: { contains: "Kora", mode: "insensitive" } } })) ??
    null;
  if (kora === null) {
    console.warn("\n[tesis-demo] Boliche Kora no encontrado — saltando puntos.");
    return;
  }

  const host = await prisma.user.findUnique({ where: { email: TARGET_HOST_EMAIL } });
  if (host === null) {
    console.warn(`[tesis-demo] ${TARGET_HOST_EMAIL} no existe.`);
    return;
  }

  const txns = await prisma.loyaltyTransaction.findMany({
    where: { userId: host.id, clubId: kora.id },
    select: { clubId: true, type: true, points: true },
  });
  const balance = computeBalances(txns).get(kora.id) ?? 0;

  if (balance >= MIN_POINTS) {
    console.log(`\n[tesis-demo] ${TARGET_HOST_EMAIL} ya tiene ${balance} pts en Kora. OK.`);
    return;
  }

  const toAdd = MIN_POINTS - balance;
  await prisma.loyaltyTransaction.create({
    data: {
      userId: host.id,
      clubId: kora.id,
      type: LoyaltyTxType.EARNED,
      points: toAdd,
      description: "Crédito demo para presentación de tesis",
    },
  });

  console.log(`\n[tesis-demo] +${toAdd} pts acreditados a ${TARGET_HOST_EMAIL} en ${kora.name}.`);
  console.log(`[tesis-demo] Saldo total en Kora: ${balance + toAdd} pts`);
};

main()
  .catch((err) => {
    console.error("[tesis-demo] Error:", err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
