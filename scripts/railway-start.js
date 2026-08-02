/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Arranque en Railway: migraciones + servidor con logs claros.
 */
const { execSync } = require("node:child_process");

const log = (msg) => console.log(`[Kluby:start] ${msg}`);

if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.trim()) {
  console.error("[Kluby:start] ERROR: DATABASE_URL no esta definida o esta vacia.");
  process.exit(1);
}

log("Ejecutando prisma migrate deploy...");
try {
  execSync("npx prisma migrate deploy", { stdio: "inherit" });
} catch (err) {
  console.error("[Kluby:start] ERROR: prisma migrate deploy fallo.");
  process.exit(1);
}

log("Iniciando servidor Node...");
require("../dist/index.js");
