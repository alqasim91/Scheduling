import { describe, expect, it } from 'vitest'
import { createEmptySchedule } from '../model/defaults.ts'
import { parseScheduleJson, serializeSchedule } from './json.ts'
import { scheduleFilename } from './files.ts'

describe('schedule JSON', () => {
  it('round-trips serialize -> parse', () => {
    const s = createEmptySchedule()
    s.event.title = 'Developers Day — Cairo'
    s.event.titleHighlight = 'Cairo'
    s.items.push({
      id: 'item_1',
      rowId: s.rows[0]!.id,
      columnIds: [s.columns[0]!.id],
      title: 'Opening',
      variant: 'highlight',
    })
    const result = parseScheduleJson(serializeSchedule(s))
    expect(result).toEqual({ ok: true, value: s })
  })

  it('pretty-prints with 2 spaces', () => {
    expect(serializeSchedule(createEmptySchedule())).toMatch(/^\{\n {2}"version": 1,/)
  })

  it('returns ok:false for malformed JSON without throwing', () => {
    const result = parseScheduleJson('{ not json')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors[0]).toMatch(/^Not valid JSON/)
  })

  it('returns ok:false with path: message errors for a schema violation', () => {
    const bad = { ...createEmptySchedule(), mode: 'cards' }
    const result = parseScheduleJson(JSON.stringify(bad))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.some((e) => e.startsWith('mode: '))).toBe(true)
  })
})

describe('scheduleFilename', () => {
  it('slugifies the title', () => {
    expect(scheduleFilename("Developers Day — Cairo '26!")).toBe('developers-day-cairo-26.json')
    expect(scheduleFilename('Café Ünïcode')).toBe('cafe-unicode.json')
  })

  it('falls back when the slug is empty', () => {
    expect(scheduleFilename('!!!')).toBe('schedule.json')
    expect(scheduleFilename('')).toBe('schedule.json')
  })
})
