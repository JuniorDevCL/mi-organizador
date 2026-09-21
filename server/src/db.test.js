import test from 'node:test'
import assert from 'node:assert/strict'
import { postgresSsl } from './db.js'

test('Postgres verifica TLS salvo localhost o override', () => {
  assert.equal(postgresSsl('postgres://u:p@localhost:5432/db'), false)
  assert.deepEqual(postgresSsl('postgres://u:p@ep-neon.aws.com/db', {}), { rejectUnauthorized: true })
  assert.deepEqual(
    postgresSsl('postgres://u:p@ep-neon.aws.com/db', { DATABASE_SSL_INSECURE: '1' }),
    { rejectUnauthorized: false },
  )
})
