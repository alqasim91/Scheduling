import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import v1Schedules from '../model/__fixtures__/v1Schedules.json'
import { parseSchedule } from '../model/validate.ts'
import { renderDocument } from '../render/renderAgenda.ts'
import { tableDemo } from '../render/__fixtures__/tableDemo.ts'
import { BUILTIN_TEMPLATES } from './builtin/index.ts'
import {
  TEMPLATE_KIND,
  isTemplateFile,
  parseTemplateValue,
  serializeTemplateFile,
  sniffTemplateText,
  templateFilename,
} from './file.ts'
import { canonical, instantiate, remapIds, todayIn } from './instantiate.ts'
import {
  QUOTA_MESSAGE,
  TEMPLATES_KEY,
  deleteUserTemplate,
  listUserTemplates,
  renameUserTemplate,
  saveUserTemplate,
} from './store.ts'
import { stripContent } from './strip.ts'

const NOW = new Date('2026-09-15T22:30:00Z')

const idsOf = (s: ReturnType<typeof instantiate>): string[] => [
  ...s.columns.map((c) => c.id),
  ...s.rows.map((r) => r.id),
  ...s.items.map((i) => i.id),
  ...s.speakers.map((p) => p.id),
]

function expectValid(schedule: unknown) {
  const result = parseSchedule(schedule)
  expect(result.ok, result.ok ? '' : result.errors.join('; ')).toBe(true)
}

