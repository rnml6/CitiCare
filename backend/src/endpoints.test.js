import test, { mock } from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

import { getJwtSecret } from './config/auth.js'
import { createFakeSupabase } from './testUtils/fakeSupabase.js'

process.env.NODE_ENV = 'test'

const fake = createFakeSupabase()

// Mock Supabase before importing the app. Every controller and middleware
// then uses the in-memory double; no production credentials or network
// database requests are involved.
mock.module('./config/supabase.js', {
  namedExports: {
    supabase: fake.supabase,
    supabaseClient: fake.supabaseClient
  }
})

const { default: app } = await import('./app.js')

// Import the routers after the Supabase mock is installed. Static imports are
// hoisted and would load the real config/supabase.js before mock.module runs.
const { default: authRoutes } = await import('./routes/authRoutes.js')
const { default: bhwRoutes } = await import('./routes/bhwRoutes.js')
const { default: residentRoutes } = await import('./routes/residentRoutes.js')
const { default: scheduleRoutes } = await import('./routes/scheduleRoutes.js')
const { default: purokRoutes } = await import('./routes/purokRoutes.js')
const { default: dashboardRoutes } = await import('./routes/dashboardRoutes.js')
const { default: medicineRoutes } = await import('./routes/medicineRoutes.js')

// Keep the AI endpoint from making a real external request. It receives a
// minimal, valid JSON body and no network call leaves the process.
const realFetch = globalThis.fetch
globalThis.fetch = async (url, options) => {
  if (String(url).includes('generativelanguage.googleapis.com')) {
    const payload = {
      summary: 'Test recommendation',
      keyFindings: [],
      riskAreas: [],
      recommendations: [],
      predictedTrends: { nextMonth: '', concerns: [], positiveIndicators: [] },
      medicineDemandForecast: { forecasts: [] },
      priorityResidents: { recommendations: [] },
      purokPriority: { rankings: [] },
      healthProgramRecommendation: { programs: [] }
    }
    return new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }]
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  }
  return realFetch(url, options)
}

let server
let baseUrl
let passwordHash

const tokenFor = (payload) => jwt.sign(payload, getJwtSecret(), { expiresIn: '1h' })

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

const request = async (method, path, { token, body, headers = {} } = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers
    },
    ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {})
  })
  const text = await response.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }
  return { status: response.status, body: json, text }
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
  const users = fake.tables.get('users')
  users[0].password_hash = passwordHash
  users[1].password_hash = passwordHash
})

