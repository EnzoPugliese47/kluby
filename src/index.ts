import { createApp } from "./app";
import { env } from "./config/env";
import { prisma } from "./lib/prisma";

const app = createApp();

const server = app.listen(env.port, () => {
  console.log(`[Kluby] API escuchando en http://localhost:${env.port}`);
  console.log(`[Kluby] Entorno: ${env.nodeEnv}`);
});

/** Cierre ordenado: libera el pool de Prisma ante senales del sistema. */
const shutdown = async (signal: string): Promise<void> => {
  console.log(`[Kluby] Recibida senal ${signal}, cerrando servidor...`);
  server.close(() => {
    console.log("[Kluby] Servidor HTTP cerrado.");
  });
  await prisma.$disconnect();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
