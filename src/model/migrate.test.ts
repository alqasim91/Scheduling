import { describe, expect, it } from 'vitest'
import { cairoSample } from '../samples/cairo.ts'
import { rtlDemo } from '../render/__fixtures__/rtlDemo.ts'
import { tableDemo } from '../render/__fixtures__/tableDemo.ts'
import { tableDemoRtl } from '../render/__fixtures__/tableDemoRtl.ts'
import { BUILTIN_TEMPLATES } from '../templates/builtin/index.ts'
import cairoV1 from './__fixtures__/cairoV1.json'
import v1Schedules from './__fixtures__/v1Schedules.json'
import { createEmptySchedule } from './defaults.ts'
import { CURRENT_VERSION, migrate, migrateWithWarnings } from './migrate.ts'
import type { Schedule } from './schema.ts'
import { parseSchedule } from './validate.ts'

describe('migrate', () => {
  it('passes a current-version document through unchanged', () => {
    const s = createEmptySchedule()
    expect(CURRENT_VERSION).toBe(2)
    expect(migrate(s)).toEqual(s)
    expect(migrateWithWarnings(s)).toEqual({ doc: s, warnings: [] })
  })

  it('returns an error result for a missing version', () => {
    const rest: Record<string, unknown> = { ...createEmptySchedule() }
    delete rest.version
    const result = parseSchedule(rest)
    expect(result).toEqual({ ok: false, errors: [expect.stringContaining('version')] })
  })

  it('returns an error result for a future version', () => {
    const result = parseSchedule({ ...createEmptySchedule(), version: 3 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors[0]).toMatch(/newer than this app supports/)
  })

  it.each([0, -1, 1.5, '1', null])('returns an error result for invalid version %j', (version) => {
    expect(parseSchedule({ ...createEmptySchedule(), version }).ok).toBe(false)
  })

  it.each([null, 42, 'text', [], undefined])('returns an error result for non-object input %j', (raw) => {
    expect(parseSchedule(raw).ok).toBe(false)
  })
})

/* ---------- v1 -> v2 ---------- */

type Raw = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

/** A small v1 grid document: columns A, B and rows r1..r4 (09:00-11:00 in 30 minute steps). */
function v1(items: Raw[], extra: Raw = {}): Raw {
  const v2 = createEmptySchedule()
  return {
    ...v2,
    version: 1,
    columns: [
      { id: 'A', name: 'A', color: '#0b57d0', type: 'track' },
      { id: 'B', name: 'B', color: '#188038', type: 'track' },
    ],
    rows: [
      { id: 'r1', start: '09:00', end: '09:30' },
      { id: 'r2', start: '09:30', end: '10:00' },
      { id: 'r3', start: '10:00', end: '10:30' },
      { id: 'r4', start: '10:30', end: '11:00' },
    ],
    items,
    ...extra,
  }
}

const item = (id: string, rowId: string, columnIds: string[], more: Raw = {}): Raw => ({
  id,
  rowId,
  columnIds,
  title: id,
  variant: 'session',
  ...more,
})

function upgrade(doc: Raw): { value: Schedule; warnings: string[] } {
  const result = parseSchedule(doc)
  if (!result.ok) throw new Error(result.errors.join('; '))
  return { value: result.value, warnings: result.warnings }
}

describe('migrate v1 -> v2', () => {
  it("takes an item's times from its row, and drops rowId and rowSpan", () => {
    const { value, warnings } = upgrade(v1([item('x', 'r2', ['A'])]))
    expect(value.version).toBe(2)
    expect(value.items[0]).toEqual({ id: 'x', columnIds: ['A'], start: '09:30', end: '10:00', title: 'x', variant: 'session' })
    expect(warnings).toEqual([])
  })

  it('ends a rowSpan item at the end of the last row it spans', () => {
    const { value } = upgrade(v1([item('x', 'r2', ['A'], { rowSpan: 3 })]))
    expect(value.items[0]).toMatchObject({ start: '09:30', end: '11:00' })
    expect('rowSpan' in value.items[0]!).toBe(false)
  })

  it('clamps a rowSpan that runs past the last row', () => {
    const { value } = upgrade(v1([item('x', 'r3', ['A'], { rowSpan: 9 })]))
    expect(value.items[0]).toMatchObject({ start: '10:00', end: '11:00' })
  })

  it('lets start and end overrides win over the rows', () => {
    const { value } = upgrade(
      v1([item('a', 'r1', ['A'], { end: '09:50' }), item('b', 'r2', ['A'], { start: '09:55', rowSpan: 2 }), item('c', 'r4', ['B'], { start: '10:35', end: '10:50', rowSpan: 1 })]),
    )
    expect(value.items.map((i) => [i.id, i.start, i.end])).toEqual([
      ['a', '09:00', '09:50'],
      ['b', '09:55', '10:30'],
      ['c', '10:35', '10:50'],
    ])
  })

  it('moves a grid-mode row note to the first item of that row in column order', () => {
    const doc = v1([item('inB', 'r1', ['B']), item('inA', 'r1', ['A']), item('other', 'r2', ['A'])])
    doc.rows[0].note = 'Doors open at **09:00**'
    const { value, warnings } = upgrade(doc)
    const byId = new Map(value.items.map((i) => [i.id, i]))
    expect(byId.get('inA')?.note).toBe('Doors open at **09:00**')
    expect(byId.get('inB')?.note).toBeUndefined()
    expect(byId.get('other')?.note).toBeUndefined()
    expect(value.rows[0]).not.toHaveProperty('note')
    expect(warnings).toEqual([])
  })

  it('puts the note on the first of several columns when the item spans them', () => {
    const doc = v1([item('wide', 'r1', ['A', 'B'])])
    doc.rows[0].note = 'Hello'
    expect(upgrade(doc).value.items[0]?.note).toBe('Hello')
  })

  it('drops a grid-mode note on a row without items and reports it', () => {
    const doc = v1([item('x', 'r1', ['A'])])
    doc.rows[1].note = 'Nobody is here'
    const { value, warnings } = upgrade(doc)
    expect(value.items.every((i) => i.note === undefined)).toBe(true)
    expect(value.rows.every((r) => r.note === undefined)).toBe(true)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('Nobody is here')
    expect(warnings[0]).toContain('09:30–10:00')
  })

  it('discards a blank note silently', () => {
    const doc = v1([])
    doc.rows[0].note = '   '
    const { value, warnings } = upgrade(doc)
    expect(warnings).toEqual([])
    expect(value.rows[0]).not.toHaveProperty('note')
  })

  it('keeps row notes in table mode, where they still belong to the rows', () => {
    const doc = v1([item('x', 'r1', ['A'])], { mode: 'table' })
    doc.rows[0].note = 'Table note'
    const { value, warnings } = upgrade(doc)
    expect(value.rows[0]?.note).toBe('Table note')
    expect(value.items[0]?.note).toBeUndefined()
    expect(warnings).toEqual([])
  })

  it('keeps rows and their cells for table mode', () => {
    const doc = v1([], { mode: 'table' })
    doc.columns.push({ id: 'col-x', name: 'Session', color: '#444746', type: 'text' })
    doc.rows[0].cells = { 'col-x': 'hello' }
    expect(upgrade(doc).value.rows).toEqual(doc.rows)
  })

  it('shortens an item that ran over a neighbour in the same track, and says so', () => {
    const doc = v1([item('long', 'r1', ['A'], { title: 'Long one', end: '10:00' }), item('next', 'r2', ['A'], { title: 'Next one' })])
    const { value, warnings } = upgrade(doc)
    expect(value.items.map((i) => [i.id, i.start, i.end])).toEqual([
      ['long', '09:00', '09:30'],
      ['next', '09:30', '10:00'],
    ])
    expect(warnings).toEqual(['"Long one" was shortened to end at 09:30 because it overlapped "Next one" in the same track.'])
  })

  it('does not touch an item that overruns a row in another track', () => {
    const doc = v1([item('long', 'r1', ['A'], { end: '10:00' }), item('other', 'r2', ['B'])])
    const { value, warnings } = upgrade(doc)
    expect(value.items[0]).toMatchObject({ start: '09:00', end: '10:00' })
    expect(warnings).toEqual([])
  })

  it('rejects an item on an unknown row with a readable message', () => {
    const result = parseSchedule(v1([item('x', 'nope', ['A'])]))
    expect(result).toEqual({ ok: false, errors: ['Item "x" points at unknown row "nope"'] })
  })

  it('accepts an item on an unknown row when its own times are complete', () => {
    expect(parseSchedule(v1([item('x', 'nope', ['A'], { start: '09:00', end: '09:30' })])).ok).toBe(true)
  })

  it('does not change the input document', () => {
    const doc = v1([item('x', 'r1', ['A'])])
    const before = JSON.stringify(doc)
    upgrade(doc)
    expect(JSON.stringify(doc)).toBe(before)
  })
})

describe('v1 files from before the time-based model', () => {
  it('the Cairo sample from M2 (a946732) opens, with its keynote shortened to the first sessions', () => {
    const { value, warnings } = upgrade(cairoV1 as Raw)
    expect(value.version).toBe(2)
    expect(value.items).toHaveLength(12)
    const times = Object.fromEntries(value.items.map((i) => [i.id, `${i.start}-${i.end}`]))
    expect(times).toEqual({
      'item-welcome': '13:30-14:00',
      'item-keynote': '14:00-14:20',
      'item-b1': '14:20-15:05',
      'item-i1': '14:20-15:05',
      'item-lunch': '15:05-15:35',
      'item-b2': '15:35-16:20',
      'item-i2': '15:35-16:20',
      'item-coffee': '16:20-16:35',
      'item-b3': '16:35-17:05',
      'item-i3': '16:35-17:20',
      'item-b4': '17:05-17:35',
      'item-closing': '17:35-17:45',
    })
    // The 14:30 keynote end of the original page clashes with the 14:20 sessions; that is the only adjustment.
    expect(warnings).toEqual([expect.stringContaining('"Opening & Keynote" was shortened to end at 14:20')])
    // The row note on the keynote's row now lives on the keynote.
    expect(value.items.find((i) => i.id === 'item-keynote')?.note).toContain('room change at 14:15')
    expect(value.rows.every((r) => r.note === undefined)).toBe(true)
    expect(value.rows).toHaveLength(9) // rows are kept for table mode
    expect(value.items.find((i) => i.id === 'item-i3')?.continuationLabel).toBe('Intermediate GKE session')
  })

  it('migrates to the same items as the version 2 Cairo sample', () => {
    const { value } = upgrade(cairoV1 as Raw)
    expect(value.items.map((i) => ({ ...i, note: undefined }))).toEqual(cairoSample.items.map((i) => ({ ...i, note: undefined })))
    expect(value.columns).toEqual(cairoSample.columns)
    expect(value.speakers).toEqual(cairoSample.speakers)
  })

  const v1Samples = v1Schedules as unknown as Record<string, Raw>
  const sources: Record<string, Schedule> = {
    cairo: cairoSample,
    rtl: rtlDemo,
    ...Object.fromEntries(BUILTIN_TEMPLATES.map((t) => [`tpl-${t.id}`, t.schedule])),
  }

  it.each(Object.keys(sources))('the version 1 form of "%s" opens and equals its version 2 source (apart from rows)', (key) => {
    const { value } = upgrade(v1Samples[key]!)
    const expected = sources[key]!
    // Version 2 sources of grid schedules carry no rows; the Cairo keynote's note was reworded when it was shortened.
    const items =
      key === 'cairo'
        ? expected.items.map((i) => (i.id === 'item-keynote' ? { ...i, note: value.items.find((v) => v.id === i.id)?.note } : i))
        : expected.items
    const grid = expected.mode === 'track-grid'
    expect({ ...value, rows: grid ? [] : value.rows }).toEqual({ ...expected, items })
  })

  it.each([
    ['tableDemo', tableDemo],
    ['tableDemoRtl', tableDemoRtl],
  ])('the version 1 form of %s opens unchanged', (_name, source) => {
    expect(upgrade({ ...structuredClone(source), version: 1 } as Raw).value).toEqual(source)
  })
})
