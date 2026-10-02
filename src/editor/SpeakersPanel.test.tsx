import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import App from '../App.tsx'
import { createEmptySchedule } from '../model/defaults.ts'
import { STORAGE_KEY } from '../persistence/useAutosave.ts'
import { loadSample, openSection, undoButton } from '../test/helpers.ts'

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem(STORAGE_KEY, JSON.stringify(createEmptySchedule()))
})

const preview = () => screen.getByTitle('Preview').getAttribute('srcdoc') ?? ''
const png = (bytes: number, type = 'image/png', name = 'face.png') => new File([new Uint8Array(bytes)], name, { type })

async function open(options: Parameters<typeof userEvent.setup>[0] = {}) {
  const user = userEvent.setup(options)
  render(<App />)
  await openSection(user, 'Speakers')
  return user
}

describe('Speakers section', () => {
  it('is a collapsible section of the sidebar with an empty-state hint', async () => {
    await open()
    expect(screen.getByRole('region', { name: 'Speakers' })).toHaveTextContent('No speakers yet')
    expect(screen.getByRole('button', { name: '+ Add speaker' })).toBeInTheDocument()
  })

  it('adds a speaker, focuses the name, and shows name, role and avatar on the page', async () => {
    const user = await open()
    await user.click(screen.getByRole('button', { name: '+ Add speaker' }))
    const name = screen.getByLabelText('Speaker 1 name')
    expect(name).toHaveFocus()
    await user.type(name, 'Grace Hopper')
    await user.type(screen.getByLabelText('Speaker 1 role'), 'Rear Admiral')
    expect(preview()).toContain('Grace Hopper')
    expect(preview()).toContain('Rear Admiral')
    expect(preview()).toContain('>GH<')
  })

  it('changes the colour', async () => {
    const user = await open()
    await user.click(screen.getByRole('button', { name: '+ Add speaker' }))
    await user.type(screen.getByLabelText('Speaker 1 name'), 'Ada')
    const color = screen.getByLabelText('Speaker 1 colour')
    // user-event cannot drive a colour picker; fire the change the browser would.
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.change(color, { target: { value: '#112233' } })
    expect(preview()).toContain('#112233')
  })

  it('renaming a speaker renames them in sessions that used the old name', async () => {
    const user = userEvent.setup()
    render(<App />)
    await loadSample(user)
    await openSection(user, 'Speakers')
    expect(preview()).toContain('Build with Gemma 4')
    const name = screen.getByLabelText('Speaker 8 name')
    expect(name).toHaveValue('Eman Alrefai')
    await user.clear(name)
    await user.type(name, 'Eman Alrefaie')
    // The session "Build with Gemma 4" named Eman Alrefai now carries the new spelling.
    expect(preview()).toContain('Eman Alrefaie')
    expect(preview()).not.toContain('Eman Alrefai<')
  })

  it('uploads a photo with the same checks as the logo, and removes it', async () => {
    const user = await open({ applyAccept: false })
    await user.click(screen.getByRole('button', { name: '+ Add speaker' }))
    await user.type(screen.getByLabelText('Speaker 1 name'), 'Pic Person')
    await user.upload(screen.getByLabelText('Speaker 1 photo'), png(200))
    await waitFor(() => expect(preview()).toContain('<img src="data:image/png;base64,'))
    await user.click(screen.getByRole('button', { name: 'Remove photo' }))
    expect(preview()).not.toContain('<img src="data:image/png')

    await user.upload(screen.getByLabelText('Speaker 1 photo'), png(600 * 1024))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Photo is too large/)
    await user.upload(screen.getByLabelText('Speaker 1 photo'), png(10, 'text/plain', 'x.txt'))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Photo must be a PNG, JPEG, WebP, GIF or SVG image.'))
  })

  it('deleting is undoable: a toast offers Undo, and there is no confirm dialog', async () => {
    const user = await open()
    await user.click(screen.getByRole('button', { name: '+ Add speaker' }))
    await user.type(screen.getByLabelText('Speaker 1 name'), 'Temp Person')
    await user.click(screen.getByRole('button', { name: 'Delete speaker Temp Person' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Speaker 1 name')).not.toBeInTheDocument()
    const toast = screen.getByRole('status', { name: 'Notification' })
    expect(toast).toHaveTextContent('Speaker deleted')
    await user.click(within(toast).getByRole('button', { name: 'Undo' }))
    expect(screen.getByLabelText('Speaker 1 name')).toHaveValue('Temp Person')
    await user.click(undoButton()) // and the toolbar Undo walks further back (the typing, then the add)
    expect(undoButton()).toBeEnabled()
  })
})
