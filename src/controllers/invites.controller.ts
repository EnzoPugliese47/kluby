import type { Request, Response, NextFunction } from "express";
import {
  ClubPersonnelInviteRole,
  UserRole,
} from "../generated/prisma/enums";
import { prisma } from "../lib/prisma";
import { AppError } from "../utils/appError";
import { sendSuccess } from "../utils/apiResponse";
import { getAuthUser } from "../middlewares/auth";
import { signToken } from "../utils/jwt";
import {
  assertClubStaffCanAccessClub,
  assertUserCanAccessClub,
} from "../utils/clubAccess";
import { generateInviteCode, normalizeInviteCode } from "../utils/inviteCode";
import {
  asRecord,
  requireEnum,
  requireParam,
  requireString,
} from "../utils/validation";

const PERSONNEL_ROLE_VALUES = [
  ClubPersonnelInviteRole.STAFF,
  ClubPersonnelInviteRole.PUERTA,
] as const;

const DEFAULT_CLUB_INVITE_HOURS = 72;
const DEFAULT_EVENT_INVITE_DAYS = 14;

const assertCanManageEventInvites = async (
  req: Request,
  eventId: string
): Promise<{ clubId: string }> => {
  const user = getAuthUser(req);
  const event = await prisma.eventNight.findUnique({
    where: { id: eventId },
    select: { id: true, clubId: true, isActive: true },
  });
  if (event === null || !event.isActive) {
    throw new AppError("Evento no encontrado", 404);
  }

  if (user.role === UserRole.SUPER_ADMIN || user.role === UserRole.CLUB_ADMIN) {
    await assertUserCanAccessClub(req, event.clubId);
    return { clubId: event.clubId };
  }

  if (user.role === UserRole.STAFF) {
    await assertClubStaffCanAccessClub(req, event.clubId);
    return { clubId: event.clubId };
  }

  throw new AppError("Solo publis o administradores pueden invitar a eventos", 403);
};

const parseHours = (body: Record<string, unknown>, fallback: number): number => {
  const raw = body["expiresInHours"];
  if (raw === undefined || raw === null || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1 || n > 24 * 30) {
    throw new AppError("expiresInHours invalido (1 a 720)", 400);
  }
  return Math.floor(n);
};

const parseMaxUses = (body: Record<string, unknown>, fallback: number): number => {
  const raw = body["maxUses"];
  if (raw === undefined || raw === null || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1 || n > 500) {
    throw new AppError("maxUses invalido (1 a 500)", 400);
  }
  return Math.floor(n);
};

/** POST /api/clubs/:clubId/join-invites */
export const createClubJoinInvite = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const clubId = requireParam(req.params, "clubId");
    await assertUserCanAccessClub(req, clubId);
    const body = asRecord(req.body);
    const role = requireEnum(body, "role", PERSONNEL_ROLE_VALUES);
    const hours = parseHours(body, DEFAULT_CLUB_INVITE_HOURS);
    const maxUses = parseMaxUses(body, 1);
    const actor = getAuthUser(req);

    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
    let code = "";
    for (let attempt = 0; attempt < 8; attempt++) {
      code = generateInviteCode("EQUIPO");
      const exists = await prisma.clubJoinInvite.findUnique({ where: { code } });
      if (exists === null) break;
      if (attempt === 7) throw new AppError("No se pudo generar un codigo unico", 500);
    }

    const invite = await prisma.clubJoinInvite.create({
      data: {
        clubId,
        code,
        role,
        createdBy: actor.sub,
        expiresAt,
        maxUses,
      },
      include: {
        club: { select: { id: true, name: true } },
      },
    });

    sendSuccess(res, invite, 201);
  } catch (error) {
    next(error);
  }
};

