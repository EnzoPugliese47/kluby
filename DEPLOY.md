# Kluby — Deploy en internet (Render)

Un solo servicio sirve **la web** (`public/`) y la **API** (`/api`), igual que en `localhost:3000`.

**Base de datos:** seguís usando **Supabase** (la misma `DATABASE_URL` que en desarrollo).

---

## Resumen rápido

1. Subir el código a **GitHub**
2. Crear servicio en **Render** conectado al repo
3. Pegar **`DATABASE_URL`** y **`JWT_SECRET`** en Render
4. Deploy → te dan una URL tipo `https://kluby-xxxx.onrender.com`

---

## Paso 1 — Subir el proyecto a GitHub

Si todavía no tenés remoto:

```powershell
cd ruta\a\kluby-b
git remote add origin https://github.com/TU_USUARIO/kluby-b.git
git push -u origin master
```

(Reemplazá la URL por tu repo real. Si la rama se llama `main`, usá `main` en lugar de `master`.)

**No subas `.env`** — ya está en `.gitignore`.

---

## Paso 2 — Crear cuenta en Render

1. Entrá a [https://render.com](https://render.com)
2. Registrate (podés usar “Sign in with GitHub”)
3. Conectá tu cuenta de GitHub si te lo pide

---

## Paso 3 — Crear el Web Service

### Opción A — Con `render.yaml` (recomendada)

1. En Render: **New** → **Blueprint**
2. Elegí el repo `kluby-b`
3. Render detecta `render.yaml`
4. Te pide completar variables sensibles:
   - **`DATABASE_URL`** — la misma de tu `.env` local (Supabase)
   - **`JWT_SECRET`** — una clave larga aleatoria (podés copiar la de tu `.env` o inventar una nueva)
5. **Apply** / **Create**

### Opción B — Manual

1. **New** → **Web Service**
2. Conectá el repo `kluby-b`
3. Configuración:

| Campo | Valor |
|-------|--------|
| **Runtime** | Node |
| **Build Command** | `npm install && npm run build && npx prisma migrate deploy` |
| **Start Command** | `npm start` |
| **Health Check Path** | `/api/health` |

4. **Environment** → agregar:

| Key | Value |
|-----|--------|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | *(tu connection string de Supabase)* |
| `JWT_SECRET` | *(clave secreta, mín. 32 caracteres)* |
| `JWT_EXPIRES_IN` | `7d` |

5. **Create Web Service**

---

## Paso 4 — DATABASE_URL de Supabase

1. [https://supabase.com](https://supabase.com) → tu proyecto
2. **Project Settings** → **Database**
3. Copiá **Connection string** (URI), modo **Transaction** o **Session**
4. Reemplazá `[YOUR-PASSWORD]` por la contraseña real
5. Debe incluir `?sslmode=require` al final (Supabase suele traerlo)

Ejemplo (no uses este, es ficticio):

```text
postgresql://postgres.xxxx:TU_PASSWORD@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?sslmode=require
```

Pegala en Render como **`DATABASE_URL`**.

---

## Paso 5 — Verificar que funciona

Cuando el deploy termine en verde:

1. Abrí `https://TU-SERVICIO.onrender.com/api/health`  
   → debe responder `{"success":true,"data":{"status":"ok",...}}`

2. Abrí `https://TU-SERVICIO.onrender.com`  
   → landing / inicio

3. Probá login: `https://TU-SERVICIO.onrender.com/login.html`

4. Panel: `https://TU-SERVICIO.onrender.com/panel.html`

Usá los mismos usuarios que en local (misma base Supabase).

---

## URLs para el final

| Qué | URL |
|-----|-----|
| Sitio | `https://TU-SERVICIO.onrender.com` |
| Login | `https://TU-SERVICIO.onrender.com/login.html` |
| App cliente | `https://TU-SERVICIO.onrender.com/app.html` |
| Panel | `https://TU-SERVICIO.onrender.com/panel.html` |
| API health | `https://TU-SERVICIO.onrender.com/api/health` |

Anotá la URL real en tu README o documentación de entrega.

---

## Plan free de Render — qué saber

- El servicio **se duerme** tras ~15 min sin visitas
- La **primera carga** puede tardar 30–60 s (cold start)
- Para una presentación en vivo: abrí la URL **1 minuto antes**

---

## Si el deploy falla

### Error en `prisma migrate deploy`

- Revisá que `DATABASE_URL` en Render sea correcta
- En Supabase, que el proyecto no esté pausado

### Error en `npm run build`

- Probá local: `npm run build`
- Revisá logs completos en Render → **Logs**

### La web carga pero login falla

- Revisá **JWT_SECRET** (tiene que estar definida en Render)
- Abrí consola del navegador (F12) → pestaña Network

### `Unknown argument consumptionPercent`

- En Build Command asegurate que corra `npx prisma generate` (ya está dentro de `npm run build`)

---

## ¿Y Vercel?

Para este proyecto **no hace falta Vercel** si usás Render monolito: web + API van juntos.

Vercel solo tendría sentido si separás:

- Frontend estático → Vercel  
- API Express → Render  

Eso implica cambiar el frontend para apuntar a otra URL de API. **Para el jueves, Render solo es más simple.**

---

## Próximo paso (APK)

Cuando la URL de Render funcione, el APK apunta a:

`https://TU-SERVICIO.onrender.com`

(misma API y misma base Supabase).
