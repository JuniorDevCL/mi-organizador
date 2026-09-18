import { useEffect, useState } from 'react'
import { api } from './api'

const DAYS = [
  { id: 1, label: 'Lun' },
  { id: 2, label: 'Mar' },
  { id: 3, label: 'Mié' },
  { id: 4, label: 'Jue' },
  { id: 5, label: 'Vie' },
]
const BUILDINGS = ['', 'E441', 'V432', 'E306', 'M253', 'E326']
const DAY_FULL = { 1: 'Lunes', 2: 'Martes', 3: 'Miércoles', 4: 'Jueves', 5: 'Viernes' }

const BLOCKS = [
  '08:30', '10:00', '11:30', '13:00', '14:30', '16:00', '17:25',
]

export default function SalasTab() {
  const [q, setQ] = useState('')
  const [dia, setDia] = useState(1)
  const [bloque, setBloque] = useState('08:30')
  const [live, setLive] = useState(true)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [room, setRoom] = useState(null)
  const [week, setWeek] = useState(null)

  const load = (opts = {}) => {
    const nextLive = opts.live ?? live
    const nextQ = opts.q ?? q
    const nextDia = opts.dia ?? dia
    const nextBloque = opts.bloque ?? bloque
    setLoading(true)
    setError('')
    const req = nextLive
      ? api.salasNow(nextQ)
      : api.salas({ dia: nextDia, bloque: nextBloque, q: nextQ })
    req
      .then((json) => {
        setData(json)
        if (nextLive && json.dia && json.bloque?.id) {
          setDia(json.dia)
          setBloque(json.bloque.id)
        }
      })
      .catch((err) => setError(err.message || 'No se pudieron cargar las salas'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load({ live: true }) }, [])

  const openRoom = (nombre) => {
    setRoom(nombre)
    setWeek(null)
    api.salaWeek(nombre).then(setWeek).catch(() => setWeek({ horario: {} }))
  }

  const occupied = data ? Object.values(data.ocupadas || {}) : []

  return (
    <div className="campus-page">
      <p className="campus-note">
        Ocupación según el horario publicado de Ingeniería (EIT). No incluye reservas,
        cancelaciones ni otras facultades.
      </p>

      <div className="campus-toolbar">
        <button type="button" className={`pill ${live ? 'active' : ''}`} onClick={() => { setLive(true); load({ live: true }) }}>
          Ahora
        </button>
        {DAYS.map((d) => (
          <button key={d.id} type="button" className={`pill ${!live && dia === d.id ? 'active' : ''}`}
            onClick={() => { setLive(false); setDia(d.id); load({ live: false, dia: d.id }) }}>
            {d.label}
          </button>
        ))}
      </div>

      <div className="campus-toolbar wrap">
        {BLOCKS.map((id) => (
          <button key={id} type="button" className={`pill ${bloque === id ? 'active' : ''}`}
            onClick={() => { setLive(false); setBloque(id); load({ live: false, bloque: id }) }}>
            {id}
          </button>
        ))}
      </div>

      <div className="campus-toolbar wrap">
        {BUILDINGS.map((code) => (
          <button key={code || 'all'} type="button" className={`pill ${q === code ? 'active' : ''}`}
            onClick={() => { setQ(code); load({ q: code }) }}>
            {code || 'Todas'}
          </button>
        ))}
      </div>

      <label className="field">
        <span>Buscar edificio o sala</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') load({ q }) }}
          placeholder="Ej: E441, V432.3.S312"
          autoComplete="off"
        />
      </label>

      {data?.mensaje_horario && <p className="campus-banner">{data.mensaje_horario}</p>}
      {error && <p className="auth-error" role="alert">{error}</p>}

      {data && (
        <p className="campus-meta">
          {data.dia_nombre} · {data.bloque?.label}
          {data.hora_chile ? ` · Chile ${data.hora_chile}` : ''}
          {loading ? ' · cargando…' : ` · ${data.total_libres} libres · ${data.total_ocupadas} ocupadas`}
        </p>
      )}

      {room && (
        <section className="campus-card">
          <div className="campus-card-head">
            <strong>{room}</strong>
            <button type="button" className="btn-ghost" onClick={() => { setRoom(null); setWeek(null) }}>Cerrar</button>
          </div>
          {!week ? <p className="campus-muted">Cargando horario…</p> : (
            [1, 2, 3, 4, 5].map((day) => (
              <div key={day} className="sala-day">
                <p className="sala-day-name">{DAY_FULL[day]}</p>
                {(week.horario?.[day] || []).length === 0
                  ? <p className="campus-muted">Sin clases</p>
                  : week.horario[day].map((cls, i) => (
                    <p key={i} className="sala-class">
                      {cls.start}–{cls.finish} · {cls.curso} · sec. {cls.seccion}
                    </p>
                  ))}
              </div>
            ))
          )}
        </section>
      )}

      <h3 className="campus-h">Salas libres</h3>
      <div className="campus-grid">
        {(data?.vacias || []).map((sala) => (
          <button key={sala} type="button" className="sala-chip free" onClick={() => openRoom(sala)}>
            <span className="sala-code">{sala}</span>
            <span className="sala-until">{data.vacias_info?.[sala]?.texto}</span>
            {data.vacias_info?.[sala]?.proximo_curso && (
              <span className="sala-next">Luego: {data.vacias_info[sala].proximo_curso}</span>
            )}
          </button>
        ))}
        {data && !data.vacias?.length && !loading && <p className="campus-muted">No hay salas libres con ese filtro.</p>}
      </div>

      <h3 className="campus-h">Salas ocupadas</h3>
      <div className="campus-grid">
        {occupied.map((info) => (
          <button key={info.sala} type="button" className="sala-chip busy" onClick={() => openRoom(info.sala)}>
            <span className="sala-code">{info.sala}</span>
            <span className="sala-until">{info.horario}</span>
            <span className="sala-next">{info.curso}</span>
          </button>
        ))}
        {data && !occupied.length && !loading && <p className="campus-muted">Nada ocupado en este bloque.</p>}
      </div>
    </div>
  )
}
