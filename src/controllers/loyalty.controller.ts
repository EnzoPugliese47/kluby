import type { Request, Response, NextFunction } from "express";
import { LoyaltyTxType, Prisma } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../utils/appError";
import { sendSuccess } from "../utils/apiResponse";
import { asRecord, requireNumber, requireParam, requireString } from "../utils/validation";

/**
 * Calcula el saldo de puntos por boliche para un usuario:
 *   saldo = sum(EARNED) - sum(REDEEMED)
 */
const computeBalances = (
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

/** GET /api/loyalty/users/:userId - Saldo e historial de Kluby Points. */
export const getUserLoyalty = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = requireParam(req.params, "userId");

    const transactions = await prisma.loyaltyTransaction.findMany({
      where: { userId },
      include: { club: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });

    const balances = computeBalances(transactions);
    const balanceByClub = Array.from(balances.entries()).map(
      ([clubId, balance]) => ({ clubId, balance })
    );

    sendSuccess(res, { balanceByClub, transactions });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/loyalty/redeem - Canje de puntos por descuento (RN18).
 * Body: { userId, clubId, points }
 */
export const redeemPoints = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const body = asRecord(req.body);
    const userId = requireString(body, "userId");
    const clubId = requireString(body, "clubId");
    const points = requireNumber(body, "points");

    if (!Number.isInteger(points) || points <= 0) {
      throw new AppError("Los puntos a canjear deben ser un entero > 0", 400);
    }

    const result = await prisma.$transaction(async (tx) => {
      const club = await tx.club.findUnique({ where: { id: clubId } });
      if (club === null) throw new AppError("Boliche no encontrado", 404);

      const txns = await tx.loyaltyTransaction.findMany({
        where: { userId, clubId },
        select: { clubId: true, type: true, points: true },
      });
      const balance = computeBalances(txns).get(clubId) ?? 0;
      if (balance < points) {
        throw new AppError(
          `Saldo insuficiente: tenes ${balance} puntos en este boliche`,
          400
        );
      }

      await tx.loyaltyTransaction.create({
        data: {
          userId,
          clubId,
          type: LoyaltyTxType.REDEEMED,
          points,
          description: "Canje de puntos por descuento",
        },
      });

      const discountValue = new Prisma.Decimal(club.pointValue).mul(points);
      return {
        redeemedPoints: points,
        discountValue,
        remainingBalance: balance - points,
      };
    });

    sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
};
