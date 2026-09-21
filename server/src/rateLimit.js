const clientIp = (req) => {
  const forwarded = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim()
  return forwarded || req.ip || req.socket?.remoteAddress || 'local'
}

export function createRateLimiter({ windowMs = 60_000, max = 180 } = {}) {
  const hits = new Map()

  const prune = (now) => {
    for (const [key, bucket] of hits) {
      if (now - bucket.start >= windowMs) hits.delete(key)
    }
  }

  return (limit = max) => (req, res, next) => {
    const now = Date.now()
    if (hits.size > 2000) prune(now)
    const key = `${clientIp(req)}:${req.method}:${req.path}`
    const bucket = hits.get(key)
    if (!bucket || now - bucket.start >= windowMs) {
      hits.set(key, { start: now, count: 1 })
      return next()
    }
    bucket.count += 1
    if (bucket.count > limit) {
      res.setHeader('Retry-After', '60')
      return res.status(429).json({ error: 'Demasiadas solicitudes. Espera un momento.' })
    }
    return next()
  }
}
