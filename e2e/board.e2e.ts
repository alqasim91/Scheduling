import { expect, test } from '@playwright/test'
import { Board, openApp, seedSchedule } from './helpers.ts'

const SPEAKERS = [
  { id: 's1', name: 'Ada Lovelace', role: 'Engineer' },
  { id: 's2', name: 'Grace Hopper', role: 'Admiral' },
]

test.describe('creating sessions', () => {
  test('drag on empty space draws a session, then typing a title names it', async ({ page }) => {
    await openApp(page)
    const board = new Board(page)
    await expect(page.getByText('Drag on the board to add a session')).toBeVisible()

    const drag = await board.drag({ time: '10:20', track: 1 }, { time: '11:04', track: 1 })
    await expect(board.preview()).toBeVisible()
    await expect(board.preview()).toContainText('10:20 – 11:05') // snapped to 5 minutes, shown live
    await drag.release()

    await expect(page.getByRole('dialog', { name: 'Edit session' })).toBeVisible()
    await expect(page.getByRole('dialog', { name: 'Edit session' }).getByLabel('Title')).toBeFocused()
    await page.keyboard.type('Opening keynote')
    await page.keyboard.press('Enter')

    const card = board.card('Opening keynote')
    await expect(card).toHaveAccessibleName('Opening keynote, 10:20 to 11:05, Beta')
    await expect(card.locator('.board-card__time')).toHaveText('10:20 – 11:05')
    await expect(page.getByRole('dialog', { name: 'Edit session' })).toHaveCount(0)
    // The rendered page follows.
    await expect.poll(() => board.previewText()).toContain('Opening keynote')
    await expect.poll(() => board.previewText()).toContain('10:20 – 11:05')
    await expect(page.getByText('Drag on the board to add a session')).toHaveCount(0)
  })

  test('dragging across tracks draws a session that spans them', async ({ page }) => {
    await openApp(page)
    const board = new Board(page)
    const drag = await board.drag({ time: '09:30', track: 0 }, { time: '10:30', track: 2 })
    await drag.release()
    await page.keyboard.type('All hands')
    await page.keyboard.press('Enter')
    await expect(board.card('All hands')).toHaveAccessibleName('All hands, 09:30 to 10:30, Alpha + Beta + Gamma')
  })

  test('drawing upwards works too, and snaps to 5 minutes', async ({ page }) => {
    await openApp(page)
    const board = new Board(page)
    const drag = await board.drag({ time: '11:00', track: 0 }, { time: '10:12', track: 0 })
    await expect(board.preview()).toContainText('10:10 – 11:00')
    await drag.release()
    await page.keyboard.type('Up')
    await page.keyboard.press('Enter')
    await expect(board.card('Up')).toHaveAccessibleName('Up, 10:10 to 11:00, Alpha')
  })

  test('a plain click makes a 30 minute session at the snapped time', async ({ page }) => {
    await openApp(page)
    const board = new Board(page)
    await board.reveal('09:00')
    const at = await board.at('13:12', 2)
    await page.mouse.click(at.x, at.y)
    await page.keyboard.type('Clicked')
    await page.keyboard.press('Enter')
    await expect(board.card('Clicked')).toHaveAccessibleName('Clicked, 13:10 to 13:40, Gamma')
  })

  test('a click, then Esc, leaves no card and nothing to undo', async ({ page }) => {
    await openApp(page)
    const board = new Board(page)
    const at = await board.at('10:00', 0)
    await page.mouse.click(at.x, at.y)
    await expect(page.getByRole('dialog', { name: 'Edit session' })).toBeVisible()
    await expect(page.locator('.board-card')).toHaveCount(1)
    await page.keyboard.press('Escape')
    await expect(page.locator('.board-card')).toHaveCount(0)
    await expect(page.getByRole('dialog', { name: 'Edit session' })).toHaveCount(0)
    await expect(page.getByRole('banner').getByRole('button', { name: 'Undo' })).toBeDisabled()
    await expect(page.getByText('Drag on the board to add a session')).toBeVisible()
  })

  test('clicking away from an untitled new session cancels it, and does not start another', async ({ page }) => {
    await openApp(page)
    const board = new Board(page)
    const first = await board.at('10:00', 0)
    await page.mouse.click(first.x, first.y)
    await expect(page.locator('.board-card')).toHaveCount(1)
    const away = await board.at('15:00', 2)
    await page.mouse.click(away.x, away.y)
    await expect(page.locator('.board-card')).toHaveCount(0)
    await expect(page.getByRole('banner').getByRole('button', { name: 'Undo' })).toBeDisabled()
  })

  test('a named session survives clicking away', async ({ page }) => {
    await openApp(page)
    const board = new Board(page)
    const first = await board.at('10:00', 0)
    await page.mouse.click(first.x, first.y)
    await page.keyboard.type('Kept')
    const away = await board.at('15:00', 2)
    await page.mouse.click(away.x, away.y)
    await expect(board.card('Kept')).toBeVisible()
    await expect(page.locator('.board-card')).toHaveCount(1)
  })

  test('creating and naming a session is one undo step', async ({ page }) => {
    await openApp(page)
    const board = new Board(page)
    const drag = await board.drag({ time: '10:00', track: 0 }, { time: '10:45', track: 0 })
    await drag.release()
    await page.keyboard.type('Quick one')
    await page.keyboard.press('Enter')
    await expect(board.card('Quick one')).toBeVisible()
    await page.keyboard.press('Control+z')
    await expect(page.locator('.board-card')).toHaveCount(0)
    await page.keyboard.press('Control+Shift+z')
    await expect(board.card('Quick one')).toHaveAccessibleName('Quick one, 10:00 to 10:45, Alpha')
  })

  test('Esc while drawing cancels the drag', async ({ page }) => {
    await openApp(page)
    const board = new Board(page)
    const drag = await board.drag({ time: '10:00', track: 0 }, { time: '11:00', track: 1 })
    await expect(board.preview()).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(board.preview()).toBeHidden()
    await drag.release()
    await expect(page.locator('.board-card')).toHaveCount(0)
    await expect(page.getByRole('dialog', { name: 'Edit session' })).toHaveCount(0)
  })

  test('drawing into a neighbour stops at its edge', async ({ page }) => {
    await openApp(page, seedSchedule({ items: [{ id: 'n', tracks: [0], start: '11:00', end: '12:00', title: 'Neighbour' }] }))
    const board = new Board(page)
    const drag = await board.drag({ time: '10:00', track: 0 }, { time: '11:40', track: 0 })
    await expect(board.preview()).toContainText('10:00 – 11:00')
    await expect(board.preview()).not.toHaveClass(/is-invalid/)
    await drag.release()
    await page.keyboard.type('Before')
    await page.keyboard.press('Enter')
    await expect(board.card('Before')).toHaveAccessibleName('Before, 10:00 to 11:00, Alpha')
  })

  test('+ Add session works without a pointer', async ({ page }) => {
    await openApp(page)
    await page.getByRole('button', { name: '+ Add session' }).click()
    await page.keyboard.type('Keyboard born')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('button', { name: /^Keyboard born, 09:00 to 09:30, Alpha/ })).toBeVisible()
  })
})

