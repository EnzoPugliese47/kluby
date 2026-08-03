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

export { computeRefundPercent } from "./refundPolicy";
