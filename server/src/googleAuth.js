import { createHash, randomBytes } from 'node:crypto'
import jwt from 'jsonwebtoken'

export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
export const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo'

export function createPkce() {
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

export function signOAuthState(secret, { verifier, redirectUri }) {
  return jwt.sign(
    { v: verifier, r: redirectUri },
    secret,
    { expiresIn: '10m', algorithm: 'HS256' },
  )
}

export function readOAuthState(secret, state) {
  const payload = jwt.verify(String(state || ''), secret, { algorithms: ['HS256'] })
  const verifier = payload?.v
  if (!verifier) throw new Error('state inválido')
  return { verifier, redirectUri: payload?.r || '' }
}

export function sanitizeGoogleValue(value) {
  return String(value || '').trim().replace(/^['"]+|['"]+$/g, '')
}

export function requestOrigin(req) {
  const fromEnv = String(process.env.PUBLIC_URL || '').trim().replace(/\/$/, '')
  if (fromEnv) return fromEnv
  const proto = String(req.get?.('x-forwarded-proto') || req.protocol || 'http')
    .split(',')[0].trim()
  const host = String(req.get?.('x-forwarded-host') || req.get?.('host') || '')
    .split(',')[0].trim()
  return `${proto}://${host}`
}

export function buildGoogleAuthUrl({
  clientId,
  redirectUri,
  state,
  challenge,
  hostedDomain = 'udp.cl',
}) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    access_type: 'online',
    prompt: 'select_account',
    hd: hostedDomain,
  })
  return `${GOOGLE_AUTH_URL}?${params}`
}

const readJson = async (res) => {
  try { return await res.json() } catch { return {} }
}

export async function exchangeGoogleCode({
  fetchImpl = fetch,
  clientId,
  clientSecret,
  code,
  redirectUri,
  verifier,
}) {
  const res = await fetchImpl(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code_verifier: verifier,
    }),
  })
  const json = await readJson(res)
  if (!res.ok || !json.access_token) {
    const err = new Error(json.error_description || json.error || 'No se pudo validar Google')
    err.status = 401
    err.code = json.error
    throw err
  }
  return json
}

export async function fetchGoogleUser({ fetchImpl = fetch, accessToken }) {
  const res = await fetchImpl(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const json = await readJson(res)
  if (!res.ok || !json.email) {
    const err = new Error('No se pudo leer tu cuenta de Google')
    err.status = 401
    throw err
  }
  return json
}

export function googleEmailVerified(profile) {
  return profile?.email_verified === true || profile?.email_verified === 'true'
}
