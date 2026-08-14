import { useState, useEffect, useRef } from 'react'
import {
  parseAcademicOffering,
  syncOfferingSchedule,
  shortEventType,
  normalizeEventType,
} from './offeringParser'
import { CURRICULUM, matchSemesterCourses } from './curriculum'
import PluxeeTab from './PluxeeTab'
import {
  dateKey,
  greetingForHour,
  formatLongDate,
  ensureDayChecklist,
  templateAppliesOnDay,
  ALL_DAYS,
  WEEKDAY_OPTIONS,
  EMOJI_OPTIONS,
} from './checklist'
import {
  SHARED_CALENDAR_EMAIL,
  CALENDAR_SCOPE,
  calendarAclResource,
  isAlreadySharedError,
  isInsufficientScopeError,
} from './calendarShare'

// ─────────────────────────────────────────────────────────────────────────────
// Google Calendar — define VITE_GOOGLE_CLIENT_ID en .env.local o en Netlify
// ─────────────────────────────────────────────────────────────────────────────
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || 'TU_CLIENT_ID_AQUI.apps.googleusercontent.com'
const PLACEHOLDER_CLIENT_ID = 'TU_CLIENT_ID_AQUI.apps.googleusercontent.com'
const isGoogleConfigured = () => GOOGLE_CLIENT_ID && GOOGLE_CLIENT_ID !== PLACEHOLDER_CLIENT_ID
const SCOPES = CALENDAR_SCOPE

// ─── Helpers ──────────────────────────────────────────────────────────────────
const LS = {
  get: (k, def) => { try { return JSON.parse(localStorage.getItem(k)) ?? def } catch { return def } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} },
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2)

const TYPE_CFG = {
  control: { label: 'Control', bg: 'var(--block-catedra-bg)', text: 'var(--block-catedra-text)', border: 'var(--block-catedra-border)', gcalColor: '5' },
  solemne: { label: 'Solemne', bg: 'var(--err-bg)', text: 'var(--err-text)', border: 'var(--err-border)', gcalColor: '11' },
  tarea:   { label: 'Tarea',   bg: 'var(--warn-bg)', text: 'var(--warn-text)', border: 'var(--warn-border)', gcalColor: '6' },
  otro:    { label: 'Otro',    bg: 'var(--info-bg)', text: 'var(--info-text)', border: 'var(--info-border)', gcalColor: '1' },
}

const emptyIconBox = (variant = 'info') => {
  const v = variant === 'success'
    ? { bg: 'var(--success-bg)', color: 'var(--success-text-light)' }
    : { bg: 'var(--info-bg)', color: 'var(--accent-light)' }
  return {
    width: 60, height: 60, borderRadius: 18, background: v.bg, display: 'flex',
    alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', color: v.color,
  }
}

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const DAY_SHORT = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const WEEK_DAYS = [1, 2, 3, 4, 5]

const blockColor = (eventType = '') => {
  const t = normalizeEventType(eventType)
  if (t.includes('CATEDRA')) return { bg: 'var(--block-catedra-bg)', text: 'var(--block-catedra-text)', border: 'var(--block-catedra-border)' }
  if (t.includes('AYUDANTIA')) return { bg: 'var(--block-ayudantia-bg)', text: 'var(--block-ayudantia-text)', border: 'var(--block-ayudantia-border)' }
  if (t.includes('LABORATORIO')) return { bg: 'var(--block-lab-bg)', text: 'var(--block-lab-text)', border: 'var(--block-lab-border)' }
  return { bg: 'var(--block-default-bg)', text: 'var(--block-default-text)', border: 'var(--block-default-border)' }
}

