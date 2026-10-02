import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App.tsx'
import { downloadText } from '../persistence/files.ts'
import { startBlank } from '../test/helpers.ts'
import { BUILTIN_TEMPLATES } from './builtin/index.ts'
import { serializeTemplateFile } from './file.ts'
import { todayIn } from './instantiate.ts'
import { TEMPLATES_KEY, listUserTemplates } from './store.ts'

vi.mock('../persistence/files.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../persistence/files.ts')>()),
  downloadText: vi.fn(),
}))

const preview = () => screen.getByTitle('Preview').getAttribute('srcdoc') ?? ''
const thumbnails = () => document.querySelectorAll('iframe[title^="Preview of"]')
const section = (name: string) => screen.getByRole('region', { name }) as HTMLElement
const templateButton = (name: string) => screen.getByRole('button', { name: `Use template: ${name}` })

beforeEach(() => {
  localStorage.clear()
  vi.mocked(downloadText).mockClear()
})
afterEach(() => vi.restoreAllMocks())

async function openGallery(user = userEvent.setup()) {
  render(<App />)
  await user.click(screen.getByRole('button', { name: 'New…' }))
  return user
}

describe('gallery dialog', () => {
  it('opens as a labelled modal dialog with Start blank, Templates and My templates', async () => {
    await openGallery()
    const dialog = screen.getByRole('dialog', { name: 'New schedule' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(within(dialog).getByRole('heading', { name: 'Start blank' })).toBeInTheDocument()
    expect(within(dialog).getByRole('heading', { name: 'Templates' })).toBeInTheDocument()
    expect(within(dialog).getByRole('heading', { name: 'My templates' })).toBeInTheDocument()
    expect(within(section('Templates')).getAllByRole('article')).toHaveLength(5)
    for (const template of BUILTIN_TEMPLATES) {
      const card = within(section('Templates')).getByRole('article', { name: template.name })
      expect(card).toHaveTextContent(template.description)
      expect(card).toHaveTextContent(template.schedule.mode === 'table' ? 'Table' : 'Track grid')
    }
    expect(within(section('My templates')).getByText(/Nothing here yet/)).toBeInTheDocument()
  })

  it('shows a live script-free thumbnail per card, only while the dialog is open', async () => {
    const user = await openGallery()
    expect(thumbnails()).toHaveLength(6) // blank + five templates
    const first = thumbnails()[1] as HTMLIFrameElement
    expect(first.getAttribute('srcdoc')).toContain('Company Name Summit')
    expect(first.getAttribute('srcdoc')).toContain('data-theme="light"')
    expect(first.getAttribute('srcdoc')).not.toContain('<script')
    expect(first.getAttribute('sandbox')).toBe('')
    expect(first.getAttribute('tabindex')).toBe('-1')
    await user.keyboard('{Escape}')
    expect(thumbnails()).toHaveLength(0)
  })

  it('Escape and the Close button close it, and focus returns to the New… button', async () => {
    const user = await openGallery()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New…' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'New…' }))
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('moves focus into the dialog and keeps Tab and Shift+Tab inside it', async () => {
    const user = await openGallery()
    const dialog = screen.getByRole('dialog')
    expect(dialog).toContainElement(document.activeElement as HTMLElement)
    for (let i = 0; i < 25; i++) {
      await user.tab()
      expect(dialog).toContainElement(document.activeElement as HTMLElement)
    }
    for (let i = 0; i < 25; i++) {
      await user.tab({ shift: true })
      expect(dialog).toContainElement(document.activeElement as HTMLElement)
    }
    // Wraps: the last control is followed by the first.
    const buttons = within(dialog).getAllByRole('button')
    buttons[buttons.length - 1]?.focus()
    await user.tab()
    expect(document.activeElement).toBe(buttons[0])
    await user.tab({ shift: true })
    expect(document.activeElement).toBe(buttons[buttons.length - 1])
  })
})

describe('choosing a card', () => {
  it('asks before replacing a schedule with changes, and keeps everything if declined', async () => {
    const user = await openGallery() // first launch: the Cairo sample is loaded
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    await user.click(templateButton('Conference, two tracks'))
    expect(confirm).toHaveBeenCalledWith('Replace the current schedule? Unsaved changes are kept only in autosave until replaced.')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(preview()).toContain('Google for Developers Day')
  })

  it('a built-in loads into the editor with a fresh date and its content', async () => {
    const user = await openGallery()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await user.click(templateButton('Conference, two tracks'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(preview()).toContain('Company Name Summit')
    expect(preview()).not.toContain('Cairo')
    expect(screen.getByLabelText('Event title')).toHaveValue('Company Name Summit')
    expect(screen.getByLabelText('Date')).toHaveValue(todayIn('Europe/London'))
    expect(screen.getByTestId('summary-items')).toHaveTextContent('12')
    expect(screen.getByTestId('summary-columns')).toHaveTextContent('2')
  })

  it('does not ask when the current schedule is the untouched blank one', async () => {
    const user = userEvent.setup()
    render(<App />)
    await startBlank(user)
    const confirm = vi.spyOn(window, 'confirm')
    await user.click(screen.getByRole('button', { name: 'New…' }))
    await user.click(templateButton('Workshop day'))
    expect(confirm).not.toHaveBeenCalled()
    expect(preview()).toContain('Hands-on Workshop')
    expect(screen.getByTestId('summary-mode')).toHaveTextContent('table')
  })

  it('every built-in can be chosen, edited and still renders (RTL one included)', async () => {
    const user = userEvent.setup()
    render(<App />)
    for (const template of BUILTIN_TEMPLATES) {
      vi.spyOn(window, 'confirm').mockReturnValue(true)
      await user.click(screen.getByRole('button', { name: 'New…' }))
      await user.click(templateButton(template.name))
      expect(preview()).toContain(template.schedule.event.title)
    }
    expect(preview()).toContain('dir="rtl"')
  })
})

describe('My templates', () => {
  async function saveCurrent(user: ReturnType<typeof userEvent.setup>, name: string, options: { content?: boolean; description?: string } = {}) {
    await user.click(screen.getByRole('button', { name: 'Save as template…' }))
    const field = screen.getByLabelText('Template name')
    await user.clear(field)
    if (name) await user.type(field, name)
    if (options.description) await user.type(screen.getByLabelText('Description'), options.description)
    if (options.content === false) await user.click(screen.getByLabelText('Include sessions, speakers and cell content'))
    await user.click(screen.getByRole('button', { name: 'Save template' }))
  }

  it('Save as template… shows a dialog, requires a name, and saves into My templates', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Save as template…' }))
    const dialog = screen.getByRole('dialog', { name: 'Save as template' })
    expect(within(dialog).getByLabelText('Template name')).toHaveValue('Google for Developers Day: Cairo')
    expect(within(dialog).getByLabelText('Include sessions, speakers and cell content')).toBeChecked()
    await user.clear(within(dialog).getByLabelText('Template name'))
    await user.click(within(dialog).getByRole('button', { name: 'Save template' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Give the template a name.')
    expect(listUserTemplates()).toEqual([])

    await user.type(within(dialog).getByLabelText('Template name'), 'My conference')
    await user.type(within(dialog).getByLabelText('Description'), 'Two lanes')
    await user.click(within(dialog).getByRole('button', { name: 'Save template' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Saved “My conference” to My templates.')
    expect(listUserTemplates()).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'New…' }))
    const mine = section('My templates')
    const card = within(mine).getByRole('article', { name: 'My conference' })
    expect(card).toHaveTextContent('Two lanes')
    expect(thumbnails()).toHaveLength(7)
    expect(within(card).getByRole('button', { name: 'Rename My conference' })).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Delete My conference' })).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Export My conference' })).toBeInTheDocument()
  })

  it('Escape closes the save dialog without saving', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Save as template…' }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(listUserTemplates()).toEqual([])
  })

  it('a saved template can be used, and gets fresh ids and today’s date', async () => {
    const user = userEvent.setup()
    render(<App />)
    await saveCurrent(user, 'Cairo copy')
    const stored = listUserTemplates()[0]!
    await user.click(screen.getByRole('button', { name: 'New…' }))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await user.click(templateButton('Cairo copy'))
    expect(preview()).toContain('Build with Gemma 4')
    expect(screen.getByLabelText('Date')).toHaveValue(todayIn('Africa/Cairo'))
    expect(JSON.stringify(stored.schedule)).toContain('item-welcome') // the stored template keeps its ids; the copy does not
    expect(preview()).not.toContain('item-welcome')
  })

  it('without content: keeps the shell and drops titles, speakers and speaker cards', async () => {
    const user = userEvent.setup()
    render(<App />)
    await saveCurrent(user, 'Shell only', { content: false })
    const stored = listUserTemplates()[0]!
    expect(stored.schedule.speakers).toEqual([])
    expect(stored.schedule.items).toHaveLength(12)
    expect(stored.schedule.items.every((i) => i.title === '')).toBe(true)
    expect(stored.schedule.columns.map((c) => c.name)).toEqual(['Beginner', 'Intermediate'])
    expect(stored.schedule.rows).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'New…' }))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await user.click(templateButton('Shell only'))
    expect(preview()).not.toContain('Build with Gemma 4')
    expect(preview()).not.toContain('class="people"')
    expect(screen.getByLabelText('Event title')).toHaveValue('Google for Developers Day: Cairo')
    expect(screen.getByTestId('summary-items')).toHaveTextContent('12')
  })

  it('renames and deletes (with confirmation)', async () => {
    const user = userEvent.setup()
    render(<App />)
    await saveCurrent(user, 'Old name')
    await user.click(screen.getByRole('button', { name: 'New…' }))
    await user.click(screen.getByRole('button', { name: 'Rename Old name' }))
    const input = screen.getByLabelText('New name for Old name')
    await user.clear(input)
    await user.type(input, 'New name')
    await user.click(screen.getByRole('button', { name: 'Save name' }))
    expect(within(section('My templates')).getByRole('article', { name: 'New name' })).toBeInTheDocument()
    expect(listUserTemplates()[0]?.name).toBe('New name')

    // Rename can be cancelled.
    await user.click(screen.getByRole('button', { name: 'Rename New name' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByLabelText(/^New name for/)).not.toBeInTheDocument()

    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    await user.click(screen.getByRole('button', { name: 'Delete New name' }))
    expect(confirm).toHaveBeenCalledWith('Delete template "New name"?')
    expect(listUserTemplates()).toHaveLength(1)
    confirm.mockReturnValue(true)
    await user.click(screen.getByRole('button', { name: 'Delete New name' }))
    expect(listUserTemplates()).toEqual([])
    expect(within(section('My templates')).getByText(/Nothing here yet/)).toBeInTheDocument()
  })

  it('exports a user template as <slug>.template.json', async () => {
    const user = userEvent.setup()
    render(<App />)
    await saveCurrent(user, 'Export Me')
    await user.click(screen.getByRole('button', { name: 'New…' }))
    await user.click(screen.getByRole('button', { name: 'Export Export Me' }))
    const [name, text, mime] = vi.mocked(downloadText).mock.calls[0] as [string, string, string]
    expect(name).toBe('export-me.template.json')
    expect(mime).toBe('application/json')
    expect(JSON.parse(text)).toMatchObject({ kind: 'schedule-template', version: 1, template: { name: 'Export Me' } })
  })

  it('shows the storage message when the browser is full, and offers Export template file', async () => {
    const user = userEvent.setup()
    render(<App />)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key) => {
      if (key === TEMPLATES_KEY) throw new DOMException('full', 'QuotaExceededError')
    })
    await saveCurrent(user, 'Too big')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Not enough browser storage. Remove the logo or delete old templates, or use Export template.',
    )
    expect(screen.getByRole('dialog', { name: 'Save as template' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Export template file' }))
    expect(vi.mocked(downloadText).mock.calls[0]?.[0]).toBe('too-big.template.json')
  })
})

describe('opening a template file', () => {
  const file = (content: object | string, name = 'x.template.json') =>
    new File([typeof content === 'string' ? content : JSON.stringify(content)], name, { type: 'application/json' })
  const sample = BUILTIN_TEMPLATES[2]!
  const text = serializeTemplateFile({ name: sample.name, description: sample.description, schedule: sample.schedule })

  it('offers to add it to My templates', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.upload(screen.getByTestId('open-file'), file(text))
    const dialog = await screen.findByRole('dialog', { name: 'Template file' })
    expect(dialog).toHaveTextContent('Workshop day')
    await user.click(within(dialog).getByRole('button', { name: 'Add to My templates' }))
    expect(screen.getByRole('status')).toHaveTextContent('Added “Workshop day” to My templates.')
    expect(listUserTemplates().map((t) => t.name)).toEqual(['Workshop day'])
    expect(preview()).toContain('Google for Developers Day') // the schedule was not replaced
  })

  it('or open it as a schedule', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.upload(screen.getByTestId('open-file'), file(text))
    await user.click(await screen.findByRole('button', { name: 'Open as a schedule' }))
    await waitFor(() => expect(preview()).toContain('Hands-on Workshop'))
    expect(screen.getByLabelText('Date')).toHaveValue(todayIn('Europe/London'))
    expect(listUserTemplates()).toEqual([])
  })

  it('Cancel closes it without changes, and a bad template file shows errors', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.upload(screen.getByTestId('open-file'), file(text))
    await user.click(await screen.findByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.upload(screen.getByTestId('open-file'), file({ kind: 'schedule-template', version: 1, template: { name: 'x', description: '', schedule: { version: 1 } } }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/template\.schedule\./)
  })

  it('a plain schedule file still opens as a schedule', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.upload(screen.getByTestId('open-file'), file(JSON.stringify(sample.schedule), 'plain.json'))
    await waitFor(() => expect(screen.getByLabelText('Event title')).toHaveValue('Hands-on Workshop'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
