import test from 'node:test'
import assert from 'node:assert/strict'
import { publicSchedule } from './friends.js'

test('el horario público oculta profesor y sala', () => {
  assert.deepEqual(publicSchedule([
    {
      id: 'a1',
      day: 1,
      startTime: '11:30',
      endTime: '12:50',
      subject: 'IA',
      eventType: 'Cátedra',
      professor: 'Secreto',
      location: 'E441',
    },
  ]), [{
    id: 'a1',
    day: 1,
    startTime: '11:30',
    endTime: '12:50',
    subject: 'IA',
    eventType: 'Cátedra',
  }])
})
