# Mi Organizador

App personal de organización universitaria: checklist diario, horario, agenda y mapa de comercios Pluxee.

Repositorio: [github.com/JuniorDevCL/mi-organizador](https://github.com/JuniorDevCL/mi-organizador)

## Qué incluye

- **Mi recorrido** — checklist diario con tareas recurrentes
- **Horario** — grilla semanal a partir de la oferta académica y el semestre
- **Agenda** — controles, solemnes y tareas, con sincronización opcional a Google Calendar
- **Pluxee** — mapa de comercios de alimentación en Santiago
- **Config** — carga de oferta, ramos del semestre y modo noche

Los datos se guardan en el navegador (`localStorage`).

## Cómo ejecutarlo en local

Requisitos: Node.js 18 o superior.

```bash
npm install
cp .env.example .env.local   # opcional, para Google Calendar
npm run dev
```

La app queda en [http://localhost:5173](http://localhost:5173).

```bash
npm test          # tests
npm run build     # build de producción
```

## Google Calendar (opcional)

1. Crea un Client ID OAuth en [Google Cloud Console](https://console.cloud.google.com/).
2. Agrégalo como `VITE_GOOGLE_CLIENT_ID` en `.env.local` (local) o en las variables de entorno de Netlify.
3. En Google Cloud, autoriza el origen (`http://localhost:5173` y la URL de Netlify).

## Despliegue en Netlify

El repo incluye `netlify.toml` (`npm run build`, carpeta `dist`).

1. En Netlify: **Add new site → Import an existing project**.
2. Elige este repositorio y despliega.
3. (Opcional) Define `VITE_GOOGLE_CLIENT_ID` en **Site settings → Environment variables** y vuelve a desplegar.

## Versión con cuentas y nube

Hay una versión fullstack (login, datos por usuario y despliegue en Render) en el pull request [#4](https://github.com/JuniorDevCL/mi-organizador/pull/4).
