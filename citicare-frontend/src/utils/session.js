// utils/session.js
// Shared session storage keys and inactivity helpers.

export const TOKEN_KEY = 'token'
export const USER_KEY = 'user'
export const LAST_ACTIVITY_KEY = 'citicare:lastActivity'

export const IDLE_TIMEOUT_MS = 15 * 60 * 1000
export const ACTIVITY_PERSIST_INTERVAL_MS = 5 * 1000
export const IDLE_CHECK_INTERVAL_MS = 30 * 1000

export const readLastActivity = () => {
  try {
    const value = Number(window.localStorage.getItem(LAST_ACTIVITY_KEY))
    return Number.isFinite(value) && value > 0 ? value : 0
  } catch {
    return 0
  }
}

export const touchLastActivity = (timestamp = Date.now()) => {
  try {
    window.localStorage.setItem(LAST_ACTIVITY_KEY, String(timestamp))
  } catch {
    // Storage can be unavailable (private mode/quota); the in-memory timer still works.
  }
}

export const clearLastActivity = () => {
  try {
    window.localStorage.removeItem(LAST_ACTIVITY_KEY)
  } catch {
    // Ignore storage failures while clearing.
  }
}

export const clearSessionStorage = () => {
  try {
    window.localStorage.removeItem(TOKEN_KEY)
    window.localStorage.removeItem(USER_KEY)
  } catch {
    // Ignore storage failures while clearing.
  }
  clearLastActivity()
}
