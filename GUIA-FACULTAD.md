# Kluby — Guía para correr en otra PC (facultad)

La **base de datos está en Supabase (nube)**. Los usuarios, boliches y reservas que cargaste **no van en Git**: viven en PostgreSQL. Si usás el **mismo archivo `.env`** (misma `DATABASE_URL`), en la facultad ves **exactamente los mismos datos**.

---

## Antes de irte de casa (hoy)

1. **Commit hecho** — el código del proyecto quedó guardado en Git.
2. **Copiá el archivo `.env`** a un pendrive, mail privado o gestor de contraseñas.  
   Sin este archivo la app no conecta a la base.
3. Llevá el proyecto de una de estas formas:
   - **Pendrive** con la carpeta `kluby-b` completa, o
   - **GitHub/GitLab** — subí el repo y clonalo mañana (`git push` si configuraste remoto).

No commitees `.env` (tiene contraseñas).

---

## Requisitos en la PC de la facultad

| Software | Versión recomendada |
|----------|---------------------|
| **Node.js** | 20 LTS o 22 LTS — [https://nodejs.org](https://nodejs.org) |
| **Git** | Opcional si clonás el repo |
| **Internet** | Necesario para conectar a Supabase |

Verificá en terminal (PowerShell o CMD):

```powershell
node -v
npm -v
```

---

## Pasos para levantar Kluby (primera vez en esa PC)

Abrí terminal en la carpeta del proyecto (`kluby-b`).

### 1. Instalar dependencias

```powershell
npm install
```

### 2. Configurar entorno

Copiá tu `.env` de casa a la raíz del proyecto (junto a `package.json`).

Si no lo tenés, copiá `.env.example` a `.env` y pegá la `DATABASE_URL` real de Supabase.

### 3. Prisma (cliente + migraciones)

```powershell
npx prisma generate
npx prisma migrate deploy
```

### 4. Arrancar el servidor

```powershell
npm run dev
```

Deberías ver:

```text
[Kluby] API escuchando en http://localhost:3000
```

### 5. Abrir en el navegador

| Página | URL |
|--------|-----|
| Inicio | http://localhost:3000 |
| Login | http://localhost:3000/login.html |
| App cliente | http://localhost:3000/app.html |
| Panel dueño | http://localhost:3000/panel.html |
| Puerta | http://localhost:3000/staff.html |
| Publi | http://localhost:3000/publi.html |

---

## Usuarios demo (si existen en la base)

Contraseña habitual del seed: **`password123`**

| Rol | Email |
|-----|--------|
| Cliente | `anfitrion@kluby.com` |
| Dueño | `duenokluby1@kluby.com` |
| Super admin | `admin@kluby.com` |
| Puerta | `puerta@kluby.com` |

Los usuarios y boliches que agregaste hoy también están en Supabase — entrá con esos mails si los creaste vos.

---

## Si algo falla

### `Variable de entorno requerida no definida: DATABASE_URL`

Falta el archivo `.env` o está mal la variable. Copiá el `.env` de tu PC de casa.

### `Unknown argument consumptionPercent` (u otro campo de Prisma)

Cliente Prisma desactualizado:

```powershell
npx prisma generate
```

Cerrá el servidor (`Ctrl+C`) y volvé a correr `npm run dev`.

### Login de puerta no funciona

```powershell
npm run repair:puerta
```

### Puerto 3000 ocupado

```powershell
$env:PORT=3001; npm run dev
```

Luego abrí `http://localhost:3001`.

### La facultad bloquea Supabase

Necesitás internet saliente al host de Supabase (puerto 5432 o pooler 6543). Probá con datos del celular o consultá red de la facu.

---

## Comandos útiles

| Comando | Para qué |
|---------|----------|
| `npm run dev` | Desarrollo (hot reload) |
| `npm run build` | Compilar para producción |
| `npm start` | Correr compilado (`dist/`) |
| `npm run seed` | **Cuidado:** resetea datos demo (no uses si ya tenés datos reales) |
| `npx prisma studio` | Ver/editar tablas en el navegador |

---

## Resumen en 4 líneas

```powershell
npm install
# pegar .env con DATABASE_URL de Supabase
npx prisma generate
npx prisma migrate deploy
npm run dev
```

Abrí **http://localhost:3000** — misma base, mismos boliches y usuarios que en casa.

---

## Presentación de tesis (Railway — recomendado)

Si presentás online sin instalar nada en la facultad:

| URL | Uso |
|-----|-----|
| https://kluby-production-2fa4.up.railway.app/login.html | Login con **Cuentas demo · Tesis** |
| https://kluby-production-2fa4.up.railway.app/app.html | App cliente |
| https://kluby-production-2fa4.up.railway.app/panel.html | Panel dueño |
| https://kluby-production-2fa4.up.railway.app/staff.html | Puerta / QR |

Guion completo: **`DEMO-TESIS.md`** (cuentas, checklist, plan B).

5 minutos antes del final: abrí la URL y probá login con `anfitrion@kluby.com` / `password123`.

**Plan B:** mismo procedimiento de arriba (`npm run dev` + `.env`) si Railway falla.
