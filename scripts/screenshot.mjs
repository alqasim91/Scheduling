// Renders the Cairo sample and screenshots it next to the reference layout.
// Usage: npm run screenshot   (outputs in test-results/)
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'
import { createServer } from 'vite'
import { embedFonts } from '../src/export/embedFonts.ts'
import { buildExportHtml } from '../src/export/exportHtml.ts'
import { rtlDemo } from '../src/render/__fixtures__/rtlDemo.ts'
import { tableDemo } from '../src/render/__fixtures__/tableDemo.ts'
import { tableDemoRtl } from '../src/render/__fixtures__/tableDemoRtl.ts'
import { renderDocument } from '../src/render/renderAgenda.ts'
import { cairoSample } from '../src/samples/cairo.ts'
import { BUILTIN_TEMPLATES } from '../src/templates/builtin/index.ts'
import { TEMPLATES_KEY } from '../src/templates/store.ts'

const root = resolve(import.meta.dirname, '..')
const outDir = join(root, 'test-results')
mkdirSync(outDir, { recursive: true })

const write = (name, html) => {
  const path = join(outDir, name)
  writeFileSync(path, html)
  return path
}

const motionSample = {
  ...cairoSample,
  branding: {
    ...cairoSample.branding,
    motion: { preset: 'stagger', logoAnimation: true },
  },
}

const desktop = { suffix: '', width: 900, height: 800 }
const mobile = { suffix: '-mobile', width: 400, height: 800 }

/** Each target becomes `<name><suffix>.png`. `settle` waits for CSS animations to finish. */
const targets = [
  { name: 'reference', file: join(root, 'reference', 'developers-day-cairo.html'), viewports: [desktop, mobile] },
  { name: 'rendered', file: write('cairo-rendered.html', renderDocument(cairoSample)), viewports: [desktop, mobile] },
  {
    name: 'rendered-dark',
    file: write('cairo-dark.html', renderDocument(cairoSample, { forceTheme: 'dark' })),
    viewports: [desktop, mobile],
  },
  { name: 'rendered-rtl', file: write('rtl-demo.html', renderDocument(rtlDemo)), viewports: [desktop, mobile] },
  { name: 'table', file: write('table.html', renderDocument(tableDemo)), viewports: [desktop, mobile] },
  { name: 'table-dark', file: write('table-dark.html', renderDocument(tableDemo, { forceTheme: 'dark' })), viewports: [desktop] },
  { name: 'table-rtl', file: write('table-rtl.html', renderDocument(tableDemoRtl)), viewports: [desktop] },
  // Every built-in template, as the gallery would instantiate it.
  ...BUILTIN_TEMPLATES.map((template) => ({
    name: `template-${template.id}`,
    file: write(`template-${template.id}.html`, renderDocument(template.schedule)),
    viewports: [desktop],
  })),
  {
    name: 'rendered-motion',
    file: write('cairo-motion.html', renderDocument(motionSample)),
    viewports: [desktop],
    settle: true,
  },
]

/** Playwright's pinned Chromium may not match the preinstalled build; fall back to whatever is there. */
function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers'
  if (!existsSync(base)) return undefined
  const candidates = readdirSync(base)
    .filter((dir) => /^chromium-\d+$/.test(dir))
    .sort()
    .reverse()
  for (const dir of candidates) {
    for (const rel of ['chrome-linux/chrome', 'chrome-linux64/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
      const path = join(base, dir, rel)
      if (existsSync(path)) return path
    }
  }
  return undefined
}

async function launch() {
  try {
    return await chromium.launch()
  } catch (error) {
    const executablePath = findChromium()
    if (!executablePath) throw error
    console.log(`Default Chromium unavailable, using ${executablePath}`)
    return await chromium.launch({ executablePath })
  }
}

