import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

export const COOKIE_NAME = 'mo_session'
const SESSION_DAYS = 30

const isProd = process.env.NODE_ENV === 'production'

export const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ''))
export const normalizeEmail = (email) => String(email || '').trim().toLowerCase()

export const publicUser = (row) => ({
  id: row.id,
  email: row.email,
  name: row.name,
  createdAt: row.created_at,
})

export function parseAdminEmails(raw = process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || '') {
  return String(raw)
    .split(/[,;\s]+/)
    .map(normalizeEmail)
    .filter(isValidEmail)
}

export function isAdminEmail(email, adminEmails = parseAdminEmails()) {
  return adminEmails.includes(normalizeEmail(email))
}

/** Dominio institucional por defecto: @udp.cl y el subdominio habitual @mail.udp.cl. */
export const DEFAULT_EMAIL_DOMAINS = ['udp.cl']

export function parseAllowedEmailDomains(raw = process.env.ALLOWED_EMAIL_DOMAINS) {
  if (raw == null || String(raw).trim() === '') return [...DEFAULT_EMAIL_DOMAINS]
  return [...new Set(
    String(raw)
      .split(/[,;\s]+/)
      .map((part) => part.trim().toLowerCase().replace(/^@/, ''))
      .filter(Boolean),
  )]
}

export function emailDomain(email) {
  const normalized = normalizeEmail(email)
  const at = normalized.lastIndexOf('@')
  return at >= 0 ? normalized.slice(at + 1) : ''
}

export function isCampusEmail(email, domains = parseAllowedEmailDomains()) {
  const domain = emailDomain(email)
  if (!domain) return false
  return domains.some((allowed) => {
    if (domain === allowed) return true
    // Solo el subdominio institucional habitual: @mail.udp.cl cuando allowed es udp.cl.
    if (allowed === 'udp.cl') return domain === 'mail.udp.cl'
    return false
  })
}

export function campusEmailError(domains = parseAllowedEmailDomains()) {
  const examples = domains.includes('udp.cl')
    ? '@mail.udp.cl'
    : domains.map((d) => `@${d}`).join(' o ')
  return `Solo se puede entrar con un correo institucional UDP (${examples})`
}

export const cookieName = () => (isProd ? '__Host-mo_session' : COOKIE_NAME)

export function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
    path: '/',
  }
}

export function clearCookieOptions() {
  return { ...cookieOptions(), maxAge: 0 }
}

export function sessionCookieFrom(req) {
  const cookies = req?.cookies || {}
  return cookies[cookieName()] || cookies[COOKIE_NAME] || null
}

export function clearSessionCookies(res) {
  res.clearCookie(cookieName(), clearCookieOptions())
  res.clearCookie(COOKIE_NAME, clearCookieOptions())
}

export function signSession(user, secret, jti = randomUUID()) {
  return jwt.sign(
    { sub: user.id, jti },
    secret,
    { expiresIn: `${SESSION_DAYS}d`, algorithm: 'HS256' },
  )
}

export function verifySession(token, secret) {
  try {
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] })
    if (!payload?.sub || !payload?.jti) return null
    return { userId: payload.sub, jti: payload.jti }
  } catch {
    return null
  }
}

export function sessionExpiryIso() {
  return new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString()
}

export function createAuthService(db, secret, { allowedEmailDomains = parseAllowedEmailDomains() } = {}) {
  const assertCampusEmail = (email) => {
    if (!isCampusEmail(email, allowedEmailDomains)) {
      throw httpError(403, campusEmailError(allowedEmailDomains))
    }
  }

  const issueSession = async (user) => {
    const jti = randomUUID()
    await db.run(
      'INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES ($1, $2, $3, $4)',
      [jti, user.id, new Date().toISOString(), sessionExpiryIso()],
    )
    return signSession(user, secret, jti)
  }

  return {
    async register({ email, name, password }) {
      const normalized = normalizeEmail(email)
      const cleanName = String(name || '').trim()
      if (!isValidEmail(normalized)) throw httpError(400, 'Correo inválido')
      assertCampusEmail(normalized)
      if (cleanName.length < 2) throw httpError(400, 'Escribe tu nombre')
      if (String(password || '').length < 6) throw httpError(400, 'La contraseña debe tener al menos 6 caracteres')

      const existing = await db.get('SELECT id FROM users WHERE email = $1', [normalized])
      if (existing) throw httpError(409, 'Ya existe una cuenta con ese correo')

      const row = {
        id: randomUUID(),
        email: normalized,
        name: cleanName,
        password_hash: await bcrypt.hash(password, 10),
        created_at: new Date().toISOString(),
      }
      await db.run(
        'INSERT INTO users (id, email, name, password_hash, created_at) VALUES ($1, $2, $3, $4, $5)',
        [row.id, row.email, row.name, row.password_hash, row.created_at],
      )
      return { user: publicUser(row), token: await issueSession(row) }
    },

    async login({ email, password }) {
      const normalized = normalizeEmail(email)
      assertCampusEmail(normalized)
      const row = await db.get('SELECT * FROM users WHERE email = $1', [normalized])
      const ok = row && await bcrypt.compare(String(password || ''), row.password_hash)
      if (!ok) throw httpError(401, 'Correo o contraseña incorrectos')
      return { user: publicUser(row), token: await issueSession(row) }
    },

    async loginWithGoogle({ email, name }) {
      const normalized = normalizeEmail(email)
      if (!isValidEmail(normalized)) throw httpError(400, 'Correo inválido')
      assertCampusEmail(normalized)
      const fromGoogle = String(name || '').trim()
      const fallback = normalized.split('@')[0] || 'Estudiante'
      const cleanName = fromGoogle.length >= 2 ? fromGoogle : fallback

      const existing = await db.get('SELECT * FROM users WHERE email = $1', [normalized])
      if (existing) {
        return { user: publicUser(existing), token: await issueSession(existing), created: false }
      }

      const row = {
        id: randomUUID(),
        email: normalized,
        name: cleanName,
        password_hash: await bcrypt.hash(randomUUID(), 10),
        created_at: new Date().toISOString(),
      }
      await db.run(
        'INSERT INTO users (id, email, name, password_hash, created_at) VALUES ($1, $2, $3, $4, $5)',
        [row.id, row.email, row.name, row.password_hash, row.created_at],
      )
      return { user: publicUser(row), token: await issueSession(row), created: true }
    },

    async issueSession(user) {
      return issueSession(user)
    },

    async revokeSession(jti) {
      if (!jti) return
      await db.run('DELETE FROM sessions WHERE id = $1', [jti])
    },

    async sessionValid(userId, jti) {
      if (!userId || !jti) return false
      const row = await db.get(
        'SELECT id, expires_at FROM sessions WHERE id = $1 AND user_id = $2',
        [jti, userId],
      )
      if (!row) return false
      return String(row.expires_at) > new Date().toISOString()
    },

    async deleteAccount(userId) {
      await db.run('DELETE FROM users WHERE id = $1', [userId])
    },

    async userById(id) {
      const row = await db.get('SELECT * FROM users WHERE id = $1', [id])
      return row ? publicUser(row) : null
    },

    async listUsers() {
      const rows = await db.all(
        'SELECT id, email, name, created_at FROM users ORDER BY created_at DESC',
      )
      return rows.map(publicUser)
    },
  }
}

export function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}
