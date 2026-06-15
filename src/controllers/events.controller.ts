import type { Request, Response, NextFunction } from "express";
import {
  Prisma,
  PaymentOption,
  ReservationMode,
  ReservationStatus,
} from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../utils/appError";
import { sendSuccess } from "../utils/apiResponse";
import { computeDeposit, occupyingReservationFilter } from "../utils/reservation";
import { DEFAULT_MAP_HEIGHT, DEFAULT_MAP_WIDTH } from "../utils/mapCanvas";
import { sortTablesBySectorAndNumber } from "../utils/tables";
import {
  asRecord,
  optionalString,
  requireParam,
  requireString,
} from "../utils/validation";

const PAYMENT_OPTION_VALUES = Object.values(PaymentOption);

/** POST /api/clubs/:clubId/events - Alta de fecha/evento. */
export const createEvent = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const clubId = requireParam(req.params, "clubId");
    const body = asRecord(req.body);
    const name = requireString(body, "name");
    const dateRaw = requireString(body, "date");
    const musicGenre = optionalString(body, "musicGenre");
    const backgroundImage = optionalString(body, "backgroundImage");

    const date = new Date(dateRaw);
    if (Number.isNaN(date.getTime())) {
      throw new AppError("El campo 'date' no es una fecha valida", 400);
    }

    const club = await prisma.club.findUnique({ where: { id: clubId } });
    if (club === null) {
      throw new AppError("Boliche no encontrado", 404);
    }

    const event = await prisma.eventNight.create({
      data: {
        clubId,
        name,
        date,
        musicGenre: musicGenre ?? null,
        backgroundImage: backgroundImage ?? null,
      },
    });
    sendSuccess(res, event, 201);
  } catch (error) {
    next(error);
  }
};

/** PATCH /api/events/:eventId - Edicion de fecha/evento (staff/admin). */
export const updateEvent = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const eventId = requireParam(req.params, "eventId");
    const body = asRecord(req.body);

    const data: Prisma.EventNightUpdateInput = {};
    const name = optionalString(body, "name");
    const dateRaw = optionalString(body, "date");
    const musicGenre = optionalString(body, "musicGenre");
    const backgroundImage = optionalString(body, "backgroundImage");
    if (name !== undefined) data.name = name;
    if (musicGenre !== undefined) data.musicGenre = musicGenre;
    if (backgroundImage !== undefined) data.backgroundImage = backgroundImage;
    if (typeof body["isActive"] === "boolean") data.isActive = body["isActive"];
    if (dateRaw !== undefined) {
      const date = new Date(dateRaw);
      if (Number.isNaN(date.getTime())) {
        throw new AppError("El campo 'date' no es una fecha valida", 400);
      }
      data.date = date;
    }

    if (Object.keys(data).length === 0) {
      throw new AppError("No se enviaron campos para actualizar", 400);
    }

    const existing = await prisma.eventNight.findUnique({ where: { id: eventId } });
    if (existing === null) {
      throw new AppError("Evento no encontrado", 404);
    }

    const event = await prisma.eventNight.update({ where: { id: eventId }, data });
    sendSuccess(res, event);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/events/:eventId/assign - El staff/admin asigna manualmente una
 * mesa a un usuario, creando una reserva CONFIRMED (cobro en el local).
 */