const browser = await launch()
try {
  for (const target of targets) {
    for (const viewport of target.viewports) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        reducedMotion: 'no-preference',
        colorScheme: 'light',
      })
      const page = await context.newPage()
      // Keep fonts identical for every page: nothing from Google Fonts is fetched.
      await page.route(/https?:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com)\/.*/, (route) => route.abort())
      await page.goto(pathToFileURL(target.file).href, { waitUntil: 'load' })
      if (target.settle) {
        await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)))
      }
      const out = join(outDir, `${target.name}${viewport.suffix}.png`)
      await page.screenshot({ path: out, fullPage: true })
      console.log(`wrote ${out}`)
      await context.close()
    }
  }

  // Print output: A4 PDFs of the exported pages (with real fonts when the network allows it),
  // plus a print-media screenshot of the plain page.
  for (const [name, schedule] of [
    ['cairo', cairoSample],
    ['rtl', rtlDemo],
    ['table', tableDemo],
    ['table-rtl', tableDemoRtl],
  ]) {
    const embedded = await embedFonts(schedule, (url) => fetch(url, { signal: AbortSignal.timeout(10000) }))
    const fontCss = 'css' in embedded ? embedded.css : undefined
    if (!fontCss) console.log(`${name}: fonts not embedded for the PDF (${embedded.error}); using fallback fonts`)
    const file = write(`${name}-print.html`, buildExportHtml(schedule, { fontCss }))
    const context = await browser.newContext({ viewport: { width: 794, height: 1123 }, reducedMotion: 'no-preference' })
    const page = await context.newPage()
    await page.route(/https?:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com)\/.*/, (route) => route.abort())
    await page.goto(pathToFileURL(file).href, { waitUntil: 'load' })
    const pdf = join(outDir, `${name}.pdf`)
    await page.pdf({ path: pdf, format: 'A4', printBackground: true })
    console.log(`wrote ${pdf}`)
    if (name === 'cairo') {
      await page.emulateMedia({ media: 'print' })
      const png = join(outDir, 'cairo-print.png')
      await page.screenshot({ path: png, fullPage: true })
      console.log(`wrote ${png}`)
    }
    await context.close()
  }

  // The "New…" gallery dialog, in the real app served by Vite, with one user template saved.
  const server = await createServer({ root, logLevel: 'error', server: { host: '127.0.0.1', port: 5199 } })
  try {
    await server.listen()
    const base = server.resolvedUrls?.local?.[0] ?? 'http://127.0.0.1:5199/'
    const context = await browser.newContext({ viewport: { width: 1240, height: 1180 } })
    const mine = {
      id: 'tpl_demo',
      name: 'My conference (saved)',
      description: 'A schedule saved from the editor.',
      createdAt: new Date().toISOString(),
      schedule: BUILTIN_TEMPLATES[0].schedule,
    }
    await context.addInitScript(([key, value]) => localStorage.setItem(key, value), [TEMPLATES_KEY, JSON.stringify([mine])])
    const page = await context.newPage()
    await page.route(/https?:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com)\/.*/, (route) => route.abort())
    await page.goto(base, { waitUntil: 'load' })
    await page.getByRole('button', { name: /^File/ }).click()
    await page.getByRole('menuitem', { name: 'New…' }).click()
    await page.getByRole('dialog', { name: 'New schedule' }).waitFor()
    await page.waitForTimeout(1500) // thumbnails are sandboxed iframes: give them a moment to paint
    const gallery = join(outDir, 'gallery.png')
    await page.screenshot({ path: gallery })
    console.log(`wrote ${gallery}`)
    await context.close()

    // The board and the split editor, on the first-launch Cairo sample (fresh browser profile).
    const editorContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const editor = await editorContext.newPage()
    await editor.route(/https?:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com)\/.*/, (route) => route.abort())
    await editor.goto(base, { waitUntil: 'load' })
    const cols = editor.locator('.board__cols')
    await cols.waitFor()
    await editor.waitForTimeout(800) // the preview iframe paints
    const editorSplit = join(outDir, 'editor-split.png')
    await editor.screenshot({ path: editorSplit })
    console.log(`wrote ${editorSplit}`)

    const boardPanel = editor.locator('section.board')
    const boardShot = join(outDir, 'board.png')
    await boardPanel.screenshot({ path: boardShot })
    console.log(`wrote ${boardShot}`)

    // Mid-drag: "Build with Gemma 4" held over a free spot, with the snapped preview and its time label.
    const at = async (minutes, track) => {
      const info = await cols.evaluate((el) => {
        const r = el.getBoundingClientRect()
        return { left: r.left, top: r.top, width: r.width, start: Number(el.dataset.rangeStart), ppm: Number(el.dataset.ppm), tracks: Number(el.dataset.tracks) }
      })
      return { x: info.left + ((track + 0.5) * info.width) / info.tracks, y: info.top + (minutes - info.start) * info.ppm }
    }
    const card = editor.getByRole('button', { name: /^Build with Gemma 4/ })
    const box = await card.boundingBox()
    const target = await at(18 * 60 + 12, 0)
    await editor.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await editor.mouse.down()
    await editor.mouse.move(target.x, target.y, { steps: 12 })
    await editor.waitForTimeout(150)
    const dragShot = join(outDir, 'board-dragging.png')
    await boardPanel.screenshot({ path: dragShot })
    console.log(`wrote ${dragShot}`)
    await editor.keyboard.press('Escape')
    await editor.mouse.up()

    // Table mode: the light spreadsheet, rows derived from the grid's slots.
    await editor.getByRole('button', { name: 'Table', exact: true }).click()
    await editor.waitForTimeout(500)
    const tableShot = join(outDir, 'table-editor.png')
    await editor.screenshot({ path: tableShot })
    console.log(`wrote ${tableShot}`)
    await editorContext.close()

    // A narrow window (a tablet held upright): no split, the sidebar is a drawer; and a phone.
    for (const [name, viewport, mobile] of [
      ['editor-narrow', { width: 800, height: 900 }, false],
      ['editor-phone', { width: 390, height: 844 }, true],
    ]) {
      const small = await browser.newContext({ viewport, hasTouch: mobile, isMobile: mobile })
      const smallPage = await small.newPage()
      await smallPage.route(/https?:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com)\/.*/, (route) => route.abort())
      await smallPage.goto(base, { waitUntil: 'load' })
      await smallPage.locator('.board__cols').waitFor()
      await smallPage.waitForTimeout(500)
      const out = join(outDir, `${name}.png`)
      await smallPage.screenshot({ path: out })
      console.log(`wrote ${out}`)
      // The session editor as a sheet / popover over the board.
      await smallPage.getByRole('button', { name: '+ Add session' }).click()
      await smallPage.waitForTimeout(300)
      const sheet = join(outDir, `${name}-editing.png`)
      await smallPage.screenshot({ path: sheet })
      console.log(`wrote ${sheet}`)
      await small.close()
    }
  } finally {
    await server.close()
  }
} finally {
  await browser.close()
}
