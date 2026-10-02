import { describe, expect, it, vi } from 'vitest'
import type { Schedule } from '../model/schema.ts'
import { cairoSample } from '../samples/cairo.ts'
import { rtlDemo } from '../render/__fixtures__/rtlDemo.ts'
import { MAX_FONT_BYTES, embedFonts, pageCharacters } from './embedFonts.ts'
import { buildExportHtml } from './exportHtml.ts'

const GSTATIC = 'https://fonts.gstatic.com/s/roboto/v30/abc.woff2'
const cssFor = (url: string) => `/* latin */
@font-face {
  font-family: 'Roboto';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url(${url}) format('woff2');
}`

interface Reply {
  ok?: boolean
  status?: number
  text?: string
  bytes?: Uint8Array
}
/** A tiny fetch double: responses by URL prefix. */
function mockFetch(routes: Record<string, Reply | ((url: string) => Reply)>) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    const key = Object.keys(routes).find((k) => url.startsWith(k))
    if (!key) throw new TypeError('Failed to fetch')
    const reply = typeof routes[key] === 'function' ? (routes[key] as (u: string) => Reply)(url) : (routes[key] as Reply)
    return {
      ok: reply.ok ?? true,
      status: reply.status ?? 200,
      text: async () => reply.text ?? '',
      arrayBuffer: async () => (reply.bytes ?? new Uint8Array()).buffer,
    } as unknown as Response
  })
}

const oneFamily: Schedule = {
  ...cairoSample,
  branding: { ...cairoSample.branding, fonts: { ...cairoSample.branding.fonts, webFonts: ['Roboto'] } },
}

describe('pageCharacters', () => {
  it('contains the event text, labels, formatted date and times, digits and punctuation', () => {
    const chars = pageCharacters(cairoSample)
    for (const ch of 'Google for Developers Day: Cairo') expect(chars).toContain(ch)
    for (const ch of '0123456789 :,.–&\'"') expect(chars).toContain(ch)
    for (const ch of 'FridayOctober') expect(chars).toContain(ch) // the formatted date
    for (const ch of 'Now') expect(chars).toContain(ch) // badge label
    expect(chars).not.toContain('<')
    expect(chars.length).toBe(new Set(Array.from(chars)).size) // unique
  })

  it('follows the locale: Arabic letters and Arabic-Indic digits', () => {
    const chars = pageCharacters(rtlDemo)
    expect(chars).toContain('م')
    expect(chars).toContain('٣')
    expect(chars).toContain('آ') // from the "now" badge label
  })
})

