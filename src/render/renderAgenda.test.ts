import { describe, expect, it } from 'vitest'
import type { Schedule } from '../model/schema.ts'
import { cairoSample } from '../samples/cairo.ts'
import { agendaCss } from './agendaCss.ts'
import { escapeHtml, cssFontFamily } from './escape.ts'
import { DEFAULT_LABELS, resolveLabels } from './labels.ts'
import { initials, renderAgendaBody, renderDocument } from './renderAgenda.ts'

function withEvent(patch: Partial<Schedule['event']>): Schedule {
  return { ...cairoSample, event: { ...cairoSample.event, ...patch } }
}

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

/** `grid-row` / `grid-column` value out of an element's inline style. */
function gridStyle(el: Element, property: 'grid-row' | 'grid-column'): string | undefined {
  return new RegExp(`${property}:([^;]+)`).exec(el.getAttribute('style') ?? '')?.[1]?.trim()
}

describe('escaping and sanitising', () => {
  it('escapes a <script> title everywhere it appears', () => {
    const html = renderDocument(withEvent({ title: '<script>alert(1)</script>', titleHighlight: undefined }))
    expect(html).not.toContain('<script')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(parse(html).title).toBe('<script>alert(1)</script>')
  })

  it('escapes item, speaker, venue and note text and quotes', () => {
    const s: Schedule = {
      ...withEvent({ venue: 'A "quoted" <b>venue</b>', notes: "x <img src=x onerror=1> **bold** it's" }),
      items: cairoSample.items.map((i, n) => (n === 0 ? { ...i, title: '<i>t</i>', speaker: '"><svg>' } : i)),
    }
    const html = renderAgendaBody(s)
    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('<svg>')
    expect(html).not.toContain('<i>t</i>')
    expect(html).toContain('&quot;&gt;&lt;svg&gt;')
    expect(html).toContain('<b>bold</b>')
    expect(html).toContain('it&#39;s')
  })

  it('omits a javascript: URL and keeps http(s) ones', () => {
    expect(renderAgendaBody(withEvent({ url: 'javascript:alert(1)' }))).not.toMatch(/javascript:|class="btn"/)
    expect(renderAgendaBody(withEvent({ url: 'data:text/html,hi' }))).not.toContain('class="btn"')
    expect(renderAgendaBody(withEvent({ url: 'not a url' }))).not.toContain('class="btn"')
    const ok = renderAgendaBody(withEvent({ url: 'https://example.com/a?b=1&c=2' }))
    expect(ok).toContain('class="btn"')
    expect(ok).toContain('href="https://example.com/a?b=1&amp;c=2"')
    expect(renderAgendaBody(withEvent({ url: undefined }))).not.toContain('class="btn"')
  })

  it('strips CSS-breaking characters from fonts', () => {
    const s: Schedule = {
      ...cairoSample,
      branding: {
        ...cairoSample.branding,
        fonts: { ...cairoSample.branding.fonts, display: 'Arial}body{background:red', mono: 'x;</style><script>\\' },
      },
    }
    const css = agendaCss(s)
    expect(css).not.toContain('}body{background:red')
    expect(css).toContain('--display:Arialbodybackground:red;')
    expect(css).not.toMatch(/--mono:[^;]*[<>\\]/)
    expect(renderDocument(s)).not.toContain('<script')
    expect(cssFontFamily("'Open Sans", 'sans-serif')).toBe('Open Sans')
    expect(cssFontFamily('/* x', 'sans-serif')).toBe('x')
    expect(cssFontFamily('{};', 'sans-serif')).toBe('sans-serif')
  })

  it('escapeHtml covers & < > " and \'', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;')
  })

  it('only emits a logo that is a data:image URI', () => {
    const bad: Schedule = { ...cairoSample, branding: { ...cairoSample.branding, logo: 'https://evil.test/x.png' } }
    expect(renderAgendaBody(bad)).not.toContain('<img class="logo"')
    expect(renderAgendaBody(cairoSample)).toContain('<img class="logo"')
    expect(renderAgendaBody({ ...cairoSample, branding: { ...cairoSample.branding, logo: null } })).not.toContain(
      'class="logo"',
    )
  })
})

