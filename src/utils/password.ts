import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

/**
 * Hashing de contrasenas con scrypt (incluido en Node, sin dependencias
 * externas). Formato almacenado: "<saltHex>:<hashHex>".
 *
 * Nota: para produccion se recomienda evaluar bcrypt/argon2. Aqui usamos
 * scrypt para mantener cero dependencias adicionales en esta iteracion.
 */

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;

export const hashPassword = async (plain: string): Promise<string> => {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scryptAsync(plain, salt, KEY_LENGTH)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
};

export const verifyPassword = async (
  plain: string,
  stored: string
): Promise<boolean> => {
  const [salt, hashHex] = stored.split(":");
  if (salt === undefined || hashHex === undefined) return false;

  const derived = (await scryptAsync(plain, salt, KEY_LENGTH)) as Buffer;
  const storedBuffer = Buffer.from(hashHex, "hex");

  if (storedBuffer.length !== derived.length) return false;
  return timingSafeEqual(storedBuffer, derived);
};
