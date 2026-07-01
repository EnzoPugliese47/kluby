import type { Request, Response, NextFunction } from "express";
import {
  Prisma,
  LoyaltyTxType,
  PaymentOption,
  PaymentStatus,
  PaymentType,
  ReservationMode,
  ReservationStatus,
} from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import { AppError } from "../utils/appError";
import { sendSuccess } from "../utils/apiResponse";
import {
  computeDeposit,
  computeRefundPercent,
  occupyingReservationFilter,
} from "../utils/reservation";
import {
  asRecord,
  optionalEnum,
  optionalString,
  requireEnum,
  requireParam,
  requireString,
} from "../utils/validation";
import { assertClubStaffCanAccessClub } from "../utils/clubAccess";

const PAYMENT_OPTION_VALUES = Object.values(PaymentOption);
const RESERVATION_MODE_VALUES = Object.values(ReservationMode);

const reservationInclude = {
  table: true,
  event: true,
  club: { select: { id: true, name: true } },
  host: { select: { id: true, fullName: true, email: true } },
  guests: {
    include: { user: { select: { id: true, fullName: true } } },
  },
  payments: true,
} satisfies Prisma.ReservationInclude;

/**
 * POST /api/reservations
 * Crea una reserva con bloqueo transitorio (TTL, RN05). Usa una transaccion
 * con aislamiento Serializable para evitar overbooking (RN07).
 */