test.describe('moving sessions', () => {
  const items = [
    { id: 'a', tracks: [0], start: '09:00', end: '10:00', title: 'Alpha talk', speaker: 'Ada' },
    { id: 'b', tracks: [1], start: '09:00', end: '09:45', title: 'Beta talk' },
    { id: 'c', tracks: [2], start: '11:00', end: '12:00', title: 'Gamma talk' },
  ]

  test('drag a card to another track and time', async ({ page }) => {
    await openApp(page, seedSchedule({ items }))
    const board = new Board(page)
    const card = board.card('Alpha talk')
    const from = await board.at('09:30', 0)
    const to = await board.at('10:42', 1) // grabbed at 09:30, dropped 72 minutes later: 10:12 -> snaps to 10:10
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(to.x, to.y, { steps: 15 })
    await expect(board.preview()).toContainText('10:10 – 11:10')
    await expect(board.preview()).not.toHaveClass(/is-invalid/)
    await page.mouse.up()
    await expect(card).toHaveAccessibleName('Alpha talk, 10:10 to 11:10, Beta')
    await expect.poll(() => board.previewText()).toContain('10:10 – 11:10')
    // One drag, one undo step.
    await page.keyboard.press('Control+z')
    await expect(card).toHaveAccessibleName('Alpha talk, 09:00 to 10:00, Alpha')
  })

  test('a multi-track card keeps its width when moved', async ({ page }) => {
    await openApp(page, seedSchedule({ items: [{ id: 'w', tracks: [0, 1], start: '09:00', end: '10:00', title: 'Wide' }] }))
    const board = new Board(page)
    const from = await board.at('09:30', 0, 0, 0.5)
    const to = await board.at('09:30', 1, 0, 0.5)
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(to.x, to.y, { steps: 10 })
    await page.mouse.up()
    await expect(board.card('Wide')).toHaveAccessibleName('Wide, 09:00 to 10:00, Beta + Gamma')
  })

  test('dropping onto another session turns the preview red and reverts', async ({ page }) => {
    await openApp(page, seedSchedule({ items }))
    const board = new Board(page)
    const from = await board.at('09:20', 0)
    const to = await board.at('09:20', 1) // Beta talk occupies 09:00-09:45 there
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(to.x, to.y, { steps: 10 })
    await expect(board.preview()).toHaveClass(/is-invalid/)
    await page.mouse.up()
    await expect(board.preview()).toBeHidden()
    await expect(board.card('Alpha talk')).toHaveAccessibleName('Alpha talk, 09:00 to 10:00, Alpha')
    await expect(board.card('Beta talk')).toHaveAccessibleName('Beta talk, 09:00 to 09:45, Beta')
    await expect(page.getByRole('banner').getByRole('button', { name: 'Undo' })).toBeDisabled()
  })

  test('Esc mid-drag puts the card back', async ({ page }) => {
    await openApp(page, seedSchedule({ items }))
    const board = new Board(page)
    const from = await board.at('09:30', 0)
    const to = await board.at('10:30', 2)
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(to.x, to.y, { steps: 10 })
    await expect(board.preview()).toBeVisible()
    await page.keyboard.press('Escape')
    await page.mouse.up()
    await expect(board.preview()).toBeHidden()
    await expect(board.card('Alpha talk')).toHaveAccessibleName('Alpha talk, 09:00 to 10:00, Alpha')
    await expect(page.locator('.board-card.is-dragging')).toHaveCount(0)
  })

  test('a tiny movement is a click, not a move', async ({ page }) => {
    await openApp(page, seedSchedule({ items }))
    const board = new Board(page)
    const from = await board.at('09:30', 0)
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x + 2, from.y + 2)
    await page.mouse.up()
    await expect(board.card('Alpha talk')).toHaveAccessibleName('Alpha talk, 09:00 to 10:00, Alpha')
    await expect(board.card('Alpha talk')).toHaveClass(/is-selected/)
    await expect(page.getByRole('banner').getByRole('button', { name: 'Undo' })).toBeDisabled()
  })
})

