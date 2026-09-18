import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildGoogleAuthUrl, createPkce, requestOrigin, googleEmailVerified,
  signOAuthState, readOAuthState, sanitizeGoogleValue,
} from './googleAuth.js'

test('arma la URL de Google con PKCE y dominio UDP', () => {
  const { verifier, challenge } = createPkce()
  const redirectUri = 'https://app.vercel.app/api/auth/google/callback'
  const state = signOAuthState('test-secret', { verifier, redirectUri })
  const url = new URL(buildGoogleAuthUrl({
    clientId: 'abc.apps.googleusercontent.com',
    redirectUri,
    state,
    challenge,
  }))
  assert.equal(url.origin, 'https://accounts.google.com')
  assert.equal(url.searchParams.get('hd'), 'udp.cl')
  assert.equal(url.searchParams.get('prompt'), 'select_account')
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256')
  assert.equal(url.searchParams.get('state'), state)
  assert.equal(url.searchParams.get('redirect_uri'), redirectUri)
  const parsed = readOAuthState('test-secret', state)
  assert.equal(parsed.verifier, verifier)
  assert.equal(parsed.redirectUri, redirectUri)
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

test('limpia comillas y espacios del secreto de Google', () => {
  assert.equal(sanitizeGoogleValue('  "abc"  '), 'abc')
  assert.equal(sanitizeGoogleValue("'xyz'"), 'xyz')
})
