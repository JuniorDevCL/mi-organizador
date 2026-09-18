import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildGoogleAuthUrl, createPkce, requestOrigin, googleEmailVerified,
} from './googleAuth.js'

test('arma la URL de Google con PKCE y dominio UDP', () => {
  const { state, verifier, challenge } = createPkce()
  assert.equal(typeof verifier, 'string')
  assert.notEqual(state, challenge)
  const url = new URL(buildGoogleAuthUrl({
    clientId: 'abc.apps.googleusercontent.com',
    redirectUri: 'https://app.vercel.app/api/auth/google/callback',
    state,
    challenge,
  }))
  assert.equal(url.origin, 'https://accounts.google.com')
  assert.equal(url.searchParams.get('hd'), 'udp.cl')
  assert.equal(url.searchParams.get('prompt'), 'select_account')
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256')
  assert.equal(url.searchParams.get('state'), state)
  assert.equal(url.searchParams.get('redirect_uri'), 'https://app.vercel.app/api/auth/google/callback')
})

test('toma el origen público del request o de PUBLIC_URL', () => {
  assert.equal(
    requestOrigin({ get: (name) => (name === 'host' ? 'localhost:3000' : undefined), protocol: 'http' }),
    'http://localhost:3000',
  )
  const prev = process.env.PUBLIC_URL
  process.env.PUBLIC_URL = 'https://mi-organizador.vercel.app/'
  assert.equal(requestOrigin({}), 'https://mi-organizador.vercel.app')
  if (prev == null) delete process.env.PUBLIC_URL
  else process.env.PUBLIC_URL = prev
})

test('exige que Google haya verificado el correo', () => {
  assert.equal(googleEmailVerified({ email_verified: true }), true)
  assert.equal(googleEmailVerified({ email_verified: 'true' }), true)
  assert.equal(googleEmailVerified({ email_verified: false }), false)
})
