/**
 * Descarga comercios Pluxee Alimentación (PRIVADO) para Santiago RM.
 * Uso: node scripts/fetch-pluxee-santiago.mjs
 */
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dir, '../public/data/pluxee-santiago.json')
const API = 'https://www.pluxee.cl/merchant-finder/api/merchants/merchant-summary'
const CENTER = '-33.4489;-70.6693'
const PER_PAGE = 500

const SANTIAGO_BBOX = { minLat: -33.75, maxLat: -33.15, minLng: -70.95, maxLng: -70.40 }

const CATEGORY_ES = {
  CATEGORY_RESTAURANT: 'Restaurantes',
  CATEGORY_FOOD_COURT: 'Patio de comida',
  CATEGORY_SUPERMARKET: 'Supermercados',
  CATEGORY_MINI_MARKET: 'Minimarket',
  CATEGORY_CASINO: 'Casinos',
  CATEGORY_GREEN_POINT: 'Puntos verdes',
  CATEGORY_BLUE_POINT: 'Puntos Azules',
}

const normalize = (row) => ({
  id: row.id,
  name: row.name,
  address: row.streetAddress || '',
  locality: row.addressLocality || '',
  region: row.addressRegion || '',
  category: CATEGORY_ES[row.mainCategoryLabel] || row.mainCategoryLabel?.replace('CATEGORY_', '').replace(/_/g, ' ') || 'Otro',
  lat: parseFloat(row.latitude),
  lng: parseFloat(row.longitude),
})

const inSantiago = (m) =>
  m.region === 'Metropolitana' &&
  m.lat >= SANTIAGO_BBOX.minLat && m.lat <= SANTIAGO_BBOX.maxLat &&
  m.lng >= SANTIAGO_BBOX.minLng && m.lng <= SANTIAGO_BBOX.maxLng

async function fetchPage(page) {
  const params = new URLSearchParams({
    location: CENTER,
    pluxeeProducts: 'PRIVADO',
    merchantTypes: 'PHYSICAL',
    page: String(page),
    perPage: String(PER_PAGE),
  })
  const res = await fetch(`${API}?${params}`)
  if (!res.ok) throw new Error(`page ${page}: ${await res.text()}`)
  const data = await res.json()
  return data.results || []
}

const map = new Map()
let page = 1
while (true) {
  console.log(`Página ${page}…`)
  const rows = await fetchPage(page)
  if (!rows.length) break
  for (const row of rows) {
    const m = normalize(row)
    if (Number.isFinite(m.lat) && Number.isFinite(m.lng) && inSantiago(m)) {
      map.set(m.id, m)
    }
  }
  if (rows.length < PER_PAGE) break
  page += 1
  await new Promise(r => setTimeout(r, 300))
}

const merchants = [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'))
const payload = {
  product: 'Pluxee Alimentación',
  region: 'Santiago (Región Metropolitana)',
  lastUpdated: new Date().toISOString(),
  count: merchants.length,
  merchants,
}

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify(payload, null, 2))
console.log(`Guardado ${merchants.length} locales en ${OUT}`)
