import { useEffect, useMemo, useState } from 'react'
import { api } from './api'

const DAY_SHORT = { 1: 'Lun', 2: 'Mar', 3: 'Mié', 4: 'Jue', 5: 'Vie' }
const STATE_LABEL = {
  in_class: 'En clases',
  free_until: 'Libre hasta',
  free: 'Libre el resto del día',
}

export default function FriendsTab() {
  const [email, setEmail] = useState('')
  const [bundle, setBundle] = useState({ friends: [], incoming: [], outgoing: [] })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState([])
  const [cruce, setCruce] = useState(null)
  const [detail, setDetail] = useState(null)

  const load = () => {
    setLoading(true)
    setError('')
    api.listFriends()
      .then(setBundle)
      .catch((err) => setError(err.message || 'No se pudieron cargar los amigos'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const refreshCruce = (ids = selected) => {
    api.friendsCruce(ids)
      .then(setCruce)
      .catch((err) => setError(err.message || 'No se pudo comparar'))
  }

  useEffect(() => {
    refreshCruce(selected)
  }, [selected.join('|')])

  const invite = async (e) => {
    e.preventDefault()
    setError('')
    try {
      await api.inviteFriend(email)
      setEmail('')
      load()
    } catch (err) {
      setError(err.message || 'No se pudo enviar la solicitud')
    }
  }

  const toggle = (id) => {
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  const openFriend = async (id) => {
    try {
      setDetail(await api.friendSchedule(id))
    } catch (err) {
      setError(err.message)
    }
  }

  const freeNow = cruce?.people || []
  const freeSlots = useMemo(
    () => (cruce?.slots || []).filter((slot) => slot.free && slot.day >= 1 && slot.day <= 5),
    [cruce],
  )

  return (
    <div className="campus-page">
      <p className="campus-note">
        Invita por correo UDP. Al aceptar, se comparte solo el ramo y el bloque (sin sala ni profesor). Si todavía no entra, le llega al iniciar sesión.
      </p>

      <form className="friend-invite" onSubmit={invite}>
        <label className="field" style={{ flex: 1 }}>
          <span>Agregar amigo</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="compañero@mail.udp.cl"
            autoComplete="off"
            required
          />
        </label>
        <button type="submit" className="btn-primary-inline">Invitar</button>
      </form>

      {error && <p className="auth-error" role="alert">{error}</p>}
      {loading && <p className="campus-muted">Cargando…</p>}

      {bundle.incoming.length > 0 && (
        <section>
          <h3 className="campus-h">Te invitaron</h3>
          {bundle.incoming.map((row) => (
            <div key={row.id} className="friend-row">
              <div>
                <p className="friend-name">{row.friend.name}</p>
                <p className="friend-email">{row.friend.email}</p>
              </div>
              <div className="friend-actions">
                <button type="button" className="pill active" onClick={async () => { await api.acceptFriend(row.id); load() }}>Aceptar</button>
                <button type="button" className="pill" onClick={async () => { await api.declineFriend(row.id); load() }}>Rechazar</button>
              </div>
            </div>
          ))}
        </section>
      )}

      {bundle.outgoing.length > 0 && (
        <section>
          <h3 className="campus-h">Enviadas</h3>
          {bundle.outgoing.map((row) => (
            <div key={row.id} className="friend-row">
              <div>
                <p className="friend-name">{row.friend.name}</p>
                <p className="friend-email">
                  {row.queued ? `Pendiente · entra ${row.friend.email} y le llega` : `Esperando a ${row.friend.email}`}
                </p>
              </div>
              <button type="button" className="btn-ghost" onClick={async () => { await api.removeFriend(row.id); load() }}>Cancelar</button>
            </div>
          ))}
        </section>
      )}

      <section>
        <h3 className="campus-h">Mis amigos</h3>
        {bundle.friends.length === 0 && !loading && (
          <p className="campus-muted">Todavía no tienes amigos. Invita un correo UDP; si aún no entra, la solicitud queda en espera.</p>
        )}
        {bundle.friends.map((row) => (
          <div key={row.id} className="friend-row">
            <label className="friend-check">
              <input type="checkbox" checked={selected.includes(row.id)} onChange={() => toggle(row.id)} />
              <span>
                <p className="friend-name">{row.friend.name}</p>
                <p className="friend-email">{row.friend.email}</p>
              </span>
            </label>
            <div className="friend-actions">
              <button type="button" className="pill" onClick={() => openFriend(row.id)}>Horario</button>
              <button type="button" className="btn-ghost" onClick={async () => {
                await api.removeFriend(row.id)
                setSelected((prev) => prev.filter((id) => id !== row.id))
                load()
              }}>Quitar</button>
            </div>
          </div>
        ))}
      </section>

      <section className="campus-card">
        <h3 className="campus-h" style={{ marginTop: 0 }}>Qué hacen ahora</h3>
        <p className="campus-muted">Tú{selected.length ? ` + ${selected.length} amigo${selected.length === 1 ? '' : 's'}` : ''} · bloque actual en Chile</p>
        {(freeNow.length ? freeNow : []).map((person) => (
          <div key={person.id} className="now-row">
            <strong>{person.self ? 'Tú' : person.name}</strong>
            <span>
              {STATE_LABEL[person.now?.state] || '—'}
              {person.now?.block ? ` · ${person.now.block.subject} ${person.now.block.startTime || ''}` : ''}
            </span>
          </div>
        ))}
        {cruce?.nowBlock && (
          <p className={`campus-banner ${cruce.freeNow ? 'ok' : ''}`}>
            {cruce.freeNow
              ? `Todos libres en ${cruce.nowBlock.label}`
              : `Alguien tiene clase en ${cruce.nowBlock.label}`}
          </p>
        )}
      </section>

      {detail && (
        <section className="campus-card">
          <div className="campus-card-head">
            <strong>Horario de {detail.friend.name}</strong>
            <button type="button" className="btn-ghost" onClick={() => setDetail(null)}>Cerrar</button>
          </div>
          {detail.schedule.length === 0 && <p className="campus-muted">Aún no genera su horario en Config.</p>}
          {detail.schedule.map((block) => (
            <p key={block.id || `${block.day}-${block.startTime}`} className="sala-class">
              {DAY_SHORT[block.day]} {block.startTime}–{block.endTime} · {block.subject}
            </p>
          ))}
        </section>
      )}

      <section>
        <h3 className="campus-h">Bloques en que todos están libres</h3>
        {selected.length === 0 && <p className="campus-muted">Marca uno o más amigos para cruzar con tu horario.</p>}
        {selected.length > 0 && freeSlots.length === 0 && <p className="campus-muted">No hay un bloque compartido libre.</p>}
        <div className="cruce-grid">
          {freeSlots.map((slot) => (
            <div key={`${slot.day}-${slot.block.id}`} className="sala-chip free">
              <span className="sala-code">{DAY_SHORT[slot.day]} {slot.block.label}</span>
              <span className="sala-until">Todos libres</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
