import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createDb } from './db.js'
import { createApp } from './app.js'

let server, base, db

const cookieJar = new Map()
const call = async (path, { method = 'GET', body, cookie = true } = {}) => {
  const headers = { 'Content-Type': 'application/json' }
  if (cookie && cookieJar.size) {
    headers.Cookie = [...cookieJar.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
  }
  const res = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined })
  const setCookie = res.headers.get('set-cookie')
  if (setCookie) {
    const [pair] = setCookie.split(';')
    const [k, v] = pair.split('=')
    if (v) cookieJar.set(k, v); else cookieJar.delete(k)
  }
  const text = await res.text()
  return { status: res.status, json: text ? JSON.parse(text) : null }
}

describe('API', () => {
  before(async () => {
    db = await createDb({ databaseUrl: '', sqliteFile: ':memory:' })
    const app = createApp({ db, jwtSecret: 'test-secret', serveClient: false })
    await new Promise(resolve => { server = app.listen(0, resolve) })
    base = `http://127.0.0.1:${server.address().port}`
  })

  after(async () => {
    server.close()
    await db.close()
  })

  it('health', async () => {
    const r = await call('/api/health')
    assert.equal(r.status, 200)
    assert.equal(r.json.db, 'sqlite')
  })

  it('rejects unauthenticated data access', async () => {
    const r = await call('/api/data', { cookie: false })
    assert.equal(r.status, 401)
  })

  it('validates registration input', async () => {
    const r = await call('/api/auth/register', { method: 'POST', body: { email: 'bad', name: 'A', password: '123' } })
    assert.equal(r.status, 400)
  })

  it('registers, persists data and reads it back', async () => {
    const reg = await call('/api/auth/register', {
      method: 'POST', body: { email: 'Ana@Example.com', name: 'Ana', password: 'secreto1' },
    })
    assert.equal(reg.status, 201)
    assert.equal(reg.json.user.email, 'ana@example.com')
    assert.ok(cookieJar.has('mo_session'))

    const me = await call('/api/auth/me')
    assert.equal(me.status, 200)
    assert.equal(me.json.user.name, 'Ana')

    const save = await call('/api/data', {
      method: 'POST',
      body: { data: { app_events_v3: [{ id: 'e1', title: 'Control' }], app_dark_mode: true } },
    })
    assert.equal(save.status, 200)
    assert.deepEqual(save.json.saved.sort(), ['app_dark_mode', 'app_events_v3'])

    const put = await call('/api/data/app_schedule_v1', { method: 'PUT', body: { value: [{ id: 'b1' }] } })
    assert.equal(put.status, 200)

    const data = await call('/api/data')
    assert.equal(data.status, 200)
    assert.deepEqual(data.json.data.app_events_v3, [{ id: 'e1', title: 'Control' }])
    assert.equal(data.json.data.app_dark_mode, true)
    assert.deepEqual(data.json.data.app_schedule_v1, [{ id: 'b1' }])
  })

  it('rejects unknown keys', async () => {
    const r = await call('/api/data', { method: 'POST', body: { data: { g_access_token: 'x' } } })
    assert.equal(r.status, 400)
  })

  it('prevents duplicate accounts and validates login', async () => {
    const dup = await call('/api/auth/register', {
      method: 'POST', body: { email: 'ana@example.com', name: 'Ana', password: 'secreto1' },
    })
    assert.equal(dup.status, 409)

    const bad = await call('/api/auth/login', { method: 'POST', body: { email: 'ana@example.com', password: 'mal' } })
    assert.equal(bad.status, 401)

    const ok = await call('/api/auth/login', { method: 'POST', body: { email: 'ana@example.com', password: 'secreto1' } })
    assert.equal(ok.status, 200)
  })

  it('logout clears the session', async () => {
    const out = await call('/api/auth/logout', { method: 'POST' })
    assert.equal(out.status, 204)
    const me = await call('/api/auth/me')
    assert.equal(me.status, 401)
  })
})
