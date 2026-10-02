import { describe, expect, it } from 'vitest'
import { tableDemo } from '../render/__fixtures__/tableDemo.ts'
import type { Schedule } from './schema.ts'
import { parseSchedule } from './validate.ts'

const withCells = (cells: Record<string, string>): Schedule => ({
  ...tableDemo,
  rows: [{ id: 'r', start: '09:00', end: '10:00', cells }],
})
const errors = (s: Schedule) => {
  const result = parseSchedule(s)
  return result.ok ? [] : result.errors
}

describe('table cell validation', () => {
  it('accepts cells for non-track columns, including empty strings', () => {
    expect(errors(withCells({ 'c-session': 'x', 'c-ends': '' }))).toEqual([])
    expect(errors(withCells({}))).toEqual([])
    expect(parseSchedule({ ...tableDemo, rows: [{ id: 'r', start: '09:00', end: '10:00' }] }).ok).toBe(true)
  })

  it('rejects a cell for a column that does not exist', () => {
    expect(errors(withCells({ nope: 'x' }))).toEqual(['rows[0].cells.nope: Unknown column "nope"'])
  })

  it('rejects a cell for a track column', () => {
    const s: Schedule = {
      ...withCells({ track: 'x' }),
      columns: [...tableDemo.columns, { id: 'track', name: 'Lane', color: '#0b57d0', type: 'track' }],
    }
    expect(errors(s)[0]).toMatch(/^rows\[0\]\.cells\.track: .*is a track/)
  })

  it('requires time columns to hold "" or HH:MM', () => {
    for (const bad of ['9:30', '25:00', 'noon', '09:30 ']) {
      expect(errors(withCells({ 'c-ends': bad }))[0], bad).toMatch(/^rows\[0\]\.cells\.c-ends: Expected a time as HH:MM/)
    }
    expect(errors(withCells({ 'c-ends': '23:59' }))).toEqual([])
    // Other column types take any text.
    expect(errors(withCells({ 'c-room': '25:00' }))).toEqual([])
  })

  it('files written before table cells existed stay valid', () => {
    expect(parseSchedule({ ...tableDemo, mode: 'track-grid', rows: tableDemo.rows.map((r) => ({ id: r.id, start: r.start, end: r.end })) }).ok).toBe(true)
  })
})
