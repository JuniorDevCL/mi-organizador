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

export function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
    path: '/',
  }
}

export function signSession(user, secret) {
  return jwt.sign({ sub: user.id }, secret, { expiresIn: `${SESSION_DAYS}d` })
}

export function verifySession(token, secret) {
  try {
    const payload = jwt.verify(token, secret)
    return payload?.sub || null
  } catch {
    return null
  }
}

export function createAuthService(db, secret) {
  return {
    async register({ email, name, password }) {
      const normalized = normalizeEmail(email)
      const cleanName = String(name || '').trim()
      if (!isValidEmail(normalized)) throw httpError(400, 'Correo inválido')
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
      return { user: publicUser(row), token: signSession(row, secret) }
    },

    async login({ email, password }) {
      const normalized = normalizeEmail(email)
      const row = await db.get('SELECT * FROM users WHERE email = $1', [normalized])
      const ok = row && await bcrypt.compare(String(password || ''), row.password_hash)
      if (!ok) throw httpError(401, 'Correo o contraseña incorrectos')
      return { user: publicUser(row), token: signSession(row, secret) }
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
