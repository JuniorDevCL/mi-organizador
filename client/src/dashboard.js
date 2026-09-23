import { dateKey } from './checklist.js'

const DAY_MS = 24 * 60 * 60 * 1000

export const minutesOf = (time) => {
  const [h, m] = String(time || '').split(':').map(Number)
  if (!Number.isFinite(h)) return null
  return h * 60 + (Number.isFinite(m) ? m : 0)
}

export function todayClasses(schedule, now = new Date()) {
  const day = now.getDay()
  const mins = now.getHours() * 60 + now.getMinutes()
  const blocks = (Array.isArray(schedule) ? schedule : [])
    .filter((block) => Number(block?.day) === day && block.startTime && block.endTime)
    .slice()
    .sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)))
  const current = blocks.find((block) => {
    const start = minutesOf(block.startTime)
    const end = minutesOf(block.endTime)
    return start != null && end != null && start <= mins && mins < end
  }) || null
  const next = blocks.find((block) => {
    const start = minutesOf(block.startTime)
    return start != null && start > mins
  }) || null
  return {
    day,
    weekend: day === 0 || day === 6,
    blocks,
    current,
    next,
  }
}

function eventMoment(event) {
  if (!event?.date || !/^\d{4}-\d{2}-\d{2}$/.test(event.date)) return null
  const time = /^\d{2}:\d{2}$/.test(event.time || '') ? event.time : '00:00'
  const at = new Date(`${event.date}T${time}:00`)
  return Number.isNaN(at.getTime()) ? null : at
}

function eventEnds(event, at) {
  if (!event.time) {
    const end = new Date(`${event.date}T23:59:59`)
    return Number.isNaN(end.getTime()) ? at : end
  }
  const duration = Number(event.duration)
  const minutes = Number.isFinite(duration) && duration > 0 ? duration : 60
  return new Date(at.getTime() + minutes * 60 * 1000)
}

export function relativeDayLabel(dateStr, now = new Date()) {
  const today = dateKey(now)
  const tomorrowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  if (dateStr === today) return 'Hoy'
  if (dateStr === dateKey(tomorrowDate)) return 'Mañana'
  const parsed = new Date(`${dateStr}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return dateStr
  const label = parsed.toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' })
  return label.charAt(0).toUpperCase() + label.slice(1).replace('.', '')
}

export function upcomingEvents(events, now = new Date(), { withinDays = 14, limit = 5 } = {}) {
  const horizon = new Date(now.getTime() + withinDays * DAY_MS)
  const matched = (Array.isArray(events) ? events : [])
    .map((event) => {
      const at = eventMoment(event)
      if (!at) return null
      return { event, at, ends: eventEnds(event, at) }
    })
    .filter((row) => row && row.ends >= now && row.at <= horizon)
    .sort((a, b) => a.at - b.at || String(a.event.title || '').localeCompare(String(b.event.title || ''), 'es'))
  return {
    total: matched.length,
    items: matched.slice(0, limit).map((row) => row.event),
  }
}

export function checklistPulse(tasks) {
  const list = Array.isArray(tasks) ? tasks : []
  const done = list.filter((task) => task.done).length
  const pending = list.filter((task) => !task.done)
  const next = pending.slice().sort((a, b) => {
    if (a.time && b.time) return String(a.time).localeCompare(String(b.time))
    if (a.time) return -1
    if (b.time) return 1
    return String(a.name || '').localeCompare(String(b.name || ''), 'es')
  })[0] || null
  return {
    done,
    total: list.length,
    pct: list.length ? Math.round((done / list.length) * 100) : 0,
    next,
  }
}
