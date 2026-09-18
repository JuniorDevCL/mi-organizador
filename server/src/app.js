import express from 'express'
import cookieParser from 'cookie-parser'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  COOKIE_NAME, cookieOptions, createAuthService, verifySession, httpError,
  parseAdminEmails, isAdminEmail, parseAllowedEmailDomains, isCampusEmail,
} from './auth.js'
import {
  buildGoogleAuthUrl, createPkce, exchangeGoogleCode, fetchGoogleUser,
  googleEmailVerified, readOAuthState, requestOrigin, sanitizeGoogleValue,
  signOAuthState,
} from './googleAuth.js'
import { catalogPayload } from './udpCareers.js'
import { loadCareerOffering } from './oferta.js'
import { chileClock, createSalasService } from './salas.js'
import { createFriendsService } from './friends.js'

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
  'app_grades_v1',
])

const MAX_VALUE_BYTES = 2 * 1024 * 1024

export function createApp({
  db, jwtSecret, serveClient = true, fetchImpl = fetch,
  adminEmails = parseAdminEmails(),
  allowedEmailDomains = parseAllowedEmailDomains(),
  google = {
    clientId: process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  },
} = {}) {
  const app = express()
  const auth = createAuthService(db, jwtSecret, { allowedEmailDomains })
  const admin = (user) => isAdminEmail(user?.email, adminEmails)
  const withRole = (user) => ({ user, admin: admin(user) })
  const googleClientId = sanitizeGoogleValue(google?.clientId)
  const googleClientSecret = sanitizeGoogleValue(google?.clientSecret)
  const googleReady = Boolean(googleClientId && googleClientSecret)
  const passwordDisabled = { error: 'Usa tu correo UDP con Google para entrar' }
  const salas = createSalasService({ fetchImpl })
  const friends = createFriendsService(db, { allowedEmailDomains })
  const currentAcademicDay = () => {
    const day = chileClock().day
    return day === 0 || day === 6 ? 1 : day
  }

  const failGoogle = (res, code) => {
    res.setHeader('Cache-Control', 'no-store')
    res.clearCookie(COOKIE_NAME, { path: '/' })
    res.redirect(`/?error=${code}`)
  }

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
    if (!isCampusEmail(user.email, allowedEmailDomains)) {
      res.clearCookie(COOKIE_NAME, { path: '/' })
      return next(httpError(401, 'No has iniciado sesión'))
    }
    req.user = user
    next()
  }

  const requireAdmin = (req, res, next) => {
    if (!admin(req.user)) return next(httpError(403, 'No tienes permiso para ver las cuentas'))
    next()
  }

  const setSession = (res, token) => res.cookie(COOKIE_NAME, token, cookieOptions())

  app.get('/api/health', (_req, res) => res.json({ ok: true, db: db.kind, google: googleReady }))

  app.get('/api/oferta', (_req, res) => res.json(catalogPayload()))

  app.get('/api/oferta/:id', async (req, res, next) => {
    try {
      res.json(await loadCareerOffering(req.params.id, { fetchImpl }))
    } catch (err) { next(err) }
  })

  // ── Auth ──────────────────────────────────────────────────────────────────
  app.post('/api/auth/register', (_req, res) => res.status(410).json(passwordDisabled))
  app.post('/api/auth/login', (_req, res) => res.status(410).json(passwordDisabled))

  app.get('/api/auth/google', (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    if (!googleReady) return res.redirect('/?error=config')
    const { verifier, challenge } = createPkce()
    const redirectUri = `${requestOrigin(req)}/api/auth/google/callback`
    const state = signOAuthState(jwtSecret, { verifier, redirectUri })
    res.redirect(buildGoogleAuthUrl({
      clientId: googleClientId,
      redirectUri,
      state,
      challenge,
    }))
  })

  app.get('/api/auth/google/callback', async (req, res) => {
    try {
      res.setHeader('Cache-Control', 'no-store')
      if (!googleReady) return failGoogle(res, 'config')
      if (req.query.error === 'access_denied') return failGoogle(res, 'denied')
      if (req.query.error) return failGoogle(res, 'google')
      const code = String(req.query.code || '')
      const state = String(req.query.state || '')
      if (!code || !state) return failGoogle(res, 'google')

      let verifier
      let redirectUri
      try {
        const parsed = readOAuthState(jwtSecret, state)
        verifier = parsed.verifier
        redirectUri = parsed.redirectUri || `${requestOrigin(req)}/api/auth/google/callback`
      } catch {
        return failGoogle(res, 'google')
      }

      const tokens = await exchangeGoogleCode({
        fetchImpl,
        clientId: googleClientId,
        clientSecret: googleClientSecret,
        code,
        redirectUri,
        verifier,
      })
      const profile = await fetchGoogleUser({ fetchImpl, accessToken: tokens.access_token })
      if (!googleEmailVerified(profile)) return failGoogle(res, 'google')

      const { token } = await auth.loginWithGoogle({
        email: profile.email,
        name: profile.name || [profile.given_name, profile.family_name].filter(Boolean).join(' '),
      })
      setSession(res, token)
      res.redirect('/')
    } catch (err) {
      console.error('Google OAuth:', err.code || err.message)
      if (err.status === 403) return failGoogle(res, 'udp')
      if (err.code === 'invalid_client') return failGoogle(res, 'secret')
      if (err.code === 'redirect_uri_mismatch') return failGoogle(res, 'config')
      failGoogle(res, 'google')
    }
  })

  app.post('/api/auth/logout', (_req, res) => {
    res.clearCookie(COOKIE_NAME, { path: '/' })
    res.status(204).end()
  })

  app.get('/api/auth/me', requireAuth, (req, res) => res.json(withRole(req.user)))

  app.get('/api/admin/users', requireAuth, requireAdmin, async (req, res, next) => {
    try {
      const users = await auth.listUsers()
      res.json({ total: users.length, users })
    } catch (err) { next(err) }
  })

  app.get('/api/salas/ahora', requireAuth, async (req, res, next) => {
    try {
      res.json(await salas.now(String(req.query.q || '')))
    } catch (err) { next(err) }
  })

  app.get('/api/salas/sala/:nombre', requireAuth, async (req, res, next) => {
    try {
      res.json(await salas.room(req.params.nombre))
    } catch (err) { next(err) }
  })

  app.get('/api/salas', requireAuth, async (req, res, next) => {
    try {
      res.json(await salas.occupancy({
        day: req.query.dia || currentAcademicDay(),
        blockId: req.query.bloque || '08:30',
        query: String(req.query.q || ''),
      }))
    } catch (err) { next(err) }
  })

  app.get('/api/friends', requireAuth, async (req, res, next) => {
    try { res.json(await friends.list(req.user.id)) } catch (err) { next(err) }
  })

  app.post('/api/friends', requireAuth, async (req, res, next) => {
    try { res.status(201).json(await friends.invite(req.user.id, req.body?.email)) } catch (err) { next(err) }
  })

  app.get('/api/friends/cruce', requireAuth, async (req, res, next) => {
    try {
      const ids = String(req.query.ids || '').split(',').map((id) => id.trim()).filter(Boolean)
      res.json(await friends.compare(req.user.id, ids, chileClock()))
    } catch (err) { next(err) }
  })

  app.get('/api/friends/:id/horario', requireAuth, async (req, res, next) => {
    try { res.json(await friends.scheduleOf(req.user.id, req.params.id)) } catch (err) { next(err) }
  })

  app.post('/api/friends/:id/accept', requireAuth, async (req, res, next) => {
    try { res.json(await friends.setStatus(req.user.id, req.params.id, 'accepted')) } catch (err) { next(err) }
  })

  app.post('/api/friends/:id/decline', requireAuth, async (req, res, next) => {
    try { res.json(await friends.setStatus(req.user.id, req.params.id, 'declined')) } catch (err) { next(err) }
  })

  app.delete('/api/friends/:id', requireAuth, async (req, res, next) => {
    try { res.json(await friends.setStatus(req.user.id, req.params.id, 'removed')) } catch (err) { next(err) }
  })

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
