import test from 'node:test'
import assert from 'node:assert/strict'
import { parseAdminEmails, isAdminEmail } from './auth.js'

test('parsea uno o varios correos de admin', () => {
  assert.deepEqual(parseAdminEmails('Alexis@Mail.udp.cl'), ['alexis@mail.udp.cl'])
  assert.deepEqual(
    parseAdminEmails('a@x.cl, B@y.cl; c@z.cl'),
    ['a@x.cl', 'b@y.cl', 'c@z.cl'],
  )
  assert.deepEqual(parseAdminEmails(''), [])
  assert.deepEqual(parseAdminEmails('no-es-correo'), [])
})

test('reconoce el correo de admin sin importar mayúsculas', () => {
  const admins = parseAdminEmails('dueno@udp.cl')
  assert.equal(isAdminEmail('Dueno@Udp.cl', admins), true)
  assert.equal(isAdminEmail('otro@udp.cl', admins), false)
})
