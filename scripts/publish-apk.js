/**
 * Copia el APK debug compilado a public/downloads/kluby.apk
 * para que la web sirva el botón "Descargar app".
 */
const fs = require("node:fs");
const path = require("node:path");

const src = path.join(__dirname, "..", "android", "app", "build", "outputs", "apk", "debug", "app-debug.apk");
const dest = path.join(__dirname, "..", "public", "downloads", "kluby.apk");

if (!fs.existsSync(src)) {
  console.error("No encontré el APK. Compilalo primero:");
  console.error("  cd android && .\\gradlew assembleDebug");
  console.error("  (o Build → Build APK en Android Studio)");
  process.exit(1);
}

fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.copyFileSync(src, dest);
console.log("APK publicado en public/downloads/kluby.apk");
console.log("Subí los cambios a Railway para que el botón en la web funcione.");
