// Shared, framework-agnostic validation rules for API payloads.
//
// Controllers call these helpers before writing to Supabase and return a
// structured 400 response: { success: false, message, errors: { field: msg } }.
// Keeping the rules here makes them directly unit-testable without a database.

export const GENDERS = ['Male', 'Female', 'Other']
export const CIVIL_STATUSES = ['Single', 'Married', 'Widowed', 'Separated']
export const FOCUS_GROUPS = ['pregnant', 'senior', 'infant', 'pwd', 'withCondition']
export const SCHEDULE_SCOPES = ['individual', 'purok', 'barangay']
export const SCHEDULE_STATUSES = ['Scheduled', 'Active', 'Completed', 'Missed', 'Cancelled']
export const MEDICINE_CATEGORIES = ['vaccine', 'deworming', 'vitamins']
export const MEDICINE_TARGET_GROUPS = ['all', 'pregnant', 'infant', 'senior', 'pwd', 'withCondition']

export const trimText = (value) => (value == null ? '' : String(value).trim())

export const isBlank = (value) => trimText(value) === ''

export const validateEmail = (email) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimText(email))

// Contact numbers are stored as exactly 11 digits (for example 09171234567).
// Optional values are validated only when non-empty by the payload validators.
export const PHONE_ERROR = 'Contact number must be exactly 11 digits.'

export const validatePhone = (phone) => {
  const value = trimText(phone)
  if (!value) return true
  return /^\d{11}$/.test(value)
}

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

export const localDateStamp = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

export const isFutureDate = (value) => {
  if (!isValidDate(value)) return false
  return String(value).slice(0, 10) > localDateStamp()
}

export const isValidTime = (value) =>
  /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(trimText(value))

