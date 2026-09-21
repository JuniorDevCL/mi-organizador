/**
 * Capa de acceso a datos con dos adaptadores:
 *  - Postgres (DATABASE_URL definida) → producción (Vercel/Render).
 *  - SQLite (node:sqlite)             → desarrollo local sin dependencias nativas.
 *
 * Todas las consultas usan placeholders estilo Postgres ($1, $2, …) y se
 * traducen a "?" cuando corre sobre SQLite.
 */
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dir = dirname(fileURLToPath(import.meta.url))

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
     id            TEXT PRIMARY KEY,
     email         TEXT NOT NULL UNIQUE,
     name          TEXT NOT NULL,
     password_hash TEXT NOT NULL,
     created_at    TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS user_data (
     user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     key        TEXT NOT NULL,
     value      TEXT NOT NULL,
     updated_at TEXT NOT NULL,
     PRIMARY KEY (user_id, key)
   )`,
  `CREATE TABLE IF NOT EXISTS friendships (
     id            TEXT PRIMARY KEY,
     requester_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     addressee_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     status        TEXT NOT NULL,
     created_at    TEXT NOT NULL,
     UNIQUE (requester_id, addressee_id)
   )`,
  `CREATE TABLE IF NOT EXISTS sessions (
     id            TEXT PRIMARY KEY,
     user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     created_at    TEXT NOT NULL,
     expires_at    TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS friend_invites (
     id            TEXT PRIMARY KEY,
     requester_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     email         TEXT NOT NULL,
     created_at    TEXT NOT NULL,
     UNIQUE (requester_id, email)
   )`,
  `CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id)`,
  `CREATE INDEX IF NOT EXISTS friend_invites_email_idx ON friend_invites(email)`,
]

export function postgresSsl(url, env = process.env) {
  if (/localhost|127\.0\.0\.1/.test(String(url || ''))) return false
  if (env.DATABASE_SSL_INSECURE === '1') return { rejectUnauthorized: false }
  return { rejectUnauthorized: true }
}

const toSqlitePlaceholders = (sql) => sql.replace(/\$\d+/g, '?')

async function createPostgres(url) {
  const { default: pg } = await import('pg')
  const pool = new pg.Pool({ connectionString: url, ssl: postgresSsl(url) })
  for (const stmt of SCHEMA) await pool.query(stmt)
  return {
    kind: 'postgres',
    async all(sql, params = []) {
      const { rows } = await pool.query(sql, params)
      return rows
    },
    async get(sql, params = []) {
      const { rows } = await pool.query(sql, params)
      return rows[0] ?? null
    },
    async run(sql, params = []) {
      await pool.query(sql, params)
    },
    async close() { await pool.end() },
  }
}

async function createSqlite(file) {
  const { DatabaseSync } = await import('node:sqlite')
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true })
  const db = new DatabaseSync(file)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  for (const stmt of SCHEMA) db.exec(stmt)
  return {
    kind: 'sqlite',
    async all(sql, params = []) {
      return db.prepare(toSqlitePlaceholders(sql)).all(...params)
    },
    async get(sql, params = []) {
      return db.prepare(toSqlitePlaceholders(sql)).get(...params) ?? null
    },
    async run(sql, params = []) {
      db.prepare(toSqlitePlaceholders(sql)).run(...params)
    },
    async close() { db.close() },
  }
}

export async function createDb({ databaseUrl = process.env.DATABASE_URL, sqliteFile } = {}) {
  if (databaseUrl) return createPostgres(databaseUrl)
  if (process.env.VERCEL) {
    throw new Error('Falta DATABASE_URL (Postgres) para desplegar en Vercel')
  }
  const file = sqliteFile || process.env.SQLITE_FILE || join(__dir, '..', 'data', 'app.db')
  return createSqlite(file)
}