describe('header', () => {
  it('wraps the first occurrence of the highlight in <b>', () => {
    const html = renderAgendaBody(cairoSample)
    expect(html).toContain('<h1>Google for <b>Developers</b> Day: Cairo</h1>')
    expect(html).toContain('Friday, 2 October 2026')
  })

  it('highlights safely and only when found', () => {
    const s = withEvent({ title: 'A & <B> & <B>', titleHighlight: '<B>' })
    expect(renderAgendaBody(s)).toContain('<h1>A &amp; <b>&lt;B&gt;</b> &amp; &lt;B&gt;</h1>')
    expect(renderAgendaBody(withEvent({ titleHighlight: 'Nope' }))).toContain('<h1>Google for Developers Day: Cairo</h1>')
    expect(renderAgendaBody(withEvent({ titleHighlight: undefined }))).not.toContain('<h1>Google for <b>')
  })

  it('shows the time range with the timezone, then venue and status', () => {
    const doc = parse(renderAgendaBody(cairoSample))
    const spans = [...doc.querySelectorAll('.meta > span')].map((e) => e.textContent)
    expect(spans).toEqual([
      '13:30 – 17:45 EEST',
      'The GrEEK Campus Downtown, 171 El Tahrir Street, Abdeen',
      "You're registered",
    ])
  })

  it('leaves out empty meta items', () => {
    const doc = parse(renderAgendaBody(withEvent({ venue: '', status: undefined })))
    expect(doc.querySelectorAll('.meta > span')).toHaveLength(1)
  })

  it('extends the time range with an item end override that runs later', () => {
    const s: Schedule = {
      ...cairoSample,
      items: cairoSample.items.map((i) => (i.id === 'item-closing' ? { ...i, end: '18:30' } : i)),
    }
    expect(parse(renderAgendaBody(s)).querySelector('.time')?.textContent).toMatch(/^13:30 – 18:30/)
  })

  it('renders the event notes with bold support', () => {
    const doc = parse(renderAgendaBody(cairoSample))
    expect(doc.querySelector('.parallel-note b')?.textContent).toBe('Two sessions run at once in three slots:')
    expect(parse(renderAgendaBody(withEvent({ notes: '' }))).querySelector('.parallel-note')).toBeNull()
  })
})

