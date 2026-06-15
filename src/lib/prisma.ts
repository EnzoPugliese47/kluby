import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { env, isProduction } from "../config/env";

/**
 * Cliente Prisma como singleton para evitar abrir multiples pools de
 * conexiones (especialmente con hot-reload en desarrollo).
 *
 * Prisma 7 usa driver adapters (cliente sin motor Rust): la conexion a
 * PostgreSQL/Supabase se realiza a traves de @prisma/adapter-pg.
 */

const createPrismaClient = (): PrismaClient => {
  // ssl.rejectUnauthorized=false: la conexion se cifra pero no se verifica la
  // cadena de certificados. Necesario en entornos con inspeccion SSL (proxy
  // corporativo con certificado self-signed) y equivale a sslmode=require.
  const adapter = new PrismaPg({
    connectionString: env.databaseUrl,
    ssl: { rejectUnauthorized: false },
  });
  return new PrismaClient({
    adapter,
    log: isProduction ? ["error"] : ["warn", "error"],
  });
};

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (!isProduction) {
  globalForPrisma.prisma = prisma;
}
