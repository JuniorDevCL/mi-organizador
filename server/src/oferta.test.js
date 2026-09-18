import test from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import { catalogPayload, UDP_CAREERS, UDP_CAREER_BY_ID } from './udpCareers.js'
import { csvToOffering, xlsBufferToCsv, loadCareerOffering, clearOfferingCache } from './oferta.js'

const sampleRows = [
  ['Asignatura', 'Nombre Asig.', 'Créditos Asignatura', 'Sección', 'Descrip. Evento', 'Horario', 'Profesor', 'Sede'],
  ['CIT1010', 'PROGRAMACIÓN', '6', 'Sección 1', 'CÁTEDRA 01', 'LU JU 10:00 - 11:20', 'PROFE UNO', 'S-SANTIAGO'],
  ['CIT1010', 'PROGRAMACIÓN', '6', 'Sección 1', 'AYUDANTÍA OBLIGATORIA 01', 'MA 10:00 - 11:20', 'AYUDANTE', 'S-SANTIAGO'],
]

const sampleXlsx = () => {
  const sheet = XLSX.utils.aoa_to_sheet(sampleRows)
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, 'Sheet1')
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' })
}

test('el catálogo incluye las carreras UDP publicadas', () => {
  const catalog = catalogPayload()
  assert.ok(catalog.faculties.length >= 10)
  assert.ok(UDP_CAREERS.length >= 40)
  assert.equal(UDP_CAREER_BY_ID.ing_civil_en_infor_y_tel.name.includes('Informática'), true)
  assert.equal(
    catalog.faculties.some(f => f.careers.some(c => c.id === 'psicologia')),
    true,
  )
})

test('convierte un excel de oferta a ramos y secciones', () => {
  const csv = xlsBufferToCsv(sampleXlsx())
  const career = UDP_CAREER_BY_ID.ing_civil_en_infor_y_tel
  const offering = csvToOffering(csv, career)
  assert.equal(offering.courseList.length, 1)
  assert.ok(offering.courses.CIT1010.sections['Sección 1'])
  assert.equal(offering.courses.CIT1010.sections['Sección 1'].events.length, 2)
  assert.equal(offering.careerId, career.id)
})

test('descarga la oferta de una carrera con fetch inyectado', async () => {
  clearOfferingCache()
  const buf = sampleXlsx()
  const payload = await loadCareerOffering('ing_civil_en_infor_y_tel', {
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => buf,
    }),
  })
  assert.equal(payload.career.id, 'ing_civil_en_infor_y_tel')
  assert.equal(payload.offering.courseList.length, 1)
})

test('rechaza una carrera que no está en el catálogo', async () => {
  await assert.rejects(
    () => loadCareerOffering('carrera-inventada'),
    (err) => err.status === 404,
  )
})

test('lee ofertas UDP en SpreadsheetML (xml con extensión .xls)', () => {
  const xml = `<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<TEST_REPORT><Author>UDP</Author></TEST_REPORT>
<Worksheet ss:Name="Sheet1"><Table>
<Row><Cell><Data ss:Type="String">Asignatura</Data></Cell><Cell><Data ss:Type="String">Nombre Asig.</Data></Cell><Cell><Data ss:Type="String">Sección</Data></Cell><Cell><Data ss:Type="String">Descrip. Evento</Data></Cell><Cell><Data ss:Type="String">Horario</Data></Cell></Row>
<Row><Cell><Data ss:Type="String">PSI1000</Data></Cell><Cell><Data ss:Type="String">PSICOLOGÍA GENERAL</Data></Cell><Cell><Data ss:Type="String">Sección 1</Data></Cell><Cell><Data ss:Type="String">CÁTEDRA 01</Data></Cell><Cell><Data ss:Type="String">LU JU 10:00 - 11:20</Data></Cell></Row>
</Table></Worksheet></Workbook>`
  const csv = xlsBufferToCsv(Buffer.from(xml, 'utf8'))
  const offering = csvToOffering(csv, UDP_CAREER_BY_ID.psicologia)
  assert.equal(offering.courses.PSI1000.sections['Sección 1'].events.length, 1)
})
