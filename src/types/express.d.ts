import type { JwtPayload } from "../utils/jwt";

// Extiende el Request de Express para exponer el usuario autenticado.
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export {};
