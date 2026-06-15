import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/appError";
import { sendSuccess } from "../utils/apiResponse";
import { asRecord, requireString } from "../utils/validation";
import { assertLogoDimensions } from "../utils/imageDimensions";

const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
};

const parseDataUrlImage = (dataUrl: string): { mime: string; buffer: Buffer; ext: string } => {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (match === null) {
    throw new AppError("La imagen debe ser un data URL base64 valido", 400);
  }
  const mime = match[1] ?? "";
  const base64 = match[2] ?? "";
  const ext = MIME_EXT[mime];
  if (ext === undefined) {
    throw new AppError("Formato no soportado", 400);
  }
  return { mime, buffer: Buffer.from(base64, "base64"), ext };
};

const savePublicImage = async (
  subdir: string,
  prefix: string,
  ext: string,
  buffer: Buffer
): Promise<string> => {
  const dir = path.join(__dirname, "..", "..", "public", subdir);
  await mkdir(dir, { recursive: true });
  const filename = `${prefix}-${Date.now()}-${randomBytes(4).toString("hex")}.${ext}`;
  await writeFile(path.join(dir, filename), buffer);
  return `/${subdir}/${filename}`;
};

/**
 * POST /api/uploads/map
 * Recibe una imagen como data URL base64 y la guarda en /public/maps,
 * devolviendo la URL publica para usar como fondo de un evento.
 * (Evita dependencias externas de subida de archivos.)
 */
export const uploadMap = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const body = asRecord(req.body);
    const dataUrl = requireString(body, "image");
    const { mime, buffer, ext } = parseDataUrlImage(dataUrl);
    if (buffer.length > 8 * 1024 * 1024) {
      throw new AppError("La imagen supera el limite de 8 MB", 400);
    }
    const url = await savePublicImage("maps", "map", ext, buffer);
    sendSuccess(res, { url }, 201);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Formato")) {
      next(new AppError(error.message, 400));
      return;
    }
    next(error);
  }
};

/**
 * POST /api/uploads/logo
 * Logo de boliche: maximo 500x500 px. Se guarda en /public/logos.
 */
export const uploadLogo = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const body = asRecord(req.body);
    const dataUrl = requireString(body, "image");
    const { mime, buffer, ext } = parseDataUrlImage(dataUrl);
    if (buffer.length > 2 * 1024 * 1024) {
      throw new AppError("El logo supera el limite de 2 MB", 400);
    }
    try {
      const dims = assertLogoDimensions(buffer, mime);
      const url = await savePublicImage("logos", "logo", ext, buffer);
      sendSuccess(res, { url, width: dims.width, height: dims.height }, 201);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Imagen invalida";
      throw new AppError(msg, 400);
    }
  } catch (error) {
    next(error);
  }
};
