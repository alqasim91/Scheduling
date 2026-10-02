import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import App from '../App.tsx'
import { createEmptySchedule } from '../model/defaults.ts'
import { setMode } from './ops.ts'
import { STORAGE_KEY } from '../persistence/useAutosave.ts'

/** A table schedule with three rows (09:00-10:30) and the default Session / Speaker / Tag columns. */
function tableSchedule() {
  let s = setMode(createEmptySchedule(), 'table')
  s = {
    ...s,
    rows: [
      { id: 'r1', start: '09:00', end: '09:30' },
      { id: 'r2', start: '09:30', end: '10:00' },
      { id: 'r3', start: '10:00', end: '10:30' },
    ],
  }
  return s
}

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tableSchedule()))
})

const preview = () => screen.getByTitle('Preview').getAttribute('srcdoc') ?? ''
const rows = () => document.querySelectorAll('tr[data-row-id]')

describe('table editor as a spreadsheet', () => {
  it('is a table with a drag handle, time, one input per column, a note and row actions', () => {
    render(<App />)
    const table = screen.getByRole('table')
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      '',
      'Time',
      'Session (text)',
      'Speaker (person)',
      'Tag (tag)',
      'Note',
      '',
    ])
    expect(rows()).toHaveLength(3)
    expect(screen.getByLabelText('Row 1 start')).toHaveValue('09:00')
    expect(screen.getByLabelText('Row 3 end')).toHaveValue('10:30')
    expect(screen.getByRole('button', { name: 'Drag to reorder row 2' })).toBeInTheDocument()
  })

  it('Enter moves down the same column, Shift+Enter up, and Tab goes along the row', async () => {
    const user = userEvent.setup()
    render(<App />)
    const session = (n: string) => screen.getByLabelText(`Session for row ${n}`)
    await user.click(session('09:00'))
    await user.keyboard('First{Enter}')
    expect(session('09:30')).toHaveFocus()
    await user.keyboard('Second{Enter}')
    expect(session('10:00')).toHaveFocus()
    await user.keyboard('{Shift>}{Enter}{/Shift}')
    expect(session('09:30')).toHaveFocus()
    await user.tab()
    expect(screen.getByLabelText('Speaker for row 09:30')).toHaveFocus()
    await user.tab()
    expect(screen.getByLabelText('Tag for row 09:30')).toHaveFocus()
    await user.tab()
    expect(screen.getByLabelText('Row 2 note')).toHaveFocus()
    expect(preview()).toContain('First')
    expect(preview()).toContain('Second')
  })

  it('Enter on the last row adds a row and moves into it, in the same column', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByLabelText('Speaker for row 10:00'))
    await user.keyboard('Someone{Enter}')
    expect(rows()).toHaveLength(4)
    expect(screen.getByLabelText('Row 4 start')).toHaveValue('10:30')
    expect(screen.getByLabelText('Speaker for row 10:30')).toHaveFocus()
    // Shift+Enter on the first row goes nowhere.
    await user.click(screen.getByLabelText('Session for row 09:00'))
    await user.keyboard('{Shift>}{Enter}{/Shift}')
    expect(screen.getByLabelText('Session for row 09:00')).toHaveFocus()
  })

  it('Alt+Arrow on a row handle moves the row, and the preview follows', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.type(screen.getByLabelText('Session for row 09:30'), 'Middle')
    screen.getByRole('button', { name: 'Drag to reorder row 2' }).focus()
    await user.keyboard('{Alt>}{ArrowUp}{/Alt}')
    expect(screen.getByLabelText('Row 1 start')).toHaveValue('09:30')
    expect(screen.getByLabelText('Session for row 09:30')).toHaveValue('Middle')
    expect(preview().indexOf('09:30')).toBeLessThan(preview().indexOf('09:00'))
  })

  it('drags a row by its handle with the pointer and drops it in a new place (one undo step)', async () => {
    const user = userEvent.setup()
    render(<App />)
    const trs = [...rows()] as HTMLElement[]
    // jsdom has no layout: give the rows rectangles, 40px apart.
    trs.forEach((tr, i) =>
      Object.defineProperty(tr, 'getBoundingClientRect', { value: () => ({ top: i * 40, bottom: i * 40 + 40, height: 40, left: 0, right: 100, width: 100, x: 0, y: i * 40 }) }),
    )
    const handle = screen.getByRole('button', { name: 'Drag to reorder row 1' })
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 5, clientY: 15, button: 0 })
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 5, clientY: 70 })
    expect(trs[2]).toHaveClass('is-drop-after')
    expect(trs[0]).toHaveClass('is-dragging')
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 5, clientY: 100 })
    expect(screen.getByLabelText('Row 3 start')).toHaveValue('09:00')
    expect(screen.getByLabelText('Row 1 start')).toHaveValue('09:30')
    expect(document.querySelector('.is-dragging')).toBeNull()
    await user.click(within(screen.getByRole('banner')).getByRole('button', { name: 'Undo' }))
    expect(screen.getByLabelText('Row 1 start')).toHaveValue('09:00')
  })

  it('Esc during a row drag leaves the order alone', () => {
    render(<App />)
    const trs = [...rows()] as HTMLElement[]
    trs.forEach((tr, i) =>
      Object.defineProperty(tr, 'getBoundingClientRect', { value: () => ({ top: i * 40, bottom: i * 40 + 40, height: 40, left: 0, right: 100, width: 100, x: 0, y: i * 40 }) }),
    )
    const handle = screen.getByRole('button', { name: 'Drag to reorder row 1' })
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 5, clientY: 15, button: 0 })
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 5, clientY: 100 })
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 5, clientY: 100 })
    expect(screen.getByLabelText('Row 1 start')).toHaveValue('09:00')
    expect(document.querySelector('.is-dragging')).toBeNull()
  })

  it('removing a row needs no confirmation: a toast offers Undo', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.type(screen.getByLabelText('Session for row 09:30'), 'Has content')
    await user.click(screen.getByRole('button', { name: 'Remove row 2' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(rows()).toHaveLength(2)
    await user.click(within(screen.getByRole('status', { name: 'Notification' })).getByRole('button', { name: 'Undo' }))
    expect(rows()).toHaveLength(3)
    expect(screen.getByLabelText('Session for row 09:30')).toHaveValue('Has content')
  })

  it('a row time that is not valid stays a draft and does not reach the page', async () => {
    const user = userEvent.setup()
    render(<App />)
    const start = screen.getByLabelText('Row 1 start')
    const before = preview()
    await user.clear(start)
    await user.type(start, '11:00')
    expect(start).toHaveAttribute('aria-invalid', 'true')
    expect(preview()).toBe(before)
    await user.tab()
    expect(start).toHaveValue('09:00')
  })
})
