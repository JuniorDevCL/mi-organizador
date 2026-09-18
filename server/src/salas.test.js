import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseSalasPayload, occupancyFor, weekForRoom, resolveBlock, toMinutes,
} from './salas.js'

const payload = {
  data: {
    allSalasUdps: {
      edges: [
        { node: { code: 'CIT2013', section: 2, course: 'IA', place: 'E441.2.S201', start: '11:30:00', finish: '12:50:00', day: 1, teacher: 'Reyes' } },
        { node: { code: 'CIT2112', section: 1, course: 'Inalambricas', place: 'E441.2.S201', start: '16:00:00', finish: '17:20:00', day: 1, teacher: 'Dujovne' } },
        { node: { code: 'CIT1000', section: 1, course: 'Programacion', place: 'V432.3.S312', start: '8:30:00', finish: '9:50:00', day: 1, teacher: 'Cruz' } },
      ],
    },
  },
}

test('marca una sala ocupada si el bloque se solapa', () => {
  const data = parseSalasPayload(payload)
  const result = occupancyFor(data, { day: 1, blockId: '11:30' })
  assert.equal(result.ocupadas['E441.2.S201'].curso, 'IA')
  assert.ok(result.vacias.includes('V432.3.S312'))
  assert.match(result.vacias_info['V432.3.S312'].texto, /resto del día/)
})

test('dice hasta cuándo sigue libre una sala', () => {
  const data = parseSalasPayload(payload)
  const result = occupancyFor(data, { day: 1, blockId: '08:30', query: 'E441' })
  assert.equal(result.vacias[0], 'E441.2.S201')
  assert.equal(result.vacias_info['E441.2.S201'].proxima_hora, '11:30')
  assert.equal(result.total_ocupadas, 0)
})

test('arma el horario semanal de una sala', () => {
  const data = parseSalasPayload(payload)
  const week = weekForRoom(data.classes, 'e441.2.s201')
  assert.equal(week.horario[1].length, 2)
  assert.equal(week.horario[1][0].start, '11:30')
})

test('resuelve bloques UDP', () => {
  assert.equal(resolveBlock('8:30:00').id, '08:30')
  assert.equal(toMinutes('17:25:00'), 17 * 60 + 25)
})
