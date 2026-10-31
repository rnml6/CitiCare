import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'

let server
let baseUrl

test.before(async () => {
  process.env.NODE_ENV = 'test'
  const { default: app } = await import('./app.js')
  server = app.listen(0)
  await once(server, 'listening')
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

test.after(() => {
  server?.close()
})

test('health endpoint responds without authentication', async () => {
  const response = await fetch(`${baseUrl}/health`)
  const body = await response.json()
  assert.equal(response.status, 200)
  assert.equal(body.status, 'ok')
})

test('unknown routes return a JSON 404', async () => {
  const response = await fetch(`${baseUrl}/api/does-not-exist`)
  const body = await response.json()
  assert.equal(response.status, 404)
  assert.deepEqual(body, { success: false, message: 'Route not found' })
})

test('malformed JSON is a 400 with no stack trace', async () => {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{',
  })
  const body = await response.json()
  assert.equal(response.status, 400)
  assert.equal(body.message, 'Request body contains invalid JSON.')
  assert.equal('stack' in body, false)
})

test('oversized request bodies are rejected with 413', async () => {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload: 'x'.repeat(1024 * 1024 + 100) }),
  })
  const body = await response.json()
  assert.equal(response.status, 413)
  assert.equal(body.message, 'Request body is too large.')
})

test('login validation returns structured field errors before touching the database', async () => {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: '', password: '' }),
  })
  const body = await response.json()
  assert.equal(response.status, 400)
  assert.equal(body.success, false)
  assert.equal(body.errors.email, 'Email or username is required.')
  assert.equal(body.errors.password, 'Password is required.')
})