const timeToMins = (t) => {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

const isBlockNow = (block, now) => {
  if (block.day !== now.getDay()) return false
  const mins = now.getHours() * 60 + now.getMinutes()
  return timeToMins(block.startTime) <= mins && mins < timeToMins(block.endTime)
}

const getScheduleStatus = (schedule, now) => {
  const day = now.getDay()
  const mins = now.getHours() * 60 + now.getMinutes()
  const todayBlocks = schedule
    .filter(s => s.day === day)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
  const current = todayBlocks.find(b => timeToMins(b.startTime) <= mins && mins < timeToMins(b.endTime))
  const next = todayBlocks.find(b => timeToMins(b.startTime) > mins)
  return { current, next, day, todayBlocks }
}

const getCourseOptions = (offering, myCourses, schedule) => {
  if (offering && myCourses.length) {
    return myCourses
      .map(code => ({ code, name: offering.courses[code]?.name || code }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'))
  }
  const map = new Map()
  schedule.forEach(b => {
    if (b.courseCode && !map.has(b.courseCode)) {
      map.set(b.courseCode, { code: b.courseCode, name: b.courseName || b.subject })
    }
  })
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'))
}

const UNIVERSITY_EVENT_TYPES = new Set(['control', 'solemne', 'tarea'])

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

const getEventDateTime = (ev) => {
  const time = ev.time || '23:59'
  return new Date(`${ev.date}T${time}:00`)
}

const getTimeRemaining = (ev, now = new Date()) => {
  const ms = getEventDateTime(ev) - now
  return ms > 0 ? ms : null
}

const formatTimeRemaining = (ms) => {
  const days = Math.floor(ms / 86400000)
  const hours = Math.floor((ms % 86400000) / 3600000)
  const minutes = Math.floor((ms % 3600000) / 60000)

  if (days > 0 && hours > 0) return `${days}d, ${hours}h`
  if (days > 0) return `${days}d`
  if (hours > 0 && minutes > 0) return `${hours}h, ${minutes}m`
  if (hours > 0) return `${hours}h`
  if (minutes > 0) return `${minutes}m`
  return 'Ahora'
}

const findScheduleSlot = (schedule, dateStr, subject) => {
  if (!dateStr || !subject.trim() || !schedule.length) return null
  const day = new Date(dateStr + 'T12:00:00').getDay()
  const matches = schedule.filter(s => {
    if (s.day !== day) return false
    return matchSubject(subject, s.subject)
      || matchSubject(subject, s.courseName)
      || matchSubject(subject, s.courseCode)
  })
  if (!matches.length) return null
  const priority = (b) => {
    const t = normalizeEventType(b.eventType || '')
    if (t.includes('CATEDRA')) return 0
    if (t.includes('AYUDANTIA')) return 1
    if (t.includes('LABORATORIO')) return 2
    return 3
  }
  matches.sort((a, b) => priority(a) - priority(b))
  return matches[0]
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
    upload:   <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17,8 12,3 7,8"/><line x1="12" y1="3" x2="12" y2="15"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></>,
    map:     <><path d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></>,
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
  border: '1.5px solid var(--border-light)', fontSize: 14, color: 'var(--text)',
  background: 'var(--bg-input)', outline: 'none', fontFamily: 'inherit',
}
const primaryBtn = {
  flex: 1, padding: '10px 16px', borderRadius: 10, border: 'none',
  background: 'var(--accent)', color: 'var(--text-on-accent)', fontSize: 14, fontWeight: 600, cursor: 'pointer',
}
const secondaryBtn = {
  padding: '10px 16px', borderRadius: 10, border: '1.5px solid var(--border-light)',
  background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: 14, fontWeight: 500, cursor: 'pointer',
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────
const ProgressBar = ({ value }) => (
  <div style={{ background: 'var(--border-light)', borderRadius: 99, height: 6, overflow: 'hidden' }}>
    <div style={{
      width: `${Math.min(100, value)}%`, height: '100%',
      background: value >= 100 ? 'var(--success-text-light)' : 'var(--accent-light)',
      borderRadius: 99, transition: 'width 0.4s ease',
    }} />
  </div>
)

// ─── Checklist Task Form ──────────────────────────────────────────────────────
function ChecklistTaskForm({ onSave, onClose }) {
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('✨')
  const [time, setTime] = useState('')
  const [mode, setMode] = useState('once') // once | daily | custom
  const [days, setDays] = useState([1, 2, 3, 4, 5])

  const toggleDay = (d) => {
    setDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort((a, b) => a - b))
  }

  const canSave = name.trim() && (mode !== 'custom' || days.length > 0)

  const handleSave = () => {
    if (!canSave) return
    onSave({
      name: name.trim(),
      emoji,
      time,
      recurrence: mode,
      days: mode === 'once' ? [] : mode === 'daily' ? ALL_DAYS : days,
    })
  }

  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: 16, padding: 16, marginBottom: 16, border: '1px solid var(--border)' }}>
      <p style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', marginBottom: 12 }}>Nueva tarea</p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {EMOJI_OPTIONS.map(e => (
          <button key={e} type="button" onClick={() => setEmoji(e)} style={{
            width: 36, height: 36, borderRadius: 10, fontSize: 18, cursor: 'pointer',
            border: emoji === e ? '2px solid var(--accent)' : '1.5px solid var(--border-light)',
            background: emoji === e ? 'var(--info-bg)' : 'var(--bg-muted)',
          }}>{e}</button>
        ))}
      </div>

      <input value={name} onChange={e => setName(e.target.value)} placeholder="Nombre de la tarea *" style={inputSt} />
      <input type="time" value={time} onChange={e => setTime(e.target.value)}
        style={{ ...inputSt, marginTop: 8 }} title="Hora opcional" />
      {!time && (
        <p style={{ marginTop: 4, fontSize: 11, color: 'var(--text-faint)' }}>Hora opcional</p>
      )}

      <p style={{ marginTop: 12, marginBottom: 8, fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Repetición</p>
      <div style={{ display: 'flex', gap: 5, marginBottom: 10 }}>
        {[
          { id: 'once', label: 'Solo hoy' },
          { id: 'daily', label: 'Todos los días' },
          { id: 'custom', label: 'Días específicos' },
        ].map(opt => (
          <button key={opt.id} type="button" onClick={() => setMode(opt.id)} style={{
            flex: 1, padding: '7px 4px', borderRadius: 8, border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer',
            background: mode === opt.id ? 'var(--accent-light)' : 'var(--bg-tab-bar)',
            color: mode === opt.id ? 'var(--text-on-accent)' : 'var(--text-muted)',
          }}>{opt.label}</button>
        ))}
      </div>

      {mode === 'custom' && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 10, justifyContent: 'center' }}>
          {WEEKDAY_OPTIONS.map(d => (
            <button key={d.value} type="button" onClick={() => toggleDay(d.value)} style={{
              width: 34, height: 34, borderRadius: 10, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              background: days.includes(d.value) ? 'var(--accent)' : 'var(--bg-tab-bar)',
              color: days.includes(d.value) ? 'var(--text-on-accent)' : 'var(--text-muted)',
            }}>{d.label}</button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button type="button" onClick={handleSave} disabled={!canSave}
          style={{ ...primaryBtn, opacity: canSave ? 1 : 0.5 }}>
          Crear tarea
        </button>
        <button type="button" onClick={onClose} style={secondaryBtn}>Cancelar</button>
      </div>
    </div>
  )
}

// ─── Checklist Task Row ───────────────────────────────────────────────────────
function ChecklistTaskRow({ task, onToggle, onDelete }) {
  return (
    <div
      className={task.done ? 'checklist-row checklist-row-done' : 'checklist-row'}
      style={{
        background: 'var(--bg-card)',
        borderRadius: 14,
        padding: '12px 14px',
        border: `1px solid ${task.done ? 'var(--success-border)' : 'var(--border)'}`,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        transition: 'border-color 0.25s ease, background 0.25s ease, opacity 0.25s ease',
        opacity: task.done ? 0.85 : 1,
      }}
    >
      <button
        type="button"
        aria-label={task.done ? 'Marcar pendiente' : 'Marcar completada'}
        onClick={() => onToggle(task.id)}
        className={task.done ? 'checklist-check checklist-check-on' : 'checklist-check'}
        style={{
          width: 32, height: 32, borderRadius: 10, flexShrink: 0, cursor: 'pointer',
          border: task.done ? 'none' : '2px solid var(--text-disabled)',
          background: task.done ? 'var(--success-text-light)' : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text-on-accent)',
        }}
      >
        {task.done && <Icon name="check" size={16} />}
      </button>

      <span style={{ fontSize: 22, lineHeight: 1, flexShrink: 0 }} aria-hidden>{task.emoji || '✨'}</span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontWeight: 600, fontSize: 15, color: task.done ? 'var(--text-faint)' : 'var(--text)',
          textDecoration: task.done ? 'line-through' : 'none',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          transition: 'color 0.25s ease',
        }}>{task.name}</p>
        {task.time && (
          <p style={{ marginTop: 2, fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Icon name="clock" size={12} /> {task.time}
          </p>
        )}
      </div>

      <button type="button" onClick={() => onDelete(task.id)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-disabled)', padding: 4, flexShrink: 0 }}
        aria-label="Eliminar tarea">
        <Icon name="trash" size={14} />
      </button>
    </div>
  )
}

// ─── Mi recorrido (daily checklist) ───────────────────────────────────────────
function JourneyTab({
  templates, setTemplates, daysMap, setDaysMap,
  showTaskForm, setShowTaskForm, showToast,
}) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    setNow(new Date())
    const t = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(t)
  }, [])

  const today = dateKey(now)
  const tasks = daysMap[today] || []
  const done = tasks.filter(t => t.done).length
  const total = tasks.length
  const pct = total ? Math.round(done / total * 100) : 0
  const greeting = greetingForHour(now.getHours())
  const dateLabel = formatLongDate(now)

  const persistToday = (nextTasks) => {
    setDaysMap(prev => ({ ...prev, [today]: nextTasks }))
  }

  const toggleTask = (id) => {
    persistToday(tasks.map(t => t.id === id ? { ...t, done: !t.done } : t))
  }

  const deleteTask = (id) => {
    const task = tasks.find(t => t.id === id)
    persistToday(tasks.filter(t => t.id !== id))
    if (task?.templateId) {
      setTemplates(prev => prev.filter(t => t.id !== task.templateId))
    }
    showToast('Tarea eliminada')
  }

  const saveTask = (payload) => {
    const templateId = payload.recurrence === 'once' ? null : uid()
    if (payload.recurrence !== 'once') {
      setTemplates(prev => [...prev, {
        id: templateId,
        name: payload.name,
        emoji: payload.emoji,
        time: payload.time,
        recurrence: payload.recurrence,
        days: payload.days,
        createdAt: Date.now(),
      }])
    }

    const dow = now.getDay()
    const includeToday = payload.recurrence === 'once'
      || templateAppliesOnDay({ recurrence: payload.recurrence, days: payload.days }, dow)

    if (includeToday) {
      const instance = {
        id: uid(),
        templateId,
        name: payload.name,
        emoji: payload.emoji,
        time: payload.time,
        done: false,
      }
      const next = [...tasks, instance].sort((a, b) => {
        if (a.time && b.time) return a.time.localeCompare(b.time)
        if (a.time) return -1
        if (b.time) return 1
        return a.name.localeCompare(b.name, 'es')
      })
      persistToday(next)
    }

    setShowTaskForm(false)
    showToast('Tarea creada ✓')
  }

  return (
    <div>
      <div style={{
        background: 'var(--bg-card)', borderRadius: 16, padding: 16, marginBottom: 16,
        border: '1px solid var(--border)',
      }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent-light)', marginBottom: 2 }}>{greeting}</p>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--text)', letterSpacing: -0.4 }}>Mi recorrido</h2>
        <p style={{ marginTop: 4, fontSize: 13, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{dateLabel}</p>

        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>
              {total === 0 ? 'Sin tareas aún' : `${done}/${total} tareas`}
            </span>
            {total > 0 && (
              <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 700 }}>{pct}%</span>
            )}
          </div>
          <ProgressBar value={pct} />
        </div>
      </div>

      {showTaskForm && (
        <ChecklistTaskForm onSave={saveTask} onClose={() => setShowTaskForm(false)} />
      )}

      {tasks.length === 0 && !showTaskForm && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <div style={emptyIconBox()}>
            <Icon name="check" size={28} />
          </div>
          <p style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>Tu checklist de hoy</p>
          <p style={{ marginTop: 6, fontSize: 13, color: 'var(--text-faint)', lineHeight: 1.6 }}>
            Agrega tareas diarias o repetitivas<br />con el botón +.
          </p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {tasks.map(task => (
          <ChecklistTaskRow
            key={task.id}
            task={task}
            onToggle={toggleTask}
            onDelete={deleteTask}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Event Form ───────────────────────────────────────────────────────────────
function EventForm({ onSave, onClose, schedule, courseOptions }) {
  const [title, setTitle] = useState('')
  const [type, setType] = useState('control')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [duration, setDuration] = useState(60)
  const [desc, setDesc] = useState('')
  const [courseCode, setCourseCode] = useState('')
  const [autoSlot, setAutoSlot] = useState(null)
  const [timeManual, setTimeManual] = useState(false)

  const isUniversity = UNIVERSITY_EVENT_TYPES.has(type)
  const selectedCourse = courseOptions.find(c => c.code === courseCode)

  useEffect(() => {
    if (!isUniversity || timeManual || !date || !courseCode) {
      if (!isUniversity || !courseCode || !date) setAutoSlot(null)
      return
    }
    const slot = findScheduleSlot(schedule, date, selectedCourse?.name || courseCode)
    if (slot) {
      setAutoSlot(slot)
      setTime(slot.startTime)
      setDuration(slotDuration(slot.startTime, slot.endTime))
    } else {
      setAutoSlot(null)
    }
  }, [date, courseCode, schedule, timeManual, isUniversity, selectedCourse])

  const handleSave = () => {
    if (!title.trim() || !date) return
    if (isUniversity && !courseCode) return

    if (isUniversity) {
      const name = selectedCourse?.name || courseCode
      onSave({
        id: uid(), title: `${title.trim()} — ${name}`, type, date, time, duration, description: desc,
        subject: name, courseCode, synced: false, fromSchedule: !!autoSlot, isPersonal: false,
        createdAt: Date.now(),
      })
    } else {
      onSave({
        id: uid(), title: title.trim(), type, date, time, duration, description: desc,
        subject: '', courseCode: '', synced: false, fromSchedule: false, isPersonal: true,
        createdAt: Date.now(),
      })
    }
  }

  const canSave = title.trim() && date && (!isUniversity || courseCode)

  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: 16, padding: 16, marginBottom: 16, border: '1px solid var(--border)' }}>
      <p style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', marginBottom: 12 }}>Nuevo evento</p>
      <div style={{ display: 'flex', gap: 5, marginBottom: 10 }}>
        {Object.entries(TYPE_CFG).map(([id, cfg]) => (
          <button key={id} onClick={() => {
            setType(id)
            setTimeManual(false)
            if (id === 'otro') { setCourseCode(''); setAutoSlot(null) }
          }} style={{
            flex: 1, padding: '7px 0', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            background: type === id ? 'var(--accent-light)' : 'var(--bg-tab-bar)',
            color: type === id ? 'var(--text-on-accent)' : 'var(--text-muted)',
          }}>{cfg.label}</button>
        ))}
      </div>
      <input value={title} onChange={e => setTitle(e.target.value)}
        placeholder={isUniversity ? 'Ej: Control 1, Solemne... *' : 'Ej: Cita, reunión, trámite... *'} style={inputSt} />

      {isUniversity ? (
        <>
          <select value={courseCode} onChange={e => { setCourseCode(e.target.value); setTimeManual(false) }}
            style={{ ...inputSt, marginTop: 8 }}>
            <option value="">— Selecciona ramo —</option>
            {courseOptions.map(c => (
              <option key={c.code} value={c.code}>{c.name} ({c.code})</option>
            ))}
          </select>
          {courseOptions.length === 0 && (
            <p style={{ marginTop: 8, fontSize: 12, color: 'var(--danger-text)', lineHeight: 1.4 }}>
              Agrega ramos en <strong>Config</strong> para vincular controles y solemnes a tu horario.
            </p>
          )}
          <input type="date" value={date} onChange={e => { setDate(e.target.value); setTimeManual(false) }} style={{ ...inputSt, marginTop: 8 }} />

          {autoSlot && (
            <div style={{
              marginTop: 8, padding: '10px 12px', borderRadius: 10,
              background: 'var(--success-bg)', border: '1px solid var(--success-border)', fontSize: 12, color: 'var(--success-text)',
            }}>
              <strong>Horario del ramo:</strong> {DAY_NAMES[autoSlot.day]} {autoSlot.startTime}–{autoSlot.endTime}
              {autoSlot.professor && ` · ${autoSlot.professor.split(' ').slice(0, 2).join(' ')}`}
            </div>
          )}

          {courseCode && date && !autoSlot && schedule.length > 0 && (
            <p style={{ marginTop: 8, fontSize: 12, color: 'var(--danger-text)', lineHeight: 1.4 }}>
              No hay clase de «{selectedCourse?.name}» ese día. Ajusta la hora manualmente.
            </p>
          )}

          {courseCode && date && !autoSlot && schedule.length === 0 && (
            <p style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>
              Genera tu horario en <strong>Config</strong> para auto-asignar la hora del ramo.
            </p>
          )}
        </>
      ) : (
        <>
          <div style={{
            marginTop: 8, padding: '10px 12px', borderRadius: 10,
            background: 'var(--personal-bg)', border: '1px solid var(--border-light)', fontSize: 12, color: 'var(--personal-text)', lineHeight: 1.5,
          }}>
            Evento personal — fuera de la universidad. Elige fecha y hora libremente.
          </div>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...inputSt, marginTop: 8 }} />
        </>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
        <input type="time" value={time}
          onChange={e => { setTime(e.target.value); if (isUniversity) { setTimeManual(true); setAutoSlot(null) } }}
          style={inputSt} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
          {time ? `${duration} min` : 'Sin hora'}
        </div>
      </div>
      <div style={{ marginTop: 10 }}>
        <label style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>
          Duración: <strong style={{ color: 'var(--accent)' }}>{duration} min</strong>
        </label>
        <input type="range" min={15} max={240} step={15} value={duration}
          onChange={e => { setDuration(+e.target.value); if (isUniversity) setTimeManual(true) }} />
      </div>
      <textarea value={desc} onChange={e => setDesc(e.target.value)}
        placeholder={isUniversity ? 'Notas: sala, temas a estudiar...' : 'Notas del evento...'} rows={2}
        style={{ ...inputSt, resize: 'vertical', marginTop: 8, lineHeight: 1.5 }} />
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={handleSave} disabled={!canSave}
          style={{ ...primaryBtn, opacity: canSave ? 1 : 0.5 }}>
          Crear evento
        </button>
        <button onClick={onClose} style={secondaryBtn}>Cancelar</button>
      </div>
    </div>
  )
}

// ─── Event Card ───────────────────────────────────────────────────────────────
function EventCard({ ev, onSync, onDelete, gToken, past, now = new Date() }) {
  const cfg = TYPE_CFG[ev.type] || TYPE_CFG.otro
  const remainingMs = past ? null : getTimeRemaining(ev, now)
  const remainingLabel = remainingMs !== null ? formatTimeRemaining(remainingMs) : null
  const urgent = remainingMs !== null && remainingMs <= 2 * 86400000
  const soon = remainingMs !== null && remainingMs <= 7 * 86400000

  return (
    <div style={{ background: past ? 'var(--bg-muted)' : 'var(--bg-card)', borderRadius: 14, padding: '12px 14px', border: `1px solid ${past ? 'var(--border)' : cfg.border}`, opacity: past ? 0.75 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ background: cfg.bg, borderRadius: 8, padding: '5px 9px', flexShrink: 0, marginTop: 2 }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: cfg.text, textTransform: 'uppercase', letterSpacing: 0.5 }}>{cfg.label}</p>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)', lineHeight: 1.3 }}>{ev.title}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {new Date(ev.date + 'T00:00:00').toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' })}
            </span>
            {ev.time && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>· {ev.time}h</span>}
            {ev.fromSchedule && (
              <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, background: 'var(--success-bg)', color: 'var(--success-text)', fontWeight: 600 }}>
                Horario
              </span>
            )}
            {(ev.type === 'otro' || ev.isPersonal) && (
              <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, background: 'var(--personal-bg)', color: 'var(--personal-text)', fontWeight: 600 }}>
                Personal
              </span>
            )}
            {remainingLabel && (
              <span style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 99, fontWeight: 700,
                background: urgent ? 'var(--err-bg)' : soon ? 'var(--warn-bg)' : 'var(--info-bg)',
                color: urgent ? 'var(--err-text)' : soon ? 'var(--warn-text)' : 'var(--info-text)',
              }}>
                {remainingLabel}
              </span>
            )}
          </div>
          {ev.description && <p style={{ marginTop: 4, fontSize: 12, color: 'var(--text-faint)', lineHeight: 1.4 }}>{ev.description}</p>}
        </div>
      </div>

      {!past && (
        <div style={{ display: 'flex', gap: 6, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border-faint)' }}>
          {gToken && !ev.synced && (
            <button onClick={onSync} style={{
              flex: 1, background: 'var(--info-bg)', color: 'var(--accent)', border: 'none', borderRadius: 8,
              padding: '7px 0', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            }}>
              <Icon name="link" size={13} /> Sincronizar con GCal
            </button>
          )}
          {ev.synced && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontSize: 12, color: 'var(--success-text-light)', fontWeight: 600 }}>
              <Icon name="check" size={13} /> En Google Calendar
            </div>
          )}
          {!gToken && !ev.synced && (
            <div style={{ flex: 1, fontSize: 11, color: 'var(--text-faint)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Icon name="google" size={12} /> Conecta GCal para sincronizar
            </div>
          )}
          <button onClick={onDelete} style={{ background: 'var(--danger-bg)', color: 'var(--danger-text)', border: 'none', borderRadius: 8, padding: '7px 12px', fontSize: 12, cursor: 'pointer' }}>
            <Icon name="trash" size={14} />
          </button>
        </div>
      )}
      {past && (
        <button onClick={onDelete} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-disabled)', padding: '6px 0 0', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
          <Icon name="trash" size={11} /> Eliminar
        </button>
      )}
    </div>
  )
}