describe('Cairo sample agenda', () => {
  const html = renderDocument(cairoSample)
  const doc = parse(html)

  it('is a complete script-free document', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('<meta charset="utf-8">')
    expect(html).toContain('name="viewport"')
    expect(doc.title).toBe('Google for Developers Day: Cairo')
    expect(doc.querySelector('style')?.textContent).toContain('grid-template-columns:56px repeat(2,1fr)')
    expect(doc.querySelectorAll('script')).toHaveLength(0)
  })

  it('has a legend with one chip per column plus Everyone, and 2 lane columns', () => {
    const chips = [...doc.querySelectorAll('.legend .chip')].map((c) => c.textContent)
    expect(chips).toEqual(['Beginner track', 'Intermediate track', 'Everyone'])
    expect(doc.querySelectorAll('.lane-head > div')).toHaveLength(2)
  })

  it('places shared items across columns 2 / 4', () => {
    const shared = [...doc.querySelectorAll('.ev.shared')]
    expect(shared.map((e) => e.querySelector('h3')?.textContent)).toEqual([
      'Registration & Welcome',
      'Lunch',
      'Coffee Break',
      'Closing remarks',
    ])
    for (const el of shared) expect(gridStyle(el, 'grid-column')).toBe('2 / 4')
    const keynote = doc.querySelector('.ev.key')
    expect(keynote?.querySelector('h3')?.textContent).toBe('Opening & Keynote')
    expect(gridStyle(keynote as Element, 'grid-column')).toBe('2 / 4')
  })

  it('places track sessions in their own column with chip, speaker and times', () => {
    const tracks = [...doc.querySelectorAll('.ev.track')]
    expect(tracks).toHaveLength(7)
    const gemma = tracks.find((e) => e.textContent?.includes('Build with Gemma 4')) as Element
    expect(gridStyle(gemma, 'grid-column')).toBe('2 / 3')
    expect(gemma.querySelector('.chip')?.textContent).toBe('Beginner')
    expect(gemma.querySelector('.spk')?.textContent).toBe('Speaker Eman Alrefai')
    expect(gemma.querySelector('.when')?.textContent).toBe('17:05 – 17:35')
    expect(gemma.getAttribute('style')).toContain('--c:#188038')
    const gke = tracks.find((e) => e.textContent?.includes('Scale Distributed')) as Element
    expect(gridStyle(gke, 'grid-column')).toBe('3 / 4')
    expect(gke.querySelector('.when')?.textContent).toBe('16:35 – 17:20')
    expect(gke.getAttribute('data-s')).toBe(String(16 * 60 + 35))
    expect(gke.getAttribute('data-e')).toBe(String(17 * 60 + 20))
  })

  it('adds a ghost cell in the 17:05 row for the Intermediate session that runs long', () => {
    const ghosts = [...doc.querySelectorAll('.ev.ghost')]
    expect(ghosts).toHaveLength(1)
    const ghost = ghosts[0] as Element
    expect(ghost.textContent).toBe('Intermediate GKE session continues until 17:20')
    expect(gridStyle(ghost, 'grid-column')).toBe('3 / 4')
    const timeCell = [...doc.querySelectorAll('.t')].find((t) => t.querySelector('b')?.textContent === '17:05') as Element
    expect(gridStyle(ghost, 'grid-row')).toBe(gridStyle(timeCell, 'grid-row'))
  })

  it('puts the lane head right before the 14:20 row', () => {
    const laneHead = doc.querySelector('.lane-head') as Element
    const next = laneHead.nextElementSibling
    expect(next?.classList.contains('t')).toBe(true)
    expect(next?.querySelector('b')?.textContent).toBe('14:20')
    expect(doc.querySelectorAll('.lane-head')).toHaveLength(1)
    expect([...laneHead.querySelectorAll('div')].map((d) => d.textContent)).toEqual(['Beginner', 'Intermediate'])
  })

  it('renders the keynote row note as a .small paragraph spanning columns 2..end', () => {
    const note = doc.querySelector('p.small') as Element
    expect(note.textContent).toMatch(/^The page also lists a 5 minute room change/)
    expect(gridStyle(note, 'grid-column')).toBe('2 / 4')
    const keynoteRow = gridStyle(doc.querySelector('.ev.key') as Element, 'grid-row')
    expect(Number(gridStyle(note, 'grid-row'))).toBe(Number(keynoteRow) + 1)
  })

  it('gives every row a time cell with start and end', () => {
    const cells = [...doc.querySelectorAll('.t')].map((t) => t.textContent)
    expect(cells).toEqual([
      '13:3014:00',
      '14:0014:30',
      '14:2015:05',
      '15:0515:35',
      '15:3516:20',
      '16:2016:35',
      '16:3517:05',
      '17:0517:35',
      '17:3517:45',
    ])
  })

  it('renders all speakers with initials that skip prefixes like Dr.', () => {
    const people = [...doc.querySelectorAll('.person')]
    expect(people).toHaveLength(8)
    const asma = people.find((p) => p.textContent?.includes('Asma')) as Element
    expect(asma.querySelector('.av')?.textContent).toBe('AM')
    const ahmed = people.find((p) => p.textContent?.includes('Ahmed')) as Element
    expect(ahmed.querySelector('.av')?.textContent).toBe('AA')
    expect(asma.querySelector('.av')?.getAttribute('style')).toContain('background:#d93025')
    expect(doc.querySelector('a.btn')?.getAttribute('href')).toBe(cairoSample.event.url)
  })
})

