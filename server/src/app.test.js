import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createDb } from './db.js'
import { createApp } from './app.js'
import { OAUTH_STATE_COOKIE } from './googleAuth.js'

let server, base, db
let googleProfile = {
  email: 'ana@mail.udp.cl',
  email_verified: true,
  name: 'Ana',
  sub: 'google-ana',
}

const cookieJar = new Map()

const storeCookies = (res) => {
  const raw = typeof res.headers.getSetCookie === 'function'
    ? res.headers.getSetCookie()
    : [res.headers.get('set-cookie')].filter(Boolean)
  for (const setCookie of raw) {
    const [pair] = String(setCookie).split(';')
    const eq = pair.indexOf('=')
    if (eq < 0) continue
    const k = pair.slice(0, eq).trim()
    const v = pair.slice(eq + 1).trim()
    if (!k) continue
    if (v) cookieJar.set(k, v)
    else cookieJar.delete(k)
  }
}

const call = async (path, { method = 'GET', body, cookie = true, redirect = 'follow' } = {}) => {
  const headers = { 'Content-Type': 'application/json' }
  if (cookie && cookieJar.size) {
    headers.Cookie = [...cookieJar.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
  }
  const res = await fetch(base + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect,
  })
  storeCookies(res)
  const text = await res.text()
  return {
    status: res.status,
    json: text ? (() => { try { return JSON.parse(text) } catch { return null } })() : null,
    location: res.headers.get('location'),
  }
}

const signInGoogle = async (profile) => {
  googleProfile = profile
  const start = await call('/api/auth/google', { redirect: 'manual' })
  assert.equal(start.status, 302)
  const state = cookieJar.get(OAUTH_STATE_COOKIE)
  assert.ok(state)
  const cb = await call(`/api/auth/google/callback?code=test-code&state=${state}`, { redirect: 'manual' })
  return cb
}

describe('API', () => {
  before(async () => {
    db = await createDb({ databaseUrl: '', sqliteFile: ':memory:' })
    const app = createApp({
      db,
      jwtSecret: 'test-secret',
      serveClient: false,
      adminEmails: ['owner@mail.udp.cl'],
      google: {
        clientId: 'test.apps.googleusercontent.com',
        clientSecret: 'test-secret',
      },
      fetchImpl: async (url, opts = {}) => {
        const href = String(url)
        if (href.includes('oauth2.googleapis.com/token')) {
          return new Response(JSON.stringify({ access_token: 'ya29.test' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        if (href.includes('oauth2/v3/userinfo')) {
          assert.match(String(opts.headers?.Authorization || ''), /Bearer ya29\.test/)
          return new Response(JSON.stringify(googleProfile), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        return fetch(url, opts)
      },
    })
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
    assert.equal(r.json.google, true)
  })

  it('rejects unauthenticated data access', async () => {
    const r = await call('/api/data', { cookie: false })
    assert.equal(r.status, 401)
  })

  it('disables password register and login', async () => {
    const reg = await call('/api/auth/register', {
      method: 'POST', body: { email: 'ana@mail.udp.cl', name: 'Ana', password: 'secreto1' },
    })
    assert.equal(reg.status, 410)

    const login = await call('/api/auth/login', {
      method: 'POST', body: { email: 'ana@mail.udp.cl', password: 'secreto1' },
    })
    assert.equal(login.status, 410)
    assert.equal(login.json.error, 'Usa tu correo UDP con Google para entrar')
  })

  it('redirects to Google with the UDP hosted domain', async () => {
    const r = await call('/api/auth/google', { redirect: 'manual', cookie: false })
    assert.equal(r.status, 302)
    const location = new URL(r.location)
    assert.equal(location.hostname, 'accounts.google.com')
    assert.equal(location.searchParams.get('hd'), 'udp.cl')
    assert.equal(location.searchParams.get('prompt'), 'select_account')
    assert.ok(cookieJar.has(OAUTH_STATE_COOKIE))
  })

  it('creates a UDP session from Google and persists data', async () => {
    const cb = await signInGoogle({
      email: 'Ana@Mail.udp.cl',
      email_verified: true,
      name: 'Ana',
      sub: 'google-ana',
    })
    assert.equal(cb.status, 302)
    assert.equal(cb.location, '/')
    assert.ok(cookieJar.has('mo_session'))

    const me = await call('/api/auth/me')
    assert.equal(me.status, 200)
    assert.equal(me.json.user.email, 'ana@mail.udp.cl')
    assert.equal(me.json.user.name, 'Ana')
    assert.equal(me.json.admin, false)

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

  it('reuses the same account when the same Google email returns', async () => {
    const first = await call('/api/auth/me')
    const cb = await signInGoogle({
      email: 'ana@mail.udp.cl',
      email_verified: true,
      name: 'Ana',
      sub: 'google-ana',
    })
    assert.equal(cb.status, 302)
    const me = await call('/api/auth/me')
    assert.equal(me.json.user.id, first.json.user.id)
  })

  it('logout clears the session', async () => {
    const out = await call('/api/auth/logout', { method: 'POST' })
    assert.equal(out.status, 204)
    const me = await call('/api/auth/me')
    assert.equal(me.status, 401)
  })

  it('lists UDP academic offerings without auth', async () => {
    const r = await call('/api/oferta', { cookie: false })
    assert.equal(r.status, 200)
    assert.ok(r.json.faculties.length > 0)
    assert.ok(r.json.faculties.some(f => f.careers.some(c => c.id === 'ing_civil_en_infor_y_tel')))
  })

  it('unknown career offering is 404', async () => {
    const r = await call('/api/oferta/no-existe', { cookie: false })
    assert.equal(r.status, 404)
  })

  it('rejects Gmail from Google and does not open a session', async () => {
    cookieJar.clear()
    const cb = await signInGoogle({
      email: 'alexis@gmail.com',
      email_verified: true,
      name: 'Alexis',
      sub: 'google-gmail',
    })
    assert.equal(cb.status, 302)
    assert.equal(cb.location, '/?error=udp')
    assert.equal(cookieJar.has('mo_session'), false)
  })

  it('hides the member list from guests and regular accounts', async () => {
    const anon = await call('/api/admin/users', { cookie: false })
    assert.equal(anon.status, 401)

    const asAna = await signInGoogle({
      email: 'ana@mail.udp.cl',
      email_verified: true,
      name: 'Ana',
      sub: 'google-ana',
    })
    assert.equal(asAna.status, 302)

    const me = await call('/api/auth/me')
    assert.equal(me.json.admin, false)

    const forbidden = await call('/api/admin/users')
    assert.equal(forbidden.status, 403)
    assert.equal(forbidden.json.error, 'No tienes permiso para ver las cuentas')
  })

  it('lets an admin list registered people without password hashes', async () => {
    const owner = await signInGoogle({
      email: 'Owner@Mail.udp.cl',
      email_verified: true,
      name: 'Alexis',
      sub: 'google-owner',
    })
    assert.equal(owner.status, 302)

    const me = await call('/api/auth/me')
    assert.equal(me.json.admin, true)

    const list = await call('/api/admin/users')
    assert.equal(list.status, 200)
    assert.ok(list.json.total >= 2)
    assert.equal(list.json.users.length, list.json.total)
    assert.deepEqual(
      list.json.users.map(u => u.email).sort(),
      ['ana@mail.udp.cl', 'owner@mail.udp.cl'],
    )
    for (const user of list.json.users) {
      assert.equal(user.password_hash, undefined)
      assert.ok(user.name)
      assert.ok(user.createdAt)
      assert.ok(user.id)
    }
  })
})
