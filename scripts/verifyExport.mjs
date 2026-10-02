// Builds the exported HTML for the Cairo sample and the RTL fixture, then opens each file in
// Chromium with every network request aborted and checks it works on its own.
// Usage: npm run verify:export   (outputs in test-results/)
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'
import { embedFonts } from '../src/export/embedFonts.ts'
import { buildExportHtml } from '../src/export/exportHtml.ts'
import { JSDOM } from 'jsdom'
import { rtlDemo } from '../src/render/__fixtures__/rtlDemo.ts'
import { tableDemo } from '../src/render/__fixtures__/tableDemo.ts'
import { tableDemoRtl } from '../src/render/__fixtures__/tableDemoRtl.ts'
import { importFileText } from '../src/persistence/importFile.ts'
import { cairoSample } from '../src/samples/cairo.ts'

const root = resolve(import.meta.dirname, '..')
const outDir = join(root, 'test-results')
mkdirSync(outDir, { recursive: true })

// The import code uses DOMParser (to read, never run, the file); give Node one.
globalThis.DOMParser = new JSDOM('').window.DOMParser

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`

function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers'
  if (!existsSync(base)) return undefined
  for (const dir of readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse()) {
    for (const rel of ['chrome-linux/chrome', 'chrome-linux64/chrome']) {
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
    return await chromium.launch({ executablePath })
  }
}

const timed = (url) => fetch(url, { signal: AbortSignal.timeout(20000) })
const SYSTEM_FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'

/**
 * Real Google Fonts when the network allows it (run through the proxy with NODE_USE_ENV_PROXY=1);
 * otherwise a synthetic stand-in built from a local TTF, so the embedded-font path is still
 * exercised end to end. The report says which one ran.
 */
async function fontCssFor(schedule) {
  const real = await embedFonts(schedule, timed)
  if ('css' in real) return { css: real.css, kind: 'real Google Fonts', bytes: Buffer.byteLength(real.css) }
  if (!existsSync(SYSTEM_FONT)) return { css: undefined, kind: `none (${real.error})`, bytes: 0, reason: real.error }
  const data = readFileSync(SYSTEM_FONT).toString('base64')
  const css = (schedule.branding.fonts.webFonts ?? [])
    .map((f) => `@font-face{font-family:'${f}';font-weight:400;src:url(data:font/ttf;base64,${data}) format('truetype')}`)
    .join('\n')
  return { css, kind: `synthetic (real embed failed: ${real.error})`, bytes: Buffer.byteLength(css), reason: real.error }
}

/** Page count of a PDF: pdfinfo when installed, otherwise count the page objects. */
function pdfPages(path) {
  const info = spawnSync('pdfinfo', [path], { encoding: 'utf8' })
  const match = /^Pages:\s+(\d+)/m.exec(info.stdout ?? '')
  if (match) return Number(match[1])
  return (readFileSync(path).toString('latin1').match(/\/Type\s*\/Page(?![a-z])/g) ?? []).length
}

const browser = await launch()
const report = []
let failures = 0

async function openOffline(file, { clock } = {}) {
  const context = await browser.newContext({ viewport: { width: 900, height: 800 }, reducedMotion: 'no-preference' })
  await context.route(/^https?:/, (route) => route.abort())
  const page = await context.newPage()
  const requests = []
  const errors = []
  page.on('request', (r) => {
    if (/^https?:/.test(r.url())) requests.push(r.url())
  })
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  await page.addInitScript(() => {
    window.__csp = []
    document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`))
  })
  if (clock) await page.clock.setFixedTime(clock)
  await page.goto(pathToFileURL(file).href, { waitUntil: 'load' })
  return { context, page, requests, errors }
}

