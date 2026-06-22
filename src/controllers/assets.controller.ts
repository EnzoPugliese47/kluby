import type { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";
import { AppError } from "../utils/appError";
import { requireParam } from "../utils/validation";

/** GET /api/assets/:id - Sirve una imagen almacenada en la base de datos. */
export const getStoredAsset = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = requireParam(req.params, "id");
    const asset = await prisma.storedAsset.findUnique({ where: { id } });
    if (asset === null) {
      throw new AppError("Imagen no encontrada", 404);
    }

    res.setHeader("Content-Type", asset.mime);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("Content-Length", asset.size);
    res.send(Buffer.from(asset.data));
  } catch (error) {
    next(error);
  }
};
