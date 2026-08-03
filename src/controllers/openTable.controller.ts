import type { Request, Response, NextFunction } from "express";
import {
  Prisma,
  GuestStatus,
  PaymentOption,
  PaymentStatus,
  PaymentType,
  ReservationMode,
  ReservationStatus,
} from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../utils/appError";
import { sendSuccess } from "../utils/apiResponse";
import {
  asRecord,
  requireNumber,
  requireParam,
  requireString,
} from "../utils/validation";
import {
  isEventOpenForOpenTables,
  openTablesEventCutoff,
} from "../utils/eventTiming";

/** Estados de invitado que ocupan un cupo de la mesa abierta. */
const ACTIVE_GUEST_STATUSES: GuestStatus[] = [
  GuestStatus.REQUESTED,
  GuestStatus.ACCEPTED_PENDING_PAYMENT,
  GuestStatus.CONFIRMED,
];

/** Si el anfitrion pago el total, los invitados no abonan su parte (split bill). */
const isTablePrepaidByHost = (paymentOption: PaymentOption): boolean =>
  paymentOption === PaymentOption.FULL_PAYMENT;

const guestShareAmount = (
  reservation: {
    paymentOption: PaymentOption;
    totalAmount: Prisma.Decimal;
    maxGuests: number | null;
  }
): Prisma.Decimal => {
  if (isTablePrepaidByHost(reservation.paymentOption)) {
    return new Prisma.Decimal(0);
  }
  const maxGuests = reservation.maxGuests ?? 0;
  if (maxGuests <= 0) return reservation.totalAmount;
  return reservation.totalAmount.div(maxGuests);
};

/**
 * POST /api/reservations/:id/open
 * El anfitrion convierte su reserva en "Mesa Abierta" y habilita cupos.
 * RN09: requiere que la reserva este confirmada (sena 100% pagada).
 */
