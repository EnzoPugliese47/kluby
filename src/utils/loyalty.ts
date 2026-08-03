import { LoyaltyTxType, Prisma } from "../generated/prisma/client";
import { env } from "../config/env";
import { AppError } from "./appError";

export const LOYALTY_DESC = {
  CHECKOUT: "Acreditacion por cierre de mesa",
  CHECKIN: "Bonus por check-in",
  FIRST: "Bonus primera reserva en el boliche",
  REDEEM: "Canje por descuento en reserva",
  RESTORE: "Devolucion de puntos por cancelacion",
} as const;

/** Saldo = sum(EARNED) - sum(REDEEMED) por boliche. */
export const computeBalances = (
  txns: { clubId: string; type: LoyaltyTxType; points: number }[]
): Map<string, number> => {
  const balances = new Map<string, number>();
  for (const tx of txns) {
    const current = balances.get(tx.clubId) ?? 0;
    const delta = tx.type === LoyaltyTxType.EARNED ? tx.points : -tx.points;
    balances.set(tx.clubId, current + delta);
  }
  return balances;
};

export const computeEarnedPoints = (amountPaid: number): number =>
  Math.floor(amountPaid / env.loyaltyCurrencyPerPoint);

export const computeDiscountValue = (
  points: number,
  pointValue: Prisma.Decimal
): Prisma.Decimal => pointValue.mul(points);

/** Maximo de puntos canjeables segun saldo, tope % del pago y valor del punto. */
export const computeMaxRedeemPoints = (
  balance: number,
  paymentAmount: Prisma.Decimal,
  pointValue: Prisma.Decimal
): number => {
  if (balance < env.loyaltyMinRedeemPoints) return 0;
  const pv = Number(pointValue);
  if (pv <= 0) return 0;
  const maxDiscount = paymentAmount.mul(env.loyaltyMaxRedeemPercent).div(100);
  const maxByPercent = Math.floor(Number(maxDiscount) / pv);
  const maxByCap = env.loyaltyMaxRedeemPointsCap;
  return Math.min(balance, Math.max(0, maxByPercent), maxByCap);
};

export const validateRedeemPoints = (
  pointsToRedeem: number,
  balance: number,
  paymentAmount: Prisma.Decimal,
  pointValue: Prisma.Decimal
): void => {
  if (pointsToRedeem === 0) return;
  if (!Number.isInteger(pointsToRedeem) || pointsToRedeem < 0) {
    throw new AppError("Los puntos a canjear deben ser un entero >= 0", 400);
  }
  if (pointsToRedeem < env.loyaltyMinRedeemPoints) {
    throw new AppError(
      `Minimo ${env.loyaltyMinRedeemPoints} puntos para canjear`,
      400
    );
  }
  if (pointsToRedeem > balance) {
    throw new AppError(
      `Saldo insuficiente: tenes ${balance} puntos en este boliche`,
      400
    );
  }
  const maxAllowed = computeMaxRedeemPoints(balance, paymentAmount, pointValue);
  if (pointsToRedeem > maxAllowed) {
    throw new AppError(
      `Maximo ${maxAllowed} puntos en este pago (${env.loyaltyMaxRedeemPercent}% del monto, tope ${env.loyaltyMaxRedeemPointsCap} pts)`,
      400
    );
  }
};

export const loyaltyRulesPayload = () => ({
  currencyPerPoint: env.loyaltyCurrencyPerPoint,
  minRedeemPoints: env.loyaltyMinRedeemPoints,
  maxRedeemPercent: env.loyaltyMaxRedeemPercent,
  maxRedeemPointsCap: env.loyaltyMaxRedeemPointsCap,
  firstReservationBonus: env.loyaltyFirstReservationBonus,
  checkInBonus: env.loyaltyCheckInBonus,
});
