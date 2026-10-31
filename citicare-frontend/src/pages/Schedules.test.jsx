import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Schedules from './Schedules'

const residents = [
  { id: 85, name: 'Test Resident', age: 34, gender: 'Female', purok: 'Purok 1', contactNumber: '09170000000', focusGroups: [] },
]
const bhws = [
  { id: 3, name: 'Juan Ramirez', position: 'Barangay Health Worker', status: 'Active', contactNumber: '09170000001' },
]

// The schedule the backend would return after the create request. The first
// GET (page mount) returns nothing, the GET issued by the post-save refresh
// returns it — the exact flow that used to hide new schedules.
const createdSchedule = {
  id: 99,
  scope: 'individual',
  date: '2026-12-29',
  time: '10:00',
  type: 'Checkup',
  status: 'Scheduled',
  duration: 30,
  residentId: 85,
  residentName: 'Test Resident',
  residentAge: 34,
  residentGender: 'Female',
  leadBhwName: 'Juan Ramirez',
}

vi.mock('../api/scheduleApi', () => ({
  scheduleApi: {
    getAll: vi.fn(() => Promise.resolve({ data: { success: true, data: [] } })),
    getById: vi.fn(() => Promise.resolve({ data: { success: true, data: {} } })),
    create: vi.fn(() => Promise.resolve({ data: { success: true, data: { schedule_id: 99 } } })),
    update: vi.fn(() => Promise.resolve({ data: { success: true } })),
    delete: vi.fn(() => Promise.resolve({ data: { success: true } })),
  },
}))
vi.mock('../api/residentApi', () => ({
  residentApi: { getAll: vi.fn(() => Promise.resolve({ data: { success: true, data: residents } })) },
}))
vi.mock('../api/bhwApi', () => ({
  bhwApi: { getAll: vi.fn(() => Promise.resolve({ data: { success: true, data: bhws } })) },
}))
vi.mock('../api/purokApi', () => ({
  purokApi: { getAll: vi.fn(() => Promise.resolve({ data: { success: true, data: [] } })) },
}))

const { scheduleApi } = await import('../api/scheduleApi')
const { dialog } = await import('../context/DialogContext')
dialog.error = vi.fn()
dialog.toast = vi.fn()
dialog.info = vi.fn()
dialog.confirm = vi.fn(() => Promise.resolve(true))

describe('Schedules create flow', () => {
  beforeAll(() => {
    // jsdom has no canvas; GlassSelect only uses it to measure option text.
    HTMLCanvasElement.prototype.getContext = () => ({
      font: '',
      measureText: (text) => ({ width: String(text ?? '').length * 7 }),
    })
  })

  beforeEach(() => {
    vi.clearAllMocks()
    let listCalls = 0
    scheduleApi.getAll.mockImplementation(() => {
      listCalls += 1
      const data = listCalls === 1 ? [] : [createdSchedule]
      return Promise.resolve({ data: { success: true, data } })
    })
    scheduleApi.create.mockResolvedValue({ data: { success: true, data: { schedule_id: 99 } } })
  })

  it('creates a schedule and shows it after the list refresh', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <Schedules />
      </MemoryRouter>,
    )

    await waitFor(() => expect(scheduleApi.getAll).toHaveBeenCalledTimes(1))
    expect(screen.getByText('No schedules found')).toBeInTheDocument()

    await user.click(screen.getByTitle('New Schedule'))

    const modal = await screen.findByRole('dialog')
    expect(within(modal).getByText('New Schedule')).toBeInTheDocument()

    // Resident picker (free-text combobox)
    const residentInput = within(modal).getByPlaceholderText('Select resident...')
    await user.click(residentInput)
    await user.type(residentInput, 'Test')
    const residentOption = await screen.findByTitle(/Test Resident/)
    fireEvent.click(residentOption)
    await waitFor(() => expect(residentInput.value).toContain('Test Resident'))

    // Date and time
    const dateInput = within(modal).getAllByLabelText(/^Date/)[0]
    const timeInput = within(modal).getAllByLabelText(/^Time/)[0]
    fireEvent.change(dateInput, { target: { value: '2026-12-29' } })
    fireEvent.change(timeInput, { target: { value: '10:00' } })

    // Type select
    const typeInput = within(modal).getAllByPlaceholderText('Choose type...')[0]
    await user.click(typeInput)
    const typeOption = await screen.findByTitle('Checkup')
    fireEvent.click(typeOption)

    // BHW picker
    const bhwInput = within(modal).getAllByPlaceholderText('Type or pick name...')[1]
    fireEvent.change(bhwInput, { target: { value: 'Juan Ramirez' } })

    await user.click(within(modal).getByRole('button', { name: /Create Schedule/i }))

    await waitFor(() => expect(scheduleApi.create).toHaveBeenCalledTimes(1))
    expect(dialog.error).not.toHaveBeenCalled()

    // The create payload carries the schedule the user filled in.
    const payload = scheduleApi.create.mock.calls[0][0]
    expect(payload).toMatchObject({
      scope: 'individual',
      residentId: '85',
      date: '2026-12-29',
      time: '10:00',
      type: 'Checkup',
    })
    expect(payload.assignedBhws?.[0]).toMatchObject({ bhwId: '3' })

    // Saving triggers a re-fetch, and the newly created schedule is rendered
    // in the list instead of the empty state.
    await waitFor(() => expect(scheduleApi.getAll).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('Test Resident')).toBeInTheDocument()
    expect(screen.queryByText('No schedules found')).not.toBeInTheDocument()
    expect(dialog.toast).toHaveBeenCalledWith('Schedule created successfully.', 'success')
  })
})
