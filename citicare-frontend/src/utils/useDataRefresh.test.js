import { act, renderHook } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { useDataRefresh } from './useDataRefresh'

test('refreshes visible views on focus and on the polling interval', async () => {
  vi.useFakeTimers()
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  const refresh = vi.fn()
  const { unmount } = renderHook(() => useDataRefresh(refresh))

  try {
    await act(async () => {
      window.dispatchEvent(new Event('focus'))
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(refresh).toHaveBeenCalledTimes(1)

    await act(() => vi.advanceTimersByTimeAsync(30000))
    expect(refresh).toHaveBeenCalledTimes(2)

    visibility.mockReturnValue('hidden')
    await act(() => vi.advanceTimersByTimeAsync(30000))
    expect(refresh).toHaveBeenCalledTimes(2)

    unmount()
    visibility.mockReturnValue('visible')
    await act(() => vi.advanceTimersByTimeAsync(30000))
    expect(refresh).toHaveBeenCalledTimes(2)
  } finally {
    visibility.mockRestore()
    vi.useRealTimers()
  }
})
