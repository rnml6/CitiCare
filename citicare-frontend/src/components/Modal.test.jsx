import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import Modal from './Modal'
import { ModalStackProvider } from '../context/ModalStackContext'

const renderModal = (props = {}) => {
  const onClose = props.onClose || vi.fn()
  render(
    <ModalStackProvider>
      <Modal isOpen onClose={onClose} title="Edit resident" {...props}>
        <button type="button" data-autofocus>First action</button>
        <button type="button">Last action</button>
      </Modal>
    </ModalStackProvider>
  )
  return { onClose }
}

describe('Modal accessibility and dismissal', () => {
  it('renders an accessible dialog and moves focus to the autofocus target', async () => {
    renderModal()
    const dialog = screen.getByRole('dialog', { name: 'Edit resident' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    await waitFor(() => expect(screen.getByRole('button', { name: 'First action' })).toHaveFocus())
  })

  it('closes on Escape once and closes on the backdrop', () => {
    const onClose = vi.fn()
    renderModal({ onClose })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByTestId('modal-backdrop'))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('does not close on Escape or backdrop when disabled', () => {
    const onClose = vi.fn()
    renderModal({ onClose, closeOnEsc: false, closeOnBackdrop: false })
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.click(screen.getByTestId('modal-backdrop'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('traps Tab inside the panel', async () => {
    renderModal()
    const close = screen.getByRole('button', { name: 'Close dialog' })
    const last = screen.getByRole('button', { name: 'Last action' })
    await waitFor(() => expect(screen.getByRole('button', { name: 'First action' })).toHaveFocus())
    last.focus()
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(close).toHaveFocus()
    close.focus()
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true })
    expect(last).toHaveFocus()
  })

  it('locks page scrolling while open and restores focus and scroll on close', async () => {
    const user = userEvent.setup()

    const Harness = () => {
      const [open, setOpen] = useState(false)
      return (
        <ModalStackProvider>
          <button type="button" onClick={() => setOpen(true)}>Open dialog</button>
          <Modal isOpen={open} onClose={() => setOpen(false)} title="Scoped dialog">
            <button type="button" data-autofocus onClick={() => setOpen(false)}>Done</button>
          </Modal>
        </ModalStackProvider>
      )
    }

    render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'Open dialog' })
    trigger.focus()
    await user.click(trigger)
    expect(document.body.style.overflow).toBe('hidden')
    await user.click(screen.getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(document.body.style.overflow).toBe('')
    await waitFor(() => expect(trigger).toHaveFocus())
  })
})
