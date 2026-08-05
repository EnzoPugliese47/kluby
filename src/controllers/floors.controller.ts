import type { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";
import { AppError } from "../utils/appError";
import { sendSuccess } from "../utils/apiResponse";
import { occupyingReservationFilter } from "../utils/reservation";
import {
  createEventFloorRecord,
  ensureEventFloors,
  MAX_EVENT_FLOORS,
  syncEventBackgroundFromFloor1,
} from "../utils/eventFloors";
import {
  asRecord,
  optionalString,
  requireParam,
} from "../utils/validation";

/** POST /api/events/:eventId/floors — agrega un piso (máx. 3). */
export const createEventFloor = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const eventId = requireParam(req.params, "eventId");
    const body = asRecord(req.body);
    const name = optionalString(body, "name");
    const backgroundImage = optionalString(body, "backgroundImage");

    const event = await prisma.eventNight.findUnique({ where: { id: eventId } });
    if (event === null) {
      throw new AppError("Evento no encontrado", 404);
    }

    const floor = await createEventFloorRecord(eventId, {
      name: name ?? undefined,
      backgroundImage: backgroundImage ?? null,
    });

    sendSuccess(res, floor, 201);
  } catch (error) {
    next(error);
  }
};

/** PATCH /api/events/:eventId/floors/:floorId — nombre o plano del piso. */
export const updateEventFloor = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const eventId = requireParam(req.params, "eventId");
    const floorId = requireParam(req.params, "floorId");
    const body = asRecord(req.body);

    const floor = await prisma.eventFloor.findFirst({
      where: { id: floorId, eventId },
    });
    if (floor === null) {
      throw new AppError("Piso no encontrado", 404);
    }

    const data: { name?: string; backgroundImage?: string | null } = {};
    const name = optionalString(body, "name");
    const backgroundImage = optionalString(body, "backgroundImage");

    if (name !== undefined) data.name = name.trim() || floor.name;
    if (body["backgroundImage"] === null) {
      data.backgroundImage = null;
    } else if (backgroundImage !== undefined) {
      data.backgroundImage = backgroundImage;
    }

    if (Object.keys(data).length === 0) {
      throw new AppError("No se enviaron campos para actualizar", 400);
    }

    const updated = await prisma.eventFloor.update({
      where: { id: floorId },
      data,
    });

    if (floor.floorIndex === 1) {
      await syncEventBackgroundFromFloor1(eventId);
    }

    sendSuccess(res, updated);
  } catch (error) {
    next(error);
  }
};

/** DELETE /api/events/:eventId/floors/:floorId — elimina piso extra (no el piso 1). */
export const deleteEventFloor = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const eventId = requireParam(req.params, "eventId");
    const floorId = requireParam(req.params, "floorId");

    const floor = await prisma.eventFloor.findFirst({
      where: { id: floorId, eventId },
    });
    if (floor === null) {
      throw new AppError("Piso no encontrado", 404);
    }
    if (floor.floorIndex === 1) {
      throw new AppError("No se puede eliminar el piso principal", 400);
    }

    const tableIds = (
      await prisma.clubTable.findMany({
        where: { floorId, isActive: true },
        select: { id: true },
      })
    ).map((t) => t.id);

    if (tableIds.length > 0) {
      const activeReservations = await prisma.reservation.count({
        where: { tableId: { in: tableIds }, ...occupyingReservationFilter() },
      });
      if (activeReservations > 0) {
        throw new AppError(
          "No se puede eliminar: hay reservas activas en mesas de este piso",
          400
        );
      }
      await prisma.clubTable.updateMany({
        where: { id: { in: tableIds } },
        data: { isActive: false },
      });
    }

    await prisma.eventFloor.delete({ where: { id: floorId } });

    sendSuccess(res, { deleted: true });
  } catch (error) {
    next(error);
  }
};

/** GET /api/events/:eventId/floors */
export const listEventFloors = async (
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
    const floors = await ensureEventFloors(eventId);
    sendSuccess(res, { floors, maxFloors: MAX_EVENT_FLOORS });
  } catch (error) {
    next(error);
  }
};