describe('layout edge cases', () => {
  it('uses a photo for the avatar when present and --primary when no colour is set', () => {
    const photo = 'data:image/png;base64,AAAA'
    const s: Schedule = {
      ...cairoSample,
      speakers: [
        { id: 'a', name: 'Ada Lovelace', role: 'Analyst', photo },
        { id: 'b', name: 'Cher', role: 'Singer' },
      ],
    }
    const doc = parse(renderAgendaBody(s))
    const [a, b] = [...doc.querySelectorAll('.av')]
    expect(a?.querySelector('img')?.getAttribute('src')).toBe(photo)
    expect(b?.textContent).toBe('C')
    expect(b?.getAttribute('style')).toContain('var(--primary)')
  })

  it('omits the speakers section when there are none', () => {
    expect(renderAgendaBody({ ...cairoSample, speakers: [] })).not.toContain('Speakers')
  })

  it('does not crash on overlapping items and renders both', () => {
    const first = cairoSample.items.find((i) => i.id === 'item-b1')!
    const s: Schedule = {
      ...cairoSample,
      items: [...cairoSample.items, { ...first, id: 'dup', title: 'Overlapping talk' }],
    }
    const html = renderAgendaBody(s)
    expect(html).toContain('Overlapping talk')
    expect(html).toContain('Beyond the Prompt')
  })

  it('converts rowSpan to a grid-row span, counting any note rows in between', () => {
    const s: Schedule = {
      ...cairoSample,
      items: cairoSample.items.map((i) => (i.id === 'item-b1' ? { ...i, rowSpan: 2 } : i)),
    }
    const doc = parse(renderAgendaBody(s))
    const el = [...doc.querySelectorAll('.ev.track')].find((e) => e.textContent?.includes('Beyond')) as Element
    expect(gridStyle(el, 'grid-row')).toMatch(/^\d+ \/ span 2$/)
  })

  it('renders no lane head when every item spans all columns', () => {
    const s: Schedule = { ...cairoSample, items: cairoSample.items.filter((i) => i.columnIds.length === 2) }
    expect(renderAgendaBody(s)).not.toContain('class="lane-head"')
  })

  it('renders an empty schedule without throwing', () => {
    const s: Schedule = { ...cairoSample, rows: [], items: [], speakers: [], columns: [] }
    expect(() => renderDocument(s)).not.toThrow()
  })

  it('initials handles one-word, prefixed and empty names', () => {
    expect(initials('Dr. Asma Merabet')).toBe('AM')
    expect(initials('Ahmed Abu Eldahab')).toBe('AA')
    expect(initials('Mary Jane Watson')).toBe('MJ')
    expect(initials('Cher')).toBe('C')
    expect(initials('Prof. Dr. X')).toBe('X')
    expect(initials('Dr.')).toBe('D')
    expect(initials('')).toBe('')
  })
})

describe('continuation labels', () => {
  const withLabel = (continuationLabel: string | undefined): Schedule => ({
    ...cairoSample,
    items: cairoSample.items.map((i) => (i.id === 'item-i3' ? { ...i, continuationLabel } : i)),
  })
  const ghostText = (s: Schedule) => parse(renderAgendaBody(s)).querySelector('.ev.ghost')?.textContent

  it('falls back to "<first column name> session" without a label', () => {
    expect(ghostText(withLabel(undefined))).toBe('Intermediate session continues until 17:20')
    expect(ghostText(withLabel('  '))).toBe('Intermediate session continues until 17:20')
  })

  it('uses and escapes a custom label', () => {
    expect(ghostText(withLabel('Workshop <A>'))).toBe('Workshop <A> continues until 17:20')
    expect(renderAgendaBody(withLabel('Workshop <A>'))).toContain('Workshop &lt;A&gt; continues until')
  })
})

