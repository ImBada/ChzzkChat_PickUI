import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canControl,
  isLoopbackAddress,
  isLoopbackHost,
} from '../server/controlAuth.js'

const localRequest = {
  remoteAddress: '127.0.0.1',
  requestHost: 'localhost:3001',
  forwarded: false,
  allowLocalFallback: true,
}

test('allows zero-config control only from loopback addresses', () => {
  assert.equal(canControl('', undefined, localRequest), true)
  assert.equal(canControl('', undefined, {
    ...localRequest,
    remoteAddress: '::1',
  }), true)
  assert.equal(canControl('', undefined, {
    ...localRequest,
    remoteAddress: '::ffff:127.0.0.1',
  }), true)
  assert.equal(canControl('', undefined, {
    ...localRequest,
    remoteAddress: '192.168.0.20',
  }), false)
})

test('requires the configured token even for a local client', () => {
  assert.equal(canControl('secret', undefined, localRequest), false)
  assert.equal(canControl('secret', 'wrong', localRequest), false)
  assert.equal(canControl('secret', 'secret', localRequest), true)
  assert.equal(canControl('secret', 'secret', {
    remoteAddress: '203.0.113.10',
    requestHost: 'overlay.example.com',
    forwarded: true,
    allowLocalFallback: false,
  }), true)
})

test('rejects proxied or non-loopback-host requests without a token', () => {
  assert.equal(canControl('', undefined, {
    ...localRequest,
    forwarded: true,
  }), false)
  assert.equal(canControl('', undefined, {
    ...localRequest,
    requestHost: 'overlay.example.com',
  }), false)
  assert.equal(canControl('', undefined, {
    ...localRequest,
    requestHost: undefined,
  }), false)
})

test('requires a configured token when local fallback is disabled', () => {
  assert.equal(canControl('', undefined, {
    ...localRequest,
    allowLocalFallback: false,
  }), false)
})

test('recognizes only loopback address forms', () => {
  assert.equal(isLoopbackAddress('127.1.2.3'), true)
  assert.equal(isLoopbackAddress('[::1]'), true)
  assert.equal(isLoopbackAddress('::ffff:127.0.0.1'), true)
  assert.equal(isLoopbackAddress('::ffff:192.168.0.1'), false)
  assert.equal(isLoopbackAddress('localhost'), false)
})

test('recognizes loopback host headers with optional ports', () => {
  assert.equal(isLoopbackHost('localhost:3001'), true)
  assert.equal(isLoopbackHost('127.0.0.1:3001'), true)
  assert.equal(isLoopbackHost('[::1]:3001'), true)
  assert.equal(isLoopbackHost('overlay.example.com'), false)
  assert.equal(isLoopbackHost(undefined), false)
})
