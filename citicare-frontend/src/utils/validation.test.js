import { describe, expect, it, vi } from 'vitest'
import {
  hasErrors,
  isFutureDate,
  isValidDate,
  isValidEmail,
  isValidPhone,
  validateResidentFields,
  validateVitalSigns,
  sanitizeDecimalInput,
  sanitizeIntegerInput,
  sanitizeBloodPressureInput,
  sanitizePhoneInput,
  blockNumericKeys,
  blockIntegerKeys,
  blockBloodPressureKeys,
} from './validation'

describe('frontend validation helpers', () => {
  it('accepts valid dates and flags impossible/future dates', () => {
    expect(isValidDate('2026-02-28')).toBe(true)
    expect(isValidDate('2026-02-30')).toBe(false)
    expect(isFutureDate('2999-01-01')).toBe(true)
    expect(isFutureDate('2020-01-01')).toBe(false)
  })

  it('validates email and 11-digit contact numbers', () => {
    expect(isValidEmail('person@example.com')).toBe(true)
    expect(isValidEmail('bad')).toBe(false)
    expect(isValidPhone('09171234567')).toBe(true)
    expect(isValidPhone('0917 123 4567')).toBe(true)
    expect(isValidPhone('0917123456')).toBe(false)
    expect(isValidPhone('091712345678')).toBe(false)
    expect(isValidPhone('+63917123456')).toBe(false)
    expect(isValidPhone('123')).toBe(false)
    expect(isValidPhone('')).toBe(true)
  })

  it('returns field-specific resident errors', () => {
    const errors = validateResidentFields({
      name: ' ',
      dateOfBirth: '2999-01-01',
      gender: 'Robot',
      contactNumber: 'abc',
      focusGroups: ['pwd'],
      disabilityType: '',
    })
    expect(errors).toMatchObject({
      name: 'Full name is required.',
      dateOfBirth: 'Date of birth cannot be in the future.',
      gender: 'Select a valid gender.',
      contactNumber: 'Contact number must be exactly 11 digits.',
      disabilityType: 'Specify the disability for PWD residents.',
    })
    expect(hasErrors(errors)).toBe(true)
    expect(hasErrors({})).toBe(false)
  })

  it('rejects a checkup date in the future', () => {
    const errors = validateResidentFields({
      name: 'Maria Santos',
      dateOfBirth: '1990-01-01',
      gender: 'Female',
      lastCheckup: '2999-01-01',
    })
    expect(errors.lastCheckup).toBe('Checkup date cannot be in the future.')
  })

  it('returns field-specific errors for blood pressure and vital measurements', () => {
    const errors = validateVitalSigns({
      bloodPressure: '222',
      temperature: '3221323',
      heartRate: '10',
      weight: '0',
      height: '9999',
      bloodSugar: '1001',
    })
    expect(errors).toMatchObject({
      bloodPressure: 'Blood pressure must look like 120/80.',
      temperature: 'Temperature must be between 25 and 50.',
      heartRate: 'Heart rate must be between 20 and 300.',
      weight: 'Weight must be between 0.1 and 500.',
      height: 'Height must be between 10 and 300.',
      bloodSugar: 'Blood sugar must be between 0 and 1000.',
    })
    expect(validateVitalSigns({ bloodPressure: '120/80', temperature: '36.7' })).toEqual({})
  })

  it('strips letters and stray characters from numeric measurements', () => {
    expect(sanitizeDecimalInput('5a8.3b9')).toBe('58.3')
    expect(sanitizeDecimalInput('165.55', { maxDecimals: 1 })).toBe('165.5')
    expect(sanitizeDecimalInput('abc')).toBe('')
    expect(sanitizeIntegerInput('7a5bpm')).toBe('75')
    expect(sanitizeIntegerInput('58.5')).toBe('58')
    expect(sanitizeIntegerInput('heart rate')).toBe('')
  })

  it('keeps blood pressure in systolic/diastolic shape', () => {
    expect(sanitizeBloodPressureInput('12a0/8b0')).toBe('120/80')
    expect(sanitizeBloodPressureInput('120/8/0')).toBe('120/80')
    expect(sanitizeBloodPressureInput('abc')).toBe('')
  })

  it('keeps only digits and caps contact numbers at 11', () => {
    expect(sanitizePhoneInput('+63 (917) abc 123-4567')).toBe('63917123456')
    expect(sanitizePhoneInput('09171234567')).toBe('09171234567')
    expect(sanitizePhoneInput('09171234567890')).toBe('09171234567')
    expect(sanitizePhoneInput('call me')).toBe('')
  })

  it('blocks wrong-type keystrokes before they reach the input', () => {
    const key = (value) => ({
      key: value,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      preventDefault: vi.fn(),
    })

    const letter = key('a')
    blockNumericKeys(letter)
    expect(letter.preventDefault).toHaveBeenCalled()

    const exponent = key('e')
    blockNumericKeys(exponent)
    expect(exponent.preventDefault).toHaveBeenCalled()

    const decimal = key('.')
    blockNumericKeys(decimal)
    expect(decimal.preventDefault).not.toHaveBeenCalled()

    const integerDecimal = key('.')
    blockIntegerKeys(integerDecimal)
    expect(integerDecimal.preventDefault).toHaveBeenCalled()

    const slash = key('/')
    blockBloodPressureKeys(slash)
    expect(slash.preventDefault).not.toHaveBeenCalled()

    const bpLetter = key('x')
    blockBloodPressureKeys(bpLetter)
    expect(bpLetter.preventDefault).toHaveBeenCalled()
  })
})