test.describe('resizing sessions', () => {
  const items = [
    { id: 'a', tracks: [0], start: '09:00', end: '10:00', title: 'Resizable' },
    { id: 'n', tracks: [0], start: '11:00', end: '11:30', title: 'Next door' },
  ]

  test('the bottom edge changes the end, snapped, and the page follows', async ({ page }) => {
    await openApp(page, seedSchedule({ items }))
    const board = new Board(page)
    const card = board.card('Resizable')
    await expect(card).toBeVisible()
    const box = (await card.boundingBox())!
    const grab = { x: box.x + box.width / 2, y: box.y + box.height - 3 }
    await expect(card.locator('.board-card__handle--bottom')).toHaveCSS('cursor', 'ns-resize')
    const target = await board.at('10:38', 0)
    await page.mouse.move(grab.x, grab.y)
    await page.mouse.down()
    await page.mouse.move(target.x, target.y, { steps: 12 })
    await expect(board.preview()).toContainText('09:00 – 10:40')
    await page.mouse.up()
    await expect(card).toHaveAccessibleName('Resizable, 09:00 to 10:40, Alpha')
    await expect.poll(() => board.previewText()).toContain('09:00 – 10:40')
  })

  test('the top edge changes the start; neither edge can cross a neighbour or shrink below 5 minutes', async ({ page }) => {
    await openApp(page, seedSchedule({ items }))
    const board = new Board(page)
    const card = board.card('Resizable')
    const box = (await card.boundingBox())!
    // Top edge up to 08:42 -> 08:40.
    const top = await board.at('08:42', 0)
    await page.mouse.move(box.x + box.width / 2, box.y + 2)
    await page.mouse.down()
    await page.mouse.move(top.x, top.y, { steps: 10 })
    await page.mouse.up()
    await expect(card).toHaveAccessibleName('Resizable, 08:40 to 10:00, Alpha')
    // Bottom edge dragged far down stops at the neighbour's start (11:00).
    const box2 = (await card.boundingBox())!
    const down = await board.at('11:50', 0)
    await page.mouse.move(box2.x + box2.width / 2, box2.y + box2.height - 3)
    await page.mouse.down()
    await page.mouse.move(down.x, down.y, { steps: 12 })
    await expect(board.preview()).toContainText('08:40 – 11:00')
    await page.mouse.up()
    await expect(card).toHaveAccessibleName('Resizable, 08:40 to 11:00, Alpha')
    // Bottom edge dragged above the top bottoms out at 5 minutes.
    const box3 = (await card.boundingBox())!
    const up = await board.at('08:00', 0)
    await page.mouse.move(box3.x + box3.width / 2, box3.y + box3.height - 3)
    await page.mouse.down()
    await page.mouse.move(up.x, up.y, { steps: 12 })
    await page.mouse.up()
    await expect(card).toHaveAccessibleName('Resizable, 08:40 to 08:45, Alpha')
  })

  test('the side edges widen and narrow the span, but not over a busy track', async ({ page }) => {
    await openApp(page, seedSchedule({ items: [...items, { id: 'g', tracks: [2], start: '09:30', end: '10:30', title: 'In the way' }] }))
    const board = new Board(page)
    const card = board.card('Resizable')
    const box = (await card.boundingBox())!
    const right = await board.at('09:30', 1)
    await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(right.x, right.y, { steps: 10 })
    await page.mouse.up()
    await expect(card).toHaveAccessibleName('Resizable, 09:00 to 10:00, Alpha + Beta')
    // Pushing on into Gamma is refused (it is busy), so the span stays two tracks wide.
    const box2 = (await card.boundingBox())!
    const further = await board.at('09:30', 2)
    await page.mouse.move(box2.x + box2.width - 2, box2.y + box2.height / 2)
    await page.mouse.down()
    await page.mouse.move(further.x, further.y, { steps: 10 })
    await page.mouse.up()
    await expect(card).toHaveAccessibleName('Resizable, 09:00 to 10:00, Alpha + Beta')
    // Narrow again from the left edge.
    const box3 = (await card.boundingBox())!
    const back = await board.at('09:30', 1)
    await page.mouse.move(box3.x + 2, box3.y + box3.height / 2)
    await page.mouse.down()
    await page.mouse.move(back.x, back.y, { steps: 10 })
    await page.mouse.up()
    await expect(card).toHaveAccessibleName('Resizable, 09:00 to 10:00, Beta')
  })
})

