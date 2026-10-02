import { expect, test, type Page } from '@playwright/test'
import { Board, openApp, seedSchedule } from './helpers.ts'

const items = [
  { id: 'a', tracks: [0], start: '09:00', end: '10:00', title: 'Opening', speaker: 'Ada' },
  { id: 'b', tracks: [1], start: '10:30', end: '11:15', title: 'Panel' },
]

/** The visible, overlap-free check: does A's box intersect B's? */
async function overlaps(a: ReturnType<Page['locator']>, b: ReturnType<Page['locator']>): Promise<boolean> {
  const [x, y] = [await a.boundingBox(), await b.boundingBox()]
  if (!x || !y) throw new Error('missing box')
  return x.x < y.x + y.width && y.x < x.x + x.width && x.y < y.y + y.height && y.y < x.y + x.height
}

test.describe('layout', () => {
  test('the page never scrolls: the sidebar, the board and the preview each scroll on their own', async ({ page }) => {
    await openApp(page, seedSchedule({ items }))
    const scroll = await page.evaluate(() => ({ doc: document.documentElement.scrollHeight - document.documentElement.clientHeight, win: window.innerHeight, body: document.body.scrollHeight }))
    expect(scroll.doc).toBeLessThanOrEqual(0)
    const regions = await page.evaluate(() => {
      const box = (sel: string) => {
        const el = document.querySelector(sel) as HTMLElement
        const r = el.getBoundingClientRect()
        return { overflowY: getComputedStyle(el).overflowY, h: Math.round(r.height), scrollable: el.scrollHeight > el.clientHeight, bottom: Math.round(r.bottom) }
      }
      return { sidebar: box('.sidebar'), board: box('.board__viewport'), main: box('.main'), win: window.innerHeight }
    })
    expect(regions.sidebar.overflowY).toBe('auto')
    expect(regions.board.overflowY).toBe('auto')
    // The board is the main working area: it fills the column down to the bottom of the window.
    expect(regions.main.bottom).toBeLessThanOrEqual(regions.win)
    expect(regions.board.h).toBeGreaterThan(500)
    // No scrolling container is nested in another scrolling container.
    const nested = await page.evaluate(() => {
      const scrollers = [...document.querySelectorAll<HTMLElement>('*')].filter((el) => ['auto', 'scroll'].includes(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 1)
      return scrollers.filter((el) => scrollers.some((other) => other !== el && other.contains(el))).map((el) => el.className)
    })
    expect(nested).toEqual([])
  })

  test('tracks share the full width: there is no empty column beside them', async ({ page }) => {
    await openApp(page, seedSchedule({ items }))
    const geometry = await page.evaluate(() => {
      const view = document.querySelector('.board__viewport')!.getBoundingClientRect()
      const gutter = document.querySelector('.board__gutter')!.getBoundingClientRect()
      const heads = [...document.querySelectorAll('.board-head')].map((h) => h.getBoundingClientRect())
      return { viewRight: view.right, gutterRight: gutter.right, last: heads[heads.length - 1]!.right, first: heads[0]!.left, count: heads.length }
    })
    expect(geometry.count).toBe(3)
    expect(Math.abs(geometry.last - geometry.viewRight)).toBeLessThan(18) // only the scrollbar, if any
    expect(Math.abs(geometry.first - geometry.gutterRight)).toBeLessThan(2)
  })

  test('the sidebar is a set of collapsible sections, with Speakers among them', async ({ page }) => {
    await openApp(page, seedSchedule({ items }))
    const sidebar = page.getByRole('complementary', { name: 'Settings' })
    for (const name of ['Event', 'Branding', 'Labels', 'Speakers']) await expect(sidebar.getByRole('button', { name })).toBeVisible()
    await expect(sidebar.getByRole('button', { name: 'Event' })).toHaveAttribute('aria-expanded', 'true')
    await sidebar.getByRole('button', { name: 'Speakers' }).click()
    await expect(sidebar.getByRole('button', { name: 'Speakers' })).toHaveAttribute('aria-expanded', 'true')
    await expect(sidebar.getByRole('button', { name: 'Event' })).toHaveAttribute('aria-expanded', 'false')
  })
})

test.describe('the card follows the pointer', () => {
  test('moving drags the card itself; its origin shows a dashed placeholder and the landing spot an outline', async ({ page }) => {
    await openApp(page, seedSchedule({ items }))
    const board = new Board(page)
    const card = board.card('Opening')
    const before = (await card.boundingBox())!
    const from = { x: before.x + before.width / 2, y: before.y + 30 }
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x + 13, from.y + 47, { steps: 6 }) // an off-grid distance: the card is not snapped
    const during = (await card.boundingBox())!
    expect(Math.abs(during.x - (before.x + 13))).toBeLessThan(1.5)
    expect(Math.abs(during.y - (before.y + 47))).toBeLessThan(1.5)
    await expect(card).toHaveClass(/is-moving/)
    await expect(page.locator('.board__placeholder')).toBeVisible()
    const placeholder = (await page.locator('.board__placeholder').boundingBox())!
    expect(Math.abs(placeholder.y - before.y)).toBeLessThan(2)
    await expect(board.preview()).toHaveAttribute('data-kind', 'move')
    // The landing outline is snapped, the card is not.
    await expect(board.preview()).toContainText('09:25 – 10:25')
    await page.mouse.up()
    await expect(card).toHaveAccessibleName('Opening, 09:25 to 10:25, Alpha')
    await expect(card).not.toHaveClass(/is-moving/)
    await expect(page.locator('.board__placeholder')).toBeHidden()
  })

  test('resizing stretches the card itself, live', async ({ page }) => {
    await openApp(page, seedSchedule({ items }))
    const board = new Board(page)
    const card = board.card('Opening')
    const box = (await card.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height - 3)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height + 60, { steps: 8 })
    const during = (await card.boundingBox())!
    expect(during.height).toBeGreaterThan(box.height + 40)
    await expect(card.locator('.board-card__time')).toHaveText(/09:00 – 10:3\d/)
    await page.mouse.up()
    await expect(card).toHaveAccessibleName(/^Opening, 09:00 to 10:3\d, Alpha$/)
  })

  test('a drop onto another card puts the card back where it was', async ({ page }) => {
    await openApp(page, seedSchedule({ items }))
    const board = new Board(page)
    const card = board.card('Opening')
    const from = await board.at('09:30', 0)
    const onto = await board.at('10:50', 1)
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(onto.x, onto.y, { steps: 8 })
    await expect(board.preview()).toHaveClass(/is-invalid/)
    await page.mouse.up()
    await expect(card).toHaveAccessibleName('Opening, 09:00 to 10:00, Alpha')
    const after = (await card.boundingBox())!
    expect(after.y).toBeGreaterThan(0)
    await expect(card).not.toHaveClass(/is-moving/)
  })
})