export const createReservation = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const body = asRecord(req.body);
    const eventId = requireString(body, "eventId");
    const tableId = requireString(body, "tableId");
    const hostId = requireString(body, "hostId");
    const paymentOption = requireEnum(
      body,
      "paymentOption",
      PAYMENT_OPTION_VALUES
    );
    const mode =
      optionalEnum(body, "mode", RESERVATION_MODE_VALUES) ??
      ReservationMode.STANDARD;

    const reservationId = await prisma.$transaction(
      async (tx) => {
        const table = await tx.clubTable.findUnique({
          where: { id: tableId },
        });
        if (table === null || !table.isActive) {
          throw new AppError("Mesa no encontrada o inactiva", 404);
        }
        if (table.eventId !== eventId) {
          throw new AppError("La mesa no pertenece a este evento", 400);
        }

        const event = await tx.eventNight.findUnique({
          where: { id: eventId },
        });
        if (event === null || !event.isActive) {
          throw new AppError("Evento no encontrado o inactivo", 404);
        }
        if (event.clubId !== table.clubId) {
          throw new AppError(
            "La mesa no pertenece al boliche del evento",
            400
          );
        }

        const host = await tx.user.findUnique({ where: { id: hostId } });
        if (host === null || !host.isActive) {
          throw new AppError("Usuario anfitrion no encontrado o inactivo", 404);
        }

        const now = new Date();

        // Libera reservas pendientes cuyo TTL ya vencio antes de evaluar colision.
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
          throw new AppError(
            "La mesa ya esta reservada para este evento",
            409
          );
        }

        const totalAmount = new Prisma.Decimal(table.price);
        const depositAmount = computeDeposit(totalAmount, table.depositPercent);
        const expiresAt = new Date(
          now.getTime() + env.reservationTtlMinutes * 60 * 1000
        );

        const created = await tx.reservation.create({
          data: {
            clubId: table.clubId,
            eventId,
            tableId,
            hostId,
            mode,
            paymentOption,
            status: ReservationStatus.PENDING_PAYMENT,
            totalAmount,
            depositAmount,
            expiresAt,
          },
        });
        return created.id;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

    const reservation = await prisma.reservation.findUniqueOrThrow({
      where: { id: reservationId },
      include: reservationInclude,
    });
    sendSuccess(res, reservation, 201);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/reservations/:id/pay
 * Procesa el pago (simulado) de la sena o del total y confirma la reserva.
 */
export const payReservation = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = requireParam(req.params, "id");
    const body = asRecord(req.body);
    const provider = optionalString(body, "provider");
    const externalRef = optionalString(body, "externalRef");

    const reservation = await prisma.$transaction(async (tx) => {
      const current = await tx.reservation.findUnique({ where: { id } });
      if (current === null) {
        throw new AppError("Reserva no encontrada", 404);
      }
      if (current.status !== ReservationStatus.PENDING_PAYMENT) {
        throw new AppError(
          `La reserva no esta pendiente de pago (estado actual: ${current.status})`,
          400
        );
      }
      if (current.expiresAt.getTime() <= Date.now()) {
        await tx.reservation.update({
          where: { id },
          data: { status: ReservationStatus.EXPIRED },
        });
        throw new AppError(
          "El bloqueo de la mesa expiro, la reserva fue liberada (RN05)",
          410
        );
      }

      const isFull = current.paymentOption === PaymentOption.FULL_PAYMENT;
      const amount = isFull ? current.totalAmount : current.depositAmount;
      const paymentType = isFull ? PaymentType.FULL : PaymentType.DEPOSIT;

      await tx.payment.create({
        data: {
          reservationId: id,
          userId: current.hostId,
          type: paymentType,
          amount,
          status: PaymentStatus.APPROVED,
          provider: provider ?? null,
          externalRef: externalRef ?? null,
        },
      });

      return tx.reservation.update({
        where: { id },
        data: {
          status: ReservationStatus.CONFIRMED,
          confirmedAt: new Date(),
          amountPaid: amount,
        },
        include: reservationInclude,
      });
    });

    sendSuccess(res, reservation);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/reservations/:id/cancel
 * Cancela la reserva aplicando la escala de devoluciones (RN16).
 */
export const cancelReservation = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = requireParam(req.params, "id");

    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.reservation.findUnique({
        where: { id },
        include: { event: true },
      });
      if (current === null) {
        throw new AppError("Reserva no encontrada", 404);
      }
      const cancellable: ReservationStatus[] = [
        ReservationStatus.PENDING_PAYMENT,
        ReservationStatus.CONFIRMED,
      ];
      if (!cancellable.includes(current.status)) {
        throw new AppError(
          `La reserva no puede cancelarse en su estado actual (${current.status})`,
          400
        );
      }

      const refundPercent = computeRefundPercent(current.event.date);
      const refundAmount = current.amountPaid.mul(refundPercent).div(100);

      if (refundAmount.greaterThan(0)) {
        await tx.payment.create({
          data: {
            reservationId: id,
            userId: current.hostId,
            type: PaymentType.REFUND,
            amount: refundAmount,
            status: PaymentStatus.REFUNDED,
          },
        });
      }

      const updated = await tx.reservation.update({
        where: { id },
        data: {
          status: ReservationStatus.CANCELLED,
          cancelledAt: new Date(),
        },
        include: reservationInclude,
      });

      return { reservation: updated, refundPercent, refundAmount };
    });

    sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
};

/** POST /api/reservations/:id/check-in - Validacion de QR en puerta. */
export const checkInReservation = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = requireParam(req.params, "id");
    const current = await prisma.reservation.findUnique({ where: { id } });
    if (current === null) {
      throw new AppError("Reserva no encontrada", 404);
    }
    await assertClubStaffCanAccessClub(req, current.clubId);
    if (current.status !== ReservationStatus.CONFIRMED) {
      throw new AppError(
        `Solo se puede hacer check-in de reservas confirmadas (estado: ${current.status})`,
        400
      );
    }
    const reservation = await prisma.reservation.update({
      where: { id },
      data: {
        status: ReservationStatus.CHECKED_IN,
        checkedInAt: new Date(),
      },
      include: reservationInclude,
    });
    sendSuccess(res, reservation);
  } catch (error) {
    next(error);
  }
};

