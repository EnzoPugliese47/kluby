import type { Request, Response, NextFunction } from "express";
import { Prisma } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../utils/appError";
import { sendSuccess } from "../utils/apiResponse";
import {
  asRecord,
  optionalNumber,
  optionalString,
  requireNumber,
  requireParam,
  requireString,
} from "../utils/validation";

/** GET /api/events/:eventId/products - Carta de botellas del evento. */
export const listProductsByEvent = async (
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

    const products = await prisma.product.findMany({
      where: { eventId, isActive: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });
    sendSuccess(res, products);
  } catch (error) {
    next(error);
  }
};

/** POST /api/events/:eventId/products - Alta de botella en la carta del evento. */
export const createProductForEvent = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const eventId = requireParam(req.params, "eventId");
    const body = asRecord(req.body);
    const name = requireString(body, "name");
    const price = requireNumber(body, "price");
    const stock = optionalNumber(body, "stock") ?? 0;
    const category = optionalString(body, "category");
    const description = optionalString(body, "description");
    const imageUrl = optionalString(body, "imageUrl");

    if (price < 0) throw new AppError("El precio no puede ser negativo", 400);
    if (stock < 0 || !Number.isInteger(stock)) {
      throw new AppError("El stock debe ser un entero >= 0", 400);
    }

    const event = await prisma.eventNight.findUnique({ where: { id: eventId } });
    if (event === null) {
      throw new AppError("Evento no encontrado", 404);
    }

    const product = await prisma.product.create({
      data: {
        clubId: event.clubId,
        eventId,
        name,
        price: new Prisma.Decimal(price),
        stock,
        category: category ?? null,
        description: description ?? null,
        imageUrl: imageUrl ?? null,
      },
    });
    sendSuccess(res, product, 201);
  } catch (error) {
    next(error);
  }
};

/** POST /api/clubs/:clubId/products - Alta de producto en el catalogo. */
export const createProduct = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const clubId = requireParam(req.params, "clubId");
    const body = asRecord(req.body);
    const name = requireString(body, "name");
    const price = requireNumber(body, "price");
    const stock = requireNumber(body, "stock");
    const category = optionalString(body, "category");
    const description = optionalString(body, "description");
    const imageUrl = optionalString(body, "imageUrl");

    if (price < 0) throw new AppError("El precio no puede ser negativo", 400);
    if (stock < 0 || !Number.isInteger(stock)) {
      throw new AppError("El stock debe ser un entero >= 0", 400);
    }

    const club = await prisma.club.findUnique({ where: { id: clubId } });
    if (club === null) throw new AppError("Boliche no encontrado", 404);

    const product = await prisma.product.create({
      data: {
        clubId,
        name,
        price: new Prisma.Decimal(price),
        stock,
        category: category ?? null,
        description: description ?? null,
        imageUrl: imageUrl ?? null,
      },
    });
    sendSuccess(res, product, 201);
  } catch (error) {
    next(error);
  }
};

/** GET /api/clubs/:clubId/products */
export const listProductsByClub = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const clubId = requireParam(req.params, "clubId");
    const products = await prisma.product.findMany({
      where: { clubId, isActive: true },
      orderBy: { name: "asc" },
    });
    sendSuccess(res, products);
  } catch (error) {
    next(error);
  }
};

/** PATCH /api/products/:id */
export const updateProduct = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = requireParam(req.params, "id");
    const body = asRecord(req.body);

    const data: Prisma.ProductUpdateInput = {};
    const name = optionalString(body, "name");
    const category = optionalString(body, "category");
    const description = optionalString(body, "description");
    const imageUrl = optionalString(body, "imageUrl");
    const price = optionalNumber(body, "price");
    const stock = optionalNumber(body, "stock");

    if (name !== undefined) data.name = name;
    if (category !== undefined) data.category = category;
    if (description !== undefined) data.description = description;
    if (imageUrl !== undefined) data.imageUrl = imageUrl;
    if (price !== undefined) {
      if (price < 0) throw new AppError("El precio no puede ser negativo", 400);
      data.price = new Prisma.Decimal(price);
    }
    if (stock !== undefined) {
      if (stock < 0 || !Number.isInteger(stock)) {
        throw new AppError("El stock debe ser un entero >= 0", 400);
      }
      data.stock = stock;
    }

    if (Object.keys(data).length === 0) {
      throw new AppError("No se enviaron campos para actualizar", 400);
    }

    const product = await prisma.product.update({ where: { id }, data });
    sendSuccess(res, product);
  } catch (error) {
    next(error);
  }
};

/** DELETE /api/products/:id - Baja logica. */
export const deactivateProduct = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = requireParam(req.params, "id");
    const product = await prisma.product.update({
      where: { id },
      data: { isActive: false },
    });
    sendSuccess(res, product);
  } catch (error) {
    next(error);
  }
};
