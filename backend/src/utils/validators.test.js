import test from 'node:test'
import assert from 'node:assert/strict'
import {
  firstError,
  isValidDate,
  isValidTime,
  sanitizeSearchTerm,
  sendValidationError,
  validateAdminRegistration,
  validateBhwPayload,
  validateEmail,
  validateLoginPayload,
  validateMedicalHistoryPayload,
  validateMedicinePayload,
  validateParticipantPayload,
  validatePhone,
  validatePurokLocationPayload,
  validatePurokPayload,
  validateResidentPayload,
  validateSchedulePayload,
} from './validators.js'

test('email and phone validators accept 11-digit numbers and reject junk', () => {
  assert.equal(validateEmail('admin@example.com'), true)
  assert.equal(validateEmail('not-an-email'), false)
  assert.equal(validatePhone('09171234567'), true)
  assert.equal(validatePhone('+639171234567'), false)
  assert.equal(validatePhone('(02) 8123-4567'), false)
  assert.equal(validatePhone('0917 123 4567'), false)
  assert.equal(validatePhone('0917123456'), false)
  assert.equal(validatePhone('091712345678'), false)
  assert.equal(validatePhone('12345'), false)
  assert.equal(validatePhone(''), true)
})

test('date/time validators reject impossible and malformed values', () => {
  assert.equal(isValidDate('2026-02-28'), true)
  assert.equal(isValidDate('2026-02-30'), false)
  assert.equal(isValidDate('02/28/2026'), false)
  assert.equal(isValidTime('09:30'), true)
  assert.equal(isValidTime('23:59:59'), true)
  assert.equal(isValidTime('24:00'), false)
  assert.equal(isValidTime('9:30'), false)
})

test('login validation returns field-specific errors', () => {
  assert.deepEqual(validateLoginPayload({}), {
    email: 'Email or username is required.',
    password: 'Password is required.',
  })
  assert.deepEqual(validateLoginPayload({ email: 'a', password: 'x' }), {})
})

test('admin registration enforces valid email, name and password length', () => {
  const errors = validateAdminRegistration({ name: 'A', email: 'x', password: '123' })
  assert.equal(errors.name, 'Name must be at least 2 characters.')
  assert.equal(errors.email, 'Enter a valid email address.')
  assert.equal(errors.password, 'Password must be at least 6 characters.')
})

test('resident creation rejects missing fields, future DOB and bad phone', () => {
  const errors = validateResidentPayload({
    name: ' ',
    dateOfBirth: '2999-01-01',
    gender: 'Robot',
    contactNumber: '123',
    focusGroups: ['pwd'],
    disabilityType: '',
  })
  assert.equal(errors.name, 'Full name is required.')
  assert.equal(errors.dateOfBirth, 'Date of birth cannot be in the future.')
  assert.equal(errors.gender, 'Select a valid gender.')
  assert.equal(errors.contactNumber, 'Contact number must be exactly 11 digits.')
  assert.equal(errors.disabilityType, 'Specify the disability for PWD residents.')
})

test('resident partial updates validate only supplied fields', () => {
  assert.deepEqual(validateResidentPayload({ name: 'Maria Santos' }, { partial: true }), {})
  assert.equal(
    validateResidentPayload({ contactPersonNumber: 'abc' }, { partial: true }).contactPersonNumber,
    'Contact number must be exactly 11 digits.'
  )
  assert.equal(
    validateResidentPayload({ focusGroups: ['senior', 'senior'] }, { partial: true }).focusGroups,
    'Focus groups cannot contain duplicates.'
  )
})

test('medical history validates visit type, future date and vital ranges', () => {
  const errors = validateMedicalHistoryPayload({
    type: '',
    date: '2999-01-01',
    vitalSigns: { bloodPressure: 'high', heartRate: 900, temperature: 10 },
  })
  assert.equal(errors.type, 'Visit type is required.')
  assert.equal(errors.date, 'Visit date cannot be in the future.')
  assert.equal(errors.bloodPressure, 'Blood pressure must look like 120/80.')
  assert.equal(errors.heartRate, 'Heart rate must be 300 or less.')
  assert.equal(errors.temperature, 'Temperature must be at least 25.')
})

