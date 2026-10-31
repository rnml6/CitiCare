import { describe, expect, it } from 'vitest'
import {
  LAST_ACTIVITY_KEY,
  TOKEN_KEY,
  USER_KEY,
  clearLastActivity,
  clearSessionStorage,
  readLastActivity,
  touchLastActivity,
} from './session'

describe('session storage helpers', () => {
  it('reads back a stored activity timestamp', () => {
    touchLastActivity(1730000000000)
    expect(localStorage.getItem(LAST_ACTIVITY_KEY)).toBe('1730000000000')
    expect(readLastActivity()).toBe(1730000000000)
  })

  it('treats missing or invalid activity values as zero', () => {
    expect(readLastActivity()).toBe(0)

    localStorage.setItem(LAST_ACTIVITY_KEY, 'not-a-number')
    expect(readLastActivity()).toBe(0)

    localStorage.setItem(LAST_ACTIVITY_KEY, '-5')
    expect(readLastActivity()).toBe(0)
  })

  it('clears only the activity marker', () => {
    touchLastActivity(1730000000000)
    clearLastActivity()
    expect(localStorage.getItem(LAST_ACTIVITY_KEY)).toBeNull()
  })

  it('clears the token, user, and activity marker together', () => {
    localStorage.setItem(TOKEN_KEY, 'token-value')
    localStorage.setItem(USER_KEY, '{"id":1}')
    touchLastActivity(1730000000000)

    clearSessionStorage()

    expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
    expect(localStorage.getItem(USER_KEY)).toBeNull()
    expect(localStorage.getItem(LAST_ACTIVITY_KEY)).toBeNull()
  })
})
