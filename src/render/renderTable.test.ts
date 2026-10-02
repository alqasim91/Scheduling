import { describe, expect, it } from 'vitest'
import type { Schedule } from '../model/schema.ts'
import { parseSchedule } from '../model/validate.ts'
import { agendaCss } from './agendaCss.ts'
import { tableDemo } from './__fixtures__/tableDemo.ts'
import { tableDemoRtl } from './__fixtures__/tableDemoRtl.ts'
import { resolveLabels } from './labels.ts'
import { renderAgendaBody, renderDocument } from './renderAgenda.ts'

const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html')
const doc = parse(renderDocument(tableDemo))
const bodyRows = () => [...doc.querySelectorAll('table.sched tbody tr[data-s]')]
const withRow = (cells: Record<string, string>, extra: Partial<Schedule['rows'][number]> = {}): Schedule => ({
  ...tableDemo,
  rows: [{ id: 'x', start: '09:00', end: '10:00', ...extra, cells }],
})

describe('table structure', () => {
  it('fixtures are valid schedules', () => {
    expect(parseSchedule(tableDemo).ok).toBe(true)
    expect(parseSchedule(tableDemoRtl).ok).toBe(true)
  })

  it('renders one semantic table: a time header, the table columns, one row per schedule row', () => {
    expect(doc.querySelectorAll('table.sched')).toHaveLength(1)
    const heads = [...doc.querySelectorAll('table.sched thead th')]
    expect(heads.map((h) => h.textContent)).toEqual(['Time', 'Session', 'Speaker', 'Room', 'Tag', 'Ends'])
    expect(heads.every((h) => h.getAttribute('scope') === 'col')).toBe(true)
    expect(bodyRows()).toHaveLength(8)
    expect(doc.querySelectorAll('.agenda, .legend, .lane-head, .ev')).toHaveLength(0) // no grid, no legend
    expect(doc.querySelector('h2')?.textContent).toBe('Agenda')
  })

  it('shows start and end in the time cell and carries data-s / data-e for the Now script', () => {
    const first = bodyRows()[0] as Element
    expect(first.getAttribute('data-s')).toBe('540')
    expect(first.getAttribute('data-e')).toBe('570')
    const time = first.querySelector('td.c-time')
    expect(time?.textContent).toBe('Now09:0009:30')
    expect(time?.querySelector('b')?.textContent).toBe('09:00')
    expect(time?.querySelector('.badge')?.textContent).toBe('Now')
    expect(first.querySelector('td:nth-child(2)')?.textContent).toBe('Welcome and coffee')
  })

  it('renders a row note as a full-width row under its row', () => {
    const note = doc.querySelector('table.sched tr.note') as Element
    expect(note.textContent).toBe('Bring your team\u2019s top three priorities.')
    expect(note.querySelector('td')?.getAttribute('colspan')).toBe('6')
    expect(note.previousElementSibling?.getAttribute('data-s')).toBe('570')
    expect(note.hasAttribute('data-s')).toBe(false)
  })

  it('uses the same header, notes, speakers and print link as the grid', () => {
    expect(doc.querySelector('h1')?.textContent).toBe('Product Team Offsite')
    expect(doc.querySelector('.parallel-note b')?.textContent).toBe('Lunch is provided.')
    expect(doc.querySelectorAll('.person')).toHaveLength(3)
    expect(doc.querySelector('.print-link')?.textContent).toBe('Official event page: https://example.org/offsite')
    // The time range comes from the rows, not from items.
    expect(doc.querySelector('.time')?.textContent).toMatch(/^09:00 – 16:00 BST/)
  })

  it('labels every cell with its column name for the mobile card layout', () => {
    const cells = [...(bodyRows()[1] as Element).querySelectorAll('td')]
    expect(cells.map((c) => c.getAttribute('data-label'))).toEqual(['Time', 'Session', 'Speaker', 'Room', 'Tag', 'Ends'])
    expect(agendaCss(tableDemo)).toContain('@media (max-width:560px){')
    expect(agendaCss(tableDemo)).toContain('.sched td::before{content:attr(data-label)')
  })

  it('has no table columns? it still renders the time column', () => {
    const none: Schedule = { ...tableDemo, columns: [] }
    expect(() => renderDocument(none)).not.toThrow()
    expect(parse(renderDocument({ ...none, rows: [{ id: 'a', start: '09:00', end: '10:00' }] })).querySelectorAll('th')).toHaveLength(1)
  })
})

