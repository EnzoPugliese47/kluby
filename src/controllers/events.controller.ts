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
import { assertUserCanAccessClub } from "../utils/clubAccess";
import {
  asRecord,
  optionalNumber,
  optionalString,
  requireParam,
  requireString,
} from "../utils/validation";
import { openTablesEventCutoff, isEventPast } from "../utils/eventTiming";
import { copyEventLayoutFrom, type EventLayoutCopyResult } from "../utils/eventLayout";
import { applyClubDefaultsToEvent } from "../utils/clubDefaults";
import {
  applyDraftLayoutToEvent,
  parseDraftProducts,
  parseDraftTables,
} from "../utils/eventDraft";
import { parseClubZone } from "../utils/clubZones";
import { countAvailableTablesByEvent } from "../utils/tableAvailability";

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
    const flyerImageUrl = optionalString(body, "flyerImageUrl");
    const defaultConsumptionPercent = optionalNumber(body, "defaultConsumptionPercent");
    const copyFromEventId = optionalString(body, "copyFromEventId");
    const setupMode = optionalString(body, "setupMode");
    const useDraftLayout =
      body.useDraftLayout === true || body.useDraftLayout === "true";
    const draftTables = parseDraftTables(body["draftTables"]);
    const draftProducts = parseDraftProducts(body["draftProducts"]);

    const date = new Date(dateRaw);
    if (Number.isNaN(date.getTime())) {
      throw new AppError("El campo 'date' no es una fecha valida", 400);
    }
    if (
      defaultConsumptionPercent !== undefined &&
      (defaultConsumptionPercent < 1 || defaultConsumptionPercent > 100)
    ) {
      throw new AppError(
        "El porcentaje de consumicion default debe estar entre 1 y 100",
        400
      );
    }

    const club = await prisma.club.findUnique({ where: { id: clubId } });
    if (club === null) {
      throw new AppError("Boliche no encontrado", 404);
    }

    const usePast = Boolean(copyFromEventId) || setupMode === "past";
    const startEmpty = setupMode === "empty";

    let sourceEvent: Awaited<
      ReturnType<typeof prisma.eventNight.findUnique>
    > = null;
    if (usePast) {
      if (!copyFromEventId) {
        throw new AppError(
          "Elegí un evento pasado para copiar o usá otra opción de configuración",
          400
        );
      }
      sourceEvent = await prisma.eventNight.findUnique({
        where: { id: copyFromEventId },
      });
      if (
        sourceEvent === null ||
        sourceEvent.clubId !== clubId ||
        !sourceEvent.isActive
      ) {
        throw new AppError(
          "El evento origen no existe o no pertenece al mismo boliche",
          400
        );
      }
      if (!isEventPast(sourceEvent.date)) {
        throw new AppError(
          "Solo podés copiar de eventos ya finalizados",
          400
        );
      }
    }

    const resolvedBackground = useDraftLayout
      ? body["backgroundImage"] === null
        ? null
        : (backgroundImage ?? null)
      : backgroundImage ??
        (usePast && sourceEvent ? sourceEvent.backgroundImage : null) ??
        (startEmpty ? null : club.floorMapUrl) ??
        null;
    const backgroundCopiedAtCreate =
      !useDraftLayout &&
      Boolean(resolvedBackground) &&
      !backgroundImage &&
      Boolean(usePast ? sourceEvent?.backgroundImage : club.floorMapUrl);

    const resolvedGenre =
      useDraftLayout
        ? (musicGenre ?? null)
        : usePast && sourceEvent
          ? sourceEvent.musicGenre
          : startEmpty
            ? (musicGenre ?? null)
            : (musicGenre ?? club.musicGenre ?? null);

    const resolvedConsPct =
      useDraftLayout
        ? defaultConsumptionPercent !== undefined
          ? Math.round(defaultConsumptionPercent)
          : 100
        : usePast && sourceEvent
          ? sourceEvent.defaultConsumptionPercent
          : startEmpty
            ? defaultConsumptionPercent !== undefined
              ? Math.round(defaultConsumptionPercent)
              : 100
            : defaultConsumptionPercent !== undefined
              ? Math.round(defaultConsumptionPercent)
              : club.defaultConsumptionPercent;

    const event = await prisma.eventNight.create({
      data: {
        clubId,
        name,
        date,
        musicGenre: resolvedGenre,
        backgroundImage: resolvedBackground,
        flyerImageUrl:
          body["flyerImageUrl"] === null
            ? null
            : flyerImageUrl ?? null,
        defaultConsumptionPercent: resolvedConsPct,
      },
    });

    let layoutCopy: EventLayoutCopyResult | null = null;
    if (useDraftLayout) {
      layoutCopy = await applyDraftLayoutToEvent(clubId, event.id, {
        tables: draftTables ?? [],
        products: draftProducts ?? [],
      });
    } else if (usePast && copyFromEventId) {
      layoutCopy = await copyEventLayoutFrom(copyFromEventId, event.id, clubId);
    } else if (!startEmpty) {
      layoutCopy = await applyClubDefaultsToEvent(clubId, event.id);
    }

    if (layoutCopy !== null) {
      if (backgroundCopiedAtCreate) {
        layoutCopy.backgroundCopied = true;
      }
      const refreshed = await prisma.eventNight.findUnique({
        where: { id: event.id },
      });
      sendSuccess(
        res,
        {
          ...(refreshed ?? event),
          layoutCopy,
          setupSource: usePast ? "past" : "club",
        },
        201
      );
      return;
    }

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
    const flyerImageUrl = optionalString(body, "flyerImageUrl");
    const defaultConsumptionPercent = optionalNumber(body, "defaultConsumptionPercent");
    if (name !== undefined) data.name = name;
    if (musicGenre !== undefined) data.musicGenre = musicGenre;
    if (body["backgroundImage"] === null) {
      data.backgroundImage = null;
    } else if (backgroundImage !== undefined) {
      data.backgroundImage = backgroundImage;
    }
    if (body["flyerImageUrl"] === null) {
      data.flyerImageUrl = null;
    } else if (flyerImageUrl !== undefined) {
      data.flyerImageUrl = flyerImageUrl;
    }
    if (typeof body["isActive"] === "boolean") data.isActive = body["isActive"];
    if (defaultConsumptionPercent !== undefined) {
      if (defaultConsumptionPercent < 1 || defaultConsumptionPercent > 100) {
        throw new AppError(
          "El porcentaje de consumicion default debe estar entre 1 y 100",
          400
        );
      }
      data.defaultConsumptionPercent = Math.round(defaultConsumptionPercent);
    }
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
      prisma.product.deleteMany({ where: { eventId } }),
      prisma.clubTable.deleteMany({ where: { eventId } }),
      prisma.eventNight.delete({ where: { id: eventId } }),
    ]);
    sendSuccess(res, { deleted: true, id: eventId });
  } catch (error) {
    next(error);
  }
};

