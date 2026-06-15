import type { Request, Response, NextFunction, RequestHandler } from "express";
import type { UserRole } from "../generated/prisma/client";
import { verifyToken, type JwtPayload } from "../utils/jwt";
import { AppError } from "../utils/appError";

/** Devuelve el usuario autenticado o lanza 401. Usar dentro de controladores. */
export const getAuthUser = (req: Request): JwtPayload => {
  if (req.user === undefined) {
    throw new AppError("No autenticado", 401);
  }
  return req.user;
};

/**
 * Middleware de autenticacion: valida el JWT del header Authorization
 * (formato "Bearer <token>") y adjunta el usuario al request.
 */
export const authenticate: RequestHandler = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  try {
    const header = req.headers.authorization;
    if (header === undefined || !header.startsWith("Bearer ")) {
      throw new AppError("Token de autenticacion no provisto", 401);
    }
    const token = header.slice("Bearer ".length).trim();
    if (token === "") {
      throw new AppError("Token de autenticacion no provisto", 401);
    }

    try {
      req.user = verifyToken(token);
    } catch {
      throw new AppError("Token invalido o expirado", 401);
    }
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware de autorizacion por rol. Debe usarse despues de `authenticate`.
 * Ej: router.post("/", authenticate, authorize("CLUB_ADMIN"), handler)
 */
export const authorize =
  (...roles: UserRole[]): RequestHandler =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (req.user === undefined) {
      next(new AppError("No autenticado", 401));
      return;
    }
    if (roles.length > 0 && !roles.includes(req.user.role)) {
      next(new AppError("No tenes permisos para esta accion", 403));
      return;
    }
    next();
  };
