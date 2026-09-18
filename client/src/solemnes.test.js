import test from 'node:test'
import assert from 'node:assert/strict'
import {
  collectCourses,
  examEventId,
  extractSchools,
  isInAgenda,
  matchSolemnes,
  namesMatch,
  schoolFromCareerId,
  toCalendarEvent,
} from './solemnes.js'

test('distingue ramos con el mismo nombre y escuela distinta', () => {
  const eit = collectCourses([{ name: 'Data Science', code: 'CIT9999' }])
  const eii = collectCourses([{ name: 'Data Science', code: 'CII9999' }])
  const mineEit = matchSolemnes(eit, { school: 'EIT' }).mine
  const mineEii = matchSolemnes(eii, { school: 'EII' }).mine
  assert.equal(mineEit.length, 1)
  assert.equal(mineEit[0].examName, 'Data Science (EIT)')
  assert.equal(mineEit[0].date, '2026-09-25')
  assert.equal(mineEit[0].start, '10:45')
  assert.equal(mineEii[0].examName, 'Data Science (EII)')
  assert.equal(mineEii[0].start, '08:30')
})

test('no confunde Programación con Programación Avanzada', () => {
  const mine = matchSolemnes(collectCourses([{ name: 'Programación' }])).mine
  assert.equal(mine.length, 1)
  assert.equal(mine[0].examName, 'Programación')
  assert.equal(mine[0].start, '13:00')
})

test('resuelve alias de cálculo y álgebra', () => {
  const mine = matchSolemnes(collectCourses([
    { name: 'Cálculo I', code: 'CBM1000' },
    { name: 'Álgebra y Geometría', code: 'CBM1001' },
  ])).mine.map((item) => item.examName).sort()
  assert.deepEqual(mine, [
    'Introducción al Cálculo/Cálculo I',
    'Introducción al Álgebra / Álgebra y Geometría',
  ].sort())
  assert.equal(namesMatch('Cálculo Dif. E Integral/Cálculo II', 'Cálculo I'), false)
  assert.equal(namesMatch('Cálculo III', 'Cálculo I'), false)
})

test('acepta abreviaciones típicas del calendario', () => {
  assert.equal(namesMatch('Estruct. De Datos y Algoritmos', 'Estructuras de Datos y Algoritmos'), true)
  assert.equal(namesMatch('Herramientas de prog. en ing ind.', 'Herramientas de programación en ingeniería industrial'), true)
  assert.equal(extractSchools('Probabilidades y Estadística (EII EOC)').sort().join(','), 'EII,EOC')
})

test('filtra Bases de Datos según la carrera', () => {
  assert.equal(schoolFromCareerId('ing_civil_en_infor_y_tel'), 'EIT')
  const mine = matchSolemnes(collectCourses([{ name: 'Bases de Datos' }]), { school: 'EIT' }).mine
  assert.equal(mine.length, 1)
  assert.equal(mine[0].examName, 'Bases de Datos (EIT)')
})

test('arma el evento de agenda con id estable y no duplica', () => {
  const [exam] = matchSolemnes(collectCourses([{ name: 'Inteligencia Artificial', code: 'CIT2012' }])).mine
  assert.equal(exam.id, examEventId(exam.date, exam.start, exam.examName))
  const ev = toCalendarEvent(exam)
  assert.equal(ev.type, 'solemne')
  assert.equal(ev.time, '15:15')
  assert.equal(ev.duration, 120)
  assert.equal(ev.courseCode, 'CIT2012')
  assert.equal(isInAgenda([ev], exam), true)
  assert.equal(isInAgenda([{ id: 'x', type: 'solemne', date: exam.date, time: exam.start, subject: 'Inteligencia Artificial' }], exam), true)
  assert.equal(isInAgenda([], exam), false)
})

test('junta ramos del horario y de la oferta', () => {
  const courses = collectCourses(
    [{ name: 'Redes de Datos', code: 'CIT2111' }],
    [{ subject: 'Sistemas Operativos', courseCode: 'CIT2110' }],
  )
  const names = matchSolemnes(courses).mine.map((item) => item.examName).sort()
  assert.deepEqual(names, ['Redes de Datos', 'Sistemas Operativos'])
})