// Each case:
//   auth:      public | optional | admin | worker  (who is required)
//   adminOnly: worker token must receive 403
//   invalid:   { body, fields } -> 400 with structured field errors
//   valid:     { body?, status } -> request succeeds with an expected status
//   actor:     worker -> use the BHW token for the valid request
const endpoints = [
  // ------------------------------------------------------------------ auth
  {
    method: 'POST',
    path: '/api/auth/login',
    auth: 'public',
    invalid: { body: {}, fields: ['email', 'password'] },
    valid: { body: { email: 'admin@example.test', password: 'password123' }, status: 200 }
  },
  {
    method: 'POST',
    path: '/api/auth/register-admin',
    auth: 'optional',
    invalid: { body: {}, fields: ['name', 'email', 'password'] },
    valid: { body: { name: 'Admin Two', email: 'admin2@example.test', password: 'password123' }, status: 201 }
  },
  {
    method: 'GET',
    path: '/api/auth/verify',
    auth: 'admin',
    valid: { status: 200 }
  },
  {
    method: 'GET',
    path: '/api/auth/users',
    auth: 'admin',
    adminOnly: true,
    valid: { status: 200 }
  },
  {
    method: 'PUT',
    path: '/api/auth/change-password',
    auth: 'admin',
    invalid: { body: {}, fields: ['newPassword'] },
    valid: { body: { newPassword: 'newpassword123' }, status: 200 }
  },

  // ------------------------------------------------------------------ bhws
  { method: 'GET', path: '/api/bhws', auth: 'admin', valid: { status: 200 } },
  { method: 'GET', path: '/api/bhws/me', auth: 'worker', actor: 'worker', valid: { status: 200 } },
  { method: 'GET', path: '/api/bhws/bhw-1', auth: 'admin', valid: { status: 200 } },
  { method: 'GET', path: '/api/bhws/bhw-1/schedules', auth: 'admin', valid: { status: 200 } },
  {
    method: 'POST',
    path: '/api/bhws',
    auth: 'admin',
    adminOnly: true,
    invalid: { body: {}, fields: ['name'] },
    valid: { body: { name: 'New Worker', position: 'BHW', workerType: 'BHW' }, status: 201 }
  },
  {
    method: 'PUT',
    path: '/api/bhws/bhw-1',
    auth: 'admin',
    invalid: { body: { name: '' }, fields: ['name'] },
    valid: { body: { name: 'Updated Worker' }, status: 200 }
  },
  {
    method: 'DELETE',
    path: '/api/bhws/bhw-1',
    auth: 'admin',
    adminOnly: true,
    valid: { status: 200 }
  },

  // ------------------------------------------------------------- residents
  { method: 'GET', path: '/api/residents', auth: 'admin', valid: { status: 200 } },
  { method: 'GET', path: '/api/residents/mine', auth: 'worker', actor: 'worker', valid: { status: 200 } },
  { method: 'GET', path: '/api/residents/resident-1', auth: 'admin', valid: { status: 200 } },
  {
    method: 'POST',
    path: '/api/residents',
    auth: 'admin',
    invalid: { body: {}, fields: ['name', 'dateOfBirth', 'gender'] },
    valid: {
      body: {
        name: 'New Resident',
        dateOfBirth: '1990-05-05',
        gender: 'Female',
        civilStatus: 'Single',
        purokId: 'purok-1'
      },
      status: 201
    }
  },
  {
    method: 'PUT',
    path: '/api/residents/resident-1',
    auth: 'admin',
    invalid: { body: { contactNumber: 'not-a-phone' }, fields: ['contactNumber'] },
    valid: { body: { name: 'Maria Updated', contactNumber: '09171234567' }, status: 200 }
  },
  {
    method: 'DELETE',
    path: '/api/residents/resident-1',
    auth: 'admin',
    adminOnly: true,
    valid: { status: 200 }
  },
  {
    method: 'POST',
    path: '/api/residents/resident-1/medical-history',
    auth: 'admin',
    invalid: {
      body: { vitalSigns: { weight: '58kg', height: '165cm' } },
      fields: ['type', 'weight', 'height']
    },
    valid: {
      body: { type: 'Checkup', date: '2026-01-01', location: 'Barangay', facility: 'Health Center' },
      status: 201
    }
  },
  {
    method: 'POST',
    path: '/api/residents/recalculate-all-risks',
    auth: 'admin',
    adminOnly: true,
    valid: { status: 200 }
  },

  // ------------------------------------------------------------- schedules
  { method: 'GET', path: '/api/schedules', auth: 'admin', valid: { status: 200 } },
  { method: 'GET', path: '/api/schedules/mine', auth: 'worker', actor: 'worker', valid: { status: 200 } },
  { method: 'GET', path: '/api/schedules/bhw/bhw-1', auth: 'admin', valid: { status: 200 } },
  { method: 'GET', path: '/api/schedules/schedule-1', auth: 'admin', valid: { status: 200 } },
  {
    method: 'POST',
    path: '/api/schedules',
    auth: 'admin',
    invalid: { body: {}, fields: ['scope', 'date', 'time', 'type'] },
    valid: {
      body: {
        scope: 'individual',
        date: '2026-11-01',
        time: '11:00',
        type: 'Checkup',
        residentId: 'resident-1',
        assignedBhws: [{ id: 'bhw-1', name: 'Test Worker' }]
      },
      status: 201
    }
  },
  {
    method: 'PUT',
    path: '/api/schedules/schedule-1',
    auth: 'admin',
    invalid: { body: { status: 'Bogus' }, fields: ['status'] },
    valid: { body: { status: 'Completed' }, status: 200 }
  },
  {
    method: 'DELETE',
    path: '/api/schedules/schedule-1',
    auth: 'admin',
    valid: { status: 200 }
  },
  { method: 'GET', path: '/api/schedules/schedule-1/participants', auth: 'admin', valid: { status: 200 } },
  {
    method: 'POST',
    path: '/api/schedules/schedule-1/participants',
    auth: 'admin',
    invalid: { body: {}, fields: ['residentId'] },
    valid: { body: { residentId: 'resident-1' }, status: 201 }
  },
  {
    method: 'PUT',
    path: '/api/schedules/schedule-1/participants/resident-1',
    auth: 'admin',
    invalid: { body: { attendanceStatus: 'Bogus' }, fields: ['attendanceStatus'] },
    valid: { body: { attendanceStatus: 'Present' }, status: 200 }
  },
  {
    method: 'DELETE',
    path: '/api/schedules/schedule-1/participants/resident-1',
    auth: 'admin',
    valid: { status: 200 }
  },
  { method: 'GET', path: '/api/schedules/schedule-1/stats', auth: 'admin', valid: { status: 200 } },

  // ---------------------------------------------------------------- puroks
  { method: 'GET', path: '/api/puroks', auth: 'admin', valid: { status: 200 } },
  { method: 'GET', path: '/api/puroks/mine', auth: 'worker', actor: 'worker', valid: { status: 200 } },
  { method: 'GET', path: '/api/puroks/purok-1', auth: 'admin', valid: { status: 200 } },
  {
    method: 'POST',
    path: '/api/puroks',
    auth: 'admin',
    adminOnly: true,
    invalid: { body: {}, fields: ['name'] },
    valid: { body: { name: 'Purok 2' }, status: 201 }
  },
  {
    method: 'PUT',
    path: '/api/puroks/purok-1',
    auth: 'admin',
    adminOnly: true,
    invalid: { body: { name: '' }, fields: ['name'] },
    valid: { body: { name: 'Purok One' }, status: 200 }
  },
  {
    method: 'PUT',
    path: '/api/puroks/purok-1/location',
    auth: 'admin',
    adminOnly: true,
    invalid: { body: {}, fields: ['latitude'] },
    valid: { body: { latitude: 14.6, longitude: 121.1, pinLabel: 'P2' }, status: 200 }
  },
  {
    method: 'DELETE',
    path: '/api/puroks/purok-1',
    auth: 'admin',
    adminOnly: true,
    valid: { status: [200, 400] }
  },

  // ------------------------------------------------------------- dashboard
  { method: 'GET', path: '/api/dashboard/bhw-home', auth: 'worker', actor: 'worker', valid: { status: 200 } },
  { method: 'GET', path: '/api/dashboard/bhw-interventions', auth: 'worker', actor: 'worker', valid: { status: 200 } },
  { method: 'GET', path: '/api/dashboard/stats', auth: 'admin', valid: { status: 200 } },
  { method: 'GET', path: '/api/dashboard/risk-distribution', auth: 'admin', valid: { status: 200 } },
  { method: 'GET', path: '/api/dashboard/risk-distribution-by-purok', auth: 'admin', valid: { status: 200 } },
  { method: 'GET', path: '/api/dashboard/common-diseases', auth: 'admin', valid: { status: 200 } },
  { method: 'GET', path: '/api/dashboard/monthly-trends', auth: 'admin', valid: { status: 200 } },
  { method: 'GET', path: '/api/dashboard/today-activities', auth: 'admin', valid: { status: 200 } },
  { method: 'GET', path: '/api/dashboard/upcoming-activities', auth: 'admin', valid: { status: 200 } },
  { method: 'GET', path: '/api/dashboard/missed-consultations', auth: 'admin', valid: { status: 200 } },
  { method: 'GET', path: '/api/dashboard/notifications', auth: 'admin', valid: { status: 200 } },
  { method: 'GET', path: '/api/dashboard/vulnerable-groups', auth: 'admin', valid: { status: 200 } },
  { method: 'GET', path: '/api/dashboard/prenatal-report', auth: 'admin', valid: { status: 200 } },
  { method: 'GET', path: '/api/dashboard/postpartum-report', auth: 'admin', valid: { status: 200 } },
  { method: 'GET', path: '/api/dashboard/infants-vaccination-report', auth: 'admin', valid: { status: 200 } },
  { method: 'GET', path: '/api/dashboard/seniors-report', auth: 'admin', valid: { status: 200 } },
  { method: 'GET', path: '/api/dashboard/general-health-report', auth: 'admin', valid: { status: 200 } },
  { method: 'GET', path: '/api/dashboard/ai-recommendation', auth: 'admin', valid: { status: 200 } },

  // -------------------------------------------------------------- medicines
  { method: 'GET', path: '/api/medicines', auth: 'admin', valid: { status: 200 } },
  {
    method: 'POST',
    path: '/api/medicines',
    auth: 'admin',
    adminOnly: true,
    invalid: { body: {}, fields: ['medicine_name', 'category'] },
    valid: {
      body: { medicine_name: 'Paracetamol', category: 'vitamins', total_doses: 1, target_group: 'all' },
      status: 201
    }
  },
  {
    method: 'PUT',
    path: '/api/medicines/medicine-1',
    auth: 'admin',
    adminOnly: true,
    invalid: { body: { category: 'bogus' }, fields: ['category'] },
    valid: { body: { medicine_name: 'Paracetamol 500mg' }, status: 200 }
  },
  {
    method: 'DELETE',
    path: '/api/medicines/medicine-1',
    auth: 'admin',
    adminOnly: true,
    valid: { status: 200 }
  },
  { method: 'GET', path: '/api/medicines/resident/resident-1', auth: 'admin', valid: { status: 200 } },
  {
    method: 'POST',
    path: '/api/medicines/resident/resident-1',
    auth: 'admin',
    invalid: { body: {}, fields: ['medicine_master_id', 'date_administered'] },
    valid: {
      body: {
        medicine_master_id: 'medicine-1',
        date_administered: '2026-01-01',
        dose_number: 1,
        total_doses: 1
      },
      status: 201
    }
  },
  {
    method: 'DELETE',
    path: '/api/medicines/record/record-1',
    auth: 'admin',
    adminOnly: true,
    valid: { status: 200 }
  }
]

