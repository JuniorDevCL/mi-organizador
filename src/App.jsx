import { useState, useEffect, useRef } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// Google Calendar — define VITE_GOOGLE_CLIENT_ID en .env.local o en Netlify
// ─────────────────────────────────────────────────────────────────────────────
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || 'TU_CLIENT_ID_AQUI.apps.googleusercontent.com'
const PLACEHOLDER_CLIENT_ID = 'TU_CLIENT_ID_AQUI.apps.googleusercontent.com'
const isGoogleConfigured = () => GOOGLE_CLIENT_ID && GOOGLE_CLIENT_ID !== PLACEHOLDER_CLIENT_ID
const SCOPES = 'https://www.googleapis.com/auth/calendar.events'

// ─── Helpers ──────────────────────────────────────────────────────────────────
const LS = {
  get: (k, def) => { try { return JSON.parse(localStorage.getItem(k)) ?? def } catch { return def } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} },
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2)

const COLORS = [
  { bg: '#EDE9FF', text: '#4A3F8A', border: '#C4B8F5' },
  { bg: '#E0F5EE', text: '#0B5C40', border: '#7DD4B5' },
  { bg: '#FEF0E6', text: '#7A3510', border: '#F5B98A' },
  { bg: '#E8F4FD', text: '#0D4A82', border: '#8CC4EE' },
  { bg: '#FDF0F5', text: '#7A2040', border: '#E8A0BC' },
]
const TAG_COLORS = ['#7F77DD', '#1D9E75', '#D85A30', '#378ADD', '#D4537E']

const TYPE_CFG = {
  control: { label: 'Control', bg: '#E8F4FD', text: '#0D4A82', border: '#8CC4EE', gcalColor: '5' },
  solemne: { label: 'Solemne', bg: '#FCEBEB', text: '#A32D2D', border: '#F09595', gcalColor: '11' },
  tarea:   { label: 'Tarea',   bg: '#FAEEDA', text: '#854F0B', border: '#FAC775', gcalColor: '6' },
  otro:    { label: 'Otro',    bg: '#EDE9FF', text: '#4A3F8A', border: '#C4B8F5', gcalColor: '1' },
}

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

const normalizeSubject = (s) =>
  s.trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')

const matchSubject = (a, b) => {
  const x = normalizeSubject(a)
  const y = normalizeSubject(b)
  if (!x || !y) return false
  return x.includes(y) || y.includes(x)
}

const slotDuration = (startTime, endTime) => {
  const [sh, sm] = startTime.split(':').map(Number)
  const [eh, em] = endTime.split(':').map(Number)
  return (eh * 60 + em) - (sh * 60 + sm)
}

const findScheduleSlot = (schedule, dateStr, subject) => {
  if (!dateStr || !subject.trim() || !schedule.length) return null
  const day = new Date(dateStr + 'T12:00:00').getDay()
  return schedule.find(s => s.day === day && matchSubject(subject, s.subject)) || null
}

// ─── Icon ─────────────────────────────────────────────────────────────────────
const Icon = ({ name, size = 20 }) => {
  const icons = {
    target:   <><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></>,
    calendar: <><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>,
    plus:     <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
    note:     <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></>,
    trash:    <><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></>,
    chevron:  <polyline points="6,9 12,15 18,9"/>,
    check:    <polyline points="20,6 9,17 4,12"/>,
    link:     <><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></>,
    clock:    <><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></>,
    star:     <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26 12,2"/>,
    google:   <><path d="M20.283 10.356h-8.327v3.451h4.792c-.446 2.193-2.313 3.453-4.792 3.453a5.27 5.27 0 0 1-5.279-5.28 5.27 5.27 0 0 1 5.279-5.279c1.259 0 2.397.447 3.29 1.178l2.6-2.599c-1.584-1.381-3.615-2.233-5.89-2.233a8.908 8.908 0 0 0-8.934 8.934 8.907 8.907 0 0 0 8.934 8.934c4.467 0 8.529-3.249 8.529-8.934 0-.528-.081-1.097-.202-1.625z"/></>,
    back:     <><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12,19 5,12 12,5"/></>,
    logout:   <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16,17 21,12 16,7"/><line x1="21" y1="12" x2="9" y2="12"/></>,
    book:     <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></>,
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ display: 'block', flexShrink: 0 }}>
      {icons[name]}
    </svg>
  )
}

