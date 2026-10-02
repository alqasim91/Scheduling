import { describe, expect, it } from 'vitest'
import { createEmptySchedule } from '../model/defaults.ts'
import type { Schedule } from '../model/schema.ts'
import { WebFontSchema } from '../model/schema.ts'
import { parseSchedule } from '../model/validate.ts'
import { cairoSample } from '../samples/cairo.ts'
import { agendaCss } from './agendaCss.ts'
import { googleFontsUrl, withGenericFallback } from './fonts.ts'
import { renderDocument } from './renderAgenda.ts'
import { DARK_BASE, deriveDarkColors, lighten, resolveDarkColors } from './theme.ts'

function withBranding(patch: Partial<Schedule['branding']>): Schedule {
  return { ...cairoSample, branding: { ...cairoSample.branding, ...patch } }
}
const withMotion = (preset: 'none' | 'fade' | 'stagger', logoAnimation = false) =>
  withBranding({ motion: { preset, logoAnimation } })

describe('dark palette', () => {
  it('lightens colours toward white', () => {
    expect(lighten('#000000', 0.45)).toBe('#737373')
    expect(lighten('#ffffff')).toBe('#ffffff')
    expect(lighten('#0b57d0', 0.45)).toBe('#79a3e5')
    expect(lighten('not a colour', 0)).toBe('#888888')
  })

  it('derives the dark palette: fixed neutrals, lightened primary/accent/note', () => {
    const dark = deriveDarkColors(cairoSample.branding.colors)
    expect(dark).toMatchObject(DARK_BASE)
    expect(dark.primary).toBe(lighten('#0b57d0'))
    expect(dark.accent).toBe(lighten('#d93025'))
    expect(dark.note).toBe(lighten('#f9ab00')) // note is optional in the sample: default is used
  })

  it('prefers an explicit darkColors palette', () => {
    const custom = { ...cairoSample.branding.colors, background: '#000000', note: '#112233' }
    const dark = resolveDarkColors({ colors: cairoSample.branding.colors, darkColors: custom })
    expect(dark.background).toBe('#000000')
    expect(dark.note).toBe('#112233')
    expect(resolveDarkColors({ colors: cairoSample.branding.colors }).background).toBe('#131314')
  })

  it('emits light vars on :root and dark vars under both dark selectors', () => {
    const css = agendaCss(cairoSample)
    expect(css).toMatch(/:root\{\s*color-scheme:light;/)
    expect(css).toContain('@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){color-scheme:dark;')
    expect(css).toContain(':root[data-theme="dark"]{color-scheme:dark;')
    expect(css.match(/--bg:#131314/g)).toHaveLength(2)
    expect(css).toContain(`--primary:${lighten('#0b57d0')}`)
    // Track colours are lightened in dark mode through --lift.
    expect(css).toContain('--lift:45%')
    expect(css).toContain('--lift:0%')
  })

  it('uses a custom dark palette in the CSS', () => {
    const css = agendaCss(withBranding({ darkColors: { ...cairoSample.branding.colors, background: '#010203' } }))
    expect(css.match(/--bg:#010203/g)).toHaveLength(2)
    expect(css).not.toContain('--bg:#131314')
  })
})

describe('theme attribute and forceTheme', () => {
  const htmlTag = (html: string) => /<html[^>]*>/.exec(html)?.[0] ?? ''

  it('sets data-theme for light and dark, and none for auto', () => {
    expect(htmlTag(renderDocument(withBranding({ theme: 'light' })))).toContain('data-theme="light"')
    expect(htmlTag(renderDocument(withBranding({ theme: 'dark' })))).toContain('data-theme="dark"')
    expect(htmlTag(renderDocument(withBranding({ theme: 'auto' })))).not.toContain('data-theme')
  })

  it('forceTheme overrides the schedule theme', () => {
    const auto = withBranding({ theme: 'auto' })
    expect(htmlTag(renderDocument(auto, { forceTheme: 'dark' }))).toContain('data-theme="dark"')
    expect(htmlTag(renderDocument(auto, { forceTheme: 'light' }))).toContain('data-theme="light"')
    expect(htmlTag(renderDocument(withBranding({ theme: 'light' }), { forceTheme: 'dark' }))).toContain('data-theme="dark"')
  })
})

describe('motion css', () => {
  it('emits no animation css when motion is off', () => {
    const css = agendaCss(withMotion('none'))
    expect(css).not.toMatch(/animation|@keyframes/)
  })

  it('guards fade with prefers-reduced-motion and print', () => {
    const css = agendaCss(withMotion('fade'))
    expect(css).toContain('@media (prefers-reduced-motion:no-preference){')
    expect(css).toMatch(/@media print\{[^}]*animation:none!important/)
    expect(css).toContain('@keyframes rise')
    expect(css).not.toContain('animation-delay')
    // Every animation rule sits inside the reduced-motion block.
    const outside = css.slice(0, css.indexOf('@media (prefers-reduced-motion:no-preference)'))
    expect(outside).not.toMatch(/animation/)
  })

  it('staggers cards with --i in order, capped at 20', () => {
    expect(agendaCss(withMotion('stagger'))).toContain('animation-delay:calc(var(--i,0) * 40ms)')
    const indices = (s: Schedule) =>
      [...renderDocument(s).matchAll(/class="ev [^"]*" style="[^"]*--i:(\d+)/g)].map((m) => Number(m[1]))
    // The sample has 12 items and 1 ghost cell.
    expect(indices(withMotion('stagger'))).toEqual(Array.from({ length: 13 }, (_, i) => i))
    const rows = Array.from({ length: 25 }, (_, i) => ({ id: `r${i}`, start: '09:00', end: '09:30' }))
    const many: Schedule = {
      ...withMotion('stagger'),
      rows,
      items: rows.map((r) => ({ id: `i${r.id}`, rowId: r.id, columnIds: ['col-beginner', 'col-intermediate'], title: 'x', variant: 'break' as const })),
    }
    const capped = indices(many)
    expect(capped).toHaveLength(25)
    expect(capped.slice(0, 21)).toEqual(Array.from({ length: 21 }, (_, i) => i))
    expect(Math.max(...capped)).toBe(20)
  })

  it('does not set --i unless staggering', () => {
    expect(renderDocument(withMotion('fade'))).not.toContain('--i:')
    expect(renderDocument(withMotion('none'))).not.toContain('--i:')
  })

  it('animates only the logo when logoAnimation is on with no preset', () => {
    const css = agendaCss(withMotion('none', true))
    expect(css).toContain('@keyframes logo-in')
    expect(css).not.toContain('@keyframes rise')
    expect(css).toContain('@media (prefers-reduced-motion:no-preference){')
    expect(css).toContain('@media print{')
  })
})

describe('web fonts', () => {
  it('emits one stylesheet link for the families, with display=swap', () => {
    const html = renderDocument(withBranding({ fonts: { ...cairoSample.branding.fonts, webFonts: ['Cairo', 'Open Sans', 'Lato'] } }))
    const links = html.match(/<link [^>]*>/g) ?? []
    expect(links).toHaveLength(1)
    expect(links[0]).toContain('href="https://fonts.googleapis.com/css2?')
    expect(links[0]).toContain('family=Cairo:wght@400;500;700')
    expect(links[0]).toContain('family=Open+Sans:wght@400;500;700')
    expect(links[0]).toContain('family=Lato:wght@400;700')
    expect(links[0]).toContain('&amp;display=swap')
  })

  it('emits no link when there are no web fonts', () => {
    const { webFonts: _unused, ...fonts } = cairoSample.branding.fonts
    void _unused
    expect(renderDocument(withBranding({ fonts }))).not.toContain('<link')
    expect(renderDocument(withBranding({ fonts: { ...fonts, webFonts: [] } }))).not.toContain('<link')
    expect(googleFontsUrl(undefined)).toBeNull()
  })

  it('skips invalid or duplicate names at render time', () => {
    expect(googleFontsUrl(['Inter', 'Inter', 'Bad;Name', 'x'.repeat(41)])).toBe(
      'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&display=swap',
    )
  })

  it('schema rejects invalid family names', () => {
    for (const bad of ['', 'a;b', 'Name"x', 'x'.repeat(41), 'Café', "o'neil"]) {
      expect(WebFontSchema.safeParse(bad).success, bad).toBe(false)
    }
    expect(WebFontSchema.safeParse('IBM Plex Sans Arabic').success).toBe(true)
    const bad = withBranding({ fonts: { ...cairoSample.branding.fonts, webFonts: ['ok', 'not ok!'] } })
    expect(parseSchedule(bad).ok).toBe(false)
  })

  it('font stacks always end in a generic family', () => {
    expect(withGenericFallback("'Inter'", 'sans-serif')).toBe("'Inter', sans-serif")
    expect(withGenericFallback("Georgia, serif", 'sans-serif')).toBe('Georgia, serif')
    expect(withGenericFallback('Menlo', 'monospace')).toBe('Menlo, monospace')
    const css = agendaCss(withBranding({ fonts: { display: 'Foo', body: 'Bar', mono: 'Baz' } }))
    expect(css).toContain('--display:Foo, sans-serif;')
    expect(css).toContain('--mono:Baz, monospace;')
  })
})

describe('logo height and v1 compatibility', () => {
  it('uses logoHeight as the logo height, else caps it at 40px', () => {
    expect(agendaCss(withBranding({ logoHeight: 72 }))).toContain('.logo{display:block;align-self:flex-start;height:72px;width:auto}')
    expect(agendaCss(cairoSample)).toContain('max-height:40px')
    expect(parseSchedule(withBranding({ logoHeight: 15 })).ok).toBe(false)
    expect(parseSchedule(withBranding({ logoHeight: 121 })).ok).toBe(false)
    expect(parseSchedule(withBranding({ logoHeight: 16.5 })).ok).toBe(false)
  })

  it('files without any M3 field stay valid', () => {
    expect(parseSchedule(createEmptySchedule()).ok).toBe(true)
    const result = parseSchedule(JSON.parse(JSON.stringify(createEmptySchedule())))
    expect(result.ok).toBe(true)
  })
})

describe('print css', () => {
  const css = agendaCss({ ...cairoSample, branding: { ...cairoSample.branding, theme: 'dark' } })
  const printBlock = css.slice(css.lastIndexOf('@media print{\n  :root'))

  it('sets an A4 page with 12mm margins', () => {
    expect(css).toContain('@page{size:A4;margin:12mm}')
  })

  it('forces the light palette after the dark rules, even for dark or auto themes', () => {
    expect(css.indexOf(':root[data-theme="dark"]{color-scheme:dark')).toBeLessThan(css.lastIndexOf('@media print{'))
    expect(printBlock).toContain(':root,:root[data-theme="dark"],:root:not([data-theme="light"]){color-scheme:light;--bg:#f8fafd;')
    expect(printBlock).toContain('--lift:0%')
  })

  it('keeps backgrounds, avoids breaking cards, hides the badge, shows the link address', () => {
    expect(printBlock).toContain('print-color-adjust:exact')
    expect(printBlock).toContain('-webkit-print-color-adjust:exact')
    expect(printBlock).toMatch(/\.ev,\.person[^{]*\{break-inside:avoid\}/)
    expect(printBlock).toContain('.ev .badge{display:none!important}')
    expect(printBlock).toContain('.btn::after{content:"(" attr(href) ")";margin-inline-start:.4em')
  })

  it('is present without motion too, and adds no animation css', () => {
    expect(agendaCss(cairoSample)).toContain('@media print{')
    expect(agendaCss(cairoSample)).not.toMatch(/animation|@keyframes/)
  })
})

describe('now badge css and meta line', () => {
  it('ports the reference badge styles using --note', () => {
    const css = agendaCss(cairoSample)
    expect(css).toContain('.ev .badge{display:none;')
    expect(css).toContain('background:var(--note)')
    expect(css).toContain('.ev.now{box-shadow:0 0 0 2px var(--note)}')
    expect(css).toContain('.ev.now .badge{display:inline-block}')
  })

  it('applies the mono face to the time range only, not the zone name', () => {
    const doc = new DOMParser().parseFromString(renderDocument(cairoSample), 'text/html')
    expect(doc.querySelector('.time .rng')?.textContent).toBe('13:30 – 17:45')
    expect(doc.querySelector('.time')?.textContent).toBe('13:30 – 17:45 EEST')
    const css = agendaCss(cairoSample)
    expect(css).toContain('.rng{font-family:var(--mono)}')
    expect(css).not.toMatch(/\.time\{[^}]*font-family/)
  })
})
