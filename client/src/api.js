/** Cliente HTTP mínimo para la API propia (misma origin, sesión por cookie). */

export class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

async function request(path, { method = 'GET', body, keepalive = false } = {}) {
  const res = await fetch(path, {
    method,
    keepalive,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (res.status === 204) return null
  const text = await res.text()
  const json = text ? safeJson(text) : null
  if (!res.ok) throw new ApiError(res.status, json?.error || `Error ${res.status}`)
  return json
}

const safeJson = (text) => { try { return JSON.parse(text) } catch { return null } }

export const api = {
  me: () => request('/api/auth/me'),
  login: (email, password) => request('/api/auth/login', { method: 'POST', body: { email, password } }),
  register: (email, name, password) => request('/api/auth/register', { method: 'POST', body: { email, name, password } }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  loadData: () => request('/api/data'),
  saveData: (data, { keepalive = false } = {}) => request('/api/data', { method: 'POST', body: { data }, keepalive }),
  listOfferings: () => request('/api/oferta'),
  loadOffering: (id) => request(`/api/oferta/${encodeURIComponent(id)}`),
  listUsers: () => request('/api/admin/users'),
}
