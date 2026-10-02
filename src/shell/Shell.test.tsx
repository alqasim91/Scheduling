import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import App from '../App.tsx'
import { createEmptySchedule } from '../model/defaults.ts'
import { STORAGE_KEY } from '../persistence/useAutosave.ts'
import { fileMenu, startBlank } from '../test/helpers.ts'

const setWidth = (width: number) => {
  act(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width })
    window.dispatchEvent(new Event('resize'))
  })
}

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem(STORAGE_KEY, JSON.stringify(createEmptySchedule()))
  setWidth(1440)
})
afterEach(() => setWidth(1440))

describe('top bar', () => {
  it('has the app name, File, Undo, Redo, the view toggle, the autosave status and Export', () => {
    render(<App />)
    const bar = within(screen.getByRole('banner'))
    expect(bar.getByRole('heading', { name: 'Schedule Builder' })).toBeInTheDocument()
    for (const name of [/^File/, 'Undo', 'Redo', 'Edit', 'Split', 'Preview', 'Export']) {
      expect(bar.getByRole('button', { name })).toBeInTheDocument()
    }
    expect(bar.getByRole('status', { name: 'Autosave status' })).toHaveTextContent('Saved')
    // The old toolbar's loose buttons and the summary are gone.
    expect(screen.queryByRole('button', { name: 'Load sample' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save HTML' })).not.toBeInTheDocument()
    expect(screen.queryByTestId('summary-items')).not.toBeInTheDocument()
  })

  it('the File menu lists New…, Open…, Save JSON and Save as template…, and works from the keyboard', async () => {
    const user = userEvent.setup()
    render(<App />)
    const file = screen.getByRole('button', { name: /^File/ })
    expect(file).toHaveAttribute('aria-expanded', 'false')
    await user.click(file)
    expect(file).toHaveAttribute('aria-expanded', 'true')
    const menu = screen.getByRole('menu', { name: 'File' })
    const items = within(menu).getAllByRole('menuitem')
    expect(items.map((i) => i.textContent)).toEqual(['New…', 'Open…', 'Save JSON', 'Save as template…'])
    expect(items[0]).toHaveFocus()
    await user.keyboard('{ArrowDown}{ArrowDown}')
    expect(items[2]).toHaveFocus()
    await user.keyboard('{End}')
    expect(items[3]).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(items[0]).toHaveFocus() // wraps
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(file).toHaveFocus()
    // Enter chooses.
    await user.keyboard('{ArrowDown}{Enter}')
    expect(screen.getByRole('dialog', { name: 'New schedule' })).toBeInTheDocument()
  })

  it('clicking away closes the File menu', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /^File/ }))
    await user.click(screen.getByLabelText('Event title'))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('shows Saving… after an edit and Saved once it has been written', async () => {
    const user = userEvent.setup()
    render(<App />)
    const status = screen.getByRole('status', { name: 'Autosave status' })
    await user.type(screen.getByLabelText('Event title'), '!')
    expect(status).toHaveTextContent('Saving…')
    await waitFor(() => expect(status).toHaveTextContent('Saved'), { timeout: 2000 })
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}').event.title).toBe('Untitled event!')
  })

  it('Undo and Redo are disabled until there is something to undo or redo', async () => {
    const user = userEvent.setup()
    render(<App />)
    const bar = within(screen.getByRole('banner'))
    expect(bar.getByRole('button', { name: 'Undo' })).toBeDisabled()
    await startBlank(user)
    expect(bar.getByRole('button', { name: 'Undo' })).toBeEnabled()
    expect(bar.getByRole('button', { name: 'Redo' })).toBeDisabled()
  })
})

describe('Edit | Split | Preview', () => {
  const sidebar = () => screen.queryByRole('complementary', { name: 'Settings' })
  const iframe = () => screen.queryByTitle('Preview')

  it('starts in Split on a wide window: sidebar, board and preview', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: 'Split' })).toHaveAttribute('aria-pressed', 'true')
    expect(sidebar()).toBeInTheDocument()
    expect(document.querySelector('.board')).toBeInTheDocument()
    expect(iframe()).toBeInTheDocument()
  })

  it('starts in Edit below 1280px (no preview), and the toggle switches between all three', async () => {
    setWidth(1100)
    const user = userEvent.setup()
    render(<App />)
    expect(screen.getByRole('button', { name: 'Edit' })).toHaveAttribute('aria-pressed', 'true')
    expect(iframe()).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Split' }))
    expect(iframe()).toBeInTheDocument()
    expect(document.querySelector('.board')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Preview' }))
    expect(iframe()).toBeInTheDocument()
    expect(document.querySelector('.board')).not.toBeInTheDocument()
    expect(sidebar()).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Preview' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    expect(document.querySelector('.board')).toBeInTheDocument()
    expect(iframe()).not.toBeInTheDocument()
  })

  it('narrow screens have no Split: Edit and a Preview tab, and the sidebar is a drawer', async () => {
    setWidth(600)
    const user = userEvent.setup()
    render(<App />)
    const bar = within(screen.getByRole('banner'))
    expect(bar.queryByRole('button', { name: 'Split' })).not.toBeInTheDocument()
    expect(bar.getByRole('button', { name: 'Edit' })).toHaveAttribute('aria-pressed', 'true')
    expect(iframe()).not.toBeInTheDocument()
    const toggle = bar.getByRole('button', { name: 'Settings' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(sidebar()).toHaveAttribute('data-open', 'false')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(sidebar()).toHaveAttribute('data-open', 'true')
    await user.keyboard('{Escape}')
    expect(sidebar()).toHaveAttribute('data-open', 'false')
    await user.click(bar.getByRole('button', { name: 'Preview' }))
    expect(iframe()).toBeInTheDocument()
    expect(bar.queryByRole('button', { name: 'Settings' })).not.toBeInTheDocument()
  })

  it('a window resized from wide to narrow drops Split without losing the schedule', () => {
    render(<App />)
    expect(iframe()).toBeInTheDocument()
    setWidth(700)
    expect(screen.getByRole('button', { name: 'Edit' })).toHaveAttribute('aria-pressed', 'true')
    expect(iframe()).not.toBeInTheDocument()
    expect(screen.getByLabelText('Event title')).toHaveValue('Untitled event')
  })
})

describe('Export dialog', () => {
  it('offers HTML or PDF, and Esc closes it without exporting', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Export' }))
    const dialog = screen.getByRole('dialog', { name: 'Export' })
    expect(within(dialog).getByRole('radio', { name: /HTML page/ })).toBeChecked()
    expect(within(dialog).getByRole('radio', { name: /PDF/ })).not.toBeChecked()
    await user.click(within(dialog).getByRole('radio', { name: /PDF/ }))
    expect(within(dialog).queryByLabelText('Embed fonts for offline use')).not.toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Export PDF' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export' })).toHaveFocus()
  })
})

describe('Sample event', () => {
  it('is a card in the New… gallery rather than a toolbar button', async () => {
    const user = userEvent.setup()
    render(<App />)
    await fileMenu(user, 'New…')
    const card = screen.getByRole('article', { name: 'Sample event' })
    expect(card).toHaveTextContent('Developers Day')
    await user.click(within(card).getByRole('button', { name: 'Use template: Sample event' }))
    expect(screen.getByLabelText('Event title')).toHaveValue('Google for Developers Day: Cairo')
  })
})