export const assignTableToUser = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const eventId = requireParam(req.params, "eventId");
    const body = asRecord(req.body);
    const tableId = requireString(body, "tableId");
    const userId = requireString(body, "userId");
    const paymentOption =
      body["paymentOption"] !== undefined
        ? (body["paymentOption"] as PaymentOption)
        : PaymentOption.DEPOSIT_ONLY;
    if (!PAYMENT_OPTION_VALUES.includes(paymentOption)) {
      throw new AppError("paymentOption invalido", 400);
    }

    const reservationId = await prisma.$transaction(
      async (tx) => {
        const table = await tx.clubTable.findUnique({ where: { id: tableId } });
        if (table === null || !table.isActive) {
          throw new AppError("Mesa no encontrada o inactiva", 404);
        }
        if (table.eventId !== eventId) {
          throw new AppError("La mesa no pertenece a este evento", 400);
        }
        const event = await tx.eventNight.findUnique({ where: { id: eventId } });
        if (event === null || !event.isActive) {
          throw new AppError("Evento no encontrado o inactivo", 404);
        }
        if (event.clubId !== table.clubId) {
          throw new AppError("La mesa no pertenece al boliche del evento", 400);
        }
        const user = await tx.user.findUnique({ where: { id: userId } });
        if (user === null || !user.isActive) {
          throw new AppError("Usuario no encontrado o inactivo", 404);
        }

        const now = new Date();
        await tx.reservation.updateMany({
          where: {
            tableId,
            eventId,
            status: ReservationStatus.PENDING_PAYMENT,
            expiresAt: { lte: now },
          },
          data: { status: ReservationStatus.EXPIRED },
        });
        const collision = await tx.reservation.findFirst({
          where: { tableId, eventId, ...occupyingReservationFilter(now) },
        });
        if (collision !== null) {
          throw new AppError("La mesa ya esta ocupada para este evento", 409);
        }

        const totalAmount = new Prisma.Decimal(table.price);
        const created = await tx.reservation.create({
          data: {
            clubId: table.clubId,
            eventId,
            tableId,
            hostId: userId,
            mode: ReservationMode.STANDARD,
            paymentOption,
            status: ReservationStatus.CONFIRMED,
            totalAmount,
            depositAmount: computeDeposit(totalAmount, table.depositPercent),
            amountPaid: new Prisma.Decimal(0),
            confirmedAt: now,
            expiresAt: now,
          },
        });
        return created.id;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

    const reservation = await prisma.reservation.findUniqueOrThrow({
      where: { id: reservationId },
      include: {
        table: true,
        host: { select: { id: true, fullName: true, email: true, phone: true } },
      },
    });
    sendSuccess(res, reservation, 201);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/events/:eventId/release - El staff/admin libera una mesa,
 * cancelando la reserva que la ocupa para el evento.
 */
export const releaseTable = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const eventId = requireParam(req.params, "eventId");
    const body = asRecord(req.body);
    const tableId = requireString(body, "tableId");

    const occupying = await prisma.reservation.findFirst({
      where: { tableId, eventId, ...occupyingReservationFilter() },
      orderBy: { createdAt: "desc" },
    });
    if (occupying === null) {
      throw new AppError("La mesa no tiene una reserva activa para liberar", 404);
    }

    const reservation = await prisma.reservation.update({
      where: { id: occupying.id },
      data: { status: ReservationStatus.CANCELLED, cancelledAt: new Date() },
    });
    sendSuccess(res, reservation);
  } catch (error) {
    next(error);
  }
};

/** DELETE /api/events/:eventId - Elimina un evento y sus mesas (sin reservas activas). */
export const deleteEvent = async (
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

    const activeReservations = await prisma.reservation.count({
      where: { eventId, ...occupyingReservationFilter() },
    });
    if (activeReservations > 0) {
      throw new AppError(
        "No se puede eliminar: el evento tiene reservas activas",
        400
      );
    }

    await prisma.$transaction([
      prisma.clubTable.deleteMany({ where: { eventId } }),
      prisma.eventNight.delete({ where: { id: eventId } }),
    ]);
    sendSuccess(res, { deleted: true, id: eventId });
  } catch (error) {
    next(error);
  }
};

/** GET /api/clubs/:clubId/events */
export const listEventsByClub = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const clubId = requireParam(req.params, "clubId");
    const events = await prisma.eventNight.findMany({
      where: { clubId, isActive: true },
      orderBy: { date: "asc" },
    });
    sendSuccess(res, events);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/events/:eventId/availability
 * Renderiza el mapa: devuelve cada mesa del boliche con su estado
 * (AVAILABLE / RESERVED) para el evento indicado (Consulta de Disponibilidad).
 */
export const getEventAvailability = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const eventId = requireParam(req.params, "eventId");

    const event = await prisma.eventNight.findUnique({
      where: { id: eventId },
    });
    if (event === null) {
      throw new AppError("Evento no encontrado", 404);
    }

    const [tables, activeReservations] = await Promise.all([
      prisma.clubTable.findMany({
        where: { eventId, isActive: true },
      }),
      prisma.reservation.findMany({
        where: { eventId, ...occupyingReservationFilter() },
        select: {
          id: true,
          tableId: true,
          status: true,
          mode: true,
          host: { select: { id: true, fullName: true, email: true, phone: true } },
        },
      }),
    ]);

    const reservationByTable = new Map(
      activeReservations.map((r) => [r.tableId, r])
    );

    const sortedTables = sortTablesBySectorAndNumber(tables);

    const map = sortedTables.map((table) => {
      const reservation = reservationByTable.get(table.id);
      return {
        id: table.id,
        label: table.label,
        sector: table.sector,
        capacity: table.capacity,
        price: table.price,
        depositPercent: table.depositPercent,
        posX: table.posX,
        posY: table.posY,
        status: reservation ? "RESERVED" : "AVAILABLE",
        reservation: reservation ?? null,
      };
    });

    sendSuccess(res, {
      event,
      tables: map,
      mapWidth: DEFAULT_MAP_WIDTH,
      mapHeight: DEFAULT_MAP_HEIGHT,
    });
  } catch (error) {
    next(error);
  }
};
