import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App.tsx'

beforeEach(() => {
  localStorage.clear()
})

const preview = () => screen.getByTitle('Preview').getAttribute('srcdoc') ?? ''
const count = (name: 'columns' | 'rows' | 'items') => Number(screen.getByTestId(`summary-${name}`).textContent)

describe('Editor', () => {
  it('Load sample fills the preview with the Cairo agenda', async () => {
    const user = userEvent.setup()
    render(<App />)
    expect(preview()).not.toContain('Build with Gemma 4')
    await user.click(screen.getByRole('button', { name: 'Load sample' }))
    expect(preview()).toContain('Build with Gemma 4')
    expect(screen.getByLabelText('Event title')).toHaveValue('Google for Developers Day: Cairo')
    expect(count('rows')).toBe(9)
    expect(count('items')).toBe(12)
  })

  it('+ Add column increases the column count', async () => {
    const user = userEvent.setup()
    render(<App />)
    expect(count('columns')).toBe(2)
    await user.click(screen.getByRole('button', { name: '+ Add column' }))
    expect(count('columns')).toBe(3)
    expect(screen.getByLabelText('Column 3 name')).toHaveValue('Track 3')
  })

  it('renaming a column updates the preview', async () => {
    const user = userEvent.setup()
    render(<App />)
    const name = screen.getByLabelText('Column 1 name')
    await user.clear(name)
    await user.type(name, 'Beginner')
    expect(preview()).toContain('Beginner')
  })

  it('+ Add in an empty cell adds an item and opens its form', async () => {
    const user = userEvent.setup()
    render(<App />)
    expect(count('items')).toBe(0)
    await user.click(screen.getByRole('button', { name: /^\+ Add item \(row 1, Track 1\)/ }))
    expect(count('items')).toBe(1)
    expect(screen.getByRole('button', { name: /New session/ })).toBeInTheDocument()
    expect(screen.getByLabelText('Item title')).toHaveValue('New session')
    expect(preview()).toContain('New session')
    // The cell is no longer empty.
    expect(screen.queryByRole('button', { name: /^\+ Add item \(row 1, Track 1\)/ })).not.toBeInTheDocument()
  })

  it('Merge right makes the item span both columns', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /^\+ Add item \(row 1, Track 1\)/ }))
    const merge = screen.getByRole('button', { name: /Merge right/ })
    expect(merge).toBeEnabled()
    expect(screen.getByRole('button', { name: /Merge left/ })).toBeDisabled()
    await user.click(merge)

    const cell = screen.getByRole('button', { name: /New session/ }).closest('td')
    expect(cell).toHaveAttribute('colspan', '2')
    expect(screen.queryByRole('button', { name: /^\+ Add item/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Merge right/ })).toBeDisabled()
    expect(preview()).toMatch(/grid-column:2 \/ 4/)

    await user.click(screen.getByRole('button', { name: /Shrink right/ }))
    expect(cell).toHaveAttribute('colspan', '1')
  })

  it('refuses a merge into an occupied cell by disabling the button', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /^\+ Add item \(row 1, Track 2\)/ }))
    await user.click(screen.getByRole('button', { name: /^\+ Add item \(row 1, Track 1\)/ }))
    expect(screen.getByRole('button', { name: /Merge right/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Span all columns/ })).toBeDisabled()
  })

  it('edits an item and shows its changes in the preview', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /^\+ Add item \(row 1, Track 1\)/ }))
    const title = screen.getByLabelText('Item title')
    await user.clear(title)
    await user.type(title, 'Keynote')
    await user.type(screen.getByLabelText('Speaker'), 'Ada')
    await user.selectOptions(screen.getByLabelText('Variant'), 'highlight')
    expect(preview()).toContain('class="ev key"')
    expect(preview()).toContain('Ada')
    await user.click(screen.getByRole('button', { name: 'Delete item' }))
    expect(count('items')).toBe(0)
    expect(screen.queryByLabelText('Item title')).not.toBeInTheDocument()
  })

  it('keeps an invalid date or timezone as a draft without corrupting state', async () => {
    const user = userEvent.setup()
    render(<App />)
    const date = screen.getByLabelText('Date')
    const before = preview()
    await user.clear(date)
    await user.type(date, '2026-13-45')
    expect(date).toHaveAttribute('aria-invalid', 'true')
    expect(preview()).toBe(before)
    await user.clear(date)
    await user.type(date, '2026-10-02')
    expect(date).toHaveAttribute('aria-invalid', 'false')
    expect(preview()).toContain('Friday, 2 October 2026')

    const zone = screen.getByLabelText('Timezone')
    await user.clear(zone)
    await user.type(zone, 'Mars/Olympus')
    expect(zone).toHaveAttribute('aria-invalid', 'true')
    await user.tab() // blur reverts to the last valid value
    expect(zone).not.toHaveValue('Mars/Olympus')
    await user.clear(zone)
    await user.type(zone, 'Africa/Cairo')
    expect(zone).toHaveAttribute('aria-invalid', 'false')
  })

  it('rejects a row start that is not before its end', async () => {
    const user = userEvent.setup()
    render(<App />)
    const start = screen.getByLabelText('Row 1 start')
    const before = preview()
    await user.clear(start)
    await user.type(start, '11:00') // default row is 09:00-10:00
    expect(start).toHaveAttribute('aria-invalid', 'true')
    expect(preview()).toBe(before)
    await user.clear(start)
    await user.type(start, '09:15')
    expect(start).toHaveAttribute('aria-invalid', 'false')
    expect(preview()).toContain('09:15')
  })

  it('adds, moves and removes rows', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '+ Add row' }))
    expect(count('rows')).toBe(2)
    expect(screen.getByLabelText('Row 2 start')).toHaveValue('10:00')
    await user.click(screen.getByRole('button', { name: 'Insert row after row 1' }))
    expect(count('rows')).toBe(3)
    expect(screen.getByLabelText('Row 2 start')).toHaveValue('10:00')
    await user.click(screen.getByRole('button', { name: 'Move row 1 down' }))
    expect(screen.getByLabelText('Row 1 start')).toHaveValue('10:00')
    await user.click(screen.getByRole('button', { name: 'Remove row 3' }))
    expect(count('rows')).toBe(2)
  })

  it('removing a column with items asks for confirmation', async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Load sample' }))
    await user.click(screen.getByRole('button', { name: 'Remove column 2' }))
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(count('columns')).toBe(2)
    confirm.mockReturnValue(true)
    await user.click(screen.getByRole('button', { name: 'Remove column 2' }))
    expect(count('columns')).toBe(1)
    expect(count('items')).toBe(9) // the 3 Intermediate-only sessions go; shared items shrink to Beginner
    confirm.mockRestore()
  })

  it('column controls reorder and recolour', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Move column 1 down' }))
    const names = screen.getAllByLabelText(/^Column \d name$/).map((el) => (el as HTMLInputElement).value)
    expect(names).toEqual(['Track 2', 'Track 1'])
    expect(screen.getByRole('button', { name: 'Move column 1 up' })).toBeDisabled()
    const group = screen.getByRole('heading', { name: 'Columns' }).closest('section') as HTMLElement
    expect(within(group).getByLabelText('Column 1 color')).toBeInTheDocument()
  })
})
