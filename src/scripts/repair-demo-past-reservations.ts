import { prisma } from "../lib/prisma";
import { PAST_EVENT_NAMES, REAL_LOGIN_EMAILS } from "./seed-kora-past-stats";

/**
 * Quita reservas de eventos pasados Kora (stats demo) asignadas a cuentas de login reales.
 * Ejecutar antes o después de re-seed si invitado1/invitado2 ven decenas de eventos pasados.
 *
 * Uso: npm run repair:demo-past-reservations
 */

const deleteReservationsCascade = async (resIds: string[]): Promise<void> => {
  if (resIds.length === 0) return;
  await prisma.payment.deleteMany({ where: { reservationId: { in: resIds } } });
  await prisma.orderItem.deleteMany({
    where: { order: { reservationId: { in: resIds } } },
  });
  await prisma.order.deleteMany({ where: { reservationId: { in: resIds } } });
  await prisma.loyaltyTransaction.deleteMany({
    where: { reservationId: { in: resIds } },
  });
  await prisma.reservationGuest.deleteMany({
    where: { reservationId: { in: resIds } },
  });
  await prisma.reservation.deleteMany({ where: { id: { in: resIds } } });
};

const main = async (): Promise<void> => {
  const loginUsers = await prisma.user.findMany({
    where: { email: { in: [...REAL_LOGIN_EMAILS] } },
    select: { id: true, email: true },
  });

  if (loginUsers.length === 0) {
    console.log("[repair-demo-past] No hay usuarios de login demo en la base.");
    return;
  }

  const pastEvents = await prisma.eventNight.findMany({
    where: { name: { in: [...PAST_EVENT_NAMES] } },
    select: { id: true, name: true },
  });

  if (pastEvents.length === 0) {
    console.log("[repair-demo-past] No hay eventos pasados Kora de stats en la base.");
    return;
  }

  const eventIds = pastEvents.map((e) => e.id);
  const hostIds = loginUsers.map((u) => u.id);

  const reservations = await prisma.reservation.findMany({
    where: {
      eventId: { in: eventIds },
      hostId: { in: hostIds },
    },
    select: {
      id: true,
      host: { select: { email: true } },
      event: { select: { name: true } },
    },
  });

  if (reservations.length === 0) {
    console.log("[repair-demo-past] Nada que limpiar — cuentas demo sin reservas en stats pasadas.");
    return;
  }

  const byHost = new Map<string, number>();
  for (const r of reservations) {
    const email = r.host.email;
    byHost.set(email, (byHost.get(email) ?? 0) + 1);
  }

  console.log(`[repair-demo-past] Eliminando ${reservations.length} reservas de stats en cuentas reales:`);
  for (const [email, count] of byHost) {
    console.log(`  · ${email}: ${count}`);
  }

  await deleteReservationsCascade(reservations.map((r) => r.id));

  const guestRows = await prisma.reservationGuest.findMany({
    where: {
      userId: { in: hostIds },
      reservation: { eventId: { in: eventIds } },
    },
    select: { id: true, user: { select: { email: true } } },
  });

  if (guestRows.length > 0) {
    await prisma.reservationGuest.deleteMany({
      where: { id: { in: guestRows.map((g) => g.id) } },
    });
    console.log(`[repair-demo-past] Invitados demo quitados: ${guestRows.length}`);
  }

  console.log("[repair-demo-past] Listo. Ejecutá npm run seed:kora-past-stats para regenerar stats.");
};

main()
  .catch((error) => {
    console.error("[repair-demo-past] Error:", error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
