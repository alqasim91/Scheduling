import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App.tsx'
import { createEmptySchedule } from '../model/defaults.ts'
import { STORAGE_KEY } from '../persistence/useAutosave.ts'
import { startBlank } from '../test/helpers.ts'

/** Tests start from the empty schedule; the app itself starts from the sample on first launch. */
beforeEach(() => {
  localStorage.clear()
  localStorage.setItem(STORAGE_KEY, JSON.stringify(createEmptySchedule()))
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

  it('first launch with no autosave starts from the Cairo sample, and New empties it', async () => {
    localStorage.clear()
    const user = userEvent.setup()
    render(<App />)
    expect(preview()).toContain('Build with Gemma 4')
    expect(count('items')).toBe(12)
    await startBlank(user)
    expect(count('items')).toBe(0)
    expect(count('rows')).toBe(1)
    expect(preview()).not.toContain('Gemma')
  })

  it('edits the labels and shows them in the preview', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByText('Labels'))
    const agenda = screen.getByLabelText('Agenda heading')
    expect(agenda).toHaveAttribute('placeholder', 'Agenda')
    await user.type(agenda, 'Programme')
    expect(preview()).toContain('<h2 id="ag">Programme</h2>')
    await user.clear(agenda)
    expect(preview()).toContain('<h2 id="ag">Agenda</h2>')
  })

  it('edits an item continuation label', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /^\+ Add item \(row 1, Track 1\)/ }))
    await user.click(screen.getByRole('button', { name: '+ Add row' }))
    await user.type(screen.getByLabelText('End override'), '10:20')
    await user.type(screen.getByLabelText('Continuation label'), 'Lab')
    expect(preview()).toContain('Lab continues until 10:20')
  })

  it('uses a neutral timezone example', () => {
    render(<App />)
    expect(screen.getByLabelText('Timezone')).toHaveAttribute('placeholder', 'Europe/London')
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

  describe('branding panel', () => {
    const png = (bytes: number, type = 'image/png', name = 'logo.png') =>
      new File([new Uint8Array(bytes)], name, { type })

    it('uploads a logo as a data URI, shows it in the preview, and removes it', async () => {
      const user = userEvent.setup()
      render(<App />)
      expect(screen.getByRole('button', { name: 'Remove logo' })).toBeDisabled()
      await user.upload(screen.getByLabelText('Logo file'), png(200))
      await waitFor(() => expect(preview()).toContain('<img class="logo" src="data:image/png;base64,'))
      expect(screen.getByAltText('Logo preview')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Remove logo' }))
      expect(preview()).not.toContain('class="logo"')
      expect(screen.queryByAltText('Logo preview')).not.toBeInTheDocument()
    })

    it('rejects a logo over 512 KB or of the wrong type with an inline error', async () => {
      const user = userEvent.setup({ applyAccept: false })
      render(<App />)
      await user.upload(screen.getByLabelText('Logo file'), png(512 * 1024 + 1))
      expect(await screen.findByRole('alert')).toHaveTextContent(/too large/i)
      expect(preview()).not.toContain('class="logo"')
      await user.upload(screen.getByLabelText('Logo file'), png(10, 'application/pdf', 'doc.pdf'))
      expect(await screen.findByRole('alert')).toHaveTextContent(/PNG, JPEG, WebP, GIF or SVG/)
      expect(preview()).not.toContain('class="logo"')
      // A good file clears the error.
      await user.upload(screen.getByLabelText('Logo file'), png(10))
      await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    })

    it('sets the logo height within 16-120 only', async () => {
      const user = userEvent.setup()
      render(<App />)
      const height = screen.getByLabelText('Logo height (px)')
      expect(height).toHaveValue('40')
      await user.clear(height)
      await user.type(height, '200')
      expect(height).toHaveAttribute('aria-invalid', 'true')
      expect(preview()).not.toContain('height:200px')
      await user.clear(height)
      await user.type(height, '72')
      expect(preview()).toContain('height:72px')
    })

    it('edits colours, resets them, and toggles custom dark colours', async () => {
      const user = userEvent.setup()
      render(<App />)
      fireEvent.change(screen.getByLabelText('Primary color'), { target: { value: '#123456' } })
      expect(preview()).toContain('--primary:#123456')
      await user.click(screen.getByRole('button', { name: 'Reset to defaults' }))
      expect(preview()).not.toContain('--primary:#123456')
      expect(screen.getByLabelText('Primary color')).toHaveValue('#0b57d0')

      expect(screen.queryByLabelText('Dark primary color')).not.toBeInTheDocument()
      await user.click(screen.getByLabelText('Customize dark colors'))
      const dark = screen.getByLabelText('Dark background color')
      expect(dark).toHaveValue('#131314') // the derived palette is copied in
      fireEvent.change(dark, { target: { value: '#010203' } })
      expect(preview()).toContain('--bg:#010203')
      await user.click(screen.getByLabelText('Customize dark colors'))
      expect(screen.queryByLabelText('Dark background color')).not.toBeInTheDocument()
      expect(preview()).not.toContain('--bg:#010203')
    })

    it('theme select sets data-theme; the preview toggle only shows for auto', async () => {
      const user = userEvent.setup()
      render(<App />)
      const htmlTag = () => /<html[^>]*>/.exec(preview())?.[0] ?? ''
      expect(screen.getByLabelText('Theme')).toHaveValue('auto')
      expect(htmlTag()).not.toContain('data-theme')
      const dark = screen.getByRole('button', { name: 'Dark' })
      await user.click(dark)
      expect(dark).toHaveAttribute('aria-pressed', 'true')
      expect(htmlTag()).toContain('data-theme="dark"')
      await user.click(screen.getByRole('button', { name: 'Light' }))
      expect(htmlTag()).toContain('data-theme="light"')
      await user.click(screen.getByRole('button', { name: 'Light' })) // unpress: follow the system again
      expect(htmlTag()).not.toContain('data-theme')

      await user.selectOptions(screen.getByLabelText('Theme'), 'dark')
      expect(screen.queryByRole('button', { name: 'Light' })).not.toBeInTheDocument()
      expect(htmlTag()).toContain('data-theme="dark"')
    })

    it('a web font preset adds its family and a stylesheet link', async () => {
      const user = userEvent.setup()
      render(<App />)
      expect(preview()).not.toContain('<link')
      await user.selectOptions(screen.getByLabelText('Display font'), 'cairo')
      expect(screen.getByLabelText('Web fonts (Google Fonts)')).toHaveValue('Cairo')
      expect(preview()).toContain('fonts.googleapis.com/css2?family=Cairo')
      expect((screen.getByLabelText('Display font stack') as HTMLInputElement).value).toContain("'Cairo'")
    })

    it('rejects invalid web font names on blur and keeps the list', async () => {
      const user = userEvent.setup()
      render(<App />)
      const field = screen.getByLabelText('Web fonts (Google Fonts)')
      await user.type(field, 'Inter, Bad;Name')
      expect(field).toHaveAttribute('aria-invalid', 'true')
      await user.tab()
      expect(field).toHaveValue('')
      expect(preview()).not.toContain('<link')
      await user.type(field, 'Inter, Lato')
      await user.tab()
      expect(preview()).toContain('family=Inter')
      expect(preview()).toContain('family=Lato')
    })

    it('motion presets add animation css, and Replay remounts the preview', async () => {
      const user = userEvent.setup()
      render(<App />)
      expect(preview()).not.toContain('animation')
      await user.selectOptions(screen.getByLabelText('Motion'), 'stagger')
      expect(preview()).toContain('animation-delay')
      expect(preview()).toContain('prefers-reduced-motion')
      await user.click(screen.getByLabelText('Animate logo'))
      expect(preview()).toContain('@keyframes logo-in')
      const before = screen.getByTitle('Preview')
      await user.click(screen.getByRole('button', { name: 'Replay' }))
      expect(screen.getByTitle('Preview')).not.toBe(before)
    })
  })

  describe('language controls', () => {
    it('Arabic (Egypt) gives a right-to-left Arabic page', async () => {
      const user = userEvent.setup()
      render(<App />)
      await user.click(screen.getByRole('button', { name: 'Load sample' }))
      expect(preview()).toContain('<html lang="en-GB" dir="ltr"')
      await user.selectOptions(screen.getByLabelText('Language'), 'ar-EG')
      expect(preview()).toContain('<html lang="ar-EG" dir="rtl"')
      expect(preview()).toContain('الجدول')
      expect(preview()).toContain('١٣:٣٠')
      await user.selectOptions(screen.getByLabelText('Direction'), 'ltr')
      expect(preview()).toContain('dir="ltr"')
    })

    it('Time format switches to 12-hour', async () => {
      const user = userEvent.setup()
      render(<App />)
      await user.click(screen.getByRole('button', { name: 'Load sample' }))
      await user.selectOptions(screen.getByLabelText('Language'), 'en-US')
      await user.selectOptions(screen.getByLabelText('Time format'), '12h')
      expect(preview()).toMatch(/1:30(&nbsp;|\s|\u00a0)PM/)
    })

    it('a custom locale is validated before it is used', async () => {
      const user = userEvent.setup()
      render(<App />)
      await user.selectOptions(screen.getByLabelText('Language'), 'custom')
      const field = screen.getByLabelText('Custom locale')
      await user.clear(field)
      await user.type(field, 'not a locale')
      expect(field).toHaveAttribute('aria-invalid', 'true')
      await user.tab() // invalid: reverts, nothing is committed
      expect(field).toHaveValue('en-GB')
      expect(preview()).toContain('lang="en-GB"')
      await user.clear(field)
      await user.type(field, 'fr-CA')
      expect(preview()).toContain('lang="en-GB"') // committed on blur, not while typing
      await user.tab()
      expect(preview()).toContain('lang="fr-CA"')
      expect(preview()).toContain('Programme')
    })

    it('every free-text field is dir="auto"', () => {
      render(<App />)
      for (const label of ['Event title', 'Title highlight', 'Venue', 'Status', 'Notes', 'Column 1 name', 'Row 1 note']) {
        expect(screen.getByLabelText(label), label).toHaveAttribute('dir', 'auto')
      }
    })
  })

  describe('table mode', () => {
    async function openTable() {
      const user = userEvent.setup()
      render(<App />)
      await user.click(screen.getByRole('button', { name: 'Table' }))
      return user
    }

    it('the mode switch shows the table editor and creates Session, Speaker and Tag columns', async () => {
      const user = userEvent.setup()
      render(<App />)
      const grid = screen.getByRole('button', { name: 'Track grid' })
      expect(grid).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByRole('heading', { name: 'Grid' })).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Table' }))
      expect(screen.getByRole('button', { name: 'Table' })).toHaveAttribute('aria-pressed', 'true')
      expect(grid).toHaveAttribute('aria-pressed', 'false')
      expect(screen.getByRole('heading', { name: 'Table' })).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Grid' })).not.toBeInTheDocument()
      expect(screen.getByTestId('summary-mode')).toHaveTextContent('table')
      expect(count('columns')).toBe(3)
      expect(['Column 1 name', 'Column 2 name', 'Column 3 name'].map((l) => (screen.getByLabelText(l) as HTMLInputElement).value)).toEqual([
        'Session',
        'Speaker',
        'Tag',
      ])
      expect(preview()).toContain('<table class="sched">')
      expect(preview()).not.toContain('class="agenda"')
    })

    it('editing a cell updates the preview', async () => {
      const user = await openTable()
      await user.type(screen.getByLabelText('Session for row 09:00'), 'Opening talk')
      expect(preview()).toContain('Opening talk')
      await user.clear(screen.getByLabelText('Session for row 09:00'))
      expect(preview()).not.toContain('Opening talk')
    })

    it('person cells use a speaker list and match speakers case-insensitively', async () => {
      const user = userEvent.setup()
      render(<App />)
      await user.click(screen.getByRole('button', { name: 'Load sample' }))
      await user.click(screen.getByRole('button', { name: 'Table' }))
      const person = screen.getByLabelText('Speaker for row 13:30')
      expect(person).toHaveAttribute('list')
      expect(document.getElementById(person.getAttribute('list') ?? '')?.querySelectorAll('option')).toHaveLength(8)
      await user.type(person, 'dr. asma MERABET')
      expect(preview()).toContain('<span class="who"><span class="av"')
      expect(preview()).toContain('Dr. Asma Merabet')
    })

    it('tag cells become chips', async () => {
      const user = await openTable()
      const tag = screen.getByLabelText('Tag for row 09:00')
      expect(tag).toHaveAttribute('placeholder', 'comma-separated')
      await user.type(tag, 'Design, Q&A')
      expect(preview()).toContain('<span class="tags"><span class="chip"')
      expect(preview()).toContain('>Design</span>')
      expect(preview()).toContain('>Q&amp;A</span>')
    })

    it('a type change reshapes the column: time input, colour for tags, text kept otherwise', async () => {
      const user = await openTable()
      await user.click(screen.getByRole('button', { name: '+ Add column' }))
      expect((screen.getByLabelText('Column 4 name') as HTMLInputElement).value).toBe('Column 4')
      expect(screen.getByLabelText('Column 4 type')).toHaveValue('text')
      expect(screen.queryByLabelText('Column 4 color')).not.toBeInTheDocument()
      await user.type(screen.getByLabelText('Column 4 for row 09:00'), 'Main hall')
      expect(preview()).toContain('Main hall')

      await user.selectOptions(screen.getByLabelText('Column 4 type'), 'tag')
      expect(screen.getByLabelText('Column 4 color')).toBeInTheDocument()
      expect(preview()).toContain('class="chip" style="--c:')

      await user.selectOptions(screen.getByLabelText('Column 4 type'), 'time')
      expect(preview()).not.toContain('Main hall') // not HH:MM, so it was cleared
      const time = screen.getByLabelText('Column 4 for row 09:00')
      expect(time).toHaveAttribute('type', 'time')
      fireEvent.change(time, { target: { value: '10:30' } })
      expect(preview()).toContain('td data-label="Column 4" class="n">10:30</td>')
    })

    it('add column, move and remove work on the table columns', async () => {
      const user = await openTable()
      await user.click(screen.getByRole('button', { name: 'Move column 2 up' }))
      expect(['Column 1 name', 'Column 2 name'].map((l) => (screen.getByLabelText(l) as HTMLInputElement).value)).toEqual(['Speaker', 'Session'])
      await user.type(screen.getByLabelText('Session for row 09:00'), 'Keep?')
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
      await user.click(screen.getByRole('button', { name: 'Remove column 2' }))
      expect(confirm).toHaveBeenCalledTimes(1)
      expect(count('columns')).toBe(3)
      confirm.mockReturnValue(true)
      await user.click(screen.getByRole('button', { name: 'Remove column 2' }))
      expect(count('columns')).toBe(2)
      expect(preview()).not.toContain('Keep?')
      confirm.mockRestore()
    })

    it('rows work like in the grid: add, insert, times and notes', async () => {
      const user = await openTable()
      await user.click(screen.getByRole('button', { name: '+ Add row' }))
      expect(count('rows')).toBe(2)
      expect(screen.getByLabelText('Session for row 10:00')).toBeInTheDocument()
      await user.type(screen.getByLabelText('Row 1 note'), 'Bring a laptop')
      expect(preview()).toContain('<tr class="note"')
      expect(preview()).toContain('Bring a laptop')
      const start = screen.getByLabelText('Row 1 start')
      await user.clear(start)
      await user.type(start, '09:15')
      expect(screen.getByLabelText('Session for row 09:15')).toBeInTheDocument()
    })

    it('switching back to the grid keeps items and cells, and does not duplicate columns', async () => {
      const user = userEvent.setup()
      render(<App />)
      await user.click(screen.getByRole('button', { name: 'Load sample' }))
      await user.click(screen.getByRole('button', { name: 'Table' }))
      await user.type(screen.getByLabelText('Session for row 13:30'), 'Kept cell')
      await user.click(screen.getByRole('button', { name: 'Track grid' }))
      expect(count('items')).toBe(12)
      expect(count('columns')).toBe(2)
      expect(preview()).toContain('Build with Gemma 4')
      expect(preview()).not.toContain('Kept cell')
      await user.click(screen.getByRole('button', { name: 'Table' }))
      expect(screen.getByLabelText('Session for row 13:30')).toHaveValue('Kept cell')
      expect(count('columns')).toBe(3)
    })

    it('right-to-left languages mirror the table and use Arabic labels', async () => {
      const user = await openTable()
      await user.selectOptions(screen.getByLabelText('Language'), 'ar-EG')
      expect(preview()).toContain('<html lang="ar-EG" dir="rtl"')
      expect(preview()).toContain('<th scope="col">الوقت</th>')
      await user.type(screen.getByLabelText('Session for row 09:00'), 'جلسة الافتتاح')
      expect(preview()).toContain('جلسة الافتتاح')
    })

    it('every free-text cell input is dir="auto"', async () => {
      await openTable()
      expect(screen.getByLabelText('Session for row 09:00')).toHaveAttribute('dir', 'auto')
      expect(screen.getByLabelText('Speaker for row 09:00')).toHaveAttribute('dir', 'auto')
      expect(screen.getByLabelText('Tag for row 09:00')).toHaveAttribute('dir', 'auto')
    })
  })
})