assert.equal(endpoints.length, 64, 'expected the full 64-route API matrix')

const normalizePath = (path) => path.replace(/\/+$/, '') || '/'

const routePathMatches = (pattern, path) => {
  const source = pattern
    .split('/')
    .map((segment) =>
      segment.startsWith(':')
        ? '[^/]+'
        : segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    )
    .join('\\/')
  return new RegExp(`^${source}$`).test(path)
}

const routerMounts = {
  '/api/auth': authRoutes,
  '/api/bhws': bhwRoutes,
  '/api/residents': residentRoutes,
  '/api/schedules': scheduleRoutes,
  '/api/puroks': purokRoutes,
  '/api/dashboard': dashboardRoutes,
  '/api/medicines': medicineRoutes
}

const registeredRoutes = Object.entries(routerMounts).flatMap(([prefix, router]) =>
  router.stack
    .filter((layer) => layer.route)
    .flatMap((layer) => {
      const pattern = normalizePath(`${prefix}${layer.route.path}`)
      return Object.keys(layer.route.methods).map((method) => ({
        method: method.toUpperCase(),
        pattern
      }))
    })
)

test('endpoint matrix covers every registered router path', () => {
  assert.equal(registeredRoutes.length, endpoints.length, 'registered route count should match the matrix')

  for (const registered of registeredRoutes) {
    const covered = endpoints.some(
      (endpoint) =>
        endpoint.method === registered.method &&
        routePathMatches(registered.pattern, endpoint.path)
    )
    assert.ok(
      covered,
      `${registered.method} ${registered.pattern} is registered but missing from the matrix`
    )
  }

  for (const endpoint of endpoints) {
    const registered = registeredRoutes.some(
      (route) =>
        route.method === endpoint.method &&
        routePathMatches(route.pattern, endpoint.path)
    )
    assert.ok(
      registered,
      `${endpoint.method} ${endpoint.path} is in the matrix but not registered in a router`
    )
  }
})

