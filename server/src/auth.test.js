import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseAdminEmails, isAdminEmail,
  parseAllowedEmailDomains, isCampusEmail, campusEmailError,
} from './auth.js'

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

test('por defecto solo acepta correos UDP', () => {
  assert.deepEqual(parseAllowedEmailDomains(null), ['udp.cl'])
  assert.deepEqual(parseAllowedEmailDomains(''), ['udp.cl'])
  assert.deepEqual(parseAllowedEmailDomains('Mail.udp.cl, @udp.cl'), ['mail.udp.cl', 'udp.cl'])
  assert.equal(isCampusEmail('ana@mail.udp.cl', ['udp.cl']), true)
  assert.equal(isCampusEmail('Profe@UDP.cl', ['udp.cl']), true)
  assert.equal(isCampusEmail('alguien@gmail.com', ['udp.cl']), false)
  assert.equal(isCampusEmail('alguien@udp.cl.evil.com', ['udp.cl']), false)
  assert.equal(isCampusEmail('alguien@notudp.cl', ['udp.cl']), false)
  assert.match(campusEmailError(['udp.cl']), /@mail\.udp\.cl/)
})
