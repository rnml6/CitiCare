// Shared, framework-agnostic validation helpers used by forms and tests.
// These mirror the server-side rules; the server remains the source of truth.

export const GENDERS = ['Male', 'Female', 'Other']
export const CIVIL_STATUSES = ['Single', 'Married', 'Widowed', 'Separated']
export const FOCUS_GROUPS = ['pregnant', 'senior', 'infant', 'pwd', 'withCondition']

export const trimText = (value) => (value == null ? '' : String(value).trim())

export const isBlank = (value) => trimText(value) === ''

export const isValidDate = (value) => {
  if (isBlank(value)) return false
  const raw = String(value).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false
  const [year, month, day] = raw.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

export const isFutureDate = (value) => {
  if (!isValidDate(value)) return false
  const today = new Date()
  const todayStamp = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  return String(value).slice(0, 10) > todayStamp
}

export const isValidEmail = (value) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimText(value))

// Contact numbers are stored as exactly 11 digits (for example 09171234567).
// Optional values are validated only when non-empty.
export const isValidPhone = (value) => {
  const digits = trimText(value).replace(/[\s()-]/g, '')
  if (!digits) return true
  return /^\d{11}$/.test(digits)
}

export const PHONE_LENGTH = 11
export const PHONE_ERROR = 'Contact number must be exactly 11 digits.'

export const maxLength = (value, max) => trimText(value).length <= max

// Input masks keep typed/pasted values consistent with the field's real-world
// data type. Submit validation still runs afterwards and remains the source of
// truth; these helpers only stop obviously wrong characters at the input edge.
export const sanitizeDecimalInput = (value, { maxDecimals = 1 } = {}) => {
  const raw = String(value ?? '').replace(/[^\d.]/g, '')
  if (!raw) return ''
  const [wholePart = '', ...fractionParts] = raw.split('.')
  const whole = wholePart.replace(/^0+(?=\d)/, '')
  if (fractionParts.length === 0 || maxDecimals <= 0) return whole
  const fraction = fractionParts.join('').slice(0, maxDecimals)
  return `${whole || '0'}.${fraction}`
}

export const sanitizeIntegerInput = (value) => {
  const whole = String(value ?? '')
    .replace(/[^\d.]/g, '')
    .split('.')[0]
  return whole.replace(/^0+(?=\d)/, '')
}

// Blood pressure is always systolic/diastolic, each up to 3 digits.
export const sanitizeBloodPressureInput = (value) => {
  const raw = String(value ?? '').replace(/[^\d/]/g, '')
  const [systolic = '', ...rest] = raw.split('/')
  const top = systolic.slice(0, 3)
  if (rest.length === 0) return top
  return `${top}/${rest.join('').slice(0, 3)}`
}

// Contact numbers accept digits only and are capped at 11 characters.
export const sanitizePhoneInput = (value) =>
  String(value ?? '').replace(/\D/g, '').slice(0, PHONE_LENGTH)

const isModifiedKey = event => event.ctrlKey || event.metaKey || event.altKey

// Non-negative decimal fields (weight, height, temperature, ...).
export const blockNumericKeys = event => {
  if (isModifiedKey(event)) return
  if (event.key.length === 1 && !/[\d.]/.test(event.key)) {
    event.preventDefault()
  }
}

// Whole-number fields (heart rate, counts, ...).
export const blockIntegerKeys = event => {
  if (isModifiedKey(event)) return
  if (event.key.length === 1 && !/\d/.test(event.key)) {
    event.preventDefault()
  }
}

export const blockBloodPressureKeys = event => {
  if (isModifiedKey(event)) return
  if (event.key.length === 1 && !/[\d/]/.test(event.key)) {
    event.preventDefault()
  }
}

export const blockPhoneKeys = event => {
  if (isModifiedKey(event)) return
  if (event.key.length === 1 && !/\d/.test(event.key)) {
    event.preventDefault()
  }
}

export const validateVitalSigns = (vitals = {}) => {
  const errors = {}

  const bloodPressure = trimText(vitals.bloodPressure)
  if (bloodPressure && !/^\d{2,3}\s*\/\s*\d{2,3}$/.test(bloodPressure)) {
    errors.bloodPressure = 'Blood pressure must look like 120/80.'
  }

  const addRangeError = (field, label, min, max) => {
    const raw = vitals[field]
    if (isBlank(raw)) return
    const value = Number(raw)
    if (!Number.isFinite(value) || value < min || value > max) {
      errors[field] = `${label} must be between ${min} and ${max}.`
    }
  }

  addRangeError('heartRate', 'Heart rate', 20, 300)
  addRangeError('temperature', 'Temperature', 25, 50)
  addRangeError('weight', 'Weight', 0.1, 500)
  addRangeError('height', 'Height', 10, 300)
  addRangeError('bloodSugar', 'Blood sugar', 0, 1000)

  return errors
}

export const validateResidentFields = (data = {}) => {
  const errors = {}
  if (isBlank(data.name)) errors.name = 'Full name is required.'
  else if (trimText(data.name).length < 2) errors.name = 'Full name must be at least 2 characters.'
  else if (!maxLength(data.name, 120)) errors.name = 'Full name must be 120 characters or fewer.'

  if (isBlank(data.dateOfBirth)) errors.dateOfBirth = 'Date of birth is required.'
  else if (!isValidDate(data.dateOfBirth)) errors.dateOfBirth = 'Enter a valid date of birth.'
  else if (isFutureDate(data.dateOfBirth)) errors.dateOfBirth = 'Date of birth cannot be in the future.'

  if (isBlank(data.gender)) errors.gender = 'Gender is required.'
  else if (!GENDERS.includes(data.gender)) errors.gender = 'Select a valid gender.'

  if (!isBlank(data.contactNumber) && !isValidPhone(data.contactNumber)) {
    errors.contactNumber = PHONE_ERROR
  }
  if (!isBlank(data.contactPersonNumber) && !isValidPhone(data.contactPersonNumber)) {
    errors.contactPersonNumber = PHONE_ERROR
  }
  if (!isBlank(data.lastCheckup)) {
    if (!isValidDate(data.lastCheckup)) errors.lastCheckup = 'Enter a valid checkup date.'
    else if (isFutureDate(data.lastCheckup)) errors.lastCheckup = 'Checkup date cannot be in the future.'
  }
  if ((data.focusGroups || []).includes('pwd') && isBlank(data.disabilityType)) {
    errors.disabilityType = 'Specify the disability for PWD residents.'
  }
  if (!isBlank(data.disabilityType) && !maxLength(data.disabilityType, 200)) {
    errors.disabilityType = 'Disability details must be 200 characters or fewer.'
  }
  return errors
}

export const hasErrors = (errors) => Object.keys(errors || {}).length > 0
