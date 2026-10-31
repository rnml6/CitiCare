import { describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToastProvider, useToast } from './Toast'

const Trigger = () => {
  const { addToast } = useToast()
  return (
    <button type="button" onClick={() => addToast('Saved successfully', 1000)}>Add success</button>
  )
}

const renderToasts = () => render(
  <ToastProvider>
    <Trigger />
  </ToastProvider>
)

describe('Success snackbars', () => {
  it('announces a success message with status semantics', async () => {
    const user = userEvent.setup()
    renderToasts()
    await user.click(screen.getByRole('button', { name: 'Add success' }))
    expect(screen.getByRole('status')).toHaveTextContent('Saved successfully')
  })

  it('auto-dismisses after its own duration', () => {
    vi.useFakeTimers()
    try {
      renderToasts()
      act(() => {
        screen.getByRole('button', { name: 'Add success' }).click()
      })
      expect(screen.getByRole('status')).toBeInTheDocument()
      act(() => { vi.advanceTimersByTime(1400) })
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('can be dismissed manually with an accessible button', async () => {
    const user = userEvent.setup()
    renderToasts()
    await user.click(screen.getByRole('button', { name: 'Add success' }))
    await user.click(screen.getByRole('button', { name: 'Dismiss notification' }))
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 350)) })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