test.describe('editing, deleting, undoing', () => {
  const items = [
    { id: 'a', tracks: [0], start: '09:00', end: '10:00', title: 'First' },
    { id: 'b', tracks: [1], start: '09:30', end: '10:30', title: 'Second' },
  ]

  test('double-click opens the editor; changes apply live and Esc closes it', async ({ page }) => {
    await openApp(page, seedSchedule({ items, speakers: SPEAKERS }))
    const board = new Board(page)
    await board.card('First').dblclick()
    const dialog = page.getByRole('dialog', { name: 'Edit session' })
    await expect(dialog).toBeVisible()
    await dialog.getByLabel('Title').fill('Renamed')
    await expect.poll(() => board.previewText()).toContain('Renamed')
    await dialog.getByLabel('Speaker').fill('Grace Hopper')
    await dialog.getByRole('button', { name: 'Highlight' }).click()
    await expect.poll(() => board.previewText()).toContain('Grace Hopper')
    await expect(page.frameLocator('iframe[title="Preview"]').locator('.ev.key')).toHaveCount(1)
    const end = dialog.getByLabel('End', { exact: true })
    await end.fill('10:20')
    await expect(board.card('Renamed')).toHaveAccessibleName('Renamed, 09:00 to 10:20, Alpha')
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(board.card('Renamed')).toBeFocused()
  })

  test('Enter on a focused card opens the editor with the title selected', async ({ page }) => {
    await openApp(page, seedSchedule({ items }))
    const board = new Board(page)
    await board.card('First').focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog', { name: 'Edit session' }).getByLabel('Title')).toBeFocused()
  })

  test('the speaker box offers the speakers list but takes any name', async ({ page }) => {
    await openApp(page, seedSchedule({ items, speakers: SPEAKERS }))
    const board = new Board(page)
    await board.card('First').dblclick()
    const speaker = page.getByRole('dialog', { name: 'Edit session' }).getByLabel('Speaker')
    await expect(page.locator('datalist option')).toHaveCount(2)
    await speaker.fill('Someone New')
    await page.keyboard.press('Escape')
    await expect(board.card('First')).toBeVisible()
    await expect.poll(() => board.previewText()).toContain('Someone New')
  })

  test('Span all tracks and a time that collides are handled in the editor', async ({ page }) => {
    await openApp(page, seedSchedule({ items: [{ id: 'a', tracks: [0], start: '09:00', end: '10:00', title: 'Solo' }] }))
    const board = new Board(page)
    await board.card('Solo').dblclick()
    await page.getByLabel('Span all tracks').check()
    await expect(board.card('Solo')).toHaveAccessibleName('Solo, 09:00 to 10:00, Alpha + Beta + Gamma')
    await page.getByLabel('Span all tracks').uncheck()
    await expect(board.card('Solo')).toHaveAccessibleName('Solo, 09:00 to 10:00, Alpha')
  })

  test('Delete removes a card with an Undo toast; Undo brings it back', async ({ page }) => {
    await openApp(page, seedSchedule({ items }))
    const board = new Board(page)
    const card = board.card('First')
    await card.click()
    await page.keyboard.press('Delete')
    await expect(card).toHaveCount(0)
    const toast = page.getByRole('status').filter({ hasText: 'Session deleted' })
    await expect(toast).toContainText('Session deleted · Undo')
    await toast.getByRole('button', { name: 'Undo' }).click()
    await expect(board.card('First')).toHaveAccessibleName('First, 09:00 to 10:00, Alpha')
    await expect(toast).toHaveCount(0)
  })

  test('the toast disappears when something else changes, so Undo never takes back the wrong thing', async ({ page }) => {
    await openApp(page, seedSchedule({ items }))
    const board = new Board(page)
    await board.card('First').click()
    await page.keyboard.press('Delete')
    const toast = page.getByRole('status').filter({ hasText: 'Session deleted' })
    await expect(toast).toBeVisible()
    await page.getByLabel('Event title').fill('Another edit')
    await expect(toast).toHaveCount(0)
  })

  test('the toast goes away by itself after about six seconds', async ({ page }) => {
    await openApp(page, seedSchedule({ items }))
    const board = new Board(page)
    await board.card('First').click()
    await page.keyboard.press('Backspace')
    const toast = page.getByRole('status').filter({ hasText: 'Session deleted' })
    await expect(toast).toBeVisible()
    await page.waitForTimeout(5000)
    await expect(toast).toBeVisible()
    await expect(toast).toHaveCount(0, { timeout: 3000 })
  })

  test('the Delete button in the editor deletes too, and Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y walk the history', async ({ page }) => {
    await openApp(page, seedSchedule({ items }))
    const board = new Board(page)
    await board.card('Second').dblclick()
    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(board.card('Second')).toHaveCount(0)
    await page.keyboard.press('Control+z')
    await expect(board.card('Second')).toBeVisible()
    await page.keyboard.press('Control+Shift+z')
    await expect(board.card('Second')).toHaveCount(0)
    await page.keyboard.press('Control+z')
    await expect(board.card('Second')).toBeVisible()
    await page.keyboard.press('Control+y')
    await expect(board.card('Second')).toHaveCount(0)
    await page.getByRole('banner').getByRole('button', { name: 'Undo' }).click()
    await expect(board.card('Second')).toBeVisible()
    await page.getByRole('banner').getByRole('button', { name: 'Redo' }).click()
    await expect(board.card('Second')).toHaveCount(0)
  })

  test('typing a title is a single undo step, and undo covers event edits too', async ({ page }) => {
    await openApp(page, seedSchedule({ items }))
    const board = new Board(page)
    await board.card('First').dblclick()
    await page.getByRole('dialog', { name: 'Edit session' }).getByLabel('Title').fill('A much longer title')
    await page.getByRole('dialog', { name: 'Edit session' }).getByLabel('Title').press('Enter')
    await page.getByLabel('Event title').fill('Changed event')
    await page.getByRole('banner').getByRole('button', { name: 'Undo' }).click() // event title (typing grouped)
    await expect(page.getByLabel('Event title')).toHaveValue('E2E Summit')
    await page.getByRole('banner').getByRole('button', { name: 'Undo' }).click() // card title (typing grouped)
    await expect(board.card('First')).toBeVisible()
  })
})