test.describe('a new session', () => {
  test('stays out of the live preview until it has a title', async ({ page }) => {
    await openApp(page, seedSchedule({ items }))
    const board = new Board(page)
    const frame = page.frameLocator('iframe[title="Preview"]')
    await expect(frame.locator('.ev')).toHaveCount(2)
    const drag = await board.drag({ time: '12:00', track: 2 }, { time: '12:45', track: 2 })
    await drag.release()
    await expect(page.getByRole('dialog', { name: 'Edit session' })).toBeVisible()
    await page.waitForTimeout(300)
    await expect(frame.locator('.ev')).toHaveCount(2) // the untitled card is not drawn
    await page.keyboard.type('Named')
    await expect(frame.locator('.ev')).toHaveCount(3)
    await page.keyboard.press('Enter')
    await expect(frame.locator('.ev')).toHaveCount(3)
  })

  test('cancelling it leaves the preview as it was', async ({ page }) => {
    await openApp(page, seedSchedule({ items }))
    const board = new Board(page)
    const frame = page.frameLocator('iframe[title="Preview"]')
    const at = await board.at('12:00', 2)
    await page.mouse.click(at.x, at.y)
    await page.keyboard.press('Escape')
    await expect(frame.locator('.ev')).toHaveCount(2)
    await expect(page.locator('.board-card')).toHaveCount(2)
  })
})

test.describe('the editor never covers its own card', () => {
  for (const width of [1440, 1280, 1000]) {
    test(`at ${width}px wide`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await openApp(page, seedSchedule({ items }))
      const board = new Board(page)
      for (const [title, track] of [['Opening', 0], ['Panel', 1]] as const) {
        await board.card(title).dblclick()
        const dialog = page.getByRole('dialog', { name: 'Edit session' })
        await expect(dialog).toBeVisible()
        expect(await overlaps(dialog, board.card(title)), `${title} at ${width}`).toBe(false)
        await page.keyboard.press('Escape')
        void track
      }
      // A freshly drawn one too.
      const drag = await board.drag({ time: '12:00', track: 2 }, { time: '12:45', track: 2 })
      await drag.release()
      const dialog = page.getByRole('dialog', { name: 'Edit session' })
      await expect(dialog).toBeVisible()
      expect(await overlaps(dialog, page.locator('.board-card.is-selected'))).toBe(false)
    })
  }

  test('on a phone it is a bottom sheet, with the card still visible above it', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
    const page = await context.newPage()
    await openApp(page, seedSchedule({ items }))
    await page.getByRole('button', { name: 'Add session' }).click()
    const dialog = page.getByRole('dialog', { name: 'Edit session' })
    await expect(dialog).toHaveClass(/is-sheet/)
    const sheet = (await dialog.boundingBox())!
    expect(Math.round(sheet.y + sheet.height)).toBeGreaterThanOrEqual(840) // sits at the bottom edge
    expect(sheet.width).toBeGreaterThan(380)
    const card = (await page.locator('.board-card.is-selected').boundingBox())!
    expect(card.y + card.height).toBeLessThanOrEqual(sheet.y + 2)
    expect(card.y).toBeGreaterThan(100)
    // Only the essentials until "More options".
    await expect(dialog.getByLabel('Note')).toBeHidden()
    await dialog.getByRole('button', { name: 'More options' }).click()
    await expect(dialog.getByLabel('Note')).toBeVisible()
    await context.close()
  })
})

