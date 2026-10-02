import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import App from '../../App.tsx'
import { createEmptySchedule } from '../../model/defaults.ts'
import { STORAGE_KEY } from '../../persistence/useAutosave.ts'
import { addItem } from '../ops.ts'

const card = (title: string) => screen.getByRole('button', { name: new RegExp(`^${title}`) })

beforeEach(() => localStorage.clear())

describe('tiny cards', () => {
  it('at compact zoom a card under about 14px is marked tiny; longer ones keep all four handles', () => {
    const base = createEmptySchedule()
    const track = base.columns[0]!.id
    let s = addItem(base, [track], '09:00', '09:10', { title: 'Blink' })
    s = addItem(s, [track], '10:00', '11:00', { title: 'Long' })
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
    localStorage.setItem('schedule-builder:board-zoom', 'compact')
    render(<App />)
    expect(card('Blink').classList.contains('board-card--tiny')).toBe(true)
    expect(card('Long').classList.contains('board-card--tiny')).toBe(false)
    expect(card('Long').querySelectorAll('[data-handle]')).toHaveLength(4)
    // The tiny class only hides handles in CSS: the bottom one stays and the body is the drag target.
    expect(card('Blink').querySelector('[data-handle="bottom"]')).not.toBeNull()
  })

  it('comfortable zoom gives the same ten minutes enough room, so it is not tiny', async () => {
    const base = createEmptySchedule()
    const s = addItem(base, [base.columns[0]!.id], '09:00', '09:10', { title: 'Blink' })
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Comfortable' }))
    expect(card('Blink').classList.contains('board-card--tiny')).toBe(false)
  })
})
