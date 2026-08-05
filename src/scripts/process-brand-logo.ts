/**
 * Recorta el logo, saca el fondo negro (web) y prepara icon.png para Android.
 * Uso: npm run logo:process
 */
import fs from "fs";
import path from "path";
import sharp from "sharp";

const ROOT = path.join(__dirname, "..", "..");
const RAW = path.join(ROOT, "resources", "logo-source.png");
const WEB = path.join(ROOT, "public", "brand", "kluby-logo.png");
const ICON = path.join(ROOT, "resources", "icon.png");

const BLACK_THRESHOLD = 28;

function readPx(data: Buffer, offset: number): [r: number, g: number, b: number, a: number] {
  return [data[offset] ?? 0, data[offset + 1] ?? 0, data[offset + 2] ?? 0, data[offset + 3] ?? 0];
}

async function contentBounds(input: string): Promise<{ left: number; top: number; width: number; height: number }> {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      const [r, g, b, a] = readPx(data, i);
      if (a > 0 && (r > BLACK_THRESHOLD || g > BLACK_THRESHOLD || b > BLACK_THRESHOLD)) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  const pad = Math.round(Math.max(maxX - minX, maxY - minY) * 0.04);
  const left = Math.max(0, minX - pad);
  const top = Math.max(0, minY - pad);
  const right = Math.min(width - 1, maxX + pad);
  const bottom = Math.min(height - 1, maxY + pad);

  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

async function keyBlackTransparent(input: Buffer, channels: number): Promise<Buffer> {
  const data = Buffer.from(input);
  for (let i = 0; i < data.length; i += channels) {
    const [r, g, b] = readPx(data, i);
    if (r <= BLACK_THRESHOLD && g <= BLACK_THRESHOLD && b <= BLACK_THRESHOLD) {
      data[i + 3] = 0;
    }
  }
  return data;
}

async function main(): Promise<void> {
  const source = fs.existsSync(RAW) ? RAW : WEB;
  if (!fs.existsSync(source)) {
    throw new Error("No hay logo en resources/logo-source.png ni public/brand/kluby-logo.png");
  }

  const bounds = await contentBounds(source);
  const cropped = await sharp(source).extract(bounds).png().toBuffer();

  const { data, info } = await sharp(cropped).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const keyed = await keyBlackTransparent(data, info.channels);

  await sharp(keyed, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toFile(WEB);
  console.log(`  ✓ web ${path.relative(ROOT, WEB)} (${info.width}x${info.height}, sin fondo)`);

  await sharp(cropped)
    .resize(992, 992, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 1 } })
    .extend({
      top: 16,
      bottom: 16,
      left: 16,
      right: 16,
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    })
    .png()
    .toFile(ICON);
  console.log(`  ✓ icon ${path.relative(ROOT, ICON)} (1024, ~97% fill, fondo negro)`);
  console.log("\n[logo] Listo. Corré: npm run icons:android && npm run cap:sync");
}

main().catch((err) => {
  console.error("[logo] Error:", err);
  process.exitCode = 1;
});