test.describe('speaker combobox', () => {
  const speakers = [
    { id: 's1', name: 'Ada Lovelace', role: 'Engineer' },
    { id: 's2', name: 'Grace Hopper', role: 'Admiral' },
  ]

  test('filters, picks with the arrows, and adds a new name to the speakers list', async ({ page }) => {
    await openApp(page, seedSchedule({ items, speakers }))
    const board = new Board(page)
    await board.card('Panel').dblclick()
    const dialog = page.getByRole('dialog', { name: 'Edit session' })
    const box = dialog.getByRole('combobox', { name: 'Speaker' })
    await box.click()
    await expect(page.getByRole('listbox').getByRole('option')).toHaveText([/Ada Lovelace/, /Grace Hopper/])
    await box.fill('gra')
    await expect(page.getByRole('listbox').getByRole('option')).toHaveText([/Grace Hopper/, /Add ‘gra’ as new speaker/])
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await expect(box).toHaveValue('Grace Hopper')
    await expect.poll(() => board.previewText()).toContain('Grace Hopper')

    await box.fill('Alan Turing')
    await page.getByRole('option', { name: 'Add ‘Alan Turing’ as new speaker' }).click()
    await expect(box).toHaveValue('Alan Turing')
    await page.keyboard.press('Escape')
    await page.getByRole('complementary', { name: 'Settings' }).getByRole('button', { name: 'Speakers' }).click()
    await expect(page.getByLabel('Speaker 3 name')).toHaveValue('Alan Turing')
    await expect.poll(() => board.previewText()).toContain('Alan Turing') // also listed in the page's Speakers section
  })
})

test.describe('the right-to-left board', () => {
  test('on the Arabic template: mirrored, and you can create and move a card', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1100 })
    await openApp(page, seedSchedule({ tracks: 2, items: [] }))
    await page.getByRole('button', { name: /^File/ }).click()
    await page.getByRole('menuitem', { name: 'New…' }).click()
    await page.getByRole('button', { name: 'Use template: Arabic conference' }).click()
    const cols = page.locator('.board__cols')
    await expect(cols).toHaveAttribute('data-rtl', 'true')
    await expect(page.locator('.board__canvas')).toHaveAttribute('dir', 'rtl')

    // Gutter on the right, first track on the right.
    const geometry = await page.evaluate(() => {
      const gutter = document.querySelector('.board__gutter')!.getBoundingClientRect()
      const colsRect = document.querySelector('.board__cols')!.getBoundingClientRect()
      const heads = [...document.querySelectorAll('.board-head')].map((h) => ({ name: h.textContent ?? '', x: h.getBoundingClientRect().left }))
      return { gutterX: gutter.left, colsX: colsRect.left, heads }
    })
    expect(geometry.gutterX).toBeGreaterThan(geometry.colsX)
    expect(geometry.heads[0]!.x).toBeGreaterThan(geometry.heads[1]!.x)
    expect(geometry.heads[0]!.name).toContain('المسار الأول')

    const board = new Board(page)
    // Draw in the second track (the left column) of an empty stretch: 14:00, after the closing session.
    await page.getByRole('button', { name: '↓ Later' }).click()
    const info = await cols.evaluate((el) => Number(el.getAttribute('data-range-start')))
    expect(info).toBeGreaterThan(0)
    const track1 = 0
    const track2 = 1
    const drag = await board.drag({ time: '14:10', track: track2 }, { time: '14:55', track: track2 })
    await drag.release()
    await page.keyboard.type('جلسة جديدة')
    await page.keyboard.press('Enter')
    const card = page.getByRole('button', { name: /^جلسة جديدة, 14:10 to 14:55, / })
    await expect(card).toHaveAccessibleName('جلسة جديدة, 14:10 to 14:55, المسار الثاني')
    const created = (await card.boundingBox())!
    expect(created.x + created.width / 2).toBeLessThan((await page.locator('.board-head').nth(0).boundingBox())!.x) // the second track is to the left

    // Move it to the first track (to the right) and 20 minutes later.
    const from = { x: created.x + created.width / 2, y: created.y + created.height / 2 }
    const to = await board.at('14:30', track1, 0, 0.5)
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(to.x, to.y + (created.height / 2 - 0), { steps: 10 })
    await page.mouse.up()
    await expect(page.getByRole('button', { name: /^جلسة جديدة, / })).toHaveAccessibleName(/^جلسة جديدة, 14:\d\d to 1\d:\d\d, المسار الأول$/)
    // Keyboard: Left goes to the next track on a mirrored board.
    await page.getByRole('button', { name: /^جلسة جديدة, / }).focus()
    await page.keyboard.press('ArrowLeft')
    await expect(page.getByRole('button', { name: /^جلسة جديدة, / })).toHaveAccessibleName(/المسار الثاني$/)
  })
})

