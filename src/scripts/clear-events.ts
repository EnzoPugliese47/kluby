import { prisma } from "../lib/prisma";

/**
 * Vacía todos los eventos y datos ligados (reservas, pedidos, pagos, etc.).
 * Conserva usuarios, boliches, mesas base (sin evento) y productos del club.
 *
 * Ejecutar con: npm run clear:events
 */
const main = async (): Promise<void> => {
  const eventCount = await prisma.eventNight.count();
  if (eventCount === 0) {
    console.log("[clear-events] No hay eventos para borrar.");
    return;
  }

  console.log(`[clear-events] Eliminando ${eventCount} evento(s) y datos relacionados...`);

  const deleted = await prisma.$transaction(async (tx) => {
    const payments = await tx.payment.deleteMany();
    const orderItems = await tx.orderItem.deleteMany();
    const orders = await tx.order.deleteMany();
    const chatMessages = await tx.chatMessage.deleteMany();
    const loyalty = await tx.loyaltyTransaction.deleteMany();
    const guests = await tx.reservationGuest.deleteMany();
    const reservations = await tx.reservation.deleteMany();
    const eventProducts = await tx.product.deleteMany({
      where: { eventId: { not: null } },
    });
    const eventTables = await tx.clubTable.deleteMany({
      where: { eventId: { not: null } },
    });
    const events = await tx.eventNight.deleteMany();

    return {
      payments: payments.count,
      orderItems: orderItems.count,
      orders: orders.count,
      chatMessages: chatMessages.count,
      loyalty: loyalty.count,
      guests: guests.count,
      reservations: reservations.count,
      eventProducts: eventProducts.count,
      eventTables: eventTables.count,
      events: events.count,
    };
  });

  console.log("[clear-events] Listo:");
  console.log(`  eventos: ${deleted.events}`);
  console.log(`  reservas: ${deleted.reservations}`);
  console.log(`  pedidos: ${deleted.orders}`);
  console.log(`  pagos: ${deleted.payments}`);
  console.log(`  mesas de evento: ${deleted.eventTables}`);
  console.log(`  productos de evento: ${deleted.eventProducts}`);
};

main()
  .catch((error) => {
    console.error("[clear-events] Error:", error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
