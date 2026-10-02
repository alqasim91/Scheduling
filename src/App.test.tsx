import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import App from './App.tsx'
import { createEmptySchedule } from './model/defaults.ts'
import { serializeSchedule } from './persistence/json.ts'
import { STORAGE_KEY } from './persistence/useAutosave.ts'

beforeEach(() => {
  localStorage.clear()
})

describe('App', () => {
  it('renders the toolbar and the sample summary on first launch', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: 'New' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open…' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save JSON' })).toBeInTheDocument()
    expect(screen.getByTestId('summary-mode')).toHaveTextContent('track-grid')
    // First launch (no autosave) starts from the Cairo sample.
    expect(screen.getByLabelText('Event title')).toHaveValue('Google for Developers Day: Cairo')
    expect(screen.getByTestId('summary-columns')).toHaveTextContent('2')
    expect(screen.getByTestId('summary-rows')).toHaveTextContent('9')
    expect(screen.getByTestId('summary-items')).toHaveTextContent('12')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('editing the title updates the input and the summary', async () => {
    const user = userEvent.setup()
    render(<App />)
    const input = screen.getByLabelText('Event title')
    await user.clear(input)
    await user.type(input, 'Cairo Day')
    expect(input).toHaveValue('Cairo Day')
    expect(screen.getByTitle('Preview').getAttribute('srcdoc')).toContain('Cairo Day')
  })

  it('autosaves the edited title to localStorage', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<App />)
    const input = screen.getByLabelText('Event title')
    await user.clear(input)
    await user.type(input, 'Persisted')
    unmount() // flushes pending write
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    expect(stored.event.title).toBe('Persisted')
  })

  it('restores the autosaved schedule on load', () => {
    const s = createEmptySchedule()
    s.event.title = 'Restored'
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
    render(<App />)
    expect(screen.getByLabelText('Event title')).toHaveValue('Restored')
  })

  it('New resets to an empty schedule', async () => {
    const user = userEvent.setup()
    render(<App />)
    const input = screen.getByLabelText('Event title')
    await user.clear(input)
    await user.type(input, 'Throwaway')
    await user.click(screen.getByRole('button', { name: 'New' }))
    expect(input).toHaveValue('Untitled event')
    expect(screen.getByTestId('summary-items')).toHaveTextContent('0')
  })

  it('Open with invalid JSON shows an alert and keeps state', async () => {
    const user = userEvent.setup()
    render(<App />)
    const input = screen.getByLabelText('Event title')
    await user.clear(input)
    await user.type(input, 'Keep me')

    const file = new File(['{ definitely not json'], 'bad.json', { type: 'application/json' })
    await user.upload(screen.getByTestId('open-file'), file)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/Not valid JSON/)
    expect(input).toHaveValue('Keep me')
  })

  it('Open with a schema-invalid file lists path: message errors', async () => {
    const user = userEvent.setup()
    render(<App />)
    const bad = { ...createEmptySchedule(), mode: 'nope' }
    await user.upload(
      screen.getByTestId('open-file'),
      new File([JSON.stringify(bad)], 'bad.json', { type: 'application/json' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(/mode:/)
  })

  it('Open with a valid file replaces state and clears the alert', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.upload(screen.getByTestId('open-file'), new File(['nope'], 'bad.json', { type: 'application/json' }))
    await screen.findByRole('alert')

    const s = createEmptySchedule()
    s.event.title = 'From file'
    await user.upload(
      screen.getByTestId('open-file'),
      new File([serializeSchedule(s)], 'good.json', { type: 'application/json' }),
    )
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(screen.getByLabelText('Event title')).toHaveValue('From file')
  })
})
