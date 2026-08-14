import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  SHARED_CALENDAR_EMAIL,
  calendarAclResource,
  isValidShareEmail,
  isAlreadySharedError,
  isInsufficientScopeError,
} from './calendarShare.js'

describe('calendar share helpers', () => {
  it('targets the requested Gmail account', () => {
    assert.equal(SHARED_CALENDAR_EMAIL, 'jperezpavez03@gmail.com')
    assert.equal(isValidShareEmail(SHARED_CALENDAR_EMAIL), true)
  })

  it('builds an ACL that grants write access to that user', () => {
    assert.deepEqual(calendarAclResource('  jperezpavez03@gmail.com '), {
      role: 'writer',
      scope: { type: 'user', value: 'jperezpavez03@gmail.com' },
    })
  })

  it('treats duplicate ACL as already shared', () => {
    assert.equal(isAlreadySharedError({ status: 409 }), true)
    assert.equal(isAlreadySharedError({ result: { error: { errors: [{ reason: 'duplicate' }] } } }), true)
  })

  it('detects missing OAuth calendar scope', () => {
    assert.equal(isInsufficientScopeError({ status: 403, message: 'Insufficient Permission' }), true)
    assert.equal(isInsufficientScopeError({ status: 401, message: 'Invalid' }), false)
  })
})
