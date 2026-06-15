import { createHmac, timingSafeEqual } from "node:crypto";
import type { UserRole } from "../generated/prisma/client";
import { env } from "../config/env";

/**
 * Implementacion minima de JWT (HS256) usando solo el modulo nativo `crypto`.
 * Se evita la dependencia externa `jsonwebtoken` (que ademas fallaba al
 * instalarse por restricciones de red/SSL del entorno).
 */

/** Datos que viajan firmados dentro del JWT. */
export interface JwtPayload {
  sub: string; // id del usuario
  role: UserRole;
  email: string;
}

interface FullPayload extends JwtPayload {
  iat: number;
  exp: number;
}

const base64UrlEncode = (input: Buffer | string): string =>
  Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const base64UrlDecode = (input: string): Buffer =>
  Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/"), "base64");

const sign = (data: string): string =>
  base64UrlEncode(createHmac("sha256", env.jwtSecret).update(data).digest());

/** Convierte vencimientos tipo "7d", "12h", "30m", "45s" o numero a segundos. */
const expiresInToSeconds = (value: string): number => {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  const match = /^(\d+)([smhd])$/.exec(value.trim());
  if (match === null) return 7 * 24 * 60 * 60; // fallback: 7 dias
  const amount = Number(match[1]);
  const unit = match[2];
  const factor = unit === "s" ? 1 : unit === "m" ? 60 : unit === "h" ? 3600 : 86400;
  return amount * factor;
};

export const signToken = (payload: JwtPayload): string => {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: FullPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInToSeconds(env.jwtExpiresIn),
  };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
  const signature = sign(`${encodedHeader}.${encodedPayload}`);
  return `${encodedHeader}.${encodedPayload}.${signature}`;
};

export const verifyToken = (token: string): JwtPayload => {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Token malformado");
  }
  const [encodedHeader, encodedPayload, signature] = parts as [
    string,
    string,
    string,
  ];

  const expected = sign(`${encodedHeader}.${encodedPayload}`);
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signature);
  if (
    expectedBuf.length !== actualBuf.length ||
    !timingSafeEqual(expectedBuf, actualBuf)
  ) {
    throw new Error("Firma invalida");
  }

  const decoded = JSON.parse(base64UrlDecode(encodedPayload).toString("utf8")) as
    | Partial<FullPayload>
    | null;
  if (
    decoded === null ||
    typeof decoded.sub !== "string" ||
    typeof decoded.exp !== "number"
  ) {
    throw new Error("Token invalido");
  }
  if (Math.floor(Date.now() / 1000) >= decoded.exp) {
    throw new Error("Token expirado");
  }

  return {
    sub: decoded.sub,
    role: decoded.role as UserRole,
    email: decoded.email as string,
  };
};
