import type { Request, Response, NextFunction } from "express";
import { Prisma } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../utils/appError";
import { sendSuccess } from "../utils/apiResponse";
import { occupyingReservationFilter } from "../utils/reservation";
import {
  minConsumptionFromPercent,
  normalizeConsumptionPercent,
} from "../utils/tableConsumption";
import { tableNumberFromLabel } from "../utils/tables";
import {
  asRecord,
  optionalNumber,
  optionalString,
  requireNumber,
  requireParam,
  requireString,
} from "../utils/validation";

const parseConsumptionPercent = (
  raw: number | undefined,
  fallback: number
): number => {
  const value = raw ?? fallback;
  try {
    return normalizeConsumptionPercent(value);
  } catch {
    throw new AppError("El porcentaje de consumicion debe estar entre 1 y 100", 400);
  }
};

const resolveEventDefaults = async (
  eventId: string,
  clubId: string
): Promise<{ defaultConsumptionPercent: number }> => {
  const event = await prisma.eventNight.findUnique({ where: { id: eventId } });
  if (event === null || event.clubId !== clubId) {
    throw new AppError("El evento no pertenece a este boliche", 400);
  }
  return { defaultConsumptionPercent: event.defaultConsumptionPercent };
};

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
    const depositPercent = optionalNumber(body, "depositPercent");
    const eventId = optionalString(body, "eventId");
    const consumptionPercentRaw = optionalNumber(body, "consumptionPercent");

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

    let eventDefault = 100;
    if (eventId !== undefined) {
      const defs = await resolveEventDefaults(eventId, clubId);
      eventDefault = defs.defaultConsumptionPercent;
    } else {
      eventDefault = club.defaultConsumptionPercent;
    }

    const consumptionPercent = parseConsumptionPercent(
      consumptionPercentRaw,
      eventDefault
    );

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
        consumptionPercent,
        minConsumption: minConsumptionFromPercent(price, consumptionPercent),
        ...(depositPercent !== undefined ? { depositPercent } : {}),
      },
    });
    sendSuccess(res, table, 201);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/events/:eventId/tables/bulk
 * Crea varias mesas de un sector de una (ej. 10 mesas en "VIP Pista").
 */
export const bulkCreateTablesForEvent = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const eventId = requireParam(req.params, "eventId");
    const body = asRecord(req.body);

    const sector = requireString(body, "sector");
    const count = requireNumber(body, "count");
    const capacity = requireNumber(body, "capacity");
    const price = requireNumber(body, "price");
    const depositPercent = optionalNumber(body, "depositPercent") ?? 10;
    const consumptionPercentRaw = optionalNumber(body, "consumptionPercent");

    if (count < 1 || count > 50) {
      throw new AppError("La cantidad de mesas debe estar entre 1 y 50", 400);
    }
    if (capacity <= 0) {
      throw new AppError("La capacidad debe ser mayor a cero", 400);
    }
    if (price < 0) {
      throw new AppError("El precio no puede ser negativo", 400);
    }
    if (depositPercent <= 0 || depositPercent > 100) {
      throw new AppError("El porcentaje de sena debe estar entre 1 y 100", 400);
    }

    const event = await prisma.eventNight.findUnique({ where: { id: eventId } });
    if (event === null) {
      throw new AppError("Evento no encontrado", 404);
    }

    const consumptionPercent = parseConsumptionPercent(
      consumptionPercentRaw,
      event.defaultConsumptionPercent
    );
    const minConsumption = minConsumptionFromPercent(price, consumptionPercent);

    const existing = await prisma.clubTable.findMany({
      where: { eventId, isActive: true },
      select: { label: true, sector: true },
    });

    let nextNum = existing.reduce(
      (max, t) => Math.max(max, tableNumberFromLabel(t.label)),
      0
    );

    const sectors = [
      ...new Set(existing.map((t) => t.sector).filter(Boolean) as string[]),
    ];
    const sectorIndex = sectors.includes(sector)
      ? sectors.indexOf(sector)
      : sectors.length;

    const cols = Math.min(5, count);
    const baseY = 12 + (sectorIndex % 4) * 18;
    const baseX = 14;

    const tables = await prisma.$transaction(async (tx) => {
      const created = [];
      for (let i = 0; i < count; i++) {
        nextNum += 1;
        const col = i % cols;
        const row = Math.floor(i / cols);
        const table = await tx.clubTable.create({
          data: {
            clubId: event.clubId,
            eventId,
            label: `Mesa ${nextNum}`,
            sector,
            capacity,
            price: new Prisma.Decimal(price),
            consumptionPercent,
            minConsumption,
            depositPercent,
            posX: Math.min(92, baseX + col * 14),
            posY: Math.min(92, baseY + row * 9),
          },
        });
        created.push(table);
      }
      return created;
    });

    sendSuccess(res, { sector, count: tables.length, tables }, 201);
  } catch (error) {
    next(error);
  }
};

