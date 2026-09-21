/**
 * Almacén de datos del usuario.
 *
 * - `LS.get/LS.set` conservan la misma firma que antes (la app la usa en todos lados).
 * - Los datos de la cuenta se cargan del servidor al iniciar sesión y cada cambio
 *   se guarda automáticamente (con debounce) en la base de datos.
 * - El token de Google Calendar vive solo en sessionStorage (se va al cerrar la pestaña).
 */
import { api } from './api'

const LOCAL_ONLY_KEYS = new Set(['g_access_token'])
const SAVE_DELAY_MS = 700

let cache = {}
let currentUserId = null
let pending = new Map()
let timer = null
let listeners = new Set()
let lastError = null

const safeGet = (storage, k, def) => {
  try { return JSON.parse(storage.getItem(k)) ?? def } catch { return def }
}

const safeSet = (storage, k, v) => {
  try {
    if (v == null) storage.removeItem(k)
    else storage.setItem(k, JSON.stringify(v))
  } catch { /* quota / private mode */ }
}

const local = {
  get: (k, def) => safeGet(globalThis.localStorage, k, def),
  set: (k, v) => safeSet(globalThis.localStorage, k, v),
  remove: (k) => { try { globalThis.localStorage.removeItem(k) } catch { /* */ } },
}

const session = {
  get: (k, def) => {
    try {
      const fromSession = globalThis.sessionStorage?.getItem(k)
      if (fromSession != null) return JSON.parse(fromSession) ?? def
      const fromLocal = globalThis.localStorage?.getItem(k)
      if (fromLocal != null) {
        globalThis.sessionStorage?.setItem(k, fromLocal)
        globalThis.localStorage.removeItem(k)
        return JSON.parse(fromLocal) ?? def
      }
    } catch { /* */ }
    return def
  },
  set: (k, v) => {
    try {
      if (v == null) {
        globalThis.sessionStorage?.removeItem(k)
        globalThis.localStorage?.removeItem(k)
        return
      }
      globalThis.sessionStorage?.setItem(k, JSON.stringify(v))
      globalThis.localStorage?.removeItem(k)
    } catch { /* */ }
  },
}

const cacheKey = (userId) => `mo_cache_${userId}`

const notify = (status) => { for (const fn of listeners) fn(status) }

async function flush({ keepalive = false } = {}) {
  if (timer) { clearTimeout(timer); timer = null }
  if (!pending.size || !currentUserId) return
  const batch = Object.fromEntries(pending)
  pending = new Map()
  notify('saving')
  try {
    await api.saveData(batch, { keepalive })
    lastError = null
    notify(pending.size ? 'saving' : 'saved')
  } catch (err) {
    // Reintentar en la próxima escritura; no se pierde nada porque el cache local persiste.
    for (const [k, v] of Object.entries(batch)) if (!pending.has(k)) pending.set(k, v)
    lastError = err
    notify('error')
    if (err?.status === 401) notify('unauthorized')
  }
}

const schedule = () => {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => flush(), SAVE_DELAY_MS)
}

export const LS = {
  get(key, def) {
    if (LOCAL_ONLY_KEYS.has(key)) return session.get(key, def)
    return cache[key] ?? def
  },
  set(key, value) {
    if (LOCAL_ONLY_KEYS.has(key)) { session.set(key, value); return }
    cache[key] = value
    if (currentUserId) {
      local.set(cacheKey(currentUserId), cache)
      pending.set(key, value)
      schedule()
    }
  },
}

export const store = {
  /** Carga los datos del usuario (servidor con respaldo local) antes de montar la app. */
  async hydrate(user) {
    currentUserId = user.id
    pending = new Map()
    const cached = local.get(cacheKey(user.id), {})
    try {
      const { data } = await api.loadData()
      cache = { ...cached, ...data }
    } catch (err) {
      if (err?.status === 401) throw err
      cache = { ...cached }
      lastError = err
    }
    local.set(cacheKey(user.id), cache)
    return cache
  },
  reset({ clearDevice = false } = {}) {
    const userId = currentUserId
    currentUserId = null
    cache = {}
    pending = new Map()
    if (timer) { clearTimeout(timer); timer = null }
    session.set('g_access_token', null)
    if (clearDevice && userId) local.remove(cacheKey(userId))
  },
  flush,
  subscribe(fn) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
  get lastError() { return lastError },
  get hasPending() { return pending.size > 0 },
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => { flush({ keepalive: true }) })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush({ keepalive: true })
  })
}
