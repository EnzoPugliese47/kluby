# Kluby — Deploy en Railway (web + app móvil)

Un servicio Railway sirve **todo**:

- Sitio web (`/`, `/login.html`, `/panel.html`, …)
- API REST (`/api/...`)
- Misma base **Supabase** que en desarrollo

La **app Android (APK)** apuntará a la misma URL (`https://tu-proyecto.up.railway.app`).

---

## Requisitos

- Cuenta en [GitHub](https://github.com) con el repo subido
- Cuenta en [Railway](https://railway.com) (plan con crédito — evita cold start del free tier agresivo)
- `DATABASE_URL` de Supabase (la de tu `.env` local)

---

## Paso 1 — Subir código a GitHub

```powershell
cd c:\Users\Enzo\Desktop\kluby-b
git add railway.toml DEPLOY-RAILWAY.md
git commit -m "Configuracion deploy Railway"
git push
```

---

## Paso 2 — Crear proyecto en Railway

1. [railway.com/new](https://railway.com/new)
2. **Deploy from GitHub repo** → elegí `kluby-b`
3. Railway detecta Node y usa `railway.toml` si está presente

---

## Paso 3 — Variables de entorno

En el servicio → **Variables**:

| Variable | Valor |
|----------|--------|
| `DATABASE_URL` | Connection string de Supabase (igual que local) |
| `JWT_SECRET` | Clave larga secreta (la de tu `.env` o nueva) |
| `JWT_EXPIRES_IN` | `7d` |
| `NODE_ENV` | `production` |

**Importante:** `DATABASE_URL` debe existir **antes** del primer deploy (el build corre migraciones).

---

## Paso 4 — Dominio público

1. Servicio → **Settings** → **Networking**
2. **Generate Domain** → te dan algo como `kluby-production.up.railway.app`
3. Esa URL es la que usás en el final y en el APK

---

## Paso 5 — Verificar

| URL | Esperado |
|-----|----------|
| `https://TU-DOMINIO.up.railway.app/api/health` | JSON `"status":"ok"` |
| `https://TU-DOMINIO.up.railway.app` | Inicio |
| `https://TU-DOMINIO.up.railway.app/login.html` | Login |

Mismos usuarios y boliches (Supabase compartida).

---

## Demo del final (sin demoras)

1. Con plan de pago / crédito, el servicio **no se duerme** como Render free
2. **5 min antes:** abrí la URL en el navegador
3. **Plan B:** `npm run dev` en la notebook + misma Supabase

---

## App móvil (después)

Capacitor usará:

```text
https://TU-DOMINIO.up.railway.app
```

- Web → `/app.html`
- API → `/api/...` (mismo origen, sin cambios de CORS)

---

## Mercado Pago y emails (después del deploy)

Railway **no bloquea** nada de esto. Solo agregás variables y código:

### Mercado Pago (sandbox)
- Guía completa: **`MERCADOPAGO.md`**
- Variables: `MP_ACCESS_TOKEN`, `MP_SANDBOX=true`, `MP_TEST_PAYER_EMAIL` (email del comprador de prueba en el panel MP), `PUBLIC_APP_URL`
- Webhook: `https://TU-DOMINIO.up.railway.app/api/webhooks/mercadopago`
- Sin `MP_ACCESS_TOKEN` → pagos demo siguen funcionando

### Emails (registro / olvidé contraseña)
- Variables: `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` (o Resend/SendGrid API key)
- El modelo `PasswordResetToken` y rutas `/forgot-password` ya existen (hoy en modo demo)
- Cambio futuro: enviar mail en lugar de devolver el token en la respuesta

Nada de esto obliga a cambiar de Railway.

---

## Si el deploy falla

- **Build:** revisá Logs → suele ser `DATABASE_URL` mal pegada
- **Runtime:** `JWT_SECRET` faltante
- **Prisma:** corré local `npm run build` para comparar
