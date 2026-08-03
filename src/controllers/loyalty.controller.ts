import type { Request, Response, NextFunction } from "express";
import { LoyaltyTxType, Prisma } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../utils/appError";
import { sendSuccess } from "../utils/apiResponse";
import { getAuthUser } from "../middlewares/auth";
import { assertClubStaffCanAccessClub } from "../utils/clubAccess";
import {
  computeBalances,
  computeDiscountValue,
  loyaltyRulesPayload,
  validateRedeemPoints,
} from "../utils/loyalty";
import {
  asRecord,
  requireNumber,
  requireParam,
  requireString,
} from "../utils/validation";

/** GET /api/loyalty/config — reglas publicas del programa. */
export const getLoyaltyConfig = (
  _req: Request,
  res: Response
): void => {
  sendSuccess(res, loyaltyRulesPayload());
};

/** GET /api/loyalty/clubs/:clubId/balance — saldo del usuario autenticado en un boliche. */
export const getClubBalance = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const clubId = requireParam(req.params, "clubId");
    const auth = getAuthUser(req);

    const club = await prisma.club.findUnique({
      where: { id: clubId },
      select: { id: true, name: true, pointValue: true },
    });
    if (club === null) throw new AppError("Boliche no encontrado", 404);

    const txns = await prisma.loyaltyTransaction.findMany({
      where: { userId: auth.sub, clubId },
      select: { clubId: true, type: true, points: true },
    });
    const balance = computeBalances(txns).get(clubId) ?? 0;

    sendSuccess(res, {
      clubId,
      clubName: club.name,
      balance,
      pointValue: club.pointValue,
      rules: loyaltyRulesPayload(),
    });
  } catch (error) {
    next(error);
  }
};

/** GET /api/loyalty/users/:userId — saldo e historial de Kluby Points. */
export const getUserLoyalty = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = requireParam(req.params, "userId");
    const auth = getAuthUser(req);
    if (auth.sub !== userId && auth.role !== "SUPER_ADMIN") {
      throw new AppError("No autorizado para ver estos puntos", 403);
    }

    const transactions = await prisma.loyaltyTransaction.findMany({
      where: { userId },
      include: { club: { select: { id: true, name: true, pointValue: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const balances = computeBalances(transactions);
    const balanceByClub = Array.from(balances.entries())
      .filter(([, balance]) => balance > 0)
      .map(([clubId, balance]) => {
        const club = transactions.find((t) => t.clubId === clubId)?.club;
        const pointValue = club?.pointValue ?? new Prisma.Decimal(1);
        return {
          clubId,
          clubName: club?.name ?? "Boliche",
          balance,
          pointValue,
          redeemValue: Number(pointValue) * balance,
        };
      })
      .sort((a, b) => b.balance - a.balance);

    sendSuccess(res, {
      rules: loyaltyRulesPayload(),
      balanceByClub,
      transactions,
    });
  } catch (error) {
    next(error);
  }
};

/** GET /api/loyalty/clubs/:clubId/stats — resumen para panel del boliche. */
export const getClubLoyaltyStats = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const clubId = requireParam(req.params, "clubId");
    await assertClubStaffCanAccessClub(req, clubId);

    const club = await prisma.club.findUnique({
      where: { id: clubId },
      select: { pointValue: true },
    });
    if (club === null) throw new AppError("Boliche no encontrado", 404);

    const txns = await prisma.loyaltyTransaction.findMany({
      where: { clubId },
      select: { userId: true, type: true, points: true },
    });

    let totalEarned = 0;
    let totalRedeemed = 0;
    const userBalances = new Map<string, number>();
    for (const tx of txns) {
      const delta =
        tx.type === LoyaltyTxType.EARNED ? tx.points : -tx.points;
      userBalances.set(tx.userId, (userBalances.get(tx.userId) ?? 0) + delta);
      if (tx.type === LoyaltyTxType.EARNED) totalEarned += tx.points;
      else totalRedeemed += tx.points;
    }
    const activeBalance = Array.from(userBalances.values()).reduce(
      (sum, b) => sum + Math.max(0, b),
      0
    );
    const membersWithPoints = Array.from(userBalances.values()).filter(
      (b) => b > 0
    ).length;

    sendSuccess(res, {
      pointValue: club.pointValue,
      rules: loyaltyRulesPayload(),
      totalEarned,
      totalRedeemed,
      activeBalance,
      membersWithPoints,
      liabilityEstimate: Number(club.pointValue) * activeBalance,
    });
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
    const auth = getAuthUser(req);
    if (auth.sub !== userId && auth.role !== "SUPER_ADMIN") {
      throw new AppError("No autorizado", 403);
    }

    const result = await prisma.$transaction(async (tx) => {
      const club = await tx.club.findUnique({ where: { id: clubId } });
      if (club === null) throw new AppError("Boliche no encontrado", 404);

      const txns = await tx.loyaltyTransaction.findMany({
        where: { userId, clubId },
        select: { clubId: true, type: true, points: true },
      });
      const balance = computeBalances(txns).get(clubId) ?? 0;
      validateRedeemPoints(
        points,
        balance,
        new Prisma.Decimal(Number.MAX_SAFE_INTEGER),
        club.pointValue
      );

      await tx.loyaltyTransaction.create({
        data: {
          userId,
          clubId,
          type: LoyaltyTxType.REDEEMED,
          points,
          description: "Canje de puntos por descuento",
        },
      });

      const discountValue = computeDiscountValue(points, club.pointValue);
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
