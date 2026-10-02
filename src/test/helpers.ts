import { screen } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'
import { vi } from 'vitest'

/** Open the "New…" gallery and start from the blank schedule (confirming the replace). */
export async function startBlank(user: UserEvent): Promise<void> {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
  await user.click(screen.getByRole('button', { name: 'New…' }))
  await user.click(screen.getByRole('button', { name: 'Use template: Blank schedule' }))
  confirm.mockRestore()
}
