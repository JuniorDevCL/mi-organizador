import { SOLEMNES_SLOTS } from './solemnesData.js'

export { SOLEMNES_SLOTS }

export const SOLEMNES_META = {
  term: '2026-2',
  label: 'Semana de solemnes 24–30 sept 2026',
  rangeLabel: '24–30 sept 2026',
  schoolNote: 'Ingeniería UDP (EIT, EII y EOC)',
  sourceNote: 'Calendario oficial de solemnes de Ingeniería, cruzado con tus ramos.',
}

export const SOLEMNES_DAYS = {
  1: { date: '2026-09-24', title: 'Jueves 24 sept', weekday: 'Jueves' },
  2: { date: '2026-09-25', title: 'Viernes 25 sept', weekday: 'Viernes' },
  3: { date: '2026-09-28', title: 'Lunes 28 sept', weekday: 'Lunes' },
  4: { date: '2026-09-29', title: 'Martes 29 sept', weekday: 'Martes' },
  5: { date: '2026-09-30', title: 'Miércoles 30 sept', weekday: 'Miércoles' },
}

const SCHOOLS = ['EIT', 'EII', 'EOC']
const STOP = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'en', 'a', 'al', 'un', 'una', 'para', 'con', 'por'])

const SCHOOL_BY_CAREER = {
  ing_civil_en_infor_y_tel: 'EIT',
  ing_en_informatica_y_gestion: 'EIT',
  ing_civil_industrial: 'EII',
  ing_civil_en_obras_civiles: 'EOC',
  ing_civil: 'EOC',
}

export const normalizeName = (value) => String(value || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/\p{Diacritic}/gu, '')
  .replace(/['"“”‘’]/g, '')
  .replace(/[./,;:()[\]{}]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

export const extractSchools = (name) => {
  const found = new Set()
  const text = String(name || '')
  const paren = [...text.matchAll(/\(([^)]+)\)/g)].map((m) => m[1].toUpperCase())
  for (const chunk of paren) {
    for (const school of SCHOOLS) {
      if (chunk.split(/[^A-Z]+/).includes(school)) found.add(school)
    }
  }
  return [...found]
}

export const stripSchoolTags = (name) => String(name || '')
  .replace(/\s*\((?=[^)]*(?:EIT|EII|EOC))[^)]*\)\s*/gi, ' ')
  .replace(/\s+/g, ' ')
  .trim()

const keepToken = (t) => {
  if (!t || STOP.has(t)) return false
  if (/^[ivx]+$/.test(t) || /^\d+$/.test(t)) return true
  return t.length > 1
}

const tokens = (normalized) => normalized.split(' ').filter(keepToken)

const tokenFits = (needle, haystack) => haystack.some((tok) => {
  if (tok === needle) return true
  if (needle.length <= 2 || tok.length <= 2) return false
  return (needle.length >= 3 && tok.startsWith(needle)) || (tok.length >= 3 && needle.startsWith(tok))
})

const isNumberish = (t) => /^[ivx]+$/.test(t) || /^\d+$/.test(t)

const numbersAlign = (a, b) => {
  const left = a.filter(isNumberish)
  const right = b.filter(isNumberish)
  if (!left.length && !right.length) return true
  if (left.length !== right.length) return false
  return left.every((tok, i) => tok === right[i])
}

const tokensAlign = (a, b) => {
  if (!a.length || !b.length || !numbersAlign(a, b)) return false
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a]
  return shorter.every((tok) => tokenFits(tok, longer))
}

export const levenshtein = (a, b) => {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i += 1) {
    let prev = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      const tmp = row[j]
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost)
      prev = tmp
    }
  }
  return row[b.length]
}

const examAliases = (examName) => {
  const aliases = []
  const add = (value) => {
    const n = normalizeName(stripSchoolTags(value))
    if (n && !aliases.includes(n)) aliases.push(n)
  }
  add(examName)
  const stripped = stripSchoolTags(examName)
  for (const part of stripped.split('/')) add(part)
  for (const quoted of examName.matchAll(/"([^"]+)"/g)) add(quoted[1])
  const electivo = stripped.replace(/^electivo\s+(?:eii|eit|eoc|profesional)\s*:?\s*/i, '').trim()
  if (electivo) add(electivo)
  return aliases
}

const isGenericElectivo = (examName) => {
  const n = normalizeName(stripSchoolTags(examName))
  return n === 'electivo profesional'
}

export const namesMatch = (examName, courseName) => {
  const course = normalizeName(stripSchoolTags(courseName))
  if (!course) return false
  const courseToks = tokens(course)

  for (const alias of examAliases(examName)) {
    if (alias === course) return true

    const aToks = tokens(alias)
    if (!aToks.length || !courseToks.length) continue
    if (aToks.length === courseToks.length && tokensAlign(aToks, courseToks)) return true
    const shorter = aToks.length < courseToks.length ? aToks : courseToks
    const longer = aToks.length < courseToks.length ? courseToks : aToks
    const ratio = shorter.length / longer.length
    if (ratio >= 0.75 && tokensAlign(aToks, courseToks)) return true

    const compactA = aToks.join('')
    const compactC = courseToks.join('')
    const maxLen = Math.max(compactA.length, compactC.length)
    if (maxLen >= 8 && numbersAlign(aToks, courseToks)) {
      const dist = levenshtein(compactA, compactC)
      if (dist <= 2 || dist / maxLen <= 0.12) return true
    }
  }
  return false
}