describe('embedFonts', () => {
  it('requests each family with a text= subset, then inlines every file as a data URI', async () => {
    const fetchImpl = mockFetch({
      'https://fonts.googleapis.com/': { text: cssFor(GSTATIC) },
      'https://fonts.gstatic.com/': { bytes: new Uint8Array([1, 2, 3, 4]) },
    })
    const result = await embedFonts(oneFamily, fetchImpl)
    expect(result).toEqual({
      css: expect.stringContaining("src: url(data:font/woff2;base64,AQIDBA==) format('woff2');"),
    })
    expect('css' in result && result.css).not.toContain('gstatic')

    const cssRequest = new URL(String(fetchImpl.mock.calls[0]?.[0]))
    expect(cssRequest.pathname).toBe('/css2')
    expect(cssRequest.searchParams.get('family')).toBe('Roboto:wght@400;500;700')
    expect(cssRequest.searchParams.get('display')).toBe('swap')
    const text = cssRequest.searchParams.get('text') ?? ''
    for (const ch of 'DevelopersCairoFriday0123456789:') expect(text).toContain(ch)
    expect(fetchImpl.mock.calls[1]?.[0]).toBe(GSTATIC)
  })

  it('asks once per family, and uses the file format for the media type', async () => {
    const schedule: Schedule = {
      ...oneFamily,
      branding: { ...oneFamily.branding, fonts: { ...oneFamily.branding.fonts, webFonts: ['Roboto', 'Roboto Mono'] } },
    }
    const fetchImpl = mockFetch({
      'https://fonts.googleapis.com/': (url) => ({
        text: url.includes('Mono') ? cssFor('https://fonts.gstatic.com/m.ttf').replace("format('woff2')", "format('truetype')") : cssFor(GSTATIC),
      }),
      'https://fonts.gstatic.com/': { bytes: new Uint8Array([9]) },
    })
    const result = await embedFonts(schedule, fetchImpl)
    expect(fetchImpl.mock.calls.filter(([u]) => String(u).includes('/css2'))).toHaveLength(2)
    expect('css' in result && result.css).toContain('data:font/woff2;base64,')
    expect('css' in result && result.css).toContain('data:font/ttf;base64,')
  })

  it('returns an empty stylesheet when there are no web fonts, without fetching', async () => {
    const fetchImpl = mockFetch({})
    const { webFonts: _unused, ...fonts } = cairoSample.branding.fonts
    void _unused
    const none: Schedule = { ...cairoSample, branding: { ...cairoSample.branding, fonts } }
    expect(await embedFonts(none, fetchImpl)).toEqual({ css: '' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('reports an error when offline, instead of throwing', async () => {
    const result = await embedFonts(oneFamily, mockFetch({}))
    expect(result).toEqual({ error: 'Failed to fetch' })
  })

  it('reports HTTP failures for the stylesheet and for a font file', async () => {
    expect(await embedFonts(oneFamily, mockFetch({ 'https://fonts.googleapis.com/': { ok: false, status: 400 } }))).toEqual({
      error: 'Google Fonts returned 400 for "Roboto"',
    })
    const result = await embedFonts(
      oneFamily,
      mockFetch({ 'https://fonts.googleapis.com/': { text: cssFor(GSTATIC) }, 'https://fonts.gstatic.com/': { ok: false, status: 404 } }),
    )
    expect(result).toMatchObject({ error: expect.stringContaining('404') })
  })

  it('only downloads files from fonts.gstatic.com', async () => {
    const fetchImpl = mockFetch({ 'https://fonts.googleapis.com/': { text: cssFor('https://evil.test/x.woff2') } })
    expect(await embedFonts(oneFamily, fetchImpl)).toEqual({ error: 'No font files found for "Roboto"' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('refuses a stylesheet containing markup', async () => {
    const fetchImpl = mockFetch({ 'https://fonts.googleapis.com/': { text: `${cssFor(GSTATIC)}</style><script>` } })
    expect(await embedFonts(oneFamily, fetchImpl)).toMatchObject({ error: expect.stringContaining('Unexpected') })
  })

  it('stops at the 3 MB cap', async () => {
    const big = new Uint8Array(MAX_FONT_BYTES / 2 + 1)
    const two = `${cssFor('https://fonts.gstatic.com/a.woff2')}\n${cssFor('https://fonts.gstatic.com/b.woff2')}`
    const over = await embedFonts(
      oneFamily,
      mockFetch({ 'https://fonts.googleapis.com/': { text: two }, 'https://fonts.gstatic.com/': { bytes: big } }),
    )
    expect(over).toEqual({ error: 'Fonts are larger than 3 MB' })
    const under = await embedFonts(
      oneFamily,
      mockFetch({ 'https://fonts.googleapis.com/': { text: two }, 'https://fonts.gstatic.com/': { bytes: new Uint8Array(MAX_FONT_BYTES / 2) } }),
    )
    expect(under).toHaveProperty('css')
  })

  it('feeds buildExportHtml: data URIs inline and no Google Fonts link', async () => {
    const result = await embedFonts(
      oneFamily,
      mockFetch({ 'https://fonts.googleapis.com/': { text: cssFor(GSTATIC) }, 'https://fonts.gstatic.com/': { bytes: new Uint8Array([7]) } }),
    )
    if (!('css' in result)) throw new Error(result.error)
    const html = buildExportHtml(oneFamily, { fontCss: result.css })
    expect(html).toContain('data:font/woff2;base64,Bw==')
    expect(html).not.toContain('<link')
    expect(html).not.toContain('fonts.gstatic.com/s/')
  })
})
