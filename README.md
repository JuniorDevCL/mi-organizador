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
├── render.yaml      # Blueprint para desplegar en Render
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

## Despliegue en Render

El repo incluye un **Blueprint** (`render.yaml`) que crea:

- Un **Web Service** Node (`mi-organizador`) que compila el frontend y sirve la API y la web en la misma URL.
- Una base **Postgres** (`mi-organizador-db`) conectada mediante `DATABASE_URL`.

Pasos:

1. Sube este repositorio a GitHub.
2. En Render: **New → Blueprint**, elige el repo y confirma. Render lee `render.yaml`, crea la base y el servicio y hace el primer deploy.
3. (Opcional) Para Google Calendar, agrega la variable `VITE_GOOGLE_CLIENT_ID` en el servicio y vuelve a desplegar. En Google Cloud, añade la URL de Render (`https://<servicio>.onrender.com`) a los *Authorized JavaScript origins*.

> El plan gratuito de Postgres en Render expira a los 30 días; puedes cambiarlo a un plan pago en `render.yaml` (`plan: starter`) o crear la base a mano y pegar su `DATABASE_URL`.

Si prefieres crear el servicio manualmente en lugar del Blueprint:

| Campo | Valor |
|---|---|
| Runtime | Node |
| Build Command | `npm install && npm run build` |
| Start Command | `npm start` |
| Health Check Path | `/api/health` |
| Variables | `NODE_VERSION=22.14.0`, `JWT_SECRET=<aleatorio>`, `DATABASE_URL=<postgres>` |

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
| `JWT_SECRET` | server | Clave para firmar sesiones (obligatoria en producción) |
| `DATABASE_URL` | server | Postgres; si falta se usa SQLite en `server/data/app.db` |
| `VITE_GOOGLE_CLIENT_ID` | client (build) | OAuth de Google Calendar (opcional) |