/** POST /api/clubs/:clubId/template/tables/bulk — mesas base del boliche. */
export const bulkCreateTemplateTables = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const clubId = requireParam(req.params, "clubId");
    const body = asRecord(req.body);

    const sector = requireString(body, "sector");
    const count = requireNumber(body, "count");
    const capacity = requireNumber(body, "capacity");
    const price = requireNumber(body, "price");
    const depositPercent = optionalNumber(body, "depositPercent") ?? 10;
    const consumptionPercentRaw = optionalNumber(body, "consumptionPercent");

    if (count < 1 || count > 50) {
      throw new AppError("La cantidad de mesas debe estar entre 1 y 50", 400);
    }
    if (capacity <= 0) {
      throw new AppError("La capacidad debe ser mayor a cero", 400);
    }
    if (price < 0) {
      throw new AppError("El precio no puede ser negativo", 400);
    }
    if (depositPercent <= 0 || depositPercent > 100) {
      throw new AppError("El porcentaje de sena debe estar entre 1 y 100", 400);
    }

    const club = await prisma.club.findUnique({ where: { id: clubId } });
    if (club === null) {
      throw new AppError("Boliche no encontrado", 404);
    }

    const consumptionPercent = parseConsumptionPercent(
      consumptionPercentRaw,
      club.defaultConsumptionPercent
    );
    const minConsumption = minConsumptionFromPercent(price, consumptionPercent);

    const existing = await prisma.clubTable.findMany({
      where: { clubId, eventId: null, isActive: true },
      select: { label: true, sector: true },
    });

    let nextNum = existing.reduce(
      (max, t) => Math.max(max, tableNumberFromLabel(t.label)),
      0
    );

    const sectors = [
      ...new Set(existing.map((t) => t.sector).filter(Boolean) as string[]),
    ];
    const sectorIndex = sectors.includes(sector)
      ? sectors.indexOf(sector)
      : sectors.length;

    const cols = Math.min(5, count);
    const baseY = 12 + (sectorIndex % 4) * 18;
    const baseX = 14;

    const tables = await prisma.$transaction(async (tx) => {
      const created = [];
      for (let i = 0; i < count; i++) {
        nextNum += 1;
        const col = i % cols;
        const row = Math.floor(i / cols);
        const table = await tx.clubTable.create({
          data: {
            clubId,
            eventId: null,
            label: `Mesa ${nextNum}`,
            sector,
            capacity,
            price: new Prisma.Decimal(price),
            consumptionPercent,
            minConsumption,
            depositPercent,
            posX: Math.min(92, baseX + col * 14),
            posY: Math.min(92, baseY + row * 9),
          },
        });
        created.push(table);
      }
      return created;
    });

    sendSuccess(res, { sector, count: tables.length, tables }, 201);
  } catch (error) {
    next(error);
  }
};

