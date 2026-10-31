import test from 'node:test'
import assert from 'node:assert/strict'
import { createRateLimiter } from './rateLimit.js'

const makeResponse = () => {
  const listeners = {}
  return {
    statusCode: 200,
    headers: {},
    body: null,
    set(name, value) { this.headers[name] = value; return this },
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
    on(event, handler) { listeners[event] = handler; return this },
    finish() { listeners.finish?.() },
  }
}

test('rate limiter blocks attempts after the max and reports Retry-After', () => {
  let clock = 1_000
  const limiter = createRateLimiter({ max: 2, windowMs: 1_000, now: () => clock })
  const req = { ip: '127.0.0.1' }
  let calls = 0
  const next = () => { calls += 1 }

  limiter(req, makeResponse(), next)
  limiter(req, makeResponse(), next)
  assert.equal(calls, 2)

  clock = 1_100
  const res = makeResponse()
  limiter(req, res, next)
  assert.equal(calls, 2)
  assert.equal(res.statusCode, 429)
  assert.equal(res.body.success, false)
  assert.equal(res.headers['Retry-After'], '1')
  assert.match(res.body.errors.rateLimit, /Try again in 1 second/)
})

test('rate limiter resets after the window and successful responses clear the bucket', () => {
  let clock = 5_000
  const limiter = createRateLimiter({ max: 1, windowMs: 1_000, now: () => clock })
  const req = { ip: '10.0.0.1' }
  const next = () => {}

  const success = makeResponse()
  limiter(req, success, next)
  success.finish()
  assert.equal(limiter.buckets.size, 0)

  const failed = makeResponse()
  failed.statusCode = 401
  limiter(req, failed, next)
  failed.finish()
  assert.equal(limiter.buckets.size, 1)

  const blocked = makeResponse()
  limiter(req, blocked, next)
  assert.equal(blocked.statusCode, 429)

  clock = 7_000
  const allowed = makeResponse()
  limiter(req, allowed, next)
  assert.equal(allowed.statusCode, 200)
})
