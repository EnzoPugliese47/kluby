import type { Request, Response, NextFunction } from "express";
import { GuestStatus, ReservationStatus } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../utils/appError";
import { sendSuccess } from "../utils/apiResponse";
import { getAuthUser } from "../middlewares/auth";
import { assertClientActor } from "../utils/clientActor";
import { asRecord, requireParam, requireString } from "../utils/validation";

/**
 * Valida las reglas del chat de mesa (RN12) y que el usuario sea participante.
 * Devuelve el conjunto de userIds participantes (anfitrion + invitados
 * confirmados).
 */
const assertChatAccess = async (
  reservationId: string,
  userId: string
): Promise<void> => {
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    include: {
      event: true,
      guests: { where: { status: GuestStatus.CONFIRMED } },
    },
  });
  if (reservation === null) {
    throw new AppError("Reserva no encontrada", 404);
  }
  if (reservation.status === ReservationStatus.CANCELLED) {
    throw new AppError("La reserva esta cancelada", 400);
  }

  // RN12: el chat requiere al menos 2 integrantes confirmados (anfitrion + 1).
  const confirmedParticipants = 1 + reservation.guests.length;
  if (confirmedParticipants < 2) {
    throw new AppError(
      "El chat se habilita con al menos 2 integrantes confirmados (RN12)",
      400
    );
  }

  // RN12: el chat se cierra 24 horas despues del evento.
  const closesAt = new Date(reservation.event.date.getTime() + 24 * 60 * 60 * 1000);
  if (Date.now() > closesAt.getTime()) {
    throw new AppError("El chat se cerro 24 horas despues del evento (RN12)", 400);
  }

  const participantIds = new Set<string>([
    reservation.hostId,
    ...reservation.guests.map((g) => g.userId),
  ]);
  if (!participantIds.has(userId)) {
    throw new AppError("Solo los integrantes de la mesa pueden usar el chat", 403);
  }
};

const CHAT_ACTIVE_MS = 24 * 60 * 60 * 1000;

/** Reservas activas (RN12) donde el usuario participa en el chat de mesa. */
const listActiveChatReservationsForUser = async (userId: string) => {
  const minEventDate = new Date(Date.now() - CHAT_ACTIVE_MS);

  const [asHost, asGuest] = await Promise.all([
    prisma.reservation.findMany({
      where: {
        hostId: userId,
        status: { notIn: [ReservationStatus.CANCELLED, ReservationStatus.EXPIRED] },
        event: { date: { gt: minEventDate } },
      },
      include: {
        event: true,
        table: { select: { label: true } },
        guests: { where: { status: GuestStatus.CONFIRMED } },
      },
    }),
    prisma.reservationGuest.findMany({
      where: {
        userId,
        status: GuestStatus.CONFIRMED,
        reservation: {
          status: { notIn: [ReservationStatus.CANCELLED, ReservationStatus.EXPIRED] },
          event: { date: { gt: minEventDate } },
        },
      },
      include: {
        reservation: {
          include: {
            event: true,
            table: { select: { label: true } },
            guests: { where: { status: GuestStatus.CONFIRMED } },
          },
        },
      },
    }),
  ]);

  const byId = new Map<string, (typeof asHost)[number]>();
  for (const r of asHost) byId.set(r.id, r);
  for (const g of asGuest) byId.set(g.reservation.id, g.reservation);

  return [...byId.values()].filter((r) => {
    if (1 + r.guests.length < 2) return false;
    const closesAt = new Date(r.event.date.getTime() + CHAT_ACTIVE_MS);
    return Date.now() <= closesAt.getTime();
  });
};

/** GET /api/users/:id/chat-alerts - Ultimo mensaje ajeno por mesa (notificaciones). */
export const listChatAlertsForUser = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = requireParam(req.params, "id");
    const auth = getAuthUser(req);
    if (auth.sub !== userId) {
      throw new AppError("No autorizado", 403);
    }

    const reservations = await listActiveChatReservationsForUser(userId);
    const alerts = [];

    for (const r of reservations) {
      const lastFromOther = await prisma.chatMessage.findFirst({
        where: { reservationId: r.id, userId: { not: userId } },
        orderBy: { createdAt: "desc" },
        include: { user: { select: { id: true, fullName: true } } },
      });
      if (lastFromOther === null) continue;

      alerts.push({
        reservationId: r.id,
        tableLabel: r.table.label,
        messageId: lastFromOther.id,
        messageAt: lastFromOther.createdAt,
        authorName: lastFromOther.user.fullName,
        preview: lastFromOther.content.slice(0, 120),
      });
    }

    sendSuccess(res, alerts);
  } catch (error) {
    next(error);
  }
};

/** POST /api/reservations/:id/chat - Enviar un mensaje al chat de la mesa. */
export const postChatMessage = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const reservationId = requireParam(req.params, "id");
    const body = asRecord(req.body);
    const content = requireString(body, "content");
    const auth = getAuthUser(req);
    assertClientActor(auth);

    await assertChatAccess(reservationId, auth.sub);

    const message = await prisma.chatMessage.create({
      data: { reservationId, userId: auth.sub, content },
      include: { user: { select: { id: true, fullName: true } } },
    });
    sendSuccess(res, message, 201);
  } catch (error) {
    next(error);
  }
};

/** GET /api/reservations/:id/chat - Historial de mensajes de la mesa. */
export const getChatMessages = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const reservationId = requireParam(req.params, "id");
    const auth = getAuthUser(req);

    await assertChatAccess(reservationId, auth.sub);

    const messages = await prisma.chatMessage.findMany({
      where: { reservationId },
      include: { user: { select: { id: true, fullName: true } } },
      orderBy: { createdAt: "asc" },
    });
    sendSuccess(res, messages);
  } catch (error) {
    next(error);
  }
};