const actorToken = (endpoint) => (endpoint.actor === 'worker' ? workerToken : adminToken)

for (const endpoint of endpoints) {
  test(`${endpoint.method} ${endpoint.path}`, async (t) => {
    await t.test('route is registered and enforces authentication', async () => {
      if (endpoint.auth === 'public' || endpoint.auth === 'optional') return
      const response = await request(endpoint.method, endpoint.path)
      assert.equal(response.status, 401, `${endpoint.method} ${endpoint.path} should require a token`)
      assert.equal(response.body?.success, false)
    })

    if (endpoint.adminOnly) {
      await t.test('rejects a non-admin token', async () => {
        const response = await request(endpoint.method, endpoint.path, { token: workerToken })
        assert.equal(response.status, 403, `${endpoint.method} ${endpoint.path} should be admin-only`)
        assert.equal(response.body?.success, false)
      })
    }

    if (endpoint.invalid) {
      await t.test('returns field-level validation errors', async () => {
        const token = endpoint.auth === 'public' ? undefined : actorToken(endpoint)
        const response = await request(endpoint.method, endpoint.path, {
          token,
          body: endpoint.invalid.body
        })
        assert.equal(response.status, 400, `${endpoint.method} ${endpoint.path} should reject invalid input`)
        assert.equal(response.body?.success, false)
        assert.ok(response.body?.errors, 'response should include an errors object')
        for (const field of endpoint.invalid.fields) {
          assert.ok(response.body.errors[field], `expected a validation error for "${field}"`)
        }
      })
    }

    if (endpoint.valid) {
      await t.test('handles a valid request without a server error', async () => {
        const token = endpoint.auth === 'public' || endpoint.auth === 'optional' ? adminToken : actorToken(endpoint)
        const response = await request(endpoint.method, endpoint.path, {
          token,
          body: endpoint.valid.body
        })
        const allowed = Array.isArray(endpoint.valid.status)
          ? endpoint.valid.status
          : [endpoint.valid.status]
        assert.ok(
          response.status < 500,
          `${endpoint.method} ${endpoint.path} returned ${response.status}: ${response.text.slice(0, 300)}`
        )
        assert.ok(
          allowed.includes(response.status),
          `${endpoint.method} ${endpoint.path} returned ${response.status} (allowed: ${allowed.join(', ')})`
        )
      })
    }
  })
}

