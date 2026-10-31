import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { AuthProvider, useAuth } from './AuthContext'
import { authApi } from '../api/authApi'
import {
  IDLE_TIMEOUT_MS,
  LAST_ACTIVITY_KEY,
  TOKEN_KEY,
  USER_KEY,
} from '../utils/session'

vi.mock('../api/authApi', () => ({
  authApi: {
    login: vi.fn(),
    verifyToken: vi.fn(),
  },
}))

const adminUser = { id: 1, email: 'admin@example.com', name: 'Admin', role: 'Administrator' }

const loginResponse = {
  data: {
    success: true,
    data: { user: adminUser, token: 'test-token' },
  },
}

const SessionHarness = () => {
  const { isAuthenticated, sessionExpired, login, logout } = useAuth()

  return (
    <div>
      <span data-testid='auth-status'>{isAuthenticated ? 'in' : 'out'}</span>
      <span data-testid='session-expired'>{String(sessionExpired)}</span>
      <button onClick={() => login('admin@example.com', 'secret')}>login</button>
      <button onClick={() => logout()}>logout</button>
    </div>
  )
}

const renderAuth = () => render(
  <AuthProvider>
    <SessionHarness />
  </AuthProvider>
)

const signIn = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'login' }))
  })
}

describe('AuthProvider inactivity timeout', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    authApi.login.mockResolvedValue(loginResponse)
    authApi.verifyToken.mockResolvedValue({ data: { success: true, data: { user: adminUser } } })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('logs the user out after 15 minutes without activity', async () => {
    renderAuth()
    await signIn()

    expect(screen.getByTestId('auth-status')).toHaveTextContent('in')
    expect(localStorage.getItem(TOKEN_KEY)).toBe('test-token')

    act(() => {
      vi.advanceTimersByTime(IDLE_TIMEOUT_MS + 1)
    })

    expect(screen.getByTestId('auth-status')).toHaveTextContent('out')
    expect(screen.getByTestId('session-expired')).toHaveTextContent('true')
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
    expect(localStorage.getItem(USER_KEY)).toBeNull()
    expect(localStorage.getItem(LAST_ACTIVITY_KEY)).toBeNull()
  })

  it('resets the idle timer when the user is active', async () => {
    renderAuth()
    await signIn()

    act(() => {
      vi.advanceTimersByTime(10 * 60 * 1000)
    })
    fireEvent.mouseMove(window)

    act(() => {
      vi.advanceTimersByTime(10 * 60 * 1000)
    })
    expect(screen.getByTestId('auth-status')).toHaveTextContent('in')

    act(() => {
      vi.advanceTimersByTime(5 * 60 * 1000 + 1)
    })
    expect(screen.getByTestId('auth-status')).toHaveTextContent('out')
  })

  it('logs out immediately when the stored session is already idle', async () => {
    localStorage.setItem(TOKEN_KEY, 'stale-token')
    localStorage.setItem(USER_KEY, JSON.stringify(adminUser))
    localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now() - IDLE_TIMEOUT_MS - 1000))

    renderAuth()
    await act(async () => {
      await Promise.resolve()
    })

    expect(screen.getByTestId('auth-status')).toHaveTextContent('out')
    expect(screen.getByTestId('session-expired')).toHaveTextContent('true')
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
  })

  it('does not flag a manual logout as an expired session', async () => {
    renderAuth()
    await signIn()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'logout' }))
    })

    expect(screen.getByTestId('auth-status')).toHaveTextContent('out')
    expect(screen.getByTestId('session-expired')).toHaveTextContent('false')
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
  })
})
