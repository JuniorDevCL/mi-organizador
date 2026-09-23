import test from 'node:test'
import assert from 'node:assert/strict'
import { checklistPulse, relativeDayLabel, todayClasses, upcomingEvents } from './dashboard.js'

const wednesday = new Date(2026, 8, 23, 11, 40)

test('arma el horario de hoy y marca la clase en curso', () => {
  const day = todayClasses([
    { id: 'b', day: 3, startTime: '14:00', endTime: '15:20', subject: 'Álgebra' },
    { id: 'a', day: 3, startTime: '11:30', endTime: '12:50', subject: 'IA' },
    { id: 'c', day: 4, startTime: '08:30', endTime: '09:50', subject: 'Física' },
  ], wednesday)
  assert.equal(day.weekend, false)
  assert.deepEqual(day.blocks.map((block) => block.subject), ['IA', 'Álgebra'])
  assert.equal(day.current.subject, 'IA')
  assert.equal(day.next.subject, 'Álgebra')
})

test('el fin de semana no inventa clases', () => {
  const sunday = new Date(2026, 8, 27, 10, 0)
  const day = todayClasses([
    { id: 'a', day: 1, startTime: '08:30', endTime: '09:50', subject: 'IA' },
  ], sunday)
  assert.equal(day.weekend, true)
  assert.equal(day.blocks.length, 0)
  assert.equal(day.current, null)
})

test('deja fuera eventos pasados y los que quedan lejos', () => {
  const { items, total } = upcomingEvents([
    { id: 'past', title: 'Ayer', date: '2026-09-22', time: '10:00' },
    { id: 'today', title: 'Control', date: '2026-09-23', time: '18:00' },
    { id: 'soon', title: 'Solemne', date: '2026-09-30', time: '09:00' },
    { id: 'far', title: 'Lejos', date: '2026-11-01', time: '09:00' },
  ], wednesday, { withinDays: 14, limit: 5 })
  assert.equal(total, 2)
  assert.deepEqual(items.map((event) => event.id), ['today', 'soon'])
  assert.equal(relativeDayLabel('2026-09-23', wednesday), 'Hoy')
  assert.equal(relativeDayLabel('2026-09-24', wednesday), 'Mañana')
})

test('un evento de hoy sin hora sigue contando hasta que termina el día', () => {
  const evening = new Date(2026, 8, 23, 21, 0)
  const { total } = upcomingEvents([
    { id: 'all', title: 'Entrega', date: '2026-09-23' },
  ], evening)
  assert.equal(total, 1)
})

test('resume el checklist con la próxima tarea pendiente', () => {
  const pulse = checklistPulse([
    { id: '1', name: 'Gym', time: '18:00', done: false },
    { id: '2', name: 'Leer', time: '08:00', done: true },
    { id: '3', name: 'Correo', time: '09:30', done: false },
  ])
  assert.equal(pulse.done, 1)
  assert.equal(pulse.total, 3)
  assert.equal(pulse.pct, 33)
  assert.equal(pulse.next.name, 'Correo')
})