/** GET /api/clubs/:clubId/join-invites */
export const listClubJoinInvites = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const clubId = requireParam(req.params, "clubId");
    await assertUserCanAccessClub(req, clubId);

    const invites = await prisma.clubJoinInvite.findMany({
      where: { clubId, isActive: true, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    sendSuccess(res, invites);
  } catch (error) {
    next(error);
  }
};

/** POST /api/invites/club/redeem */
export const redeemClubJoinInvite = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const body = asRecord(req.body);
    const code = normalizeInviteCode(requireString(body, "code"));
    const user = getAuthUser(req);

    if (
      user.role === UserRole.SUPER_ADMIN ||
      user.role === UserRole.CLUB_ADMIN
    ) {
      throw new AppError("Esta invitacion es para cuentas de clientes o personal nuevo", 400);
    }

    const invite = await prisma.clubJoinInvite.findUnique({
      where: { code },
      include: { club: { select: { id: true, name: true } } },
    });
    if (invite === null || !invite.isActive) {
      throw new AppError("Codigo invalido o inactivo", 404);
    }
    if (invite.expiresAt < new Date()) {
      throw new AppError("El codigo expiro", 400);
    }
    if (invite.useCount >= invite.maxUses) {
      throw new AppError("El codigo ya fue usado", 400);
    }

    const targetRole =
      invite.role === ClubPersonnelInviteRole.STAFF
        ? UserRole.STAFF
        : UserRole.PUERTA;

    const existingMember = await prisma.clubMember.findUnique({
      where: {
        userId_clubId: { userId: user.sub, clubId: invite.clubId },
      },
    });
    if (existingMember !== null && existingMember.isActive) {
      throw new AppError(`Ya sos parte del equipo de ${invite.club.name}`, 400);
    }

    if (user.role !== UserRole.CLIENT && user.role !== targetRole) {
      throw new AppError(
        "Tu cuenta ya tiene otro rol de personal. Usa otra cuenta o contacta al dueno.",
        400
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.clubJoinInvite.update({
        where: { id: invite.id },
        data: { useCount: { increment: 1 } },
      });

      if (user.role === UserRole.CLIENT) {
        await tx.user.update({
          where: { id: user.sub },
          data: { role: targetRole },
        });
      }

      const membership = await tx.clubMember.upsert({
        where: {
          userId_clubId: { userId: user.sub, clubId: invite.clubId },
        },
        create: {
          userId: user.sub,
          clubId: invite.clubId,
          invitedBy: invite.createdBy,
          isActive: true,
        },
        update: { isActive: true, invitedBy: invite.createdBy },
      });

      const updatedUser = await tx.user.findUniqueOrThrow({
        where: { id: user.sub },
        select: {
          id: true,
          email: true,
          fullName: true,
          phone: true,
          profileImageUrl: true,
          role: true,
          isVerified: true,
          isActive: true,
        },
      });

      return { membership, user: updatedUser, club: invite.club };
    });

    sendSuccess(res, {
      ...result,
      token: signToken({
        sub: result.user.id,
        role: result.user.role,
        email: result.user.email,
      }),
      message: `Te sumaste a ${invite.club.name} como ${invite.role === ClubPersonnelInviteRole.STAFF ? "publi" : "puerta"}.`,
    });
  } catch (error) {
    next(error);
  }
};

/** POST /api/events/:eventId/invites */
export const createEventInvite = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const eventId = requireParam(req.params, "eventId");
    const { clubId } = await assertCanManageEventInvites(req, eventId);
    const body = asRecord(req.body);
    const hours = parseHours(body, DEFAULT_EVENT_INVITE_DAYS * 24);
    const maxUses = parseMaxUses(body, 50);
    const actor = getAuthUser(req);

    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
    let code = "";
    for (let attempt = 0; attempt < 8; attempt++) {
      code = generateInviteCode("EVENTO");
      const exists = await prisma.eventInvite.findUnique({ where: { code } });
      if (exists === null) break;
      if (attempt === 7) throw new AppError("No se pudo generar un codigo unico", 500);
    }

    const invite = await prisma.eventInvite.create({
      data: {
        eventId,
        clubId,
        code,
        createdBy: actor.sub,
        expiresAt,
        maxUses,
      },
      include: {
        event: { select: { id: true, name: true, date: true } },
        club: { select: { id: true, name: true } },
      },
    });

    sendSuccess(res, invite, 201);
  } catch (error) {
    next(error);
  }
};

/** GET /api/events/:eventId/invites */
export const listEventInvites = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const eventId = requireParam(req.params, "eventId");
    await assertCanManageEventInvites(req, eventId);

    const invites = await prisma.eventInvite.findMany({
      where: { eventId, isActive: true },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: {
        _count: { select: { guests: true } },
      },
    });

    sendSuccess(res, invites);
  } catch (error) {
    next(error);
  }
};

/** POST /api/invites/event/redeem */
export const redeemEventInvite = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const body = asRecord(req.body);
    const code = normalizeInviteCode(requireString(body, "code"));
    const user = getAuthUser(req);

    if (user.role !== UserRole.CLIENT) {
      throw new AppError("Las invitaciones a eventos son para usuarios clientes", 400);
    }

    const invite = await prisma.eventInvite.findUnique({
      where: { code },
      include: {
        event: { select: { id: true, name: true, date: true, isActive: true, clubId: true } },
        club: { select: { id: true, name: true } },
      },
    });
    if (invite === null || !invite.isActive || !invite.event.isActive) {
      throw new AppError("Invitacion invalida o inactiva", 404);
    }
    if (invite.expiresAt !== null && invite.expiresAt < new Date()) {
      throw new AppError("La invitacion expiro", 400);
    }
    if (invite.useCount >= invite.maxUses) {
      throw new AppError("La invitacion alcanzo el limite de usos", 400);
    }

    const already = await prisma.eventInviteGuest.findUnique({
      where: {
        eventId_userId: { eventId: invite.eventId, userId: user.sub },
      },
    });
    if (already !== null) {
      sendSuccess(res, {
        alreadyRegistered: true,
        event: invite.event,
        club: invite.club,
        message: "Ya estabas invitado a este evento.",
      });
      return;
    }

    const guest = await prisma.$transaction(async (tx) => {
      await tx.eventInvite.update({
        where: { id: invite.id },
        data: { useCount: { increment: 1 } },
      });
      return tx.eventInviteGuest.create({
        data: {
          eventInviteId: invite.id,
          eventId: invite.eventId,
          userId: user.sub,
        },
      });
    });

    sendSuccess(res, {
      guest,
      event: invite.event,
      club: invite.club,
      message: `Quedaste invitado a ${invite.event.name} en ${invite.club.name}.`,
    });
  } catch (error) {
    next(error);
  }
};

