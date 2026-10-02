// Renders the Cairo sample and screenshots it next to the reference layout.
// Usage: npm run screenshot   (outputs in test-results/)
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'
import { renderDocument } from '../src/render/renderAgenda.ts'
import { cairoSample } from '../src/samples/cairo.ts'

const root = resolve(import.meta.dirname, '..')
const outDir = join(root, 'test-results')
mkdirSync(outDir, { recursive: true })

const renderedPath = join(outDir, 'cairo-rendered.html')
writeFileSync(renderedPath, renderDocument(cairoSample))

const targets = [
  { name: 'reference', file: join(root, 'reference', 'developers-day-cairo.html') },
  { name: 'rendered', file: renderedPath },
]
const viewports = [
  { suffix: '', width: 900, height: 800 },
  { suffix: '-mobile', width: 400, height: 800 },
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
  for (const viewport of viewports) {
    for (const target of targets) {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } })
      const page = await context.newPage()
      // Keep fonts identical for both pages: nothing from Google Fonts is fetched.
      await page.route(/https?:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com)\/.*/, (route) => route.abort())
      await page.goto(pathToFileURL(target.file).href, { waitUntil: 'load' })
      const out = join(outDir, `${target.name}${viewport.suffix}.png`)
      await page.screenshot({ path: out, fullPage: true })
      console.log(`wrote ${out}`)
      await context.close()
    }
  }
} finally {
  await browser.close()
}
