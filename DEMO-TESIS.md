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
| `.env` en pendrive (backup) | Plan B: `npm run dev` local + misma Supabase |
| Este archivo impreso o en el celular | Guion y cuentas demo |
| 5 min antes | Abrí la URL y probá login con **anfitrion** |

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

---

## Cuentas demo

| Rol | Email | Qué mostrar |
|-----|-------|-------------|
| Cliente / anfitrión | `anfitrion@kluby.com` | Reservar mesa, pagar, QR, Kluby Points |
| Invitado | `invitado1@kluby.com` | Mesa abierta, postularse, pagar parte |
| Segundo cliente | `invitado2@kluby.com` | Reservas limpias (sin eventos pasados falsos) |
| Dueño Kora | `duenokluby1@kluby.com` | Panel, eventos, estadísticas |
| Puerta | `puerta@kluby.com` | Escanear QR, check-in, cerrar mesa |
| Super admin | `admin@kluby.com` | Todos los boliches |

---

## Guion sugerido (~8–10 min)

### 1. Intro (1 min)
- Kluby: reservas VIP de mesas en boliches.
- Stack: Node/Express, TypeScript, Prisma, PostgreSQL (Supabase), frontend vanilla, deploy Railway.
- Mostrá la landing: https://kluby-production-2fa4.up.railway.app/

### 2. Flujo cliente — reserva (3 min)
1. Login → **Cuentas demo** → **Cliente (anfitrion@kluby.com)**.
2. **Reservar mesa** → elegir **Kora** → evento futuro (ej. Kora FEST House / agosto).
3. Mapa interactivo → elegir mesa disponible.
4. Mostrar **Kluby Points** en el wizard (anfitrión tiene puntos acreditados en Kora).
5. Pagar con **demo** → ticket con **QR** y código.
6. Mencionar: calculadora de consumo (planificar, sin pago online en vivo).

### 3. Puerta / operación (2 min)
1. Otra pestaña → login **puerta@kluby.com** → `/staff.html`.
2. Ingresar código QR o buscar reserva → **Check-in**.
3. Opcional: **Cerrar mesa** → suma Kluby Points al anfitrión.

### 4. Panel dueño — negocio (3 min)
1. Login **duenokluby1@kluby.com** → `/panel.html`.
2. **Kora** → ver eventos, mesas, reservas del evento.
3. **Estadísticas**:
   - Modo **«Última noche»** → KPIs de la noche pasada simulada (mayo/junio).
   - Modo **Vista general** → semana/mes, recaudación.
   - Activar **comparación** entre dos noches pasadas.
   - Mostrar **Kluby Points** al final del panel.
4. Config del boliche: política de cancelación, valor del punto.

### 5. Cierre (1 min)
- Mesa abierta / split bill (invitado1 si hay tiempo).
- Misma base en la nube; deploy en Railway; app Android apunta a la misma URL (APK.md).

---

## Qué debe funcionar (checklist)

Antes del jueves, verificá cada ítem:

- [ ] https://kluby-production-2fa4.up.railway.app/api/health → `"status":"ok"`
- [ ] Login con tarjeta demo → redirige según rol
- [ ] `anfitrion` ve badge **⭐ pts** arriba a la derecha (si tiene saldo)
- [ ] Reserva completa en Kora (evento futuro)
- [ ] Puerta: check-in de una reserva pagada
- [ ] Panel Kora: stats «Última noche» con datos (eventos pasados de demo)
- [ ] `invitado1` / `invitado2` **sin** decenas de eventos pasados falsos
- [ ] Mapas/planos visibles en eventos (no imagen rota)

---

## Comandos de preparación (tu PC, NO en el aula salvo emergencia)

```powershell
npm run typecheck
npm run build
npm run repair:images
npm run ensure:tesis-demo
npm run seed:kora-past-stats
npm run repair:demo-past-reservations
```

Después de cambios de código: `git push` → Railway redeploya solo (2–3 min).

---

## Plan B — facultad sin Railway

```powershell
npm install
# pegar .env con DATABASE_URL
npx prisma generate
npm run dev
```

http://localhost:3000 — mismos datos (misma Supabase).

---

## Problemas frecuentes

| Síntoma | Solución |
|---------|----------|
| Railway tarda al abrir | Cold start: 30–60 s. Abrí 5 min antes. |
| Stats vacías | `npm run seed:kora-past-stats` desde casa |
| Eventos pasados falsos en invitado | `npm run repair:demo-past-reservations` |
| Mapa roto | `npm run repair:images` |
| Puerta no entra | `npm run repair:puerta` |

---

## Resumen

**Railway → login demo → reservar Kora → puerta QR → panel stats del dueño.**
