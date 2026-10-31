import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import GlassInput from './GlassInput'

const TemperatureField = () => {
  const [value, setValue] = useState('3221323')
  return (
    <GlassInput
      label="Temperature (°C)"
      type="number"
      min="25"
      max="50"
      value={value}
      onChange={(event) => setValue(event.target.value)}
    />
  )
}

describe('GlassInput validation feedback', () => {
  it('renders a native constraint message below the field and clears it on change', () => {
    render(<TemperatureField />)
    const input = screen.getByLabelText('Temperature (°C)')

    Object.defineProperty(input, 'validity', {
      configurable: true,
      value: { rangeOverflow: true },
    })
    Object.defineProperty(input, 'validationMessage', {
      configurable: true,
      value: 'Value must be less than or equal to 50.',
    })

    fireEvent.invalid(input)

    const error = screen.getByRole('alert')
    expect(error).toHaveTextContent('Temperature (°C) must be less than or equal to 50.')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input.getAttribute('aria-describedby')).toBe(error.id)

    fireEvent.change(input, { target: { value: '36.7' } })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(input).not.toHaveAttribute('aria-invalid')
  })

  it('renders a supplied field error below the input', () => {
    render(
      <GlassInput
        label="Blood Pressure (BP)"
        value="222"
        onChange={() => {}}
        error="Blood pressure must look like 120/80."
      />
    )

    expect(screen.getByText('Blood pressure must look like 120/80.')).toBeInTheDocument()
    expect(screen.getByLabelText('Blood Pressure (BP)')).toHaveAttribute('aria-invalid', 'true')
  })
})
