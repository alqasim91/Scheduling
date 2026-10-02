import { screen, within } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'

/** Choose an item from the File menu (New…, Open…, Save JSON, Save as template…). */
export async function fileMenu(user: UserEvent, item: string): Promise<void> {
  await user.click(screen.getByRole('button', { name: /^File/ }))
  await user.click(screen.getByRole('menuitem', { name: item }))
}

/** File › New… and start from the blank schedule (Undo can take it back, so nothing asks). */
export async function startBlank(user: UserEvent): Promise<void> {
  await fileMenu(user, 'New…')
  await user.click(screen.getByRole('button', { name: 'Use template: Blank schedule' }))
}

/** File › New… › Sample event: the Cairo agenda. */
export async function loadSample(user: UserEvent): Promise<void> {
  await fileMenu(user, 'New…')
  await user.click(screen.getByRole('button', { name: 'Use template: Sample event' }))
}

/** Expand a sidebar section (Branding, Labels, Speakers) if it is collapsed. */
export async function openSection(user: UserEvent, name: string): Promise<void> {
  const header = screen.getByRole('button', { name })
  if (header.getAttribute('aria-expanded') !== 'true') await user.click(header)
}

/** The Undo / Redo buttons of the top bar (a toast may have its own Undo button too). */
export const undoButton = () => within(screen.getByRole('banner')).getByRole('button', { name: 'Undo' })
export const redoButton = () => within(screen.getByRole('banner')).getByRole('button', { name: 'Redo' })

/** Export › choose a format › confirm. */
export async function exportAs(user: UserEvent, format: 'html' | 'pdf', options: { embed?: boolean } = {}): Promise<void> {
  await user.click(screen.getByRole('button', { name: 'Export' }))
  const dialog = screen.getByRole('dialog', { name: 'Export' })
  await user.click(within(dialog).getByRole('radio', { name: format === 'html' ? /HTML page/ : /PDF/ }))
  if (format === 'html' && options.embed !== undefined) {
    const box = within(dialog).getByLabelText('Embed fonts for offline use')
    if ((box as HTMLInputElement).checked !== options.embed) await user.click(box)
  }
  await user.click(within(dialog).getByRole('button', { name: format === 'html' ? 'Export HTML' : 'Export PDF' }))
}
