import { createDb } from './db.js'
import { createApp } from './app.js'

const PORT = Number(process.env.PORT) || 3000
const JWT_SECRET = process.env.JWT_SECRET
const isVercel = Boolean(process.env.VERCEL)

if (!JWT_SECRET) {
  if (process.env.NODE_ENV === 'production' || isVercel) {
    throw new Error('Falta JWT_SECRET en las variables de entorno')
  }
  console.warn('JWT_SECRET no definido: usando clave de desarrollo (no usar en producción)')
}

const db = await createDb()
const app = createApp({
  db,
  jwtSecret: JWT_SECRET || 'dev-secret-cambiar',
  serveClient: !isVercel,
})

export default app

if (!isVercel) {
  const server = app.listen(PORT, () => {
    console.log(`Mi Organizador → http://localhost:${PORT} (db: ${db.kind})`)
  })

  const shutdown = async () => {
    server.close()
    await db.close()
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}
