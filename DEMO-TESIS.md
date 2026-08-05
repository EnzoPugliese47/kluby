# Kluby — Guía de presentación de tesis (jueves)

**URL de producción (Railway):**  
https://kluby-production-2fa4.up.railway.app

**Contraseña de todas las cuentas demo:** `password123`

La base de datos está en **Supabase**. Railway solo sirve el código; los usuarios, boliches y reservas son los mismos que en tu PC si usás la misma `DATABASE_URL`.

---

## Qué llevás el día del final

| Item | Para qué |
|------|----------|
| Notebook con internet | Abrir Railway (plan principal) |
| Celular con APK (opcional) | Mostrar app nativa → abre en **Inicio**, no login |
| `.env` en pendrive (backup) | Plan B: `npm run dev` local + misma Supabase |
| Este archivo impreso o en el celular | Guion y cuentas demo |
| 5 min antes | Corré `npm run smoke:tesis-demo` y probá login con **anfitrion** |

**No ejecutes** `npm run seed` en producción — borra datos.

---

## URLs importantes (Railway)

| Rol | URL |
|-----|-----|
| Inicio / landing | https://kluby-production-2fa4.up.railway.app/ |
| Login (con cuentas demo) | https://kluby-production-2fa4.up.railway.app/login.html |
| App cliente | https://kluby-production-2fa4.up.railway.app/app.html |
| Panel dueño / admin | https://kluby-production-2fa4.up.railway.app/panel.html |
| Puerta / QR | https://kluby-production-2fa4.up.railway.app/staff.html |
| Health check API | https://kluby-production-2fa4.up.railway.app/api/health |

En el login, expandí **«Cuentas demo · Tesis»** y entrá con un clic.

**APK Android:** arranca en la **home pública** (explorar sin login). Login solo al reservar.

---

## Cuentas demo

| Rol | Email | Qué mostrar |
|-----|-------|-------------|
| Cliente / anfitrión | `anfitrion@kluby.com` | Reservar mesa, pagar, QR, Kluby Points, campana |
| Invitado | `invitado1@kluby.com` | Mesa abierta, postularse, pagar parte, chat |
| Segundo cliente | `invitado2@kluby.com` | Reservas limpias (sin eventos pasados falsos) |
| Dueño Kora | `duenokluby1@kluby.com` | Panel, eventos, estadísticas |
| Puerta | `puerta@kluby.com` | Escanear QR, check-in, cerrar mesa |
| Super admin | `admin@kluby.com` | Todos los boliches |

---

## Guion sugerido (~10–12 min)

### 1. Intro (1 min)
- Kluby: reservas VIP de mesas en boliches.
- Stack: Node/Express, TypeScript, Prisma, PostgreSQL (Supabase), frontend vanilla, deploy Railway, APK Capacitor.
- Mostrá la **landing** o la **APK** abriendo en Inicio (sin pedir login).

### 2. Flujo cliente — reserva (3 min)
1. **Empezar / Ingresar** → **Cuentas demo** → **anfitrion@kluby.com**.
2. **Explorar** → **Kora** → evento futuro (ej. Kora FEST House).
3. Mapa interactivo → elegir mesa disponible.
4. Mostrar **Kluby Points** en el wizard y en el avatar (⭐).
5. Pagar con **demo** → ticket con **QR** y código.
6. Mencionar: calculadora de consumo (planificar, sin pago online en vivo).

### 3. Mesa abierta + chat + notificaciones (2–3 min)
1. Anfitrión: abrir mesa (modo **Mesa abierta**) desde la reserva confirmada.
2. Otra pestaña / celular → **invitado1@kluby.com** → **Mesas abiertas** → postularse.
3. Anfitrión: **Mis mesas** → aceptar invitado → invitado paga su parte (demo).
4. **Chat de mesa** (💬): invitado manda mensaje con anfitrión **fuera del chat** (Explorar o Mis mesas).
5. Mostrar **campana 🔔** con badge + toast *“Mensaje nuevo…”* en ~4 s.
6. Mencionar **Mis mesas unificado**: anfitrión + invitado en una sola vista con filtros.

