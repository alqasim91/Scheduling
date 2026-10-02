import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App.tsx'
import { buildExportHtml } from './export/exportHtml.ts'
import { printHtml } from './export/printHtml.ts'
import { createEmptySchedule } from './model/defaults.ts'
import { downloadText } from './persistence/files.ts'
import { cairoSample } from './samples/cairo.ts'
import { startBlank } from './test/helpers.ts'

vi.mock('./persistence/files.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./persistence/files.ts')>()),
  downloadText: vi.fn(),
}))
vi.mock('./export/printHtml.ts', () => ({ printHtml: vi.fn(async () => undefined) }))

const fontResponse = (css: string, bytes = new Uint8Array([1, 2, 3])) =>
  vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    return {
      ok: true,
      status: 200,
      text: async () => css,
      arrayBuffer: async () => (url.includes('gstatic') ? bytes : new Uint8Array()).buffer,
    } as unknown as Response
  })

const GOOGLE_CSS =
  "@font-face{font-family:'Roboto';src:url(https://fonts.gstatic.com/s/roboto/a.woff2) format('woff2')}"

beforeEach(() => {
  localStorage.clear()
  vi.mocked(downloadText).mockClear()
  vi.mocked(printHtml).mockClear()
  vi.unstubAllGlobals()
})

const lastDownload = () => vi.mocked(downloadText).mock.calls.at(-1) as [string, string, string]

describe('Save HTML', () => {
  it('embeds fonts by default and downloads <slug>.html without the Google Fonts link', async () => {
    const fetchMock = fontResponse(GOOGLE_CSS)
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<App />)
    expect(screen.getByLabelText('Embed fonts for offline use')).toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Save HTML' }))
    await waitFor(() => expect(downloadText).toHaveBeenCalledTimes(1))
    const [name, html, mime] = lastDownload()
    expect(name).toBe('google-for-developers-day-cairo.html')
    expect(mime).toBe('text/html')
    expect(html).toContain('id="schedule-data"')
    expect(html).toContain('data:font/woff2;base64,AQID')
    expect(html).not.toContain('<link')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalled()
  })

  it('still exports with the link, and says why, when embedding fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Save HTML' }))
    await waitFor(() => expect(downloadText).toHaveBeenCalledTimes(1))
    expect(lastDownload()[1]).toContain('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?')
    const notice = screen.getByRole('status')
    expect(notice).toHaveTextContent(/Fonts were not embedded/)
    expect(notice).toHaveTextContent(/Failed to fetch/)
    await user.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('skips embedding when the checkbox is off', async () => {
    const fetchMock = fontResponse(GOOGLE_CSS)
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByLabelText('Embed fonts for offline use'))
    await user.click(screen.getByRole('button', { name: 'Save HTML' }))
    await waitFor(() => expect(downloadText).toHaveBeenCalledTimes(1))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(lastDownload()[1]).toContain('<link')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('skips embedding when the schedule has no web fonts', async () => {
    const fetchMock = fontResponse(GOOGLE_CSS)
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<App />)
    await startBlank(user)
    await user.click(screen.getByRole('button', { name: 'Save HTML' }))
    await waitFor(() => expect(downloadText).toHaveBeenCalledTimes(1))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(lastDownload()[0]).toBe('untitled-event.html')
    expect(lastDownload()[1]).not.toContain('<link')
  })
})

describe('Export PDF', () => {
  it('prints the export page through the hidden iframe helper', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Export PDF' }))
    await waitFor(() => expect(printHtml).toHaveBeenCalledTimes(1))
    const html = vi.mocked(printHtml).mock.calls[0]?.[0] ?? ''
    expect(html).toContain('Build with Gemma 4')
    expect(html).toContain('size:A4')
  })

  it('shows a notice if printing cannot start', async () => {
    vi.mocked(printHtml).mockRejectedValueOnce(new Error('blocked'))
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Export PDF' }))
    expect(await screen.findByRole('status')).toHaveTextContent(/print dialog.*blocked/)
  })
})

describe('Open an exported HTML file', () => {
  it('accepts .json, .html and .htm', () => {
    render(<App />)
    expect(screen.getByTestId('open-file')).toHaveAttribute('accept', expect.stringMatching(/\.json.*\.html.*\.htm/))
  })

  it('restores the schedule from the embedded data', async () => {
    const user = userEvent.setup()
    render(<App />)
    await startBlank(user)
    expect(screen.getByLabelText('Event title')).toHaveValue('Untitled event')
    const exported = buildExportHtml({ ...cairoSample, event: { ...cairoSample.event, title: 'Round trip </script>' } })
    await user.upload(screen.getByTestId('open-file'), new File([exported], 'event.html', { type: 'text/html' }))
    await waitFor(() => expect(screen.getByLabelText('Event title')).toHaveValue('Round trip </script>'))
    expect(screen.getByTestId('summary-items')).toHaveTextContent('12')
  })

  it('says so when an HTML file has no schedule data', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.upload(
      screen.getByTestId('open-file'),
      new File(['<!doctype html><html><body>hi</body></html>'], 'other.html', { type: 'text/html' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This HTML file was not exported by this app (no schedule data found).',
    )
  })

  it('decides by content: html content in a .json file still imports', async () => {
    const user = userEvent.setup()
    render(<App />)
    const exported = buildExportHtml({ ...createEmptySchedule(), event: { ...createEmptySchedule().event, title: 'Sniffed' } })
    await user.upload(screen.getByTestId('open-file'), new File([exported], 'weird.json', { type: 'application/json' }))
    await waitFor(() => expect(screen.getByLabelText('Event title')).toHaveValue('Sniffed'))
  })
})
