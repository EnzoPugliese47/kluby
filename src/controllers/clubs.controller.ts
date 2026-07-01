import type { Request, Response, NextFunction } from "express";
import { Prisma, UserRole } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../utils/appError";
import { sendSuccess } from "../utils/apiResponse";
import { occupyingReservationFilter } from "../utils/reservation";
import { getAuthUser } from "../middlewares/auth";
import { assertUserCanAccessClub } from "../utils/clubAccess";
import {
  asRecord,
  optionalString,
  requireParam,
  requireString,
} from "../utils/validation";

const normalizeEmail = (raw: string): string => raw.trim().toLowerCase();

const requireContactEmail = (body: Record<string, unknown>): string => {
  const email = normalizeEmail(requireString(body, "contactEmail"));
  if (!email.includes("@") || !email.includes(".")) {
    throw new AppError("El email de contacto no es valido", 400);
  }
  return email;
};

const optionalContactPhone = (body: Record<string, unknown>): string | null => {
  const phone = optionalString(body, "contactPhone");
  if (phone === undefined || phone === "") return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 6) {
    throw new AppError("El telefono de contacto no es valido (minimo 6 digitos)", 400);
  }
  return phone;
};

/** POST /api/clubs - Alta de boliche. */
export const createClub = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const body = asRecord(req.body);
    const name = requireString(body, "name");
    const address = requireString(body, "address");
    const city = requireString(body, "city");
    const ownerId = requireString(body, "ownerId");
    const description = optionalString(body, "description");
    const musicGenre = optionalString(body, "musicGenre");
    const imageUrl = optionalString(body, "imageUrl");
    const floorMapUrl = optionalString(body, "floorMapUrl");
    const contactEmail = requireContactEmail(body);
    const contactPhone = optionalContactPhone(body);

    const owner = await prisma.user.findUnique({ where: { id: ownerId } });
    if (owner === null) {
      throw new AppError("El usuario propietario (ownerId) no existe", 404);
    }

    const authUser = getAuthUser(req);
    if (authUser.role === UserRole.CLUB_ADMIN && ownerId !== authUser.sub) {
      throw new AppError("Solo podes crear boliches a tu nombre", 403);
    }

    const club = await prisma.club.create({
      data: {
        name,
        address,
        city,
        ownerId,
        description: description ?? null,
        musicGenre: musicGenre ?? null,
        imageUrl: imageUrl ?? null,
        floorMapUrl: floorMapUrl ?? null,
        contactEmail,
        contactPhone,
      },
    });
    sendSuccess(res, club, 201);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/clubs - Listado con busqueda por nombre (?search=) y filtro por
 * genero musical (?genre=). Solo devuelve boliches activos por defecto.
 */
export const listClubs = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const search = req.query["search"];
    const genre = req.query["genre"];

    const where: Prisma.ClubWhereInput = { isActive: true };
    if (typeof search === "string" && search.trim() !== "") {
      where.name = { contains: search.trim(), mode: "insensitive" };
    }
    if (typeof genre === "string" && genre.trim() !== "") {
      where.musicGenre = { equals: genre.trim(), mode: "insensitive" };
    }

    if (req.user?.role === UserRole.CLUB_ADMIN) {
      where.ownerId = req.user.sub;
    }

    const clubs = await prisma.club.findMany({
      where,
      orderBy: { name: "asc" },
    });
    sendSuccess(res, clubs);
  } catch (error) {
    next(error);
  }
};

/** GET /api/clubs/:id */
export const getClubById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = requireParam(req.params, "id");
    const club = await prisma.club.findUnique({
      where: { id },
      include: { tables: true, events: true },
    });
    if (club === null || club.isActive === false) {
      throw new AppError("Boliche no encontrado", 404);
    }
    const { tables, events, ...publicClub } = club;
    sendSuccess(res, {
      ...publicClub,
      events: events.filter((e) => e.isActive),
    });
  } catch (error) {
    next(error);
  }
};

/** PATCH /api/clubs/:id */
export const updateClub = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = requireParam(req.params, "id");
    if (req.user !== undefined) {
      await assertUserCanAccessClub(req, id);
    }
    const body = asRecord(req.body);

    const data: Prisma.ClubUpdateInput = {};
    const name = optionalString(body, "name");
    const description = optionalString(body, "description");
    const address = optionalString(body, "address");
    const city = optionalString(body, "city");
    const musicGenre = optionalString(body, "musicGenre");
    const imageUrl = optionalString(body, "imageUrl");
    const floorMapUrl = optionalString(body, "floorMapUrl");
    const contactEmailRaw = optionalString(body, "contactEmail");
    const contactPhoneRaw = body["contactPhone"];

    if (name !== undefined) data.name = name;
    if (description !== undefined) data.description = description;
    if (address !== undefined) data.address = address;
    if (city !== undefined) data.city = city;
    if (musicGenre !== undefined) data.musicGenre = musicGenre;
    if (imageUrl !== undefined) data.imageUrl = imageUrl;
    if (floorMapUrl !== undefined) data.floorMapUrl = floorMapUrl;
    if (contactEmailRaw !== undefined) {
      const email = normalizeEmail(contactEmailRaw);
      if (!email.includes("@") || !email.includes(".")) {
        throw new AppError("El email de contacto no es valido", 400);
      }
      data.contactEmail = email;
    }
    if (contactPhoneRaw !== undefined) {
      if (contactPhoneRaw === null || contactPhoneRaw === "") {
        data.contactPhone = null;
      } else {
        data.contactPhone = optionalContactPhone(body);
      }
    }

    if (Object.keys(data).length === 0) {
      throw new AppError("No se enviaron campos para actualizar", 400);
    }

    const club = await prisma.club.update({ where: { id }, data });
    sendSuccess(res, club);
  } catch (error) {
    next(error);
  }
};

/** DELETE /api/clubs/:id - Elimina el boliche y todos sus datos relacionados. */
export const deleteClub = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = requireParam(req.params, "id");
    await assertUserCanAccessClub(req, id);
    const club = await prisma.club.findUnique({ where: { id } });
    if (club === null) {
      throw new AppError("Boliche no encontrado", 404);
    }

    const activeReservations = await prisma.reservation.count({
      where: { clubId: id, ...occupyingReservationFilter() },
    });
    if (activeReservations > 0) {
      throw new AppError(
        "No se puede eliminar: el boliche tiene reservas activas",
        400
      );
    }

    const byClub = { clubId: id };
    const byClubReservation = { reservation: byClub };

    await prisma.$transaction([
      prisma.payment.deleteMany({ where: byClubReservation }),
      prisma.orderItem.deleteMany({
        where: { order: byClubReservation },
      }),
      prisma.order.deleteMany({ where: byClubReservation }),
      prisma.chatMessage.deleteMany({ where: byClubReservation }),
      prisma.loyaltyTransaction.deleteMany({ where: byClub }),
      prisma.reservationGuest.deleteMany({ where: byClubReservation }),
      prisma.reservation.deleteMany({ where: byClub }),
      prisma.product.deleteMany({ where: byClub }),
      prisma.eventNight.deleteMany({ where: byClub }),
      prisma.clubTable.deleteMany({ where: byClub }),
      prisma.club.delete({ where: { id } }),
    ]);

    sendSuccess(res, { deleted: true, id });
  } catch (error) {
    next(error);
  }
};