// ─── Weekly Grid ──────────────────────────────────────────────────────────────
function WeeklyGrid({ schedule, onRemove, now }) {
  const today = now.getDay()
  const weekBlocks = WEEK_DAYS.map(day => ({
    day,
    blocks: schedule.filter(s => s.day === day).sort((a, b) => a.startTime.localeCompare(b.startTime)),
  }))
  const extraDays = [6, 0].map(day => ({
    day,
    blocks: schedule.filter(s => s.day === day).sort((a, b) => a.startTime.localeCompare(b.startTime)),
  })).filter(d => d.blocks.length > 0)

  const formatGapDuration = (minutes) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    if (hours && mins) return `${hours}h ${mins}m`
    if (hours) return `${hours}h`
    return `${mins}m`
  }

  const getScheduleItems = (blocks) => {
    const items = []
    let latestEnd = null

    blocks.forEach((block, index) => {
      const start = timeToMins(block.startTime)
      const end = timeToMins(block.endTime)
      const gapMinutes = latestEnd === null ? 0 : start - latestEnd

      if (gapMinutes >= 30) {
        items.push({
          type: 'gap',
          id: `gap-${index}-${latestEnd}-${start}`,
          startTime: `${String(Math.floor(latestEnd / 60)).padStart(2, '0')}:${String(latestEnd % 60).padStart(2, '0')}`,
          endTime: block.startTime,
          minutes: gapMinutes,
        })
      }

      items.push({ type: 'block', id: block.id, block })
      latestEnd = latestEnd === null ? end : Math.max(latestEnd, end)
    })

    return items
  }

  const GapCard = ({ gap, compact }) => (
    <div
      title={`Ventana de ${gap.startTime} a ${gap.endTime}`}
      style={{
        padding: compact ? '5px 2px' : '7px 8px',
        borderRadius: 8,
        border: '1px dashed var(--success-border)',
        background: 'var(--success-bg)',
        color: 'var(--success-text)',
        textAlign: 'center',
      }}
    >
      <p style={{ fontSize: compact ? 7 : 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.3 }}>
        Ventana
      </p>
      <p style={{ fontSize: compact ? 9 : 11, fontWeight: 700, marginTop: 1 }}>
        {formatGapDuration(gap.minutes)}
      </p>
      {!compact && (
        <p style={{ fontSize: 9, opacity: 0.8, marginTop: 2 }}>
          {gap.startTime}–{gap.endTime}
        </p>
      )}
    </div>
  )

  const BlockCard = ({ block, compact }) => {
    const c = blockColor(block.eventType)
    const active = isBlockNow(block, now)
    return (
      <div style={{
        background: c.bg,
        border: active ? '2px solid var(--accent)' : `1px solid ${c.border}`,
        borderRadius: 8, padding: compact ? '5px 4px' : '8px 8px', position: 'relative',
        boxShadow: active ? '0 0 0 3px var(--shadow)' : 'none',
      }}>
        {active && (
          <span style={{
            position: 'absolute', top: -6, right: 4, background: 'var(--accent)', color: 'var(--text-on-accent)',
            fontSize: 7, fontWeight: 800, padding: '1px 5px', borderRadius: 99, letterSpacing: 0.5,
          }}>AHORA</span>
        )}
        {!compact && onRemove && (
          <button type="button" onClick={() => onRemove(block.id)}
            style={{
              position: 'absolute', top: 4, right: 4, background: 'color-mix(in srgb, var(--bg-card) 75%, transparent)',
              border: 'none', borderRadius: 4, padding: 2, cursor: 'pointer', color: 'var(--danger-text)', lineHeight: 0,
            }}>
            <Icon name="trash" size={10} />
          </button>
        )}
        <p style={{
          fontSize: compact ? 9 : 11, fontWeight: 700, color: active ? c.text : c.text, lineHeight: 1.25,
          paddingRight: compact ? 0 : 14, wordBreak: 'break-word',
        }}>
          {block.subject}
        </p>
        <p style={{ fontSize: compact ? 8 : 10, color: c.text, opacity: 0.9, marginTop: 3 }}>
          {block.startTime}–{block.endTime}
        </p>
        {block.eventType && (
          <p style={{ fontSize: compact ? 7 : 9, color: c.text, opacity: 0.75, marginTop: 2 }}>
            {shortEventType(block.eventType)}
          </p>
        )}
        {!compact && block.professor && (
          <p style={{ fontSize: 9, color: c.text, opacity: 0.65, marginTop: 3, lineHeight: 1.3 }}>
            {block.professor.split(' ').slice(0, 2).join(' ')}
          </p>
        )}
      </div>
    )
  }

  const timelineBlocks = weekBlocks.flatMap(({ blocks }) => blocks)
  const earliestStart = timelineBlocks.length
    ? Math.min(...timelineBlocks.map(block => timeToMins(block.startTime)))
    : 8 * 60
  const latestFinish = timelineBlocks.length
    ? Math.max(...timelineBlocks.map(block => timeToMins(block.endTime)))
    : 18 * 60
  const timelineStart = Math.floor(earliestStart / 30) * 30
  const timelineEnd = Math.ceil(latestFinish / 30) * 30
  const pixelsPerMinute = 0.72
  const timelineHeight = Math.max(180, (timelineEnd - timelineStart) * pixelsPerMinute)
  const timelineMarks = []
  for (let minute = timelineStart; minute <= timelineEnd; minute += 30) {
    timelineMarks.push(minute)
  }
  const minutesToTime = (minutes) =>
    `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`

  const positionOverlappingBlocks = (blocks) => {
    const columnEnds = []
    const positioned = blocks.map(block => {
      const start = timeToMins(block.startTime)
      let column = columnEnds.findIndex(end => end <= start)
      if (column === -1) column = columnEnds.length
      columnEnds[column] = timeToMins(block.endTime)
      return { block, column }
    })
    return positioned.map(item => ({ ...item, columnCount: Math.max(1, columnEnds.length) }))
  }

  const TimelineBlock = ({ block, column = 0, columnCount = 1 }) => {
    const c = blockColor(block.eventType)
    const active = isBlockNow(block, now)
    const top = (timeToMins(block.startTime) - timelineStart) * pixelsPerMinute
    const height = Math.max(24, (timeToMins(block.endTime) - timeToMins(block.startTime)) * pixelsPerMinute - 2)
    const width = `calc(${100 / columnCount}% - 3px)`
    const left = `calc(${column * 100 / columnCount}% + 2px)`

    return (
      <div
        title={`${block.subject} · ${shortEventType(block.eventType)} · ${block.startTime}–${block.endTime}`}
        style={{
          position: 'absolute', top, left, width, height,
          background: c.bg, color: c.text,
          border: active ? '2px solid var(--accent)' : `1px solid ${c.border}`,
          borderRadius: 6, padding: '4px 3px', overflow: 'hidden', zIndex: active ? 4 : 3,
          boxShadow: active ? '0 0 0 2px var(--shadow)' : 'none',
        }}
      >
        <p style={{ fontSize: 8, fontWeight: 800, lineHeight: 1.15, wordBreak: 'break-word' }}>
          {block.subject}
        </p>
        <p style={{ fontSize: 7, fontWeight: 600, marginTop: 2, opacity: 0.9 }}>
          {block.startTime}–{block.endTime}
        </p>
        {height >= 48 && (
          <p style={{ fontSize: 7, marginTop: 2, opacity: 0.75 }}>{shortEventType(block.eventType)}</p>
        )}
      </div>
    )
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--bg-card)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '44px repeat(5, minmax(0, 1fr))' }}>
          <div style={{
            padding: '8px 2px', textAlign: 'center', fontSize: 9, fontWeight: 700,
            color: 'var(--text-muted)', background: 'var(--bg-tab-bar)',
          }}>
            Hora
          </div>
          {WEEK_DAYS.map(day => {
            const isToday = day === today
            return (
              <div key={day} style={{
                padding: '8px 2px', textAlign: 'center', fontSize: 10, fontWeight: 700,
                color: isToday ? 'var(--text-on-accent)' : 'var(--text-secondary)',
                background: isToday
                  ? 'linear-gradient(135deg, var(--today-header-start), var(--today-header-end))'
                  : 'var(--bg-tab-bar)',
                borderLeft: '1px solid var(--border)',
              }}>
                {DAY_SHORT[day]}{isToday ? ' ●' : ''}
              </div>
            )
          })}
        </div>

        <div style={{ position: 'relative', height: timelineHeight }}>
          {timelineMarks.map((minute, index) => {
            const top = (minute - timelineStart) * pixelsPerMinute
            const showLabel = minute % 60 === 0 || index === 0 || minute === timelineEnd
            return (
              <div key={minute}>
                <div style={{
                  position: 'absolute', top, left: 44, right: 0,
                  borderTop: `1px solid ${minute % 60 === 0 ? 'var(--border)' : 'var(--border-faint)'}`,
                  zIndex: 1,
                }} />
                {showLabel && (
                  <span style={{
                    position: 'absolute', top: Math.min(top + 2, timelineHeight - 13), left: 3,
                    width: 37, textAlign: 'right', fontSize: 8, color: 'var(--text-faint)',
                  }}>
                    {minutesToTime(minute)}
                  </span>
                )}
              </div>
            )
          })}

          <div style={{
            position: 'absolute', inset: '0 0 0 44px',
            display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
          }}>
            {weekBlocks.map(({ day, blocks }) => {
              const isToday = day === today
              const gaps = getScheduleItems(blocks).filter(item => item.type === 'gap')
              return (
                <div key={day} style={{
                  position: 'relative', minWidth: 0,
                  borderLeft: '1px solid var(--border)',
                  background: isToday ? 'color-mix(in srgb, var(--today-col-bg) 55%, transparent)' : 'transparent',
                }}>
                  {gaps.map(gap => {
                    const top = (timeToMins(gap.startTime) - timelineStart) * pixelsPerMinute
                    const height = gap.minutes * pixelsPerMinute
                    return (
                      <div key={gap.id} title={`Ventana de ${gap.startTime} a ${gap.endTime}`} style={{
                        position: 'absolute', top: top + 1, left: 2, right: 2, height: Math.max(20, height - 2),
                        border: '1px dashed var(--success-border)', borderRadius: 5,
                        background: 'color-mix(in srgb, var(--success-bg) 75%, transparent)',
                        color: 'var(--success-text)', display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center', textAlign: 'center', zIndex: 2,
                      }}>
                        <span style={{ fontSize: 7, fontWeight: 800, textTransform: 'uppercase' }}>Ventana</span>
                        <span style={{ fontSize: 8, fontWeight: 700 }}>{formatGapDuration(gap.minutes)}</span>
                      </div>
                    )
                  })}
                  {positionOverlappingBlocks(blocks).map(({ block, column, columnCount }) => (
                    <TimelineBlock key={block.id} block={block} column={column} columnCount={columnCount} />
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
        {[
          { label: 'Cátedra', ...blockColor('CATEDRA') },
          { label: 'Ayudantía', ...blockColor('AYUDANTIA') },
          { label: 'Laboratorio', ...blockColor('LABORATORIO') },
        ].map(item => (
          <span key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--text-muted)' }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: item.bg, border: `1px solid ${item.border}` }} />
            {item.label}
          </span>
        ))}
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--text-muted)' }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--success-bg)', border: '1px dashed var(--success-border)' }} />
          Ventana ≥30 min
        </span>
      </div>

      {extraDays.map(({ day, blocks }) => (
        <div key={day} style={{ marginTop: 16 }}>
          <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 1 }}>
            {DAY_NAMES[day]}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {getScheduleItems(blocks).map(item => (
              item.type === 'gap'
                ? <GapCard key={item.id} gap={item} />
                : <BlockCard key={item.id} block={item.block} />
            ))}
          </div>
        </div>
      ))}
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
    <div style={{ background: 'var(--bg-card)', borderRadius: 16, padding: 16, marginBottom: 16, border: '1px solid var(--border)' }}>
      <p style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', marginBottom: 12 }}>Agregar clase al horario</p>
      <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Asignatura * (ej: Cálculo)" style={inputSt} />
      <select value={day} onChange={e => setDay(e.target.value)} style={{ ...inputSt, marginTop: 8 }}>
        {[1, 2, 3, 4, 5, 6].map(d => (
          <option key={d} value={d}>{DAY_NAMES[d]}</option>
        ))}
      </select>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Inicio</label>
          <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} style={{ ...inputSt, marginTop: 4 }} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Fin</label>
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