describe('cell types', () => {
  it('person cells match speakers case-insensitively and trimmed, showing the avatar', () => {
    const rows = bodyRows()
    const matched = rows[3]?.querySelector('td[data-label="Speaker"] .who') as Element // "  daniel OKAFOR "
    expect(matched.querySelector('.av')?.textContent).toBe('DO')
    expect(matched.querySelector('.av')?.getAttribute('style')).toContain('background:#00897b')
    expect(matched.textContent).toBe('DODaniel Okafor') // the speaker's own spelling
    const maya = rows[0]?.querySelector('td[data-label="Speaker"] .who')
    expect(maya?.textContent).toBe('MCMaya Chen')
  })

  it('unmatched or empty person cells are plain text or empty', () => {
    const rows = bodyRows()
    const guest = rows[6]?.querySelector('td[data-label="Speaker"]') as Element
    expect(guest.textContent).toBe('Guest facilitator')
    expect(guest.querySelector('.who')).toBeNull()
    const empty = rows[2]?.querySelector('td[data-label="Speaker"]') as Element
    expect(empty.textContent).toBe('')
    expect(empty.classList.contains('e')).toBe(true)
  })

  it('person cells use a speaker photo when there is one', () => {
    const photo = 'data:image/png;base64,AAAA'
    const s: Schedule = { ...withRow({ 'c-speaker': 'maya chen' }), speakers: [{ id: 's', name: 'Maya Chen', role: 'x', photo }] }
    expect(parse(renderAgendaBody(s)).querySelector('td[data-label="Speaker"] .av img')?.getAttribute('src')).toBe(photo)
  })

  it('tag cells become chips in the column colour, split on commas, trimmed, empties dropped', () => {
    const chips = [...(bodyRows()[3] as Element).querySelectorAll('td[data-label="Tag"] .chip')]
    expect(chips.map((c) => c.textContent)).toEqual(['Engineering', 'Migration', 'Q&A'])
    expect(chips.every((c) => c.getAttribute('style') === '--c:#00897b')).toBe(true)
    const odd = parse(renderAgendaBody(withRow({ 'c-tag': ' a ,, b ,  ,c,' })))
    expect([...odd.querySelectorAll('.chip')].map((c) => c.textContent)).toEqual(['a', 'b', 'c'])
    expect(parse(renderAgendaBody(withRow({ 'c-tag': ' , ' }))).querySelector('.chip')).toBeNull()
  })

  it('splits tags on the Arabic comma too', () => {
    const chips = [...parse(renderAgendaBody(tableDemoRtl)).querySelectorAll('td[data-label="الوسوم"]')[1]?.querySelectorAll('.chip') ?? []]
    expect(chips.map((c) => c.textContent)).toEqual(['تخطيط', 'خارطة الطريق'])
  })

  it('time cells use the locale and the 12h / 24h setting', () => {
    expect(bodyRows()[0]?.querySelector('td[data-label="Ends"]')?.textContent).toBe('09:30')
    const us: Schedule = { ...tableDemo, event: { ...tableDemo.event, locale: 'en-US', timeFormat: '12h' } }
    const usDoc = parse(renderAgendaBody(us))
    const rows = [...usDoc.querySelectorAll('tbody tr[data-s]')]
    expect(rows[0]?.querySelector('td[data-label="Ends"]')?.textContent).toMatch(/^9:30\sAM$/)
    expect(rows[5]?.querySelector('td[data-label="Ends"]')?.textContent).toMatch(/^2:15\sPM$/)
    expect(rows[0]?.querySelector('td.c-time')?.textContent).toMatch(/9:00\sAM9:30\sAM$/)
    expect(usDoc.querySelector('.time')?.textContent).toMatch(/^9:00\sAM – 4:00\sPM/)
    // Time cells never wrap; they carry tabular numbers.
    expect(rows[0]?.querySelector('td[data-label="Ends"]')?.classList.contains('n')).toBe(true)
  })
})

describe('escaping', () => {
  const hostile = '<img src=x onerror=alert(1)>"\'&'
  const html = renderAgendaBody({
    ...tableDemo,
    columns: tableDemo.columns.map((c, i) => (i === 0 ? { ...c, name: `Name ${hostile}` } : c)),
    rows: [
      {
        id: 'x',
        start: '09:00',
        end: '10:00',
        note: `<b>note</b> **bold** ${hostile}`,
        cells: { 'c-session': hostile, 'c-speaker': hostile, 'c-room': '<script>alert(1)</script>', 'c-tag': `${hostile}, <i>t</i>` },
      },
    ],
  })

  it('escapes cells, tags, person text, notes and column names (including data-label)', () => {
    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<i>t</i>')
    expect(html).toContain('data-label="Name &lt;img src=x onerror=alert(1)&gt;&quot;&#39;&amp;"')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;&quot;&#39;&amp;')
    expect(html).toContain('<b>bold</b>') // the one supported markup, in notes
    expect(html).toContain('&lt;b&gt;note&lt;/b&gt;')
  })

  it('parses into exactly the expected elements', () => {
    const parsed = parse(html)
    expect(parsed.querySelectorAll('img')).toHaveLength(0)
    expect(parsed.querySelectorAll('script')).toHaveLength(0)
    expect(parsed.querySelector('td[data-label^="Name"]')?.getAttribute('data-label')).toBe(`Name ${hostile}`)
  })
})

