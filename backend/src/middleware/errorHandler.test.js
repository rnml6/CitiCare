import test from 'node:test'
import assert from 'node:assert/strict'
import { errorHandler } from './errorHandler.js'

const makeResponse = () => ({
  headersSent: false,
  statusCode: 200,
  body: null,
  status(code) { this.statusCode = code; return this },
  json(body) { this.body = body; return this },
})

const silenceConsole = (fn) => {
  const originalError = console.error
  const originalWarn = console.warn
  console.error = () => {}
  console.warn = () => {}
  try { return fn() } finally {
    console.error = originalError
    console.warn = originalWarn
  }
}

test('500 errors hide internal messages and stacks from clients', () => {
  silenceConsole(() => {
    const res = makeResponse()
    errorHandler(new Error('database password rejected'), { method: 'GET', originalUrl: '/api/test' }, res)
    assert.equal(res.statusCode, 500)
    assert.deepEqual(res.body, { success: false, message: 'Internal server error' })
    assert.equal(JSON.stringify(res.body).includes('database password'), false)
    assert.equal('stack' in res.body, false)
  })
})

test('client errors keep a safe message and malformed JSON becomes 400', () => {
  silenceConsole(() => {
    const res = makeResponse()
    const error = new SyntaxError('Unexpected token')
    error.type = 'entity.parse.failed'
    errorHandler(error, { method: 'POST', originalUrl: '/api/auth/login' }, res)
    assert.equal(res.statusCode, 400)
    assert.equal(res.body.message, 'Request body contains invalid JSON.')
    assert.equal('stack' in res.body, false)
  })
})

test('oversized bodies become 413 and custom validation errors are preserved', () => {
  silenceConsole(() => {
    const tooLarge = makeResponse()
    const error = new Error('too big')
    error.type = 'entity.too.large'
    errorHandler(error, { method: 'POST' }, tooLarge)
    assert.equal(tooLarge.statusCode, 413)

    const validation = makeResponse()
    const validationError = new Error('Please correct the highlighted fields.')
    validationError.statusCode = 400
    validationError.errors = { name: 'Name is required.' }
    errorHandler(validationError, { method: 'POST' }, validation)
    assert.equal(validation.statusCode, 400)
    assert.deepEqual(validation.body.errors, { name: 'Name is required.' })
  })
})
