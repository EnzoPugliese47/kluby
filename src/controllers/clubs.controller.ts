import type { Request, Response, NextFunction } from "express";
import { Prisma } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../utils/appError";
import { sendSuccess } from "../utils/apiResponse";
import { occupyingReservationFilter } from "../utils/reservation";
import {
  asRecord,
  optionalString,
  requireParam,
  requireString,
} from "../utils/validation";

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

    const owner = await prisma.user.findUnique({ where: { id: ownerId } });
    if (owner === null) {
      throw new AppError("El usuario propietario (ownerId) no existe", 404);
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
    if (club === null) {
      throw new AppError("Boliche no encontrado", 404);
    }
    sendSuccess(res, club);
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
    const body = asRecord(req.body);

    const data: Prisma.ClubUpdateInput = {};
    const name = optionalString(body, "name");
    const description = optionalString(body, "description");
    const address = optionalString(body, "address");
    const city = optionalString(body, "city");
    const musicGenre = optionalString(body, "musicGenre");
    const imageUrl = optionalString(body, "imageUrl");
    const floorMapUrl = optionalString(body, "floorMapUrl");

    if (name !== undefined) data.name = name;
    if (description !== undefined) data.description = description;
    if (address !== undefined) data.address = address;
    if (city !== undefined) data.city = city;
    if (musicGenre !== undefined) data.musicGenre = musicGenre;
    if (imageUrl !== undefined) data.imageUrl = imageUrl;
    if (floorMapUrl !== undefined) data.floorMapUrl = floorMapUrl;

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
