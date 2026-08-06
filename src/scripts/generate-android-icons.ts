/**
 * Genera íconos launcher Android desde resources/icon.png (1024+ recomendado).
 * Uso: npm run icons:android
 */
import fs from "fs";
import path from "path";
import sharp from "sharp";

const ROOT = path.join(__dirname, "..", "..");
const SOURCE = path.join(ROOT, "resources", "icon.png");
const RES = path.join(ROOT, "android", "app", "src", "main", "res");

const LAUNCHER: Record<string, number> = {
  "mipmap-mdpi": 48,
  "mipmap-hdpi": 72,
  "mipmap-xhdpi": 96,
  "mipmap-xxhdpi": 144,
  "mipmap-xxxhdpi": 192,
};

const FOREGROUND: Record<string, number> = {
  "mipmap-mdpi": 108,
  "mipmap-hdpi": 162,
  "mipmap-xhdpi": 216,
  "mipmap-xxhdpi": 324,
  "mipmap-xxxhdpi": 432,
};

const BG = { r: 0, g: 0, b: 0, alpha: 1 as const };

/** Legacy launcher: logo ~70% del cuadrado (similar a Telegram, X, etc.). */
const LAUNCHER_INSET = 0.14;
/** Adaptive foreground: safe zone Android 66/108 ≈ 19% margen por lado. */
const FOREGROUND_INSET = 0.19;

async function writeIcon(
  folder: string,
  name: string,
  size: number,
  insetRatio: number
): Promise<void> {
  const dir = path.join(RES, folder);
  fs.mkdirSync(dir, { recursive: true });
  const inset = Math.max(1, Math.round(size * insetRatio));
  const inner = size - inset * 2;

  await sharp(SOURCE)
    .resize(inner, inner, { fit: "contain", background: BG })
    .extend({ top: inset, bottom: inset, left: inset, right: inset, background: BG })
    .png()
    .toFile(path.join(dir, `${name}.png`));
}

async function main(): Promise<void> {
  if (!fs.existsSync(SOURCE)) {
    throw new Error(`Falta ${SOURCE}. Corré: npm run logo:process`);
  }

  for (const [folder, size] of Object.entries(LAUNCHER)) {
    await writeIcon(folder, "ic_launcher", size, LAUNCHER_INSET);
    await writeIcon(folder, "ic_launcher_round", size, LAUNCHER_INSET);
    console.log(`  ✓ ${folder} launcher ${size}px`);
  }

  for (const [folder, size] of Object.entries(FOREGROUND)) {
    await writeIcon(folder, "ic_launcher_foreground", size, FOREGROUND_INSET);
    console.log(`  ✓ ${folder} foreground ${size}px`);
  }

  const bgXml = path.join(RES, "values", "ic_launcher_background.xml");
  fs.writeFileSync(
    bgXml,
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#000000</color>\n</resources>\n`
  );
  console.log("  ✓ fondo adaptive icon #000000");
  console.log("\n[icons] Listo. Corré: npm run cap:sync");
}

main().catch((err) => {
  console.error("[icons] Error:", err);
  process.exitCode = 1;
});