// PostgREST treats comma, parenthesis and period as logic-tree syntax in
// `.or()` filters. Stripping them (rather than trying to escape every
// PostgREST version) prevents a search query from injecting extra filters.
export const sanitizeSearchTerm = (value, maxLength = 100) =>
  trimText(value)
    .replace(/[,().:"]/g, ' ')
    .replace(/[\\%_]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
    .trim()

export const maxLength = (value, max) => trimText(value).length <= max

const addTextError = (errors, field, value, { required = false, min = 0, max = 255, label = field } = {}) => {
  if (isBlank(value)) {
    if (required) errors[field] = `${label} is required.`
    return
  }
  const text = trimText(value)
  if (text.length < min) errors[field] = `${label} must be at least ${min} characters.`
  else if (text.length > max) errors[field] = `${label} must be ${max} characters or fewer.`
}

const addOptionalEnumError = (errors, field, value, allowed, label = field) => {
  if (value === undefined || value === null || value === '') return
  if (!allowed.includes(value)) {
    errors[field] = `Select a valid ${label.toLowerCase()}.`
  }
}

const addOptionalNumberError = (errors, field, value, { min, max, integer = false, label = field } = {}) => {
  if (value === undefined || value === null || value === '') return
  const number = Number(value)
  if (!Number.isFinite(number)) {
    errors[field] = `${label} must be a number.`
    return
  }
  if (integer && !Number.isInteger(number)) errors[field] = `${label} must be a whole number.`
  else if (min !== undefined && number < min) errors[field] = `${label} must be at least ${min}.`
  else if (max !== undefined && number > max) errors[field] = `${label} must be ${max} or less.`
}

const addOptionalDateError = (errors, field, value, { future = true, label = field } = {}) => {
  if (value === undefined || value === null || value === '') return
  if (!isValidDate(value)) errors[field] = `Enter a valid ${label.toLowerCase()}.`
  else if (future && isFutureDate(value)) errors[field] = `${label} cannot be in the future.`
}

export const validatePassword = (value, field = 'password', { required = true, min = 6 } = {}) => {
  const errors = {}
  if (isBlank(value)) {
    if (required) errors[field] = 'Password is required.'
    return errors
  }
  if (String(value).length < min) errors[field] = `Password must be at least ${min} characters.`
  if (String(value).length > 128) errors[field] = 'Password must be 128 characters or fewer.'
  return errors
}

export const validateLoginPayload = (body = {}) => {
  const errors = {}
  const identifier = trimText(body.email ?? body.username)
  if (!identifier) errors.email = 'Email or username is required.'
  else if (identifier.length > 254) errors.email = 'Email or username is too long.'
  if (isBlank(body.password)) errors.password = 'Password is required.'
  else if (String(body.password).length > 128) errors.password = 'Password is too long.'
  return errors
}

export const validateAdminRegistration = (body = {}) => {
  const errors = {}
  addTextError(errors, 'name', body.name, { required: true, min: 2, max: 120, label: 'Name' })
  addTextError(errors, 'email', body.email, { required: true, max: 254, label: 'Email' })
  if (!isBlank(body.email) && !validateEmail(body.email)) errors.email = 'Enter a valid email address.'
  Object.assign(errors, validatePassword(body.password))
  return errors
}

export const validateChangePassword = (body = {}) => validatePassword(body.newPassword, 'newPassword')

// partial=true validates only keys present in the payload (PUT/PATCH).
export const validateResidentPayload = (body = {}, { partial = false } = {}) => {
  const errors = {}
  const has = (key) => Object.prototype.hasOwnProperty.call(body, key)

  if (!partial || has('name')) {
    addTextError(errors, 'name', body.name, { required: true, min: 2, max: 120, label: 'Full name' })
  }
  if (!partial || has('dateOfBirth')) {
    if (isBlank(body.dateOfBirth)) errors.dateOfBirth = 'Date of birth is required.'
    else addOptionalDateError(errors, 'dateOfBirth', body.dateOfBirth, { label: 'Date of birth' })
  }
  if (!partial || has('gender')) {
    if (isBlank(body.gender)) errors.gender = 'Gender is required.'
    else addOptionalEnumError(errors, 'gender', body.gender, GENDERS, 'Gender')
  }
  if (has('civilStatus')) addOptionalEnumError(errors, 'civilStatus', body.civilStatus, CIVIL_STATUSES, 'civil status')
  if (has('age')) addOptionalNumberError(errors, 'age', body.age, { min: 0, max: 150, integer: true, label: 'Age' })
  if (has('purokId') && body.purokId != null && String(body.purokId).length > 50) {
    errors.purokId = 'Select a valid purok.'
  }
  for (const field of ['contactNumber', 'contactPersonNumber']) {
    if (has(field) && !isBlank(body[field]) && !validatePhone(body[field])) {
      errors[field] = PHONE_ERROR
    }
  }
  if (has('contactPerson')) addTextError(errors, 'contactPerson', body.contactPerson, { max: 120, label: 'Contact person' })
  if (has('contactPersonAddress')) addTextError(errors, 'contactPersonAddress', body.contactPersonAddress, { max: 255, label: 'Contact person address' })
  if (has('lastCheckup')) addOptionalDateError(errors, 'lastCheckup', body.lastCheckup, { label: 'Checkup date' })
  if (has('focusGroups')) {
    if (!Array.isArray(body.focusGroups)) errors.focusGroups = 'Focus groups must be a list.'
    else {
      if (body.focusGroups.some((group) => !FOCUS_GROUPS.includes(group))) {
        errors.focusGroups = 'One or more focus groups are invalid.'
      }
      if (new Set(body.focusGroups).size !== body.focusGroups.length) {
        errors.focusGroups = 'Focus groups cannot contain duplicates.'
      }
    }
  }
  if (has('isPwd') && typeof body.isPwd !== 'boolean') errors.isPwd = 'PWD status must be true or false.'
  if (has('motherName')) addTextError(errors, 'motherName', body.motherName, { max: 120, label: "Mother's name" })
  if (has('fatherName')) addTextError(errors, 'fatherName', body.fatherName, { max: 120, label: "Father's name" })
  if (has('disabilityType')) addTextError(errors, 'disabilityType', body.disabilityType, { max: 200, label: 'Disability details' })

  const pwdSelected =
    (Array.isArray(body.focusGroups) && body.focusGroups.includes('pwd')) || body.isPwd === true
  // On create, PWD status always requires disability details. On partial
  // updates, require them whenever the caller is (re)asserting PWD status.
  const pwdNeedsDetails =
    pwdSelected && (!partial || has('disabilityType') || has('focusGroups') || has('isPwd'))
  if (pwdNeedsDetails && isBlank(body.disabilityType)) {
    errors.disabilityType = 'Specify the disability for PWD residents.'
  }
  return errors
}

export const validateMedicalHistoryPayload = (body = {}) => {
  const errors = {}
  if (!isBlank(body.date)) addOptionalDateError(errors, 'date', body.date, { label: 'Visit date' })
  addTextError(errors, 'type', body.type, { required: true, max: 100, label: 'Visit type' })
  addTextError(errors, 'location', body.location, { max: 150, label: 'Location' })
  addTextError(errors, 'facility', body.facility, { max: 150, label: 'Facility' })
  addTextError(errors, 'diagnosis', body.diagnosis, { max: 2000, label: 'Diagnosis' })
  addTextError(errors, 'treatment', body.treatment, { max: 2000, label: 'Treatment' })
  addTextError(errors, 'notes', body.notes, { max: 5000, label: 'Notes' })
  addTextError(errors, 'administered_by', body.administered_by, { max: 120, label: 'Administered by' })

  if (body.vitalSigns && typeof body.vitalSigns === 'object') {
    const vitals = body.vitalSigns
    if (!isBlank(vitals.bloodPressure) && !/^\d{2,3}\s*\/\s*\d{2,3}$/.test(trimText(vitals.bloodPressure))) {
      errors.bloodPressure = 'Blood pressure must look like 120/80.'
    }
    addOptionalNumberError(errors, 'heartRate', vitals.heartRate, { min: 20, max: 300, label: 'Heart rate' })
    addOptionalNumberError(errors, 'temperature', vitals.temperature, { min: 25, max: 50, label: 'Temperature' })
    addOptionalNumberError(errors, 'weight', vitals.weight, { min: 0.1, max: 500, label: 'Weight' })
    addOptionalNumberError(errors, 'height', vitals.height, { min: 10, max: 300, label: 'Height' })
    addOptionalNumberError(errors, 'bloodSugar', vitals.bloodSugar, { min: 0, max: 1000, label: 'Blood sugar' })
    addOptionalNumberError(errors, 'bmi', vitals.bmi, { min: 0, max: 200, label: 'BMI' })
  }
  return errors
}

export const validatePurokPayload = (body = {}, { partial = false } = {}) => {
  const errors = {}
  const has = (key) => Object.prototype.hasOwnProperty.call(body, key)
  if (!partial || has('name')) {
    addTextError(errors, 'name', body.name, { required: true, min: 1, max: 100, label: 'Purok name' })
  }
  return errors
}

export const validatePurokLocationPayload = (body = {}) => {
  const errors = {}
  const hasCoords =
    body.latitude !== undefined && body.latitude !== null && body.latitude !== '' &&
    body.longitude !== undefined && body.longitude !== null && body.longitude !== ''
  const hasLabel = body.pinLabel !== undefined && body.pinLabel !== null
  if (!hasCoords && !hasLabel) errors.latitude = 'Latitude and longitude are required.'
  if (hasCoords) {
    const lat = Number(body.latitude)
    const lng = Number(body.longitude)
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) errors.latitude = 'Latitude must be between -90 and 90.'
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) errors.longitude = 'Longitude must be between -180 and 180.'
  }
  if (hasLabel && trimText(body.pinLabel).length > 3) errors.pinLabel = 'Pin label must be 3 characters or fewer.'
  return errors
}

export const validateMedicinePayload = (body = {}, { partial = false } = {}) => {
  const errors = {}
  const has = (key) => Object.prototype.hasOwnProperty.call(body, key)
  if (!partial || has('medicine_name')) {
    addTextError(errors, 'medicine_name', body.medicine_name, { required: true, min: 2, max: 120, label: 'Medicine name' })
  }
  if (!partial || has('category')) {
    if (isBlank(body.category)) errors.category = 'Category is required.'
    else if (!MEDICINE_CATEGORIES.includes(body.category)) {
      errors.category = `Category must be one of: ${MEDICINE_CATEGORIES.join(', ')}.`
    }
  }
  if (!partial || has('total_doses')) {
    addOptionalNumberError(errors, 'total_doses', body.total_doses ?? 1, { min: 1, max: 50, integer: true, label: 'Total doses' })
  }
  if (has('target_group')) addOptionalEnumError(errors, 'target_group', body.target_group, MEDICINE_TARGET_GROUPS, 'target group')
  if (has('description')) addTextError(errors, 'description', body.description, { max: 1000, label: 'Description' })
  if (has('requires_interval') && typeof body.requires_interval !== 'boolean') {
    errors.requires_interval = 'Requires interval must be true or false.'
  }
  if (has('dose_intervals')) {
    if (body.dose_intervals !== null && !Array.isArray(body.dose_intervals)) {
      errors.dose_intervals = 'Dose intervals must be a list.'
    } else if (Array.isArray(body.dose_intervals)) {
      for (const interval of body.dose_intervals) {
        if (interval?.description && trimText(interval.description).length > 500) {
          errors.dose_intervals = 'Dose descriptions must be 500 characters or fewer.'
          break
        }
      }
    }
  }
  return errors
}

export const validateSchedulePayload = (body = {}, { partial = false } = {}) => {
  const errors = {}
  const has = (key) => Object.prototype.hasOwnProperty.call(body, key)
  if (!partial || has('scope')) {
    if (isBlank(body.scope)) errors.scope = 'Schedule scope is required.'
    else if (!SCHEDULE_SCOPES.includes(body.scope)) errors.scope = 'Select a valid schedule scope.'
  }
  if (!partial || has('date')) {
    if (isBlank(body.date)) errors.date = 'Date is required.'
    else if (!isValidDate(body.date)) errors.date = 'Enter a valid schedule date.'
  }
  if (!partial || has('time')) {
    if (isBlank(body.time)) errors.time = 'Time is required.'
    else if (!isValidTime(body.time)) errors.time = 'Enter a valid time.'
  }
  if (!partial || has('type')) {
    addTextError(errors, 'type', body.type, { required: true, max: 100, label: 'Schedule type' })
  }
  if (has('status')) addOptionalEnumError(errors, 'status', body.status, SCHEDULE_STATUSES, 'status')
  if (has('duration')) addOptionalNumberError(errors, 'duration', body.duration, { min: 5, max: 1440, integer: true, label: 'Duration' })
  if (has('purpose')) addTextError(errors, 'purpose', body.purpose, { max: 500, label: 'Purpose' })
  if (has('notes')) addTextError(errors, 'notes', body.notes, { max: 5000, label: 'Notes' })
  if (has('locationDetails')) addTextError(errors, 'locationDetails', body.locationDetails, { max: 500, label: 'Location details' })
  if (has('contactPerson')) addTextError(errors, 'contactPerson', body.contactPerson, { max: 120, label: 'Contact person' })
  for (const field of ['contactNumber', 'residentContactNumber', 'coordinatorContact']) {
    if (has(field) && !isBlank(body[field]) && !validatePhone(body[field])) {
      errors[field] = PHONE_ERROR
    }
  }
  if (has('programName')) addTextError(errors, 'programName', body.programName, { max: 200, label: 'Program name' })
  if (has('programDescription')) addTextError(errors, 'programDescription', body.programDescription, { max: 2000, label: 'Program description' })
  if (has('venue')) addTextError(errors, 'venue', body.venue, { max: 200, label: 'Venue' })
  if (has('coordinatorName')) addTextError(errors, 'coordinatorName', body.coordinatorName, { max: 120, label: 'Coordinator name' })
  if (has('partnerOrganization')) addTextError(errors, 'partnerOrganization', body.partnerOrganization, { max: 200, label: 'Partner organization' })
  if (has('targetCount')) addOptionalNumberError(errors, 'targetCount', body.targetCount, { min: 0, max: 100000, integer: true, label: 'Target count' })
  if (has('maxParticipants')) addOptionalNumberError(errors, 'maxParticipants', body.maxParticipants, { min: 1, max: 100000, integer: true, label: 'Maximum participants' })
  if (!partial) {
    if (body.scope === 'individual' && isBlank(body.residentId)) errors.residentId = 'Select a resident for an individual schedule.'
    if (body.scope === 'purok' && isBlank(body.purokId)) errors.purokId = 'Select a purok for a purok schedule.'
  }
  return errors
}

export const validateParticipantPayload = (body = {}, { requireResident = false } = {}) => {
  const errors = {}
  if (requireResident && isBlank(body.residentId)) errors.residentId = 'Resident is required.'
  if (body.notes !== undefined) addTextError(errors, 'notes', body.notes, { max: 1000, label: 'Notes' })
  if (body.status !== undefined && !['Registered', 'Completed', 'Cancelled'].includes(body.status)) {
    errors.status = 'Select a valid participant status.'
  }
  if (body.attendanceStatus !== undefined && !['Pending', 'Present', 'Absent'].includes(body.attendanceStatus)) {
    errors.attendanceStatus = 'Select a valid attendance status.'
  }
  return errors
}

export const validateBhwPayload = (body = {}, { partial = false } = {}) => {
  const errors = {}
  const has = (key) => Object.prototype.hasOwnProperty.call(body, key)
  if (!partial || has('name')) {
    addTextError(errors, 'name', body.name, { required: true, min: 2, max: 120, label: 'Name' })
  }
  if (has('position')) addTextError(errors, 'position', body.position, { max: 120, label: 'Position' })
  if (has('email')) {
    if (!isBlank(body.email) && !validateEmail(body.email)) {
      errors.email = 'Enter a valid email address.'
    } else if (trimText(body.email).length > 254) {
      errors.email = 'Email must be 254 characters or fewer.'
    }
  }
  if (has('contactNumber') && !isBlank(body.contactNumber) && !validatePhone(body.contactNumber)) {
    errors.contactNumber = PHONE_ERROR
  }
  if (has('username') && !isBlank(body.username)) {
    const username = trimText(body.username)
    if (username.length < 3) errors.username = 'Username must be at least 3 characters.'
    else if (username.length > 254) errors.username = 'Username must be 254 characters or fewer.'
  }
  if (has('assignedPurokId') && body.assignedPurokId != null && String(body.assignedPurokId).length > 50) {
    errors.assignedPurokId = 'Select a valid purok.'
  }
  if (has('password') && !isBlank(body.password)) {
    Object.assign(errors, validatePassword(body.password, 'password'))
  }
  if (has('workerType') && body.workerType !== undefined && !['BHW', 'Doctor', 'Midwife', 'Nurse'].includes(body.workerType)) {
    errors.workerType = 'Select a valid worker type.'
  }
  if (has('status') && body.status !== undefined && !['Active', 'Inactive'].includes(body.status)) {
    errors.status = 'Select a valid status.'
  }
  return errors
}

export const firstError = (errors = {}) => {
  const [field, message] = Object.entries(errors)[0] || []
  return message ? { field, message } : null
}

// Controllers use this to return a consistent validation response.
export const sendValidationError = (res, errors, message = 'Please correct the highlighted fields.') => {
  const first = firstError(errors)
  return res.status(400).json({
    success: false,
    message: first ? `${first.message}` : message,
    errors,
  })
}

// Retained for backwards compatibility with older imports.
export const validateRequired = (fields, body) => {
  const missing = []
  for (const field of fields) {
    if (!body?.[field] && body?.[field] !== 0) missing.push(field)
  }
  return missing
}