// ---------------------------------------------------------------------------
// Security-branch coverage that does not fit the per-route matrix.
// ---------------------------------------------------------------------------

test('auth bootstrap: the first admin can register while the user table is empty', async () => {
  fake.tables.set('users', [])
  const response = await request('POST', '/api/auth/register-admin', {
    body: { name: 'First Admin', email: 'first@example.test', password: 'password123' }
  })
  assert.equal(response.status, 201)
  assert.equal(response.body?.data?.role, 'Administrator')
})

test('auth bootstrap: unauthenticated admin creation is rejected once a user exists', async () => {
  const response = await request('POST', '/api/auth/register-admin', {
    body: { name: 'Second Admin', email: 'second@example.test', password: 'password123' }
  })
  assert.equal(response.status, 403)
  assert.equal(response.body?.success, false)
})

test('auth login: a wrong password is rejected with 401', async () => {
  const response = await request('POST', '/api/auth/login', {
    body: { email: 'admin@example.test', password: 'wrong-password' }
  })
  assert.equal(response.status, 401)
  assert.equal(response.body?.success, false)
})

test('auth login: a BHW worker can sign in with username and receives their role', async () => {
  const response = await request('POST', '/api/auth/login', {
    body: { username: 'worker', password: 'password123' }
  })
  assert.equal(response.status, 200)
  assert.equal(response.body?.success, true)
  assert.equal(response.body?.data?.user?.role, 'BHW Worker')
  assert.equal(typeof response.body?.data?.token, 'string')
})