/** GET /api/clubs/:clubId/events — próximos por defecto; ?includePast=1 → { upcoming, past }; ?availableOnly=1 */
export const listEventsByClub = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const clubId = requireParam(req.params, "clubId");
    const includePast =
      req.query.includePast === "1" || req.query.includePast === "true";
    const availableOnly =
      req.query.availableOnly === "1" ||
      req.query.availableOnly === "true";
    const cutoff = openTablesEventCutoff();

    const events = await prisma.eventNight.findMany({
      where: { clubId, isActive: true },
      include: { _count: { select: { tables: true, products: true } } },
      orderBy: { date: "desc" },
    });

    const enrich = async (list: typeof events) => {
      const counts = await countAvailableTablesByEvent(list.map((e) => e.id));
      return list.map((e) => ({
        ...e,
        availableTableCount: counts.get(e.id) ?? 0,
      }));
    };

    let upcoming = events
      .filter((e) => e.date >= cutoff)
      .sort((a, b) => a.date.getTime() - b.date.getTime());
    const past = events.filter((e) => e.date < cutoff);

    if (availableOnly) {
      upcoming = upcoming.filter((e) => e._count.tables > 0);
      const counts = await countAvailableTablesByEvent(upcoming.map((e) => e.id));
      upcoming = upcoming.filter((e) => (counts.get(e.id) ?? 0) > 0);
    }

    if (includePast) {
      const pastEnriched = await enrich(past);
      const upcomingEnriched = await enrich(upcoming);
      sendSuccess(res, { upcoming: upcomingEnriched, past: pastEnriched });
      return;
    }

    sendSuccess(res, await enrich(upcoming));
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