test.describe('keyboard', () => {
  const items = [
    { id: 'a', tracks: [0], start: '09:00', end: '10:00', title: 'Movable' },
    { id: 'b', tracks: [1], start: '09:00', end: '09:30', title: 'Blocker' },
    { id: 'c', tracks: [0], start: '12:00', end: '12:30', title: 'Later one' },
  ]

  test('arrows move by 5 minutes or one track, Shift+arrows resize, and the change is announced', async ({ page }) => {
    await openApp(page, seedSchedule({ items }))
    const board = new Board(page)
    const card = board.card('Movable')
    await card.focus()
    const live = page.locator('.board__live')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await expect(card).toHaveAccessibleName('Movable, 09:10 to 10:10, Alpha')
    await expect(live).toContainText('Moved to 09:10')
    await page.keyboard.press('ArrowUp')
    await expect(card).toHaveAccessibleName('Movable, 09:05 to 10:05, Alpha')
    await page.keyboard.press('Shift+ArrowDown')
    await expect(card).toHaveAccessibleName('Movable, 09:05 to 10:10, Alpha')
    await page.keyboard.press('Shift+ArrowUp')
    await page.keyboard.press('Shift+ArrowUp')
    await expect(card).toHaveAccessibleName('Movable, 09:05 to 10:00, Alpha')
    // Right is blocked by Blocker (09:00-09:30 in Beta) until we are clear of it.
    await page.keyboard.press('ArrowRight')
    await expect(card).toHaveAccessibleName('Movable, 09:05 to 10:00, Alpha')
    await expect(live).toContainText("Can't move to that track")
    for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowDown') // 10:05
    await page.keyboard.press('ArrowRight')
    await expect(card).toHaveAccessibleName('Movable, 10:05 to 11:00, Beta')
    await expect(live).toContainText('Moved to 10:05, Beta')
    await page.keyboard.press('ArrowLeft')
    await expect(card).toHaveAccessibleName('Movable, 10:05 to 11:00, Alpha')
    // Held keys are one undo step.
    await page.keyboard.press('Control+z')
    await expect(card).toHaveAccessibleName('Movable, 09:00 to 10:00, Alpha')
  })

  test('Ctrl+D duplicates into the next free time below, and Tab visits cards in time order', async ({ page }) => {
    await openApp(page, seedSchedule({ items }))
    const board = new Board(page)
    await board.card('Movable').focus()
    await page.keyboard.press('Control+d')
    await expect(page.getByRole('button', { name: /^Movable, 10:00 to 11:00, Alpha/ })).toBeFocused()
    await expect(page.locator('.board-card')).toHaveCount(4)
    // Tab order: 09:00 Alpha, 09:00 Beta, 10:00 Alpha (copy), 12:00 Alpha.
    await board.card('Movable').first().focus()
    const order: string[] = []
    for (let i = 0; i < 4; i++) {
      order.push((await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '')) ?? '')
      await page.keyboard.press('Tab')
    }
    expect(order).toEqual([
      'Movable, 09:00 to 10:00, Alpha',
      'Blocker, 09:00 to 09:30, Beta',
      'Movable, 10:00 to 11:00, Alpha',
      'Later one, 12:00 to 12:30, Alpha',
    ])
  })

  test('arrow keys do not escape the board: a refused move says why', async ({ page }) => {
    await openApp(page, seedSchedule({ items }))
    const board = new Board(page)
    const card = board.card('Movable')
    await card.focus()
    await page.keyboard.press('ArrowLeft')
    await expect(card).toHaveAccessibleName('Movable, 09:00 to 10:00, Alpha')
    await expect(page.locator('.board__live')).toContainText("Can't move to that track")
  })
})