/** GET /api/clubs/:clubId/tables — ?template=1 solo mesas base (sin evento). */
export const listTablesByClub = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const clubId = requireParam(req.params, "clubId");
    const templateOnly =
      req.query.template === "1" || req.query.template === "true";
    const tables = await prisma.clubTable.findMany({
      where: {
        clubId,
        isActive: true,
        ...(templateOnly ? { eventId: null } : {}),
      },
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

    const current = await prisma.clubTable.findUnique({ where: { id } });
    if (current === null) {
      throw new AppError("Mesa no encontrada", 404);
    }

    const data: Prisma.ClubTableUpdateInput = {};
    const label = optionalString(body, "label");
    const sector = optionalString(body, "sector");
    const capacity = optionalNumber(body, "capacity");
    const price = optionalNumber(body, "price");
    const consumptionPercentRaw = optionalNumber(body, "consumptionPercent");
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
    if (consumptionPercentRaw !== undefined) {
      data.consumptionPercent = parseConsumptionPercent(
        consumptionPercentRaw,
        current.consumptionPercent
      );
    }
    if (depositPercent !== undefined) {
      if (depositPercent <= 0 || depositPercent > 100) {
        throw new AppError("El porcentaje de sena debe estar entre 1 y 100", 400);
      }
      data.depositPercent = depositPercent;
    }
    if (posX !== undefined) data.posX = posX;
    if (posY !== undefined) data.posY = posY;

    const nextPrice =
      price !== undefined ? price : Number(current.price);
    const nextPercent =
      consumptionPercentRaw !== undefined
        ? parseConsumptionPercent(consumptionPercentRaw, current.consumptionPercent)
        : current.consumptionPercent;

    if (price !== undefined || consumptionPercentRaw !== undefined) {
      data.minConsumption = minConsumptionFromPercent(nextPrice, nextPercent);
      if (consumptionPercentRaw !== undefined) {
        data.consumptionPercent = nextPercent;
      }
    }

    if (Object.keys(data).length === 0) {
      throw new AppError("No se enviaron campos para actualizar", 400);
    }

    const table = await prisma.clubTable.update({ where: { id }, data });
    sendSuccess(res, table);
  } catch (error) {
    next(error);
  }
};

/** DELETE /api/clubs/:clubId/template/tables - Baja todas las mesas base. */
export const deleteAllTemplateTables = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const clubId = requireParam(req.params, "clubId");

    const tables = await prisma.clubTable.findMany({
      where: { clubId, eventId: null, isActive: true },
      select: { id: true },
    });
    if (tables.length === 0) {
      sendSuccess(res, { deleted: 0 });
      return;
    }

    const tableIds = tables.map((t) => t.id);
    const activeReservations = await prisma.reservation.count({
      where: { tableId: { in: tableIds }, ...occupyingReservationFilter() },
    });
    if (activeReservations > 0) {
      throw new AppError(
        "No se pueden eliminar: hay reservas activas en estas mesas",
        400
      );
    }

    const result = await prisma.clubTable.updateMany({
      where: { id: { in: tableIds } },
      data: { isActive: false },
    });
    sendSuccess(res, { deleted: result.count });
  } catch (error) {
    next(error);
  }
};

/** DELETE /api/events/:eventId/tables - Baja todas las mesas del evento. */
export const deleteAllEventTables = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const eventId = requireParam(req.params, "eventId");

    const event = await prisma.eventNight.findUnique({ where: { id: eventId } });
    if (event === null) {
      throw new AppError("Evento no encontrado", 404);
    }

    const tables = await prisma.clubTable.findMany({
      where: { eventId, isActive: true },
      select: { id: true },
    });
    if (tables.length === 0) {
      sendSuccess(res, { deleted: 0 });
      return;
    }

    const tableIds = tables.map((t) => t.id);
    const activeReservations = await prisma.reservation.count({
      where: { tableId: { in: tableIds }, ...occupyingReservationFilter() },
    });
    if (activeReservations > 0) {
      throw new AppError(
        "No se pueden eliminar: hay reservas activas en estas mesas",
        400
      );
    }

    const result = await prisma.clubTable.updateMany({
      where: { id: { in: tableIds } },
      data: { isActive: false },
    });
    sendSuccess(res, { deleted: result.count });
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
