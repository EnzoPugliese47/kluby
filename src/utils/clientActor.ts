import { UserRole } from "../generated/prisma/client";
import { AppError } from "./appError";
import type { JwtPayload } from "./jwt";

/** Acciones B2C (reservar, unirse, pagar como cliente). Solo rol CLIENT. */
export const assertClientActor = (auth: JwtPayload): void => {
  if (auth.role !== UserRole.CLIENT) {
    throw new AppError(
      auth.role === UserRole.CLUB_ADMIN
        ? "Como dueño de boliche solo podés visualizar la app cliente"
        : "Esta acción solo está disponible para usuarios cliente",
      403
    );
  }
};
