import { createApp } from "./app";
import { env } from "./config/env";
import { prisma } from "./lib/prisma";

import { markNoShows } from "./jobs/markNoShows";

const NO_SHOW_INTERVAL_MS = 15 * 60 * 1000;

const app = createApp();

const host = "0.0.0.0";
const server = app.listen(env.port, host, () => {
  console.log(`[Kluby] API escuchando en http://${host}:${env.port}`);
  console.log(`[Kluby] Entorno: ${env.nodeEnv}`);
});

const runNoShowJob = (): void => {
  void markNoShows()
    .then((count) => {
      if (count > 0) {
        console.log(`[Kluby] No-show: ${count} reserva(s) marcada(s)`);
      }
    })
    .catch((err: unknown) => {
      console.error("[Kluby] Error en job no-show:", err);
    });
};

runNoShowJob();
const noShowTimer = setInterval(runNoShowJob, NO_SHOW_INTERVAL_MS);

/** Cierre ordenado: libera el pool de Prisma ante senales del sistema. */
const shutdown = async (signal: string): Promise<void> => {
  console.log(`[Kluby] Recibida senal ${signal}, cerrando servidor...`);
  clearInterval(noShowTimer);
  server.close(() => {
    console.log("[Kluby] Servidor HTTP cerrado.");
  });
  await prisma.$disconnect();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