test.describe('touch', () => {
  async function touchPage(browser: import('@playwright/test').Browser) {
    const context = await browser.newContext({ viewport: { width: 1000, height: 900 }, hasTouch: true })
    const page = await context.newPage()
    await openApp(page, seedSchedule({ items: [{ id: 'anchor', tracks: [1], start: '09:00', end: '09:30', title: 'Anchor' }, { id: 'z', tracks: [1], start: '20:00', end: '21:00', title: 'Far away' }] }))
    const cdp = await context.newCDPSession(page)
    const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', x = 0, y = 0) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] })
    return { context, page, send }
  }

  test('a plain tap on empty space creates a 30 minute session', async ({ browser }) => {
    const { context, page } = await touchPage(browser)
    const board = new Board(page)
    const at = await board.at('10:12', 0)
    await page.touchscreen.tap(at.x, at.y)
    await expect(page.getByRole('dialog', { name: 'Edit session' })).toBeVisible()
    await page.keyboard.type('Tapped')
    await page.keyboard.press('Enter')
    await expect(board.card('Tapped')).toHaveAccessibleName('Tapped, 10:10 to 10:40, Alpha')
    await context.close()
  })

  test('a long press then a drag draws a session, snapped to 5 minutes', async ({ browser }) => {
    const { context, page, send } = await touchPage(browser)
    const board = new Board(page)
    const a = await board.at('10:00', 1)
    const b = await board.at('10:47', 1)
    await send('touchStart', a.x, a.y)
    await page.waitForTimeout(500) // past the 350 ms hold
    await expect(board.preview()).toBeVisible() // armed: the thirty minute hint shows
    for (let i = 1; i <= 8; i++) await send('touchMove', a.x, a.y + ((b.y - a.y) * i) / 8)
    await expect(board.preview()).toContainText('10:00 – 10:45')
    await send('touchEnd')
    await expect(page.getByRole('dialog', { name: 'Edit session' })).toBeVisible()
    await page.keyboard.type('Pressed')
    await page.keyboard.press('Enter')
    await expect(board.card('Pressed')).toHaveAccessibleName('Pressed, 10:00 to 10:45, Beta')
    await context.close()
  })

  test('swiping before the hold scrolls the board and creates nothing', async ({ browser }) => {
    const { context, page, send } = await touchPage(browser)
    const board = new Board(page)
    const viewport = page.locator('.board__viewport')
    const start = await board.at('11:00', 0)
    const before = await viewport.evaluate((el) => el.scrollTop)
    await send('touchStart', start.x, start.y)
    for (let i = 1; i <= 8; i++) await send('touchMove', start.x, start.y - i * 25)
    await send('touchEnd')
    await page.waitForTimeout(400)
    expect(await viewport.evaluate((el) => el.scrollTop)).toBeGreaterThan(before + 20)
    await expect(page.getByRole('dialog', { name: 'Edit session' })).toHaveCount(0)
    await expect(page.locator('.board-card')).toHaveCount(2)
    await context.close()
  })

  test('a card still drags immediately with a finger', async ({ browser }) => {
    const { context, page, send } = await touchPage(browser)
    const board = new Board(page)
    await page.getByRole('button', { name: '+ Add session' }).click()
    await page.keyboard.type('Finger')
    await page.keyboard.press('Enter')
    await board.reveal('09:00')
    const card = board.card('Finger')
    const box = (await card.boundingBox())!
    const to = await board.at('10:30', 0)
    await send('touchStart', box.x + box.width / 2, box.y + box.height / 2)
    for (let i = 1; i <= 8; i++) await send('touchMove', box.x + box.width / 2, box.y + box.height / 2 + ((to.y - box.y - box.height / 2) * i) / 8)
    await send('touchEnd')
    await expect(card).toHaveAccessibleName(/^Finger, 10:1\d to 10:4\d, Alpha$/)
    await context.close()
  })
})

