import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DialogProvider, dialog } from './DialogContext'
import { ToastProvider } from '../components/Toast'
import { ModalStackProvider } from './ModalStackContext'

const renderDialogs = () => render(
  <ModalStackProvider>
    <ToastProvider>
      <DialogProvider>
        <div>Application</div>
      </DialogProvider>
    </ToastProvider>
  </ModalStackProvider>
)

describe('central dialog service', () => {
  it('resolves a confirmation true only after the confirm button is pressed', async () => {
    const user = userEvent.setup()
    renderDialogs()
    let result
    act(() => {
      result = dialog.confirm({
        title: 'Delete resident',
        message: 'This cannot be undone.',
        confirmText: 'Delete',
      })
    })

    expect(screen.getByRole('dialog', { name: 'Delete resident' })).toBeInTheDocument()
    expect(screen.getByText('This cannot be undone.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await expect(result).resolves.toBe(true)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('resolves false on cancel and Escape', async () => {
    const user = userEvent.setup()
    renderDialogs()

    let cancelled
    act(() => { cancelled = dialog.confirm({ title: 'Cancel me', message: 'Sure?' }) })
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await expect(cancelled).resolves.toBe(false)

    let escaped
    act(() => { escaped = dialog.confirm({ title: 'Escape me', message: 'Sure?' }) })
    fireEvent.keyDown(window, { key: 'Escape' })
    await expect(escaped).resolves.toBe(false)
  })

  it('deduplicates same-tick confirmations so destructive work only runs once', async () => {
    const user = userEvent.setup()
    renderDialogs()

    let first
    let second
    act(() => {
      first = dialog.confirm({ title: 'Delete once', message: 'One action only.', confirmText: 'Delete' })
      second = dialog.confirm({ title: 'Delete once', message: 'One action only.', confirmText: 'Delete' })
    })

    await expect(second).resolves.toBe(false)
    expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await expect(first).resolves.toBe(true)
  })

  it('validates required prompt input, focuses the field, and returns the submitted value', async () => {
    const user = userEvent.setup()
    renderDialogs()

    let result
    act(() => { result = dialog.prompt({ label: 'Reason', title: 'Add note' }) })
    const input = screen.getByLabelText(/Reason/)
    await waitFor(() => expect(input).toHaveFocus())

    await user.click(screen.getByRole('button', { name: 'Submit' }))
    expect(screen.getByRole('alert')).toHaveTextContent('This field is required.')
    expect(input).toHaveFocus()

    await user.type(input, '  Follow-up visit  ')
    await user.click(screen.getByRole('button', { name: 'Submit' }))
    await expect(result).resolves.toBe('Follow-up visit')
  })

  it('supports custom prompt validation', async () => {
    const user = userEvent.setup()
    renderDialogs()
    let result
    act(() => {
      result = dialog.prompt({
        label: 'Phone',
        title: 'Contact',
        validate: (value) => (/^09\d{9}$/.test(value) ? '' : 'Enter a valid mobile number.'),
      })
    })
    await user.type(screen.getByLabelText(/Phone/), '123')
    await user.click(screen.getByRole('button', { name: 'Submit' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid mobile number.')
    await user.clear(screen.getByLabelText(/Phone/))
    await user.type(screen.getByLabelText(/Phone/), '09171234567')
    await user.click(screen.getByRole('button', { name: 'Submit' }))
    await expect(result).resolves.toBe('09171234567')
  })

  it('keeps the confirmation open and shows the error when async onConfirm fails', async () => {
    const user = userEvent.setup()
    renderDialogs()
    const onConfirm = vi.fn().mockRejectedValue(new Error('Server unavailable'))
    let result
    act(() => {
      result = dialog.confirm({ title: 'Retry save', message: 'Save changes?', confirmText: 'Save', onConfirm })
    })
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Server unavailable'))
    expect(screen.getByRole('dialog', { name: 'Retry save' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await expect(result).resolves.toBe(false)
  })

  it('shows a non-dismissible loading dialog that the caller can close', () => {
    renderDialogs()
    let close
    act(() => { close = dialog.loading({ message: 'Saving changes…' }) })
    expect(screen.getByRole('dialog', { name: 'Message' })).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.getByRole('dialog', { name: 'Message' })).toBeInTheDocument()
    act(() => close())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('uses the header close button instead of a redundant OK for titled messages', async () => {
    const user = userEvent.setup()
    renderDialogs()

    let info
    act(() => { info = dialog.error('Could not save.', 'Save failed') })
    expect(screen.getByRole('dialog', { name: 'Save failed' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'OK' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Close dialog' }))
    await info

    act(() => { dialog.toast('Resident added.', 'success', 4000) })
    expect(screen.getByRole('status')).toHaveTextContent('Resident added.')
  })

  it('renders a Close button when the message dialog has no header close', async () => {
    const user = userEvent.setup()
    renderDialogs()

    let result
    act(() => { result = dialog.alert('Heads up') })
    expect(screen.queryByRole('button', { name: 'Close dialog' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Close' }))
    await result
  })

  it('keeps snackbars success-only and promotes other toast requests to a dialog', async () => {
    const user = userEvent.setup()
    renderDialogs()

    act(() => { dialog.toast('Could not save resident.', 'error') })

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Message' })).toHaveTextContent('Could not save resident.')
    await user.click(screen.getByRole('button', { name: 'Close' }))
  })
})
