/**
 * Repara imágenes rotas: migra archivos locales a StoredAsset (PostgreSQL)
 * y actualiza clubs/eventos para usar /api/assets/:id
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../lib/prisma";
import { saveStoredAsset } from "../utils/storedAsset";

const PUBLIC = path.join(process.cwd(), "public");

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

const fileToAsset = async (relativePath: string): Promise<string | null> => {
  const full = path.join(PUBLIC, relativePath);
  try {
    const buffer = await readFile(full);
    if (buffer.length < 100) return null;
    const ext = path.extname(full).slice(1).toLowerCase();
    const mime = MIME[ext];
    if (!mime) return null;
    return saveStoredAsset(mime, buffer, path.basename(full));
  } catch {
    return null;
  }
};

const isLocalMedia = (url: string | null | undefined): url is string =>
  typeof url === "string" &&
  (url.startsWith("/logos/") || url.startsWith("/maps/"));

const isDbAsset = (url: string | null | undefined): boolean =>
  typeof url === "string" && url.startsWith("/api/assets/");

async function main() {
  console.log("Conexion OK. Reparando imagenes...\n");

  const [clubs, events] = await Promise.all([
    prisma.club.findMany({ where: { isActive: true } }),
    prisma.eventNight.findMany({ where: { isActive: true } }),
  ]);

  let fixed = 0;

  for (const club of clubs) {
    if (isDbAsset(club.imageUrl)) continue;
    if (!isLocalMedia(club.imageUrl)) continue;

    const rel = club.imageUrl.slice(1);
    let url = await fileToAsset(rel);
    if (!url) {
      const logos = (await readdir(path.join(PUBLIC, "logos"))).filter((f) =>
        /\.(png|jpe?g|webp)$/i.test(f)
      );
      const pick = logos.find((f) => !f.includes("70")) ?? logos[0];
      if (pick) url = await fileToAsset(`logos/${pick}`);
    }
    if (url) {
      await prisma.club.update({ where: { id: club.id }, data: { imageUrl: url } });
      console.log(`  Club "${club.name}" -> ${url}`);
      fixed++;
    } else {
      console.warn(`  Club "${club.name}": sin imagen disponible`);
    }
  }

  for (const event of events) {
    if (isDbAsset(event.backgroundImage)) continue;
    if (!isLocalMedia(event.backgroundImage)) continue;

    const rel = event.backgroundImage.slice(1);
    let url = await fileToAsset(rel);

    if (!url) {
      const maps = await readdir(path.join(PUBLIC, "maps"));
      const visa = maps.find((f) => f.toLowerCase() === "visa.png");
      const preferVisa = /visa/i.test(event.name);
      const pick =
        (preferVisa && visa ? visa : null) ??
        maps.find((f) => /\.(png|jpe?g|webp)$/i.test(f) && f.startsWith("map-")) ??
        maps.find((f) => /\.(png|jpe?g|webp)$/i.test(f));
      if (pick) url = await fileToAsset(`maps/${pick}`);
    }

    if (url) {
      await prisma.eventNight.update({
        where: { id: event.id },
        data: { backgroundImage: url },
      });
      console.log(`  Evento "${event.name}" -> ${url}`);
      fixed++;
    } else {
      console.warn(`  Evento "${event.name}": sin mapa disponible`);
    }
  }

  const assets = await prisma.storedAsset.count();
  console.log(`\nListo: ${fixed} imagen(es) reparada(s). Total en DB: ${assets}`);
}

main()
  .catch((e) => {
    console.error("Error:", e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