/** POST /api/reservations/:id/checkout - Cierre de mesa. */
export const checkoutReservation = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = requireParam(req.params, "id");
    const current = await prisma.reservation.findUnique({ where: { id } });
    if (current === null) {
      throw new AppError("Reserva no encontrada", 404);
    }
    await assertClubStaffCanAccessClub(req, current.clubId);
    const closable: ReservationStatus[] = [
      ReservationStatus.CONFIRMED,
      ReservationStatus.CHECKED_IN,
    ];
    if (!closable.includes(current.status)) {
      throw new AppError(
        `La reserva no puede cerrarse en su estado actual (${current.status})`,
        400
      );
    }

    // RN17: acreditar Kluby Points al anfitrion al cerrar la mesa.
    const earnedPoints = Math.floor(
      Number(current.amountPaid) / env.loyaltyCurrencyPerPoint
    );

    const reservation = await prisma.$transaction(async (tx) => {
      const updated = await tx.reservation.update({
        where: { id },
        data: {
          status: ReservationStatus.COMPLETED,
          completedAt: new Date(),
        },
        include: reservationInclude,
      });

      if (earnedPoints > 0) {
        await tx.loyaltyTransaction.create({
          data: {
            userId: updated.hostId,
            clubId: updated.clubId,
            reservationId: updated.id,
            type: LoyaltyTxType.EARNED,
            points: earnedPoints,
            description: "Acreditacion por cierre de mesa (check-out)",
          },
        });
      }
      return updated;
    });

    sendSuccess(res, { reservation, earnedPoints });
  } catch (error) {
    next(error);
  }
};

/** GET /api/reservations/:id */
export const getReservationById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = requireParam(req.params, "id");
    const reservation = await prisma.reservation.findUnique({
      where: { id },
      include: reservationInclude,
    });
    if (reservation === null) {
      throw new AppError("Reserva no encontrada", 404);
    }
    sendSuccess(res, reservation);
  } catch (error) {
    next(error);
  }
};

/** GET /api/reservations/by-code/:code - Busca una reserva por su codigo (QR). */
export const getReservationByCode = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const code = requireParam(req.params, "code");
    const reservation = await prisma.reservation.findUnique({
      where: { code },
      include: reservationInclude,
    });
    if (reservation === null) {
      throw new AppError("Reserva no encontrada para ese codigo", 404);
    }
    await assertClubStaffCanAccessClub(req, reservation.clubId);
    sendSuccess(res, reservation);
  } catch (error) {
    next(error);
  }
};

/** GET /api/clubs/:clubId/check-ins — ingresos de la noche (puerta/admin). */
export const listClubCheckIns = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const clubId = requireParam(req.params, "clubId");
    await assertClubStaffCanAccessClub(req, clubId);

    const eventIdParam =
      typeof req.query.eventId === "string" ? req.query.eventId.trim() : "";

    let event = null;
    if (eventIdParam !== "") {
      event = await prisma.eventNight.findFirst({
        where: { id: eventIdParam, clubId },
        select: { id: true, name: true, date: true },
      });
    } else {
      event = await prisma.eventNight.findFirst({
        where: { clubId, isActive: true },
        orderBy: { date: "desc" },
        select: { id: true, name: true, date: true },
      });
    }

    if (event === null) {
      sendSuccess(res, { event: null, checkIns: [] });
      return;
    }

    const rows = await prisma.reservation.findMany({
      where: {
        clubId,
        eventId: event.id,
        checkedInAt: { not: null },
      },
      select: {
        id: true,
        code: true,
        status: true,
        checkedInAt: true,
        table: { select: { label: true, sector: true } },
        host: { select: { fullName: true } },
      },
      orderBy: { checkedInAt: "desc" },
      take: 80,
    });

    sendSuccess(res, { event, checkIns: rows });
  } catch (error) {
    next(error);
  }
};

/** GET /api/users/:id/reservations - Reservas donde el usuario es anfitrion. */
export const listReservationsByHost = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const hostId = requireParam(req.params, "id");
    const reservations = await prisma.reservation.findMany({
      where: { hostId },
      include: reservationInclude,
      orderBy: { createdAt: "desc" },
    });
    sendSuccess(res, reservations);
  } catch (error) {
    next(error);
  }
};