// ─── Shared styles ────────────────────────────────────────────────────────────
const inputSt = {
  width: '100%', padding: '10px 12px', borderRadius: 10,
  border: '1.5px solid #E8E8F0', fontSize: 14, color: '#1A1A2E',
  background: '#FAFAFA', outline: 'none', fontFamily: 'inherit',
}
const primaryBtn = {
  flex: 1, padding: '10px 16px', borderRadius: 10, border: 'none',
  background: '#5238C4', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
}
const secondaryBtn = {
  padding: '10px 16px', borderRadius: 10, border: '1.5px solid #E8E8F0',
  background: '#fff', color: '#555', fontSize: 14, fontWeight: 500, cursor: 'pointer',
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────
const ProgressBar = ({ value }) => (
  <div style={{ background: '#E8E8F0', borderRadius: 99, height: 6, overflow: 'hidden' }}>
    <div style={{
      width: `${Math.min(100, value)}%`, height: '100%',
      background: value >= 100 ? '#1D9E75' : '#7F77DD',
      borderRadius: 99, transition: 'width 0.4s ease',
    }} />
  </div>
)

// ─── Goal Form ────────────────────────────────────────────────────────────────
function GoalForm({ onSave, onClose, colorIdx }) {
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')

  return (
    <div style={{ background: '#fff', borderRadius: 16, padding: 16, marginBottom: 16, border: '1px solid #EAEAF0' }}>
      <p style={{ fontWeight: 700, fontSize: 15, color: '#1A1A2E', marginBottom: 12 }}>Nuevo objetivo</p>
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Nombre del objetivo *" style={inputSt} />
      <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Descripción (opcional)" rows={2}
        style={{ ...inputSt, resize: 'vertical', marginTop: 8, lineHeight: 1.5 }} />
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={() => { if (title.trim()) onSave({ id: uid(), title, desc, notes: [], colorIdx, createdAt: Date.now() }) }}
          style={{ ...primaryBtn, opacity: title.trim() ? 1 : 0.5 }}>
          Crear objetivo
        </button>
        <button onClick={onClose} style={secondaryBtn}>Cancelar</button>
      </div>
    </div>
  )
}

// ─── Goal Detail ──────────────────────────────────────────────────────────────
function GoalDetail({ goal, setGoals, setSelectedGoal, showToast }) {
  const [noteText, setNoteText] = useState('')
  const c = COLORS[goal.colorIdx % COLORS.length]

  const addNote = () => {
    if (!noteText.trim()) return
    setGoals(prev => prev.map(g => g.id === goal.id
      ? { ...g, notes: [...(g.notes || []), { id: uid(), text: noteText, done: false, createdAt: Date.now() }] }
      : g))
    setNoteText('')
    showToast('Avance registrado ✓')
  }

  const toggleNote = nid => setGoals(prev => prev.map(g =>
    g.id === goal.id ? { ...g, notes: g.notes.map(n => n.id === nid ? { ...n, done: !n.done } : n) } : g))

  const deleteNote = nid => setGoals(prev => prev.map(g =>
    g.id === goal.id ? { ...g, notes: g.notes.filter(n => n.id !== nid) } : g))

  const deleteGoal = () => {
    setGoals(prev => prev.filter(g => g.id !== goal.id))
    setSelectedGoal(null)
    showToast('Objetivo eliminado')
  }

  const done = (goal.notes || []).filter(n => n.done).length
  const total = (goal.notes || []).length
  const pct = total ? Math.round(done / total * 100) : 0

  return (
    <div>
      <button onClick={() => setSelectedGoal(null)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7F77DD', fontSize: 13, fontWeight: 600, padding: '0 0 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon name="back" size={16} /> Todos los objetivos
      </button>

      <div style={{ background: c.bg, borderRadius: 16, padding: 16, marginBottom: 16, border: `1px solid ${c.border}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <p style={{ fontWeight: 700, fontSize: 18, color: c.text, lineHeight: 1.3 }}>{goal.title}</p>
            {goal.desc && <p style={{ marginTop: 4, fontSize: 13, color: c.text, opacity: 0.8, lineHeight: 1.5 }}>{goal.desc}</p>}
          </div>
          <button onClick={deleteGoal}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.text, opacity: 0.4, padding: 4, marginLeft: 8 }}>
            <Icon name="trash" size={16} />
          </button>
        </div>
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: c.text, fontWeight: 500 }}>{done}/{total} avances</span>
            <span style={{ fontSize: 13, color: c.text, fontWeight: 700 }}>{pct}%</span>
          </div>
          <ProgressBar value={pct} />
        </div>
      </div>

      <div style={{ background: '#fff', borderRadius: 14, padding: 14, marginBottom: 16, border: '1px solid #EAEAF0' }}>
        <p style={{ fontWeight: 600, fontSize: 14, color: '#1A1A2E', marginBottom: 10 }}>Registrar avance</p>
        <textarea value={noteText} onChange={e => setNoteText(e.target.value)}
          placeholder="¿Qué avanzaste? Escribe tu nota aquí..." rows={3}
          style={{ ...inputSt, resize: 'vertical', lineHeight: 1.5 }} />
        <button onClick={addNote} disabled={!noteText.trim()}
          style={{ ...primaryBtn, marginTop: 8, width: '100%', opacity: noteText.trim() ? 1 : 0.5 }}>
          + Guardar avance
        </button>
      </div>

      {(goal.notes || []).length === 0 && (
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <Icon name="note" size={32} />
          <p style={{ marginTop: 8, fontSize: 13, color: '#AAA' }}>Sin avances aún. ¡Empieza a registrar!</p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[...(goal.notes || [])].reverse().map(note => (
          <div key={note.id} style={{
            background: '#fff', borderRadius: 12, padding: '11px 13px',
            border: `1px solid ${note.done ? '#B3E8D5' : '#EAEAF0'}`,
            display: 'flex', gap: 10, alignItems: 'flex-start',
          }}>
            <button onClick={() => toggleNote(note.id)} style={{
              width: 22, height: 22, borderRadius: '50%', flexShrink: 0, cursor: 'pointer', marginTop: 1,
              border: note.done ? 'none' : '2px solid #CCC',
              background: note.done ? '#1D9E75' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', transition: 'all 0.2s',
            }}>
              {note.done && <Icon name="check" size={11} />}
            </button>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 14, color: note.done ? '#AAA' : '#1A1A2E', textDecoration: note.done ? 'line-through' : 'none', lineHeight: 1.5 }}>{note.text}</p>
              <p style={{ marginTop: 4, fontSize: 11, color: '#BBB' }}>
                {new Date(note.createdAt).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
            <button onClick={() => deleteNote(note.id)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DDD', padding: 2, flexShrink: 0 }}>
              <Icon name="trash" size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Goals Tab ────────────────────────────────────────────────────────────────
function GoalsTab({ goals, setGoals, selectedGoal, setSelectedGoal, showGoalForm, setShowGoalForm, showToast }) {
  if (selectedGoal) {
    const goal = goals.find(g => g.id === selectedGoal)
    if (!goal) { setSelectedGoal(null); return null }
    return <GoalDetail goal={goal} setGoals={setGoals} setSelectedGoal={setSelectedGoal} showToast={showToast} />
  }

  return (
    <div>
      {showGoalForm && (
        <GoalForm
          colorIdx={goals.length % COLORS.length}
          onSave={g => { setGoals(p => [g, ...p]); setShowGoalForm(false); showToast('Objetivo creado ✓') }}
          onClose={() => setShowGoalForm(false)}
        />
      )}

      {goals.length === 0 && !showGoalForm && (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <div style={{ width: 60, height: 60, borderRadius: 18, background: '#EDE9FF', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', color: '#7F77DD' }}>
            <Icon name="star" size={28} />
          </div>
          <p style={{ fontWeight: 700, fontSize: 16, color: '#1A1A2E' }}>Sin objetivos aún</p>
          <p style={{ marginTop: 6, fontSize: 13, color: '#AAA', lineHeight: 1.6 }}>
            Crea tu primer objetivo a largo plazo<br />y registra tus avances en él.
          </p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {goals.map((goal, i) => {
          const c = COLORS[i % COLORS.length]
          const done = (goal.notes || []).filter(n => n.done).length
          const total = (goal.notes || []).length
          const pct = total ? Math.round(done / total * 100) : 0
          return (
            <div key={goal.id} onClick={() => setSelectedGoal(goal.id)}
              style={{ background: '#fff', borderRadius: 16, padding: '14px 16px', border: '1px solid #EAEAF0', cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                <div style={{ width: 38, height: 38, borderRadius: 11, background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.text, flexShrink: 0 }}>
                  <Icon name="target" size={18} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 600, fontSize: 15, color: '#1A1A2E', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{goal.title}</p>
                  <p style={{ marginTop: 2, fontSize: 12, color: '#AAA' }}>{total} avances · {pct}% completado</p>
                </div>
                <div style={{ color: '#DDD', marginTop: 4 }}><Icon name="chevron" size={16} /></div>
              </div>
              <ProgressBar value={pct} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Event Form ───────────────────────────────────────────────────────────────
function EventForm({ onSave, onClose, schedule }) {
  const [title, setTitle] = useState('')
  const [type, setType] = useState('control')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [duration, setDuration] = useState(60)
  const [desc, setDesc] = useState('')
  const [subject, setSubject] = useState('')
  const [autoSlot, setAutoSlot] = useState(null)
  const [timeManual, setTimeManual] = useState(false)

  useEffect(() => {
    if (timeManual || !date || !subject.trim()) {
      if (!subject.trim() || !date) setAutoSlot(null)
      return
    }
    const slot = findScheduleSlot(schedule, date, subject)
    if (slot) {
      setAutoSlot(slot)
      setTime(slot.startTime)
      setDuration(slotDuration(slot.startTime, slot.endTime))
    } else {
      setAutoSlot(null)
    }
  }, [date, subject, schedule, timeManual])

  const handleSave = () => {
    if (!title.trim() || !date) return
    const fullTitle = subject.trim() ? `${title.trim()} — ${subject.trim()}` : title.trim()
    onSave({
      id: uid(), title: fullTitle, type, date, time, duration, description: desc,
      subject: subject.trim(), synced: false, fromSchedule: !!autoSlot, createdAt: Date.now(),
    })
  }

  return (
    <div style={{ background: '#fff', borderRadius: 16, padding: 16, marginBottom: 16, border: '1px solid #EAEAF0' }}>
      <p style={{ fontWeight: 700, fontSize: 15, color: '#1A1A2E', marginBottom: 12 }}>Nuevo evento</p>
      <div style={{ display: 'flex', gap: 5, marginBottom: 10 }}>
        {Object.entries(TYPE_CFG).map(([id, cfg]) => (
          <button key={id} onClick={() => setType(id)} style={{
            flex: 1, padding: '7px 0', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            background: type === id ? '#7F77DD' : '#F0F0F7',
            color: type === id ? '#fff' : '#888',
          }}>{cfg.label}</button>
        ))}
      </div>
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ej: Control 1 *" style={inputSt} />
      <input value={subject} onChange={e => { setSubject(e.target.value); setTimeManual(false) }}
        placeholder="Asignatura * (ej: Cálculo)" style={{ ...inputSt, marginTop: 8 }} />
      <input type="date" value={date} onChange={e => { setDate(e.target.value); setTimeManual(false) }} style={{ ...inputSt, marginTop: 8 }} />

      {autoSlot && (
        <div style={{
          marginTop: 8, padding: '10px 12px', borderRadius: 10,
          background: '#E0F5EE', border: '1px solid #7DD4B5', fontSize: 12, color: '#0B5C40',
        }}>
          <strong>Horario detectado:</strong> {DAY_NAMES[autoSlot.day]} {autoSlot.startTime}–{autoSlot.endTime}
          {autoSlot.location && ` · ${autoSlot.location}`}
        </div>
      )}

      {subject.trim() && date && !autoSlot && schedule.length > 0 && (
        <p style={{ marginTop: 8, fontSize: 12, color: '#D85A30', lineHeight: 1.4 }}>
          No hay clase de «{subject}» ese día. Revisa tu horario o ajusta la hora manualmente.
        </p>
      )}

      {subject.trim() && date && !autoSlot && schedule.length === 0 && (
        <p style={{ marginTop: 8, fontSize: 12, color: '#888', lineHeight: 1.4 }}>
          Configura tu horario en la pestaña Horario para auto-asignar la hora.
        </p>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
        <input type="time" value={time} onChange={e => { setTime(e.target.value); setTimeManual(true); setAutoSlot(null) }} style={inputSt} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#888' }}>
          {time ? `${duration} min` : 'Sin hora'}
        </div>
      </div>
      <div style={{ marginTop: 10 }}>
        <label style={{ fontSize: 12, color: '#888', fontWeight: 500 }}>
          Duración: <strong style={{ color: '#5238C4' }}>{duration} min</strong>
        </label>
        <input type="range" min={15} max={240} step={15} value={duration}
          onChange={e => { setDuration(+e.target.value); setTimeManual(true) }} />
      </div>
      <textarea value={desc} onChange={e => setDesc(e.target.value)}
        placeholder="Notas: sala, temas a estudiar..." rows={2}
        style={{ ...inputSt, resize: 'vertical', marginTop: 8, lineHeight: 1.5 }} />
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={handleSave} disabled={!title.trim() || !date || !subject.trim()}
          style={{ ...primaryBtn, opacity: title.trim() && date && subject.trim() ? 1 : 0.5 }}>
          Crear evento
        </button>
        <button onClick={onClose} style={secondaryBtn}>Cancelar</button>
      </div>
    </div>
  )
}

// ─── Event Card ───────────────────────────────────────────────────────────────
function EventCard({ ev, onSync, onDelete, gToken, past }) {
  const cfg = TYPE_CFG[ev.type] || TYPE_CFG.otro
  const daysUntil = past ? null : Math.ceil((new Date(ev.date) - new Date()) / 86400000)

  return (
    <div style={{ background: past ? '#FAFAFA' : '#fff', borderRadius: 14, padding: '12px 14px', border: `1px solid ${past ? '#EAEAF0' : cfg.border}`, opacity: past ? 0.75 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ background: cfg.bg, borderRadius: 8, padding: '5px 9px', flexShrink: 0, marginTop: 2 }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: cfg.text, textTransform: 'uppercase', letterSpacing: 0.5 }}>{cfg.label}</p>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontWeight: 600, fontSize: 14, color: '#1A1A2E', lineHeight: 1.3 }}>{ev.title}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: '#888' }}>
              {new Date(ev.date + 'T00:00:00').toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' })}
            </span>
            {ev.time && <span style={{ fontSize: 12, color: '#888' }}>· {ev.time}h</span>}
            {ev.fromSchedule && (
              <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, background: '#E0F5EE', color: '#0B5C40', fontWeight: 600 }}>
                Horario
              </span>
            )}
            {daysUntil !== null && daysUntil <= 7 && daysUntil >= 0 && (
              <span style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 99, fontWeight: 700,
                background: daysUntil <= 2 ? '#FCEBEB' : '#FAEEDA',
                color: daysUntil <= 2 ? '#A32D2D' : '#854F0B',
              }}>
                {daysUntil === 0 ? 'Hoy' : daysUntil === 1 ? 'Mañana' : `${daysUntil}d`}
              </span>
            )}
          </div>
          {ev.description && <p style={{ marginTop: 4, fontSize: 12, color: '#AAA', lineHeight: 1.4 }}>{ev.description}</p>}
        </div>
      </div>

      {!past && (
        <div style={{ display: 'flex', gap: 6, marginTop: 10, paddingTop: 10, borderTop: '1px solid #F0F0F8' }}>
          {gToken && !ev.synced && (
            <button onClick={onSync} style={{
              flex: 1, background: '#EDE9FF', color: '#5238C4', border: 'none', borderRadius: 8,
              padding: '7px 0', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            }}>
              <Icon name="link" size={13} /> Sincronizar con GCal
            </button>
          )}
          {ev.synced && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontSize: 12, color: '#1D9E75', fontWeight: 600 }}>
              <Icon name="check" size={13} /> En Google Calendar
            </div>
          )}
          {!gToken && !ev.synced && (
            <div style={{ flex: 1, fontSize: 11, color: '#AAA', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Icon name="google" size={12} /> Conecta GCal para sincronizar
            </div>
          )}
          <button onClick={onDelete} style={{ background: '#FFF0F0', color: '#D85A30', border: 'none', borderRadius: 8, padding: '7px 12px', fontSize: 12, cursor: 'pointer' }}>
            <Icon name="trash" size={14} />
          </button>
        </div>
      )}
      {past && (
        <button onClick={onDelete} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#CCC', padding: '6px 0 0', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
          <Icon name="trash" size={11} /> Eliminar
        </button>
      )}
    </div>
  )
}

// ─── Schedule Form ────────────────────────────────────────────────────────────
function ScheduleForm({ onSave, onClose }) {
  const [subject, setSubject] = useState('')
  const [day, setDay] = useState(1)
  const [startTime, setStartTime] = useState('08:30')
  const [endTime, setEndTime] = useState('10:00')
  const [location, setLocation] = useState('')

  const handleSave = () => {
    if (!subject.trim() || !startTime || !endTime) return
    if (startTime >= endTime) return
    onSave({ id: uid(), subject: subject.trim(), day: +day, startTime, endTime, location: location.trim() })
  }

  return (
    <div style={{ background: '#fff', borderRadius: 16, padding: 16, marginBottom: 16, border: '1px solid #EAEAF0' }}>
      <p style={{ fontWeight: 700, fontSize: 15, color: '#1A1A2E', marginBottom: 12 }}>Agregar clase al horario</p>
      <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Asignatura * (ej: Cálculo)" style={inputSt} />
      <select value={day} onChange={e => setDay(e.target.value)} style={{ ...inputSt, marginTop: 8 }}>
        {[1, 2, 3, 4, 5, 6].map(d => (
          <option key={d} value={d}>{DAY_NAMES[d]}</option>
        ))}
      </select>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
        <div>
          <label style={{ fontSize: 11, color: '#888', fontWeight: 600 }}>Inicio</label>
          <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} style={{ ...inputSt, marginTop: 4 }} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: '#888', fontWeight: 600 }}>Fin</label>
          <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} style={{ ...inputSt, marginTop: 4 }} />
        </div>
      </div>
      <input value={location} onChange={e => setLocation(e.target.value)} placeholder="Sala (opcional)" style={{ ...inputSt, marginTop: 8 }} />
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={handleSave}
          disabled={!subject.trim() || startTime >= endTime}
          style={{ ...primaryBtn, opacity: subject.trim() && startTime < endTime ? 1 : 0.5 }}>
          Agregar al horario
        </button>
        <button onClick={onClose} style={secondaryBtn}>Cancelar</button>
      </div>
    </div>
  )
}

// ─── Schedule Tab ─────────────────────────────────────────────────────────────
function ScheduleTab({ schedule, setSchedule, showScheduleForm, setShowScheduleForm, showToast }) {
  const byDay = [1, 2, 3, 4, 5, 6].map(day => ({
    day,
    blocks: schedule.filter(s => s.day === day).sort((a, b) => a.startTime.localeCompare(b.startTime)),
  })).filter(d => d.blocks.length > 0)

  return (
    <div>
      <div style={{
        background: '#EDE9FF', borderRadius: 14, padding: '12px 14px', marginBottom: 16,
        border: '1px solid #C4B8F5', fontSize: 12, color: '#4A3F8A', lineHeight: 1.5,
      }}>
        Configura tus clases semanales. Al crear un control o solemne, la app buscará la hora según la asignatura y el día.
      </div>

      {showScheduleForm && (
        <ScheduleForm
          onSave={entry => {
            setSchedule(p => [...p, entry].sort((a, b) => a.day - b.day || a.startTime.localeCompare(b.startTime)))
            setShowScheduleForm(false)
            showToast('Clase agregada al horario ✓')
          }}
          onClose={() => setShowScheduleForm(false)}
        />
      )}

      {schedule.length === 0 && !showScheduleForm && (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <div style={{ width: 60, height: 60, borderRadius: 18, background: '#E0F5EE', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', color: '#1D9E75' }}>
            <Icon name="book" size={28} />
          </div>
          <p style={{ fontWeight: 700, fontSize: 16, color: '#1A1A2E' }}>Sin horario configurado</p>
          <p style={{ marginTop: 6, fontSize: 13, color: '#AAA', lineHeight: 1.6 }}>
            Agrega tus ramos y horarios<br />para auto-asignar controles y solemnes.
          </p>
        </div>
      )}

      {byDay.map(({ day, blocks }) => (
        <div key={day} style={{ marginBottom: 20 }}>
          <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: '#AAA', textTransform: 'uppercase', letterSpacing: 1 }}>
            {DAY_NAMES[day]}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {blocks.map(block => (
              <div key={block.id} style={{
                background: '#fff', borderRadius: 14, padding: '12px 14px',
                border: '1px solid #EAEAF0', display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 11, background: '#E0F5EE',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0B5C40', flexShrink: 0,
                }}>
                  <Icon name="book" size={18} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 600, fontSize: 14, color: '#1A1A2E' }}>{block.subject}</p>
                  <p style={{ marginTop: 2, fontSize: 12, color: '#888' }}>
                    {block.startTime} – {block.endTime}
                    {block.location && ` · ${block.location}`}
                  </p>
                </div>
                <button onClick={() => {
                  setSchedule(p => p.filter(s => s.id !== block.id))
                  showToast('Clase eliminada del horario')
                }} style={{ background: '#FFF0F0', color: '#D85A30', border: 'none', borderRadius: 8, padding: '7px 10px', cursor: 'pointer' }}>
                  <Icon name="trash" size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Calendar Tab ─────────────────────────────────────────────────────────────
function CalendarTab({ events, setEvents, schedule, gToken, connectGoogle, disconnectGoogle, pushToGCal, showToast, showEventForm, setShowEventForm }) {
  const now = new Date()
  const upcoming = [...events].filter(e => new Date(e.date + 'T23:59') >= now).sort((a, b) => new Date(a.date) - new Date(b.date))
  const past = [...events].filter(e => new Date(e.date + 'T23:59') < now).sort((a, b) => new Date(b.date) - new Date(a.date))

  return (
    <div>
      <div style={{
        background: gToken ? '#E0F5EE' : '#EDE9FF', borderRadius: 14, padding: '12px 14px',
        marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10,
        border: `1px solid ${gToken ? '#7DD4B5' : '#C4B8F5'}`,
      }}>
        <div style={{ color: gToken ? '#1D9E75' : '#7F77DD' }}>
          <Icon name={gToken ? 'check' : 'google'} size={20} />
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: gToken ? '#0B5C40' : '#4A3F8A' }}>
            {gToken ? 'Google Calendar conectado' : 'Conectar Google Calendar'}
          </p>
          <p style={{ marginTop: 2, fontSize: 11, color: gToken ? '#1D9E75' : '#7F77DD' }}>
            {gToken ? 'Sincroniza tus eventos con un toque' : 'Vincula tu agenda universitaria'}
          </p>
        </div>
        {gToken ? (
          <button onClick={disconnectGoogle} style={{ background: 'none', border: '1px solid #7DD4B5', borderRadius: 9, padding: '6px 10px', fontSize: 11, color: '#0B5C40', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Icon name="logout" size={13} /> Salir
          </button>
        ) : (
          <button onClick={connectGoogle} style={{ background: '#7F77DD', color: '#fff', border: 'none', borderRadius: 9, padding: '7px 13px', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            Conectar
          </button>
        )}
      </div>

      {showEventForm && (
        <EventForm
          schedule={schedule}
          onSave={ev => { setEvents(p => [ev, ...p]); setShowEventForm(false); showToast('Evento creado ✓') }}
          onClose={() => setShowEventForm(false)}
        />
      )}

      {events.length === 0 && !showEventForm && (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <div style={{ width: 60, height: 60, borderRadius: 18, background: '#EDE9FF', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', color: '#7F77DD' }}>
            <Icon name="calendar" size={28} />
          </div>
          <p style={{ fontWeight: 700, fontSize: 16, color: '#1A1A2E' }}>Sin eventos</p>
          <p style={{ marginTop: 6, fontSize: 13, color: '#AAA', lineHeight: 1.6 }}>
            Agrega tus controles, solemnes y tareas<br />para tenerlos todos organizados.
          </p>
        </div>
      )}

      {upcoming.length > 0 && (
        <>
          <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: '#AAA', textTransform: 'uppercase', letterSpacing: 1 }}>Próximos ({upcoming.length})</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
            {upcoming.map(ev => (
              <EventCard key={ev.id} ev={ev} gToken={gToken}
                onSync={() => pushToGCal(ev)}
                onDelete={() => { setEvents(p => p.filter(e => e.id !== ev.id)); showToast('Evento eliminado') }} />
            ))}
          </div>
        </>
      )}

      {past.length > 0 && (
        <>
          <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: '#AAA', textTransform: 'uppercase', letterSpacing: 1 }}>Pasados ({past.length})</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {past.map(ev => (
              <EventCard key={ev.id} ev={ev} gToken={gToken} past
                onDelete={() => { setEvents(p => p.filter(e => e.id !== ev.id)); showToast('Evento eliminado') }} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Root App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState('goals')
  const [goals, setGoals] = useState(() => LS.get('app_goals_v3', []))
  const [events, setEvents] = useState(() => LS.get('app_events_v3', []))
  const [schedule, setSchedule] = useState(() => LS.get('app_schedule_v1', []))
  const [selectedGoal, setSelectedGoal] = useState(null)
  const [showGoalForm, setShowGoalForm] = useState(false)
  const [showEventForm, setShowEventForm] = useState(false)
  const [showScheduleForm, setShowScheduleForm] = useState(false)
  const [gToken, setGToken] = useState(() => LS.get('g_access_token', null))
  const [gapiReady, setGapiReady] = useState(false)
  const [toast, setToast] = useState(null)
  const tokenClientRef = useRef(null)

  useEffect(() => { LS.set('app_goals_v3', goals) }, [goals])
  useEffect(() => { LS.set('app_events_v3', events) }, [events])
  useEffect(() => { LS.set('app_schedule_v1', schedule) }, [schedule])

  const showToast = (msg, type = 'ok') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3200)
  }

  // Cargar Google APIs
  useEffect(() => {
    if (!isGoogleConfigured()) return

    const waitForGapi = setInterval(() => {
      if (window.gapi) {
        clearInterval(waitForGapi)
        window.gapi.load('client', async () => {
          await window.gapi.client.init({
            discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest'],
          })
          if (gToken) window.gapi.client.setToken({ access_token: gToken })
          setGapiReady(true)
        })
      }
    }, 200)

    const waitForGsi = setInterval(() => {
      if (window.google?.accounts?.oauth2) {
        clearInterval(waitForGsi)
        tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
          client_id: GOOGLE_CLIENT_ID,
          scope: SCOPES,
          callback: (resp) => {
            if (resp.access_token) {
              setGToken(resp.access_token)
              LS.set('g_access_token', resp.access_token)
              if (window.gapi) window.gapi.client.setToken({ access_token: resp.access_token })
              showToast('Conectado con Google Calendar ✓')
            }
          },
        })
      }
    }, 200)

    return () => { clearInterval(waitForGapi); clearInterval(waitForGsi) }
  }, [])

  const connectGoogle = () => {
    if (!isGoogleConfigured()) {
      showToast('Configura VITE_GOOGLE_CLIENT_ID (Netlify o .env.local)', 'warn')
      return
    }
    tokenClientRef.current?.requestAccessToken()
  }

  const disconnectGoogle = () => {
    if (gToken && window.google?.accounts?.oauth2) {
      window.google.accounts.oauth2.revoke(gToken)
    }
    setGToken(null)
    LS.set('g_access_token', null)
    showToast('Sesión de Google cerrada')
  }

  const pushToGCal = async (ev) => {
    if (!gapiReady || !gToken) { showToast('Conecta Google Calendar primero', 'warn'); return }
    try {
      const cfg = TYPE_CFG[ev.type] || TYPE_CFG.otro
      const startDT = `${ev.date}T${ev.time || '08:00'}:00`
      const start = new Date(startDT)
      const end = new Date(start.getTime() + (ev.duration || 60) * 60000)
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone

      await window.gapi.client.calendar.events.insert({
        calendarId: 'primary',
        resource: {
          summary: ev.title,
          description: ev.description || '',
          start: { dateTime: start.toISOString(), timeZone: tz },
          end: { dateTime: end.toISOString(), timeZone: tz },
          colorId: cfg.gcalColor,
          reminders: {
            useDefault: false,
            overrides: [
              { method: 'popup', minutes: 1440 },
              { method: 'popup', minutes: 60 },
            ],
          },
        },
      })

      setEvents(prev => prev.map(e => e.id === ev.id ? { ...e, synced: true } : e))
      showToast('Evento agregado a Google Calendar ✓')
    } catch (err) {
      if (err.status === 401) {
        setGToken(null)
        LS.set('g_access_token', null)
        showToast('Sesión expirada, vuelve a conectar', 'warn')
      } else {
        showToast('Error al sincronizar: ' + (err.message || err.status), 'err')
      }
    }
  }

  const onTabChange = (t) => {
    setTab(t)
    setSelectedGoal(null)
    setShowGoalForm(false)
    setShowEventForm(false)
    setShowScheduleForm(false)
  }

  const openFab = () => {
    setSelectedGoal(null)
    if (tab === 'goals') setShowGoalForm(true)
    else if (tab === 'calendar') setShowEventForm(true)
    else setShowScheduleForm(true)
  }

  return (
    <div style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", maxWidth: 480, margin: '0 auto', minHeight: '100vh', background: '#F8F7FC' }}>

      {toast && (
        <div style={{
          position: 'fixed', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 999,
          background: toast.type === 'err' ? '#FCEBEB' : toast.type === 'warn' ? '#FAEEDA' : '#E0F5EE',
          color: toast.type === 'err' ? '#A32D2D' : toast.type === 'warn' ? '#854F0B' : '#0B5C40',
          padding: '10px 18px', borderRadius: 12, fontSize: 13, fontWeight: 600,
          border: `1px solid ${toast.type === 'err' ? '#F09595' : toast.type === 'warn' ? '#FAC775' : '#5DCAA5'}`,
          boxShadow: '0 4px 24px rgba(0,0,0,0.12)', whiteSpace: 'nowrap', pointerEvents: 'none',
        }}>{toast.msg}</div>
      )}

      <div style={{ padding: '22px 18px 0', background: '#F8F7FC' }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: '#AAA', letterSpacing: 1.5, textTransform: 'uppercase' }}>Mi Centro</p>
        <h1 style={{ margin: '2px 0 16px', fontSize: 26, fontWeight: 800, color: '#1A1A2E', letterSpacing: -0.8 }}>Organización</h1>
        <div style={{ display: 'flex', gap: 4, background: '#EDEDF5', borderRadius: 13, padding: 4 }}>
          {[
            { id: 'goals', label: 'Objetivos', icon: 'target' },
            { id: 'schedule', label: 'Horario', icon: 'book' },
            { id: 'calendar', label: 'Calendario', icon: 'calendar' },
          ].map(t => (
            <button key={t.id} onClick={() => onTabChange(t.id)} style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              padding: '9px 0', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
              background: tab === t.id ? '#fff' : 'transparent',
              color: tab === t.id ? '#5238C4' : '#999',
              boxShadow: tab === t.id ? '0 1px 6px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.18s',
            }}>
              <Icon name={t.icon} size={14} /> {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '16px 18px 100px' }}>
        {tab === 'goals' ? (
          <GoalsTab goals={goals} setGoals={setGoals} selectedGoal={selectedGoal} setSelectedGoal={setSelectedGoal}
            showGoalForm={showGoalForm} setShowGoalForm={setShowGoalForm} showToast={showToast} />
        ) : tab === 'schedule' ? (
          <ScheduleTab schedule={schedule} setSchedule={setSchedule}
            showScheduleForm={showScheduleForm} setShowScheduleForm={setShowScheduleForm} showToast={showToast} />
        ) : (
          <CalendarTab events={events} setEvents={setEvents} schedule={schedule} gToken={gToken}
            connectGoogle={connectGoogle} disconnectGoogle={disconnectGoogle} pushToGCal={pushToGCal}
            showToast={showToast} showEventForm={showEventForm} setShowEventForm={setShowEventForm} />
        )}
      </div>

      <button
        onClick={openFab}
        style={{
          position: 'fixed', bottom: 24, right: 20,
          width: 54, height: 54, borderRadius: '50%', border: 'none',
          background: 'linear-gradient(135deg, #8B83E8, #5238C4)',
          color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', boxShadow: '0 4px 20px rgba(82,56,196,0.4)',
        }}>
        <Icon name="plus" size={22} />
      </button>
    </div>
  )
}