const assertFieldError = (response, field) => {
  assert.equal(response.status, 400)
  assert.equal(response.body?.success, false)
  assert.ok(response.body?.errors?.[field], `expected errors.${field}`)
}

test('BHW create: a username without a password is a field-level error', async () => {
  const response = await request('POST', '/api/bhws', {
    token: adminToken,
    body: { name: 'Worker X', workerType: 'BHW', username: 'workerx' }
  })
  assertFieldError(response, 'password')
})

test('BHW create: a password without a username is a field-level error', async () => {
  const response = await request('POST', '/api/bhws', {
    token: adminToken,
    body: { name: 'Worker X', workerType: 'BHW', password: 'password123' }
  })
  assertFieldError(response, 'username')
})

test('BHW create: short username and password are field-level errors', async () => {
  const shortUsername = await request('POST', '/api/bhws', {
    token: adminToken,
    body: { name: 'Worker X', workerType: 'BHW', username: 'ab', password: 'password123' }
  })
  assertFieldError(shortUsername, 'username')

  const shortPassword = await request('POST', '/api/bhws', {
    token: adminToken,
    body: { name: 'Worker X', workerType: 'BHW', username: 'workerx', password: '123' }
  })
  assertFieldError(shortPassword, 'password')
})

test('BHW create: an invalid focus group is a field-level error', async () => {
  const response = await request('POST', '/api/bhws', {
    token: adminToken,
    body: { name: 'Worker X', workerType: 'BHW', assignedFocusGroup: 'bogus' }
  })
  assertFieldError(response, 'assignedFocusGroup')
})

test('BHW create: a focus group held by another BHW is a field-level conflict', async () => {
  fake.tables.get('bhws')[0].assigned_focus_group = 'pregnant'
  const response = await request('POST', '/api/bhws', {
    token: adminToken,
    body: { name: 'Worker X', workerType: 'BHW', assignedFocusGroup: 'pregnant' }
  })
  assertFieldError(response, 'assignedFocusGroup')
})

test('BHW update: a short username is a field-level error', async () => {
  const response = await request('PUT', '/api/bhws/bhw-1', {
    token: adminToken,
    body: { username: 'ab' }
  })
  assertFieldError(response, 'username')
})

test('schedule create: a schedule with no assigned BHW returns field errors', async () => {
  const response = await request('POST', '/api/schedules', {
    token: adminToken,
    body: {
      scope: 'individual',
      date: '2026-11-02',
      time: '10:00',
      type: 'Checkup',
      residentId: 'resident-1'
    }
  })
  assertFieldError(response, 'assignedBhws')
})

test('resident medicine record: an unknown medicine returns a field error', async () => {
  const response = await request('POST', '/api/medicines/resident/resident-1', {
    token: adminToken,
    body: { medicine_master_id: 'missing-medicine', date_administered: '2026-01-01' }
  })
  assertFieldError(response, 'medicine_master_id')
})

test('dashboard vulnerable groups: an invalid group query is a field error', async () => {
  const response = await request('GET', '/api/dashboard/vulnerable-groups?group=bogus', {
    token: adminToken
  })
  assertFieldError(response, 'group')
})

test('BHW create: a username already used by an account is a field error', async () => {
  const response = await request('POST', '/api/bhws', {
    token: adminToken,
    body: {
      name: 'Worker X',
      workerType: 'BHW',
      username: 'admin@example.test',
      password: 'password123'
    }
  })
  assertFieldError(response, 'username')
})

test('purok create: a duplicate name is a field error', async () => {
  const response = await request('POST', '/api/puroks', {
    token: adminToken,
    body: { name: 'Purok 1' }
  })
  assertFieldError(response, 'name')
})