try {
  // Print layout budget: the Cairo agenda fits one A4 page, the RTL demo too. A regression fails the run.
  for (const { name, schedule, families, maxPages } of [
    { name: 'cairo', schedule: cairoSample, families: ['Roboto'], maxPages: 1 },
    { name: 'rtl', schedule: rtlDemo, families: ['Cairo', 'Tajawal'], maxPages: 1 },
    { name: 'table', schedule: tableDemo, families: ['Inter'], maxPages: 1 },
    { name: 'table-rtl', schedule: tableDemoRtl, families: ['Cairo', 'Tajawal'], maxPages: 1 },
  ]) {
    const fonts = await fontCssFor(schedule)
    const html = buildExportHtml(schedule, { fontCss: fonts.css })
    const file = join(outDir, `${name}-export.html`)
    writeFileSync(file, html)
    const size = statSync(file).size

    const { context, page, requests, errors } = await openOffline(file)
    const csp = await page.evaluate(() => window.__csp)
    const raw = await page.evaluate(() => document.getElementById('schedule-data')?.textContent ?? '')
    await page.evaluate(() => document.fonts.ready)
    const faces = await page.evaluate(() => [...document.fonts].map((f) => ({ family: f.family.replace(/["']/g, ''), status: f.status })))
    const hasLink = await page.evaluate(() => document.querySelectorAll('link').length)

    assert.deepEqual(errors, [], `${name}: console errors`)
    assert.deepEqual(csp, [], `${name}: CSP violations`)
    assert.deepEqual(requests, [], `${name}: attempted network requests`)
    assert.deepEqual(JSON.parse(raw), JSON.parse(JSON.stringify(schedule)), `${name}: #schedule-data`)
    // Re-import: the exported file reads back as the same schedule through the app's own import code.
    const imported = importFileText(html)
    assert.ok(imported.ok, `${name}: import failed ${imported.ok ? '' : imported.errors.join('; ')}`)
    assert.deepEqual(imported.value, schedule, `${name}: import round-trip`)
    if (fonts.css) {
      assert.equal(hasLink, 0, `${name}: google fonts link should be gone`)
      for (const family of families) {
        assert.ok(
          faces.some((f) => f.family === family && f.status === 'loaded'),
          `${name}: ${family} not loaded (${JSON.stringify(faces)})`,
        )
        // Weights load lazily, so accept any of the weights the page uses.
        assert.ok(
          await page.evaluate((f) => [400, 500, 700].some((w) => document.fonts.check(`${w} 16px "${f}"`)), family),
          `${name}: fonts.check ${family}`,
        )
      }
    }
    const pdf = join(outDir, `${name}-export.pdf`)
    await page.pdf({ path: pdf, format: 'A4', printBackground: true })
    const pages = pdfPages(pdf)
    assert.ok(pages <= maxPages, `${name}: PDF has ${pages} page(s), expected at most ${maxPages}`)
    report.push(`${name}: ${kb(size)} html, PDF ${pages} A4 page(s) (limit ${maxPages}), fonts: ${fonts.kind}`)
    report.push(`${name}: ${kb(size)} html, fonts: ${fonts.kind}${fonts.css ? `, ${kb(fonts.bytes)} of @font-face css` : ''}; no errors, no CSP violations, 0 network requests`)
    await context.close()
  }

  // "Now" badge: Friday 2 October 2026, 14:30 in Cairo (UTC+3 in October).
  {
    const file = join(outDir, 'cairo-export.html')
    const { context, page, errors } = await openOffline(file, { clock: new Date('2026-10-02T11:30:00Z') })
    const now = await page.evaluate(() =>
      [...document.querySelectorAll('.ev.now')].map((e) => ({
        title: e.querySelector('h3')?.textContent,
        s: e.getAttribute('data-s'),
        ghost: e.classList.contains('ghost'),
        badge: getComputedStyle(e.querySelector('.badge')).display,
      })),
    )
    const keynoteNow = await page.evaluate(() => document.querySelector('.ev.key').classList.contains('now'))
    const ghostNow = await page.evaluate(() => document.querySelectorAll('.ev.ghost.now').length)
    assert.deepEqual(errors, [], 'now: console errors')
    assert.equal(now.length, 2, `now: expected 2 live cards, got ${JSON.stringify(now)}`)
    assert.ok(now.every((c) => c.s === '860' && !c.ghost && c.badge !== 'none'), 'now: the two 14:20 sessions with a visible badge')
    assert.equal(keynoteNow, false, 'now: keynote ended at 14:30 (end exclusive)')
    assert.equal(ghostNow, 0, 'now: ghost never marked')
    await page.screenshot({ path: join(outDir, 'cairo-now.png'), fullPage: true })
    report.push(`now: at 14:30 Cairo exactly ${now.map((c) => `"${c.title.slice(0, 24)}…"`).join(' and ')} are marked; keynote and ghost are not`)
    await context.close()
  }
  // Table mode: Thursday 14 May 2026, 11:00 in London (BST, UTC+1) falls inside 10:45-12:00 only.
  {
    const file = join(outDir, 'table-export.html')
    const { context, page, errors } = await openOffline(file, { clock: new Date('2026-05-14T10:00:00Z') })
    const rows = await page.evaluate(() =>
      [...document.querySelectorAll('tr.now')].map((r) => ({
        s: r.getAttribute('data-s'),
        session: r.querySelector('td[data-label="Session"]')?.textContent,
        badge: getComputedStyle(r.querySelector('.badge')).display,
      })),
    )
    assert.deepEqual(errors, [], 'table now: console errors')
    assert.equal(rows.length, 1, `table now: expected exactly 1 live row, got ${JSON.stringify(rows)}`)
    assert.deepEqual([rows[0].s, rows[0].session], ['645', 'Platform migration deep dive'])
    assert.notEqual(rows[0].badge, 'none', 'table now: badge visible')
    await page.screenshot({ path: join(outDir, 'table-now.png'), fullPage: true })
    report.push('table now: at 11:00 London exactly the 10:45-12:00 row ("Platform migration deep dive") is marked')
    await context.close()
  }
} catch (error) {
  failures++
  console.error(error)
} finally {
  await browser.close()
}

console.log(report.join('\n'))
if (failures > 0) process.exit(1)
console.log('verify:export OK')
