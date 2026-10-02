import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import App from '../../App.tsx'
import { STORAGE_KEY } from '../../persistence/useAutosave.ts'
import { BUILTIN_TEMPLATES } from '../../templates/builtin/index.ts'
import { createEmptySchedule } from '../../model/defaults.ts'

const arabic = BUILTIN_TEMPLATES.find((t) => t.id === 'arabic-conference')!.schedule
const canvas = () => document.querySelector('.board__canvas') as HTMLElement
const live = () => document.querySelector('.board__live')

beforeEach(() => localStorage.clear())

describe('a right-to-left event mirrors the board', () => {
  it('puts the canvas in rtl (gutter and first track on the right), and an English event stays ltr', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(arabic))
    const { unmount } = render(<App />)
    expect(canvas()).toHaveAttribute('dir', 'rtl')
    expect(document.querySelector('.board__cols')).toHaveAttribute('data-rtl', 'true')
    unmount()
    localStorage.setItem(STORAGE_KEY, JSON.stringify(createEmptySchedule()))
    render(<App />)
    expect(canvas()).toHaveAttribute('dir', 'ltr')
  })

  it('follows the Direction setting, not only the language', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(createEmptySchedule()))
    const user = userEvent.setup()
    render(<App />)
    await user.selectOptions(screen.getByLabelText('Direction'), 'rtl')
    expect(canvas()).toHaveAttribute('dir', 'rtl')
  })

  it('Left and Right move a card the way they look: Left goes to the next track on a mirrored board', async () => {
    const mirrored = createEmptySchedule()
    mirrored.event.direction = 'rtl'
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mirrored))
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '+ Add session' }))
    await user.keyboard('Mirror{Enter}')
    screen.getByRole('button', { name: /^Mirror/ }).focus()
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('button', { name: /^Mirror, .*, Track 2$/ })).toBeInTheDocument()
    expect(live()).toHaveTextContent('Track 2')
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('button', { name: /^Mirror, .*, Track 1$/ })).toBeInTheDocument()
  })

  it('on an ltr board Right goes to the next track', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(createEmptySchedule()))
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '+ Add session' }))
    await user.keyboard('Plain{Enter}')
    screen.getByRole('button', { name: /^Plain/ }).focus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('button', { name: /^Plain, .*, Track 2$/ })).toBeInTheDocument()
  })
})
