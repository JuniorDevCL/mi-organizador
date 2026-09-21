import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createDb } from './db.js'
import { createApp } from './app.js'

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
    headers: res.headers,
  }
}

const signInGoogle = async (profile) => {
  googleProfile = profile
  const start = await call('/api/auth/google', { redirect: 'manual' })
  assert.equal(start.status, 302)
  const location = new URL(start.location, base)
  const state = location.searchParams.get('state')
  assert.ok(state)
  const cb = await call(`/api/auth/google/callback?code=test-code&state=${encodeURIComponent(state)}`, { redirect: 'manual' })
  return cb
}

describe('API', () => {
  before(async () => {
    db = await createDb({ databaseUrl: '', sqliteFile: ':memory:' })
    const app = createApp({
      db,
      jwtSecret: 'test-secret',
      serveClient: false,
      disableRateLimit: true,
      adminEmails: ['owner@mail.udp.cl'],
      google: {
        clientId: 'test.apps.googleusercontent.com',
        clientSecret: 'test-secret',
      },
      fetchImpl: async (url, opts = {}) => {
        const href = String(url)
        if (href.includes('oauth2.googleapis.com/tokeninfo')) {
          return new Response(JSON.stringify({
            aud: 'test.apps.googleusercontent.com',
            azp: 'test.apps.googleusercontent.com',
            iss: 'https://accounts.google.com',
            email: googleProfile.email,
            email_verified: googleProfile.email_verified,
          }), { status: 200, headers: { 'Content-Type': 'application/json' } })
        }
        if (href.includes('oauth2.googleapis.com/token')) {
          return new Response(JSON.stringify({ access_token: 'ya29.test', id_token: 'id.jwt' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        if (href.includes('salas.docencia-eit.cl')) {
          return new Response(JSON.stringify({
            data: { allSalasUdps: { edges: [
              { node: { code: 'CIT2013', section: 2, course: 'IA', place: 'E441.2.S201', start: '11:30:00', finish: '12:50:00', day: 1, teacher: 'Reyes' } },
              { node: { code: 'CIT1000', section: 1, course: 'Programacion', place: 'V432.3.S312', start: '8:30:00', finish: '9:50:00', day: 1, teacher: 'Cruz' } },
            ] } },
          }), { status: 200, headers: { 'Content-Type': 'application/json' } })
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
    assert.equal(r.json.ok, true)
    assert.equal(r.json.db, 'sqlite')
    assert.equal(r.json.google, true)
    assert.match(r.headers.get('content-security-policy') || '', /default-src 'self'/)
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff')
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
    cookieJar.clear()
    const r = await call('/api/auth/google', { redirect: 'manual', cookie: false })
    assert.equal(r.status, 302)
    const location = new URL(r.location)
    assert.equal(location.hostname, 'accounts.google.com')
    assert.equal(location.searchParams.get('hd'), 'udp.cl')
    assert.equal(location.searchParams.get('prompt'), 'select_account')
    assert.ok(location.searchParams.get('state'))
    assert.ok(location.searchParams.get('code_challenge'))
    assert.equal(cookieJar.has('mo_oauth_state'), false)
    assert.equal(cookieJar.has('mo_oauth_pkce'), false)
  })

  it('finishes Google login without OAuth cookies', async () => {
    cookieJar.clear()
    const start = await call('/api/auth/google', { redirect: 'manual', cookie: false })
    const state = new URL(start.location, base).searchParams.get('state')
    cookieJar.clear()
    googleProfile = {
      email: 'ana@mail.udp.cl',
      email_verified: true,
      name: 'Ana',
      sub: 'google-ana',
    }
    const cb = await call(
      `/api/auth/google/callback?code=test-code&state=${encodeURIComponent(state)}`,
      { redirect: 'manual', cookie: false },
    )
    assert.equal(cb.status, 302)
    assert.equal(cb.location, '/')
    assert.ok(cookieJar.has('mo_session'))
    assert.equal(cookieJar.has('mo_oauth_pkce'), false)
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

    const stored = await db.get(
      'SELECT value FROM user_data WHERE user_id = $1 AND key = $2',
      [me.json.user.id, 'app_events_v3'],
    )
    assert.match(String(stored.value), /^enc:v1:/)
    assert.equal(String(stored.value).includes('Control'), false)

    await db.run(
      `INSERT INTO user_data (user_id, key, value, updated_at) VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
      [me.json.user.id, 'app_career_v1', '"ing_civil_en_infor_y_tel"', new Date().toISOString()],
    )
    const legacy = await call('/api/data')
    assert.equal(legacy.json.data.app_career_v1, 'ing_civil_en_infor_y_tel')
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
    const stolen = cookieJar.get('mo_session')
    const out = await call('/api/auth/logout', { method: 'POST' })
    assert.equal(out.status, 204)
    cookieJar.set('mo_session', stolen)
    const me = await call('/api/auth/me')
    assert.equal(me.status, 401)
  })

  it('lists UDP academic offerings without auth', async () => {
    const r = await call('/api/oferta', { cookie: false })
    assert.equal(r.status, 200)
    assert.ok(r.json.faculties.length > 0)
    assert.ok(r.json.faculties.some(f => f.careers.some(c => c.id === 'ing_civil_en_infor_y_tel')))
  })

  it('requires a session to download a career offering', async () => {
    const anon = await call('/api/oferta/no-existe', { cookie: false })
    assert.equal(anon.status, 401)

    await signInGoogle({
      email: 'ana@mail.udp.cl',
      email_verified: true,
      name: 'Ana',
      sub: 'google-ana',
    })
    const r = await call('/api/oferta/no-existe')
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

  it('lists free and busy rooms for a UDP block', async () => {
    const r = await call('/api/salas?dia=1&bloque=11:30')
    assert.equal(r.status, 200)
    assert.equal(r.json.ocupadas['E441.2.S201'].curso, 'IA')
    assert.ok(r.json.vacias.includes('V432.3.S312'))
  })

  it('lets two UDP accounts become friends and compare schedules', async () => {
    await signInGoogle({
      email: 'ana@mail.udp.cl',
      email_verified: true,
      name: 'Ana',
      sub: 'google-ana',
    })
    const saved = await call('/api/data', {
      method: 'POST',
      body: { data: { app_schedule_v1: [
        { id: 'a1', day: 1, startTime: '11:30', endTime: '12:50', subject: 'IA', professor: 'Secreto', location: 'E441' },
      ] } },
    })
    assert.equal(saved.status, 200)

    await signInGoogle({
      email: 'owner@mail.udp.cl',
      email_verified: true,
      name: 'Alexis',
      sub: 'google-owner',
    })
    const gmail = await call('/api/friends', { method: 'POST', body: { email: 'amigo@gmail.com' } })
    assert.equal(gmail.status, 403)

    const self = await call('/api/friends', { method: 'POST', body: { email: 'owner@mail.udp.cl' } })
    assert.equal(self.status, 400)

    const invite = await call('/api/friends', { method: 'POST', body: { email: 'Ana@Mail.udp.cl' } })
    assert.equal(invite.status, 201)
    assert.equal(invite.json.status, 'pending')

    const asOwner = await call('/api/friends')
    assert.equal(asOwner.json.outgoing.length, 1)
    const friendshipId = asOwner.json.outgoing[0].id

    await signInGoogle({
      email: 'ana@mail.udp.cl',
      email_verified: true,
      name: 'Ana',
      sub: 'google-ana',
    })
    const asAna = await call('/api/friends')
    assert.equal(asAna.json.incoming.length, 1)
    const accepted = await call(`/api/friends/${friendshipId}/accept`, { method: 'POST' })
    assert.equal(accepted.status, 200)

    const horario = await call(`/api/friends/${friendshipId}/horario`)
    assert.equal(horario.status, 200)
    assert.equal(horario.json.friend.email, 'owner@mail.udp.cl')

    await signInGoogle({
      email: 'owner@mail.udp.cl',
      email_verified: true,
      name: 'Alexis',
      sub: 'google-owner',
    })
    const anaHorario = await call(`/api/friends/${friendshipId}/horario`)
    assert.equal(anaHorario.json.schedule[0].subject, 'IA')
    assert.equal(anaHorario.json.schedule[0].professor, undefined)
    assert.equal(anaHorario.json.schedule[0].location, undefined)

    const cruce = await call(`/api/friends/cruce?ids=${friendshipId}`)
    assert.equal(cruce.status, 200)
    assert.ok(cruce.json.slots.length >= 7)
    const busy = cruce.json.slots.find((slot) => slot.day === 1 && slot.block.id === '11:30')
    assert.equal(busy.free, false)
  })

  it('queues a friend invite until the other UDP account signs in', async () => {
    await signInGoogle({
      email: 'owner@mail.udp.cl',
      email_verified: true,
      name: 'Alexis',
      sub: 'google-owner',
    })
    const invite = await call('/api/friends', { method: 'POST', body: { email: 'nuevo@mail.udp.cl' } })
    assert.equal(invite.status, 201)
    assert.equal(invite.json.status, 'pending')
    assert.equal(invite.json.queued, true)

    const listed = await call('/api/friends')
    assert.equal(listed.json.outgoing.some((row) => row.friend.email === 'nuevo@mail.udp.cl'), true)

    await signInGoogle({
      email: 'nuevo@mail.udp.cl',
      email_verified: true,
      name: 'Nuevo',
      sub: 'google-nuevo',
    })
    const asNew = await call('/api/friends')
    assert.equal(asNew.json.incoming.length, 1)
    assert.equal(asNew.json.incoming[0].friend.email, 'owner@mail.udp.cl')

    const accepted = await call(`/api/friends/${asNew.json.incoming[0].id}/accept`, { method: 'POST' })
    assert.equal(accepted.status, 200)
  })

  it('deletes the account and rejects the old session', async () => {
    await signInGoogle({
      email: 'borrar@mail.udp.cl',
      email_verified: true,
      name: 'Borrar',
      sub: 'google-borrar',
    })
    const gone = await call('/api/auth/me', { method: 'DELETE' })
    assert.equal(gone.status, 204)
    const me = await call('/api/auth/me')
    assert.equal(me.status, 401)
  })
})

describe('Google OAuth errors', () => {
  let errorServer
  let errorBase
  let errorDb

  const errorCall = async (path, { redirect = 'manual' } = {}) => {
    const res = await fetch(errorBase + path, { redirect })
    return { status: res.status, location: res.headers.get('location') }
  }

  before(async () => {
    errorDb = await createDb({ databaseUrl: '', sqliteFile: ':memory:' })
    const app = createApp({
      db: errorDb,
      jwtSecret: 'test-secret',
      serveClient: false,
      disableRateLimit: true,
      google: {
        clientId: 'test.apps.googleusercontent.com',
        clientSecret: '  "bad-secret"  ',
      },
      fetchImpl: async (url) => {
        if (String(url).includes('oauth2.googleapis.com/token')) {
          return new Response(JSON.stringify({ error: 'invalid_client' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        return new Response('{}', { status: 500 })
      },
    })
    await new Promise((resolve) => { errorServer = app.listen(0, resolve) })
    errorBase = `http://127.0.0.1:${errorServer.address().port}`
  })

  after(async () => {
    errorServer.close()
    await errorDb.close()
  })

  it('maps an invalid Google secret to a clear login error', async () => {
    const start = await errorCall('/api/auth/google')
    const state = new URL(start.location, errorBase).searchParams.get('state')
    const cb = await errorCall(`/api/auth/google/callback?code=test-code&state=${encodeURIComponent(state)}`)
    assert.equal(cb.status, 302)
    assert.equal(cb.location, '/?error=secret')
  })
})

describe('production health and bad Google tokens', () => {
  let extraServer
  let extraBase
  let extraDb

  before(async () => {
    extraDb = await createDb({ databaseUrl: '', sqliteFile: ':memory:' })
    const app = createApp({
      db: extraDb,
      jwtSecret: 'test-secret',
      serveClient: false,
      disableRateLimit: true,
      revealHealth: false,
      google: {
        clientId: 'test.apps.googleusercontent.com',
        clientSecret: 'test-secret',
      },
      fetchImpl: async (url) => {
        const href = String(url)
        if (href.includes('oauth2.googleapis.com/tokeninfo')) {
          return new Response(JSON.stringify({ error: 'invalid_token' }), { status: 400 })
        }
        if (href.includes('oauth2.googleapis.com/token')) {
          return new Response(JSON.stringify({ access_token: 'ya29.test', id_token: 'bad.jwt' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        return new Response('{}', { status: 500 })
      },
    })
    await new Promise((resolve) => { extraServer = app.listen(0, resolve) })
    extraBase = `http://127.0.0.1:${extraServer.address().port}`
  })

  after(async () => {
    extraServer.close()
    await extraDb.close()
  })

  it('hides database and Google details', async () => {
    const res = await fetch(`${extraBase}/api/health`)
    const json = await res.json()
    assert.equal(res.status, 200)
    assert.deepEqual(json, { ok: true })
  })

  it('rejects a login if the id_token is not valid', async () => {
    const start = await fetch(`${extraBase}/api/auth/google`, { redirect: 'manual' })
    const state = new URL(start.headers.get('location'), extraBase).searchParams.get('state')
    const cb = await fetch(
      `${extraBase}/api/auth/google/callback?code=test-code&state=${encodeURIComponent(state)}`,
      { redirect: 'manual' },
    )
    assert.equal(cb.status, 302)
    assert.equal(cb.headers.get('location'), '/?error=google')
  })
})
