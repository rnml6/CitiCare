import { afterEach, describe, expect, it, vi } from 'vitest'
import { focusFirstError, focusFirstInvalidField } from './focusInvalidField'

const buildForm = () => {
  document.body.innerHTML = `
    <form>
      <input name="name" value="Ana" />
      <input name="temperature" value="3221323" />
      <input name="weight" value="58" />
    </form>
  `
  return document.querySelector('form')
}

const spyOn = element => {
  const focus = vi.fn()
  const scrollIntoView = vi.fn()
  element.focus = focus
  element.scrollIntoView = scrollIntoView
  return { focus, scrollIntoView }
}

describe('focusInvalidField', () => {
  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('scrolls to and focuses the first field named in the error map', () => {
    const form = buildForm()
    const temperature = form.querySelector('[name="temperature"]')
    const { focus, scrollIntoView } = spyOn(temperature)

    focusFirstError({ temperature: 'Temperature must be between 25 and 50.' }, form)

    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'center',
      inline: 'nearest',
    })
    expect(focus).toHaveBeenCalledWith({ preventScroll: true })
  })

  it('skips empty error entries and targets the next field', () => {
    const form = buildForm()
    const weight = form.querySelector('[name="weight"]')
    const { focus } = spyOn(weight)

    focusFirstError({ name: '', weight: 'Weight is out of range.' }, form)

    expect(focus).toHaveBeenCalled()
  })

  it('reveals the first natively invalid field after a prevented invalid event', () => {
    vi.useFakeTimers()
    const form = buildForm()
    const temperature = form.querySelector('[name="temperature"]')
    const { focus, scrollIntoView } = spyOn(temperature)

    focusFirstInvalidField(temperature)
    vi.runAllTimers()

    expect(scrollIntoView).toHaveBeenCalled()
    expect(focus).toHaveBeenCalled()
  })
})
