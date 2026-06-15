import { Prisma, ReservationStatus } from "../generated/prisma/client";

/**
 * Filtro Prisma que identifica las reservas que ocupan efectivamente una mesa:
 *  - CONFIRMED / CHECKED_IN: ocupan siempre.
 *  - PENDING_PAYMENT: ocupan solo mientras el bloqueo transitorio (TTL) no
 *    haya vencido. Una vez vencido, la mesa se considera libre (RN05).
 */
export const occupyingReservationFilter = (
  now: Date = new Date()
): Prisma.ReservationWhereInput => ({
  OR: [
    {
      status: {
        in: [ReservationStatus.CONFIRMED, ReservationStatus.CHECKED_IN],
      },
    },
    {
      status: ReservationStatus.PENDING_PAYMENT,
      expiresAt: { gt: now },
    },
  ],
});

/** Calcula el monto de la sena a partir del precio total y el porcentaje. */
export const computeDeposit = (
  price: Prisma.Decimal,
  depositPercent: number
): Prisma.Decimal => price.mul(depositPercent).div(100);

/**
 * Escala de devoluciones por cancelacion segun anticipacion al evento (RN16):
 *  - > 48 h: 100%
 *  - 24 a 48 h: 50%
 *  - < 24 h: 0%
 */
export const computeRefundPercent = (
  eventDate: Date,
  now: Date = new Date()
): number => {
  const hoursUntilEvent =
    (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60);
  if (hoursUntilEvent > 48) return 100;
  if (hoursUntilEvent >= 24) return 50;
  return 0;
};
