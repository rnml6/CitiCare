// Independent, exhaustive system test matrix.
//
// This suite complements `endpoints.test.js`: instead of one representative
// invalid payload per route, it probes field boundaries, enum values, numeric
// ranges, unknown-resource behaviour, middleware hardening, and query
// sanitization. It runs over real HTTP against the same in-memory Supabase
// double, so no production data or network database is touched.

import test, { mock } from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

import { getJwtSecret } from './config/auth.js'
import { createFakeSupabase } from './testUtils/fakeSupabase.js'
import { loginRateLimiter } from './middleware/rateLimit.js'

process.env.NODE_ENV = 'test'

const fake = createFakeSupabase()

mock.module('./config/supabase.js', {
  namedExports: {
    supabase: fake.supabase,
    supabaseClient: fake.supabaseClient
  }
})

const { default: app } = await import('./app.js')

const realFetch = globalThis.fetch
let recommendationData
globalThis.fetch = async (url, options) => {
  if (String(url).includes('generativelanguage.googleapis.com')) {
    const prompt = JSON.parse(options.body).contents[0].parts[0].text
    recommendationData = JSON.parse(prompt.split('\nDATA: ')[1].split('\n')[0])
    const payload = {
      summary: 'Test recommendation',
      keyFindings: ['22 consultations were missed in this period.', 'A separate finding.'],
      riskAreas: [],
      recommendations: [{
        action: 'Trace the 22 missed consultations.',
        targetGroup: '22 residents'
      }],
      predictedTrends: { nextMonth: '', concerns: [], positiveIndicators: [] },
      medicineDemandForecast: { forecasts: [] },
      priorityResidents: { recommendations: [{
        resident: 'Unrecorded resident',
        purok: 'Unrecorded purok',
        riskLevel: 'Critical Risk',
        intervention: 'Arrange an assessment.'
      }] },
      purokPriority: { rankings: [{ purok: 'Unrecorded purok', priority: 'Critical' }] },
      healthProgramRecommendation: { programs: [] }
    }
    return new Response(
      JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  }
  return realFetch(url, options)
}

let server
let baseUrl
let passwordHash

const tokenFor = (payload, options = { expiresIn: '1h' }) =>
  jwt.sign(payload, getJwtSecret(), options)

const adminToken = tokenFor({
  userId: 'admin-user-1',
  email: 'admin@example.test',
  role: 'Administrator'
})

const workerToken = tokenFor({
  userId: 'bhw-user-1',
  email: 'worker@example.test',
  role: 'BHW Worker',
  bhwId: 'bhw-1',
  assignedPurokId: 'purok-1'
})

const request = async (method, path, { token, body, headers = {}, rawBody } = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body !== undefined || rawBody !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers
    },
    ...(rawBody !== undefined
      ? { body: rawBody }
      : body !== undefined
        ? { body: typeof body === 'string' ? body : JSON.stringify(body) }
        : {})
  })
  const text = await response.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }
  return { status: response.status, body: json, text, headers: response.headers }
}

const expect400 = (response, fields = []) => {
  assert.equal(response.status, 400, `expected 400, got ${response.status}: ${response.text.slice(0, 250)}`)
  assert.equal(response.body?.success, false)
  assert.ok(response.body?.errors, 'expected an errors object')
  for (const field of fields) {
    assert.ok(response.body.errors[field], `expected errors.${field}, got ${JSON.stringify(response.body.errors)}`)
  }
}

const expectStatus = (response, status) => {
  assert.equal(response.status, status, `expected ${status}, got ${response.status}: ${response.text.slice(0, 250)}`)
}