test('purok update: renaming to an existing purok name is a field error', async () => {
  fake.tables.get('puroks').push({
    purok_id: 'purok-2',
    id: 'purok-2',
    name: 'Purok 2',
    latitude: null,
    longitude: null
  })
  const response = await request('PUT', '/api/puroks/purok-1', {
    token: adminToken,
    body: { name: 'Purok 2' }
  })
  assertFieldError(response, 'name')
})

// Supabase caps a single response at 1000 rows. These guard the regression
// where the newest schedule (or resident) silently vanished from list pages
// past row 1000 — e.g. a schedule was created successfully but never showed
// up in the admin Schedules list.

test('schedule list: a schedule created past the 1000-row cap is returned', async () => {
  const schedules = fake.tables.get('schedules')
  const base = Date.parse('2024-01-01T00:00:00Z')
  for (let i = 0; i < 1005; i += 1) {
    schedules.push({
      schedule_id: `bulk-schedule-${i}`,
      date: new Date(base + i * 86400000).toISOString().slice(0, 10),
      time: '08:00',
      type: 'Checkup',
      scope: 'individual',
      // Completed so the overdue auto-flip (which only touches Scheduled)
      // doesn't rewrite the fixtures during the request.
      status: 'Completed',
      resident_id: 'resident-1',
      purok_id: 'purok-1',
      bhw_id: 'bhw-1',
      duration: 30
    })
  }
  assert.ok(schedules.length > 1000)

  const created = await request('POST', '/api/schedules', {
    token: adminToken,
    body: {
      scope: 'individual',
      date: '2026-11-02',
      time: '10:30',
      type: 'Checkup',
      residentId: 'resident-1',
      assignedBhws: [{ bhwId: 'bhw-1', name: 'Test Worker' }]
    }
  })
  assert.equal(created.status, 201)
  const createdId = created.body.data.schedule_id

  const list = await request('GET', '/api/schedules', { token: adminToken })
  assert.equal(list.status, 200)
  assert.ok(
    list.body.data.length > 1000,
    `expected every page of schedules, got ${list.body.data.length}`
  )
  assert.ok(
    list.body.data.some((schedule) => String(schedule.id) === String(createdId)),
    'the newly created schedule must appear in the list'
  )
})

test('worker schedule list: schedules past the 1000-row cap are returned', async () => {
  const schedules = fake.tables.get('schedules')
  const base = Date.parse('2024-01-01T00:00:00Z')
  for (let i = 0; i < 1005; i += 1) {
    schedules.push({
      schedule_id: `bulk-worker-schedule-${i}`,
      date: new Date(base + i * 86400000).toISOString().slice(0, 10),
      time: '08:00',
      type: 'Checkup',
      scope: 'individual',
      status: 'Completed',
      resident_id: 'resident-1',
      purok_id: 'purok-1',
      bhw_id: 'bhw-1',
      duration: 30
    })
  }

  const response = await request('GET', '/api/schedules/mine', { token: workerToken })
  assert.equal(response.status, 200)
  assert.ok(
    response.body.data.length > 1000,
    `expected every page of worker schedules, got ${response.body.data.length}`
  )
  assert.ok(
    response.body.data.some((schedule) => schedule.id === 'bulk-worker-schedule-1004'),
    'the last page of worker schedules must be included'
  )
})

test('resident list: residents past the 1000-row cap are returned', async () => {
  const residents = fake.tables.get('residents')
  for (let i = 0; i < 1205; i += 1) {
    residents.push({
      resident_id: `bulk-resident-${i}`,
      name: `Bulk Resident ${i}`,
      age: 30,
      gender: 'Female',
      date_of_birth: '1996-01-01',
      purok_id: 'purok-1',
      focus_groups: [],
      is_pwd: false,
      risk_level: 'Low',
      status: 'Active'
    })
  }

  const response = await request('GET', '/api/residents', { token: adminToken })
  assert.equal(response.status, 200)
  assert.ok(
    response.body.data.length > 1000,
    `expected every page of residents, got ${response.body.data.length}`
  )
  assert.ok(
    response.body.data.some((resident) => resident.id === 'bulk-resident-1204'),
    'the last page of residents must be included'
  )
})

