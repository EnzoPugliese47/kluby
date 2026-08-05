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

async function writePng(folder: string, name: string, size: number): Promise<void> {
  const dir = path.join(RES, folder);
  fs.mkdirSync(dir, { recursive: true });
  await sharp(SOURCE)
    .resize(size, size, { fit: "cover" })
    .png()
    .toFile(path.join(dir, `${name}.png`));
}

async function main(): Promise<void> {
  if (!fs.existsSync(SOURCE)) {
    throw new Error(`Falta ${SOURCE}. Copiá el logo a resources/icon.png`);
  }

  for (const [folder, size] of Object.entries(LAUNCHER)) {
    await writePng(folder, "ic_launcher", size);
    await writePng(folder, "ic_launcher_round", size);
    console.log(`  ✓ ${folder} launcher ${size}px`);
  }

  for (const [folder, size] of Object.entries(FOREGROUND)) {
    await writePng(folder, "ic_launcher_foreground", size);
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