### 4. Puerta / operación (1–2 min)
1. Login **puerta@kluby.com** → `/staff.html`.
2. Ingresar código QR o buscar reserva → **Check-in**.
3. Opcional: **Cerrar mesa** → suma Kluby Points al anfitrión.

### 5. Panel dueño — negocio (2–3 min)
1. Login **duenokluby1@kluby.com** → `/panel.html`.
2. **Eventos** → Kora (en celular: tarjetas con botones, no tabla cortada).
3. **Noche en vivo** → reservas del evento + banner si entra reserva nueva.
4. **Estadísticas**:
   - Modo **«Última noche»** → KPIs de noches pasadas simuladas.
   - Modo **Vista general** → semana/mes, recaudación.
   - Comparación entre dos noches.
   - **Kluby Points** al final del panel.

### 6. Cierre (1 min)
- B2C + B2B + operación puerta en la misma base cloud.
- Notificaciones, chat RN12, fidelización, APK apuntando a Railway.
- Sin conexión: banner claro en la app (no pantalla en blanco).

---

## Qué debe funcionar (checklist)

Antes del jueves, verificá cada ítem:

### Automático (desde tu PC)
```powershell
npm run smoke:tesis-demo
# contra Railway:
$env:BASE_URL="https://kluby-production-2fa4.up.railway.app"; npm run smoke:tesis-demo
```

### Manual
- [ ] `/api/health` → `"status":"ok"`
- [ ] APK / web: abre en **Inicio**, no login forzado
- [ ] Login con tarjeta demo → redirige según rol
- [ ] `anfitrion` ve badge **⭐ pts** y campana 🔔
- [ ] Reserva completa en Kora (evento futuro)
- [ ] Mesa abierta → invitado1 confirmado
- [ ] Chat: mensaje llega → campana + toast al otro usuario
- [ ] Puerta: check-in de reserva pagada
- [ ] Panel Kora: stats «Última noche» con datos
- [ ] Panel eventos en celular: tarjetas con botones visibles
- [ ] Modo avión / sin WiFi: banner «Sin conexión»
- [ ] `invitado1` / `invitado2` sin eventos pasados falsos
- [ ] Mapas/planos visibles (no imagen rota)

---

## Comandos de preparación (tu PC, NO en el aula salvo emergencia)

```powershell
npm run typecheck
npm run build
npm run smoke:tesis-demo
npm run repair:images
npm run ensure:tesis-demo
npm run seed:kora-past-stats
npm run repair:demo-past-reservations
```

Después de cambios de código: `git push` → Railway redeploya solo (2–3 min).

APK nueva (si cambiaste Capacitor): `npm run cap:sync` → Build APK en Android Studio.

---

## Plan B — facultad sin Railway

```powershell
npm install
# pegar .env con DATABASE_URL
npx prisma generate
npm run dev
```

http://localhost:3000 — mismos datos (misma Supabase).

```powershell
$env:BASE_URL="http://localhost:3000"; npm run smoke:tesis-demo
```

---

## Problemas frecuentes

| Síntoma | Solución |
|---------|----------|
| Railway tarda al abrir | Cold start: 30–60 s. Abrí 5 min antes. |
| Stats vacías | `npm run seed:kora-past-stats` desde casa |
| Eventos pasados falsos en invitado | `npm run repair:demo-past-reservations` |
| Mapa roto | `npm run repair:images` |
| Puerta no entra | `npm run repair:puerta` |
| Chat sin notificación | Anfitrión **fuera** del chat; esperar ~4 s; Ctrl+F5 |
| APK abre login | Push + rebuild APK; o redirect a `/` ya en app.html |

---

## Resumen

**Inicio/APK → login demo → reservar Kora → mesa abierta + chat + campana → puerta QR → panel stats del dueño.**
