import type { Request, Response, NextFunction } from "express";
import { ClubPlan } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../utils/appError";
import { sendSuccess } from "../utils/apiResponse";
import { assertUserCanAccessClub } from "../utils/clubAccess";
import { requireParam } from "../utils/validation";
import {
  CLUB_PLAN_CATALOG,
  PREMIUM_MONTHLY_PRICE_ARS,
  PLAN_LABELS,
  parseClubPlan,
} from "../utils/clubPlan";

/** GET /api/plans — Catálogo público de planes para dueños de boliche. */
export const listPlans = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    sendSuccess(res, {
      plans: CLUB_PLAN_CATALOG,
      premiumMonthlyPrice: PREMIUM_MONTHLY_PRICE_ARS,
      currency: "ARS",
    });
  } catch (error) {
    next(error);
  }
};

/** PATCH /api/clubs/:clubId/plan — Cambia el plan del boliche (demo / gestión manual). */
export const updateClubPlan = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const clubId = requireParam(req.params, "clubId");
    await assertUserCanAccessClub(req, clubId);

    const body = req.body as Record<string, unknown>;
    const plan = parseClubPlan(body["plan"]);

    const club = await prisma.club.findUnique({ where: { id: clubId } });
    if (club === null || !club.isActive) {
      throw new AppError("Boliche no encontrado", 404);
    }

    if (club.plan === plan) {
      sendSuccess(res, club);
      return;
    }

    const now = new Date();
    const planExpiresAt =
      plan === ClubPlan.PREMIUM
        ? new Date(now.getFullYear(), now.getMonth() + 1, now.getDate())
        : null;

    const updated = await prisma.club.update({
      where: { id: clubId },
      data: {
        plan,
        planStartedAt: now,
        planExpiresAt,
      },
    });

    sendSuccess(res, {
      ...updated,
      planLabel: PLAN_LABELS[updated.plan],
    });
  } catch (error) {
    next(error);
  }
};