describe('RTL and labels', () => {
  const rtl = parse(renderDocument(tableDemoRtl))

  it('is right-to-left with Arabic labels and digits', () => {
    expect(rtl.documentElement.getAttribute('dir')).toBe('rtl')
    expect([...rtl.querySelectorAll('thead th')].map((h) => h.textContent)).toEqual(['الوقت', 'الجلسة', 'المتحدث', 'القاعة', 'الوسوم', 'النهاية'])
    expect(rtl.querySelector('td.c-time')?.textContent).toBe('الآن٠٩:٠٠٠٩:٣٠')
    expect(rtl.querySelector('td[data-label="النهاية"]')?.textContent).toBe('٠٩:٣٠')
  })

  it('uses logical properties only for the table', () => {
    const css = agendaCss(tableDemoRtl)
    const tableCss = css.slice(css.indexOf('.tbl{'), css.indexOf('.people{'))
    expect(tableCss).toContain('text-align:start')
    expect(tableCss).not.toMatch(/text-align:(left|right)|padding-(left|right)|margin-(left|right)|border-(left|right)/)
  })

  it('the time heading is a label with locale defaults and an override', () => {
    expect(resolveLabels(undefined, 'en-GB').time).toBe('Time')
    expect(resolveLabels(undefined, 'ar-EG').time).toBe('الوقت')
    expect(resolveLabels(undefined, 'fr-FR').time).toBe('Horaire')
    const custom: Schedule = { ...tableDemo, labels: { time: 'When' } }
    expect(parse(renderAgendaBody(custom)).querySelector('thead th')?.textContent).toBe('When')
  })
})

describe('table css', () => {
  const css = agendaCss(tableDemo)
  const printBlock = css.slice(css.lastIndexOf('@media print{\n  :root'))

  it('uses brand tokens with a zebra and a Now highlight', () => {
    expect(css).toContain('.sched tbody:nth-of-type(even) td{background:color-mix(in srgb,var(--muted) 4%,var(--card))}')
    expect(css).toContain('.sched tr.now td{background:color-mix(in srgb,var(--note) 16%,var(--card))}')
    expect(css).toContain('border:1px solid var(--line)')
  })

  it('print repeats the header on each page, keeps rows whole, and stays light and compact', () => {
    expect(printBlock).toContain('.sched thead{display:table-header-group}')
    expect(printBlock).toContain('.sched tr,.sched tbody{break-inside:avoid}')
    expect(printBlock).toContain('.sched{font-size:9pt}')
    expect(printBlock).toContain('color-scheme:light')
  })

  it('stagger animates the rows; fade animates the table as a whole', () => {
    const withMotion = (preset: 'fade' | 'stagger'): Schedule => ({
      ...tableDemo,
      branding: { ...tableDemo.branding, motion: { preset, logoAnimation: false } },
    })
    const stagger = agendaCss(withMotion('stagger'))
    expect(stagger).toContain('.ev,.sched tbody tr{animation:rise .5s ease both;animation-delay:calc(var(--i,0) * 40ms)}')
    expect(stagger).not.toMatch(/\.btn,\.tbl\{/)
    expect(agendaCss(withMotion('fade'))).toContain('.btn,.tbl{animation:rise .6s ease both}')
    const html = renderDocument(withMotion('stagger'))
    const indices = [...html.matchAll(/<tr(?: data-s="\d+" data-e="\d+")? style="--i:(\d+)"/g)].map((m) => Number(m[1]))
    expect(indices).toEqual([0, 1, 2, 3, 4, 5, 6, 7]) // the note row shares its row's index
    expect(renderDocument(tableDemo)).not.toContain('--i:')
  })
})

describe('mode switching leaves the other mode alone', () => {
  it('a table schedule renders no items even if items exist, and a grid ignores cells', () => {
    const withItems: Schedule = {
      ...tableDemo,
      columns: [...tableDemo.columns, { id: 't1', name: 'Lane', color: '#0b57d0', type: 'track' }],
      items: [{ id: 'i', columnIds: ['t1'], start: '09:00', end: '09:30', title: 'Hidden', variant: 'session' }],
    }
    expect(renderAgendaBody(withItems)).not.toContain('Hidden')
    const grid = parse(renderAgendaBody({ ...withItems, mode: 'track-grid' }))
    expect(grid.querySelector('table.sched')).toBeNull()
    expect(grid.querySelectorAll('.ev')).toHaveLength(1)
    expect(grid.body.textContent).not.toContain('Welcome and coffee')
    // Only the track is a lane: the grid template has one lane column, not six.
    expect(agendaCss({ ...withItems, mode: 'track-grid' })).toContain('grid-template-columns:56px repeat(1,1fr)')
  })
})
