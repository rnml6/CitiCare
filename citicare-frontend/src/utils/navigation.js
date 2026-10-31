import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

/**
 * Universal "go back to previous page / section / modal" helper.
 *
 * - If there is browser history (user arrived from somewhere inside the app),
 *   goes one step back with navigate(-1) — this restores the exact previous
 *   page, scroll-independent section state, or underlying modal.
 * - If there is no history (deep link / page refresh / direct URL entry),
 *   falls back to a safe default route so Back never leaves the user stranded.
 *
 * Intended for every Back button, Cancel button, and non-embedded Detail
 * error/empty/delete fallback. Modal X / backdrop / Escape already just call
 * onClose, which reveals the previous modal in the stack — leave those as-is.
 */
export const useSmartBack = (fallback = '/dashboard') => {
  const navigate = useNavigate()

  return useCallback(() => {
    if (window.history.length > 1) {
      navigate(-1)
    } else {
      navigate(fallback)
    }
  }, [navigate, fallback])
}

/**
 * Navigate to another page while remembering where we came from, so closing
 * the detail modal there can return to the previous page.
 *
 * Usage: navigateWithReturn(navigate, location, '/residents', { viewResidentId: id })
 */
export const navigateWithReturn = (navigate, location, to, state = {}) => {
  navigate(to, {
    state: {
      ...state,
      from: location?.pathname || null,
    },
  })
}
