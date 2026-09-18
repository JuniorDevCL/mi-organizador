import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  dateKey,
  dayOfWeek,
  templateAppliesOnDay,
  greetingForHour,
  buildTasksFromTemplates,
  ensureDayChecklist,
  ALL_DAYS,
} from './checklist.js'

describe('checklist helpers', () => {
  it('formats date keys as YYYY-MM-DD', () => {
    assert.equal(dateKey(new Date(2026, 6, 29)), '2026-07-29')
  })

  it('resolves day of week from date string', () => {
    // 2026-07-29 is a Wednesday
    assert.equal(dayOfWeek('2026-07-29'), 3)
  })

  it('greeting depends on hour', () => {
    assert.equal(greetingForHour(8), 'Buenos días')
    assert.equal(greetingForHour(15), 'Buenas tardes')
    assert.equal(greetingForHour(21), 'Buenas noches')
  })

  it('daily templates apply every day', () => {
    const t = { recurrence: 'daily', days: ALL_DAYS }
    assert.equal(templateAppliesOnDay(t, 0), true)
    assert.equal(templateAppliesOnDay(t, 3), true)
  })

  it('custom templates only apply on selected days', () => {
    const t = { recurrence: 'custom', days: [1, 3, 5] }
    assert.equal(templateAppliesOnDay(t, 3), true)
    assert.equal(templateAppliesOnDay(t, 2), false)
  })

  it('once templates never auto-apply', () => {
    assert.equal(templateAppliesOnDay({ recurrence: 'once', days: [] }, 3), false)
  })

  it('builds today tasks only from recurring templates', () => {
    let n = 0
    const makeId = () => `id-${++n}`
    const templates = [
      { id: 'a', name: 'Correr', emoji: '🏃', time: '07:00', recurrence: 'daily', days: ALL_DAYS },
      { id: 'b', name: 'Solo miércoles', emoji: '📚', time: '09:00', recurrence: 'custom', days: [3] },
      { id: 'c', name: 'Solo lunes', emoji: '🧘', time: '08:00', recurrence: 'custom', days: [1] },
    ]
    const tasks = buildTasksFromTemplates(templates, '2026-07-29', makeId)
    assert.equal(tasks.length, 2)
    assert.deepEqual(tasks.map(t => t.name), ['Correr', 'Solo miércoles'])
    assert.ok(tasks.every(t => t.done === false))
    assert.ok(tasks.every(t => t.templateId))
  })

  it('ensureDayChecklist does not overwrite an existing day', () => {
    const existing = [{ id: 'x', name: 'Ya estaba', done: true, templateId: null, emoji: '✨', time: '' }]
    const map = { '2026-07-29': existing }
    const next = ensureDayChecklist(
      [{ id: 'a', name: 'Nuevo', emoji: '🏃', time: '', recurrence: 'daily', days: ALL_DAYS }],
      map,
      '2026-07-29',
      () => 'new',
    )
    assert.equal(next['2026-07-29'], existing)
  })

  it('ensureDayChecklist generates a new day without copying one-off tasks', () => {
    let n = 0
    const makeId = () => `n-${++n}`
    const templates = [
      { id: 'daily', name: 'Agua', emoji: '💧', time: '', recurrence: 'daily', days: ALL_DAYS },
    ]
    const map = {
      '2026-07-28': [
        { id: 'once', name: 'Solo ayer', emoji: '✨', time: '', done: true, templateId: null },
        { id: 'from-daily', name: 'Agua', emoji: '💧', time: '', done: true, templateId: 'daily' },
      ],
    }
    const next = ensureDayChecklist(templates, map, '2026-07-29', makeId)
    assert.equal(next['2026-07-29'].length, 1)
    assert.equal(next['2026-07-29'][0].name, 'Agua')
    assert.equal(next['2026-07-29'][0].done, false)
    assert.ok(!next['2026-07-29'].some(t => t.name === 'Solo ayer'))
  })
})
