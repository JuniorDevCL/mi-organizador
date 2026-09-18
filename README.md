# Mi Organizador

App personal de organización: checklist diario **Mi recorrido**, horario semanal generado desde la oferta académica, agenda de controles/solemnes con sincronización a Google Calendar y mapa de comercios Pluxee en Santiago.

Versión 2: **frontend + backend con cuentas de usuario**. Toda la información se guarda en la base de datos y se sincroniza entre el teléfono y el computador. La interfaz es responsive (barra lateral en escritorio, navegación inferior en móvil).

## Estructura

```
.
├── client/          # React + Vite (frontend)
│   └── src/
│       ├── App.jsx          # Pestañas, layout responsive
│       ├── AuthScreen.jsx   # Login / registro
│       ├── store.js         # Estado del usuario sincronizado con la API
│       └── api.js           # Cliente HTTP
├── server/          # Express (API + sirve el frontend compilado)
│   └── src/
│       ├── index.js   # Arranque
│       ├── app.js     # Rutas /api/auth y /api/data
│       ├── auth.js    # Registro, login, sesiones JWT (cookie httpOnly)
│       └── db.js      # Postgres (producción) o SQLite (desarrollo)
├── vercel.json      # Frontend Vite + API Express en Vercel
├── render.yaml      # Alternativa: Blueprint para Render
└── package.json     # Workspaces (client + server)
```

## Desarrollo local

Requisitos: Node 22.13+ (usa `node:sqlite`, sin dependencias nativas).

```bash
npm install
cp .env.example .env      # opcional
npm run dev               # API en :3000 y Vite en :5173 (con proxy a /api)
```

Alternativa "como producción":

```bash
npm run build && JWT_SECRET=algo npm start   # http://localhost:3000
```

Tests:

```bash
npm test
```

## Despliegue en Vercel

Importa **`JuniorDevCL/mi-organizador`** (no `mi-organizador-cloud`, ese repo está vacío), rama **`master`**.

| Campo | Valor |
|---|---|
| Framework Preset | Other (Vercel usa `vercel.json`) |
| Root Directory | `./` |

Variables de entorno (Production y Preview):

| Variable | Valor |
|---|---|
| `JWT_SECRET` | una clave larga aleatoria |
| `DATABASE_URL` | conexión de Postgres (en Vercel: **Storage → Create Database → Neon**) |
| `VITE_GOOGLE_CLIENT_ID` | opcional, para Google Calendar |

En Google Cloud, autoriza el origen `https://<tu-proyecto>.vercel.app`.

## Alternativa: Render

El repo también incluye `render.yaml` (Web Service + Postgres). **Start Command:** `npm start`. **Build Command:** `npm install && npm run build`.

## API

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/register` | `{ email, name, password }` → crea cuenta e inicia sesión |
| POST | `/api/auth/login` | `{ email, password }` |
| POST | `/api/auth/logout` | Cierra la sesión |
| GET | `/api/auth/me` | Usuario actual |
| GET | `/api/data` | Todos los datos del usuario (`{ data: { clave: valor } }`) |
| POST | `/api/data` | Guarda varias claves: `{ data: { clave: valor } }` |
| PUT | `/api/data/:key` | Guarda una clave: `{ value }` |
| GET | `/api/health` | Estado del servicio y motor de base de datos |

Las sesiones usan una cookie `httpOnly` firmada con `JWT_SECRET` (30 días). Las contraseñas se guardan con bcrypt.

## Variables de entorno

| Variable | Dónde | Descripción |
|---|---|---|
| `PORT` | server | Puerto HTTP (Render lo define) |
| `JWT_SECRET` | server | Clave para firmar sesiones (obligatoria en Vercel) |
| `DATABASE_URL` | server | Postgres; si falta en local se usa SQLite |
| `VITE_GOOGLE_CLIENT_ID` | client (build) | OAuth de Google Calendar (opcional) |
