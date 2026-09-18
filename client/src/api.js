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
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  loadData: () => request('/api/data'),
  saveData: (data, { keepalive = false } = {}) => request('/api/data', { method: 'POST', body: { data }, keepalive }),
  listOfferings: () => request('/api/oferta'),
  loadOffering: (id) => request(`/api/oferta/${encodeURIComponent(id)}`),
  listUsers: () => request('/api/admin/users'),
  salasNow: (q = '') => request(`/api/salas/ahora?q=${encodeURIComponent(q)}`),
  salas: ({ dia, bloque, q = '' }) => request(`/api/salas?dia=${encodeURIComponent(dia)}&bloque=${encodeURIComponent(bloque)}&q=${encodeURIComponent(q)}`),
  salaWeek: (nombre) => request(`/api/salas/sala/${encodeURIComponent(nombre)}`),
  listFriends: () => request('/api/friends'),
  inviteFriend: (email) => request('/api/friends', { method: 'POST', body: { email } }),
  acceptFriend: (id) => request(`/api/friends/${encodeURIComponent(id)}/accept`, { method: 'POST' }),
  declineFriend: (id) => request(`/api/friends/${encodeURIComponent(id)}/decline`, { method: 'POST' }),
  removeFriend: (id) => request(`/api/friends/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  friendSchedule: (id) => request(`/api/friends/${encodeURIComponent(id)}/horario`),
  friendsCruce: (ids = []) => request(`/api/friends/cruce?ids=${ids.map(encodeURIComponent).join(',')}`),
}
