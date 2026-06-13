const DAY_ABBR = { LU: 1, MA: 2, MI: 3, JU: 4, VI: 5, SA: 6, DO: 0 }

const padTime = (t) => {
  const [h, m] = t.trim().split(':')
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`
}

export const parseHorario = (raw) => {
  if (!raw?.trim()) return []
  const s = raw.trim()
  const timeMatch = s.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/)
  if (!timeMatch) return []
  const startTime = padTime(timeMatch[1])
  const endTime = padTime(timeMatch[2])
  const daysPart = s.slice(0, timeMatch.index).trim()
  const days = daysPart.split(/\s+/).map(d => DAY_ABBR[d.toUpperCase()]).filter(d => d !== undefined)
  return days.map(day => ({ day, startTime, endTime }))
}

const splitLine = (line) => {
  if (line.includes('\t') && !line.includes('","') && !line.startsWith('"')) {
    return line.split('\t').map(c => c.trim())
  }
  const result = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; continue }
      inQuotes = !inQuotes
      continue
    }
    if ((c === ',' || c === ';') && !inQuotes) {
      result.push(cur.trim())
      cur = ''
      continue
    }
    cur += c
  }
  result.push(cur.trim())
  return result
}

const mapColumns = (headers) => {
  const cols = {}
  headers.forEach((h, i) => {
    const n = h.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim()
    if (n === 'asignatura') cols.code = i
    if (n.includes('nombre') && n.includes('asig')) cols.name = i
    if (n.includes('credito')) cols.credits = i
    if (n.includes('seccion')) cols.section = i
    if ((n.includes('descrip') || n.includes('descrp')) && n.includes('evento')) cols.event = i
    if (n.includes('horario')) cols.horario = i
    if (n.includes('profesor')) cols.professor = i
    if (n.includes('sede')) cols.campus = i
    if (n.includes('paquete') && !n.includes('vac') && !n.includes('cat') && !n.includes('id')) cols.package = i
  })
  return cols
}

const get = (row, idx) => (idx !== undefined && row[idx] !== undefined ? row[idx].trim() : '')

export const parseAcademicOffering = (text, fileName = '') => {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) throw new Error('El archivo está vacío o no tiene datos')

  const headers = splitLine(lines[0])
  const cols = mapColumns(headers)
  if (cols.code === undefined || cols.section === undefined || cols.horario === undefined) {
    throw new Error('Faltan columnas: Asignatura, Sección u Horario')
  }

  const courses = {}

  for (let i = 1; i < lines.length; i++) {
    const row = splitLine(lines[i])
    const code = get(row, cols.code)
    const section = get(row, cols.section)
    const horarioRaw = get(row, cols.horario)
    const eventType = get(row, cols.event)

    if (!code || !section || !horarioRaw) continue
    if (!/^[A-Z]{2,4}\d{4}/i.test(code)) continue

    const slots = parseHorario(horarioRaw)
    if (!slots.length) continue

    if (!courses[code]) {
      courses[code] = {
        code,
        name: get(row, cols.name) || code,
        credits: get(row, cols.credits),
        sections: {},
      }
    }

    if (!courses[code].sections[section]) {
      courses[code].sections[section] = {
        label: section,
        package: get(row, cols.package),
        events: [],
      }
    }

    courses[code].sections[section].events.push({
      eventType: eventType || 'CLASE',
      horarioRaw,
      professor: get(row, cols.professor),
      campus: get(row, cols.campus),
      slots,
    })
  }

  const courseList = Object.values(courses)
  if (!courseList.length) throw new Error('No se encontraron ramos válidos. Verifica que el CSV tenga columnas Asignatura, Sección y Horario.')

  return {
    uploadedAt: Date.now(),
    fileName,
    courses,
    courseList: courseList.sort((a, b) => a.name.localeCompare(b.name, 'es')),
  }
}

export const buildScheduleFromOffering = (offering, selections) => {
  const blocks = []
  for (const [code, sectionLabel] of Object.entries(selections)) {
    if (!sectionLabel) continue
    const course = offering.courses[code]
    const section = course?.sections[sectionLabel]
    if (!section) continue

    for (const event of section.events) {
      for (const slot of event.slots) {
        blocks.push({
          id: `${code}-${sectionLabel}-${event.eventType}-${slot.day}-${slot.startTime}`.replace(/\W+/g, '_'),
          subject: course.name,
          courseCode: code,
          courseName: course.name,
          section: sectionLabel,
          eventType: event.eventType,
          professor: event.professor,
          campus: event.campus,
          day: slot.day,
          startTime: slot.startTime,
          endTime: slot.endTime,
          location: event.campus || '',
          fromOffering: true,
        })
      }
    }
  }
  return blocks.sort((a, b) => a.day - b.day || a.startTime.localeCompare(b.startTime))
}

export const applyOfferingToSchedule = (offering, selections, currentSchedule) => {
  const manual = currentSchedule.filter(b => !b.fromOffering)
  const fromOffering = buildScheduleFromOffering(offering, selections)
  return [...manual, ...fromOffering].sort((a, b) => a.day - b.day || a.startTime.localeCompare(b.startTime))
}

export const shortEventType = (t = '') => {
  const u = t.toUpperCase()
  if (u.includes('CATEDRA')) return 'Cátedra'
  if (u.includes('AYUDANTIA')) return 'Ayudantía'
  if (u.includes('LABORATORIO')) return 'Laboratorio'
  return t.split(' ')[0] || 'Clase'
}
