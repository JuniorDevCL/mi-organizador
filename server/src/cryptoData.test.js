import test from 'node:test'
import assert from 'node:assert/strict'
import { openJson, sealJson } from './cryptoData.js'

test('cifra JSON y lo vuelve a leer', () => {
  const sealed = sealJson({ title: 'Control' }, 'clave')
  assert.match(sealed, /^enc:v1:/)
  assert.equal(sealed.includes('Control'), false)
  assert.deepEqual(openJson(sealed, 'clave'), { title: 'Control' })
})

test('sigue leyendo valores viejos en claro', () => {
  assert.deepEqual(openJson('{"ok":true}', 'clave'), { ok: true })
})

test('rechaza un secreto distinto', () => {
  const sealed = sealJson({ n: 1 }, 'a')
  assert.equal(openJson(sealed, 'b'), null)
})
