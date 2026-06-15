import { createHash, randomBytes } from "node:crypto";

/**
 * Tokens de recuperacion de contrasena.
 *
 * Se entrega al usuario un token de alta entropia (texto plano) y en la base
 * se guarda solo su hash SHA-256. Asi, aunque se filtre la tabla, los tokens
 * no son utilizables. (No requiere salt por ser un valor aleatorio largo.)
 */

export const createResetToken = (): { token: string; tokenHash: string } => {
  const token = randomBytes(32).toString("hex");
  return { token, tokenHash: hashResetToken(token) };
};

export const hashResetToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");
