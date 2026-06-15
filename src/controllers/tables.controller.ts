import type { Request, Response, NextFunction } from "express";
import { Prisma } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../utils/appError";
import { sendSuccess } from "../utils/apiResponse";
import {
  asRecord,
  optionalNumber,
  optionalString,
  requireNumber,
  requireParam,
  requireString,
} from "../utils/validation";

/** POST /api/clubs/:clubId/tables - Alta de mesa con coordenadas del mapa 2D. */
export const createTable = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const clubId = requireParam(req.params, "clubId");
    const body = asRecord(req.body);

    const label = requireString(body, "label");
    const capacity = requireNumber(body, "capacity");
    const price = requireNumber(body, "price");
    const posX = requireNumber(body, "posX");
    const posY = requireNumber(body, "posY");
    const sector = optionalString(body, "sector");
    const minConsumption = optionalNumber(body, "minConsumption");
    const depositPercent = optionalNumber(body, "depositPercent");
    const eventId = optionalString(body, "eventId");

    if (capacity <= 0) {
      throw new AppError("La capacidad debe ser mayor a cero", 400);
    }
    if (price < 0) {
      throw new AppError("El precio no puede ser negativo", 400);
    }
    if (
      depositPercent !== undefined &&
      (depositPercent <= 0 || depositPercent > 100)
    ) {
      throw new AppError("El porcentaje de sena debe estar entre 1 y 100", 400);
    }

    const club = await prisma.club.findUnique({ where: { id: clubId } });
    if (club === null) {
      throw new AppError("Boliche no encontrado", 404);
    }

    if (eventId !== undefined) {
      const event = await prisma.eventNight.findUnique({ where: { id: eventId } });
      if (event === null || event.clubId !== clubId) {
        throw new AppError("El evento no pertenece a este boliche", 400);
      }
    }

    const table = await prisma.clubTable.create({
      data: {
        clubId,
        eventId: eventId ?? null,
        label,
        capacity,
        posX,
        posY,
        sector: sector ?? null,
        price: new Prisma.Decimal(price),
        minConsumption:
          minConsumption !== undefined
            ? new Prisma.Decimal(minConsumption)
            : null,
        ...(depositPercent !== undefined ? { depositPercent } : {}),
      },
    });
    sendSuccess(res, table, 201);
  } catch (error) {
    next(error);
  }
};

/** GET /api/clubs/:clubId/tables */
export const listTablesByClub = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const clubId = requireParam(req.params, "clubId");
    const tables = await prisma.clubTable.findMany({
      where: { clubId, isActive: true },
      orderBy: { label: "asc" },
    });
    sendSuccess(res, tables);
  } catch (error) {
    next(error);
  }
};

/** PATCH /api/tables/:id - Edicion (incluye configuracion de precios). */
export const updateTable = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = requireParam(req.params, "id");
    const body = asRecord(req.body);

    const data: Prisma.ClubTableUpdateInput = {};
    const label = optionalString(body, "label");
    const sector = optionalString(body, "sector");
    const capacity = optionalNumber(body, "capacity");
    const price = optionalNumber(body, "price");
    const minConsumption = optionalNumber(body, "minConsumption");
    const depositPercent = optionalNumber(body, "depositPercent");
    const posX = optionalNumber(body, "posX");
    const posY = optionalNumber(body, "posY");

    if (label !== undefined) data.label = label;
    if (sector !== undefined) data.sector = sector;
    if (capacity !== undefined) {
      if (capacity <= 0) throw new AppError("La capacidad debe ser mayor a cero", 400);
      data.capacity = capacity;
    }
    if (price !== undefined) {
      if (price < 0) throw new AppError("El precio no puede ser negativo", 400);
      data.price = new Prisma.Decimal(price);
    }
    if (minConsumption !== undefined) {
      data.minConsumption = new Prisma.Decimal(minConsumption);
    }
    if (depositPercent !== undefined) {
      if (depositPercent <= 0 || depositPercent > 100) {
        throw new AppError("El porcentaje de sena debe estar entre 1 y 100", 400);
      }
      data.depositPercent = depositPercent;
    }
    if (posX !== undefined) data.posX = posX;
    if (posY !== undefined) data.posY = posY;

    if (Object.keys(data).length === 0) {
      throw new AppError("No se enviaron campos para actualizar", 400);
    }

    const table = await prisma.clubTable.update({ where: { id }, data });
    sendSuccess(res, table);
  } catch (error) {
    next(error);
  }
};

/** DELETE /api/tables/:id - Baja logica. */
export const deactivateTable = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = requireParam(req.params, "id");
    const table = await prisma.clubTable.update({
      where: { id },
      data: { isActive: false },
    });
    sendSuccess(res, table);
  } catch (error) {
    next(error);
  }
};
