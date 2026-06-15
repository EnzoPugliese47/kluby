import type { ErrorRequestHandler, RequestHandler } from "express";
import { Prisma } from "../generated/prisma/client";
import { AppError } from "../utils/appError";
import { sendError } from "../utils/apiResponse";
import { isProduction } from "../config/env";

/** Middleware 404 para rutas no encontradas. */
export const notFoundHandler: RequestHandler = (req, res) => {
  sendError(res, `Ruta no encontrada: ${req.method} ${req.originalUrl}`, 404);
};

/**
 * Manejador central de errores. Traduce errores de negocio (AppError) y
 * errores conocidos de Prisma a codigos HTTP y mensajes JSON claros.
 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    sendError(res, err.message, err.statusCode);
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case "P2002": {
        const target = err.meta?.["target"];
        const field = Array.isArray(target) ? target.join(", ") : "campo unico";
        sendError(res, `Ya existe un registro con ese valor (${field})`, 409);
        return;
      }
      case "P2025":
        sendError(res, "El registro solicitado no existe", 404);
        return;
      case "P2003":
        sendError(res, "Referencia invalida: el recurso relacionado no existe", 400);
        return;
      default:
        sendError(res, `Error de base de datos (${err.code})`, 400);
        return;
    }
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    sendError(res, "Datos invalidos para la operacion en base de datos", 400);
    return;
  }

  // Error de parseo del body JSON (body-parser / express.json).
  if (
    err instanceof SyntaxError &&
    typeof err === "object" &&
    "type" in err &&
    (err as { type?: unknown }).type === "entity.parse.failed"
  ) {
    sendError(res, "El cuerpo de la peticion no es un JSON valido", 400);
    return;
  }

  const message =
    err instanceof Error ? err.message : "Error interno del servidor";
  if (!isProduction) {
    console.error("[Kluby] Error no controlado:", err);
  }
  sendError(res, isProduction ? "Error interno del servidor" : message, 500);
};