test.describe('shell', () => {
  test('File menu, Export dialog and Edit | Split | Preview', async ({ page }) => {
    await openApp(page, seedSchedule({ items }))
    await expect(page.getByRole('button', { name: 'Split' })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    await expect(page.locator('iframe[title="Preview"]')).toHaveCount(0)
    await page.getByRole('button', { name: 'Preview', exact: true }).click()
    await expect(page.locator('.board')).toHaveCount(0)
    await expect(page.locator('iframe[title="Preview"]')).toBeVisible()
    await page.getByRole('button', { name: 'Split' }).click()

    await page.getByRole('button', { name: /^File/ }).click()
    await expect(page.getByRole('menuitem')).toHaveText(['New…', 'Open…', 'Save JSON', 'Save as template…'])
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Export' }).click()
    await expect(page.getByRole('dialog', { name: 'Export' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('status', { name: 'Autosave status' })).toHaveText('Saved')
    await page.getByLabel('Event title').fill('Changed')
    await expect(page.getByRole('status', { name: 'Autosave status' })).toHaveText('Saved', { timeout: 3000 })
  })

  test('below 1280px it starts in Edit; on a phone the sidebar is a drawer and the preview a tab', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
    const page = await context.newPage()
    await openApp(page, seedSchedule({ items }))
    await expect(page.getByRole('button', { name: 'Split' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveAttribute('aria-pressed', 'true')
    const sidebar = page.getByRole('complementary', { name: 'Settings' })
    await expect(sidebar).toBeHidden()
    await page.getByRole('button', { name: 'Settings' }).click()
    await expect(sidebar).toBeVisible()
    const box = (await sidebar.boundingBox())!
    expect(box.width).toBeLessThanOrEqual(360)
    await page.getByLabel('Event title').fill('From the drawer')
    await page.keyboard.press('Escape')
    await expect(sidebar).toBeHidden()
    // The board scrolls sideways when there are more tracks than fit.
    await page.getByRole('button', { name: 'More board options' }).click()
    await page.getByRole('menuitem', { name: '+ Track' }).click()
    await page.keyboard.type('Fourth{Enter}')
    const sideways = await page.locator('.board__viewport').evaluate((el) => el.scrollWidth > el.clientWidth)
    expect(sideways).toBe(true)
    await page.getByRole('button', { name: 'Preview', exact: true }).click()
    await expect(page.locator('iframe[title="Preview"]')).toBeVisible()
    await expect.poll(async () => (await page.frameLocator('iframe[title="Preview"]').locator('body').innerText()).includes('From the drawer')).toBe(true)
    await context.close()
  })
})

test.describe('table mode', () => {
  async function openTable(page: Page) {
    await openApp(page, seedSchedule({ items: [{ id: 'a', tracks: [0], start: '09:00', end: '09:30', title: 'One' }, { id: 'b', tracks: [0], start: '09:30', end: '10:00', title: 'Two' }, { id: 'c', tracks: [0], start: '10:00', end: '10:30', title: 'Three' }] }))
    await page.getByRole('button', { name: 'Table', exact: true }).click()
    await expect(page.locator('tr[data-row-id]')).toHaveCount(3)
  }

  test('inputs are borderless until hovered or focused', async ({ page }) => {
    await openTable(page)
    const cell = page.getByLabel('Session for row 09:00')
    await expect(cell).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)')
    await cell.hover()
    await expect(cell).not.toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)')
    await page.mouse.move(0, 0)
    await cell.focus()
    await expect(cell).toHaveCSS('border-top-color', 'rgb(11, 87, 208)')
  })

  test('Tab and Enter move between cells, and Enter on the last row adds one', async ({ page }) => {
    await openTable(page)
    await page.getByLabel('Session for row 09:00').click()
    await page.keyboard.type('First')
    await page.keyboard.press('Enter')
    await expect(page.getByLabel('Session for row 09:30')).toBeFocused()
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    await expect(page.locator('tr[data-row-id]')).toHaveCount(4)
    await expect(page.getByLabel('Session for row 10:30')).toBeFocused()
    await page.keyboard.type('Added')
    await page.keyboard.press('Tab')
    await expect(page.getByLabel('Speaker for row 10:30')).toBeFocused()
    await expect.poll(() => new Board(page).previewText()).toContain('Added')
  })

  test('rows reorder by dragging their handle', async ({ page }) => {
    await openTable(page)
    const handle = page.getByRole('button', { name: 'Drag to reorder row 1' })
    const target = (await page.locator('tr[data-row-id]').nth(2).boundingBox())!
    const from = (await handle.boundingBox())!
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    await page.mouse.down()
    await page.mouse.move(from.x + from.width / 2, target.y + target.height - 4, { steps: 10 })
    await expect(page.locator('tr.is-drop-after')).toHaveCount(1)
    await page.mouse.up()
    await expect(page.getByLabel('Row 3 start')).toHaveValue('09:00')
    await expect(page.getByLabel('Row 1 start')).toHaveValue('09:30')
    await page.keyboard.press('Control+z')
    await expect(page.getByLabel('Row 1 start')).toHaveValue('09:00')
  })
})

test.describe('dialogs', () => {
  test('deleting a saved template asks with the app dialog; an undoable action never asks', async ({ page }) => {
    await openApp(page, seedSchedule({ items }))
    await page.getByRole('button', { name: /^File/ }).click()
    await page.getByRole('menuitem', { name: 'Save as template…' }).click()
    await page.getByRole('button', { name: 'Save template' }).click()
    await page.getByRole('button', { name: /^File/ }).click()
    await page.getByRole('menuitem', { name: 'New…' }).click()
    await page.getByRole('button', { name: 'Delete E2E Summit' }).click()
    const confirm = page.getByRole('dialog', { name: 'Delete “E2E Summit”?' })
    await expect(confirm).toBeVisible()
    await confirm.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('article', { name: 'E2E Summit' })).toBeVisible()
    await page.getByRole('button', { name: 'Delete E2E Summit' }).click()
    await page.getByRole('dialog', { name: 'Delete “E2E Summit”?' }).getByRole('button', { name: 'Delete template' }).click()
    await expect(page.getByRole('article', { name: 'E2E Summit' })).toHaveCount(0)
    // Choosing a template replaces the schedule at once, with an Undo toast instead of a question.
    await page.getByRole('button', { name: 'Use template: Sample event' }).click()
    await expect(page.getByLabel('Event title')).toHaveValue('Google for Developers Day: Cairo')
    await page.getByRole('status', { name: 'Notification' }).getByRole('button', { name: 'Undo' }).click()
    await expect(page.getByLabel('Event title')).toHaveValue('E2E Summit')
  })

  test('the gallery has a Sample event card, balanced cards, whole-page thumbnails, and search once there are many templates', async ({ page }) => {
    await openApp(page, seedSchedule({ items }))
    const many = Array.from({ length: 8 }, (_, i) => ({ id: `tpl_${i}`, name: `Saved ${i + 1}`, description: i === 3 ? 'unique words' : '', createdAt: new Date(2026, 0, i + 1).toISOString(), schedule: seedSchedule({ items }) }))
    await page.evaluate((entries) => localStorage.setItem('schedule-builder:templates:v1', JSON.stringify(entries)), many)
    await page.getByRole('button', { name: /^File/ }).click()
    await page.getByRole('menuitem', { name: 'New…' }).click()
    await expect(page.getByRole('article', { name: 'Sample event' })).toBeVisible()
    // Every card is the same width and the last row of a section is centred, never a lone stretched card.
    const widths = await page.locator('article.card').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width)))
    expect(new Set(widths).size).toBe(1)
    // The thumbnail frames the whole page: the page iframe, scaled, fits inside its box.
    const fit = await page.locator('.card__thumb').first().evaluate((el) => {
      const frame = el.querySelector('iframe')!.getBoundingClientRect()
      const box = el.getBoundingClientRect()
      return { frameW: Math.round(frame.width), boxW: Math.round(box.width), frameH: Math.round(frame.height), boxH: Math.round(box.height) }
    })
    expect(fit.frameW).toBeLessThanOrEqual(fit.boxW + 2)
    expect(fit.frameH).toBeGreaterThanOrEqual(fit.boxH - 1)
    await page.getByLabel('Search my templates').fill('unique')
    await expect(page.getByRole('region', { name: 'My templates' }).getByRole('article')).toHaveCount(1)
    await page.getByLabel('Sort my templates').selectOption('name')
  })
})

