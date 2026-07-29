/** Daily checklist helpers for "Mi recorrido". */

export const dateKey = (date = new Date()) => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export const dayOfWeek = (dateStr) =>
  new Date(`${dateStr}T12:00:00`).getDay()

/** Template applies on a given calendar day (0=Sun … 6=Sat). */
export const templateAppliesOnDay = (template, dow) => {
  if (!template || template.recurrence === 'once') return false
  const days = Array.isArray(template.days) ? template.days : []
  if (template.recurrence === 'daily') return days.length === 0 || days.includes(dow)
  return days.includes(dow)
}

export const greetingForHour = (hour) => {
  if (hour < 12) return 'Buenos días'
  if (hour < 20) return 'Buenas tardes'
  return 'Buenas noches'
}

export const formatLongDate = (date = new Date()) =>
  date.toLocaleDateString('es-CL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

/**
 * Build today's task instances from recurring templates.
 * One-off ("solo hoy") tasks are never generated here.
 */
export const buildTasksFromTemplates = (templates, dateStr, makeId) => {
  const dow = dayOfWeek(dateStr)
  return (templates || [])
    .filter(t => templateAppliesOnDay(t, dow))
    .map(t => ({
      id: makeId(),
      templateId: t.id,
      name: t.name,
      emoji: t.emoji || '✨',
      time: t.time || '',
      done: false,
    }))
    .sort((a, b) => {
      if (a.time && b.time) return a.time.localeCompare(b.time)
      if (a.time) return -1
      if (b.time) return 1
      return a.name.localeCompare(b.name, 'es')
    })
}

/**
 * Ensure the days map has an entry for today.
 * Recurring templates spawn new instances; prior one-off tasks are not copied.
 */
export const ensureDayChecklist = (templates, daysMap, dateStr, makeId) => {
  const map = daysMap && typeof daysMap === 'object' ? daysMap : {}
  if (Array.isArray(map[dateStr])) return map
  return {
    ...map,
    [dateStr]: buildTasksFromTemplates(templates, dateStr, makeId),
  }
}

export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]

export const WEEKDAY_OPTIONS = [
  { value: 1, label: 'L' },
  { value: 2, label: 'M' },
  { value: 3, label: 'X' },
  { value: 4, label: 'J' },
  { value: 5, label: 'V' },
  { value: 6, label: 'S' },
  { value: 0, label: 'D' },
]

export const EMOJI_OPTIONS = [
  '☀️', '💪', '📚', '🏃', '🧘', '💧', '🥗', '😴',
  '📝', '🎯', '🧹', '🎵', '💊', '🧠', '🌱', '✨',
]