test('medical history rejects non-numeric weight and height values', () => {
  const errors = validateMedicalHistoryPayload({
    type: 'Checkup',
    vitalSigns: { weight: '58kg', height: '165cm' },
  })
  assert.equal(errors.weight, 'Weight must be a number.')
  assert.equal(errors.height, 'Height must be a number.')
})

test('medicine payload validates category, doses and descriptions', () => {
  const errors = validateMedicinePayload({
    medicine_name: 'A',
    category: 'unknown',
    total_doses: 0,
    dose_intervals: [{ dose: 1, description: 'x'.repeat(501) }],
  })
  assert.equal(errors.medicine_name, 'Medicine name must be at least 2 characters.')
  assert.match(errors.category, /Category must be one of/)
  assert.equal(errors.total_doses, 'Total doses must be at least 1.')
  assert.equal(errors.dose_intervals, 'Dose descriptions must be 500 characters or fewer.')
})

test('purok and location payloads enforce lengths and coordinate ranges', () => {
  assert.equal(validatePurokPayload({ name: ' ' }).name, 'Purok name is required.')
  assert.equal(validatePurokPayload({ name: 'x'.repeat(101) }).name, 'Purok name must be 100 characters or fewer.')
  const location = validatePurokLocationPayload({ latitude: 200, longitude: 500, pinLabel: 'ABCD' })
  assert.equal(location.latitude, 'Latitude must be between -90 and 90.')
  assert.equal(location.longitude, 'Longitude must be between -180 and 180.')
  assert.equal(location.pinLabel, 'Pin label must be 3 characters or fewer.')
})

test('schedule creation validates scope-dependent fields and enum values', () => {
  const errors = validateSchedulePayload({
    scope: 'individual',
    date: '2026-02-30',
    time: '25:00',
    type: '',
    status: 'Unknown',
    duration: 2,
  })
  assert.equal(errors.date, 'Enter a valid schedule date.')
  assert.equal(errors.time, 'Enter a valid time.')
  assert.equal(errors.type, 'Schedule type is required.')
  assert.equal(errors.status, 'Select a valid status.')
  assert.equal(errors.duration, 'Duration must be at least 5.')
  assert.equal(errors.residentId, 'Select a resident for an individual schedule.')
})

test('schedule partial updates do not require unrelated fields', () => {
  assert.deepEqual(validateSchedulePayload({ status: 'Completed' }, { partial: true }), {})
  assert.equal(
    validateSchedulePayload({ contactNumber: '123' }, { partial: true }).contactNumber,
    'Contact number must be exactly 11 digits.'
  )
})

test('participant and BHW payloads validate their optional fields', () => {
  assert.equal(validateParticipantPayload({}, { requireResident: true }).residentId, 'Resident is required.')
  assert.equal(validateParticipantPayload({ attendanceStatus: 'Maybe' }).attendanceStatus, 'Select a valid attendance status.')
  assert.equal(validateBhwPayload({ name: 'A' }).name, 'Name must be at least 2 characters.')
  assert.equal(validateBhwPayload({ email: 'bad' }, { partial: true }).email, 'Enter a valid email address.')
})

test('search sanitizer removes PostgREST logic characters', () => {
  assert.equal(sanitizeSearchTerm('  fever,status.eq.Cancelled()  '), 'fever status eq Cancelled')
  assert.equal(sanitizeSearchTerm('100%_name'), '100name')
  assert.equal(sanitizeSearchTerm('x'.repeat(200)).length, 100)
})

test('sendValidationError returns structured 400 with the first message', () => {
  let status
  let payload
  const res = {
    status(code) { status = code; return this },
    json(body) { payload = body; return this },
  }
  sendValidationError(res, { name: 'Name is required.', email: 'Invalid email.' })
  assert.equal(status, 400)
  assert.equal(payload.success, false)
  assert.equal(payload.message, 'Name is required.')
  assert.deepEqual(payload.errors, { name: 'Name is required.', email: 'Invalid email.' })
  assert.deepEqual(firstError({}), null)
})
