import * as XLSX from 'xlsx'
import { parseAcademicOffering } from '../../client/src/offeringParser.js'
import { UDP_OA_BASE, UDP_OA_LABEL, UDP_CAREER_BY_ID } from './udpCareers.js'
import { httpError } from './auth.js'

const CACHE_MS = 6 * 60 * 60 * 1000
const cache = new Map()

export const xlsBufferToCsv = (buf) => {
  const workbook = XLSX.read(buf, { type: 'buffer', raw: false })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  if (!sheet) throw httpError(502, 'El archivo de la UDP no tiene hojas')
  return XLSX.utils.sheet_to_csv(sheet)
}

export const csvToOffering = (csv, career) => {
  const parsed = parseAcademicOffering(csv, `${career.name} · ${UDP_OA_LABEL}`)
  parsed.careerId = career.id
  parsed.careerName = career.name
  parsed.source = UDP_OA_BASE + career.file
  return parsed
}

export async function loadCareerOffering(id, { fetchImpl = fetch } = {}) {
  const career = UDP_CAREER_BY_ID[id]
  if (!career) throw httpError(404, 'Carrera no encontrada')

  const hit = cache.get(id)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.payload

  const res = await fetchImpl(UDP_OA_BASE + career.file, {
    headers: { 'User-Agent': 'MiOrganizador/2.0 (oferta academica UDP)' },
    redirect: 'follow',
    signal: AbortSignal.timeout(25000),
  })
  if (!res.ok) throw httpError(502, `No se pudo descargar la oferta (${res.status})`)

  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length < 8) throw httpError(502, 'El archivo de la UDP llegó vacío')

  const offering = csvToOffering(xlsBufferToCsv(buf), career)
  const payload = { career: { id: career.id, name: career.name, faculty: career.faculty }, offering }
  cache.set(id, { at: Date.now(), payload })
  return payload
}

export const clearOfferingCache = () => cache.clear()