test.describe('speakers section', () => {
  test('add, rename (also in sessions), recolour and delete with Undo', async ({ page }) => {
    await openApp(page, seedSchedule({ items, speakers: [{ id: 's1', name: 'Ada', role: 'Engineer' }] }))
    const board = new Board(page)
    await page.getByRole('complementary', { name: 'Settings' }).getByRole('button', { name: 'Speakers' }).click()
    await page.getByLabel('Speaker 1 name').fill('Ada King')
    await expect(board.card('Opening')).toBeVisible()
    await page.getByRole('button', { name: '+ Add speaker' }).click()
    await expect(page.getByLabel('Speaker 2 name')).toBeFocused()
    await page.keyboard.type('Grace')
    await page.getByLabel('Speaker 2 role').fill('Admiral')
    await expect.poll(() => board.previewText()).toContain('Admiral')
    await page.getByRole('button', { name: 'Delete speaker Grace' }).click()
    await expect(page.getByLabel('Speaker 2 name')).toHaveCount(0)
    await page.getByRole('status', { name: 'Notification' }).getByRole('button', { name: 'Undo' }).click()
    await expect(page.getByLabel('Speaker 2 name')).toHaveValue('Grace')
  })
})

test.describe('phone chrome', () => {
  test('one bar row under the top bar: modes, an icon + and a ... menu; the board starts near the top', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
    const page = await context.newPage()
    await openApp(page, seedSchedule({ items }))
    const mode = page.getByRole('group', { name: 'Mode' })
    const add = page.getByRole('button', { name: 'Add session' })
    const more = page.getByRole('button', { name: 'More board options' })
    await expect(add).toBeVisible()
    await expect(more).toBeVisible()
    // Everything that used to be a second row shares one row, mode switch first.
    const [m, a, o] = [(await mode.boundingBox())!, (await add.boundingBox())!, (await more.boundingBox())!]
    expect(Math.abs(m.y + m.height / 2 - (a.y + a.height / 2))).toBeLessThanOrEqual(3)
    expect(Math.abs(a.y + a.height / 2 - (o.y + o.height / 2))).toBeLessThanOrEqual(3)
    expect(m.x).toBeLessThan(a.x)
    expect(a.x).toBeLessThan(o.x)
    // The label of the icon button is not "+": it is announced as Add session.
    await expect(add).toHaveAccessibleName('Add session')
    // The board itself (its scrolling area) starts within about 110px of the top of the window.
    const view = (await page.locator('.board__viewport').boundingBox())!
    expect(view.y).toBeLessThanOrEqual(110)
    // + Track and the zoom choices live in the overflow menu.
    await more.click()
    await expect(page.getByRole('menuitem')).toHaveText(['+ Track', 'Compact zoom', '✓ Comfortable zoom'])
    await page.keyboard.press('Escape')
    // No horizontal page scroll.
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
    await context.close()
  })
})

