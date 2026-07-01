import { statSync } from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import type { PrismaClient as PrismaClientType } from "../generated/prisma/client";
import { env, isProduction } from "../config/env";

/**
 * Cliente Prisma como singleton para evitar abrir multiples pools de
 * conexiones (especialmente con hot-reload en desarrollo).
 */

/** Quita modulos generados de require.cache tras `prisma generate`. */
const bustGeneratedPrismaCache = (): void => {
  for (const key of Object.keys(require.cache)) {
    if (key.includes(`${path.sep}generated${path.sep}prisma${path.sep}`)) {
      delete require.cache[key];
    }
  }
};

const loadPrismaClientClass = (): typeof PrismaClientType => {
  bustGeneratedPrismaCache();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("../generated/prisma/client").PrismaClient as typeof PrismaClientType;
};

const createPrismaClient = (): PrismaClientType => {
  const PrismaClient = loadPrismaClientClass();
  const adapter = new PrismaPg({
    connectionString: env.databaseUrl,
    ssl: { rejectUnauthorized: false },
  });
  return new PrismaClient({
    adapter,
    log: isProduction ? ["error"] : ["warn", "error"],
  });
};

/** En dev, invalida el singleton si cambio schema.prisma o el client generado. */
const getPrismaClientKey = (): string => {
  try {
    const schemaPath = path.join(process.cwd(), "prisma", "schema.prisma");
    const clientPath = path.join(process.cwd(), "src", "generated", "prisma", "client.ts");
    return `${statSync(schemaPath).mtimeMs}-${statSync(clientPath).mtimeMs}`;
  } catch {
    return "0";
  }
};

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClientType | undefined;
  prismaClientKey?: string;
};

if (!isProduction) {
  const clientKey = getPrismaClientKey();
  if (globalForPrisma.prismaClientKey !== clientKey) {
    void globalForPrisma.prisma?.$disconnect();
    globalForPrisma.prisma = undefined;
    globalForPrisma.prismaClientKey = clientKey;
    bustGeneratedPrismaCache();
  }
}

export const prisma: PrismaClientType =
  globalForPrisma.prisma ?? createPrismaClient();

if (!isProduction) {
  globalForPrisma.prisma = prisma;
}