test.before(async () => {
  passwordHash = await bcrypt.hash('password123', 4)
  server = app.listen(0)
  await once(server, 'listening')
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

test.after(() => {
  server?.close()
})

test.beforeEach(() => {
  fake.supabase.__reset()
  fake.tables.get('users')[0].password_hash = passwordHash
  fake.tables.get('users')[1].password_hash = passwordHash
  loginRateLimiter.reset()
})

// ---------------------------------------------------------------------------
// Middleware, transport and authentication hardening
// ---------------------------------------------------------------------------
test('transport: health, 404, malformed JSON, oversized body and headers', async () => {
  const health = await request('GET', '/health')
  expectStatus(health, 200)
  assert.equal(health.body?.status, 'ok')
  assert.equal(health.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(health.headers.get('x-powered-by'), null)

  expectStatus(await request('GET', '/api/does-not-exist'), 404)

  const malformed = await request('POST', '/api/auth/login', { rawBody: '{"email":' })
  expectStatus(malformed, 400)
  assert.equal(malformed.body?.message, 'Request body contains invalid JSON.')

  const oversized = await request('POST', '/api/auth/login', {
    rawBody: JSON.stringify({ email: 'a@b.co', password: 'x'.repeat(1024 * 1024 + 100) })
  })
  expectStatus(oversized, 413)

  const cors = await request('GET', '/health', { headers: { Origin: 'http://localhost:5173' } })
  assert.equal(cors.headers.get('access-control-allow-origin'), 'http://localhost:5173')
})

test('authentication: missing, malformed, expired and wrong-secret tokens are rejected', async () => {
  expectStatus(await request('GET', '/api/residents'), 401)
  expectStatus(await request('GET', '/api/residents', { token: 'not-a-jwt' }), 401)
  expectStatus(
    await request('GET', '/api/residents', { token: tokenFor({ userId: 'admin-user-1', role: 'Administrator' }, { expiresIn: -10 }) }),
    401
  )
  expectStatus(
    await request('GET', '/api/residents', {
      token: jwt.sign({ userId: 'admin-user-1', role: 'Administrator' }, 'wrong-secret', { expiresIn: '1h' })
    }),
    401
  )
  expectStatus(await request('GET', '/api/residents', { headers: { Authorization: `Basic ${adminToken}` } }), 401)
  expectStatus(await request('GET', '/api/residents', { token: adminToken }), 200)
})

test('authorization: worker tokens cannot reach admin-only routes', async () => {
  expectStatus(await request('GET', '/api/auth/users', { token: workerToken }), 403)
  expectStatus(await request('DELETE', '/api/residents/resident-1', { token: workerToken }), 403)
  expectStatus(await request('POST', '/api/puroks', { token: workerToken, body: { name: 'P' } }), 403)
  expectStatus(await request('POST', '/api/medicines', { token: workerToken, body: {} }), 403)
})

test('login: field boundaries, unknown users, wrong passwords and deactivated accounts', async () => {
  expect400(await request('POST', '/api/auth/login', { body: {} }), ['email', 'password'])
  expect400(
    await request('POST', '/api/auth/login', { body: { email: 'x'.repeat(255), password: 'x' } }),
    ['email']
  )
  expect400(
    await request('POST', '/api/auth/login', { body: { email: 'admin@example.test', password: 'x'.repeat(129) } }),
    ['password']
  )
  expectStatus(await request('POST', '/api/auth/login', { body: { email: 'nobody@example.test', password: 'whatever' } }), 401)
  expectStatus(await request('POST', '/api/auth/login', { body: { email: 'admin@example.test', password: 'wrong' } }), 401)

  const workerLogin = await request('POST', '/api/auth/login', { body: { username: 'worker', password: 'password123' } })
  expectStatus(workerLogin, 200)
  assert.equal(workerLogin.body?.data?.user?.role, 'BHW Worker')

  fake.tables.get('users')[0].is_active = false
  expectStatus(await request('POST', '/api/auth/login', { body: { email: 'admin@example.test', password: 'password123' } }), 403)
})

test('register-admin: validation, duplicate email and bootstrap guard', async () => {
  expect400(
    await request('POST', '/api/auth/register-admin', { body: { name: 'A', email: 'bad', password: '123' } }),
    ['name', 'email', 'password']
  )
  expect400(
    await request('POST', '/api/auth/register-admin', {
      token: adminToken,
      body: { name: 'Admin Two', email: 'admin@example.test', password: 'password123' }
    }),
    ['email']
  )
  expectStatus(
    await request('POST', '/api/auth/register-admin', {
      token: 'expired-ish',
      body: { name: 'Admin Two', email: 'two@example.test', password: 'password123' }
    }),
    401
  )
  expectStatus(
    await request('POST', '/api/auth/register-admin', {
      body: { name: 'Admin Two', email: 'two@example.test', password: 'password123' }
    }),
    403
  )

  fake.tables.set('users', [])
  const bootstrap = await request('POST', '/api/auth/register-admin', {
    body: { name: 'First Admin', email: 'first@example.test', password: 'password123' }
  })
  expectStatus(bootstrap, 201)
})

test('change-password: requires a valid new password', async () => {
  expectStatus(await request('PUT', '/api/auth/change-password', { token: adminToken, body: {} }), 400)
  expect400(await request('PUT', '/api/auth/change-password', { token: adminToken, body: { newPassword: '12345' } }), ['newPassword'])
  expect400(
    await request('PUT', '/api/auth/change-password', { token: adminToken, body: { newPassword: 'x'.repeat(129) } }),
    ['newPassword']
  )
  expectStatus(await request('PUT', '/api/auth/change-password', { token: adminToken, body: { newPassword: 'newpassword123' } }), 200)
})

test('login rate limiting: 429 after ten failures and a reset after success', async () => {
  const wrong = () =>
    request('POST', '/api/auth/login', {
      body: { email: 'admin@example.test', password: 'wrong-password' }
    })

  for (let i = 0; i < 5; i += 1) expectStatus(await wrong(), 401)
  expectStatus(
    await request('POST', '/api/auth/login', {
      body: { email: 'admin@example.test', password: 'password123' }
    }),
    200
  )
  for (let i = 0; i < 10; i += 1) expectStatus(await wrong(), 401)

  const limited = await wrong()
  expectStatus(limited, 429)
  assert.ok(limited.headers.get('retry-after'), 'expected a Retry-After header')
  assert.ok(limited.body?.errors?.rateLimit)
})

// ---------------------------------------------------------------------------
// Residents
// ---------------------------------------------------------------------------
test('residents: create validation boundaries', async () => {
  const base = {
    name: 'Valid Resident',
    dateOfBirth: '1990-05-05',
    gender: 'Female',
    purokId: 'purok-1'
  }

  expect400(await request('POST', '/api/residents', { token: adminToken, body: {} }), ['name', 'dateOfBirth', 'gender'])
  expect400(await request('POST', '/api/residents', { token: adminToken, body: { ...base, name: 'A' } }), ['name'])
  expect400(await request('POST', '/api/residents', { token: adminToken, body: { ...base, name: 'x'.repeat(121) } }), ['name'])
  expect400(await request('POST', '/api/residents', { token: adminToken, body: { ...base, dateOfBirth: '2999-01-01' } }), ['dateOfBirth'])
  expect400(await request('POST', '/api/residents', { token: adminToken, body: { ...base, dateOfBirth: '2026-02-30' } }), ['dateOfBirth'])
  expect400(await request('POST', '/api/residents', { token: adminToken, body: { ...base, gender: 'Robot' } }), ['gender'])
  expect400(await request('POST', '/api/residents', { token: adminToken, body: { ...base, gender: 'Other' } }), ['gender'])
  expect400(await request('PUT', '/api/residents/resident-1', { token: adminToken, body: { gender: 'Other' } }), ['gender'])
  expect400(await request('POST', '/api/residents', { token: adminToken, body: { ...base, civilStatus: 'Unknown' } }), ['civilStatus'])

  for (const age of [-1, 151, 1.5, 'abc']) {
    expect400(await request('POST', '/api/residents', { token: adminToken, body: { ...base, age } }), ['age'])
  }

  for (const contactNumber of ['123', '0917123456', '091712345678', '0917ABC4567']) {
    expect400(await request('POST', '/api/residents', { token: adminToken, body: { ...base, contactNumber } }), ['contactNumber'])
  }

  expect400(
    await request('POST', '/api/residents', { token: adminToken, body: { ...base, focusGroups: 'senior' } }),
    ['focusGroups']
  )
  expect400(
    await request('POST', '/api/residents', { token: adminToken, body: { ...base, focusGroups: ['unknown'] } }),
    ['focusGroups']
  )
  expect400(
    await request('POST', '/api/residents', { token: adminToken, body: { ...base, focusGroups: ['senior', 'senior'] } }),
    ['focusGroups']
  )
  expect400(await request('POST', '/api/residents', { token: adminToken, body: { ...base, isPwd: 'yes' } }), ['isPwd'])
  expect400(
    await request('POST', '/api/residents', { token: adminToken, body: { ...base, focusGroups: ['pwd'] } }),
    ['disabilityType']
  )
  expect400(
    await request('POST', '/api/residents', { token: adminToken, body: { ...base, lastCheckup: '2999-01-01' } }),
    ['lastCheckup']
  )
})

test('residents: PWD flag without disability details is rejected', async () => {
  const response = await request('POST', '/api/residents', {
    token: adminToken,
    body: {
      name: 'PWD Resident',
      dateOfBirth: '1980-01-01',
      gender: 'Male',
      isPwd: true
    }
  })
  expect400(response, ['disabilityType'])
})

test('residents: create succeeds with a complete payload', async () => {
  const response = await request('POST', '/api/residents', {
    token: adminToken,
    body: {
      name: 'Complete Resident',
      dateOfBirth: '1985-06-15',
      age: 41,
      gender: 'Female',
      civilStatus: 'Married',
      purokId: 'purok-1',
      contactNumber: '09171234567',
      contactPerson: 'Juan Dela Cruz',
      contactPersonNumber: '09991234567',
      contactPersonAddress: 'Purok 1',
      lastCheckup: '2026-01-01',
      focusGroups: ['pwd'],
      disabilityType: 'Visual impairment',
      isPwd: true,
      motherName: 'Mother',
      fatherName: 'Father'
    }
  })
  expectStatus(response, 201)
  assert.equal(response.body?.data?.name, 'Complete Resident')
  assert.equal(response.body?.data?.isPwd, true)
  assert.equal(response.body?.data?.disabilityType, 'Visual impairment')
})

test('residents: unknown resources return 404 and invalid updates return 400', async () => {
  expectStatus(await request('GET', '/api/residents/does-not-exist', { token: adminToken }), 404)
  expectStatus(await request('DELETE', '/api/residents/does-not-exist', { token: adminToken }), 404)
  expectStatus(
    await request('PUT', '/api/residents/does-not-exist', { token: adminToken, body: { name: 'Updated Name' } }),
    404
  )
  expect400(
    await request('PUT', '/api/residents/resident-1', { token: adminToken, body: { contactNumber: '123' } }),
    ['contactNumber']
  )
  expect400(
    await request('PUT', '/api/residents/resident-1', { token: adminToken, body: { age: 1.5 } }),
    ['age']
  )
  expectStatus(
    await request('PUT', '/api/residents/resident-1', { token: adminToken, body: { name: 'Updated Name' } }),
    200
  )
})

test('residents: clearing clinical fields refreshes the stored risk score', async () => {
  const resident = fake.tables.get('residents')[0]
  resident.risk_score = 95
  fake.tables.set('resident_chronic_conditions', [
    { resident_id: resident.resident_id, condition_name: 'Hypertension' }
  ])

  const response = await request('PUT', `/api/residents/${resident.resident_id}`, {
    token: adminToken,
    body: { chronicConditions: [] }
  })
  expectStatus(response, 200)
  assert.equal(fake.tables.get('resident_chronic_conditions').length, 0)
  assert.ok(resident.risk_score < 95)
})

test('medical history: vital-sign boundaries and unknown resident handling', async () => {
  const invalidVitals = await request('POST', '/api/residents/resident-1/medical-history', {
    token: adminToken,
    body: {
      type: 'Checkup',
      date: '2026-01-01',
      vitalSigns: {
        bloodPressure: '120',
        heartRate: 19,
        temperature: 51,
        weight: 501,
        height: 9,
        bloodSugar: 1001,
        bmi: 201
      }
    }
  })
  expect400(invalidVitals, ['bloodPressure', 'heartRate', 'temperature', 'weight', 'height', 'bloodSugar', 'bmi'])
  expect400(await request('POST', '/api/residents/resident-1/medical-history', {
    token: adminToken,
    body: { type: 'Postpartum Checkup', postpartum: { babyGender: 'Other' } }
  }), ['babyGender'])

  expect400(
    await request('POST', '/api/residents/resident-1/medical-history', {
      token: adminToken,
      body: { type: 'x'.repeat(101) }
    }),
    ['type']
  )
  expect400(
    await request('POST', '/api/residents/resident-1/medical-history', {
      token: adminToken,
      body: { type: 'Checkup', date: '2999-01-01' }
    }),
    ['date']
  )

  const unknown = await request('POST', '/api/residents/does-not-exist/medical-history', {
    token: adminToken,
    body: { type: 'Checkup', date: '2026-01-01' }
  })
  expectStatus(unknown, 404)

  const valid = await request('POST', '/api/residents/resident-1/medical-history', {
    token: adminToken,
    body: {
      type: 'Prenatal Checkup',
      date: '2026-01-01',
      location: 'Barangay',
      facility: 'Health Center',
      vitalSigns: { bloodPressure: '120/80', heartRate: 72, temperature: 36.5, weight: 58, height: 160, bloodSugar: 90, bmi: 22.7 }
    }
  })
  expectStatus(valid, 201)
  assert.equal(valid.body?.vitalsOk, true)
  const recordId = valid.body.data.id

  const profile = await request('PUT', '/api/residents/resident-1', {
    token: adminToken,
    body: {
      chronicConditions: [{ name: 'Asthma', severity: 'Mild' }],
      currentMedications: [{ name: 'Test medication', dosage: '1 tablet', frequency: 'Daily' }],
      allergies: { drugs: [], food: ['Peanuts'], environmental: [] }
    }
  })
  expectStatus(profile, 200)
  assert.equal(JSON.parse(profile.body.data.chronicConditions[0]).name, 'Asthma')
  assert.equal(profile.body.data.currentMedications[0].name, 'Test medication')
  assert.deepEqual(profile.body.data.allergies.food, ['Peanuts'])

  const detail = await request('GET', '/api/residents/resident-1', { token: adminToken })
  expectStatus(detail, 200)
  assert.deepEqual(detail.body.data.allergies, profile.body.data.allergies)
  const savedRecord = detail.body.data.medicalHistory.find(record => record.id === recordId)
  assert.deepEqual(savedRecord?.vitalSigns, valid.body.data.vitalSigns)
})

// ---------------------------------------------------------------------------
// Schedules
// ---------------------------------------------------------------------------
test('schedules: create validation boundaries', async () => {
  const base = {
    scope: 'individual',
    date: '2026-11-10',
    time: '11:00',
    type: 'Checkup',
    residentId: 'resident-1',
    assignedBhws: [{ id: 'bhw-1', name: 'Test Worker' }]
  }

  expect400(await request('POST', '/api/schedules', { token: adminToken, body: {} }), ['scope', 'date', 'time', 'type'])
  expect400(
    await request('POST', '/api/schedules', { token: adminToken, body: { ...base, scope: 'barangay-wide' } }),
    ['scope']
  )
  expect400(
    await request('POST', '/api/schedules', { token: adminToken, body: { ...base, date: '2026-02-30' } }),
    ['date']
  )
  expect400(
    await request('POST', '/api/schedules', { token: adminToken, body: { ...base, time: '25:00' } }),
    ['time']
  )
  expect400(
    await request('POST', '/api/schedules', { token: adminToken, body: { ...base, type: '' } }),
    ['type']
  )
  expect400(
    await request('POST', '/api/schedules', { token: adminToken, body: { ...base, status: 'Bogus' } }),
    ['status']
  )
  expect400(
    await request('POST', '/api/schedules', { token: adminToken, body: { ...base, duration: 2 } }),
    ['duration']
  )
  expect400(
    await request('POST', '/api/schedules', { token: adminToken, body: { ...base, targetCount: 1.5 } }),
    ['targetCount']
  )
  expect400(
    await request('POST', '/api/schedules', { token: adminToken, body: { ...base, maxParticipants: 0 } }),
    ['maxParticipants']
  )
  expect400(
    await request('POST', '/api/schedules', { token: adminToken, body: { ...base, contactNumber: '123' } }),
    ['contactNumber']
  )
  expect400(
    await request('POST', '/api/schedules', { token: adminToken, body: { ...base, residentId: '' } }),
    ['residentId']
  )
  expect400(
    await request('POST', '/api/schedules', {
      token: adminToken,
      body: { ...base, scope: 'purok', residentId: undefined, purokId: '' }
    }),
    ['purokId']
  )
  expect400(
    await request('POST', '/api/schedules', {
      token: adminToken,
      body: { ...base, assignedBhws: [] }
    }),
    ['assignedBhws']
  )
})

test('schedules: overlapping worker bookings are rejected with 409', async () => {
  const response = await request('POST', '/api/schedules', {
    token: adminToken,
    body: {
      scope: 'individual',
      date: '2026-11-01',
      time: '09:15',
      type: 'Checkup',
      residentId: 'resident-1',
      assignedBhws: [{ id: 'bhw-1', name: 'Test Worker' }]
    }
  })
  expectStatus(response, 409)
})

test('schedules: create, update and participant error paths', async () => {
  const created = await request('POST', '/api/schedules', {
    token: adminToken,
    body: {
      scope: 'individual',
      date: '2026-11-20',
      time: '13:00',
      type: 'Checkup',
      residentId: 'resident-1',
      assignedBhws: [{ id: 'bhw-1', name: 'Test Worker' }],
      duration: 30
    }
  })
  expectStatus(created, 201)

  expectStatus(
    await request('PUT', '/api/schedules/does-not-exist', { token: adminToken, body: { status: 'Completed' } }),
    404
  )
  expect400(
    await request('PUT', '/api/schedules/schedule-1', { token: adminToken, body: { status: 'Bogus' } }),
    ['status']
  )
  expect400(
    await request('PUT', '/api/schedules/schedule-1', { token: adminToken, body: { contactNumber: '123' } }),
    ['contactNumber']
  )
  expectStatus(await request('DELETE', '/api/schedules/does-not-exist', { token: adminToken }), 404)

  expect400(
    await request('POST', '/api/schedules/schedule-1/participants', { token: adminToken, body: {} }),
    ['residentId']
  )
  expect400(
    await request('PUT', '/api/schedules/schedule-1/participants/resident-1', {
      token: adminToken,
      body: { attendanceStatus: 'Maybe' }
    }),
    ['attendanceStatus']
  )
  expect400(
    await request('PUT', '/api/schedules/schedule-1/participants/resident-1', {
      token: adminToken,
      body: { status: 'Bogus' }
    }),
    ['status']
  )
  expect400(
    await request('PUT', '/api/schedules/schedule-1/participants/resident-1', {
      token: adminToken,
      body: { notes: 'x'.repeat(1001) }
    }),
    ['notes']
  )
  expectStatus(
    await request('PUT', '/api/schedules/schedule-1/participants/resident-1', {
      token: adminToken,
      body: { attendanceStatus: 'Present' }
    }),
    200
  )
  expectStatus(
    await request('DELETE', '/api/schedules/schedule-1/participants/does-not-exist', { token: adminToken }),
    404
  )
  expectStatus(await request('GET', '/api/schedules/does-not-exist/participants', { token: adminToken }), 404)
  expectStatus(await request('GET', '/api/schedules/does-not-exist/stats', { token: adminToken }), 200)
})

test('schedules: search input is sanitized and cannot break the query', async () => {
  const response = await request(
    'GET',
    '/api/schedules?search=fever%2Cstatus.eq.Cancelled()%25_&status=Scheduled',
    { token: adminToken }
  )
  expectStatus(response, 200)
  assert.equal(response.body?.success, true)
})

// ---------------------------------------------------------------------------
// Puroks
// ---------------------------------------------------------------------------
test('puroks: create, update, location and delete validation', async () => {
  expect400(await request('POST', '/api/puroks', { token: adminToken, body: {} }), ['name'])
  expect400(await request('POST', '/api/puroks', { token: adminToken, body: { name: ' ' } }), ['name'])
  expect400(await request('POST', '/api/puroks', { token: adminToken, body: { name: 'x'.repeat(101) } }), ['name'])
  expect400(await request('POST', '/api/puroks', { token: adminToken, body: { name: 'Purok 1' } }), ['name'])
  expectStatus(await request('POST', '/api/puroks', { token: adminToken, body: { name: 'Purok 7' } }), 201)

  expect400(await request('PUT', '/api/puroks/purok-1', { token: adminToken, body: {} }), ['name'])
  expectStatus(await request('PUT', '/api/puroks/does-not-exist', { token: adminToken, body: { name: 'Purok X' } }), 404)

  expect400(await request('PUT', '/api/puroks/purok-1/location', { token: adminToken, body: {} }), ['latitude'])
  expect400(
    await request('PUT', '/api/puroks/purok-1/location', {
      token: adminToken,
      body: { latitude: 91, longitude: 181 }
    }),
    ['latitude', 'longitude']
  )
  expect400(
    await request('PUT', '/api/puroks/purok-1/location', {
      token: adminToken,
      body: { latitude: 14.5, longitude: 121, pinLabel: 'ABCD' }
    }),
    ['pinLabel']
  )
  expectStatus(
    await request('PUT', '/api/puroks/does-not-exist/location', {
      token: adminToken,
      body: { latitude: 14.5, longitude: 121 }
    }),
    404
  )
  expectStatus(
    await request('PUT', '/api/puroks/purok-1/location', {
      token: adminToken,
      body: { latitude: 14.6, longitude: 121.1, pinLabel: 'P1' }
    }),
    200
  )

  expectStatus(await request('DELETE', '/api/puroks/does-not-exist', { token: adminToken }), 404)
  expectStatus(await request('DELETE', '/api/puroks/purok-1', { token: adminToken }), 400)
})

// ---------------------------------------------------------------------------
// Medicines
// ---------------------------------------------------------------------------
test('medicines: create and update validation boundaries', async () => {
  const base = { medicine_name: 'Paracetamol', category: 'vitamins', total_doses: 1, target_group: 'all' }

  expect400(await request('POST', '/api/medicines', { token: adminToken, body: {} }), ['medicine_name', 'category'])
  expect400(
    await request('POST', '/api/medicines', { token: adminToken, body: { ...base, medicine_name: 'A' } }),
    ['medicine_name']
  )
  expect400(
    await request('POST', '/api/medicines', { token: adminToken, body: { ...base, medicine_name: 'x'.repeat(121) } }),
    ['medicine_name']
  )
  expect400(
    await request('POST', '/api/medicines', { token: adminToken, body: { ...base, category: 'unknown' } }),
    ['category']
  )
  for (const total_doses of [0, 51, 1.5]) {
    expect400(
      await request('POST', '/api/medicines', { token: adminToken, body: { ...base, total_doses } }),
      ['total_doses']
    )
  }
  expect400(
    await request('POST', '/api/medicines', { token: adminToken, body: { ...base, target_group: 'everyone' } }),
    ['target_group']
  )
  expect400(
    await request('POST', '/api/medicines', {
      token: adminToken,
      body: { ...base, requires_interval: 'yes' }
    }),
    ['requires_interval']
  )
  expect400(
    await request('POST', '/api/medicines', {
      token: adminToken,
      body: { ...base, dose_intervals: 'nope' }
    }),
    ['dose_intervals']
  )
  expect400(
    await request('POST', '/api/medicines', {
      token: adminToken,
      body: { ...base, description: 'x'.repeat(1001) }
    }),
    ['description']
  )
  expectStatus(await request('POST', '/api/medicines', { token: adminToken, body: base }), 201)

  expect400(
    await request('PUT', '/api/medicines/medicine-1', { token: adminToken, body: { category: 'bogus' } }),
    ['category']
  )
  expectStatus(
    await request('PUT', '/api/medicines/does-not-exist', { token: adminToken, body: { medicine_name: 'Valid Name' } }),
    404
  )
  expectStatus(await request('DELETE', '/api/medicines/does-not-exist', { token: adminToken }), 404)
})

test('medicines: resident record validation and unknown medicine handling', async () => {
  const base = {
    medicine_master_id: 'medicine-1',
    date_administered: '2026-01-01',
    dose_number: 1
  }

  expect400(
    await request('POST', '/api/medicines/resident/resident-1', { token: adminToken, body: {} }),
    ['medicine_master_id', 'date_administered']
  )
  expect400(
    await request('POST', '/api/medicines/resident/resident-1', {
      token: adminToken,
      body: { ...base, date_administered: 'not-a-date' }
    }),
    ['date_administered']
  )
  expect400(
    await request('POST', '/api/medicines/resident/resident-1', {
      token: adminToken,
      body: { ...base, date_administered: '2999-01-01' }
    }),
    ['date_administered']
  )
  for (const dose_number of [0, 51, 1.5]) {
    expect400(
      await request('POST', '/api/medicines/resident/resident-1', {
        token: adminToken,
        body: { ...base, dose_number }
      }),
      ['dose_number']
    )
  }
  expect400(
    await request('POST', '/api/medicines/resident/resident-1', {
      token: adminToken,
      body: { ...base, remarks: 'x'.repeat(1001) }
    }),
    ['remarks']
  )
  expect400(
    await request('POST', '/api/medicines/resident/resident-1', {
      token: adminToken,
      body: { ...base, medicine_master_id: 'does-not-exist' }
    }),
    ['medicine_master_id']
  )
  expectStatus(
    await request('POST', '/api/medicines/resident/resident-1', { token: adminToken, body: base }),
    201
  )
  expectStatus(await request('DELETE', '/api/medicines/record/does-not-exist', { token: adminToken }), 404)
})

// ---------------------------------------------------------------------------
// BHW accounts
// ---------------------------------------------------------------------------
test('BHW: create validation, uniqueness and focus-group conflicts', async () => {
  expect400(await request('POST', '/api/bhws', { token: adminToken, body: {} }), ['name'])
  expect400(await request('POST', '/api/bhws', { token: adminToken, body: { name: 'A' } }), ['name'])
  expect400(
    await request('POST', '/api/bhws', { token: adminToken, body: { name: 'Worker X', email: 'bad' } }),
    ['email']
  )
  expect400(
    await request('POST', '/api/bhws', { token: adminToken, body: { name: 'Worker X', contactNumber: '123' } }),
    ['contactNumber']
  )
  expect400(
    await request('POST', '/api/bhws', { token: adminToken, body: { name: 'Worker X', workerType: 'Robot' } }),
    ['workerType']
  )
  expect400(
    await request('POST', '/api/bhws', { token: adminToken, body: { name: 'Worker X', status: 'Zombie' } }),
    ['status']
  )
  expect400(
    await request('POST', '/api/bhws', {
      token: adminToken,
      body: { name: 'Worker X', workerType: 'BHW', username: 'ab', password: 'password123' }
    }),
    ['username']
  )
  expect400(
    await request('POST', '/api/bhws', {
      token: adminToken,
      body: {
        name: 'Worker X',
        workerType: 'BHW',
        username: 'x'.repeat(255),
        password: 'password123'
      }
    }),
    ['username']
  )
  expect400(
    await request('POST', '/api/bhws', {
      token: adminToken,
      body: {
        name: 'Worker X',
        workerType: 'BHW',
        email: `${'x'.repeat(250)}@example.test`
      }
    }),
    ['email']
  )
  expect400(
    await request('POST', '/api/bhws', {
      token: adminToken,
      body: { name: 'Worker X', workerType: 'BHW', username: 'workerx', password: '123' }
    }),
    ['password']
  )
  expect400(
    await request('POST', '/api/bhws', {
      token: adminToken,
      body: { name: 'Worker X', workerType: 'BHW', username: 'workerx' }
    }),
    ['password']
  )
  expect400(
    await request('POST', '/api/bhws', {
      token: adminToken,
      body: { name: 'Worker X', workerType: 'BHW', password: 'password123' }
    }),
    ['username']
  )
  expect400(
    await request('POST', '/api/bhws', {
      token: adminToken,
      body: { name: 'Worker X', workerType: 'BHW', assignedFocusGroup: 'bogus' }
    }),
    ['assignedFocusGroup']
  )

  fake.tables.get('bhws')[0].assigned_focus_group = 'pregnant'
  expect400(
    await request('POST', '/api/bhws', {
      token: adminToken,
      body: { name: 'Worker X', workerType: 'BHW', assignedFocusGroup: 'pregnant' }
    }),
    ['assignedFocusGroup']
  )

  expect400(
    await request('POST', '/api/bhws', {
      token: adminToken,
      body: {
        name: 'Worker X',
        workerType: 'BHW',
        username: 'admin@example.test',
        password: 'password123'
      }
    }),
    ['username']
  )

  const valid = await request('POST', '/api/bhws', {
    token: adminToken,
    body: {
      name: 'Worker New',
      position: 'BHW',
      workerType: 'BHW',
      contactNumber: '09171234567',
      email: 'workernew@example.test',
      username: 'workernew',
      password: 'password123'
    }
  })
  expectStatus(valid, 201)
  assert.equal(valid.body?.data?.hasAccount, true)
})

test('BHW: update validation and unknown resource handling', async () => {
  expect400(
    await request('PUT', '/api/bhws/bhw-1', { token: adminToken, body: { email: 'bad' } }),
    ['email']
  )
  expect400(
    await request('PUT', '/api/bhws/bhw-1', { token: adminToken, body: { contactNumber: '123' } }),
    ['contactNumber']
  )
  expect400(
    await request('PUT', '/api/bhws/bhw-1', { token: adminToken, body: { username: 'ab' } }),
    ['username']
  )
  expect400(
    await request('PUT', '/api/bhws/bhw-1', { token: adminToken, body: { workerType: 'Robot' } }),
    ['workerType']
  )
  expectStatus(
    await request('PUT', '/api/bhws/does-not-exist', { token: adminToken, body: { name: 'Updated Name' } }),
    404
  )
  expectStatus(await request('PUT', '/api/bhws/bhw-1', { token: adminToken, body: {} }), 400)
  expectStatus(await request('DELETE', '/api/bhws/does-not-exist', { token: adminToken }), 404)
})

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
test('dashboard: every route responds for an admin token', async () => {
  const paths = [
    '/api/dashboard/stats',
    '/api/dashboard/risk-distribution',
    '/api/dashboard/risk-distribution-by-purok',
    '/api/dashboard/common-diseases',
    '/api/dashboard/monthly-trends',
    '/api/dashboard/today-activities',
    '/api/dashboard/upcoming-activities',
    '/api/dashboard/missed-consultations',
    '/api/dashboard/notifications',
    '/api/dashboard/vulnerable-groups',
    '/api/dashboard/prenatal-report',
    '/api/dashboard/postpartum-report',
    '/api/dashboard/infants-vaccination-report',
    '/api/dashboard/seniors-report',
    '/api/dashboard/general-health-report',
    '/api/dashboard/ai-recommendation'
  ]
  for (const path of paths) {
    const response = await request('GET', path, { token: adminToken })
    expectStatus(response, 200)
    assert.equal(response.body?.success, true, `${path} did not return success`)
  }
})

test('dashboard: AI reporting periods look back 1, 3, or 12 months from today in Manila', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2024-05-30T17:00:00Z') })
  const planningActions = new Set()
  const outreachActions = new Set()
  const actionsByPosition = [new Set(), new Set()]
  const summaries = new Set()
  const currentSummaries = new Set()
  const healthPrograms = new Set()
  const today = '2024-05-31'
  fake.tables.get('residents').push({ resident_id: 'resident-2', purok_id: 'purok-1', risk_score: 0 })
  fake.tables.get('residents').push({
    resident_id: 'resident-with-older-encounter',
    name: 'Resident with older encounter',
    purok_id: 'purok-1',
    risk_score: 85,
  })
  fake.tables.get('resident_chronic_conditions').push({
    condition_id: 'older-condition',
    resident_id: 'resident-with-older-encounter',
    condition_name: 'Asthma'
  })
  fake.tables.set('medical_histories', [
    { history_id: 1, resident_id: 'resident-1', date: today },
    { history_id: 2, resident_id: 'resident-2', date: '2024-04-30' },
    { history_id: 3, resident_id: 'resident-2', date: '2024-02-29' },
    { history_id: 4, resident_id: 'resident-2', date: '2023-05-31' },
    { history_id: 5, resident_id: 'resident-with-older-encounter', date: '2023-05-30' }
  ])
  fake.tables.set('schedules', [
    { schedule_id: 1, resident_id: 'resident-1', status: 'Completed', date: today },
    { schedule_id: 2, resident_id: 'resident-2', status: 'Missed', date: '2020-01-01' },
    { schedule_id: 3, resident_id: 'resident-2', status: 'Completed', date: '2099-01-01' },
    { schedule_id: 4, resident_id: 'resident-1', status: 'Missed', date: '2020-01-01' },
    { schedule_id: 5, resident_id: 'resident-1', status: 'Cancelled', date: '2024-03-01' },
    { schedule_id: 6, resident_id: 'resident-1', status: 'Completed', date: '2023-06-01' },
    { schedule_id: 7, resident_id: 'resident-2', status: 'Missed', date: '2024-05-01' }
  ])
  for (const period of ['monthly', 'quarterly', 'annual', 'annually']) {
    const response = await request('GET', `/api/dashboard/ai-recommendation?period=${period}`, { token: adminToken })
    expectStatus(response, 200)
    const { dateRange, period: reportedPeriod } = response.body.data
    assert.equal(dateRange.endDate, today)
    assert.equal(dateRange.startDate, {
      monthly: '2024-04-30', quarterly: '2024-02-29', annual: '2023-05-31', annually: '2023-05-31'
    }[period])
    assert.equal(reportedPeriod, period === 'annually' ? 'annual' : period)
    assert.ok(response.body.data.summary.startsWith(response.body.data.periodSummary))
    assert.doesNotMatch(response.body.data.summary, /\b\d{4}-\d{2}-\d{2}\b/)
    assert.match(response.body.data.currentSummary, /registered residents/)
    currentSummaries.add(response.body.data.currentSummary)
    assert.match(response.body.data.summary, /registered residents.*critical risk.*high risk/)
    assert.match(response.body.data.summary, /Asthma is the most frequently recorded chronic condition/)
    assert.match(response.body.data.summary, {
      monthly: /last month recorded 2 medical encounters and 1 completed/,
      quarterly: /last three months recorded 1 completed and 1 cancelled/,
      annual: /last 12 months, 2 of 3 current residents had a recorded encounter/,
    }[reportedPeriod])
    if (reportedPeriod !== 'monthly') {
      assert.match(response.body.data.summary, /Encounters: 2 in the past month.+1 in the two months before that/)
    }
    if (reportedPeriod === 'annual') assert.match(response.body.data.summary, /1 in the rest of the year/)
    assert.match(response.body.data.summary, {
      monthly: /The preceding month recorded 0 medical encounters/,
      quarterly: /The preceding quarter recorded 0 completed/,
      annual: /In the preceding year, 1 of the same 3 current residents had recorded contact/,
    }[reportedPeriod])
    summaries.add(response.body.data.summary)
    assert.ok(response.body.data.keyFindings.some(finding => finding.includes(
      `${{ monthly: 2, quarterly: 3, annual: 4 }[reportedPeriod]} medical encounters`
    )))
    const scheduledCount = { monthly: '1 scheduled activity', quarterly: '2 scheduled activities', annual: '3 scheduled activities' }[reportedPeriod]
    assert.ok(response.body.data.keyFindings.some(finding => finding.includes(`and ${scheduledCount}.`)))
    assert.ok(response.body.data.keyFindings.some(finding =>
      finding.startsWith(`1 resident has an outstanding missed health consultation as of ${today}.`)))
    const outreach = response.body.data.recommendations.find(item =>
      item.targetGroup === '1 resident reached with consultations missed during the selected period')
    assert.ok(outreach)
    outreachActions.add(outreach.action)
    const averageFinding = {
      monthly: 'average per week was 0.4 medical encounters and 0.2 scheduled activities',
      quarterly: 'average per month was 1 medical encounter and 0.7 scheduled activities',
      annual: 'average per quarter was 1 medical encounter and 0.8 scheduled activities',
    }[reportedPeriod]
    assert.ok(response.body.data.keyFindings.some(finding => finding.includes(averageFinding)))
    const olderResident = response.body.data.priorityResidents.recommendations.find(
      resident => resident.residentId === 'resident-with-older-encounter'
    )
    assert.equal(olderResident?.riskLevel, 'Critical Risk')
    assert.deepEqual(olderResident?.conditions, ['Asthma'])
    assert.match(response.body.data.healthProgramRecommendation.programs[0].program,
      { monthly: /^Monthly/, quarterly: /^Quarterly/, annual: /^Annual/ }[reportedPeriod])
    healthPrograms.add(response.body.data.healthProgramRecommendation.programs[0].program)
    const plan = response.body.data.recommendations.find(item => item.category === 'Planning')
    assert.ok(plan, `expected a planning action for ${period}`)
    assert.equal(response.body.data.recommendations[0], plan)
    response.body.data.recommendations.slice(0, 2).forEach((item, index) =>
      actionsByPosition[index].add(item.action))
    assert.match(plan.timeline, { monthly: /weekly/, quarterly: /quarterly/, annual: /annual/ }[reportedPeriod])
    assert.match(plan.action, {
      monthly: /review missed appointments from this month/,
      quarterly: /review this quarter’s cancellations for residents reached/,
      annual: /documented care needs for residents reached/,
    }[reportedPeriod])
    assert.match(plan.evidence, { monthly: /unresolved consultation missed/, quarterly: /cancelled/, annual: /12-month window/ }[reportedPeriod])
    assert.ok(response.body.data.healthProgramRecommendation.programs[0].evidence)
    planningActions.add(plan.action)
  }
  assert.equal(planningActions.size, 3)
  assert.equal(outreachActions.size, 3)
  assert.deepEqual(actionsByPosition.map(actions => actions.size), [3, 3])
  assert.equal(summaries.size, 3)
  assert.equal(currentSummaries.size, 1)
  assert.equal(healthPrograms.size, 3)
  fake.tables.get('medical_histories').push(...[6, 7, 8].map(history_id => ({
    history_id, resident_id: 'resident-1', date: '2024-04-15'
  })))
  const decline = await request('GET', '/api/dashboard/ai-recommendation?period=monthly', { token: adminToken })
  expectStatus(decline, 200)
  assert.match(decline.body.data.recommendations.find(item => item.category === 'Planning').action,
    /review missed appointments from this month/)
  assert.match(decline.body.data.healthProgramRecommendation.programs[0].activities[0],
    /this month’s unresolved missed consultations for residents reached/)
  fake.tables.get('medical_histories').push({
    history_id: 9, resident_id: 'resident-with-older-encounter', date: '2024-01-15'
  })
  const annualCoverage = await request('GET', '/api/dashboard/ai-recommendation?period=annual', { token: adminToken })
  expectStatus(annualCoverage, 200)
  assert.match(decline.body.data.periodResidentSummary, /^2 current residents.*0 are currently at critical risk/)
  assert.match(annualCoverage.body.data.periodResidentSummary, /^3 current residents.*1 are currently at critical risk/)
  assert.match(annualCoverage.body.data.periodResidentSummary, /Most common recorded chronic condition: Asthma/)
  const monthlyPlan = decline.body.data.recommendations.find(item => item.category === 'Planning')
  const annualPlan = annualCoverage.body.data.recommendations.find(item => item.category === 'Planning')
  assert.equal(monthlyPlan.targetGroup, '2 residents reached in the selected period')
  assert.equal(annualPlan.targetGroup, '3 residents reached in the selected period')
  assert.match(annualPlan.evidence, /Asthma.*1 resident\)/)
  assert.doesNotMatch(monthlyPlan.evidence, /Asthma/)
  const [monthlyProgram] = decline.body.data.healthProgramRecommendation.programs
  const [annualProgram] = annualCoverage.body.data.healthProgramRecommendation.programs
  assert.equal(monthlyProgram.targetGroup, monthlyPlan.targetGroup)
  assert.equal(annualProgram.targetGroup, annualPlan.targetGroup)
  assert.match(annualProgram.evidence, /Asthma/)
  assert.doesNotMatch(monthlyProgram.evidence, /Asthma/)
  assert.ok(decline.body.data.recommendations.every(item => !item.targetGroup.includes('critical-risk')))
  assert.ok(annualCoverage.body.data.recommendations.some(item => item.targetGroup.includes('1 critical-risk')))
  assert.equal(annualCoverage.body.data.recommendations[0].priority, 'high')
  fake.tables.set('medical_histories', [])
  fake.tables.set('schedules', [{ schedule_id: 8, resident_id: 'resident-2', status: 'Missed', date: today }])
  const noContact = await request('GET', '/api/dashboard/ai-recommendation?period=monthly', { token: adminToken })
  expectStatus(noContact, 200)
  assert.deepEqual(noContact.body.data.recommendations, [])
  assert.deepEqual(noContact.body.data.healthProgramRecommendation.programs, [])
  expectStatus(await request('GET', '/api/dashboard/ai-recommendation?period=weekly', { token: adminToken }), 400)
})

test('dashboard: analytics include the latest rows beyond the first database page', async () => {
  const residents = Array.from({ length: 1001 }, (_, index) => ({
    resident_id: index + 1,
    purok_id: 'purok-1',
    age: 25,
    risk_level: 'Low Risk'
  }))
  fake.tables.set('residents', residents)
  fake.tables.set('resident_chronic_conditions', residents.map(resident => ({
    condition_id: resident.resident_id,
    resident_id: resident.resident_id,
    condition_name: 'First condition'
  })))
  fake.tables.set('medical_histories', residents.map(resident => ({
    history_id: resident.resident_id,
    resident_id: resident.resident_id,
    date: '2025-01-01'
  })))
  const getDashboardData = async path => {
    const response = await request('GET', `/api/dashboard/${path}`, { token: adminToken })
    expectStatus(response, 200)
    assert.equal(response.headers.get('cache-control'), 'private, no-store')
    return response.body.data
  }

  assert.equal((await getDashboardData('risk-distribution')).low, 1001)
  fake.tables.get('residents')[1000].risk_level = 'High Risk'
  assert.equal((await getDashboardData('risk-distribution')).high, 1)
  assert.deepEqual((await getDashboardData('common-diseases')).overall, [{ name: 'First condition', count: 1001 }])
  assert.deepEqual((await getDashboardData('common-diseases?purokId=empty')).overall, [])

  const [january] = await getDashboardData('monthly-trends?year=2025')
  const visitCount = january.criticalHealthRisk + january.highHealthRisk + january.moderateHealthRisk + january.lowHealthRisk
  assert.equal(visitCount, 1001)
})

test('dashboard: AI findings include missed care while risk lists include only high and critical risk', async () => {
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Manila' }).format(new Date())
  fake.tables.set('residents', Array.from({ length: 20 }, (_, index) => {
    const purok = index === 19 ? 2 : index === 8 ? 3 : index >= 1 && index < 6 ? 4 : 1
    return {
      resident_id: index + 1,
      name: `Resident ${index + 1}`,
      purok_id: `purok-${purok}`,
      puroks: { name: `Purok ${purok}` },
      risk_score: index < 6 ? 80 : index === 19 ? 60 : index === 8 ? 30 : 5,
    }
  }))
  const schedules = Array.from({ length: 22 }, (_, index) => ({
    schedule_id: index + 1,
    resident_id: (index % 19) + 1,
    status: 'Missed',
    date: today
  }))
  schedules.push(
    { schedule_id: 23, resident_id: 20, status: 'Missed', date: today },
    { schedule_id: 24, resident_id: 20, status: 'Completed', date: today },
    { schedule_id: 25, resident_id: null, status: 'Missed', date: today }
  )
  fake.tables.set('schedules', schedules)
  const analytics = await request('GET', '/api/dashboard/missed-consultations', { token: adminToken })
  expectStatus(analytics, 200)
  assert.equal(analytics.body.data.length, 19)
  assert.equal(analytics.body.data.reduce((total, row) => total + row.missedCount, 0), 22)

  const path = '/api/dashboard/ai-recommendation?period=monthly'
  const report = await request('GET', path, { token: adminToken })
  expectStatus(report, 200)
  assert.equal(recommendationData.residentsWithMissedConsultations, analytics.body.data.length)
  assert.ok(report.body.data.keyFindings.some(finding => finding.startsWith(`19 residents have outstanding missed health consultations as of ${today}.`)))
  assert.ok(report.body.data.keyFindings.every(finding => !/22 (consultations|missed|residents)/i.test(finding)))
  assert.ok(report.body.data.recommendations.every(r => r.category !== 'Outreach'))
  const priorities = report.body.data.priorityResidents.recommendations
  assert.deepEqual(priorities.map(r => r.residentId), [1, 2, 3, 4, 5, 6, 20])
  assert.equal(priorities.filter(r => r.riskLevel === 'Critical Risk').length, 6)
  assert.equal(priorities.find(r => r.residentId === 20).missedCount, 0)
  assert.match(priorities.find(r => r.residentId === 1).intervention, /Contact today.*rebook/)
  assert.match(priorities.find(r => r.residentId === 20).intervention, /Contact this week/)
  assert.deepEqual(report.body.data.riskAreas.map(r => [r.area, r.severity]), [
    ['Purok 4', 'Critical'], ['Purok 2', 'High']
  ])
  assert.match(report.body.data.riskAreas[0].action, /Contact critical-risk residents today/)
  assert.ok(report.body.data.healthProgramRecommendation.programs.length > 0)
  assert.deepEqual(report.body.data.purokPriority.rankings, [])
})

test('dashboard: worker AI recommendations follow the current analytics scopes', async () => {
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Manila' }).format(new Date())
  const worker = fake.tables.get('bhws')[0]
  worker.assigned_purok_id = 'purok-1'
  worker.assigned_focus_group = 'pregnant'
  const residents = Array.from({ length: 1001 }, (_, index) => ({
    resident_id: index + 1,
    name: `Resident ${index + 1}`,
    purok_id: index === 1 ? 'purok-2' : 'purok-1',
    focus_groups: index < 2 ? ['pregnant', 'senior'] : ['senior'],
    risk_score: index < 2 ? 80 : 0
  }))
  fake.tables.set('residents', residents)
  fake.tables.set('medical_histories', residents.map(({ resident_id }) => ({
    history_id: resident_id, resident_id, date: today
  })))
  fake.tables.set('resident_chronic_conditions', residents.slice(0, 3).map(resident => ({
    condition_id: resident.resident_id,
    resident_id: resident.resident_id,
    condition_name: `Condition ${resident.resident_id}`
  })))
  fake.tables.set('schedules', [1, 2, 3].map(residentId => ({
    schedule_id: residentId,
    resident_id: residentId,
    date: today,
    status: 'Missed'
  })))
  const path = '/api/dashboard/ai-recommendation'

  const firstReport = await request('GET', path, { token: workerToken })
  expectStatus(firstReport, 200)
  assert.equal(recommendationData.totalResidents, 1001)
  assert.equal(recommendationData.residentsInAssignedPurok, 1000)
  assert.equal(recommendationData.residentsWithMissedConsultations, 3)
  assert.deepEqual(recommendationData.vulnerableGroups, { pregnant: 2, senior: 0, infant: 0 })
  assert.deepEqual(firstReport.body.data.priorityResidents.recommendations.map(r => r.resident), ['Resident 1', 'Resident 2'])
  assert.deepEqual(firstReport.body.data.priorityResidents.recommendations[1].conditions, ['Condition 2'])
  assert.ok(firstReport.body.data.healthProgramRecommendation.programs.length > 0)
  assert.ok(firstReport.body.data.keyFindings.some(finding => finding.startsWith('3 residents in your assigned caseload')))
  const stats = await request('GET', '/api/dashboard/stats', { token: workerToken })
  const missed = await request('GET', '/api/dashboard/missed-consultations', { token: workerToken })
  const conditions = await request('GET', '/api/dashboard/common-diseases', { token: workerToken })
  for (const response of [stats, missed, conditions]) expectStatus(response, 200)
  assert.equal(recommendationData.totalResidents, stats.body.data.totalResidents)
  assert.equal(recommendationData.criticalCount, stats.body.data.criticalCount)
  assert.equal(recommendationData.residentsWithMissedConsultations, missed.body.data.length)
  assert.deepEqual(recommendationData.topDiseases, conditions.body.data.overall)

  worker.assigned_purok_id = 'purok-2'
  const reassignedReport = await request('GET', path, { token: workerToken })
  expectStatus(reassignedReport, 200)
  assert.deepEqual(reassignedReport.body.data.priorityResidents.recommendations.map(r => r.resident), ['Resident 1', 'Resident 2'])
  assert.equal(recommendationData.totalResidents, 2)
  assert.deepEqual(recommendationData.topDiseases, [{ name: 'Condition 2', count: 1 }])
  worker.assigned_focus_group = null
  const withoutFocus = await request('GET', path, { token: workerToken })
  expectStatus(withoutFocus, 409)
  assert.equal(withoutFocus.body.code, 'BHW_ASSIGNMENT_REQUIRED')
  worker.assigned_focus_group = 'pregnant'
  worker.assigned_purok_id = null
  expectStatus(await request('GET', path, { token: workerToken }), 409)

  const headToken = tokenFor({ userId: 'admin-user-1', role: 'BHW Admin' })
  expectStatus(await request('GET', path, { token: headToken }), 200)
  assert.equal(recommendationData.totalResidents, 1001)
  assert.equal(recommendationData.criticalCount, 2)
  assert.equal(recommendationData.residentsWithMissedConsultations, 3)
  assert.equal(recommendationData.vulnerableGroups.senior, 1001)

  fake.tables.get('residents')[1000].risk_score = 90
  const refreshedHeadReport = await request('GET', path, { token: headToken })
  expectStatus(refreshedHeadReport, 200)
  assert.equal(recommendationData.criticalCount, 3)
  assert.equal(refreshedHeadReport.body.data.priorityResidents.recommendations[0].residentId, 1001)
})

test('dashboard: worker-scoped routes and vulnerable-group query validation', async () => {
  expectStatus(await request('GET', '/api/dashboard/bhw-home', { token: workerToken }), 200)
  expectStatus(await request('GET', '/api/dashboard/bhw-interventions', { token: workerToken }), 200)

  for (const group of ['all', 'pregnant', 'senior', 'infant']) {
    expectStatus(
      await request('GET', `/api/dashboard/vulnerable-groups?group=${group}`, { token: adminToken }),
      200
    )
  }
  expect400(
    await request('GET', '/api/dashboard/vulnerable-groups?group=bogus', { token: adminToken }),
    ['group']
  )
})

// ---------------------------------------------------------------------------
// Worker scoping
// ---------------------------------------------------------------------------
test('worker scoping: self-service endpoints stay scoped', async () => {
  expectStatus(await request('GET', '/api/residents/mine', { token: workerToken }), 200)
  expectStatus(await request('GET', '/api/schedules/mine', { token: workerToken }), 200)
  expectStatus(await request('GET', '/api/bhws/me', { token: workerToken }), 200)
  expectStatus(await request('GET', '/api/puroks/mine', { token: workerToken }), 200)
  expectStatus(await request('GET', '/api/bhws/bhw-2', { token: workerToken }), 403)
  expectStatus(await request('GET', '/api/puroks/purok-2', { token: workerToken }), 403)
  expectStatus(await request('GET', '/api/schedules/bhw/bhw-2', { token: workerToken }), 403)
})
