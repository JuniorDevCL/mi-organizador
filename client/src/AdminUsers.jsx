import { useEffect, useMemo, useState } from 'react'
import { api } from './api'

const formatJoined = (iso) => {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso || '—'
  return date.toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' })
}

export default function AdminUsers() {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState([])
  const [error, setError] = useState('')

  const load = () => {
    setLoading(true)
    setError('')
    api.listUsers()
      .then((data) => setUsers(data.users || []))
      .catch((err) => setError(err.message || 'No se pudieron cargar las cuentas'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return users
    return users.filter((user) =>
      `${user.name} ${user.email}`.toLowerCase().includes(q)
    )
  }, [users, query])

  return (
    <section className="admin-users" aria-labelledby="admin-users-title">
      <div className="admin-users-head">
        <div>
          <p className="admin-users-kicker">Solo tú ves esto</p>
          <h2 id="admin-users-title">Personas que se unieron</h2>
          <p className="admin-users-sub">
            {loading ? 'Cargando…' : `${users.length} cuenta${users.length === 1 ? '' : 's'} registrada${users.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <button type="button" className="btn-ghost admin-users-refresh" onClick={load} disabled={loading}>
          Actualizar
        </button>
      </div>

      {users.length > 5 && (
        <label className="field admin-users-search">
          <span>Buscar</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nombre o correo"
            autoComplete="off"
          />
        </label>
      )}

      {error && <p className="auth-error" role="alert">{error}</p>}

      {!loading && !error && filtered.length === 0 && (
        <p className="admin-users-empty">No hay cuentas que coincidan.</p>
      )}

      <ul className="admin-users-list">
        {filtered.map((user) => (
          <li key={user.id}>
            <span className="admin-users-avatar" aria-hidden>
              {(user.name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
            </span>
            <div className="admin-users-meta">
              <p className="admin-users-name">{user.name}</p>
              <p className="admin-users-email">{user.email}</p>
            </div>
            <time className="admin-users-date" dateTime={user.createdAt}>
              {formatJoined(user.createdAt)}
            </time>
          </li>
        ))}
      </ul>
    </section>
  )
}
