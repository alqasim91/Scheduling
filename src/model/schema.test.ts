import { describe, expect, it } from 'vitest'
import { createEmptySchedule } from './defaults.ts'
import { ScheduleSchema, type Schedule } from './schema.ts'
import { parseSchedule } from './validate.ts'

function withItem(s: Schedule, patch: Partial<Schedule['items'][number]> = {}): Schedule {
  const col = s.columns[0]!
  s.items.push({ id: 'item_1', columnIds: [col.id], start: '09:00', end: '10:00', title: 'Keynote', variant: 'session', ...patch })
  return s
}

/** The empty schedule plus one table row, for the row-related rules. */
function withRow(s: Schedule = createEmptySchedule()): Schedule {
  s.rows.push({ id: 'row_1', start: '09:00', end: '10:00' })
  return s
}

function errorsOf(raw: unknown): string[] {
  const result = parseSchedule(raw)
  if (result.ok) throw new Error('expected validation to fail')
  return result.errors
}

describe('schedule schema', () => {
  it('accepts the default schedule', () => {
    const s = createEmptySchedule()
    expect(s.mode).toBe('track-grid')
    expect(s.columns).toHaveLength(2)
    expect(s.rows).toHaveLength(0)
    expect(s.items).toHaveLength(0)
    expect(parseSchedule(s)).toEqual({ ok: true, value: s, warnings: [] })
  })

  it('accepts a populated schedule with a multi-column item', () => {
    const s = createEmptySchedule()
    withItem(s, { columnIds: s.columns.map((c) => c.id), start: '09:00', end: '10:30' })
    withItem(s, { id: 'item_2', columnIds: [s.columns[1]!.id], start: '10:30', end: '11:00' })
    expect(parseSchedule(s).ok).toBe(true)
  })

  it('requires start and end on every item', () => {
    const s = withItem(createEmptySchedule())
    const raw = JSON.parse(JSON.stringify(s))
    delete raw.items[0].start
    expect(errorsOf(raw).some((e) => e.startsWith('items[0].start'))).toBe(true)
    delete raw.items[0].end
    expect(errorsOf(raw).some((e) => e.startsWith('items[0].end'))).toBe(true)
  })

  it('no longer accepts a version 1 document without migrating', () => {
    expect(ScheduleSchema.safeParse({ ...createEmptySchedule(), version: 1 }).success).toBe(false)
  })

  it('rejects an item with a dangling columnId', () => {
    const s = withItem(createEmptySchedule(), { columnIds: [createEmptySchedule().columns[0]!.id, 'col_missing'] })
    expect(errorsOf(s).some((e) => e.startsWith('items[0].columnIds[') && e.includes('Unknown column'))).toBe(true)
  })

  it('rejects an item with no columns', () => {
    const s = withItem(createEmptySchedule(), { columnIds: [] })
    expect(errorsOf(s).some((e) => e.startsWith('items[0].columnIds'))).toBe(true)
  })

  it.each(['columns', 'rows', 'items', 'speakers'] as const)('rejects duplicate ids in %s', (name) => {
    const s = withItem(withRow())
    s.speakers.push({ id: 'spk_1', name: 'A', role: 'Host' })
    const list = s[name] as { id: string }[]
    list.push({ ...structuredClone(list[0]!) })
    const dupIndex = list.length - 1
    expect(errorsOf(s).some((e) => e.startsWith(`${name}[${dupIndex}].id: Duplicate id`))).toBe(true)
  })

  it('rejects a row whose start is not before its end', () => {
    const s = withRow()
    s.rows[0] = { ...s.rows[0]!, start: '10:00', end: '10:00' }
    expect(errorsOf(s).some((e) => e.startsWith('rows[0].end'))).toBe(true)
    s.rows[0] = { ...s.rows[0]!, start: '11:00', end: '10:00' }
    expect(errorsOf(s).some((e) => e.startsWith('rows[0].end'))).toBe(true)
  })

  it('rejects an item whose start is not before its end', () => {
    const s = withItem(createEmptySchedule(), { start: '12:00', end: '11:00' })
    expect(errorsOf(s).some((e) => e.startsWith('items[0].end'))).toBe(true)
  })

  it.each(['9:00', '24:00', '09:60', '0900', 'noon', ''])('rejects bad time format %j', (bad) => {
    const s = withRow()
    s.rows[0] = { ...s.rows[0]!, start: bad }
    expect(errorsOf(s).some((e) => e.startsWith('rows[0].start'))).toBe(true)
  })

  it('rejects a bad date', () => {
    const s = createEmptySchedule()
    s.event.date = '2026-02-30'
    expect(errorsOf(s).some((e) => e.startsWith('event.date'))).toBe(true)
  })

  it('rejects an unknown timezone', () => {
    const s = createEmptySchedule()
    s.event.timezone = 'Mars/Olympus'
    expect(errorsOf(s).some((e) => e.startsWith('event.timezone'))).toBe(true)
  })

  it('rejects a logo that is not a data URI', () => {
    const s = createEmptySchedule()
    s.branding.logo = 'https://example.com/logo.png'
    expect(errorsOf(s).some((e) => e.startsWith('branding.logo'))).toBe(true)
  })

  it('accepts a data URI logo', () => {
    const s = createEmptySchedule()
    s.branding.logo = 'data:image/png;base64,iVBORw0KGgo='
    expect(parseSchedule(s).ok).toBe(true)
  })

  it('rejects a non-hex colour', () => {
    const s = createEmptySchedule()
    s.branding.colors.primary = 'blue'
    expect(errorsOf(s).some((e) => e.startsWith('branding.colors.primary'))).toBe(true)
  })

  describe('overlap rule', () => {
    const two = (a: Partial<Schedule['items'][number]>, b: Partial<Schedule['items'][number]>): Schedule => {
      const s = createEmptySchedule()
      withItem(s, { id: 'a', columnIds: [s.columns[0]!.id], ...a })
      withItem(s, { id: 'b', columnIds: [s.columns[0]!.id], ...b })
      return s
    }

    it('rejects two items that share a column and overlap in time', () => {
      const s = two({ start: '09:00', end: '10:00' }, { start: '09:30', end: '10:30' })
      expect(errorsOf(s)).toEqual([expect.stringMatching(/^items\[1\]\.start: Item "b" \(09:30–10:30\) overlaps "a" \(09:00–10:00\) in column/)])
    })

    it('rejects containment and identical intervals', () => {
      expect(parseSchedule(two({ start: '09:00', end: '12:00' }, { start: '10:00', end: '11:00' })).ok).toBe(false)
      expect(parseSchedule(two({ start: '09:00', end: '10:00' }, { start: '09:00', end: '10:00' })).ok).toBe(false)
    })

    it('treats intervals as half-open: back-to-back items are fine', () => {
      expect(parseSchedule(two({ start: '09:00', end: '10:00' }, { start: '10:00', end: '11:00' })).ok).toBe(true)
      expect(parseSchedule(two({ start: '10:00', end: '11:00' }, { start: '09:00', end: '10:00' })).ok).toBe(true)
    })

    it('allows overlapping times in different columns', () => {
      const s = createEmptySchedule()
      withItem(s, { id: 'a', columnIds: [s.columns[0]!.id] })
      withItem(s, { id: 'b', columnIds: [s.columns[1]!.id] })
      expect(parseSchedule(s).ok).toBe(true)
    })

    it('catches an overlap through a shared column of a multi-column item', () => {
      const s = createEmptySchedule()
      withItem(s, { id: 'wide', columnIds: s.columns.map((c) => c.id), start: '09:00', end: '10:00' })
      withItem(s, { id: 'narrow', columnIds: [s.columns[1]!.id], start: '09:45', end: '10:15' })
      expect(parseSchedule(s).ok).toBe(false)
    })

    it('reports an overlap hidden behind a long earlier item', () => {
      const s = createEmptySchedule()
      const col = [s.columns[0]!.id]
      withItem(s, { id: 'long', columnIds: col, start: '09:00', end: '12:00' })
      withItem(s, { id: 'short', columnIds: col, start: '09:10', end: '09:20' })
      withItem(s, { id: 'late', columnIds: col, start: '11:00', end: '11:30' })
      const errors = errorsOf(s)
      expect(errors).toHaveLength(2)
      expect(errors.some((e) => e.includes('"late"') && e.includes('"long"'))).toBe(true)
    })
  })
})
