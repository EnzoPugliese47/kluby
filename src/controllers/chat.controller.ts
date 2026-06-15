import type { Request, Response, NextFunction } from "express";
import { GuestStatus, ReservationStatus } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../utils/appError";
import { sendSuccess } from "../utils/apiResponse";
import { getAuthUser } from "../middlewares/auth";
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
