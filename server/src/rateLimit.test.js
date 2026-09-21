import test from 'node:test'
import assert from 'node:assert/strict'
import { createRateLimiter } from './rateLimit.js'

test('corta ráfagas del mismo IP y ruta', () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 2 })
  const mw = limiter(2)
  const req = { headers: {}, ip: '1.2.3.4', method: 'POST', path: '/api/auth/google' }
  const calls = []
  const res = {
    setHeader() {},
    status(code) { calls.push(code); return { json: (body) => { calls.push(body); return body } } },
  }
  mw(req, res, () => calls.push('ok'))
  mw(req, res, () => calls.push('ok'))
  mw(req, res, () => calls.push('ok'))
  assert.deepEqual(calls.slice(0, 2), ['ok', 'ok'])
  assert.equal(calls[2], 429)
})