test.describe('table columns strip', () => {
  const rows = [
    { id: 'a', tracks: [0], start: '09:00', end: '09:30', title: 'One' },
    { id: 'b', tracks: [0], start: '09:30', end: '10:00', title: 'Two' },
  ]

  test('chips sit above a full-width table; click edits, drag reorders, + Column adds', async ({ page }) => {
    await openApp(page, seedSchedule({ items: rows }))
    await page.getByRole('button', { name: 'Table', exact: true }).click()
    await expect(page.locator('tr[data-row-id]')).toHaveCount(2)
    await expect(page.getByRole('heading', { name: 'Columns' })).toHaveCount(0)
    const chips = page.locator('.chips__list .chip:not(.chip--add)')
    await expect(chips).toHaveCount(3)
    // One compact strip, not a tall panel, and the table takes the width the centre column has.
    const strip = (await page.locator('.main__bar').boundingBox())!
    expect(strip.height).toBeLessThan(70)
    const main = (await page.locator('.main').boundingBox())!
    const wrap = (await page.locator('.sheet-wrap').boundingBox())!
    expect(wrap.width).toBeGreaterThan(main.width - 48)
    expect(wrap.y).toBeLessThan(strip.y + strip.height + 24)

    // Click: rename in a small popover.
    await chips.nth(1).click()
    const dialog = page.getByRole('dialog', { name: 'Edit column 2' })
    await expect(dialog).toBeVisible()
    await dialog.getByLabel('Column 2 name').fill('Presenter')
    await expect(chips.nth(1)).toContainText('Presenter')
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)

    // Drag the third chip before the first.
    const from = (await chips.nth(2).boundingBox())!
    const to = (await chips.nth(0).boundingBox())!
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    await page.mouse.down()
    await page.mouse.move(to.x + 6, to.y + to.height / 2, { steps: 12 })
    await expect(page.locator('.chips__list li.is-drop-before')).toHaveCount(1)
    await page.mouse.up()
    await expect(chips.first()).toContainText('Tag')
    await expect(page.getByRole('dialog', { name: /Edit column/ })).toHaveCount(0) // a drag is not a click
    await page.keyboard.press('Control+z')
    await expect(chips.first()).toContainText('Session')

    // + Column adds one and opens its editor, name selected.
    await page.getByRole('button', { name: '+ Column' }).click()
    await expect(chips).toHaveCount(4)
    await expect(page.getByLabel('Column 4 name')).toBeFocused()
  })
})