/** GET /api/clubs/:clubId/events/:eventId/reservations — listado operativo (dueño/admin). */
export const listEventReservationsAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const clubId = requireParam(req.params, "clubId");
    const eventId = requireParam(req.params, "eventId");
    await assertUserCanAccessClub(req, clubId);

    const event = await prisma.eventNight.findFirst({
      where: { id: eventId, clubId },
      select: { id: true, name: true, date: true, isActive: true },
    });
    if (event === null) {
      throw new AppError("Evento no encontrado en este boliche", 404);
    }

    const statusParam =
      typeof req.query.status === "string" ? req.query.status.trim() : "";
    const now = new Date();

    const where: Prisma.ReservationWhereInput = { eventId, clubId };
    if (statusParam !== "" && statusParam !== "all") {
      if (
        !Object.values(ReservationStatus).includes(
          statusParam as ReservationStatus
        )
      ) {
        throw new AppError("Estado de reserva invalido", 400);
      }
      where.status = statusParam as ReservationStatus;
    }

    const [totalTables, reservations, statusGroups, occupying] =
      await Promise.all([
        prisma.clubTable.count({ where: { eventId, isActive: true } }),
        prisma.reservation.findMany({
          where,
          include: {
            table: {
              select: { id: true, label: true, sector: true, capacity: true },
            },
            host: {
              select: { id: true, fullName: true, email: true, phone: true },
            },
            guests: { select: { id: true, status: true } },
          },
          orderBy: [{ createdAt: "desc" }],
        }),
        prisma.reservation.groupBy({
          by: ["status"],
          where: { eventId, clubId },
          _count: { _all: true },
        }),
        prisma.reservation.findMany({
          where: { eventId, ...occupyingReservationFilter(now) },
          select: { tableId: true },
        }),
      ]);

    const occupiedTables = new Set(occupying.map((r) => r.tableId)).size;
    const byStatus: Record<string, number> = {};
    for (const row of statusGroups) {
      byStatus[row.status] = row._count._all;
    }

    sendSuccess(res, {
      event,
      summary: {
        totalTables,
        occupiedTables,
        freeTables: Math.max(0, totalTables - occupiedTables),
        byStatus,
      },
      reservations: reservations.map((r) => ({
        id: r.id,
        code: r.code,
        status: r.status,
        mode: r.mode,
        table: r.table,
        host: r.host,
        totalAmount: r.totalAmount,
        amountPaid: r.amountPaid,
        checkedInAt: r.checkedInAt,
        expiresAt:
          r.status === ReservationStatus.PENDING_PAYMENT ? r.expiresAt : null,
        guestsCount: r.guests.length,
        guestsPending: r.guests.filter((g) => g.status === "REQUESTED").length,
        createdAt: r.createdAt,
      })),
    });
  } catch (error) {
    next(error);
  }
};

/** GET /api/events/explore — eventos proximos de todos los boliches (cliente). */
export const listExploreEvents = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const search = req.query["search"];
    const genre = req.query["genre"];
    const zoneRaw = req.query["zone"];
    const fromRaw = req.query["from"];
    const toRaw = req.query["to"];
    const availableOnly =
      req.query["availableOnly"] === "1" ||
      req.query["availableOnly"] === "true";

    const cutoff = openTablesEventCutoff();
    const dateFilter: Prisma.DateTimeFilter = { gte: cutoff };

    if (typeof fromRaw === "string" && fromRaw.trim() !== "") {
      const from = new Date(fromRaw);
      if (Number.isNaN(from.getTime())) {
        throw new AppError("Parametro 'from' no es una fecha valida", 400);
      }
      dateFilter.gte = from > cutoff ? from : cutoff;
    }
    if (typeof toRaw === "string" && toRaw.trim() !== "") {
      const to = new Date(toRaw);
      if (Number.isNaN(to.getTime())) {
        throw new AppError("Parametro 'to' no es una fecha valida", 400);
      }
      dateFilter.lte = to;
    }

    const clubWhere: Prisma.ClubWhereInput = { isActive: true };
    const zone = parseClubZone(
      typeof zoneRaw === "string" ? zoneRaw : undefined
    );
    if (zone !== null) {
      clubWhere.zone = zone;
    }

    const where: Prisma.EventNightWhereInput = {
      isActive: true,
      date: dateFilter,
      club: clubWhere,
    };

    const and: Prisma.EventNightWhereInput[] = [];

    if (typeof search === "string" && search.trim() !== "") {
      const term = search.trim();
      and.push({
        OR: [
          { name: { contains: term, mode: "insensitive" } },
          { club: { name: { contains: term, mode: "insensitive" } } },
        ],
      });
    }
    if (typeof genre === "string" && genre.trim() !== "") {
      const g = genre.trim();
      and.push({
        OR: [
          { musicGenre: { contains: g, mode: "insensitive" } },
          { club: { musicGenre: { contains: g, mode: "insensitive" } } },
        ],
      });
    }
    if (and.length > 0) {
      where.AND = and;
    }

    let events = await prisma.eventNight.findMany({
      where,
      orderBy: { date: "asc" },
      take: 80,
      include: {
        club: {
          select: {
            id: true,
            name: true,
            city: true,
            zone: true,
            musicGenre: true,
            imageUrl: true,
          },
        },
      },
    });

    const availCounts = await countAvailableTablesByEvent(events.map((e) => e.id));

    if (availableOnly) {
      events = events.filter((e) => (availCounts.get(e.id) ?? 0) > 0);
    }

    sendSuccess(
      res,
      events.map((e) => ({
        id: e.id,
        name: e.name,
        date: e.date,
        musicGenre: e.musicGenre,
        flyerImageUrl: e.flyerImageUrl,
        club: e.club,
        availableTableCount: availCounts.get(e.id) ?? 0,
      }))
    );
  } catch (error) {
    next(error);
  }
};
