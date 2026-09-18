import express from 'express'
import cookieParser from 'cookie-parser'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  COOKIE_NAME, cookieOptions, createAuthService, verifySession, httpError,
} from './auth.js'
import { catalogPayload } from './udpCareers.js'
import { loadCareerOffering } from './oferta.js'

const __dir = dirname(fileURLToPath(import.meta.url))
const CLIENT_DIST = join(__dir, '..', '..', 'client', 'dist')

/** Claves de datos que el cliente puede guardar por usuario. */
export const ALLOWED_KEYS = new Set([
  'app_checklist_templates_v1',
  'app_checklist_days_v1',
  'app_events_v3',
  'app_schedule_v1',
  'app_offering_v1',
  'app_my_courses_v1',
  'app_section_sel_v1',
  'app_semester_v1',
  'app_career_v1',
  'app_dark_mode',
])

const MAX_VALUE_BYTES = 2 * 1024 * 1024

export function createApp({ db, jwtSecret, serveClient = true, fetchImpl = fetch } = {}) {
  const app = express()
  const auth = createAuthService(db, jwtSecret)

  app.disable('x-powered-by')
  app.set('trust proxy', 1)
  app.use(express.json({ limit: '5mb' }))
  app.use(cookieParser())

  const requireAuth = async (req, res, next) => {
    const token = req.cookies?.[COOKIE_NAME]
    const userId = token ? verifySession(token, jwtSecret) : null
    if (!userId) return next(httpError(401, 'No has iniciado sesión'))
    const user = await auth.userById(userId)
    if (!user) {
      res.clearCookie(COOKIE_NAME, { path: '/' })
      return next(httpError(401, 'Sesión inválida'))
    }
    req.user = user
    next()
  }

  const setSession = (res, token) => res.cookie(COOKIE_NAME, token, cookieOptions())

  app.get('/api/health', (_req, res) => res.json({ ok: true, db: db.kind }))

  app.get('/api/oferta', (_req, res) => res.json(catalogPayload()))

  app.get('/api/oferta/:id', async (req, res, next) => {
    try {
      res.json(await loadCareerOffering(req.params.id, { fetchImpl }))
    } catch (err) { next(err) }
  })

  // ── Auth ──────────────────────────────────────────────────────────────────
  app.post('/api/auth/register', async (req, res, next) => {
    try {
      const { user, token } = await auth.register(req.body || {})
      setSession(res, token)
      res.status(201).json({ user })
    } catch (err) { next(err) }
  })

  app.post('/api/auth/login', async (req, res, next) => {
    try {
      const { user, token } = await auth.login(req.body || {})
      setSession(res, token)
      res.json({ user })
    } catch (err) { next(err) }
  })

  app.post('/api/auth/logout', (_req, res) => {
    res.clearCookie(COOKIE_NAME, { path: '/' })
    res.status(204).end()
  })

  app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: req.user }))

  // ── Datos por usuario ─────────────────────────────────────────────────────
  app.get('/api/data', requireAuth, async (req, res, next) => {
    try {
      const rows = await db.all('SELECT key, value FROM user_data WHERE user_id = $1', [req.user.id])
      const data = {}
      for (const row of rows) {
        try { data[row.key] = JSON.parse(row.value) } catch { /* valor corrupto: se omite */ }
      }
      res.json({ data })
    } catch (err) { next(err) }
  })

  const upsert = async (userId, key, value) => {
    const serialized = JSON.stringify(value ?? null)
    if (Buffer.byteLength(serialized) > MAX_VALUE_BYTES) throw httpError(413, `El dato "${key}" es demasiado grande`)
    await db.run(
      `INSERT INTO user_data (user_id, key, value, updated_at) VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
      [userId, key, serialized, new Date().toISOString()],
    )
  }

  app.post('/api/data', requireAuth, async (req, res, next) => {
    try {
      const entries = Object.entries(req.body?.data || {})
      if (!entries.length) throw httpError(400, 'Sin datos para guardar')
      for (const [key] of entries) {
        if (!ALLOWED_KEYS.has(key)) throw httpError(400, `Clave no permitida: ${key}`)
      }
      for (const [key, value] of entries) await upsert(req.user.id, key, value)
      res.json({ saved: entries.map(([k]) => k) })
    } catch (err) { next(err) }
  })

  app.put('/api/data/:key', requireAuth, async (req, res, next) => {
    try {
      const { key } = req.params
      if (!ALLOWED_KEYS.has(key)) throw httpError(400, `Clave no permitida: ${key}`)
      await upsert(req.user.id, key, req.body?.value)
      res.json({ saved: [key] })
    } catch (err) { next(err) }
  })

  app.all('/api/*', (_req, _res, next) => next(httpError(404, 'Ruta no encontrada')))

  // ── Frontend compilado ────────────────────────────────────────────────────
  if (serveClient && existsSync(CLIENT_DIST)) {
    app.use(express.static(CLIENT_DIST, { maxAge: '1h', index: false }))
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache')
      res.sendFile(join(CLIENT_DIST, 'index.html'))
    })
  }

  // ── Errores ───────────────────────────────────────────────────────────────
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    const status = err.status || 500
    if (status >= 500) console.error(err)
    res.status(status).json({ error: status >= 500 ? 'Error interno del servidor' : err.message })
  })

  return app
}
