import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildScheduleFromOffering,
  parseAcademicOffering,
  parseHorario,
} from './offeringParser.js'

test('parsea varios grupos horarios y distintos tipos de guion', () => {
  assert.deepEqual(parseHorario('LU JU 10:00 - 11:20 / VI 12:00 – 13:20'), [
    { day: 1, startTime: '10:00', endTime: '11:20' },
    { day: 4, startTime: '10:00', endTime: '11:20' },
    { day: 5, startTime: '12:00', endTime: '13:20' },
  ])
})

test('conserva todas las ayudantías y une filas repetidas por profesor', () => {
  const csv = [
    'Asignatura,Nombre Asig.,Sección,Descrip. Evento,Horario,Profesor,Sede,Paquete',
    'CBM1003,CÁLCULO II,Sección 4,CÁTEDRA 04,LU JU 08:30 - 09:50,PROFESOR UNO,S-SANTIAGO,CBM1003_VC04',
    'CBM1003,CÁLCULO II,Sección 4,AYUDANTÍA OBLIGATORIA 04,MA 08:30 - 09:50,AYUDANTE UNO,S-SANTIAGO,CBM1003_VC04',
    'CBM1003,CÁLCULO II,Sección 4,AYUDANTÍA OBLIGATORIA 04,MA 08:30 - 09:50,AYUDANTE DOS,S-SANTIAGO,CBM1003_VC04',
    'CBM1003,CÁLCULO II,Sección 4,AYUDANTÍA EXTRA 04,VI 14:30 - 15:50,AYUDANTE TRES,S-SANTIAGO,CBM1003_VC04',
  ].join('\n')

  const offering = parseAcademicOffering(csv, 'oferta.csv')
  const events = offering.courses.CBM1003.sections['Sección 4'].events
  assert.equal(events.length, 3)
  assert.equal(events[1].professor, 'AYUDANTE UNO / AYUDANTE DOS')

  const blocks = buildScheduleFromOffering(offering, { CBM1003: 'Sección 4' })
  assert.equal(blocks.length, 4)
  assert.equal(new Set(blocks.map(block => block.id)).size, 4)
  assert.equal(blocks.filter(block => block.eventType.includes('AYUDANTÍA')).length, 2)
})
