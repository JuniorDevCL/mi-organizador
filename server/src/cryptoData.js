import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

const PREFIX = 'enc:v1:'

export function dataKey(secret) {
  return createHash('sha256').update(`mo-data-v1:${String(secret || '')}`).digest()
}

export function sealJson(value, secret) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', dataKey(secret), iv)
  const plain = Buffer.from(JSON.stringify(value ?? null), 'utf8')
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${PREFIX}${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`
}

export function openJson(raw, secret) {
  if (raw == null) return null
  const text = String(raw)
  if (!text.startsWith(PREFIX)) {
    try { return JSON.parse(text) } catch { return null }
  }
  try {
    const [ivPart, tagPart, dataPart] = text.slice(PREFIX.length).split('.')
    const decipher = createDecipheriv('aes-256-gcm', dataKey(secret), Buffer.from(ivPart, 'base64url'))
    decipher.setAuthTag(Buffer.from(tagPart, 'base64url'))
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataPart, 'base64url')),
      decipher.final(),
    ])
    return JSON.parse(decrypted.toString('utf8'))
  } catch {
    return null
  }
}

export function createUserDataStore(db, secret) {
  return {
    async getAll(userId) {
      const rows = await db.all('SELECT key, value FROM user_data WHERE user_id = $1', [userId])
      const data = {}
      for (const row of rows) {
        const value = openJson(row.value, secret)
        if (value !== null) data[row.key] = value
      }
      return data
    },

    async get(userId, key) {
      const row = await db.get(
        'SELECT value FROM user_data WHERE user_id = $1 AND key = $2',
        [userId, key],
      )
      return row ? openJson(row.value, secret) : null
    },

    async set(userId, key, value) {
      const serialized = sealJson(value, secret)
      await db.run(
        `INSERT INTO user_data (user_id, key, value, updated_at) VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
        [userId, key, serialized, new Date().toISOString()],
      )
    },
  }
}
