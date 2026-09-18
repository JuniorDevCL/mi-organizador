/** Ocupación de salas UDP a partir del JSON público de docencia EIT. */

export const SALAS_URL = 'https://salas.docencia-eit.cl/data.json'
export const SALAS_TTL_MS = 30 * 60 * 1000

export const UDP_BLOCKS = [
  { id: '08:30', label: '08:30 – 09:50', start: '08:30', end: '09:50' },
  { id: '10:00', label: '10:00 – 11:20', start: '10:00', end: '11:20' },
  { id: '11:30', label: '11:30 – 12:50', start: '11:30', end: '12:50' },
  { id: '13:00', label: '13:00 – 14:20', start: '13:00', end: '14:20' },
  { id: '14:30', label: '14:30 – 15:50', start: '14:30', end: '15:50' },
  { id: '16:00', label: '16:00 – 17:20', start: '16:00', end: '17:20' },
  { id: '17:25', label: '17:25 – 18:45', start: '17:25', end: '18:45' },
]

const DAY_NAMES = { 1: 'Lunes', 2: 'Martes', 3: 'Miércoles', 4: 'Jueves', 5: 'Viernes', 6: 'Sábado', 0: 'Domingo' }
const WEEKDAY = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

export function toMinutes(timeStr) {
  const parts = String(timeStr || '').split(':')
  const h = Number(parts[0])
  const m = Number(parts[1])
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0
  return h * 60 + m
}

export function formatHm(timeStr) {
  const parts = String(timeStr || '').split(':')
  if (parts.length < 2) return String(timeStr || '')
  return `${String(parts[0]).padStart(2, '0')}:${String(parts[1]).padStart(2, '0')}`
}

export function chileClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Santiago',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]))
  let hour = Number(map.hour)
  if (hour === 24) hour = 0
  const minute = Number(map.minute)
  const day = WEEKDAY[map.weekday] ?? now.getDay()
  return { day, hour, minute, minutes: hour * 60 + minute }
}

export function resolveBlock(blockId) {
  const wanted = formatHm(blockId)
  return UDP_BLOCKS.find((b) => b.id === wanted || b.start === wanted) || UDP_BLOCKS[0]
}

export function currentAcademicWindow(now = new Date()) {
  const clock = chileClock(now)
  const first = UDP_BLOCKS[0]
  const last = UDP_BLOCKS[UDP_BLOCKS.length - 1]
  const weekend = clock.day === 0 || clock.day === 6
  const before = clock.minutes < toMinutes(first.start)
  const after = clock.minutes > toMinutes(last.end)
  const valid = !weekend && !before && !after

  let block = UDP_BLOCKS[UDP_BLOCKS.length - 1]
  for (const candidate of UDP_BLOCKS) {
    if (clock.minutes <= toMinutes(candidate.end)) {
      block = candidate
      break
    }
  }
  if (before || weekend) block = first

  let message = ''
  if (weekend) message = 'Fin de semana. Las clases de este listado van de lunes a viernes (08:30 – 18:45).'
  else if (before) message = 'Aún no empieza la jornada (primer bloque 08:30).'
  else if (after) message = 'La jornada de hoy ya terminó (último bloque 18:45).'

  const day = weekend ? 1 : clock.day
  return { clock, day, block, valid, message, weekend, before, after }
}

const normalize = (value) => String(value || '').trim().toUpperCase()

export function parseSalasPayload(json) {
  const edges = json?.data?.allSalasUdps?.edges
  if (!Array.isArray(edges)) throw new Error('El listado de salas no tiene el formato esperado')
  const classes = []
  const rooms = new Set()
  for (const edge of edges) {
    const node = edge?.node
    if (!node) continue
    const place = String(node.place || '').trim()
    if (place) rooms.add(place)
    classes.push({
      code: node.code || '',
      section: node.section ?? '',
      course: node.course || 'Sin curso',
      place,
      start: formatHm(node.start),
      finish: formatHm(node.finish),
      startMin: toMinutes(node.start),
      endMin: (() => {
        const start = toMinutes(node.start)
        let end = toMinutes(node.finish)
        if (end <= start) end = start + 80
        return end
      })(),
      day: Number(node.day),
      teacher: node.teacher || 'No informado',
    })
  }
  return { classes, rooms: [...rooms].sort((a, b) => a.localeCompare(b, 'es')) }
}

