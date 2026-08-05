import { PaymentType, Prisma } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";

/**
 * Elimina pedidos de consumo y pagos CONSUMPTION de las reservas de un usuario.
 * Uso: npx ts-node-dev --transpile-only src/scripts/clear-user-consumption.ts invitado1@kluby.com
 */

const email = process.argv[2] ?? "invitado1@kluby.com";

const main = async (): Promise<void> => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (user === null) {
    throw new Error(`Usuario no encontrado: ${email}`);
  }

  const reservations = await prisma.reservation.findMany({
    where: { hostId: user.id },
    select: { id: true, amountPaid: true },
  });

  if (reservations.length === 0) {
    console.log(`[clear-consumption] ${email} no tiene reservas como anfitrión.`);
    return;
  }

  const resIds = reservations.map((r) => r.id);

  const consumptionPayments = await prisma.payment.findMany({
    where: {
      reservationId: { in: resIds },
      type: PaymentType.CONSUMPTION,
    },
    select: { id: true, reservationId: true, amount: true },
  });

  const orders = await prisma.order.findMany({
    where: { reservationId: { in: resIds } },
    select: { id: true },
  });

  if (orders.length === 0 && consumptionPayments.length === 0) {
    console.log(`[clear-consumption] ${email}: sin consumo pagado en sus reservas.`);
    return;
  }

  const minusByReservation = new Map<string, Prisma.Decimal>();
  let refunded = new Prisma.Decimal(0);
  for (const p of consumptionPayments) {
    refunded = refunded.add(p.amount);
    minusByReservation.set(
      p.reservationId,
      (minusByReservation.get(p.reservationId) ?? new Prisma.Decimal(0)).add(p.amount)
    );
  }

  if (consumptionPayments.length > 0) {
    await prisma.payment.deleteMany({
      where: { id: { in: consumptionPayments.map((p) => p.id) } },
    });
  }
  if (orders.length > 0) {
    await prisma.orderItem.deleteMany({
      where: { orderId: { in: orders.map((o) => o.id) } },
    });
    await prisma.order.deleteMany({
      where: { id: { in: orders.map((o) => o.id) } },
    });
  }
  for (const r of reservations) {
    const minus = minusByReservation.get(r.id);
    if (minus !== undefined && minus.greaterThan(0)) {
      const next = Prisma.Decimal.max(new Prisma.Decimal(0), r.amountPaid.sub(minus));
      await prisma.reservation.update({
        where: { id: r.id },
        data: { amountPaid: next },
      });
    }
  }

  console.log(`[clear-consumption] ${email}`);
  console.log(`  Reservas: ${reservations.length}`);
  console.log(`  Pedidos eliminados: ${orders.length}`);
  console.log(`  Pagos consumo eliminados: ${consumptionPayments.length}`);
  console.log(`  Monto descontado de amountPaid: $${Number(refunded).toLocaleString("es-AR")}`);
};

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