test.describe('first switch to a table', () => {
  test('the grid content comes along: titles, speakers and track tags fill the new columns', async ({ page }) => {
    await openApp(page, seedSchedule({
      items: [
        { id: 'a', tracks: [0], start: '09:00', end: '10:00', title: 'Build with Gemma 4', speaker: 'Eman' },
        { id: 'b', tracks: [1], start: '09:00', end: '10:00', title: 'Second talk', speaker: 'Sam' },
        { id: 'c', tracks: [0, 1, 2], start: '10:00', end: '10:30', title: 'Lunch', variant: 'break' },
      ],
    }))
    await page.getByRole('button', { name: 'Table', exact: true }).click()
    await expect(page.getByLabel('Session for row 09:00')).toHaveValue('Build with Gemma 4 / Second talk')
    await expect(page.getByLabel('Speaker for row 09:00')).toHaveValue('Eman, Sam')
    await expect(page.getByLabel('Tag for row 09:00')).toHaveValue('Alpha, Beta')
    await expect(page.getByLabel('Session for row 10:00')).toHaveValue('Lunch')
    await expect(page.getByLabel('Tag for row 10:00')).toHaveValue('Everyone')
    // Empty tag cells show a short hint that is not cut off; text cells have none.
    await expect(page.getByLabel('Tag for row 09:00')).toHaveAttribute('placeholder', 'tag, tag')
    await expect(page.getByLabel('Session for row 09:00')).not.toHaveAttribute('placeholder', /.+/)
  })

  test('on the Cairo sample, Build with Gemma 4 is in a Session cell', async ({ page }) => {
    await page.route(/https?:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com)\/.*/, (route) => route.abort())
    await page.goto('/')
    await expect(page.getByLabel('Event title')).toHaveValue('Google for Developers Day: Cairo')
    await page.getByRole('button', { name: 'Table', exact: true }).click()
    await expect(page.getByLabel('Session for row 17:05')).toHaveValue('Build with Gemma 4')
    await expect(page.getByLabel('Speaker for row 17:05')).toHaveValue('Eman Alrefai')
  })
})

test.describe('tiny cards', () => {
  test('at compact zoom a card under 14px has one resize handle at the bottom, and the body still drags', async ({ page }) => {
    await openApp(page, seedSchedule({ items: [{ id: 'blink', tracks: [0], start: '09:00', end: '09:10', title: 'Blink' }, { id: 'ok', tracks: [1], start: '09:00', end: '10:00', title: 'Normal' }] }))
    const board = new Board(page)
    await page.getByRole('button', { name: 'Compact' }).click()
    const tiny = board.card('Blink')
    await expect(tiny).toHaveClass(/board-card--tiny/)
    const display = (loc: ReturnType<Page['locator']>) => loc.evaluate((el) => getComputedStyle(el).display)
    for (const h of ['top', 'start', 'end']) expect(await display(tiny.locator(`[data-handle="${h}"]`))).toBe('none')
    expect(await display(tiny.locator('[data-handle="bottom"]'))).not.toBe('none')
    expect(await display(board.card('Normal').locator('[data-handle="top"]'))).not.toBe('none')
    // The body is still the way to move it.
    const box = (await tiny.boundingBox())!
    expect(box.height).toBeLessThan(14)
    const to = await board.at('10:30', 0)
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 2)
    await page.mouse.down()
    await page.mouse.move(to.x, to.y, { steps: 10 })
    await page.mouse.up()
    await expect(tiny).toHaveAccessibleName(/^Blink, 10:\d\d to 10:\d\d, Alpha$/)
  })
})

test.describe('autosave status', () => {
  test('typing goes straight to Saved: Saving... is never shown for a quick save', async ({ page }) => {
    await openApp(page, seedSchedule({ items }))
    const status = page.getByRole('status', { name: 'Autosave status' })
    await expect(status).toHaveText('Saved')
    await status.evaluate((el) => {
      const w = window as unknown as { __seen: string[] }
      w.__seen = []
      new MutationObserver(() => w.__seen.push(el.textContent ?? '')).observe(el, { childList: true, subtree: true, characterData: true })
    })
    await page.getByLabel('Event title').pressSequentially('Typing a longer title here', { delay: 40 })
    await page.waitForTimeout(900)
    await expect(status).toHaveText('Saved')
    const seen = await page.evaluate(() => (window as unknown as { __seen: string[] }).__seen)
    expect(seen.filter((t) => t.includes('Saving'))).toEqual([])
  })
})