test.describe('tracks', () => {
  test('double-click renames, + Track adds, the menu recolours and deletes (undoably)', async ({ page }) => {
    await openApp(page, seedSchedule({ tracks: 2, items: [{ id: 'a', tracks: [1], start: '09:00', end: '10:00', title: 'On Beta' }] }))
    const board = new Board(page)
    await page.locator('.board-head', { hasText: 'Alpha' }).dblclick()
    await page.getByLabel('Track 1 name').fill('Main stage')
    await page.keyboard.press('Enter')
    await expect(page.locator('.board-head', { hasText: 'Main stage' })).toBeVisible()
    await expect(board.card('On Beta')).toHaveAccessibleName('On Beta, 09:00 to 10:00, Beta')

    await page.getByRole('button', { name: '+ Track' }).click()
    await expect(page.getByLabel('Track 3 name')).toBeFocused()
    await page.keyboard.type('Workshops')
    await page.keyboard.press('Enter')
    await expect(page.locator('.board-head')).toHaveCount(3)

    await page.getByRole('button', { name: 'Track options: Beta' }).click()
    await page.getByRole('button', { name: 'Colour #d93025' }).click()
    await expect(page.locator('.board-head', { hasText: 'Beta' }).locator('.board-head__dot')).toHaveCSS('background-color', 'rgb(217, 48, 37)')

    await page.getByRole('menuitem', { name: 'Delete track' }).click()
    await expect(page.locator('.board-head')).toHaveCount(2)
    await expect(board.card('On Beta')).toHaveCount(0)
    await page.getByRole('status').filter({ hasText: 'Track deleted' }).getByRole('button', { name: 'Undo' }).click()
    await expect(page.locator('.board-head')).toHaveCount(3)
    await expect(board.card('On Beta')).toBeVisible()
  })

  test('dragging a header reorders the tracks, keeping each session on its own track', async ({ page }) => {
    await openApp(page, seedSchedule({ items: [{ id: 'a', tracks: [0], start: '09:00', end: '10:00', title: 'On Alpha' }] }))
    const board = new Board(page)
    const head = page.locator('.board-head', { hasText: 'Alpha' })
    const box = (await head.boundingBox())!
    const target = await board.at('09:00', 2)
    await page.mouse.move(box.x + 30, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(target.x, box.y + box.height / 2, { steps: 12 })
    await page.mouse.up()
    await expect(page.locator('.board-head .board-head__name')).toHaveText(['Beta', 'Gamma', 'Alpha'])
    await expect(board.card('On Alpha')).toHaveAccessibleName('On Alpha, 09:00 to 10:00, Alpha')
    await page.keyboard.press('Control+z')
    await expect(page.locator('.board-head .board-head__name')).toHaveText(['Alpha', 'Beta', 'Gamma'])
  })

  test('with no tracks the board says so', async ({ page }) => {
    await openApp(page, seedSchedule({ tracks: 0 }))
    await expect(page.getByText('Add a track to start scheduling')).toBeVisible()
    await page.getByRole('button', { name: '+ Track' }).click()
    await page.keyboard.type('First')
    await page.keyboard.press('Enter')
    await expect(page.getByText('Drag on the board to add a session')).toBeVisible()
  })
})

test.describe('the range', () => {
  test('Earlier and Later add an hour, zoom changes the scale, and the board fits its content', async ({ page }) => {
    await openApp(page, seedSchedule({ items: [{ id: 'a', tracks: [0], start: '10:00', end: '11:00', title: 'Only' }] }))
    const cols = page.locator('.board__cols')
    await expect(cols).toHaveAttribute('data-range-start', '540') // 10:00 - 30 min -> 09:00
    await expect(cols).toHaveAttribute('data-ppm', '1.8')
    await page.getByRole('button', { name: '↑ Earlier' }).click()
    await expect(cols).toHaveAttribute('data-range-start', '480')
    await page.getByRole('button', { name: 'Compact' }).click()
    await expect(cols).toHaveAttribute('data-ppm', '1.1')
    const before = await cols.evaluate((el) => el.getBoundingClientRect().height)
    await page.getByRole('button', { name: '↓ Later' }).click()
    expect(await cols.evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThan(before)
  })

  test('dragging near the bottom edge scrolls the board', async ({ page }) => {
    await openApp(page, seedSchedule({ items: [{ id: 'a', tracks: [0], start: '09:00', end: '09:30', title: 'Scrolly' }, { id: 'z', tracks: [1], start: '20:00', end: '21:00', title: 'Far away' }] }))
    await page.getByRole('button', { name: 'Comfortable' }).click()
    const board = new Board(page)
    const viewport = page.locator('.board__viewport')
    await board.cols.scrollIntoViewIfNeeded()
    const card = board.card('Scrolly')
    const box = (await card.boundingBox())!
    const vp = (await viewport.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + 10)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2, vp.y + vp.height - 12, { steps: 8 })
    const before = await viewport.evaluate((el) => el.scrollTop)
    await page.waitForTimeout(800)
    expect(await viewport.evaluate((el) => el.scrollTop)).toBeGreaterThan(before + 100)
    await page.keyboard.press('Escape')
    await page.mouse.up()
    await expect(card).toHaveAccessibleName('Scrolly, 09:00 to 09:30, Alpha')
  })
})

test.describe('scrolling while dragging', () => {
  test('the wheel moves the board under a held card and the preview follows', async ({ page }) => {
    await openApp(page, seedSchedule({ items: [{ id: 'a', tracks: [0], start: '09:00', end: '09:30', title: 'Held' }, { id: 'z', tracks: [1], start: '20:00', end: '21:00', title: 'Far away' }] }))
    const board = new Board(page)
    const box = (await board.card('Held').boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 40, { steps: 5 })
    const before = await board.preview().innerText()
    await page.mouse.wheel(0, 216) // two hours at the comfortable zoom
    await expect.poll(() => board.preview().innerText()).not.toBe(before)
    await page.keyboard.press('Escape')
    await page.mouse.up()
  })
})

test.describe('files', () => {
  test('exporting after edits round-trips through Open', async ({ page }) => {
    await openApp(page, seedSchedule({ items: [{ id: 'a', tracks: [0], start: '09:00', end: '10:00', title: 'Original' }] }))
    const board = new Board(page)
    // Edit with the pointer: draw one session, move the old one.
    const drag = await board.drag({ time: '11:00', track: 2 }, { time: '11:45', track: 2 })
    await drag.release()
    await page.keyboard.type('Drawn')
    await page.keyboard.press('Enter')
    const from = await board.at('09:30', 0)
    const to = await board.at('09:50', 1)
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(to.x, to.y, { steps: 10 })
    await page.mouse.up()
    await expect(board.card('Original')).toHaveAccessibleName('Original, 09:20 to 10:20, Beta')

    await page.getByLabel('Embed fonts for offline use').uncheck()
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save HTML' }).click()])
    const path = await download.path()
    expect(download.suggestedFilename()).toMatch(/\.html$/)

    // A fresh app with a different schedule, then Open the exported page.
    await openApp(page, seedSchedule({ tracks: 1 }))
    await page.reload()
    await page.getByTestId('open-file').setInputFiles(path)
    await expect(board.card('Original')).toHaveAccessibleName('Original, 09:20 to 10:20, Beta')
    await expect(board.card('Drawn')).toHaveAccessibleName('Drawn, 11:00 to 11:45, Gamma')
    await expect(page.locator('.board-card')).toHaveCount(2)
  })
})