export const openTable = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = requireParam(req.params, "id");
    const body = asRecord(req.body);
    const maxGuests = requireNumber(body, "maxGuests");

    if (!Number.isInteger(maxGuests) || maxGuests < 2) {
      throw new AppError(
        "maxGuests debe ser un entero >= 2 (anfitrion + al menos un invitado)",
        400
      );
    }

    const reservation = await prisma.reservation.findUnique({
      where: { id },
      include: { table: true },
    });
    if (reservation === null) {
      throw new AppError("Reserva no encontrada", 404);
    }
    if (reservation.status !== ReservationStatus.CONFIRMED) {
      throw new AppError(
        "Para abrir la mesa, la reserva debe estar confirmada con la sena pagada (RN09)",
        400
      );
    }
    if (maxGuests > reservation.table.capacity) {
      throw new AppError(
        `maxGuests no puede superar la capacidad de la mesa (${reservation.table.capacity})`,
        400
      );
    }

    const updated = await prisma.reservation.update({
      where: { id },
      data: { mode: ReservationMode.OPEN_TABLE, maxGuests },
    });

    sendSuccess(res, {
      reservation: updated,
      sharePerPerson: guestShareAmount(updated),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/reservations/open
 * "Muro" de mesas abiertas: reservas OPEN_TABLE confirmadas con cupos libres.
 */
export const listOpenTables = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const reservations = await prisma.reservation.findMany({
      where: {
        mode: ReservationMode.OPEN_TABLE,
        status: ReservationStatus.CONFIRMED,
        event: { date: { gte: openTablesEventCutoff() } },
      },
      include: {
        table: true,
        event: true,
        club: { select: { id: true, name: true, city: true } },
        host: { select: { id: true, fullName: true } },
        guests: { where: { status: { in: ACTIVE_GUEST_STATUSES } } },
      },
      orderBy: { createdAt: "desc" },
    });

    const wall = reservations
      .map((r) => {
        const maxGuests = r.maxGuests ?? 0;
        const occupied = 1 + r.guests.length; // anfitrion + invitados activos
        const availableSlots = Math.max(maxGuests - occupied, 0);
        return {
          reservationId: r.id,
          club: r.club,
          event: r.event,
          table: r.table,
          host: r.host,
          maxGuests,
          availableSlots,
          prepaid: isTablePrepaidByHost(r.paymentOption),
          sharePerPerson: guestShareAmount(r),
        };
      })
      .filter((r) => r.availableSlots > 0);

    sendSuccess(res, wall);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/reservations/:id/guests
 * Un usuario se postula a una mesa abierta (Postulacion a Mesa Ajena).
 */
export const requestToJoin = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const reservationId = requireParam(req.params, "id");
    const body = asRecord(req.body);
    const userId = requireString(body, "userId");

    const guest = await prisma.$transaction(async (tx) => {
      const reservation = await tx.reservation.findUnique({
        where: { id: reservationId },
        include: { event: true },
      });
      if (reservation === null) {
        throw new AppError("Reserva no encontrada", 404);
      }
      if (!isEventOpenForOpenTables(reservation.event.date)) {
        throw new AppError("El evento ya finalizó; esta mesa abierta no acepta más postulaciones", 400);
      }
      if (
        reservation.mode !== ReservationMode.OPEN_TABLE ||
        reservation.status !== ReservationStatus.CONFIRMED
      ) {
        throw new AppError("Esta reserva no es una mesa abierta disponible", 400);
      }
      if (reservation.hostId === userId) {
        throw new AppError("El anfitrion no puede postularse a su propia mesa", 400);
      }

      const user = await tx.user.findUnique({ where: { id: userId } });
      if (user === null || !user.isActive) {
        throw new AppError("Usuario no encontrado o inactivo", 404);
      }

      const existing = await tx.reservationGuest.findUnique({
        where: { reservationId_userId: { reservationId, userId } },
      });
      if (existing !== null && ACTIVE_GUEST_STATUSES.includes(existing.status)) {
        throw new AppError("El usuario ya forma parte o se postulo a esta mesa", 409);
      }

      const maxGuests = reservation.maxGuests ?? 0;
      const activeGuests = await tx.reservationGuest.count({
        where: { reservationId, status: { in: ACTIVE_GUEST_STATUSES } },
      });
      if (1 + activeGuests >= maxGuests) {
        throw new AppError("La mesa no tiene cupos disponibles", 409);
      }

      const shareAmount = guestShareAmount(reservation);

      if (existing !== null) {
        return tx.reservationGuest.update({
          where: { id: existing.id },
          data: { status: GuestStatus.REQUESTED, shareAmount },
        });
      }
      return tx.reservationGuest.create({
        data: {
          reservationId,
          userId,
          status: GuestStatus.REQUESTED,
          shareAmount,
        },
      });
    });

    sendSuccess(res, guest, 201);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/users/:id/guest-entries
 * Lista las postulaciones del usuario a mesas abiertas (para saber su estado
 * y poder pagar su parte cuando el anfitrion lo acepta).
 */
export const listMyGuestEntries = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = requireParam(req.params, "id");
    const entries = await prisma.reservationGuest.findMany({
      where: {
        userId,
        reservation: {
          event: { date: { gte: openTablesEventCutoff() } },
        },
      },
      include: {
        reservation: {
          include: {
            table: true,
            event: true,
            club: { select: { id: true, name: true, city: true } },
            host: { select: { id: true, fullName: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    sendSuccess(res, entries);
  } catch (error) {
    next(error);
  }
};

/** GET /api/reservations/:id/guests - El anfitrion revisa las solicitudes. */
export const listGuests = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const reservationId = requireParam(req.params, "id");
    const guests = await prisma.reservationGuest.findMany({
      where: { reservationId },
      include: { user: { select: { id: true, fullName: true, email: true, phone: true } } },
      orderBy: { createdAt: "asc" },
    });
    sendSuccess(res, guests);
  } catch (error) {
    next(error);
  }
};

/** POST /api/guests/:guestId/accept - El anfitrion acepta a un postulante. */
export const acceptGuest = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const guestId = requireParam(req.params, "guestId");
    const updated = await prisma.$transaction(async (tx) => {
      const guest = await tx.reservationGuest.findUnique({
        where: { id: guestId },
      });
      if (guest === null) {
        throw new AppError("Postulacion no encontrada", 404);
      }
      if (guest.status !== GuestStatus.REQUESTED) {
        throw new AppError(
          `Solo se pueden aceptar postulaciones pendientes (estado: ${guest.status})`,
          400
        );
      }

      const reservation = await tx.reservation.findUnique({
        where: { id: guest.reservationId },
      });
      if (reservation === null) {
        throw new AppError("Reserva no encontrada", 404);
      }

      const prepaid = isTablePrepaidByHost(reservation.paymentOption);
      return tx.reservationGuest.update({
        where: { id: guestId },
        data: {
          status: prepaid
            ? GuestStatus.CONFIRMED
            : GuestStatus.ACCEPTED_PENDING_PAYMENT,
          shareAmount: guestShareAmount(reservation),
        },
      });
    });
    sendSuccess(res, updated);
  } catch (error) {
    next(error);
  }
};

/** POST /api/guests/:guestId/reject - El anfitrion rechaza a un postulante. */
export const rejectGuest = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const guestId = requireParam(req.params, "guestId");
    const guest = await prisma.reservationGuest.findUnique({
      where: { id: guestId },
    });
    if (guest === null) {
      throw new AppError("Postulacion no encontrada", 404);
    }
    const rejectable: GuestStatus[] = [
      GuestStatus.REQUESTED,
      GuestStatus.ACCEPTED_PENDING_PAYMENT,
    ];
    if (!rejectable.includes(guest.status)) {
      throw new AppError(
        `No se puede rechazar a un invitado en estado ${guest.status}`,
        400
      );
    }
    const updated = await prisma.reservationGuest.update({
      where: { id: guestId },
      data: { status: GuestStatus.REJECTED },
    });
    sendSuccess(res, updated);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/guests/:guestId/pay
 * El invitado paga su parte proporcional (Split Bill). RN11: solo tras el pago
 * aprobado el invitado queda confirmado en la mesa.
 */
export const payGuestShare = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const guestId = requireParam(req.params, "guestId");
    const body = asRecord(req.body);

    const result = await prisma.$transaction(async (tx) => {
      const guest = await tx.reservationGuest.findUnique({
        where: { id: guestId },
      });
      if (guest === null) {
        throw new AppError("Postulacion no encontrada", 404);
      }
      if (guest.status !== GuestStatus.ACCEPTED_PENDING_PAYMENT) {
        throw new AppError(
          `El invitado debe estar aceptado y pendiente de pago (estado: ${guest.status})`,
          400
        );
      }

      const reservation = await tx.reservation.findUnique({
        where: { id: guest.reservationId },
      });
      if (reservation === null) {
        throw new AppError("Reserva no encontrada", 404);
      }
      if (isTablePrepaidByHost(reservation.paymentOption)) {
        const confirmedGuest = await tx.reservationGuest.update({
          where: { id: guestId },
          data: { status: GuestStatus.CONFIRMED, shareAmount: new Prisma.Decimal(0) },
        });
        return { guest: confirmedGuest, reservation };
      }

      const provider =
        typeof body["provider"] === "string" ? (body["provider"] as string) : null;
      const externalRef =
        typeof body["externalRef"] === "string"
          ? (body["externalRef"] as string)
          : null;

      await tx.payment.create({
        data: {
          reservationId: guest.reservationId,
          guestId: guest.id,
          userId: guest.userId,
          type: PaymentType.GUEST_SHARE,
          amount: guest.shareAmount,
          status: PaymentStatus.APPROVED,
          provider,
          externalRef,
        },
      });

      const confirmedGuest = await tx.reservationGuest.update({
        where: { id: guestId },
        data: { status: GuestStatus.CONFIRMED },
      });

      const updatedReservation = await tx.reservation.update({
        where: { id: guest.reservationId },
        data: { amountPaid: { increment: guest.shareAmount } },
      });

      return { guest: confirmedGuest, reservation: updatedReservation };
    });

    sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
};