// ─── Config Tab ───────────────────────────────────────────────────────────────
function ConfigTab({
  schedule, setSchedule, offering, setOffering,
  myCourses, setMyCourses, sectionSelections, setSectionSelections,
  darkMode, setDarkMode,
  showToast, onScheduleGenerated,
}) {
  const fileRef = useRef(null)
  const searchRef = useRef(null)
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [selectedSemester, setSelectedSemester] = useState(() => LS.get('app_semester_v1', ''))

  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
  const semesterMatch = offering && selectedSemester
    ? matchSemesterCourses(offering, selectedSemester)
    : null

  const searchResults = offering && search.trim()
    ? offering.courseList.filter(c => {
        if (myCourses.includes(c.code)) return false
        const q = norm(search.trim())
        return norm(c.name).includes(q) || norm(c.code).includes(q)
      }).slice(0, 8)
    : []

  const handleFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = parseAcademicOffering(reader.result, file.name)
        const semesterCourses = selectedSemester
          ? matchSemesterCourses(parsed, selectedSemester).available
          : []
        setOffering(parsed)
        setMyCourses(semesterCourses)
        setSectionSelections({})
        setSchedule(prev => prev.filter(block => !block.fromOffering))
        showToast(
          semesterCourses.length
            ? `${parsed.courseList.length} ramos cargados · ${semesterCourses.length} seleccionados ✓`
            : `${parsed.courseList.length} ramos cargados ✓`
        )
      } catch (err) {
        showToast(err.message || 'Error al leer el archivo', 'err')
      }
    }
    reader.readAsText(file, 'UTF-8')
    e.target.value = ''
  }

  const handleSemesterChange = (value) => {
    setSelectedSemester(value)
    LS.set('app_semester_v1', value)
    if (!value || !offering) return

    const { available, missing } = matchSemesterCourses(offering, value)
    const nextSelections = Object.fromEntries(
      available
        .filter(code => sectionSelections[code])
        .map(code => [code, sectionSelections[code]])
    )
    setMyCourses(available)
    setSectionSelections(nextSelections)
    setSchedule(prev => syncOfferingSchedule(offering, available, nextSelections, prev))

    showToast(
      missing.length
        ? `${available.length} ramos seleccionados · ${missing.length} no están en esta oferta`
        : `${available.length} ramos del semestre seleccionados ✓`,
      missing.length ? 'warn' : 'ok'
    )
  }

  const addCourse = (code) => {
    if (myCourses.includes(code)) { showToast('Ese ramo ya está en tu lista', 'warn'); return }
    setMyCourses(prev => [...prev, code])
    setSearch('')
    setSearchOpen(false)
  }

  const removeCourse = (code) => {
    const nextCourses = myCourses.filter(c => c !== code)
    const nextSelections = { ...sectionSelections }
    delete nextSelections[code]
    setMyCourses(nextCourses)
    setSectionSelections(nextSelections)
    if (offering) {
      setSchedule(prev => syncOfferingSchedule(offering, nextCourses, nextSelections, prev))
    }
    showToast('Ramo eliminado del horario')
  }

  const handleSectionChange = (code, section) => {
    const nextSelections = { ...sectionSelections, [code]: section }
    setSectionSelections(nextSelections)
    if (offering && myCourses.includes(code)) {
      setSchedule(prev => syncOfferingSchedule(offering, myCourses, nextSelections, prev))
    }
  }

  const applySections = () => {
    if (!myCourses.length) { showToast('Agrega al menos un ramo', 'warn'); return }
    const selections = Object.fromEntries(
      myCourses.filter(code => sectionSelections[code]).map(code => [code, sectionSelections[code]])
    )
    if (!Object.keys(selections).length) { showToast('Elige la sección de cada ramo', 'warn'); return }
    const pending = myCourses.filter(code => !sectionSelections[code])
    if (pending.length) {
      showToast(`${pending.length} ramo(s) sin sección — se omitirán`, 'warn')
    }
    const next = syncOfferingSchedule(offering, myCourses, sectionSelections, schedule)
    setSchedule(next)
    showToast(`Horario generado (${next.filter(b => b.fromOffering).length} bloques) ✓`)
    onScheduleGenerated?.()
  }

  const clearOffering = () => {
    setOffering(null)
    setMyCourses([])
    setSectionSelections({})
    setSchedule(prev => prev.filter(b => !b.fromOffering))
    showToast('Oferta académica eliminada')
  }

  const selectedSectionEvents = (course) => {
    const section = course.sections[sectionSelections[course.code]]
    if (!section) return []
    return section.events.map((event, index) => {
      const scheduleText = event.slots
        .map(slot => `${DAY_SHORT[slot.day] || DAY_NAMES[slot.day]} ${slot.startTime}`)
        .join(', ')
      return {
        id: `${event.eventType}-${index}`,
        label: shortEventType(event.eventType),
        scheduleText,
      }
    })
  }

  const scheduleConflicts = []
  const selectedBlocks = schedule.filter(block => block.fromOffering)
  for (let i = 0; i < selectedBlocks.length; i++) {
    for (let j = i + 1; j < selectedBlocks.length; j++) {
      const first = selectedBlocks[i]
      const second = selectedBlocks[j]
      if (
        first.courseCode !== second.courseCode
        && first.day === second.day
        && timeToMins(first.startTime) < timeToMins(second.endTime)
        && timeToMins(second.startTime) < timeToMins(first.endTime)
      ) {
        scheduleConflicts.push({
          id: `${first.id}-${second.id}`,
          day: first.day,
          startTime: first.startTime > second.startTime ? first.startTime : second.startTime,
          first: first.courseName || first.subject,
          second: second.courseName || second.subject,
        })
      }
    }
  }

  return (
    <div>
      <div style={{
        background: 'var(--bg-card)', borderRadius: 14, padding: 14, marginBottom: 16,
        border: '1px solid var(--border)', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', gap: 12,
      }}>
        <div>
          <p style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>Modo noche</p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Interfaz oscura para toda la app</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={darkMode}
          onClick={() => setDarkMode(!darkMode)}
          style={{
            width: 50, height: 28, borderRadius: 99, border: 'none', cursor: 'pointer',
            padding: 2, flexShrink: 0, background: darkMode ? 'var(--accent)' : 'var(--border-light)',
            transition: 'background 0.2s',
          }}
        >
          <span style={{
            display: 'block', width: 24, height: 24, borderRadius: '50%', background: 'var(--text-on-accent)',
            transform: darkMode ? 'translateX(22px)' : 'translateX(0)',
            transition: 'transform 0.2s',
            boxShadow: '0 1px 4px var(--shadow)',
          }} />
        </button>
      </div>

      <div style={{
        background: 'var(--info-bg)', borderRadius: 14, padding: '12px 14px', marginBottom: 16,
        border: '1px solid var(--info-border)', fontSize: 12, color: 'var(--info-text)', lineHeight: 1.5,
      }}>
        Configura tu semestre aquí. Más opciones se agregarán pronto.
      </div>

      <div style={{
        background: 'var(--bg-card)', borderRadius: 14, padding: 14, marginBottom: 16,
        border: '1px solid var(--border)',
      }}>
        <p style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 8 }}>Oferta académica</p>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 12 }}>
          Exporta tu oferta desde Excel como CSV y súbela aquí. Luego busca y agrega solo los ramos que cursas.
        </p>
        <input ref={fileRef} type="file" accept=".csv,.txt,.tsv" onChange={handleFile} style={{ display: 'none' }} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => fileRef.current?.click()} style={{
            ...primaryBtn, flex: 'none', display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px',
          }}>
            <Icon name="upload" size={15} /> Cargar CSV
          </button>
          {offering && (
            <button onClick={clearOffering} style={{ ...secondaryBtn, padding: '9px 14px', color: 'var(--danger-text)', borderColor: 'var(--danger-border)' }}>
              Eliminar oferta
            </button>
          )}
        </div>
        {offering && (
          <p style={{ marginTop: 10, fontSize: 12, color: 'var(--success-text)', background: 'var(--success-bg)', padding: '8px 10px', borderRadius: 8 }}>
            <strong>{offering.fileName}</strong> · {offering.courseList.length} en oferta · {myCourses.length} en tu semestre
            {myCourses.length > 0 && ` · ${myCourses.filter(c => sectionSelections[c]).length} con sección`}
          </p>
        )}
      </div>

      {offering && (
        <div style={{
          background: 'var(--bg-card)', borderRadius: 14, padding: 14,
          marginBottom: 16, border: '1px solid var(--border)',
        }}>
          <p style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 4 }}>Semestre de la malla</p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 10 }}>
            Selecciona tu semestre para cargar automáticamente sus ramos. Inglés y CFG se omiten.
          </p>
          <select
            value={selectedSemester}
            onChange={e => handleSemesterChange(e.target.value)}
            style={inputSt}
          >
            <option value="">— Selección manual —</option>
            {CURRICULUM.map(item => (
              <option key={item.semester} value={item.semester}>
                Semestre {item.semester} · Año {item.year}
              </option>
            ))}
          </select>

          {semesterMatch && (
            <div style={{
              marginTop: 10, padding: '9px 10px', borderRadius: 9,
              background: semesterMatch.missing.length ? 'var(--warn-bg)' : 'var(--success-bg)',
              color: semesterMatch.missing.length ? 'var(--warn-text)' : 'var(--success-text)',
              fontSize: 11, lineHeight: 1.5,
            }}>
              <strong>{semesterMatch.available.length} ramos encontrados en la oferta.</strong>
              {semesterMatch.missing.length > 0 && (
                <span style={{ display: 'block', marginTop: 2 }}>
                  No disponibles: {semesterMatch.missing.join(', ')}
                </span>
              )}
              {semesterMatch.plan?.note && (
                <span style={{ display: 'block', marginTop: 2 }}>{semesterMatch.plan.note}</span>
              )}
            </div>
          )}
        </div>
      )}

      {offering && (
        <div style={{ background: 'var(--bg-card)', borderRadius: 14, padding: 14, marginBottom: 16, border: '1px solid var(--border)' }}>
          <p style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 4 }}>Mis ramos</p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
            Elige una sección por ramo. El horario se actualiza inmediatamente.
          </p>

          <div style={{ position: 'relative', marginBottom: 14 }}>
            <input
              ref={searchRef}
              value={search}
              onChange={e => { setSearch(e.target.value); setSearchOpen(true) }}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
              placeholder="Buscar por nombre o código (ej: Cálculo, CBF1000)..."
              style={inputSt}
            />
            {searchOpen && search.trim() && searchResults.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, marginTop: 4,
                background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border-light)',
                boxShadow: '0 8px 24px var(--shadow)', overflow: 'hidden',
              }}>
                {searchResults.map(course => (
                  <button
                    key={course.code}
                    type="button"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => addCourse(course.code)}
                    style={{
                      width: '100%', textAlign: 'left', padding: '10px 12px', border: 'none',
                      background: 'var(--bg-card)', cursor: 'pointer', borderBottom: '1px solid var(--border-faint)',
                    }}
                  >
                    <p style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{course.name}</p>
                    <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>
                      {course.code}{course.credits ? ` · ${course.credits} créditos` : ''}
                      · {Object.keys(course.sections).length} secciones
                    </p>
                  </button>
                ))}
              </div>
            )}
            {searchOpen && search.trim() && searchResults.length === 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, marginTop: 4,
                background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border-light)', padding: '12px',
                fontSize: 12, color: 'var(--text-faint)', boxShadow: '0 8px 24px var(--shadow)',
              }}>
                No se encontraron ramos
              </div>
            )}
          </div>

          {myCourses.length === 0 && (
            <div style={{
              textAlign: 'center', padding: '24px 12px', background: 'var(--bg-muted)',
              borderRadius: 12, border: '1px dashed var(--border-light)', marginBottom: 14,
            }}>
              <p style={{ fontSize: 13, color: 'var(--text-faint)', lineHeight: 1.5 }}>
                Usa el buscador para agregar<br />los ramos de tu semestre.
              </p>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {myCourses.map(code => {
              const course = offering.courses[code]
              if (!course) return null
              const sections = Object.keys(course.sections).sort((a, b) => {
                const na = parseInt(a.replace(/\D/g, '')) || 0
                const nb = parseInt(b.replace(/\D/g, '')) || 0
                return na - nb
              })
              return (
                <div key={course.code} style={{
                  display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                  padding: '10px 12px', background: 'var(--bg-muted)', borderRadius: 10, border: '1px solid var(--border-faint)',
                }}>
                  <div style={{ flex: 1, minWidth: 100 }}>
                    <p style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{course.name}</p>
                    <p style={{ fontSize: 11, color: 'var(--text-faint)' }}>{course.code}{course.credits ? ` · ${course.credits} créditos` : ''}</p>
                  </div>
                  <select
                    value={sectionSelections[course.code] || ''}
                    onChange={e => handleSectionChange(course.code, e.target.value)}
                    style={{ ...inputSt, width: 'auto', minWidth: 120, flex: 'none', fontSize: 13 }}
                  >
                    <option value="">— Sección —</option>
                    {sections.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => removeCourse(course.code)}
                    style={{ background: 'var(--danger-bg)', color: 'var(--danger-text)', border: 'none', borderRadius: 8, padding: '8px 10px', cursor: 'pointer', flexShrink: 0 }}
                    title="Quitar ramo"
                  >
                    <Icon name="trash" size={14} />
                  </button>
                  {sectionSelections[course.code] && (
                    <div style={{
                      width: '100%', display: 'flex', flexWrap: 'wrap', gap: 5,
                      paddingTop: 8, borderTop: '1px solid var(--border-faint)',
                    }}>
                      {selectedSectionEvents(course).map(event => (
                        <span key={event.id} style={{
                          padding: '3px 7px', borderRadius: 99,
                          background: 'var(--info-bg)', color: 'var(--info-text)',
                          fontSize: 9, fontWeight: 600,
                        }}>
                          {event.label} · {event.scheduleText}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {myCourses.length > 0 && (
            <>
              {scheduleConflicts.length > 0 && (
                <div style={{
                  marginTop: 12, padding: '9px 10px', borderRadius: 9,
                  background: 'var(--err-bg)', border: '1px solid var(--err-border)',
                  color: 'var(--err-text)', fontSize: 11, lineHeight: 1.5,
                }}>
                  <strong>{scheduleConflicts.length} choque(s) de horario</strong>
                  {scheduleConflicts.slice(0, 3).map(conflict => (
                    <span key={conflict.id} style={{ display: 'block', marginTop: 2 }}>
                      {DAY_SHORT[conflict.day]} {conflict.startTime} · {conflict.first} / {conflict.second}
                    </span>
                  ))}
                </div>
              )}
              <button onClick={applySections} style={{ ...primaryBtn, marginTop: 14, width: '100%' }}>
                Ver mi horario
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Schedule Tab ─────────────────────────────────────────────────────────────
function ScheduleTab({ schedule, setSchedule, showScheduleForm, setShowScheduleForm, showToast, onOpenSettings }) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    setNow(new Date())
    const t = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(t)
  }, [])

  const { current, next, day } = getScheduleStatus(schedule, now)
  const isWeekend = day === 0 || day === 6

  return (
    <div>
      {schedule.length > 0 && (
        <div style={{
          background: current ? 'var(--success-bg)' : 'var(--bg-card)',
          borderRadius: 14, padding: '14px 16px', marginBottom: 16,
          border: `1px solid ${current ? 'var(--success-border)' : 'var(--border)'}`,
        }}>
          {current ? (
            <>
              <p style={{ fontSize: 10, fontWeight: 800, color: 'var(--success-text-light)', letterSpacing: 1, marginBottom: 6 }}>EN CLASE AHORA</p>
              <p style={{ fontWeight: 700, fontSize: 16, color: 'var(--success-text)', lineHeight: 1.3 }}>{current.subject}</p>
              <p style={{ marginTop: 4, fontSize: 13, color: 'var(--success-text)' }}>
                {shortEventType(current.eventType)} · {current.startTime}–{current.endTime}
                {current.professor && ` · ${current.professor.split(' ').slice(0, 2).join(' ')}`}
              </p>
            </>
          ) : isWeekend ? (
            <>
              <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', letterSpacing: 1, marginBottom: 4 }}>HOY</p>
              <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-secondary)' }}>Fin de semana — sin clases</p>
            </>
          ) : next ? (
            <>
              <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: 1, marginBottom: 4 }}>SIN CLASE AHORA</p>
              <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>Próxima: {next.subject}</p>
              <p style={{ marginTop: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                {shortEventType(next.eventType)} a las {next.startTime}
              </p>
            </>
          ) : (
            <>
              <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: 1, marginBottom: 4 }}>HOY</p>
              <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-secondary)' }}>Sin más clases hoy</p>
            </>
          )}
        </div>
      )}

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
          <div style={emptyIconBox('success')}>
            <Icon name="book" size={28} />
          </div>
          <p style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>Sin horario</p>
          <p style={{ marginTop: 6, fontSize: 13, color: 'var(--text-faint)', lineHeight: 1.6 }}>
            Ve a <strong>Config</strong> para cargar tu oferta,<br />elegir ramos y generar el horario.
          </p>
          {onOpenSettings && (
            <button onClick={onOpenSettings} style={{ ...primaryBtn, marginTop: 16, flex: 'none', padding: '10px 20px' }}>
              Ir a Configuración
            </button>
          )}
        </div>
      )}

      {schedule.length > 0 && (
        <>
          <p style={{ margin: '0 0 12px', fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 1 }}>
            Mi horario semanal
          </p>
          <WeeklyGrid
            schedule={schedule}
            now={now}
            onRemove={id => {
              setSchedule(p => p.filter(s => s.id !== id))
              showToast('Clase eliminada del horario')
            }}
          />
        </>
      )}
    </div>
  )
}

// ─── Calendar Tab ─────────────────────────────────────────────────────────────
function CalendarTab({
  events, setEvents, schedule, courseOptions, gToken, connectGoogle, disconnectGoogle,
  pushToGCal, saveEvent, showToast, showEventForm, setShowEventForm,
  shareStatus, shareCalendar,
}) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    setNow(new Date())
    const t = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(t)
  }, [])

  const upcoming = [...events].filter(e => new Date(e.date + 'T23:59') >= now).sort((a, b) => new Date(a.date) - new Date(b.date))
  const past = [...events].filter(e => new Date(e.date + 'T23:59') < now).sort((a, b) => new Date(b.date) - new Date(a.date))
  const shared = shareStatus === 'shared'

  return (
    <div>
      <div style={{
        background: gToken ? 'var(--success-bg)' : 'var(--info-bg)', borderRadius: 14, padding: '12px 14px',
        marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10,
        border: `1px solid ${gToken ? 'var(--success-border)' : 'var(--info-border)'}`,
      }}>
        <div style={{ color: gToken ? 'var(--success-text-light)' : 'var(--accent-light)' }}>
          <Icon name={gToken ? 'check' : 'google'} size={20} />
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: gToken ? 'var(--success-text)' : 'var(--info-text)' }}>
            {gToken ? 'Google Calendar conectado' : 'Conectar Google Calendar'}
          </p>
          <p style={{ marginTop: 2, fontSize: 11, color: gToken ? 'var(--success-text-light)' : 'var(--accent-light)' }}>
            {gToken ? 'Los eventos nuevos se sincronizan solos' : 'Conecta para sincronizar automáticamente'}
          </p>
        </div>
        {gToken ? (
          <button onClick={disconnectGoogle} style={{ background: 'none', border: '1px solid var(--success-border)', borderRadius: 9, padding: '6px 10px', fontSize: 11, color: 'var(--success-text)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Icon name="logout" size={13} /> Salir
          </button>
        ) : (
          <button onClick={connectGoogle} style={{ background: 'var(--accent-light)', color: 'var(--text-on-accent)', border: 'none', borderRadius: 9, padding: '7px 13px', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            Conectar
          </button>
        )}
      </div>

      <div style={{
        background: shared ? 'var(--success-bg)' : 'var(--bg-card)', borderRadius: 14, padding: '12px 14px',
        marginBottom: 16, border: `1px solid ${shared ? 'var(--success-border)' : 'var(--border)'}`,
      }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Acceso de tu amiga</p>
        <p style={{ marginTop: 4, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          {shared
            ? `El calendario ya está compartido con ${SHARED_CALENDAR_EMAIL}. Le llegará una invitación de Google y lo verá en «Otros calendarios».`
            : `Al conectar, se comparte tu calendario con ${SHARED_CALENDAR_EMAIL} para que pueda ver y agregar eventos.`}
        </p>
        {gToken && !shared && (
          <button type="button" onClick={shareCalendar} style={{
            ...primaryBtn, marginTop: 10, width: '100%',
          }}>
            Compartir ahora
          </button>
        )}
        {!gToken && (
          <p style={{ marginTop: 8, fontSize: 11, color: 'var(--text-faint)', lineHeight: 1.4 }}>
            Si Google ya estaba conectado, vuelve a pulsar Conectar y acepta el permiso de calendario.
          </p>
        )}
      </div>

      {showEventForm && (
        <EventForm
          schedule={schedule}
          courseOptions={courseOptions}
          onSave={saveEvent}
          onClose={() => setShowEventForm(false)}
        />
      )}

      {events.length === 0 && !showEventForm && (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <div style={emptyIconBox()}>
            <Icon name="calendar" size={28} />
          </div>
          <p style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>Sin eventos</p>
          <p style={{ marginTop: 6, fontSize: 13, color: 'var(--text-faint)', lineHeight: 1.6 }}>
            Agrega tus controles, solemnes y tareas<br />para tenerlos todos organizados.
          </p>
        </div>
      )}

      {upcoming.length > 0 && (
        <>
          <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 1 }}>Próximos ({upcoming.length})</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
            {upcoming.map(ev => (
              <EventCard key={ev.id} ev={ev} now={now} gToken={gToken}
                onSync={() => pushToGCal(ev)}
                onDelete={() => { setEvents(p => p.filter(e => e.id !== ev.id)); showToast('Evento eliminado') }} />
            ))}
          </div>
        </>
      )}

      {past.length > 0 && (
        <>
          <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 1 }}>Pasados ({past.length})</p>
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
  const [checklistTemplates, setChecklistTemplates] = useState(() => LS.get('app_checklist_templates_v1', []))
  const [checklistDays, setChecklistDays] = useState(() => LS.get('app_checklist_days_v1', {}))
  const [events, setEvents] = useState(() => LS.get('app_events_v3', []))
  const [schedule, setSchedule] = useState(() => LS.get('app_schedule_v1', []))
  const [offering, setOffering] = useState(() => LS.get('app_offering_v1', null))
  const [myCourses, setMyCourses] = useState(() => LS.get('app_my_courses_v1', []))
  const [sectionSelections, setSectionSelections] = useState(() => LS.get('app_section_sel_v1', {}))
  const [showTaskForm, setShowTaskForm] = useState(false)
  const [showEventForm, setShowEventForm] = useState(false)
  const [showScheduleForm, setShowScheduleForm] = useState(false)
  const [gToken, setGToken] = useState(() => LS.get('g_access_token', null))
  const [gapiReady, setGapiReady] = useState(false)
  const [shareStatus, setShareStatus] = useState(() => LS.get('g_calendar_share_v1', 'pending'))
  const [darkMode, setDarkMode] = useState(() => LS.get('app_dark_mode', false))
  const [toast, setToast] = useState(null)
  const tokenClientRef = useRef(null)

  // Generar checklist del día al montar / al cambiar de día
  useEffect(() => {
    setChecklistDays(prev => ensureDayChecklist(checklistTemplates, prev, dateKey(), uid))
  }, [checklistTemplates])

  useEffect(() => { LS.set('app_checklist_templates_v1', checklistTemplates) }, [checklistTemplates])
  useEffect(() => { LS.set('app_checklist_days_v1', checklistDays) }, [checklistDays])
  useEffect(() => { LS.set('app_events_v3', events) }, [events])
  useEffect(() => { LS.set('app_schedule_v1', schedule) }, [schedule])
  useEffect(() => { LS.set('app_offering_v1', offering) }, [offering])
  useEffect(() => { LS.set('app_my_courses_v1', myCourses) }, [myCourses])
  useEffect(() => { LS.set('app_section_sel_v1', sectionSelections) }, [sectionSelections])
  useEffect(() => { LS.set('g_calendar_share_v1', shareStatus) }, [shareStatus])
  useEffect(() => {
    LS.set('app_dark_mode', darkMode)
    document.documentElement.classList.toggle('theme-dark', darkMode)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', darkMode ? '#0F0F14' : '#5238C4')
  }, [darkMode])

  // Si el usuario deja la app abierta past medianoche, regenerar el día
  useEffect(() => {
    const tick = () => {
      setChecklistDays(prev => ensureDayChecklist(checklistTemplates, prev, dateKey(), uid))
    }
    const id = setInterval(tick, 60000)
    return () => clearInterval(id)
  }, [checklistTemplates])

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
    tokenClientRef.current?.requestAccessToken({
      prompt: shareStatus === 'shared' ? '' : 'consent',
    })
  }

  const disconnectGoogle = () => {
    if (gToken && window.google?.accounts?.oauth2) {
      window.google.accounts.oauth2.revoke(gToken)
    }
    setGToken(null)
    LS.set('g_access_token', null)
    showToast('Sesión de Google cerrada')
  }

  const shareCalendar = async ({ quiet = false } = {}) => {
    if (!gapiReady || !gToken) {
      if (!quiet) showToast('Conecta Google Calendar primero', 'warn')
      return false
    }
    try {
      await window.gapi.client.calendar.acl.insert({
        calendarId: 'primary',
        sendNotifications: true,
        resource: calendarAclResource(SHARED_CALENDAR_EMAIL, 'writer'),
      })
      setShareStatus('shared')
      if (!quiet) showToast(`Calendario compartido con ${SHARED_CALENDAR_EMAIL} ✓`)
      return true
    } catch (err) {
      if (isAlreadySharedError(err)) {
        setShareStatus('shared')
        if (!quiet) showToast('El calendario ya estaba compartido ✓')
        return true
      }
      if (err.status === 401) {
        setGToken(null)
        LS.set('g_access_token', null)
        showToast('Sesión expirada, vuelve a conectar', 'warn')
        return false
      }
      if (isInsufficientScopeError(err)) {
        if (!quiet) showToast('Vuelve a conectar Google Calendar y acepta el permiso', 'warn')
        return false
      }
      if (!quiet) showToast('No se pudo compartir el calendario', 'err')
      return false
    }
  }

  useEffect(() => {
    if (!gapiReady || !gToken || shareStatus === 'shared') return
    shareCalendar({ quiet: true })
  }, [gapiReady, gToken])

  const insertEventToGCal = async (ev) => {
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
  }

  const pushToGCal = async (ev, { quiet = false } = {}) => {
    if (!gapiReady || !gToken) {
      if (!quiet) showToast('Conecta Google Calendar primero', 'warn')
      return false
    }
    try {
      await insertEventToGCal(ev)
      setEvents(prev => prev.map(e => e.id === ev.id ? { ...e, synced: true } : e))
      if (!quiet) showToast('Evento agregado a Google Calendar ✓')
      return true
    } catch (err) {
      if (err.status === 401) {
        setGToken(null)
        LS.set('g_access_token', null)
        showToast('Sesión expirada, vuelve a conectar', 'warn')
      } else if (!quiet) {
        showToast('Error al sincronizar: ' + (err.message || err.status), 'err')
      }
      return false
    }
  }

  const saveEvent = async (ev) => {
    setEvents(prev => [ev, ...prev])
    setShowEventForm(false)

    if (gapiReady && gToken) {
      const ok = await pushToGCal(ev, { quiet: true })
      showToast(
        ok ? 'Evento creado y agregado a Google Calendar ✓' : 'Evento creado. No se pudo sincronizar con Google',
        ok ? 'ok' : 'warn',
      )
    } else {
      showToast('Evento creado ✓')
    }
  }

  const onTabChange = (t) => {
    setTab(t)
    setShowTaskForm(false)
    setShowEventForm(false)
    setShowScheduleForm(false)
  }

  const openFab = () => {
    if (tab === 'goals') setShowTaskForm(true)
    else if (tab === 'calendar') setShowEventForm(true)
    else if (tab === 'schedule') setShowScheduleForm(true)
  }

  const courseOptions = getCourseOptions(offering, myCourses, schedule)

  return (
    <div style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", maxWidth: 480, margin: '0 auto', minHeight: '100vh', background: 'var(--bg-page)', color: 'var(--text)' }}>

      {toast && (
        <div style={{
          position: 'fixed', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 999,
          background: toast.type === 'err' ? 'var(--err-bg)' : toast.type === 'warn' ? 'var(--warn-bg)' : 'var(--success-bg)',
          color: toast.type === 'err' ? 'var(--err-text)' : toast.type === 'warn' ? 'var(--warn-text)' : 'var(--success-text)',
          padding: '10px 18px', borderRadius: 12, fontSize: 13, fontWeight: 600,
          border: `1px solid ${toast.type === 'err' ? 'var(--err-border)' : toast.type === 'warn' ? 'var(--warn-border)' : 'var(--success-border)'}`,
          boxShadow: '0 4px 24px var(--shadow-strong)', whiteSpace: 'nowrap', pointerEvents: 'none',
        }}>{toast.msg}</div>
      )}

      <div style={{ padding: '22px 18px 0', background: 'var(--bg-page)' }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', letterSpacing: 1.5, textTransform: 'uppercase' }}>Mi Centro</p>
        <h1 style={{ margin: '2px 0 16px', fontSize: 26, fontWeight: 800, color: 'var(--text)', letterSpacing: -0.8 }}>Organización</h1>
        <div style={{ display: 'flex', gap: 3, background: 'var(--bg-tab-bar)', borderRadius: 13, padding: 4 }}>
          {[
            { id: 'goals', label: 'Mi recorrido', icon: 'check' },
            { id: 'schedule', label: 'Horario', icon: 'book' },
            { id: 'calendar', label: 'Agenda', icon: 'calendar' },
            { id: 'pluxee', label: 'Pluxee', icon: 'map' },
            { id: 'settings', label: 'Config', icon: 'settings' },
          ].map(t => (
            <button key={t.id} onClick={() => onTabChange(t.id)} style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
              padding: '8px 2px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 600,
              background: tab === t.id ? 'var(--bg-tab-active)' : 'transparent',
              color: tab === t.id ? 'var(--accent)' : 'var(--text-tab-inactive)',
              boxShadow: tab === t.id ? '0 1px 6px var(--shadow)' : 'none',
              transition: 'all 0.18s',
            }}>
              <Icon name={t.icon} size={13} />
              <span style={{ lineHeight: 1 }}>{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '16px 18px 100px' }}>
        {tab === 'goals' ? (
          <JourneyTab
            templates={checklistTemplates} setTemplates={setChecklistTemplates}
            daysMap={checklistDays} setDaysMap={setChecklistDays}
            showTaskForm={showTaskForm} setShowTaskForm={setShowTaskForm}
            showToast={showToast}
          />
        ) : tab === 'schedule' ? (
          <ScheduleTab schedule={schedule} setSchedule={setSchedule}
            showScheduleForm={showScheduleForm} setShowScheduleForm={setShowScheduleForm}
            showToast={showToast} onOpenSettings={() => setTab('settings')} />
        ) : tab === 'settings' ? (
          <ConfigTab schedule={schedule} setSchedule={setSchedule}
            offering={offering} setOffering={setOffering}
            myCourses={myCourses} setMyCourses={setMyCourses}
            sectionSelections={sectionSelections} setSectionSelections={setSectionSelections}
            darkMode={darkMode} setDarkMode={setDarkMode}
            showToast={showToast} onScheduleGenerated={() => setTab('schedule')} />
        ) : tab === 'pluxee' ? (
          <PluxeeTab />
        ) : (
          <CalendarTab events={events} setEvents={setEvents} schedule={schedule} courseOptions={courseOptions}
            gToken={gToken} connectGoogle={connectGoogle} disconnectGoogle={disconnectGoogle}
            pushToGCal={pushToGCal} saveEvent={saveEvent}
            showToast={showToast} showEventForm={showEventForm} setShowEventForm={setShowEventForm}
            shareStatus={shareStatus} shareCalendar={() => shareCalendar({ quiet: false })} />
        )}
      </div>

      {tab !== 'settings' && tab !== 'pluxee' && (
      <button
        onClick={openFab}
        style={{
          position: 'fixed', bottom: 24, right: 20,
          width: 54, height: 54, borderRadius: '50%', border: 'none',
          background: 'linear-gradient(135deg, var(--accent-gradient-start), var(--accent))',
          color: 'var(--text-on-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', boxShadow: '0 4px 20px var(--shadow-strong)',
        }}>
        <Icon name="plus" size={22} />
      </button>
      )}
    </div>
  )
}