describe('built-in templates', () => {
  it('there are five, with unique ids and names, all marked built-in', () => {
    expect(BUILTIN_TEMPLATES.map((t) => t.id)).toEqual([
      'conference-two-tracks',
      'single-track-meetup',
      'workshop-day',
      'team-offsite',
      'arabic-conference',
    ])
    expect(new Set(BUILTIN_TEMPLATES.map((t) => t.name)).size).toBe(5)
    expect(BUILTIN_TEMPLATES.every((t) => t.builtin && t.description.length > 20)).toBe(true)
  })

  it('cover grid and table modes, one track, RTL and web fonts', () => {
    const byId = Object.fromEntries(BUILTIN_TEMPLATES.map((t) => [t.id, t.schedule]))
    expect(byId['conference-two-tracks']?.mode).toBe('track-grid')
    expect(byId['conference-two-tracks']?.columns).toHaveLength(2)
    expect(byId['single-track-meetup']?.columns).toHaveLength(1)
    expect(byId['workshop-day']?.mode).toBe('table')
    expect(byId['team-offsite']?.mode).toBe('table')
    expect(byId['arabic-conference']?.event.locale).toBe('ar-EG')
    expect(byId['arabic-conference']?.branding.fonts.webFonts).toEqual(['Cairo', 'Tajawal'])
  })

  for (const template of BUILTIN_TEMPLATES) {
    describe(template.name, () => {
      it('is a valid schedule that renders', () => {
        expectValid(template.schedule)
        expect(renderDocument(template.schedule)).toContain('<main class="wrap">')
        // Grid templates are made of sessions (rows are for table mode); tables are made of rows.
        const parts = template.schedule.mode === 'table' ? template.schedule.rows : template.schedule.items
        expect(parts.length).toBeGreaterThanOrEqual(6)
      })

      it('is generic: placeholder text only, no real organisations or people', () => {
        const text = JSON.stringify(template.schedule)
        for (const real of ['Google', 'Microsoft', 'Amazon', 'Maya Chen', 'Developers Day', 'GrEEK', 'rsvp.withgoogle']) {
          expect(text, real).not.toContain(real)
        }
        expect(template.schedule.event.url).toMatch(/^https:\/\/example\.org\//)
      })

      it('uses its own neutral palette, with unique ids per collection', () => {
        const s = template.schedule
        expect(s.branding.colors.primary).toMatch(/^#[0-9a-f]{6}$/)
        for (const list of [s.columns, s.rows, s.items, s.speakers]) {
          expect(new Set(list.map((x) => x.id)).size).toBe(list.length)
        }
      })
    })
  }

  it('the conference has a keynote, shared breaks, parallel sessions and a run-past item with a label', () => {
    const s = BUILTIN_TEMPLATES[0]?.schedule
    expect(s?.items.some((i) => i.variant === 'highlight')).toBe(true)
    expect(s?.items.filter((i) => i.variant === 'break' && i.columnIds.length === 2).length).toBeGreaterThanOrEqual(3)
    expect(s?.speakers).toHaveLength(4)
    expect(s?.event.notes).toContain('**')
    const long = s?.items.find((i) => i.continuationLabel)
    expect(long?.end).toBe('12:45')
    const html = renderDocument(s as NonNullable<typeof s>)
    expect(html).toContain('Track B workshop continues until 12:45')
  })

  it('the Cairo-style fixtures are not templates', () => {
    expect(BUILTIN_TEMPLATES.some((t) => t.schedule.event.title.includes('Cairo'))).toBe(false)
    expect(BUILTIN_TEMPLATES.some((t) => JSON.stringify(t.schedule) === JSON.stringify(tableDemo))).toBe(false)
  })
})

describe('instantiate', () => {
  for (const template of BUILTIN_TEMPLATES) {
    it(`regenerates every id and keeps every reference valid: ${template.name}`, () => {
      const copy = instantiate(template, NOW)
      expectValid(copy)
      const original = new Set(idsOf(template.schedule))
      expect(idsOf(copy).filter((id) => original.has(id))).toEqual([])
      expect(new Set(idsOf(copy)).size).toBe(idsOf(copy).length)
      // Same content, only ids and the date differ.
      expect(canonical(copy)).toEqual(canonical(template.schedule))
      // The source is untouched.
      expect(template.schedule.columns[0]?.id).not.toMatch(/^col_/)
    })
  }

  it('remaps item columns and table cell keys', () => {
    const grid = instantiate(BUILTIN_TEMPLATES[0] as (typeof BUILTIN_TEMPLATES)[number], NOW)
    const colIds = new Set(grid.columns.map((c) => c.id))
    expect(grid.items.every((i) => i.columnIds.every((c) => colIds.has(c)))).toBe(true)
    expect(grid.items.map((i) => [i.start, i.end])).toEqual((BUILTIN_TEMPLATES[0] as (typeof BUILTIN_TEMPLATES)[number]).schedule.items.map((i) => [i.start, i.end]))

    const table = instantiate(BUILTIN_TEMPLATES[2] as (typeof BUILTIN_TEMPLATES)[number], NOW)
    const tableCols = new Set(table.columns.map((c) => c.id))
    const keys = table.rows.flatMap((r) => Object.keys(r.cells ?? {}))
    expect(keys.length).toBeGreaterThan(10)
    expect(keys.every((k) => tableCols.has(k))).toBe(true)
    // The cell values moved with their columns.
    const moduleColumn = table.columns.find((c) => c.name === 'Module')?.id as string
    expect(table.rows[1]?.cells?.[moduleColumn]).toBe('Module 1: Fundamentals')
  })

  it('sets the date to today in the template timezone', () => {
    // 22:30 UTC on 15 Sept is already 16 Sept in Cairo (UTC+3) but still 15 Sept in London (UTC+1).
    const london = BUILTIN_TEMPLATES[0] as (typeof BUILTIN_TEMPLATES)[number]
    const cairo = BUILTIN_TEMPLATES[4] as (typeof BUILTIN_TEMPLATES)[number]
    expect(london.schedule.event.timezone).toBe('Europe/London')
    expect(instantiate(london, NOW).event.date).toBe('2026-09-15')
    expect(instantiate(cairo, NOW).event.date).toBe('2026-09-16')
    expect(todayIn('Not/AZone', NOW)).toBe('2026-09-15') // falls back to UTC
  })

  it('does not mutate the template and returns an independent copy', () => {
    const template = BUILTIN_TEMPLATES[1] as (typeof BUILTIN_TEMPLATES)[number]
    const before = JSON.stringify(template.schedule)
    const copy = instantiate(template, NOW)
    copy.event.title = 'Changed'
    copy.items[0]!.title = 'Changed'
    expect(JSON.stringify(template.schedule)).toBe(before)
    expect(instantiate(template, NOW).items[0]?.id).not.toBe(copy.items[0]?.id)
  })

  it('remapIds can use deterministic ids', () => {
    let n = 0
    const out = remapIds((BUILTIN_TEMPLATES[1] as (typeof BUILTIN_TEMPLATES)[number]).schedule, (p) => `${p}-${n++}`)
    expect(out.columns[0]?.id).toBe('col-0')
    expectValid(out)
  })
})

describe('stripContent', () => {
  for (const template of BUILTIN_TEMPLATES) {
    it(`keeps the shell and clears the content, and still validates: ${template.name}`, () => {
      const s = template.schedule
      const out = stripContent(s)
      expectValid(out)
      expect(out.speakers).toEqual([])
      expect(out.items.every((i) => i.title === '' && i.speaker === undefined && i.tag === undefined)).toBe(true)
      expect(out.rows.every((r) => r.cells === undefined)).toBe(true)
      // Shell: event, branding, labels, locale, mode, columns, row times and notes, item layout.
      expect(out.event).toEqual(s.event)
      expect(out.branding).toEqual(s.branding)
      expect(out.labels).toEqual(s.labels)
      expect(out.mode).toBe(s.mode)
      expect(out.columns).toEqual(s.columns)
      expect(out.rows.map((r) => [r.id, r.start, r.end, r.note])).toEqual(s.rows.map((r) => [r.id, r.start, r.end, r.note]))
      expect(out.items.map((i) => [i.id, i.columnIds, i.variant, i.start, i.end, i.note, i.continuationLabel])).toEqual(
        s.items.map((i) => [i.id, i.columnIds, i.variant, i.start, i.end, i.note, i.continuationLabel]),
      )
    })
  }

  it('renders an emptied schedule without crashing, and does not touch the source', () => {
    const source = BUILTIN_TEMPLATES[0]!.schedule
    const before = JSON.stringify(source)
    const html = renderDocument(stripContent(source))
    expect(html).toContain('<h3></h3>')
    expect(JSON.stringify(source)).toBe(before)
    expectValid(instantiate({ schedule: stripContent(source) }))
  })
})

describe('template files', () => {
  const content = {
    name: 'My template',
    description: 'For testing',
    schedule: (BUILTIN_TEMPLATES[0] as (typeof BUILTIN_TEMPLATES)[number]).schedule,
  }

  it('serialize -> parse round-trips exactly', () => {
    const text = serializeTemplateFile(content)
    expect(JSON.parse(text)).toMatchObject({ kind: TEMPLATE_KIND, version: 1, template: { name: 'My template' } })
    const result = sniffTemplateText(text)
    expect(result?.ok && result.value).toEqual(content)
  })

  it('every built-in survives the round trip, including stripped copies', () => {
    for (const t of BUILTIN_TEMPLATES) {
      for (const schedule of [t.schedule, stripContent(t.schedule)]) {
        const result = parseTemplateValue(JSON.parse(serializeTemplateFile({ name: t.name, description: t.description, schedule })))
        expect(result.ok && result.value.schedule).toEqual(schedule)
      }
    }
  })

  it('opens template files and saved templates written before the time-based model (version 1 schedules)', () => {
    const v1 = (v1Schedules as Record<string, unknown>)['tpl-conference-two-tracks']
    const file = parseTemplateValue({ kind: TEMPLATE_KIND, version: 1, template: { name: 'Old', description: '', schedule: v1 } })
    expect(file.ok).toBe(true)
    if (file.ok) {
      expect(file.value.schedule.version).toBe(2)
      expect(file.value.schedule.items).toEqual(BUILTIN_TEMPLATES[0]!.schedule.items)
      expect(file.warnings).toEqual([])
    }
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify([{ id: 'tpl_old', name: 'Old saved', description: '', schedule: v1 }]))
    expect(listUserTemplates().map((t) => [t.name, t.schedule.version])).toEqual([['Old saved', 2]])
  })

  it('sniffs by content: schedules and junk are not template files', () => {
    expect(sniffTemplateText(JSON.stringify(content.schedule))).toBeNull()
    expect(sniffTemplateText('not json')).toBeNull()
    expect(sniffTemplateText('[]')).toBeNull()
    expect(isTemplateFile({ kind: 'schedule-template' })).toBe(true)
    expect(isTemplateFile({ kind: 'other' })).toBe(false)
  })

  it('reports invalid template files with paths, never throwing', () => {
    expect(parseTemplateValue({ kind: 'schedule-template', version: 2, template: {} }).ok).toBe(false)
    const noName = parseTemplateValue({ kind: 'schedule-template', version: 1, template: { name: '  ', description: '', schedule: content.schedule } })
    expect(noName).toEqual({ ok: false, errors: [expect.stringContaining('template.name')] })
    const badSchedule = parseTemplateValue({ kind: 'schedule-template', version: 1, template: { name: 'x', description: '', schedule: { version: 1 } } })
    expect(badSchedule.ok).toBe(false)
    if (!badSchedule.ok) expect(badSchedule.errors[0]).toMatch(/^template\.schedule\./)
    expect(sniffTemplateText('{"kind":"schedule-template"}')).toMatchObject({ ok: false })
  })

  it('names the file <slug>.template.json', () => {
    expect(templateFilename('Team Offsite 2026!')).toBe('team-offsite-2026.template.json')
    expect(templateFilename('!!!')).toBe('template.template.json')
  })
})

describe('user template store', () => {
  const schedule = (BUILTIN_TEMPLATES[1] as (typeof BUILTIN_TEMPLATES)[number]).schedule

  beforeEach(() => localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it('saves, lists, renames and deletes', () => {
    expect(listUserTemplates()).toEqual([])
    const saved = saveUserTemplate({ name: ' First ', description: ' about ', schedule }, NOW)
    expect(saved.ok && saved.value).toMatchObject({ name: 'First', description: 'about', builtin: false, createdAt: NOW.toISOString() })
    saveUserTemplate({ name: 'Second', description: '', schedule })
    expect(listUserTemplates().map((t) => t.name)).toEqual(['First', 'Second'])
    expect(listUserTemplates()[0]?.schedule).toEqual(schedule)

    const id = listUserTemplates()[0]?.id as string
    expect(renameUserTemplate(id, 'Renamed').ok).toBe(true)
    expect(listUserTemplates()[0]?.name).toBe('Renamed')
    expect(deleteUserTemplate(id).ok).toBe(true)
    expect(listUserTemplates().map((t) => t.name)).toEqual(['Second'])
  })

  it('refuses unknown ids and blank names without changing anything', () => {
    const id = (saveUserTemplate({ name: 'A', description: '', schedule }) as { value: { id: string } }).value.id
    expect(renameUserTemplate('nope', 'x')).toMatchObject({ ok: false, error: 'not-found' })
    expect(renameUserTemplate(id, '   ')).toMatchObject({ ok: false })
    expect(deleteUserTemplate('nope')).toMatchObject({ ok: false, error: 'not-found' })
    expect(listUserTemplates().map((t) => t.name)).toEqual(['A'])
  })

  it('skips corrupt entries and never throws', () => {
    const good = { id: 'ok', name: 'Good', description: '', schedule }
    localStorage.setItem(
      TEMPLATES_KEY,
      JSON.stringify([
        good,
        { id: 'noname', name: '', description: '', schedule },
        { id: 'badschedule', name: 'Bad', description: '', schedule: { version: 1 } },
        { name: 'noid', description: '', schedule },
        'junk',
        null,
        { ...good, name: 'Duplicate id' },
      ]),
    )
    expect(listUserTemplates().map((t) => t.id)).toEqual(['ok'])
    for (const bad of ['{not json', '{}', '"text"', '42', 'null']) {
      localStorage.setItem(TEMPLATES_KEY, bad)
      expect(listUserTemplates()).toEqual([])
    }
  })

  it('does not throw when storage cannot be read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(listUserTemplates()).toEqual([])
  })

  it('surfaces a quota error as a typed result with the user-facing message', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
    })
    const result = saveUserTemplate({ name: 'Big', description: '', schedule })
    expect(result).toEqual({
      ok: false,
      error: 'quota',
      message: 'Not enough browser storage. Remove the logo or delete old templates, or use Export template.',
    })
    expect(QUOTA_MESSAGE).toBe('Not enough browser storage. Remove the logo or delete old templates, or use Export template.')
  })

  it('treats other write failures as unavailable storage', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(saveUserTemplate({ name: 'x', description: '', schedule })).toMatchObject({ ok: false, error: 'unavailable' })
  })
})
