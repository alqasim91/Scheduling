import { describe, expect, it } from 'vitest'
import { createEmptySchedule } from './defaults.ts'
import type { Schedule } from './schema.ts'
import { parseSchedule } from './validate.ts'

function withItem(s: Schedule, patch: Partial<Schedule['items'][number]> = {}): Schedule {
  const row = s.rows[0]!
  const col = s.columns[0]!
  s.items.push({ id: 'item_1', rowId: row.id, columnIds: [col.id], title: 'Keynote', variant: 'session', ...patch })
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
    expect(s.rows).toHaveLength(1)
    expect(s.items).toHaveLength(0)
    expect(parseSchedule(s)).toEqual({ ok: true, value: s })
  })

  it('accepts a populated schedule with spans and overrides', () => {
    const s = createEmptySchedule()
    s.rows.push({ id: 'row_2', start: '10:00', end: '11:00' })
    withItem(s, { columnIds: s.columns.map((c) => c.id), rowSpan: 2, start: '09:00', end: '10:30' })
    expect(parseSchedule(s).ok).toBe(true)
  })

  it('rejects an item with a dangling rowId', () => {
    const s = withItem(createEmptySchedule(), { rowId: 'row_missing' })
    expect(errorsOf(s)).toContain('items[0].rowId: Unknown row "row_missing"')
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
    const s = withItem(createEmptySchedule())
    s.speakers.push({ id: 'spk_1', name: 'A', role: 'Host' })
    const list = s[name] as { id: string }[]
    list.push({ ...structuredClone(list[0]!) })
    const dupIndex = list.length - 1
    expect(errorsOf(s).some((e) => e.startsWith(`${name}[${dupIndex}].id: Duplicate id`))).toBe(true)
  })

  it('rejects a row whose start is not before its end', () => {
    const s = createEmptySchedule()
    s.rows[0] = { ...s.rows[0]!, start: '10:00', end: '10:00' }
    expect(errorsOf(s).some((e) => e.startsWith('rows[0].end'))).toBe(true)
    s.rows[0] = { ...s.rows[0]!, start: '11:00', end: '10:00' }
    expect(errorsOf(s).some((e) => e.startsWith('rows[0].end'))).toBe(true)
  })

  it('rejects an item whose start is not before its end', () => {
    const s = withItem(createEmptySchedule(), { start: '12:00', end: '11:00' })
    expect(errorsOf(s).some((e) => e.startsWith('items[0].end'))).toBe(true)
  })

  it('allows an item with only one of start/end', () => {
    const s = withItem(createEmptySchedule(), { start: '12:00' })
    expect(parseSchedule(s).ok).toBe(true)
  })

  it.each(['9:00', '24:00', '09:60', '0900', 'noon', ''])('rejects bad time format %j', (bad) => {
    const s = createEmptySchedule()
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

  it('rejects a rowSpan that runs past the last row', () => {
    const s = withItem(createEmptySchedule(), { rowSpan: 2 })
    expect(errorsOf(s).some((e) => e.startsWith('items[0].rowSpan'))).toBe(true)
  })

  it('rejects a non-positive or fractional rowSpan', () => {
    expect(parseSchedule(withItem(createEmptySchedule(), { rowSpan: 0 })).ok).toBe(false)
    expect(parseSchedule(withItem(createEmptySchedule(), { rowSpan: 1.5 })).ok).toBe(false)
  })
})
