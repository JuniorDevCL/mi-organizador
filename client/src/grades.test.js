import test from 'node:test'
import assert from 'node:assert/strict'
import { finalGrade, presentationAverage, emptyCourse } from './grades.js'

test('promedia la nota de presentación con ponderaciones', () => {
  const { np, complete } = presentationAverage([
    { weight: 30, grade: 5 },
    { weight: 30, grade: 6 },
    { weight: 40, grade: 4 },
  ])
  assert.equal(np, 4.9)
  assert.equal(complete, true)
})

test('exime si la NP llega al umbral', () => {
  const result = finalGrade({
    items: [{ weight: 100, grade: 5.5 }],
    examWeight: 30,
    exemptAt: 5,
  })
  assert.equal(result.status, 'eximido')
  assert.equal(result.nf, 5.5)
})

test('mezcla NP y examen 70/30', () => {
  const result = finalGrade({
    items: [{ weight: 100, grade: 4.0 }],
    examGrade: 7,
    examWeight: 30,
    exemptAt: 5,
    failBelow: 3.5,
  })
  assert.equal(result.status, 'aprobado')
  assert.equal(result.nf, 4.9)
})

test('el curso vacío tiene pesos que suman 100', () => {
  const course = emptyCourse('IA')
  const sum = course.items.reduce((n, item) => n + item.weight, 0)
  assert.equal(sum, 100)
})