/** GET /api/invites/event/preview?code= */
export const previewEventInvite = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const raw = req.query["code"];
    if (typeof raw !== "string" || raw.trim() === "") {
      throw new AppError("Falta el codigo de invitacion", 400);
    }
    const code = normalizeInviteCode(raw);

    const invite = await prisma.eventInvite.findUnique({
      where: { code },
      include: {
        event: { select: { id: true, name: true, date: true, isActive: true } },
        club: { select: { id: true, name: true, imageUrl: true } },
      },
    });
    if (invite === null || !invite.isActive || !invite.event.isActive) {
      throw new AppError("Invitacion no encontrada", 404);
    }

    sendSuccess(res, {
      code: invite.code,
      event: invite.event,
      club: invite.club,
      expired: invite.expiresAt !== null && invite.expiresAt < new Date(),
    });
  } catch (error) {
    next(error);
  }
};

/** GET /api/invites/my-events */
export const listMyEventInvites = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = getAuthUser(req);
    const rows = await prisma.eventInviteGuest.findMany({
      where: { userId: user.sub },
      include: {
        event: {
          select: {
            id: true,
            name: true,
            date: true,
            clubId: true,
            isActive: true,
          },
        },
        invite: { select: { code: true } },
      },
      orderBy: { redeemedAt: "desc" },
    });

    const clubIds = [...new Set(rows.map((r) => r.event.clubId))];
    const clubs = await prisma.club.findMany({
      where: { id: { in: clubIds } },
      select: { id: true, name: true, imageUrl: true },
    });
    const clubById = new Map(clubs.map((c) => [c.id, c]));

    sendSuccess(
      res,
      rows.map((r) => ({
        id: r.id,
        redeemedAt: r.redeemedAt,
        event: r.event,
        club: clubById.get(r.event.clubId) ?? null,
        code: r.invite.code,
      }))
    );
  } catch (error) {
    next(error);
  }
};

/** GET /api/clubs/:clubId/staff-events */
export const listStaffClubEvents = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const clubId = requireParam(req.params, "clubId");
    const user = getAuthUser(req);

    if (user.role === UserRole.STAFF) {
      await assertClubStaffCanAccessClub(req, clubId);
    } else {
      await assertUserCanAccessClub(req, clubId);
    }

    const events = await prisma.eventNight.findMany({
      where: {
        clubId,
        isActive: true,
        date: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      orderBy: { date: "asc" },
      take: 30,
      select: { id: true, name: true, date: true, musicGenre: true },
    });

    sendSuccess(res, events);
  } catch (error) {
    next(error);
  }
};

/** DELETE /api/clubs/:clubId/join-invites/:inviteId */
export const deactivateClubJoinInvite = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const clubId = requireParam(req.params, "clubId");
    const inviteId = requireParam(req.params, "inviteId");
    await assertUserCanAccessClub(req, clubId);

    const invite = await prisma.clubJoinInvite.findFirst({
      where: { id: inviteId, clubId },
    });
    if (invite === null) throw new AppError("Invitacion no encontrada", 404);

    await prisma.clubJoinInvite.update({
      where: { id: inviteId },
      data: { isActive: false },
    });
    sendSuccess(res, { deactivated: true });
  } catch (error) {
    next(error);
  }
};

/** GET /api/clubs/:clubId/members — publis y personal de puerta del boliche. */
export const listClubMembers = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const clubId = requireParam(req.params, "clubId");
    await assertUserCanAccessClub(req, clubId);

    const members = await prisma.clubMember.findMany({
      where: {
        clubId,
        user: { role: { in: [UserRole.STAFF, UserRole.PUERTA] } },
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
            role: true,
            isActive: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    sendSuccess(res, members);
  } catch (error) {
    next(error);
  }
};

/** PATCH /api/clubs/:clubId/members/:memberId — desactiva acceso al boliche. */
export const deactivateClubMember = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const clubId = requireParam(req.params, "clubId");
    const memberId = requireParam(req.params, "memberId");
    await assertUserCanAccessClub(req, clubId);

    const member = await prisma.clubMember.findFirst({
      where: { id: memberId, clubId },
    });
    if (member === null) throw new AppError("Trabajador no encontrado", 404);

    const updated = await prisma.clubMember.update({
      where: { id: memberId },
      data: { isActive: false },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
            role: true,
            isActive: true,
          },
        },
      },
    });

    sendSuccess(res, updated);
  } catch (error) {
    next(error);
  }
};
