Colocá acá el APK compilado con el nombre exacto:

  kluby.apk

Cómo generarlo (desde la raíz del proyecto):

  1. npm run cap:open
  2. Android Studio → Build → Build APK(s)
  3. Copiá android/app/build/outputs/apk/debug/app-debug.apk → kluby.apk

O en PowerShell:

  Copy-Item android\app\build\outputs\apk\debug\app-debug.apk public\downloads\kluby.apk

Después deployá a Railway para que el botón "Descargar app" en la web funcione.
