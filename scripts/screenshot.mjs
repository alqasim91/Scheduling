// Renders the Cairo sample and screenshots it next to the reference layout.
// Usage: npm run screenshot   (outputs in test-results/)
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'
import { embedFonts } from '../src/export/embedFonts.ts'
import { buildExportHtml } from '../src/export/exportHtml.ts'
import { rtlDemo } from '../src/render/__fixtures__/rtlDemo.ts'
import { tableDemo } from '../src/render/__fixtures__/tableDemo.ts'
import { tableDemoRtl } from '../src/render/__fixtures__/tableDemoRtl.ts'
import { renderDocument } from '../src/render/renderAgenda.ts'
import { cairoSample } from '../src/samples/cairo.ts'

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
} finally {
  await browser.close()
}
