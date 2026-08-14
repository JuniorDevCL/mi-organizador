/** Google Calendar sharing helpers. */

export const SHARED_CALENDAR_EMAIL = 'jperezpavez03@gmail.com'

export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar'

export const isValidShareEmail = (email) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim())

export const calendarAclResource = (email, role = 'writer') => ({
  role,
  scope: {
    type: 'user',
    value: String(email || '').trim().toLowerCase(),
  },
})

export const isAlreadySharedError = (err) => {
  const status = err?.status || err?.result?.error?.code
  const reason = err?.result?.error?.errors?.[0]?.reason || ''
  const message = String(err?.result?.error?.message || err?.message || '')
  return status === 409 || reason === 'duplicate' || /already exists/i.test(message)
}

export const isInsufficientScopeError = (err) => {
  const status = err?.status || err?.result?.error?.code
  const message = String(err?.result?.error?.message || err?.message || '')
  return status === 403 && /insufficient|access not granted|scope/i.test(message)
}
