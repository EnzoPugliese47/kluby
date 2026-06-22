import type { Request } from "express";
import { UserRole } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "./appError";
import { getAuthUser } from "../middlewares/auth";

/** Super admin ve todo; dueño (CLUB_ADMIN) solo sus boliches. */
export const assertUserCanAccessClub = async (
  req: Request,
  clubId: string
): Promise<void> => {
  const user = getAuthUser(req);
  if (user.role === UserRole.SUPER_ADMIN) return;

  if (user.role === UserRole.CLUB_ADMIN) {
    const club = await prisma.club.findFirst({
      where: { id: clubId, ownerId: user.sub },
      select: { id: true },
    });
    if (club === null) {
      throw new AppError("No tenes permisos sobre este boliche", 403);
    }
    return;
  }

  throw new AppError("No tenes permisos para esta accion", 403);
};

/** Puerta y publis solo operan en boliches donde tienen membresia activa. */
export const assertClubStaffCanAccessClub = async (
  req: Request,
  clubId: string
): Promise<void> => {
  const user = getAuthUser(req);
  if (user.role === UserRole.SUPER_ADMIN) return;

  if (user.role === UserRole.CLUB_ADMIN) {
    await assertUserCanAccessClub(req, clubId);
    return;
  }

  if (user.role === UserRole.PUERTA || user.role === UserRole.STAFF) {
    const membership = await prisma.clubMember.findFirst({
      where: { userId: user.sub, clubId, isActive: true },
      select: { id: true },
    });
    if (membership === null) {
      throw new AppError("No tenes permisos sobre este boliche", 403);
    }
    return;
  }

  throw new AppError("No tenes permisos para esta accion", 403);
};

/** IDs de boliches donde el usuario tiene membresia activa (STAFF/PUERTA). */
export const getActiveMemberClubIds = async (userId: string): Promise<string[]> => {
  const rows = await prisma.clubMember.findMany({
    where: { userId, isActive: true },
    select: { clubId: true },
  });
  return rows.map((r) => r.clubId);
};
