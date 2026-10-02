import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Accordion } from './Accordion.tsx'
import { ConfirmProvider } from './Confirm.tsx'
import { useConfirm } from './confirmContext.ts'
import { NOTIFY_MS, NotifyProvider } from './Notify.tsx'
import { useNotify } from './notifyContext.ts'
import { Section } from './Section.tsx'

function Asker({ onAnswer }: { onAnswer: (answer: boolean) => void }) {
  const confirm = useConfirm()
  return (
    <button type="button" onClick={() => void confirm({ title: 'Delete it?', message: 'It is gone for good.', confirmLabel: 'Delete', danger: true }).then(onAnswer)}>
      Ask
    </button>
  )
}

describe('confirm dialog', () => {
  it('is an accessible modal that resolves true on confirm and false on Cancel, Esc or the backdrop', async () => {
    const user = userEvent.setup()
    const answers: boolean[] = []
    render(
      <ConfirmProvider>
        <Asker onAnswer={(a) => answers.push(a)} />
      </ConfirmProvider>,
    )
    await user.click(screen.getByRole('button', { name: 'Ask' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete it?' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveTextContent('It is gone for good.')
    // Focus starts on the safe choice.
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    expect(within(dialog).getByRole('button', { name: 'Delete' })).toHaveClass('danger')
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(answers).toEqual([true]))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Ask' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: 'Ask' }))
    await user.keyboard('{Escape}')
    await waitFor(() => expect(answers).toEqual([true, false, false]))
    expect(screen.getByRole('button', { name: 'Ask' })).toHaveFocus() // focus goes back to where it was
  })
})

function Notifier({ onUndo }: { onUndo: () => void }) {
  const notify = useNotify()
  return (
    <button type="button" onClick={() => notify({ text: 'Thing deleted', action: { label: 'Undo', run: onUndo } })}>
      Notify
    </button>
  )
}

describe('toasts', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
  afterEach(() => vi.useRealTimers())

  it('shows text with an action, runs it once, and goes away', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const undo = vi.fn()
    render(
      <NotifyProvider watch={1}>
        <Notifier onUndo={undo} />
      </NotifyProvider>,
    )
    await user.click(screen.getByRole('button', { name: 'Notify' }))
    const toast = screen.getByRole('status', { name: 'Notification' })
    expect(toast).toHaveTextContent('Thing deleted · Undo')
    await user.click(within(toast).getByRole('button', { name: 'Undo' }))
    expect(undo).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('disappears by itself after six seconds', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(
      <NotifyProvider watch={1}>
        <Notifier onUndo={() => undefined} />
      </NotifyProvider>,
    )
    await user.click(screen.getByRole('button', { name: 'Notify' }))
    act(() => void vi.advanceTimersByTime(NOTIFY_MS - 100))
    expect(screen.getByRole('status')).toBeInTheDocument()
    act(() => void vi.advanceTimersByTime(200))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('goes away as soon as the watched value changes, so Undo never takes back the wrong thing', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const tree = (watch: number) => (
      <NotifyProvider watch={watch}>
        <Notifier onUndo={() => undefined} />
      </NotifyProvider>
    )
    const { rerender } = render(tree(1))
    await user.click(screen.getByRole('button', { name: 'Notify' }))
    // The toast records the value as of its first render; any later change means something else happened.
    rerender(tree(1))
    expect(screen.getByRole('status')).toBeInTheDocument()
    rerender(tree(2))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})

describe('Section and Accordion', () => {
  it('a lone section opens and closes with aria-expanded, and only renders its content while open', async () => {
    const user = userEvent.setup()
    render(
      <Section title="Details">
        <p>Inside</p>
      </Section>,
    )
    const button = screen.getByRole('button', { name: 'Details' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Inside')).not.toBeInTheDocument()
    await user.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('region', { name: 'Details' })).toHaveTextContent('Inside')
    await user.click(button)
    expect(screen.queryByText('Inside')).not.toBeInTheDocument()
  })

  it('inside an accordion only one section is open at a time', async () => {
    const user = userEvent.setup()
    render(
      <Accordion initial="One">
        <Section title="One">
          <p>First</p>
        </Section>
        <Section title="Two">
          <p>Second</p>
        </Section>
      </Accordion>,
    )
    expect(screen.getByText('First')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Two' }))
    expect(screen.queryByText('First')).not.toBeInTheDocument()
    expect(screen.getByText('Second')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Two' }))
    expect(screen.queryByText('Second')).not.toBeInTheDocument()
  })
})
