import type { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/appError";
import { sendSuccess } from "../utils/apiResponse";
import { asRecord, requireString } from "../utils/validation";
import { assertLogoDimensions, assertProfileDimensions, assertFlyerDimensions } from "../utils/imageDimensions";
import { saveStoredAsset } from "../utils/storedAsset";

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

/**
 * POST /api/uploads/map
 * Guarda el plano en la base de datos y devuelve /api/assets/:id
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
    const url = await saveStoredAsset(mime, buffer, `map.${ext}`);
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
 * Logo de boliche: maximo 500x500 px. Se guarda en la base de datos.
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
      const url = await saveStoredAsset(mime, buffer, `logo.${ext}`);
      sendSuccess(res, { url, width: dims.width, height: dims.height }, 201);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Imagen invalida";
      throw new AppError(msg, 400);
    }
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/uploads/profile
 * Foto de perfil recortada en el cliente (400×400). Cualquier usuario autenticado.
 */
export const uploadProfile = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const body = asRecord(req.body);
    const dataUrl = requireString(body, "image");
    const { mime, buffer, ext } = parseDataUrlImage(dataUrl);
    if (buffer.length > 2 * 1024 * 1024) {
      throw new AppError("La foto supera el limite de 2 MB", 400);
    }
    try {
      const dims = assertProfileDimensions(buffer, mime);
      const url = await saveStoredAsset(mime, buffer, `profile.${ext}`);
      sendSuccess(res, { url, width: dims.width, height: dims.height }, 201);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Imagen invalida";
      throw new AppError(msg, 400);
    }
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/uploads/flyer
 * Flyer de evento (3:4, recortado en el cliente). Max 1080x1440 px.
 */
export const uploadFlyer = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const body = asRecord(req.body);
    const dataUrl = requireString(body, "image");
    const { mime, buffer, ext } = parseDataUrlImage(dataUrl);
    if (buffer.length > 3 * 1024 * 1024) {
      throw new AppError("El flyer supera el limite de 3 MB", 400);
    }
    try {
      const dims = assertFlyerDimensions(buffer, mime);
      const url = await saveStoredAsset(mime, buffer, `flyer.${ext}`);
      sendSuccess(res, { url, width: dims.width, height: dims.height }, 201);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Imagen invalida";
      throw new AppError(msg, 400);
    }
  } catch (error) {
    next(error);
  }
};