export function occupancyFor({ classes, rooms }, { day, blockId, query = '' }) {
  const block = resolveBlock(blockId)
  const bStart = toMinutes(block.start)
  const bEnd = toMinutes(block.end)
  const dia = Number(day)
  const needle = normalize(query)

  const matchesQuery = (place) => !needle || normalize(place).includes(needle)
  const allRooms = rooms.filter(matchesQuery)

  const occupied = {}
  const byRoom = {}

  for (const cls of classes) {
    if (!cls.place || !matchesQuery(cls.place)) continue
    if (cls.day !== dia) continue
    if (!byRoom[cls.place]) byRoom[cls.place] = []
    byRoom[cls.place].push(cls)
    if (!(cls.endMin <= bStart || cls.startMin >= bEnd) && !occupied[cls.place]) {
      occupied[cls.place] = {
        sala: cls.place,
        curso: cls.course,
        profe: cls.teacher,
        seccion: cls.section,
        codigo: cls.code,
        start: cls.start,
        finish: cls.finish,
        horario: `${cls.start} – ${cls.finish}`,
      }
    }
  }

  const free = []
  const freeInfo = {}
  for (const sala of allRooms) {
    if (occupied[sala]) continue
    const today = byRoom[sala] || []
    const upcoming = today.filter((c) => c.startMin >= bStart)
    if (upcoming.length) {
      const next = upcoming.reduce((a, b) => (a.startMin < b.startMin ? a : b))
      const diff = next.startMin - bStart
      const tiempo = diff >= 60
        ? `${Math.floor(diff / 60)}h${diff % 60 ? String(diff % 60).padStart(2, '0') : ''}`
        : `${diff}m`
      freeInfo[sala] = {
        proxima_hora: next.start,
        proximo_curso: next.course,
        minutos_hasta_proxima: diff,
        libre_todo_el_dia: false,
        texto: `Hasta las ${next.start} (${tiempo})`,
      }
    } else {
      freeInfo[sala] = {
        proxima_hora: null,
        proximo_curso: null,
        minutos_hasta_proxima: null,
        libre_todo_el_dia: true,
        texto: 'Libre el resto del día',
      }
    }
    free.push(sala)
  }

  free.sort((a, b) => {
    const ia = freeInfo[a]
    const ib = freeInfo[b]
    if (ia.libre_todo_el_dia !== ib.libre_todo_el_dia) return ia.libre_todo_el_dia ? -1 : 1
    return (ib.minutos_hasta_proxima || 0) - (ia.minutos_hasta_proxima || 0) || a.localeCompare(b, 'es')
  })

  return {
    dia,
    dia_nombre: DAY_NAMES[dia] || String(dia),
    bloque: block,
    query,
    total_libres: free.length,
    total_ocupadas: Object.keys(occupied).length,
    vacias: free,
    vacias_info: freeInfo,
    ocupadas: occupied,
  }
}

export function weekForRoom(classes, nombre) {
  const wanted = normalize(nombre)
  const horario = { 1: [], 2: [], 3: [], 4: [], 5: [] }
  for (const cls of classes) {
    if (normalize(cls.place) !== wanted) continue
    if (!horario[cls.day]) continue
    horario[cls.day].push({
      curso: cls.course,
      codigo: cls.code,
      seccion: cls.section,
      profe: cls.teacher,
      start: cls.start,
      finish: cls.finish,
    })
  }
  for (const day of Object.keys(horario)) {
    horario[day].sort((a, b) => toMinutes(a.start) - toMinutes(b.start))
  }
  return { sala: nombre, horario }
}

export function createSalasService({
  fetchImpl = fetch,
  ttlMs = SALAS_TTL_MS,
  remoteUrl = SALAS_URL,
  initialData = null,
} = {}) {
  let parsed = initialData ? parseSalasPayload(initialData) : null
  let loadedAt = initialData ? Date.now() : 0
  let source = initialData ? 'fixture' : 'none'
  let lastError = ''

  const load = async (force = false) => {
    if (parsed && !force && Date.now() - loadedAt < ttlMs) return parsed
    try {
      const res = await fetchImpl(remoteUrl, {
        headers: { 'User-Agent': 'MiOrganizador/2.0 (salas UDP)' },
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      parsed = parseSalasPayload(await res.json())
      loadedAt = Date.now()
      source = 'online'
      lastError = ''
      return parsed
    } catch (err) {
      lastError = err.message || String(err)
      if (parsed) {
        source = 'cache'
        return parsed
      }
      throw Object.assign(new Error('No se pudo cargar el listado de salas'), { status: 502 })
    }
  }

  return {
    blocks: UDP_BLOCKS,
    async occupancy({ day, blockId, query }) {
      const data = await load()
      return occupancyFor(data, { day, blockId, query })
    },
    async now(query) {
      const window = currentAcademicWindow()
      const data = await load()
      const occupancy = occupancyFor(data, { day: window.day, blockId: window.block.id, query })
      return {
        ...occupancy,
        en_horario_valido: window.valid,
        mensaje_horario: window.message,
        hora_chile: `${String(window.clock.hour).padStart(2, '0')}:${String(window.clock.minute).padStart(2, '0')}`,
      }
    },
    async room(nombre) {
      const data = await load()
      return weekForRoom(data.classes, nombre)
    },
    async status() {
      try { await load() } catch { /* lastError queda seteado */ }
      return {
        source,
        lastError: lastError || undefined,
        total_clases: parsed?.classes.length || 0,
        total_salas: parsed?.rooms.length || 0,
        bloques: UDP_BLOCKS,
        remote_url: remoteUrl,
      }
    },
  }
}