describe('labels and branding without any event-specific text', () => {
  const custom: Schedule = {
    version: 1,
    event: {
      title: 'Harbour Product Summit',
      date: '2027-03-09',
      timezone: 'Europe/London',
      venue: 'Pier 4',
      notes: '**Heads up:** doors open early.',
    },
    branding: {
      logo: null,
      colors: {
        primary: '#6a1b9a',
        accent: '#e65100',
        background: '#ffffff',
        surface: '#fafafa',
        text: '#111111',
        muted: '#555555',
        line: '#cccccc',
        note: '#00897b',
      },
      fonts: {
        display: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        body: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        mono: 'ui-monospace, Menlo, Consolas, monospace',
      },
      theme: 'light',
      motion: { preset: 'none', logoAnimation: false },
    },
    labels: {
      agenda: 'Programme',
      speakers: 'Presenters',
      everyone: 'All attendees',
      speakerPrefix: 'Host',
      trackSuffix: 'stream',
      continuesUntil: 'carries on until',
    },
    mode: 'track-grid',
    columns: [
      { id: 'c1', name: 'Design', color: '#6a1b9a', type: 'track' },
      { id: 'c2', name: 'Data', color: '#00897b', type: 'track' },
      { id: 'c3', name: 'Ops', color: '#e65100', type: 'track' },
    ],
    rows: [
      { id: 'r1', start: '09:00', end: '09:30' },
      { id: 'r2', start: '09:30', end: '10:15' },
      { id: 'r3', start: '10:15', end: '10:45' },
    ],
    items: [
      { id: 'i1', rowId: 'r1', columnIds: ['c1', 'c2', 'c3'], title: 'Welcome', variant: 'break' },
      { id: 'i2', rowId: 'r2', columnIds: ['c1'], title: 'Design systems', speaker: 'Sam Lee', end: '10:30', variant: 'session' },
      { id: 'i3', rowId: 'r2', columnIds: ['c2'], title: 'Pipelines', variant: 'session' },
    ],
    speakers: [],
  }
  const html = renderDocument(custom)
  const doc = parse(html)

  it('contains no text from the Cairo sample', () => {
    for (const word of ['Cairo', 'Google', 'Beginner', 'Intermediate', 'Speaker ', 'Official event page']) {
      expect(html, word).not.toContain(word)
    }
    expect(doc.querySelector('.btn')).toBeNull()
    expect(doc.querySelector('.people')).toBeNull()
  })

  it('shows the custom labels', () => {
    expect(doc.querySelector('h2')?.textContent).toBe('Programme')
    expect([...doc.querySelectorAll('.legend .chip')].map((c) => c.textContent)).toEqual([
      'Design stream',
      'Data stream',
      'Ops stream',
      'All attendees',
    ])
    expect(doc.querySelector('.spk')?.textContent).toBe('Host Sam Lee')
    expect(doc.querySelector('.ev.ghost')?.textContent).toBe('Design session carries on until 10:30')
    expect(doc.querySelectorAll('.lane-head > div')).toHaveLength(3)
  })

  it('uses the note colour and generic fonts', () => {
    const css = agendaCss(custom)
    expect(css).toContain('--note:#00897b;')
    expect(css).not.toContain('#f9ab00')
    expect(css).not.toMatch(/Google|Roboto Mono/)
    expect(css).not.toContain('content:"Speaker')
  })

  it('applies the default labels and note colour when none are set', () => {
    const bare: Schedule = { ...custom, labels: undefined, speakers: cairoSample.speakers.slice(0, 1), event: { ...custom.event, url: 'https://example.com' } }
    const bareDoc = parse(renderAgendaBody(bare))
    expect(bareDoc.querySelector('h2')?.textContent).toBe(DEFAULT_LABELS.agenda)
    expect(bareDoc.querySelector('.btn')?.textContent).toBe(DEFAULT_LABELS.eventLink)
    expect(agendaCss({ ...bare, branding: { ...bare.branding, colors: { ...bare.branding.colors, note: undefined } } })).toContain(
      '--note:#f9ab00;',
    )
    expect(resolveLabels({ agenda: '   ', eventLink: 'RSVP' })).toEqual({ ...DEFAULT_LABELS, eventLink: 'RSVP' })
  })
})
