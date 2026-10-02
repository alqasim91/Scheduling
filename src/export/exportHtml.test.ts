import { describe, expect, it } from 'vitest'
import type { Schedule } from '../model/schema.ts'
import { cairoSample } from '../samples/cairo.ts'
import { rtlDemo } from '../render/__fixtures__/rtlDemo.ts'
import { CSP, buildExportHtml, jsonForScript } from './exportHtml.ts'

const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html')
const dataOf = (html: string) => JSON.parse(parse(html).getElementById('schedule-data')?.textContent ?? 'null')

describe('buildExportHtml', () => {
  const html = buildExportHtml(cairoSample)
  const doc = parse(html)

  it('contains the rendered document plus data, script and CSP', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(doc.querySelector('main.wrap h1')?.textContent).toBe('Google for Developers Day: Cairo')
    const scripts = [...doc.querySelectorAll('script')]
    expect(scripts.map((s) => s.getAttribute('type'))).toEqual(['application/json', null])
    expect(scripts[0]?.id).toBe('schedule-data')
    expect(scripts[1]?.textContent).toContain('data-s')
    const csp = doc.querySelector('meta[http-equiv="Content-Security-Policy"]')
    expect(csp?.getAttribute('content')).toBe(CSP)
    expect(CSP).toBe(
      "default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src data: https://fonts.gstatic.com; img-src data:; script-src 'unsafe-inline'",
    )
  })

  it('puts the CSP before anything it governs', () => {
    expect(html.indexOf('Content-Security-Policy')).toBeLessThan(html.indexOf('<style'))
    expect(html.indexOf('Content-Security-Policy')).toBeLessThan(html.indexOf('<link'))
  })

  it('makes no requests other than the Google Fonts stylesheet link', () => {
    expect(html).not.toMatch(/<script[^>]*\ssrc=/)
    expect([...doc.querySelectorAll('link')].map((l) => l.getAttribute('href'))).toEqual([
      expect.stringMatching(/^https:\/\/fonts\.googleapis\.com\/css2\?/),
    ])
    expect(html).not.toMatch(/@import/)
  })

  it('has a hidden badge on every non-ghost card, with the localized label', () => {
    const cards = [...doc.querySelectorAll('.ev:not(.ghost)')]
    expect(cards).toHaveLength(12)
    for (const card of cards) expect(card.querySelector('.badge')?.textContent).toBe('Now')
    expect(doc.querySelector('.ev.ghost .badge')).toBeNull()
    expect(parse(buildExportHtml(rtlDemo)).querySelector('.badge')?.textContent).toBe('الآن')
    expect(parse(buildExportHtml({ ...cairoSample, labels: { now: 'Live' } })).querySelector('.badge')?.textContent).toBe('Live')
  })

  it('inlines fontCss instead of the Google Fonts link', () => {
    const css = "@font-face{font-family:'Roboto';src:url(data:font/woff2;base64,AAAA) format('woff2')}"
    const withFonts = buildExportHtml(cairoSample, { fontCss: css })
    expect(withFonts).not.toContain('<link')
    expect(withFonts).not.toContain('fonts.googleapis.com/css2')
    expect(parse(withFonts).getElementById('embedded-fonts')?.textContent).toContain('data:font/woff2;base64,AAAA')
    // The embedded stylesheet cannot close its own element.
    expect(buildExportHtml(cairoSample, { fontCss: 'a{}</style><script>x</script>' })).not.toContain('<script>x')
  })
})

describe('embedded schedule data', () => {
  it('round-trips exactly', () => {
    for (const schedule of [cairoSample, rtlDemo]) expect(dataOf(buildExportHtml(schedule))).toEqual(schedule)
  })

  it('cannot be broken out of by a hostile title', () => {
    const hostile: Schedule = {
      ...cairoSample,
      event: {
        ...cairoSample.event,
        title: '</script><script>alert(1)</script>',
        notes: '<!-- & --> \u2028 line \u2029 sep',
        venue: '"quoted" \\ back',
      },
    }
    const html = buildExportHtml(hostile)
    const doc = parse(html)
    expect(doc.querySelectorAll('script')).toHaveLength(2) // data + now script, nothing injected
    expect(html).not.toContain('<script>alert')
    expect(html).not.toContain('</script><script>alert')
    const data = JSON.parse(doc.getElementById('schedule-data')?.textContent ?? '')
    expect(data).toEqual(hostile)
    expect(data.event.title).toBe('</script><script>alert(1)</script>')
  })

  it('escapes <, >, & and the JS line separators in the serialized JSON', () => {
    const json = jsonForScript({ a: '<b>&\u2028\u2029' })
    expect(json).toBe('{"a":"\\u003cb\\u003e\\u0026\\u2028\\u2029"}')
    expect(json).not.toMatch(/[<>&\u2028\u2029]/)
    expect(JSON.parse(json)).toEqual({ a: '<b>&\u2028\u2029' })
  })
})
