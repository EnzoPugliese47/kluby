import type { Request, Response, NextFunction } from "express";
import { Prisma } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../utils/appError";
import { sendSuccess } from "../utils/apiResponse";
import { assertUserCanAccessClub } from "../utils/clubAccess";
import {
  asRecord,
  optionalNumber,
  optionalString,
  requireParam,
} from "../utils/validation";
import { sortTablesBySectorAndNumber } from "../utils/tables";

/** GET /api/clubs/:clubId/template — configuración base del boliche. */
export const getClubTemplate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const clubId = requireParam(req.params, "clubId");
    if (req.user !== undefined) {
      await assertUserCanAccessClub(req, clubId);
    }

    const club = await prisma.club.findUnique({
      where: { id: clubId },
      select: {
        id: true,
        name: true,
        musicGenre: true,
        floorMapUrl: true,
        defaultConsumptionPercent: true,
      },
    });
    if (club === null) {
      throw new AppError("Boliche no encontrado", 404);
    }

    const [products, tables] = await Promise.all([
      prisma.product.findMany({
        where: { clubId, eventId: null, isActive: true },
        orderBy: [{ category: "asc" }, { name: "asc" }],
      }),
      prisma.clubTable.findMany({
        where: { clubId, eventId: null, isActive: true },
        orderBy: { label: "asc" },
      }),
    ]);

    sendSuccess(res, {
      ...club,
      products,
      tables: sortTablesBySectorAndNumber(tables),
      productCount: products.length,
      tableCount: tables.length,
    });
  } catch (error) {
    next(error);
  }
};

/** PATCH /api/clubs/:clubId/template — plano, género y % consumición base. */
export const updateClubTemplate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const clubId = requireParam(req.params, "clubId");
    await assertUserCanAccessClub(req, clubId);
    const body = asRecord(req.body);

    const data: Prisma.ClubUpdateInput = {};
    const floorMapUrl = optionalString(body, "floorMapUrl");
    const musicGenre = optionalString(body, "musicGenre");
    const defaultConsumptionPercent = optionalNumber(
      body,
      "defaultConsumptionPercent"
    );

    if (floorMapUrl !== undefined) data.floorMapUrl = floorMapUrl;
    if (musicGenre !== undefined) data.musicGenre = musicGenre;
    if (defaultConsumptionPercent !== undefined) {
      if (
        defaultConsumptionPercent < 1 ||
        defaultConsumptionPercent > 100
      ) {
        throw new AppError(
          "El porcentaje de consumicion default debe estar entre 1 y 100",
          400
        );
      }
      data.defaultConsumptionPercent = Math.round(defaultConsumptionPercent);
    }

    if (Object.keys(data).length === 0) {
      throw new AppError("No se enviaron campos para actualizar", 400);
    }

    const club = await prisma.club.update({ where: { id: clubId }, data });
    sendSuccess(res, club);
  } catch (error) {
    next(error);
  }
};
