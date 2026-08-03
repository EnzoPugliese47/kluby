# Kluby — APK Android (Capacitor)

La app Android es un **WebView** que carga la web desplegada en Railway. Usa la misma API y base de datos que la versión web.

**URL de producción:** `https://kluby-production-2fa4.up.railway.app/app.html`

## Requisitos

1. **Node.js 20+** (ya lo tenés para el backend)
2. **Android Studio** (Ladybug o más nuevo): https://developer.android.com/studio  
   - Durante la instalación, incluí **Android SDK**, **SDK Platform** y **Android SDK Build-Tools**
3. **JDK 17** (Android Studio suele traerlo)

## Setup (una sola vez)

```powershell
cd c:\Users\Enzo\Desktop\kluby-b
npm install
npx cap add android
npm run cap:sync
```

Si `npm install` falla por certificados SSL en tu red, el proyecto incluye `.npmrc` con `strict-ssl=false` solo para este repo.

## Generar el APK

### Opción A — Android Studio (recomendada)

```powershell
npm run cap:open
```

En Android Studio:

1. Esperá que Gradle termine de sincronizar.
2. **Build → Build Bundle(s) / APK(s) → Build APK(s)**
3. El APK debug queda en:  
   `android/app/build/outputs/apk/debug/app-debug.apk`

Para instalar en el celular: copiá el APK, activá “Orígenes desconocidos” e instalá.

### Opción B — Línea de comandos

```powershell
cd android
.\gradlew assembleDebug
```

APK: `android/app/build/outputs/apk/debug/app-debug.apk`

## Instalar en tu celular

### Opción 1 — Desde la web (después de publicar el APK)

1. Compilá el APK (paso anterior).
2. En la PC:
   ```powershell
   npm run cap:publish-apk
   ```
3. Deploy a Railway (commit + push del archivo `public/downloads/kluby.apk`).
4. En el **celular**, abrí:  
   `https://kluby-production-2fa4.up.railway.app/#app-android`
5. Tocá **Descargar para Android** → permití instalar desde Chrome → **Instalar**.

### Opción 2 — Sin subir a la web (más rápido para probar)

1. Compilá el APK en Android Studio o con `.\gradlew assembleDebug`.
2. Pasá `app-debug.apk` al celular (USB, WhatsApp, Google Drive, etc.).
3. En Android: **Ajustes → Seguridad → Instalar apps desconocidas** (activá para Chrome o Archivos).
4. Abrí el APK desde el administrador de archivos y tocá **Instalar**.

La app necesita **internet**; usa el backend de Railway automáticamente.

### Cámara en Puerta (escaneo QR)

La pantalla **Puerta** usa la cámara del celular. Si no abre:

1. **Recompilá e instalá el APK** (el permiso de cámara va en la app nativa):
   ```powershell
   npm install
   npm run cap:sync
   npm run cap:open
   ```
   Android Studio → **Build → Build APK(s)** → instalá de nuevo.

2. En el celular: **Ajustes → Apps → Kluby → Permisos → Cámara → Permitir**.

3. En Puerta → pestaña **Escanear** → **Permitir cámara / reintentar**.

## Publicar el botón en la web

La home (`index.html`) tiene la sección **Instalá Kluby en tu celular** con enlace a `/downloads/kluby.apk`.

```powershell
npm run cap:publish-apk
git add public/downloads/kluby.apk
git commit -m "Publicar APK Android"
git push
```

El nav y el footer también enlazan a `/#app-android`.

## Scripts útiles

| Comando | Descripción |
|---------|-------------|
| `npm run cap:sync` | Copia `public/` y actualiza plugins nativos |
| `npm run cap:open` | Abre el proyecto en Android Studio |
| `npm run cap:run` | Compila e instala en emulador/dispositivo conectado |
| `npm run cap:publish-apk` | Copia el APK compilado a `public/downloads/kluby.apk` |

## Cambiar la URL del servidor

Editá `capacitor.config.ts`:

```ts
const PRODUCTION_URL = "https://kluby-production-2fa4.up.railway.app";
```

Luego:

```powershell
npm run cap:sync
```

## Usuarios de prueba (demo)

Contraseña: **`password123`**

| Email | Rol |
|-------|-----|
| `invitado1@kluby.com` | Cliente |
| `anfitrion@kluby.com` | Cliente (anfitrión) |
| `duenokluby1@kluby.com` | Admin boliche |

## Notas para la defensa

- La app **no empaqueta** el backend: necesita internet para hablar con Railway.
- Login, reservas y mapas funcionan igual que en el navegador.
- Para APK de release (Play Store): **Build → Generate Signed Bundle / APK** en Android Studio.

## Troubleshooting

| Problema | Solución |
|----------|----------|
| Pantalla en blanco | Verificá que Railway esté online y abrí la URL en Chrome del celular |
| Gradle sync failed | Android Studio → SDK Manager → instalá API 34+ y Build-Tools |
| `JAVA_HOME` no definido | Usá el JDK embebido de Android Studio |
| Cambiaste `public/` | Corré `npm run cap:sync` antes de rebuild |