export const schoolFromCareerId = (careerId) => SCHOOL_BY_CAREER[careerId] || ''

export const collectCourses = (courseOptions = [], schedule = []) => {
  const out = []
  const seen = new Set()
  const add = (name, code = '') => {
    const label = String(name || '').trim()
    if (!label) return
    const key = normalizeName(label)
    if (!key || seen.has(key)) return
    seen.add(key)
    out.push({ name: label, code: code || '' })
  }
  for (const course of courseOptions) add(course.name, course.code)
  for (const block of schedule) add(block.courseName || block.subject, block.courseCode)
  return out
}

const slug = (name) => normalizeName(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48)

export const examEventId = (date, start, examName) =>
  `sol-${date}-${String(start).replace(':', '')}-${slug(examName)}`

export const minutesBetween = (start, end) => {
  const [sh, sm] = String(start).split(':').map(Number)
  const [eh, em] = String(end).split(':').map(Number)
  return (eh * 60 + em) - (sh * 60 + sm)
}

const matchCourse = (examName, courses, school) => {
  const examSchools = extractSchools(examName)
  if (school && examSchools.length && !examSchools.includes(school)) return null
  if (isGenericElectivo(examName) && school && examSchools.length && !examSchools.includes(school)) return null

  let best = null
  for (const course of courses) {
    if (!namesMatch(examName, course.name)) continue
    if (isGenericElectivo(examName) && normalizeName(stripSchoolTags(course.name)) !== 'electivo profesional') continue
    const score = normalizeName(stripSchoolTags(course.name)).length
    if (!best || score > best.score) best = { course, score }
  }
  return best?.course || null
}

export const matchSolemnes = (courses, { school = '', query = '' } = {}) => {
  const q = normalizeName(query)
  const mine = []
  const days = SOLEMNES_SLOTS.reduce((acc, slot) => {
    const day = acc.get(slot.day) || {
      day: slot.day,
      date: slot.date,
      ...SOLEMNES_DAYS[slot.day],
      slots: [],
    }
    const exams = slot.courses.map((examName) => {
      const course = matchCourse(examName, courses, school)
      const exam = {
        id: examEventId(slot.date, slot.start, examName),
        day: slot.day,
        date: slot.date,
        start: slot.start,
        end: slot.end,
        dayLabel: SOLEMNES_DAYS[slot.day]?.title || slot.date,
        examName,
        schools: extractSchools(examName),
        matched: Boolean(course),
        courseName: course?.name || '',
        courseCode: course?.code || '',
      }
      if (exam.matched && (!q || normalizeName(exam.examName).includes(q) || normalizeName(exam.courseName).includes(q))) {
        mine.push(exam)
      }
      return exam
    }).filter((exam) => {
      if (!q) return true
      return normalizeName(exam.examName).includes(q) || normalizeName(exam.courseName).includes(q)
    })
    day.slots.push({
      start: slot.start,
      end: slot.end,
      exams,
      hasMatch: exams.some((exam) => exam.matched),
    })
    acc.set(slot.day, day)
    return acc
  }, new Map())

  mine.sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start) || a.examName.localeCompare(b.examName, 'es'))
  return { days: [...days.values()].sort((a, b) => a.day - b.day), mine }
}

export const toCalendarEvent = (exam) => ({
  id: exam.id,
  title: `Solemne — ${exam.courseName || exam.examName}`,
  type: 'solemne',
  date: exam.date,
  time: exam.start,
  duration: minutesBetween(exam.start, exam.end),
  description: `${exam.examName}\n${exam.dayLabel} · ${exam.start}–${exam.end}\n${SOLEMNES_META.sourceNote}`,
  subject: exam.courseName || exam.examName,
  courseCode: exam.courseCode || '',
  synced: false,
  fromSchedule: false,
  fromSolemnes: true,
  isPersonal: false,
  createdAt: Date.now(),
})

export const isInAgenda = (events, exam) => (events || []).some((ev) => {
  if (ev.id === exam.id) return true
  if (ev.type !== 'solemne' || ev.date !== exam.date) return false
  const time = String(ev.time || '').slice(0, 5)
  if (time && time !== exam.start) return false
  const subject = ev.subject || String(ev.title || '').replace(/^solemne\s*[—–-]\s*/i, '')
  return namesMatch(exam.examName, subject) || (exam.courseName && namesMatch(exam.examName, exam.courseName) && namesMatch(subject, exam.courseName))
})
