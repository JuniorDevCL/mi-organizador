import test from 'node:test'
import assert from 'node:assert/strict'
import { CURRICULUM, matchSemesterCourses } from './curriculum.js'

test('la malla contiene once semestres y omite Inglés y CFG', () => {
  assert.equal(CURRICULUM.length, 11)
  const codes = CURRICULUM.flatMap(item => item.courses)
  assert.equal(codes.some(code => code.startsWith('CIG')), false)
  assert.equal(codes.some(code => code.startsWith('CFG')), false)
})

test('selecciona solo los ramos del semestre disponibles en la oferta', () => {
  const offering = {
    courses: {
      CIT2204: {},
      CIT2107: {},
      CBF1002: {},
      CIT2007: {},
    },
  }
  const result = matchSemesterCourses(offering, 4)
  assert.deepEqual(result.available, ['CIT2204', 'CIT2107', 'CBF1002', 'CIT2007'])
  assert.deepEqual(result.missing, ['CIT2008'])
})
